'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { all, get, run, tx } = require('./db');
const { parseDocx } = require('./parser/docx');
const { parsePdf } = require('./parser/pdf');
const { extractQuestions, textToBlocks } = require('./parser/questions');
const { gradeAll } = require('./grading');
const { sanitizeHtml, cleanText } = require('./sanitize');
const { ImageSaver, docToDocx, saveUpload, UPLOAD_DIR, hasSoffice } = require('./files');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '25mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const now = () => Date.now();
const id = () => crypto.randomBytes(9).toString('base64url');
const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch (_) { return d; } };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Xác thực ----------
function hashPass(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex');
}
function checkPass(p, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(p, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', token, userId, now());
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 60}${secure}`);
}
function currentUser(req) {
  const t = parseCookies(req).sid;
  if (!t) return null;
  const s = get('SELECT u.id,u.email,u.name,u.school,s.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?', t);
  if (!s) return null;
  if (now() - s.created_at > 60 * 86400000) { run('DELETE FROM sessions WHERE token=?', t); return null; }
  return { id: s.id, email: s.email, name: s.name, school: s.school };
}
function auth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Bạn cần đăng nhập' });
  req.user = u;
  next();
}

const loginTries = new Map();
function throttle(key) {
  const t = loginTries.get(key) || { n: 0, at: now() };
  if (now() - t.at > 10 * 60000) { t.n = 0; t.at = now(); }
  t.n++;
  loginTries.set(key, t);
  if (t.n > 20) throw new HttpError(429, 'Thử quá nhiều lần, vui lòng đợi 10 phút');
}

app.post('/api/auth/register', wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80), email = cleanText(req.body.email, 120).toLowerCase(), pass = String(req.body.password || '');
  const school = cleanText(req.body.school, 120);
  if (!name) throw new HttpError(400, 'Vui lòng nhập họ tên');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ');
  if (pass.length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
  if (get('SELECT id FROM users WHERE email=?', email)) throw new HttpError(400, 'Email đã được đăng ký');
  const uid = id();
  run('INSERT INTO users(id,email,name,school,pass,created_at) VALUES(?,?,?,?,?,?)', uid, email, name, school, hashPass(pass), now());
  setSession(res, req, uid);
  res.json({ user: { id: uid, email, name, school } });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const email = cleanText(req.body.email, 120).toLowerCase();
  throttle(req.ip + '|' + email);
  const u = get('SELECT * FROM users WHERE email=?', email);
  if (!u || !checkPass(String(req.body.password || ''), u.pass)) throw new HttpError(400, 'Email hoặc mật khẩu không đúng');
  setSession(res, req, u.id);
  res.json({ user: { id: u.id, email: u.email, name: u.name, school: u.school } });
}));
app.post('/api/auth/logout', (req, res) => {
  const t = parseCookies(req).sid;
  if (t) run('DELETE FROM sessions WHERE token=?', t);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', (req, res) => res.json({ user: currentUser(req) }));
app.put('/api/auth/profile', auth, wrap(async (req, res) => {
  const name = cleanText(req.body.name, 80) || req.user.name;
  const school = cleanText(req.body.school, 120);
  run('UPDATE users SET name=?, school=? WHERE id=?', name, school, req.user.id);
  if (req.body.newPassword) {
    const u = get('SELECT pass FROM users WHERE id=?', req.user.id);
    if (!checkPass(String(req.body.oldPassword || ''), u.pass)) throw new HttpError(400, 'Mật khẩu cũ không đúng');
    if (String(req.body.newPassword).length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
    run('UPDATE users SET pass=? WHERE id=?', hashPass(String(req.body.newPassword)), req.user.id);
  }
  res.json({ user: { ...req.user, name, school } });
}));

// ---------- Tách câu hỏi từ file ----------
app.post('/api/parse', auth, upload.single('file'), wrap(async (req, res) => {
  let parsed;
  const saver = new ImageSaver();
  const save = (buf, ext) => saver.save(buf, ext);
  if (req.file) {
    const name = req.file.originalname || '';
    const ext = path.extname(name).toLowerCase();
    const buf = req.file.buffer;
    try {
      if (ext === '.docx' || ext === '.docm' || (buf[0] === 0x50 && buf[1] === 0x4b && ext !== '.pdf')) parsed = await parseDocx(buf, save);
      else if (ext === '.pdf' || buf.slice(0, 4).toString() === '%PDF') parsed = await parsePdf(buf);
      else if (ext === '.doc') {
        if (!hasSoffice) throw new HttpError(400, 'File .doc (Word 97-2003) cần LibreOffice trên máy chủ để chuyển đổi. Hãy mở file trong Word và "Lưu thành" .docx rồi tải lên lại.');
        parsed = await parseDocx(await docToDocx(buf), save);
      } else if (ext === '.txt') parsed = { blocks: textToBlocks(buf.toString('utf8')), tables: [] };
      else throw new HttpError(400, 'Chỉ hỗ trợ file .docx, .doc, .pdf, .txt');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('parse error', e);
      throw new HttpError(400, e.userMessage ? e.message : 'Không đọc được file: ' + e.message);
    }
  } else if (req.body && typeof req.body.text === 'string') {
    parsed = { blocks: textToBlocks(req.body.text), tables: [] };
  } else throw new HttpError(400, 'Chưa chọn file');
  const result = extractQuestions(parsed, { subject: req.body && req.body.subject });
  const fail = await saver.finish();
  if (Object.keys(fail).length) {
    const fix = (h) => { for (const [a, b] of Object.entries(fail)) h = h.split(a).join(b); return h; };
    for (const q of result.questions) {
      q.content = fix(q.content); q.explanation = fix(q.explanation || '');
      q.options.forEach((o) => { o.html = fix(o.html); });
    }
    result.warnings.push('Một số công thức dạng ảnh (MathType) không chuyển đổi được — hãy kiểm tra lại các câu có ô [công thức].');
  }
  res.json(result);
}));

app.post('/api/upload-image', auth, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Chưa chọn ảnh');
  res.json({ url: saveUpload(req.file.buffer, path.extname(req.file.originalname || '.png')) });
}));

// ---------- Đề thi ----------
const DEFAULT_SETTINGS = {
  duration: 45, startAt: null, endAt: null, password: '', maxAttempts: 1,
  shuffleQuestions: false, shuffleOptions: false, identity: 'free', requireClass: true, requireCode: false,
  showScore: true, showReview: 'after_submit', showExplanation: true,
  detectTab: true, maxTabSwitches: 0, blockCopy: true, tfScoring: 'bgd', scaleTo10: false,
};

function cleanQuestions(qs) {
  if (!Array.isArray(qs)) throw new HttpError(400, 'Danh sách câu hỏi không hợp lệ');
  return qs.slice(0, 500).map((q) => {
    const type = ['mc', 'multi', 'tf', 'short', 'essay'].includes(q.type) ? q.type : 'mc';
    const options = (Array.isArray(q.options) ? q.options : []).slice(0, 10).map((o, i) => ({
      id: /^[\w-]{1,40}$/.test(o.id || '') ? o.id : id(),
      label: type === 'tf' ? String.fromCharCode(97 + i) : String.fromCharCode(65 + i),
      html: sanitizeHtml(o.html),
    }));
    let answer = null;
    if (type === 'mc' || type === 'multi') {
      const arr = (Array.isArray(q.answer) ? q.answer : q.answer == null ? [] : [q.answer]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
      answer = arr.length ? [...new Set(arr)].sort() : null;
      if (type === 'mc' && answer && answer.length > 1) answer = [answer[0]];
    } else if (type === 'tf') {
      answer = Array.isArray(q.answer) ? options.map((_, i) => !!q.answer[i]) : null;
    } else if (type === 'short') {
      answer = q.answer == null || String(q.answer).trim() === '' ? null : cleanText(q.answer, 200);
    }
    return {
      id: /^[\w-]{1,40}$/.test(q.id || '') ? q.id : id(), type, part: Number(q.part) || 0,
      content: sanitizeHtml(q.content), options: type === 'short' || type === 'essay' ? [] : options, answer,
      points: Math.max(0, Math.min(100, Number(q.points) || 0)), explanation: sanitizeHtml(q.explanation || ''),
    };
  });
}
function cleanSettings(s) {
  s = { ...DEFAULT_SETTINGS, ...(s || {}) };
  const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
  const ts = (v) => (v ? (Number.isFinite(Number(v)) ? Number(v) : Date.parse(v) || null) : null);
  return {
    duration: num(s.duration, 45, 0, 600), startAt: ts(s.startAt), endAt: ts(s.endAt), password: cleanText(s.password, 50),
    maxAttempts: num(s.maxAttempts, 1, 0, 100), shuffleQuestions: !!s.shuffleQuestions, shuffleOptions: !!s.shuffleOptions,
    identity: s.identity === 'roster' ? 'roster' : 'free', requireClass: !!s.requireClass, requireCode: !!s.requireCode,
    showScore: !!s.showScore, showReview: ['after_submit', 'after_close', 'never'].includes(s.showReview) ? s.showReview : 'after_submit',
    showExplanation: !!s.showExplanation, detectTab: !!s.detectTab, maxTabSwitches: num(s.maxTabSwitches, 0, 0, 100),
    blockCopy: !!s.blockCopy, tfScoring: ['bgd', 'ratio', 'all'].includes(s.tfScoring) ? s.tfScoring : 'bgd', scaleTo10: !!s.scaleTo10,
  };
}
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let c = '';
    for (let i = 0; i < 6; i++) c += A[crypto.randomInt(A.length)];
    if (!get('SELECT id FROM exams WHERE code=?', c)) return c;
  }
}
function examRow(e, withQuestions = true) {
  if (!e) return null;
  const questions = J(e.questions, []);
  const out = {
    id: e.id, code: e.code, title: e.title, subject: e.subject, grade: e.grade, description: e.description, folderId: e.folder_id,
    parts: J(e.parts, []), settings: { ...DEFAULT_SETTINGS, ...J(e.settings, {}) }, classIds: J(e.class_ids, []),
    status: e.status, createdAt: e.created_at, updatedAt: e.updated_at, questionCount: questions.length,
    totalPoints: Math.round(questions.reduce((s, q) => s + (Number(q.points) || 0), 0) * 100) / 100,
  };
  if (withQuestions) out.questions = questions;
  return out;
}
function ownExam(req) {
  const e = get('SELECT * FROM exams WHERE id=? AND owner_id=?', req.params.id, req.user.id);
  if (!e) throw new HttpError(404, 'Không tìm thấy đề');
  return e;
}

app.get('/api/exams', auth, (req, res) => {
  const rows = all('SELECT * FROM exams WHERE owner_id=? ORDER BY updated_at DESC', req.user.id);
  const counts = {};
  for (const r of all("SELECT exam_id, COUNT(*) n, AVG(score) avg FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE e.owner_id=? AND s.status='submitted' GROUP BY exam_id", req.user.id)) counts[r.exam_id] = r;
  res.json({ exams: rows.map((r) => ({ ...examRow(r, false), submissions: counts[r.id] ? counts[r.id].n : 0, avg: counts[r.id] ? Math.round(counts[r.id].avg * 100) / 100 : null })) });
});
app.post('/api/exams', auth, wrap(async (req, res) => {
  const b = req.body || {};
  const eid = id();
  const code = newCode();
  const title = cleanText(b.title, 200) || 'Đề chưa đặt tên';
  run('INSERT INTO exams(id,owner_id,code,title,subject,grade,description,folder_id,questions,parts,settings,class_ids,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    eid, req.user.id, code, title, cleanText(b.subject, 60), cleanText(b.grade, 30), cleanText(b.description, 2000), b.folderId || null,
    JSON.stringify(cleanQuestions(b.questions || [])), JSON.stringify(cleanParts(b.parts)), JSON.stringify(cleanSettings(b.settings)),
    JSON.stringify(cleanClassIds(req, b.classIds)), b.status === 'published' ? 'published' : 'draft', now(), now());
  res.json({ exam: examRow(get('SELECT * FROM exams WHERE id=?', eid)) });
}));
function cleanParts(p) { return (Array.isArray(p) ? p : []).slice(0, 20).map((x) => ({ index: Number(x.index) || 0, title: cleanText(x.title, 300) })); }
function cleanClassIds(req, ids) {
  if (!Array.isArray(ids)) return [];
  return ids.filter((c) => get('SELECT id FROM classes WHERE id=? AND owner_id=?', c, req.user.id));
}
app.get('/api/exams/:id', auth, (req, res) => res.json({ exam: examRow(ownExam(req)) }));
app.put('/api/exams/:id', auth, wrap(async (req, res) => {
  const e = ownExam(req);
  const b = req.body || {};
  const cur = examRow(e);
  run('UPDATE exams SET title=?,subject=?,grade=?,description=?,folder_id=?,questions=?,parts=?,settings=?,class_ids=?,status=?,updated_at=? WHERE id=?',
    b.title !== undefined ? (cleanText(b.title, 200) || 'Đề chưa đặt tên') : cur.title,
    b.subject !== undefined ? cleanText(b.subject, 60) : cur.subject,
    b.grade !== undefined ? cleanText(b.grade, 30) : cur.grade,
    b.description !== undefined ? cleanText(b.description, 2000) : cur.description,
    b.folderId !== undefined ? (b.folderId || null) : cur.folderId,
    b.questions !== undefined ? JSON.stringify(cleanQuestions(b.questions)) : e.questions,
    b.parts !== undefined ? JSON.stringify(cleanParts(b.parts)) : e.parts,
    b.settings !== undefined ? JSON.stringify(cleanSettings(b.settings)) : e.settings,
    b.classIds !== undefined ? JSON.stringify(cleanClassIds(req, b.classIds)) : e.class_ids,
    ['draft', 'published', 'closed'].includes(b.status) ? b.status : e.status,
    now(), e.id);
  res.json({ exam: examRow(get('SELECT * FROM exams WHERE id=?', e.id)) });
}));
app.delete('/api/exams/:id', auth, (req, res) => {
  const e = ownExam(req);
  run('DELETE FROM exams WHERE id=?', e.id);
  res.json({ ok: true });
});
app.post('/api/exams/:id/duplicate', auth, (req, res) => {
  const e = ownExam(req);
  const eid = id();
  const qs = J(e.questions, []).map((q) => ({ ...q, id: id() }));
  run('INSERT INTO exams(id,owner_id,code,title,subject,grade,description,folder_id,questions,parts,settings,class_ids,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    eid, req.user.id, newCode(), e.title + ' (bản sao)', e.subject, e.grade, e.description, e.folder_id, JSON.stringify(qs), e.parts, e.settings, e.class_ids, 'draft', now(), now());
  res.json({ exam: examRow(get('SELECT * FROM exams WHERE id=?', eid)) });
});

// Thư mục
app.get('/api/folders', auth, (req, res) => res.json({ folders: all('SELECT id,name FROM folders WHERE owner_id=? ORDER BY name', req.user.id) }));
app.post('/api/folders', auth, (req, res) => {
  const name = cleanText(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Nhập tên thư mục');
  const fid = id();
  run('INSERT INTO folders(id,owner_id,name,created_at) VALUES(?,?,?,?)', fid, req.user.id, name, now());
  res.json({ folder: { id: fid, name } });
});
app.put('/api/folders/:id', auth, (req, res) => {
  run('UPDATE folders SET name=? WHERE id=? AND owner_id=?', cleanText(req.body.name, 80) || 'Thư mục', req.params.id, req.user.id);
  res.json({ ok: true });
});
app.delete('/api/folders/:id', auth, (req, res) => {
  run('UPDATE exams SET folder_id=NULL WHERE folder_id=? AND owner_id=?', req.params.id, req.user.id);
  run('DELETE FROM folders WHERE id=? AND owner_id=?', req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------- Lớp học ----------
function ownClass(req) {
  const c = get('SELECT * FROM classes WHERE id=? AND owner_id=?', req.params.id, req.user.id);
  if (!c) throw new HttpError(404, 'Không tìm thấy lớp');
  return c;
}
app.get('/api/classes', auth, (req, res) => {
  const rows = all('SELECT c.*, (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id) n FROM classes c WHERE owner_id=? ORDER BY c.name', req.user.id);
  res.json({ classes: rows.map((c) => ({ id: c.id, name: c.name, description: c.description, studentCount: c.n, createdAt: c.created_at })) });
});
app.post('/api/classes', auth, (req, res) => {
  const name = cleanText(req.body.name, 80);
  if (!name) throw new HttpError(400, 'Nhập tên lớp');
  const cid = id();
  run('INSERT INTO classes(id,owner_id,name,description,created_at) VALUES(?,?,?,?,?)', cid, req.user.id, name, cleanText(req.body.description, 500), now());
  res.json({ class: { id: cid, name } });
});
app.get('/api/classes/:id', auth, (req, res) => {
  const c = ownClass(req);
  const students = all('SELECT id,name,code,dob,phone FROM students WHERE class_id=? ORDER BY sort, name', c.id);
  const exams = all('SELECT * FROM exams WHERE owner_id=? ORDER BY updated_at DESC', req.user.id).filter((e) => J(e.class_ids, []).includes(c.id)).map((e) => examRow(e, false));
  res.json({ class: { id: c.id, name: c.name, description: c.description, students, exams } });
});
app.put('/api/classes/:id', auth, (req, res) => {
  const c = ownClass(req);
  tx(() => {
    if (req.body.name !== undefined) run('UPDATE classes SET name=?, description=? WHERE id=?', cleanText(req.body.name, 80) || c.name, cleanText(req.body.description, 500), c.id);
    if (Array.isArray(req.body.students)) {
      const keep = new Set();
      req.body.students.slice(0, 1000).forEach((s, i) => {
        const name = cleanText(s.name, 100);
        if (!name) return;
        const sid = s.id && get('SELECT id FROM students WHERE id=? AND class_id=?', s.id, c.id) ? s.id : id();
        keep.add(sid);
        if (sid === s.id) run('UPDATE students SET name=?,code=?,dob=?,phone=?,sort=? WHERE id=?', name, cleanText(s.code, 40), cleanText(s.dob, 20), cleanText(s.phone, 20), i, sid);
        else run('INSERT INTO students(id,class_id,name,code,dob,phone,sort) VALUES(?,?,?,?,?,?,?)', sid, c.id, name, cleanText(s.code, 40), cleanText(s.dob, 20), cleanText(s.phone, 20), i);
      });
      for (const s of all('SELECT id FROM students WHERE class_id=?', c.id)) if (!keep.has(s.id)) run('DELETE FROM students WHERE id=?', s.id);
    }
  });
  res.json({ ok: true });
});
app.delete('/api/classes/:id', auth, (req, res) => {
  const c = ownClass(req);
  run('DELETE FROM classes WHERE id=?', c.id);
  res.json({ ok: true });
});

// ---------- Bài làm & thống kê (giáo viên) ----------
function finalizeExpired() {
  const rows = all("SELECT s.*, e.questions, e.settings FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE s.status='doing' AND s.deadline IS NOT NULL AND s.deadline < ?", now() - 60000);
  for (const s of rows) finalize(s, J(s.questions, []), { ...DEFAULT_SETTINGS, ...J(s.settings, {}) }, J(s.answers, {}), s.deadline, 'Hết giờ - hệ thống tự nộp');
}
function finalize(sub, questions, settings, answers, at, note) {
  const g = gradeAll(questions, answers, settings, J(sub.manual, {}));
  const events = J(sub.events, []);
  if (note) events.push({ t: at || now(), e: note });
  run("UPDATE submissions SET status='submitted', answers=?, score=?, max_score=?, correct=?, total=?, details=?, submitted_at=?, events=? WHERE id=?",
    JSON.stringify(answers), g.score, g.max, g.correct, g.total, JSON.stringify(g.details), at || now(), JSON.stringify(events), sub.id);
  return g;
}
setInterval(() => { try { finalizeExpired(); } catch (e) { console.error(e); } }, 30000).unref();

function subRow(s) {
  return {
    id: s.id, studentName: s.student_name, studentClass: s.student_class, studentCode: s.student_code, studentId: s.student_id,
    status: s.status, score: s.score, maxScore: s.max_score, correct: s.correct, total: s.total, tabSwitches: s.tab_switches,
    startedAt: s.started_at, submittedAt: s.submitted_at, deadline: s.deadline, comment: s.comment,
    duration: s.submitted_at ? Math.round((s.submitted_at - s.started_at) / 1000) : null,
    pending: J(s.details, []).filter((d) => d.status === 'pending').length,
  };
}
app.get('/api/exams/:id/submissions', auth, (req, res) => {
  finalizeExpired();
  const e = ownExam(req);
  const rows = all('SELECT * FROM submissions WHERE exam_id=? ORDER BY started_at DESC', e.id);
  const list = rows.map(subRow);
  // Học sinh trong lớp được giao nhưng chưa làm
  const missing = [];
  for (const cid of J(e.class_ids, [])) {
    const c = get('SELECT name FROM classes WHERE id=?', cid);
    for (const st of all('SELECT id,name,code FROM students WHERE class_id=? ORDER BY sort,name', cid)) {
      if (!rows.some((r) => r.student_id === st.id)) missing.push({ studentId: st.id, name: st.name, code: st.code, className: c ? c.name : '' });
    }
  }
  res.json({ submissions: list, missing, exam: examRow(e) });
});
app.get('/api/submissions/:sid', auth, (req, res) => {
  const s = get('SELECT s.* FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE s.id=? AND e.owner_id=?', req.params.sid, req.user.id);
  if (!s) throw new HttpError(404, 'Không tìm thấy bài làm');
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  res.json({ submission: { ...subRow(s), answers: J(s.answers, {}), details: J(s.details, []), manual: J(s.manual, {}), layout: J(s.layout, {}), events: J(s.events, []), ip: s.ip, userAgent: s.user_agent }, exam: examRow(e) });
});
app.put('/api/submissions/:sid/grade', auth, (req, res) => {
  const s = get('SELECT s.* FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE s.id=? AND e.owner_id=?', req.params.sid, req.user.id);
  if (!s) throw new HttpError(404, 'Không tìm thấy bài làm');
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  const manual = {};
  for (const [k, v] of Object.entries(req.body.manual || {})) if (v !== '' && v !== null && Number.isFinite(Number(v))) manual[k] = Number(v);
  const g = gradeAll(J(e.questions, []), J(s.answers, {}), { ...DEFAULT_SETTINGS, ...J(e.settings, {}) }, manual);
  run('UPDATE submissions SET manual=?, comment=?, score=?, max_score=?, correct=?, total=?, details=? WHERE id=?',
    JSON.stringify(manual), cleanText(req.body.comment, 2000), s.status === 'submitted' ? g.score : s.score, g.max, g.correct, g.total, JSON.stringify(g.details), s.id);
  res.json({ ok: true, score: g.score });
});
app.delete('/api/submissions/:sid', auth, (req, res) => {
  const s = get('SELECT s.id FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE s.id=? AND e.owner_id=?', req.params.sid, req.user.id);
  if (!s) throw new HttpError(404, 'Không tìm thấy bài làm');
  run('DELETE FROM submissions WHERE id=?', s.id);
  res.json({ ok: true });
});
app.post('/api/exams/:id/regrade', auth, (req, res) => {
  const e = ownExam(req);
  const qs = J(e.questions, []), st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  let n = 0;
  tx(() => {
    for (const s of all("SELECT * FROM submissions WHERE exam_id=? AND status='submitted'", e.id)) {
      const g = gradeAll(qs, J(s.answers, {}), st, J(s.manual, {}));
      run('UPDATE submissions SET score=?, max_score=?, correct=?, total=?, details=? WHERE id=?', g.score, g.max, g.correct, g.total, JSON.stringify(g.details), s.id);
      n++;
    }
  });
  res.json({ ok: true, count: n });
});
app.get('/api/exams/:id/stats', auth, (req, res) => {
  finalizeExpired();
  const e = ownExam(req);
  const qs = J(e.questions, []);
  const subs = all("SELECT * FROM submissions WHERE exam_id=? AND status='submitted'", e.id);
  const scores = subs.map((s) => s.score || 0);
  const maxScore = subs.length ? subs[0].max_score : qs.reduce((a, q) => a + (q.points || 0), 0);
  const sorted = [...scores].sort((a, b) => a - b);
  const buckets = Array(10).fill(0);
  for (const s of subs) {
    const ten = s.max_score ? (s.score / s.max_score) * 10 : 0;
    buckets[Math.min(9, Math.floor(ten))]++;
  }
  const perQ = qs.map((q) => {
    const r = { id: q.id, type: q.type, correct: 0, partial: 0, wrong: 0, blank: 0, pending: 0, picks: {} };
    for (const s of subs) {
      const d = J(s.details, []).find((x) => x.qid === q.id);
      const st = d ? d.status : 'blank';
      if (r[st] !== undefined) r[st]++; else r.wrong++;
      const a = J(s.answers, {})[q.id];
      if (q.type === 'mc' || q.type === 'multi') for (const v of (Array.isArray(a) ? a : a == null ? [] : [a])) r.picks[v] = (r.picks[v] || 0) + 1;
    }
    r.rate = subs.length ? Math.round((r.correct / subs.length) * 1000) / 10 : 0;
    return r;
  });
  const ten = subs.map((s) => (s.max_score ? (s.score / s.max_score) * 10 : 0));
  res.json({
    count: subs.length, doing: get("SELECT COUNT(*) n FROM submissions WHERE exam_id=? AND status='doing'", e.id).n,
    avg: subs.length ? round2(scores.reduce((a, b) => a + b, 0) / subs.length) : null,
    max: subs.length ? sorted[sorted.length - 1] : null, min: subs.length ? sorted[0] : null,
    median: subs.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : round2((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : null,
    maxScore, buckets, perQ,
    levels: { gioi: ten.filter((x) => x >= 8).length, kha: ten.filter((x) => x >= 6.5 && x < 8).length, tb: ten.filter((x) => x >= 5 && x < 6.5).length, yeu: ten.filter((x) => x < 5).length },
  });
});
const round2 = (x) => Math.round(x * 100) / 100;

app.get('/api/dashboard', auth, (req, res) => {
  const u = req.user.id;
  const exams = get('SELECT COUNT(*) n FROM exams WHERE owner_id=?', u).n;
  const published = get("SELECT COUNT(*) n FROM exams WHERE owner_id=? AND status='published'", u).n;
  const classes = get('SELECT COUNT(*) n FROM classes WHERE owner_id=?', u).n;
  const students = get('SELECT COUNT(*) n FROM students s JOIN classes c ON c.id=s.class_id WHERE c.owner_id=?', u).n;
  const subs = get("SELECT COUNT(*) n FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE e.owner_id=? AND s.status='submitted'", u).n;
  const recent = all("SELECT s.*, e.title FROM submissions s JOIN exams e ON e.id=s.exam_id WHERE e.owner_id=? AND s.status='submitted' ORDER BY s.submitted_at DESC LIMIT 8", u)
    .map((s) => ({ ...subRow(s), examTitle: s.title, examId: s.exam_id }));
  res.json({ exams, published, classes, students, submissions: subs, recent });
});

// ---------- Học sinh làm bài (công khai) ----------
function publicExam(code) {
  const e = get('SELECT * FROM exams WHERE code=?', String(code || '').toUpperCase().trim());
  if (!e || e.status === 'draft') throw new HttpError(404, 'Mã đề không tồn tại hoặc chưa được giao');
  return e;
}
function examWindow(e, st) {
  const t = now();
  if (e.status === 'closed') return { open: false, reason: 'Đề đã đóng, không nhận bài nữa' };
  if (st.startAt && t < st.startAt) return { open: false, reason: 'Chưa đến giờ làm bài', notYet: true };
  if (st.endAt && t > st.endAt) return { open: false, reason: 'Đã hết thời gian làm bài' };
  return { open: true };
}
function rostersOf(e) {
  return J(e.class_ids, []).map((cid) => {
    const c = get('SELECT id,name FROM classes WHERE id=?', cid);
    if (!c) return null;
    return { id: c.id, name: c.name, students: all('SELECT id,name FROM students WHERE class_id=? ORDER BY sort,name', cid) };
  }).filter(Boolean);
}

app.get('/api/public/exam/:code', (req, res) => {
  const e = publicExam(req.params.code);
  const st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  const qs = J(e.questions, []);
  const owner = get('SELECT name, school FROM users WHERE id=?', e.owner_id);
  res.json({
    exam: {
      code: e.code, title: e.title, subject: e.subject, grade: e.grade, description: e.description, questionCount: qs.length,
      duration: st.duration, startAt: st.startAt, endAt: st.endAt, needPassword: !!st.password, maxAttempts: st.maxAttempts,
      identity: st.identity, requireClass: st.requireClass, requireCode: st.requireCode, teacher: owner ? owner.name : '', school: owner ? owner.school : '',
      window: examWindow(e, st), rosters: st.identity === 'roster' ? rostersOf(e) : [], serverNow: now(),
      types: { mc: qs.filter((q) => q.type === 'mc' || q.type === 'multi').length, tf: qs.filter((q) => q.type === 'tf').length, short: qs.filter((q) => q.type === 'short').length, essay: qs.filter((q) => q.type === 'essay').length },
    },
  });
});

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function buildLayout(qs, st) {
  let order = qs.map((q) => q.id);
  if (st.shuffleQuestions) {
    // Trộn trong từng phần, giữ thứ tự các phần
    const groups = [];
    for (const q of qs) {
      let g = groups.find((x) => x.part === (q.part || 0));
      if (!g) { g = { part: q.part || 0, ids: [] }; groups.push(g); }
      g.ids.push(q.id);
    }
    order = groups.flatMap((g) => shuffle(g.ids));
  }
  const opt = {};
  for (const q of qs) {
    const ids = (q.options || []).map((o) => o.id);
    opt[q.id] = st.shuffleOptions && (q.type === 'mc' || q.type === 'multi') && !hasPositionalOption(q) ? shuffle(ids) : ids;
  }
  return { order, opt };
}
// Không trộn khi có phương án kiểu "Cả A và B đều đúng"
function hasPositionalOption(q) {
  return q.options.some((o) => /\b(cả|tất cả)\b.*\b(đều|trên)\b|\b(A|B|C)\s*(và|,)\s*(B|C|D)\b|all of the above|none of the above|both/i.test(o.html.replace(/<[^>]+>/g, '')));
}

function studentView(e, sub) {
  const qs = J(e.questions, []);
  const layout = J(sub.layout, {});
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const parts = J(e.parts, []);
  const questions = (layout.order || qs.map((q) => q.id)).map((qid) => byId[qid]).filter(Boolean).map((q) => {
    const optIds = layout.opt && layout.opt[q.id] ? layout.opt[q.id] : (q.options || []).map((o) => o.id);
    const oById = Object.fromEntries((q.options || []).map((o) => [o.id, o]));
    return {
      id: q.id, type: q.type, part: q.part || 0, content: q.content, points: q.points,
      options: optIds.map((oid) => oById[oid]).filter(Boolean).map((o) => ({ id: o.id, html: o.html })),
      multiCount: q.type === 'multi' && Array.isArray(q.answer) ? q.answer.length : undefined,
    };
  });
  return { questions, parts };
}

function identityKey(name, cls, code) {
  const n = (s) => String(s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  return `nm:${n(name)}|${n(cls)}|${n(code)}`;
}

app.post('/api/public/exam/:code/start', wrap(async (req, res) => {
  finalizeExpired();
  const e = publicExam(req.params.code);
  const st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  const b = req.body || {};
  // Tiếp tục bài đang làm
  if (b.resumeToken) {
    const s = get('SELECT * FROM submissions WHERE token=? AND exam_id=?', String(b.resumeToken), e.id);
    if (s && s.status === 'doing') return res.json(attemptPayload(e, s, st));
  }
  const win = examWindow(e, st);
  if (!win.open) throw new HttpError(403, win.reason);
  if (st.password && String(b.password || '') !== st.password) throw new HttpError(403, 'Mật khẩu đề không đúng');
  let name = cleanText(b.name, 100), cls = cleanText(b.className, 60), code = cleanText(b.studentCode, 40), studentId = null, key;
  if (st.identity === 'roster') {
    const rosters = rostersOf(e);
    const found = rosters.flatMap((c) => c.students.map((s) => ({ ...s, className: c.name }))).find((s) => s.id === b.studentId);
    if (!found) throw new HttpError(400, 'Vui lòng chọn tên của bạn trong danh sách lớp');
    const full = get('SELECT * FROM students WHERE id=?', found.id);
    if (full.code && st.requireCode && String(b.studentCode || '').trim().toLowerCase() !== full.code.trim().toLowerCase()) throw new HttpError(403, 'Mã học sinh không đúng');
    name = full.name; cls = found.className; code = full.code || ''; studentId = full.id; key = 'st:' + full.id;
  } else {
    if (!name || name.length < 2) throw new HttpError(400, 'Vui lòng nhập họ và tên');
    if (st.requireClass && !cls) throw new HttpError(400, 'Vui lòng nhập lớp');
    if (st.requireCode && !code) throw new HttpError(400, 'Vui lòng nhập số báo danh / mã học sinh');
    key = identityKey(name, cls, code);
  }
  const doing = get("SELECT * FROM submissions WHERE exam_id=? AND identity_key=? AND status='doing' ORDER BY started_at DESC", e.id, key);
  if (doing) return res.json(attemptPayload(e, doing, st));
  const done = get("SELECT COUNT(*) n FROM submissions WHERE exam_id=? AND identity_key=? AND status='submitted'", e.id, key).n;
  if (st.maxAttempts && done >= st.maxAttempts) throw new HttpError(403, `Bạn đã làm đủ ${st.maxAttempts} lượt cho đề này`);
  const qs = J(e.questions, []);
  if (!qs.length) throw new HttpError(400, 'Đề chưa có câu hỏi');
  const layout = buildLayout(qs, st);
  let deadline = st.duration ? now() + st.duration * 60000 : null;
  if (st.endAt) deadline = deadline ? Math.min(deadline, st.endAt) : st.endAt;
  const sid = id(), token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO submissions(id,exam_id,token,student_name,student_class,student_code,student_id,identity_key,answers,layout,status,started_at,deadline,ip,user_agent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    sid, e.id, token, name, cls, code, studentId, key, '{}', JSON.stringify(layout), 'doing', now(), deadline, req.ip || '', cleanText(req.headers['user-agent'], 300));
  res.json(attemptPayload(e, get('SELECT * FROM submissions WHERE id=?', sid), st));
}));

function attemptPayload(e, s, st) {
  const view = studentView(e, s);
  return {
    token: s.token, studentName: s.student_name, studentClass: s.student_class, examTitle: e.title, code: e.code,
    deadline: s.deadline, serverNow: now(), startedAt: s.started_at, answers: J(s.answers, {}), tabSwitches: s.tab_switches,
    settings: { detectTab: st.detectTab, maxTabSwitches: st.maxTabSwitches, blockCopy: st.blockCopy, duration: st.duration },
    ...view,
  };
}

app.get('/api/public/attempt/:token', (req, res) => {
  const s = attemptByToken(req.params.token);
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  const st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  if (s.status === 'doing' && s.deadline && now() > s.deadline + 60000) {
    finalize(s, J(e.questions, []), st, J(s.answers, {}), s.deadline, 'Hết giờ - hệ thống tự nộp');
    return res.json({ status: 'submitted', code: e.code });
  }
  if (s.status !== 'doing') return res.json({ status: s.status, code: e.code });
  res.json({ status: 'doing', ...attemptPayload(e, s, st) });
});

function attemptByToken(token) {
  const s = get('SELECT * FROM submissions WHERE token=?', String(token || ''));
  if (!s) throw new HttpError(404, 'Không tìm thấy bài làm');
  return s;
}
function cleanAnswers(e, answers) {
  const qs = J(e.questions, []);
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  for (const q of qs) {
    const a = answers[q.id];
    if (a === undefined || a === null) continue;
    const optIds = new Set((q.options || []).map((o) => o.id));
    if (q.type === 'mc' && typeof a === 'string' && optIds.has(a)) out[q.id] = a;
    else if (q.type === 'multi' && Array.isArray(a)) { const v = a.filter((x) => optIds.has(x)); if (v.length) out[q.id] = [...new Set(v)]; }
    else if (q.type === 'tf' && typeof a === 'object') { const v = {}; for (const k of Object.keys(a)) if (optIds.has(k) && (a[k] === true || a[k] === false)) v[k] = a[k]; if (Object.keys(v).length) out[q.id] = v; }
    else if (q.type === 'short' && (typeof a === 'string' || typeof a === 'number')) { const v = String(a).slice(0, 200); if (v.trim()) out[q.id] = v; }
    else if (q.type === 'essay' && typeof a === 'object') {
      const text = String(a.text || '').slice(0, 20000);
      const images = (Array.isArray(a.images) ? a.images : []).filter((u) => /^\/uploads\/[\w]+\.(png|jpg|gif|webp)$/.test(u)).slice(0, 10);
      if (text.trim() || images.length) out[q.id] = { text, images };
    }
  }
  return out;
}

app.post('/api/public/attempt/:token/save', wrap(async (req, res) => {
  const s = attemptByToken(req.params.token);
  if (s.status !== 'doing') return res.json({ status: s.status });
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  const late = s.deadline && now() > s.deadline + 60000;
  if (late) {
    finalize(s, J(e.questions, []), { ...DEFAULT_SETTINGS, ...J(e.settings, {}) }, J(s.answers, {}), s.deadline, 'Hết giờ - hệ thống tự nộp');
    return res.json({ status: 'submitted' });
  }
  const answers = cleanAnswers(e, req.body.answers);
  const tabs = Math.max(s.tab_switches, Number(req.body.tabSwitches) || 0);
  const events = J(s.events, []);
  if (Array.isArray(req.body.events)) for (const ev of req.body.events.slice(0, 20)) events.push({ t: Number(ev.t) || now(), e: cleanText(ev.e, 100) });
  run('UPDATE submissions SET answers=?, tab_switches=?, events=? WHERE id=?', JSON.stringify(answers), tabs, JSON.stringify(events.slice(-200)), s.id);
  res.json({ status: 'doing', savedAt: now(), serverNow: now() });
}));

app.post('/api/public/attempt/:token/submit', wrap(async (req, res) => {
  const s = attemptByToken(req.params.token);
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  const st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  if (s.status === 'doing') {
    const late = s.deadline && now() > s.deadline + 60000;
    const answers = late ? J(s.answers, {}) : cleanAnswers(e, req.body.answers);
    const tabs = Math.max(s.tab_switches, Number(req.body.tabSwitches) || 0);
    run('UPDATE submissions SET tab_switches=? WHERE id=?', tabs, s.id);
    const events = J(s.events, []);
    if (Array.isArray(req.body.events)) for (const ev of req.body.events.slice(0, 20)) events.push({ t: Number(ev.t) || now(), e: cleanText(ev.e, 100) });
    s.events = JSON.stringify(events);
    finalize(s, J(e.questions, []), st, answers, late ? s.deadline : now(), req.body.auto ? cleanText(req.body.auto, 100) : (late ? 'Nộp muộn - dùng bài đã lưu' : null));
  }
  res.json(resultPayload(e, get('SELECT * FROM submissions WHERE id=?', s.id), st));
}));

app.get('/api/public/attempt/:token/result', (req, res) => {
  finalizeExpired();
  const s = attemptByToken(req.params.token);
  const e = get('SELECT * FROM exams WHERE id=?', s.exam_id);
  if (s.status === 'doing') return res.json({ status: 'doing', code: e.code });
  res.json(resultPayload(e, s, { ...DEFAULT_SETTINGS, ...J(e.settings, {}) }));
});

function resultPayload(e, s, st) {
  const out = {
    status: s.status, examTitle: e.title, code: e.code, studentName: s.student_name, studentClass: s.student_class,
    submittedAt: s.submitted_at, startedAt: s.started_at, comment: s.comment,
  };
  const details = J(s.details, []);
  if (st.showScore) {
    Object.assign(out, { score: s.score, maxScore: s.max_score, correct: s.correct, total: s.total, pending: details.filter((d) => d.status === 'pending').length });
  }
  const closed = e.status === 'closed' || (st.endAt && now() > st.endAt);
  const canReview = st.showReview === 'after_submit' || (st.showReview === 'after_close' && closed);
  out.reviewAvailable = canReview;
  if (st.showReview === 'after_close' && !closed) out.reviewNote = 'Đáp án sẽ được công bố sau khi đề đóng.';
  if (canReview) {
    const view = studentView(e, s);
    const qs = J(e.questions, []);
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
    out.review = {
      parts: view.parts,
      questions: view.questions.map((vq) => {
        const q = byId[vq.id];
        const d = details.find((x) => x.qid === q.id) || {};
        let correct = null;
        if (q.type === 'mc' || q.type === 'multi') correct = (q.answer || []).map((i) => q.options[i] && q.options[i].id);
        else if (q.type === 'tf') correct = Object.fromEntries(q.options.map((o, i) => [o.id, !!(q.answer || [])[i]]));
        else if (q.type === 'short') correct = q.answer;
        return { ...vq, correct, earned: d.earned, max: d.max, status: d.status, explanation: st.showExplanation ? q.explanation : '' };
      }),
      answers: J(s.answers, {}),
    };
  }
  return out;
}

app.post('/api/public/attempt/:token/upload', upload.single('file'), wrap(async (req, res) => {
  const s = attemptByToken(req.params.token);
  if (s.status !== 'doing') throw new HttpError(400, 'Bài đã nộp');
  if (!req.file) throw new HttpError(400, 'Chưa chọn ảnh');
  if (req.file.size > 10 * 1024 * 1024) throw new HttpError(400, 'Ảnh tối đa 10MB');
  res.json({ url: saveUpload(req.file.buffer, path.extname(req.file.originalname || '.jpg')) });
}));

// Tra cứu kết quả theo tên (cho học sinh mất link)
app.post('/api/public/exam/:code/lookup', (req, res) => {
  const e = publicExam(req.params.code);
  const key = req.body.studentId ? 'st:' + req.body.studentId : identityKey(req.body.name, req.body.className, req.body.studentCode);
  const rows = all("SELECT token, submitted_at, score, max_score, status FROM submissions WHERE exam_id=? AND identity_key=? ORDER BY started_at DESC", e.id, key);
  const st = { ...DEFAULT_SETTINGS, ...J(e.settings, {}) };
  res.json({ attempts: rows.map((r) => ({ token: r.token, submittedAt: r.submitted_at, status: r.status, score: st.showScore ? r.score : null, maxScore: st.showScore ? r.max_score : null })) });
});

// ---------- Tệp tĩnh ----------
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); } }));
const nm = path.join(__dirname, '..', 'node_modules');
app.use('/vendor/katex', express.static(path.join(nm, 'katex', 'dist'), { maxAge: '7d' }));
app.get('/vendor/qrcode.js', (req, res) => res.sendFile(path.join(nm, 'qrcode-generator', 'dist', 'qrcode.js')));
app.get('/vendor/xlsx.full.min.js', (req, res) => res.sendFile(path.join(nm, 'xlsx', 'dist', 'xlsx.full.min.js')));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0 }));
app.get(/^\/(?!api\/|uploads\/|vendor\/).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.use((err, req, res, next) => {
  void next;
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File quá lớn (tối đa 40MB)' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ: ' + err.message : err.message });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Trang trắc nghiệm đang chạy: http://localhost:${PORT}`));
}
module.exports = app;

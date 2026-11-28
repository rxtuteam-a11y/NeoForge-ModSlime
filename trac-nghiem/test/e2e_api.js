// Kiểm thử đầu-cuối qua API (chạy khi server đang chạy): node test/e2e_api.js http://localhost:3100
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:3000';
let cookie = '';
async function call(method, url, body, isForm) {
  const init = { method, headers: { cookie } };
  if (isForm) init.body = body; else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, init);
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
(async () => {
  const email = `gv${Date.now()}@test.vn`;
  await call('POST', '/api/auth/register', { name: 'Cô Lan', email, password: 'matkhau123', school: 'THPT Thử Nghiệm' });
  const me = await call('GET', '/api/auth/me'); assert(me.user && me.user.email === email, 'đăng ký + phiên đăng nhập');
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(__dirname + '/samples/de2_thpt2025.docx')]), 'de2.docx');
  const parsed = await call('POST', '/api/parse', fd, true);
  assert(parsed.questions.length === 7, 'tách được 7 câu từ đề 2025');
  const cls = await call('POST', '/api/classes', { name: '12A1' });
  await call('PUT', '/api/classes/' + cls.class.id, { students: [{ name: 'Nguyễn Văn An', code: 'HS01' }, { name: 'Trần Thị Bình', code: 'HS02' }] });
  const ex = await call('POST', '/api/exams', { title: parsed.meta.title, subject: 'Toán', questions: parsed.questions, parts: parsed.parts, settings: { duration: 30, shuffleQuestions: true, shuffleOptions: true, maxAttempts: 1 }, classIds: [cls.class.id], status: 'published' });
  const code = ex.exam.code;
  assert(/^[A-Z0-9]{6}$/.test(code), 'tạo đề, mã ' + code);
  // Học sinh
  cookie = '';
  const info = await call('GET', '/api/public/exam/' + code);
  assert(info.exam.questionCount === 7 && !JSON.stringify(info).includes('"answer"'), 'thông tin đề công khai, không lộ đáp án');
  const at = await call('POST', `/api/public/exam/${code}/start`, { name: 'Lê Văn Cường', className: '12A2' });
  assert(at.questions.length === 7 && !JSON.stringify(at.questions).includes('"answer"'), 'bắt đầu làm bài, câu hỏi không chứa đáp án');
  // trả lời đúng tất cả dựa vào đề gốc
  const full = (await (async () => { const c2 = cookie; return c2; })(), null);
  void full;
  const qs = parsed.questions; // đáp án gốc (theo id)
  const answers = {};
  for (const q of at.questions) {
    const orig = ex.exam.questions.find((x) => x.id === q.id);
    if (orig.type === 'mc') answers[q.id] = orig.options[orig.answer[0]].id;
    if (orig.type === 'tf') { answers[q.id] = {}; orig.options.forEach((o, i) => { answers[q.id][o.id] = i === 0 ? !orig.answer[i] : orig.answer[i]; }); } // sai 1 ý -> 0.5 điểm
    if (orig.type === 'short') answers[q.id] = String(orig.answer).replace(',', '.');
  }
  await call('POST', `/api/public/attempt/${at.token}/save`, { answers, tabSwitches: 1, events: [{ t: Date.now(), e: 'Rời khỏi màn hình làm bài (lần 1)' }] });
  const again = await call('POST', `/api/public/exam/${code}/start`, { name: 'lê văn cường', className: '12a2' });
  assert(again.token === at.token && Object.keys(again.answers).length === 7, 'vào lại tiếp tục bài đang làm, giữ đáp án đã lưu');
  const res = await call('POST', `/api/public/attempt/${at.token}/submit`, { answers, tabSwitches: 1 });
  // MC: 3*0.25=0.75; TF: 2 câu * 0.5 (3/4 ý đúng) = 1; short: 2 * 0.5 (Toán) = 1  => 2.75
  assert(Math.abs(res.score - 2.75) < 1e-9, `chấm điểm đúng: ${res.score}/${res.maxScore} (mong đợi 2.75/3.75)`);
  assert(res.review && res.review.questions.length === 7, 'xem lại bài sau khi nộp');
  let blocked = false;
  try { await call('POST', `/api/public/exam/${code}/start`, { name: 'Lê Văn Cường', className: '12A2' }); } catch (e) { blocked = /đủ 1 lượt/.test(e.message); }
  assert(blocked, 'giới hạn số lượt làm');
  // Giáo viên xem kết quả
  cookie = '';
  await call('POST', '/api/auth/login', { email, password: 'matkhau123' });
  const subs = await call('GET', `/api/exams/${ex.exam.id}/submissions`);
  assert(subs.submissions.length === 1 && subs.submissions[0].tabSwitches === 1, 'giáo viên thấy bài nộp + số lần rời màn hình');
  assert(subs.missing.length === 2, 'danh sách học sinh lớp được giao chưa làm: ' + subs.missing.length);
  const st = await call('GET', `/api/exams/${ex.exam.id}/stats`);
  assert(st.count === 1 && st.perQ.length === 7, 'thống kê');
  const sid = subs.submissions[0].id;
  const g = await call('PUT', `/api/submissions/${sid}/grade`, { manual: { [qs[3].id]: 1 }, comment: 'Cố gắng hơn nhé' });
  assert(Math.abs(g.score - 3.25) < 1e-9, 'giáo viên sửa điểm thủ công: ' + g.score);
  const dup = await call('POST', `/api/exams/${ex.exam.id}/duplicate`);
  assert(dup.exam.code !== code && dup.exam.status === 'draft', 'nhân bản đề');
  // Roster mode
  await call('PUT', '/api/exams/' + ex.exam.id, { settings: { ...ex.exam.settings, identity: 'roster', requireCode: true, maxAttempts: 0 } });
  cookie = '';
  const info2 = await call('GET', '/api/public/exam/' + code);
  assert(info2.exam.rosters[0].students.length === 2, 'chế độ danh sách lớp');
  let wrong = false;
  try { await call('POST', `/api/public/exam/${code}/start`, { studentId: info2.exam.rosters[0].students[0].id, studentCode: 'SAI' }); } catch (e) { wrong = /Mã học sinh/.test(e.message); }
  assert(wrong, 'kiểm tra mã học sinh');
  const at2 = await call('POST', `/api/public/exam/${code}/start`, { studentId: info2.exam.rosters[0].students[0].id, studentCode: 'hs01' });
  assert(at2.studentName === 'Nguyễn Văn An', 'học sinh chọn tên trong lớp');
  const r2 = await call('POST', `/api/public/attempt/${at2.token}/submit`, { answers: {} });
  assert(r2.score === 0, 'nộp bài trống = 0 điểm');
  console.log(process.exitCode ? 'CÓ LỖI' : 'TẤT CẢ ĐỀU ĐẠT');
})().catch((e) => { console.error(e); process.exit(1); });

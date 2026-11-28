// Khu vực giáo viên: tổng quan, đề thi, trình soạn đề, kết quả, thống kê, lớp học, in đề.
import {
  state, esc, $, $$, el, icon, api, toast, modal, confirmDialog, promptDialog, renderMath, cleanEditableHtml, navigate,
  fmtDate, fmtDur, fmtNum, toLocalInput, copyText, loadScript, TYPE_NAME, plainText, onLeave, setLeaveGuard, query,
} from './core.js';

const app = () => $('#app');
const OPT = 'ABCDEFGHIJ';
const TFL = 'abcdefghij';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function shell(active, inner) {
  const u = state.user;
  const nav = [['/app', 'Tổng quan', 'home'], ['/app/de', 'Đề thi', 'exams'], ['/app/lop', 'Lớp học', 'classes']];
  app().innerHTML = `<header class="topbar"><div class="inner">
    <button class="btn ghost icon menu-btn" id="menu-btn" aria-label="Menu">${icon.menu}</button>
    <a class="brand" href="/app"><span class="brand-mark">${icon.check}</span><span>Trắc Nghiệm Online</span></a>
    <nav class="nav" id="nav">${nav.map(([h, t, k]) => `<a href="${h}" class="${active === k ? 'active' : ''}">${t}</a>`).join('')}</nav>
    <a class="btn primary sm" href="/app/de/moi">${icon.plus}<span class="uname">Tạo đề</span></a>
    <div class="user-chip" id="user-chip" style="cursor:pointer" title="Tài khoản"><span class="avatar">${esc((u.name || '?').trim().split(/\s+/).pop()[0] || '?').toUpperCase()}</span><span class="uname">${esc(u.name)}</span></div>
  </div></header><div class="container fade-in" id="main">${inner}</div>`;
  $('#menu-btn').onclick = () => $('#nav').classList.toggle('open');
  $('#user-chip').onclick = () => {
    modal({
      title: u.name, body: `<p class="muted">${esc(u.email)}${u.school ? '<br>' + esc(u.school) : ''}</p>`,
      actions: [
        { label: 'Thông tin tài khoản', onClick: () => { navigate('/app/tai-khoan'); } },
        { label: 'Đăng xuất', cls: 'danger', onClick: async () => { await api('POST', '/api/auth/logout'); state.user = null; navigate('/'); } },
      ],
    });
  };
  return $('#main');
}
const loading = (active) => shell(active, '<div class="loading-page"><div class="spinner"></div></div>');
const statusBadge = (s) => ({ draft: '<span class="badge gray">Nháp</span>', published: '<span class="badge green">Đang mở</span>', closed: '<span class="badge red">Đã đóng</span>' }[s] || '');

// ================= Tổng quan =================
export async function dashboard() {
  loading('home');
  const [d, ex] = await Promise.all([api('GET', '/api/dashboard'), api('GET', '/api/exams')]);
  const main = shell('home', `
    <div class="page-head"><div><h1>Xin chào, ${esc(state.user.name)} 👋</h1><p class="muted">Tổng quan hoạt động giảng dạy của bạn</p></div>
      <a class="btn primary" href="/app/de/moi">${icon.upload} Tạo đề từ file Word / PDF</a></div>
    <div class="grid c4">
      ${[[icon.file, d.exams, 'đề thi'], [icon.send, d.published, 'đề đang mở'], [icon.users, d.students, `học sinh · ${d.classes} lớp`], [icon.check, d.submissions, 'lượt nộp bài']]
        .map(([ic, n, l]) => `<div class="card"><div class="stat"><div class="ico">${ic}</div><div><div class="num">${n}</div><div class="lbl">${l}</div></div></div></div>`).join('')}
    </div>
    <div class="grid c2 mt">
      <div class="card"><div class="card-title"><h3>Đề thi gần đây</h3><a href="/app/de" class="small">Xem tất cả →</a></div>
        ${ex.exams.length ? `<div class="col" style="gap:6px">${ex.exams.slice(0, 6).map((e) => `<a href="/app/de/${e.id}" class="row between" style="padding:8px 4px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none">
          <div class="grow"><div style="font-weight:600" class="nowrap">${esc(e.title)}</div><div class="tiny muted">${e.questionCount} câu · ${e.submissions} bài nộp · ${fmtDate(e.updatedAt, false)}</div></div>${statusBadge(e.status)}</a>`).join('')}</div>`
        : `<div class="empty">${icon.file}<p>Chưa có đề nào.</p><a class="btn primary" href="/app/de/moi">Tạo đề đầu tiên</a></div>`}
      </div>
      <div class="card"><div class="card-title"><h3>Bài nộp mới nhất</h3></div>
        ${d.recent.length ? `<div class="col" style="gap:6px">${d.recent.map((s) => `<a href="/app/bai/${s.id}" class="row between" style="padding:8px 4px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none">
          <div class="grow"><div style="font-weight:600">${esc(s.studentName)} <span class="muted small">${esc(s.studentClass)}</span></div><div class="tiny muted nowrap">${esc(s.examTitle)} · ${fmtDate(s.submittedAt)}</div></div>
          <b>${fmtNum(s.score)}<span class="muted small">/${fmtNum(s.maxScore)}</span></b></a>`).join('')}</div>`
        : `<div class="empty">${icon.check}<p>Chưa có học sinh nộp bài.</p></div>`}
      </div>
    </div>`);
  void main;
}

// ================= Danh sách đề =================
export async function examList() {
  loading('exams');
  const [{ exams }, { folders }] = await Promise.all([api('GET', '/api/exams'), api('GET', '/api/folders')]);
  const q = query();
  let filter = { text: '', folder: q.folder || '', status: '' };
  const main = shell('exams', `
    <div class="page-head"><div><h1>Đề thi</h1><p class="muted">${exams.length} đề</p></div>
      <div class="row"><button class="btn" id="new-folder">${icon.folder} Thư mục mới</button><a class="btn primary" href="/app/de/moi">${icon.plus} Tạo đề</a></div></div>
    <div class="row mb">
      <input type="search" id="s-text" placeholder="Tìm theo tên đề, môn, mã đề..." style="max-width:340px">
      <select id="s-status" style="width:auto"><option value="">Tất cả trạng thái</option><option value="published">Đang mở</option><option value="draft">Nháp</option><option value="closed">Đã đóng</option></select>
    </div>
    <div class="row mb" id="folders"></div>
    <div class="grid c3" id="list"></div>`);
  const renderFolders = () => {
    $('#folders', main).innerHTML = `<button class="btn sm ${filter.folder === '' ? 'primary' : ''}" data-f="">Tất cả</button>
      ${folders.map((f) => `<span class="row" style="gap:2px"><button class="btn sm ${filter.folder === f.id ? 'primary' : ''}" data-f="${f.id}">${icon.folder} ${esc(f.name)} <span class="muted">(${exams.filter((e) => e.folderId === f.id).length})</span></button>
        ${filter.folder === f.id ? `<button class="btn sm ghost icon" data-rf="${f.id}" title="Đổi tên">${icon.edit}</button><button class="btn sm ghost icon" data-df="${f.id}" title="Xoá thư mục">${icon.trash}</button>` : ''}</span>`).join('')}`;
  };
  const renderList = () => {
    const t = filter.text.toLowerCase();
    const list = exams.filter((e) => (!filter.folder || e.folderId === filter.folder) && (!filter.status || e.status === filter.status)
      && (!t || (e.title + ' ' + e.subject + ' ' + e.code).toLowerCase().includes(t)));
    $('#list', main).innerHTML = list.length ? list.map((e) => `<div class="card exam-card" data-id="${e.id}">
      <div class="row between"><span class="code-pill">${e.code}</span>${statusBadge(e.status)}</div>
      <h3>${esc(e.title)}</h3>
      <div class="meta"><span>${icon.list}${e.questionCount} câu</span><span>${icon.clock}${e.settings.duration ? e.settings.duration + ' phút' : 'Không giới hạn'}</span><span>${icon.users}${e.submissions} bài</span>${e.avg != null ? `<span>${icon.award}TB ${fmtNum(e.avg)}</span>` : ''}</div>
      <div class="row between small muted"><span>${esc(e.subject || '')}${e.grade ? ' · ' + esc(e.grade) : ''}</span><span>${fmtDate(e.updatedAt, false)}</span></div>
      <div class="row" style="gap:6px">
        <a class="btn sm" href="/app/de/${e.id}/sua" data-stop>${icon.edit} Sửa</a>
        <a class="btn sm" href="/app/de/${e.id}" data-stop>${icon.chart} Kết quả</a>
        <button class="btn sm ghost icon" data-more="${e.id}" title="Thêm">⋯</button>
      </div></div>`).join('') : `<div class="card empty" style="grid-column:1/-1">${icon.file}<p>Không có đề nào.</p><a class="btn primary" href="/app/de/moi">${icon.plus} Tạo đề</a></div>`;
  };
  renderFolders(); renderList();
  $('#s-text', main).oninput = (e) => { filter.text = e.target.value; renderList(); };
  $('#s-status', main).onchange = (e) => { filter.status = e.target.value; renderList(); };
  $('#new-folder', main).onclick = async () => {
    const name = await promptDialog('Thư mục mới', { label: 'Tên thư mục', placeholder: 'VD: Toán 12 - Học kỳ I' });
    if (!name) return;
    const r = await api('POST', '/api/folders', { name });
    folders.push(r.folder); renderFolders();
  };
  $('#folders', main).onclick = async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter.folder = f.dataset.f; renderFolders(); renderList(); return; }
    const rf = e.target.closest('[data-rf]');
    if (rf) {
      const fo = folders.find((x) => x.id === rf.dataset.rf);
      const name = await promptDialog('Đổi tên thư mục', { value: fo.name });
      if (!name) return;
      await api('PUT', '/api/folders/' + fo.id, { name }); fo.name = name; renderFolders();
      return;
    }
    const df = e.target.closest('[data-df]');
    if (df && await confirmDialog('Xoá thư mục? Các đề bên trong sẽ không bị xoá.', { danger: true, ok: 'Xoá' })) {
      await api('DELETE', '/api/folders/' + df.dataset.df);
      folders.splice(folders.findIndex((x) => x.id === df.dataset.df), 1);
      exams.forEach((x) => { if (x.folderId === df.dataset.df) x.folderId = null; });
      filter.folder = ''; renderFolders(); renderList();
    }
  };
  $('#list', main).onclick = async (e) => {
    if (e.target.closest('[data-stop]')) return;
    const more = e.target.closest('[data-more]');
    if (more) {
      const ex = exams.find((x) => x.id === more.dataset.more);
      const m = modal({
        title: ex.title,
        body: `<div class="col">
          <button class="btn" data-a="dup">${icon.copy} Nhân bản đề</button>
          <button class="btn" data-a="print">${icon.print} In đề / Xuất nhiều mã đề</button>
          <label class="field">Chuyển vào thư mục<select data-a="move"><option value="">— Không có thư mục —</option>${folders.map((f) => `<option value="${f.id}" ${ex.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
          <button class="btn danger" data-a="del">${icon.trash} Xoá đề</button></div>`,
      });
      m.body.onclick = async (ev) => {
        const a = ev.target.closest('button[data-a]');
        if (!a) return;
        if (a.dataset.a === 'dup') { const r = await api('POST', `/api/exams/${ex.id}/duplicate`); m.close(); toast('Đã nhân bản', 'ok'); navigate(`/app/de/${r.exam.id}/sua`); }
        if (a.dataset.a === 'print') { m.close(); navigate(`/app/de/${ex.id}/in`); }
        if (a.dataset.a === 'del') {
          m.close();
          if (await confirmDialog(`Xoá đề "<b>${esc(ex.title)}</b>" và toàn bộ ${ex.submissions} bài làm? Không thể hoàn tác.`, { danger: true, ok: 'Xoá đề' })) {
            await api('DELETE', '/api/exams/' + ex.id);
            exams.splice(exams.indexOf(ex), 1); renderList(); renderFolders(); toast('Đã xoá đề');
          }
        }
      };
      $('select[data-a=move]', m.body).onchange = async (ev) => {
        await api('PUT', '/api/exams/' + ex.id, { folderId: ev.target.value || null });
        ex.folderId = ev.target.value || null; renderFolders(); renderList(); toast('Đã chuyển thư mục', 'ok');
      };
      return;
    }
    const card = e.target.closest('.exam-card');
    if (card) navigate('/app/de/' + card.dataset.id);
  };
}

// ================= Tạo đề =================
let draft = null; // dữ liệu tách từ file, chờ mở trình soạn
export function createExam() {
  const main = shell('exams', `
    <div class="page-head"><div><h1>Tạo đề mới</h1><p class="muted">Chọn cách tạo câu hỏi</p></div></div>
    <div class="choice-cards">
      <button class="choice-card active" data-m="file">${icon.upload}<h3>Tải file Word / PDF</h3><p class="small muted" style="margin:0">Tự động tách câu hỏi và đáp án từ .docx, .doc, .pdf</p></button>
      <button class="choice-card" data-m="text">${icon.type}<h3>Dán văn bản</h3><p class="small muted" style="margin:0">Dán nội dung đề, hệ thống tự tách câu</p></button>
      <button class="choice-card" data-m="blank">${icon.edit}<h3>Soạn thủ công</h3><p class="small muted" style="margin:0">Tự nhập từng câu hỏi trong trình soạn thảo</p></button>
    </div>
    <div class="card mt" id="pane"></div>
    <div class="card mt">${guideHtml()}</div>`);
  const pane = $('#pane', main);
  const show = (m) => {
    $$('.choice-card', main).forEach((c) => c.classList.toggle('active', c.dataset.m === m));
    if (m === 'file') {
      pane.innerHTML = `<label class="dropzone" id="dz">${icon.upload}<h3 class="mt-s">Kéo thả file vào đây hoặc bấm để chọn</h3>
        <p class="muted small" style="margin:0">Hỗ trợ .docx, .doc, .pdf, .txt — tối đa 40MB</p><input type="file" id="file" accept=".docx,.doc,.pdf,.txt,.docm" hidden></label>
        <div id="parse-state" class="mt"></div>`;
      const dz = $('#dz', pane), fi = $('#file', pane);
      fi.onchange = () => fi.files[0] && parseFile(fi.files[0]);
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]); };
    } else if (m === 'text') {
      pane.innerHTML = `<label class="field">Nội dung đề<textarea id="txt" rows="14" placeholder="Câu 1. Thủ đô của Việt Nam là&#10;A. Huế&#10;*B. Hà Nội&#10;C. Đà Nẵng&#10;D. Cần Thơ&#10;&#10;Câu 2. ..."></textarea></label>
        <p class="hint">Đánh dấu đáp án đúng bằng dấu <b>*</b> trước chữ cái, hoặc thêm dòng <b>Đáp án: B</b>. Công thức viết trong <b>$...$</b> (LaTeX).</p>
        <button class="btn primary mt-s" id="go">${icon.sparkle} Tách câu hỏi</button><div id="parse-state" class="mt"></div>`;
      $('#go', pane).onclick = async () => {
        const text = $('#txt', pane).value;
        if (!text.trim()) return toast('Chưa có nội dung', 'error');
        await doParse(() => api('POST', '/api/parse', { text }), 'Đề dán văn bản');
      };
    } else {
      pane.innerHTML = `<p>Bắt đầu với một đề trống và thêm câu hỏi thủ công.</p><button class="btn primary" id="go">${icon.plus} Mở trình soạn đề</button>`;
      $('#go', pane).onclick = () => {
        draft = { title: '', questions: [newQuestion('mc')], parts: [], meta: {}, warnings: [] };
        navigate('/app/de/soan');
      };
    }
  };
  $$('.choice-card', main).forEach((c) => { c.onclick = () => show(c.dataset.m); });
  show('file');

  async function parseFile(f) {
    const fd = new FormData();
    fd.append('file', f);
    await doParse(() => api('POST', '/api/parse', fd), f.name.replace(/\.[^.]+$/, ''));
  }
  async function doParse(fn, fallbackTitle) {
    const ps = $('#parse-state', pane);
    ps.innerHTML = '<div class="row"><div class="spinner"></div><span>Đang đọc file và tách câu hỏi...</span></div>';
    try {
      const r = await fn();
      if (!r.questions.length) {
        ps.innerHTML = `<div class="alert error">${icon.alert}<div>${r.warnings.map(esc).join('<br>')}<br>Xem hướng dẫn định dạng bên dưới.</div></div>`;
        return;
      }
      draft = { title: r.meta.title || fallbackTitle, subject: r.meta.subject || '', duration: r.meta.duration, questions: r.questions, parts: r.parts, warnings: r.warnings };
      navigate('/app/de/soan');
    } catch (e) { ps.innerHTML = `<div class="alert error">${icon.alert}<div>${esc(e.message)}</div></div>`; }
  }
}

function guideHtml() {
  return `<h3>Hướng dẫn định dạng file để tách câu chính xác</h3>
  <div class="grid c2 mt-s">
    <div class="guide"><b>1. Câu hỏi</b> bắt đầu bằng <code>Câu 1.</code> <code>Câu 2:</code> (hoặc <code>1.</code> <code>2)</code>). Phương án bắt đầu bằng <code>A.</code> <code>B.</code> <code>C.</code> <code>D.</code> — có thể nằm cùng dòng hoặc mỗi phương án một dòng.
      <pre>Câu 1. Đơn vị của lực là
A. kg.    B. N.    C. J.    D. W.</pre></div>
    <div class="guide"><b>2. Đánh dấu đáp án đúng</b> bằng một trong các cách: <u>gạch chân</u>, <span style="color:#d00">tô màu đỏ</span>, <b>in đậm</b>, tô sáng chữ cái đáp án; dấu <code>*</code> trước chữ cái (<code>*B.</code>); dòng <code>Đáp án: B</code> / <code>Chọn B</code> sau câu; hoặc <b>bảng đáp án</b> ở cuối đề.</div>
    <div class="guide"><b>3. Đề theo cấu trúc mới (2025)</b>: dùng tiêu đề <code>PHẦN I</code>, <code>PHẦN II</code>, <code>PHẦN III</code>. Câu đúng/sai dùng ý <code>a)</code> <code>b)</code> <code>c)</code> <code>d)</code>, đánh dấu các ý đúng. Câu trả lời ngắn thêm dòng <code>Đáp án: 12,5</code>.</div>
    <div class="guide"><b>4. Lời giải</b>: viết sau dòng <code>Lời giải:</code> hoặc <code>Hướng dẫn giải</code> — sẽ được ẩn khi làm bài và hiện khi xem lại. Hình ảnh và công thức (Equation, MathType) được giữ nguyên.</div>
  </div>`;
}

function newQuestion(type = 'mc', part = 0) {
  const n = type === 'tf' ? 4 : 4;
  return {
    id: uid(), type, part, content: '', points: type === 'tf' ? 1 : 0.25, explanation: '',
    options: type === 'short' || type === 'essay' ? [] : Array.from({ length: n }, (_, i) => ({ id: uid(), label: type === 'tf' ? TFL[i] : OPT[i], html: '' })),
    answer: type === 'tf' ? [false, false, false, false] : null,
  };
}

// ================= Trình soạn đề =================
export async function editor(examId) {
  let exam;
  let isNew = false;
  if (examId) {
    loading('exams');
    exam = (await api('GET', '/api/exams/' + examId)).exam;
  } else {
    if (!draft) { navigate('/app/de/moi', { replace: true }); return; }
    isNew = true;
    exam = {
      title: draft.title || '', subject: draft.subject || '', grade: '', description: '', parts: draft.parts || [], questions: draft.questions,
      settings: { duration: draft.duration || 45, shuffleQuestions: false, shuffleOptions: false, maxAttempts: 1, showScore: true, showReview: 'after_submit', showExplanation: true, detectTab: true, maxTabSwitches: 0, blockCopy: true, identity: 'free', requireClass: true, requireCode: false, tfScoring: 'bgd', scaleTo10: false, password: '' },
      classIds: [], status: 'draft', folderId: query().folder || null,
    };
  }
  const warnings = isNew ? draft.warnings || [] : [];
  draft = null;
  const [{ classes }, { folders }] = await Promise.all([api('GET', '/api/classes'), api('GET', '/api/folders')]);
  const Q = exam.questions;
  let dirty = isNew;
  let tab = 'q';
  const markDirty = () => { dirty = true; const s = $('#dirty-state'); if (s) s.textContent = '• Chưa lưu'; };

  const main = shell('exams', `
    <div class="editor-bar">
      <div class="row">
        <input type="text" id="e-title" value="${esc(exam.title)}" placeholder="Tên đề, VD: Kiểm tra 15 phút - Vật lí 10" style="font-size:17px;font-weight:700;flex:1;min-width:220px">
        <span class="small muted" id="dirty-state">${dirty ? '• Chưa lưu' : ''}</span>
        <button class="btn" id="preview">${icon.eye} Xem trước</button>
        <button class="btn" id="save">${icon.check} Lưu</button>
        <button class="btn primary" id="publish">${icon.send} ${exam.status === 'published' ? 'Lưu & cập nhật' : 'Lưu & giao bài'}</button>
      </div>
      <div class="tabs" style="margin:12px 0 0;border:0">
        <button data-tab="q" class="active">Câu hỏi (<span id="qcount">${Q.length}</span>)</button>
        <button data-tab="s">Cài đặt làm bài</button>
        <button data-tab="c">Thông tin & giao lớp</button>
      </div>
    </div>
    ${warnings.length ? `<div class="alert warn mb">${icon.alert}<div>${warnings.map(esc).join('<br>')}</div></div>` : ''}
    <div id="tab-q"></div><div id="tab-s" class="hidden"></div><div id="tab-c" class="hidden"></div>`);

  setLeaveGuard(() => !dirty || confirm('Đề có thay đổi chưa lưu. Rời trang?'));
  window.onbeforeunload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  $('#e-title').oninput = (e) => { exam.title = e.target.value; markDirty(); };
  $$('.tabs button[data-tab]', main).forEach((b) => {
    b.onclick = () => {
      tab = b.dataset.tab;
      $$('.tabs button[data-tab]', main).forEach((x) => x.classList.toggle('active', x === b));
      ['q', 's', 'c'].forEach((t) => $('#tab-' + t).classList.toggle('hidden', t !== tab));
    };
  });

  // ---------- Tab câu hỏi ----------
  const tq = $('#tab-q');
  tq.innerHTML = `<div class="editor-layout">
    <aside class="editor-side"><div class="card" style="padding:14px">
      <div class="row between"><b>Danh sách câu</b><span class="small muted" id="total-pts"></span></div>
      <div class="qnav mt-s" id="qnav"></div>
      <div class="small muted mt-s" id="issue-sum"></div>
      <div class="col mt" style="gap:6px">
        <button class="btn sm" id="add-q">${icon.plus} Thêm câu hỏi</button>
        <button class="btn sm" id="import-q">${icon.book} Lấy câu từ đề khác</button>
        <button class="btn sm" id="add-file">${icon.upload} Thêm câu từ file</button>
        <button class="btn sm" id="pts-even">Chia đều thang 10</button>
        <button class="btn sm" id="pts-2025">Điểm theo cấu trúc 2025</button>
        <button class="btn sm" id="parts-btn">${icon.layers} Quản lý phần</button>
      </div></div></aside>
    <div>
      <div class="card" style="padding:8px 12px;margin-bottom:12px;position:sticky;top:178px;z-index:20">
        <div class="toolbar" id="tb">
          <button data-cmd="bold" title="In đậm"><b>B</b></button><button data-cmd="italic" title="In nghiêng"><i>I</i></button>
          <button data-cmd="underline" title="Gạch chân"><u>U</u></button><button data-cmd="superscript" title="Chỉ số trên">x²</button>
          <button data-cmd="subscript" title="Chỉ số dưới">x₂</button><button data-cmd="image" title="Chèn ảnh">🖼 Ảnh</button>
          <button data-cmd="math" title="Chèn công thức">∑ Công thức</button><button data-cmd="removeFormat" title="Xoá định dạng">⌫ Xoá định dạng</button>
          <span class="small muted" style="margin-left:auto;align-self:center">Bấm vào nội dung để sửa trực tiếp</span>
        </div>
      </div>
      <div id="qlist"></div>
      <button class="btn block" id="add-q2" style="border-style:dashed">${icon.plus} Thêm câu hỏi</button>
    </div></div>`;

  const issuesOf = (q) => {
    const is = [];
    const hasContent = (h) => !!(plainText(h).trim() || /<img|class="math/.test(h || ''));
    if (!hasContent(q.content) && !(q.options || []).some((o) => hasContent(o.html))) is.push('Thiếu nội dung');
    if (q.type === 'mc' || q.type === 'multi' || q.type === 'tf') {
      if (q.options.length < 2) is.push('Cần ít nhất 2 phương án');
      if (q.options.some((o) => !hasContent(o.html))) is.push('Có phương án trống');
    }
    if ((q.type === 'mc' || q.type === 'multi') && !(Array.isArray(q.answer) && q.answer.length)) is.push('Chưa chọn đáp án');
    if (q.type === 'tf' && !Array.isArray(q.answer)) is.push('Chưa có đáp án');
    if (q.type === 'short' && !(q.answer && String(q.answer).trim())) is.push('Chưa có đáp án');
    if (!(Number(q.points) > 0)) is.push('Điểm = 0');
    return is;
  };

  const partOpts = (q) => exam.parts.length ? `<select data-k="part" title="Phần">${['<option value="0">Không thuộc phần</option>', ...exam.parts.map((p) => `<option value="${p.index}" ${q.part === p.index ? 'selected' : ''}>Phần ${p.index}</option>`)].join('')}</select>` : '';

  function cardHtml(q, i) {
    const iss = issuesOf(q);
    let ans = '';
    if (q.type === 'mc' || q.type === 'multi') {
      const sel = Array.isArray(q.answer) ? q.answer : [];
      ans = q.options.map((o, k) => `<div class="opt-row ${sel.includes(k) ? 'correct' : ''}">
        <button class="opt-key ${sel.includes(k) ? 'on' : ''}" data-ans="${k}" title="Chọn làm đáp án đúng">${OPT[k]}</button>
        <div class="rich" contenteditable="true" data-f="opt" data-k="${k}" data-ph="Nội dung phương án ${OPT[k]}">${o.html}</div>
        <button class="btn ghost icon sm" data-delopt="${k}" title="Xoá phương án">${icon.x}</button></div>`).join('')
        + `<div class="row mt-s"><button class="btn sm ghost" data-addopt>${icon.plus} Thêm phương án</button><span class="hint">Bấm vào chữ cái để chọn đáp án đúng${q.type === 'multi' ? ' (chọn được nhiều)' : ''}.</span></div>`;
    } else if (q.type === 'tf') {
      const a = Array.isArray(q.answer) ? q.answer : [];
      ans = q.options.map((o, k) => `<div class="opt-row"><b style="width:26px;padding-top:9px">${TFL[k]})</b>
        <div class="rich" contenteditable="true" data-f="opt" data-k="${k}" data-ph="Nội dung ý ${TFL[k]}">${o.html}</div>
        <div class="tf-toggle"><button class="t ${a[k] === true ? 'on' : ''}" data-tf="${k}" data-v="1">Đúng</button><button class="f ${a[k] === false ? 'on' : ''}" data-tf="${k}" data-v="0">Sai</button></div>
        <button class="btn ghost icon sm" data-delopt="${k}" title="Xoá ý">${icon.x}</button></div>`).join('')
        + `<div class="row mt-s"><button class="btn sm ghost" data-addopt>${icon.plus} Thêm ý</button><span class="hint">Chấm theo: ${exam.settings.tfScoring === 'bgd' ? 'thang Bộ GD (1 ý 10%, 2 ý 25%, 3 ý 50%, 4 ý 100%)' : exam.settings.tfScoring === 'all' ? 'đúng hết mới có điểm' : 'tỉ lệ số ý đúng'}</span></div>`;
    } else if (q.type === 'short') {
      ans = `<label class="field" style="max-width:420px">Đáp án đúng<input type="text" data-short value="${esc(q.answer || '')}" placeholder="VD: 12,5 (nhiều đáp án chấp nhận: 0,5; 1/2)"></label>
        <p class="hint">Chấm tự động: không phân biệt hoa thường, dấu phẩy/chấm thập phân; số được so sánh theo giá trị (0,50 = 0.5 = 1/2).</p>`;
    } else {
      ans = '<p class="hint">Câu tự luận: học sinh nhập bài làm (và có thể chụp ảnh tải lên). Giáo viên chấm điểm trong trang kết quả.</p>';
    }
    return `<div class="qcard ${iss.length ? 'has-issue' : ''}" id="qc-${q.id}" data-i="${i}">
      <div class="qcard-head">
        <span class="qno">Câu ${i + 1}</span>
        <select data-k="type">${Object.entries(TYPE_NAME).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${partOpts(q)}
        <label class="small row" style="gap:4px">Điểm <input class="pts" type="number" step="0.05" min="0" data-k="points" value="${q.points}"></label>
        <span class="grow"></span>
        <button class="btn ghost icon sm" data-act="up" title="Lên">${icon.up}</button>
        <button class="btn ghost icon sm" data-act="down" title="Xuống">${icon.down}</button>
        <button class="btn ghost icon sm" data-act="dup" title="Nhân bản">${icon.copy}</button>
        <button class="btn ghost icon sm" data-act="del" title="Xoá câu">${icon.trash}</button>
      </div>
      <div class="qcard-body">
        ${iss.length ? `<div class="issue-list">${iss.map((x) => `<span class="badge red">${icon.alert} ${x}</span>`).join('')}</div>` : ''}
        <div class="rich" contenteditable="true" data-f="content" data-ph="Nhập nội dung câu hỏi...">${q.content}</div>
        ${q.type !== 'essay' && q.type !== 'short' ? `<div class="section-label">${q.type === 'tf' ? 'Các ý (đánh dấu Đúng/Sai)' : 'Phương án'}</div>` : ''}
        ${ans}
        <details class="mt-s" ${q.explanation ? 'open' : ''}><summary class="small muted" style="cursor:pointer">Lời giải / giải thích (hiện khi học sinh xem lại)</summary>
          <div class="rich mt-s" contenteditable="true" data-f="expl" data-ph="Nhập lời giải..." style="border-color:var(--line)">${q.explanation || ''}</div></details>
      </div></div>`;
  }

  function renderAll() {
    let lastPart = null;
    $('#qlist').innerHTML = Q.map((q, i) => {
      let head = '';
      if (exam.parts.length && q.part && q.part !== lastPart) { const p = exam.parts.find((x) => x.index === q.part); head = `<div class="part-head">${esc(p ? p.title : 'Phần ' + q.part)}</div>`; lastPart = q.part; }
      return head + cardHtml(q, i);
    }).join('');
    renderMath($('#qlist'), { editable: true });
    renderNav();
  }
  function renderCard(i) {
    const node = $('#qc-' + Q[i].id);
    if (!node) return renderAll();
    node.outerHTML = cardHtml(Q[i], i);
    renderMath($('#qc-' + Q[i].id), { editable: true });
    renderNav();
  }
  function renderNav() {
    $('#qnav').innerHTML = Q.map((q, i) => `<button class="${issuesOf(q).length ? 'bad' : 'ok'}" data-go="${q.id}" title="${esc(issuesOf(q).join(', '))}">${i + 1}</button>`).join('');
    const bad = Q.filter((q) => issuesOf(q).length).length;
    $('#issue-sum').innerHTML = bad ? `<span style="color:var(--danger)">${bad} câu cần kiểm tra</span>` : '<span style="color:var(--ok)">Tất cả câu hợp lệ ✓</span>';
    $('#total-pts').textContent = `Tổng ${fmtNum(Q.reduce((s, q) => s + (Number(q.points) || 0), 0))} điểm`;
    $('#qcount').textContent = Q.length;
  }
  const refreshIssues = debounce2((i) => {
    const node = $('#qc-' + Q[i].id);
    if (!node) return;
    const iss = issuesOf(Q[i]);
    node.classList.toggle('has-issue', !!iss.length);
    let list = $('.issue-list', node);
    if (!iss.length && list) list.remove();
    if (iss.length) {
      if (!list) { list = el('<div class="issue-list"></div>'); $('.qcard-body', node).prepend(list); }
      list.innerHTML = iss.map((x) => `<span class="badge red">${icon.alert} ${x}</span>`).join('');
    }
    renderNav();
  }, 400);
  renderAll();

  const qlist = $('#qlist');
  let lastRich = null, lastRange = null;
  document.addEventListener('selectionchange', saveSel);
  function saveSel() {
    const s = window.getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    const rich = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest?.('.rich');
    if (rich && qlist.contains(rich)) { lastRich = rich; lastRange = r.cloneRange(); }
  }
  onLeave(() => document.removeEventListener('selectionchange', saveSel));

  const syncRich = (rich) => {
    const card = rich.closest('.qcard');
    const i = +card.dataset.i;
    const q = Q[i];
    const h = cleanEditableHtml(rich);
    if (rich.dataset.f === 'content') q.content = h;
    else if (rich.dataset.f === 'expl') q.explanation = h;
    else q.options[+rich.dataset.k].html = h;
    markDirty();
    refreshIssues(i);
  };
  qlist.addEventListener('input', (e) => {
    const rich = e.target.closest('.rich');
    if (rich) return syncRich(rich);
    const card = e.target.closest('.qcard');
    if (!card) return;
    const q = Q[+card.dataset.i];
    if (e.target.matches('[data-short]')) { q.answer = e.target.value; markDirty(); refreshIssues(+card.dataset.i); }
    if (e.target.matches('[data-k=points]')) { q.points = parseFloat(e.target.value) || 0; markDirty(); refreshIssues(+card.dataset.i); }
  });
  qlist.addEventListener('focusout', (e) => {
    const rich = e.target.closest && e.target.closest('.rich');
    if (!rich) return;
    // chuyển $...$ thành công thức
    if (/\$[^$]+\$/.test(rich.textContent)) {
      const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        if (!/\$[^$]+\$/.test(n.nodeValue) || n.parentElement.closest('span.math')) continue;
        const frag = document.createDocumentFragment();
        let last = 0;
        n.nodeValue.replace(/\$([^$]+)\$/g, (m, tex, off) => {
          frag.appendChild(document.createTextNode(n.nodeValue.slice(last, off)));
          const sp = document.createElement('span'); sp.className = 'math'; sp.setAttribute('data-latex', tex.trim());
          frag.appendChild(sp); last = off + m.length; return m;
        });
        frag.appendChild(document.createTextNode(n.nodeValue.slice(last)));
        n.parentNode.replaceChild(frag, n);
      }
      renderMath(rich, { editable: true });
      syncRich(rich);
    }
  });
  qlist.addEventListener('paste', async (e) => {
    const rich = e.target.closest('.rich');
    if (!rich) return;
    const items = Array.from(e.clipboardData.items || []);
    const img = items.find((it) => it.type.startsWith('image/'));
    e.preventDefault();
    if (img) {
      const url = await uploadImage(img.getAsFile());
      if (url) { document.execCommand('insertHTML', false, `<img src="${esc(url)}">`); syncRich(rich); }
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  qlist.addEventListener('change', (e) => {
    const card = e.target.closest('.qcard');
    if (!card) return;
    const i = +card.dataset.i, q = Q[i];
    if (e.target.matches('[data-k=type]')) { changeType(q, e.target.value); markDirty(); renderCard(i); }
    if (e.target.matches('[data-k=part]')) { q.part = +e.target.value; markDirty(); sortByPart(); renderAll(); }
  });
  qlist.addEventListener('click', async (e) => {
    const mathEl = e.target.closest('.rich span.math');
    if (mathEl) { editMath(mathEl); return; }
    const card = e.target.closest('.qcard');
    if (!card) return;
    const i = +card.dataset.i, q = Q[i];
    const a = e.target.closest('[data-ans]');
    if (a) {
      const k = +a.dataset.ans;
      let cur = Array.isArray(q.answer) ? [...q.answer] : [];
      if (q.type === 'multi') cur = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].sort();
      else cur = cur.includes(k) ? [] : [k];
      q.answer = cur.length ? cur : null;
      markDirty(); renderCard(i); return;
    }
    const tf = e.target.closest('[data-tf]');
    if (tf) {
      const ans = Array.isArray(q.answer) ? [...q.answer] : q.options.map(() => false);
      ans[+tf.dataset.tf] = tf.dataset.v === '1';
      q.answer = ans; markDirty(); renderCard(i); return;
    }
    if (e.target.closest('[data-addopt]')) {
      if (q.options.length >= 10) return;
      q.options.push({ id: uid(), label: '', html: '' });
      if (q.type === 'tf') q.answer = [...(q.answer || []), false];
      markDirty(); renderCard(i); return;
    }
    const d = e.target.closest('[data-delopt]');
    if (d) {
      const k = +d.dataset.delopt;
      q.options.splice(k, 1);
      if (q.type === 'tf' && Array.isArray(q.answer)) q.answer.splice(k, 1);
      else if (Array.isArray(q.answer)) { q.answer = q.answer.filter((x) => x !== k).map((x) => (x > k ? x - 1 : x)); if (!q.answer.length) q.answer = null; }
      markDirty(); renderCard(i); return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const t = act.dataset.act;
      if (t === 'up' && i > 0) { [Q[i - 1], Q[i]] = [Q[i], Q[i - 1]]; }
      if (t === 'down' && i < Q.length - 1) { [Q[i + 1], Q[i]] = [Q[i], Q[i + 1]]; }
      if (t === 'dup') { const c = JSON.parse(JSON.stringify(q)); c.id = uid(); c.options.forEach((o) => { o.id = uid(); }); Q.splice(i + 1, 0, c); }
      if (t === 'del') { if (!(await confirmDialog(`Xoá câu ${i + 1}?`, { danger: true, ok: 'Xoá' }))) return; Q.splice(i, 1); }
      markDirty(); renderAll();
      if (t === 'up' || t === 'down' || t === 'dup') { const n = $('#qc-' + (t === 'dup' ? Q[i + 1].id : q.id)); if (n) n.scrollIntoView({ block: 'center' }); }
    }
  });
  $('#qnav').onclick = (e) => { const b = e.target.closest('[data-go]'); if (b) $('#qc-' + b.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  function changeType(q, t) {
    const old = q.type;
    q.type = t;
    if ((t === 'mc' || t === 'multi' || t === 'tf') && q.options.length < 2) q.options = Array.from({ length: 4 }, (_, k) => ({ id: uid(), label: '', html: (q.options[k] && q.options[k].html) || '' }));
    if (t === 'tf') q.answer = (old === 'mc' || old === 'multi') && Array.isArray(q.answer) ? q.options.map((_, k) => q.answer.includes(k)) : (Array.isArray(q.answer) && typeof q.answer[0] === 'boolean' ? q.answer : q.options.map(() => false));
    else if (t === 'mc' || t === 'multi') {
      if (old === 'tf' && Array.isArray(q.answer)) { const a = q.answer.map((v, k) => (v ? k : -1)).filter((k) => k >= 0); q.answer = a.length ? (t === 'mc' ? [a[0]] : a) : null; }
      else if (old === 'short' || old === 'essay') q.answer = null;
      else if (t === 'mc' && Array.isArray(q.answer) && q.answer.length > 1) q.answer = [q.answer[0]];
    } else if (t === 'short') q.answer = typeof q.answer === 'string' ? q.answer : '';
    else q.answer = null;
    if (t === 'tf' && old !== 'tf' && (!q.points || q.points === 0.25)) q.points = 1;
  }
  function sortByPart() {
    if (!exam.parts.length) return;
    const order = [0, ...exam.parts.map((p) => p.index)];
    const sorted = [...Q].sort((a, b) => order.indexOf(a.part || 0) - order.indexOf(b.part || 0));
    Q.splice(0, Q.length, ...sorted);
  }

  // Toolbar
  $('#tb').addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  $('#tb').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    if (!lastRich || !document.body.contains(lastRich)) return toast('Bấm vào ô nội dung cần định dạng trước', 'error');
    const restore = () => { lastRich.focus(); if (lastRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(lastRange); } };
    const cmd = b.dataset.cmd;
    if (cmd === 'image') {
      const inp = el('<input type="file" accept="image/*">');
      inp.onchange = async () => {
        const url = await uploadImage(inp.files[0]);
        if (!url) return;
        restore(); document.execCommand('insertHTML', false, `<img src="${esc(url)}">`); syncRich(lastRich);
      };
      inp.click();
      return;
    }
    if (cmd === 'math') {
      const rich = lastRich, range = lastRange;
      const tex = await mathDialog('');
      if (!tex) return;
      lastRich = rich; lastRange = range; restore();
      document.execCommand('insertHTML', false, `<span class="math" data-latex="${esc(tex)}"></span>&nbsp;`);
      renderMath(rich, { editable: true }); syncRich(rich);
      return;
    }
    restore();
    document.execCommand(cmd, false, null);
    syncRich(lastRich);
  });
  async function editMath(span) {
    const tex = await mathDialog(span.getAttribute('data-latex') || '', true);
    if (tex === null) return;
    const rich = span.closest('.rich');
    if (tex === '') span.remove(); else { span.setAttribute('data-latex', tex); renderMath(span, { editable: true }); }
    syncRich(rich);
  }
  function mathDialog(value, editing) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: editing ? 'Sửa công thức' : 'Chèn công thức', wide: false,
        body: `<label class="field">Công thức LaTeX<textarea id="tex" rows="3" placeholder="VD: \\frac{a}{b}, x^2, \\sqrt{x}, \\int_0^1 f(x)dx">${esc(value)}</textarea></label>
          <div class="small muted mt-s">Xem trước:</div><div id="tex-prev" style="min-height:44px;padding:10px;border:1px solid var(--line);border-radius:8px;margin-top:4px;text-align:center"></div>
          <div class="row mt-s" style="gap:4px">${['\\frac{a}{b}', 'x^{2}', 'x_{1}', '\\sqrt{x}', '\\sqrt[3]{x}', '\\le', '\\ge', '\\ne', '\\pm', '\\infty', '\\pi', '\\alpha', '\\Delta', '\\int_{a}^{b}', '\\sum_{i=1}^{n}', '\\lim_{x \\to 0}', '\\vec{AB}', '\\overline{AB}', '\\begin{cases} x \\\\ y \\end{cases}'].map((s) => `<button class="btn sm" data-ins="${esc(s)}">${esc(s.length > 14 ? s.slice(0, 12) + '…' : s)}</button>`).join('')}</div>`,
        actions: [...(editing ? [{ label: 'Xoá công thức', cls: 'danger', onClick: () => { done = true; resolve(''); } }] : []), { label: 'Huỷ' }, { label: editing ? 'Cập nhật' : 'Chèn', cls: 'primary', onClick: ({ body }) => { done = true; resolve($('#tex', body).value.trim()); } }],
        onClose: () => { if (!done) resolve(null); },
      });
      const ta = $('#tex', m.body), pv = $('#tex-prev', m.body);
      const upd = () => { pv.innerHTML = `<span class="math" data-latex="${esc(ta.value)}"></span>`; renderMath(pv); };
      ta.oninput = upd; upd();
      m.body.addEventListener('click', (e) => { const b = e.target.closest('[data-ins]'); if (b) { const s = ta.selectionStart; ta.value = ta.value.slice(0, s) + b.dataset.ins + ta.value.slice(ta.selectionEnd); ta.focus(); upd(); } });
    });
  }

  const addQ = () => {
    const last = Q[Q.length - 1];
    const q = newQuestion(last ? last.type : 'mc', last ? last.part : 0);
    if (last) q.points = last.points;
    Q.push(q); markDirty(); renderAll();
    $('#qc-' + q.id).scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => $('#qc-' + q.id + ' .rich').focus(), 300);
  };
  $('#add-q').onclick = addQ; $('#add-q2').onclick = addQ;
  $('#pts-even').onclick = () => {
    const n = Q.length; if (!n) return;
    const each = Math.floor((10 / n) * 1000) / 1000;
    Q.forEach((q) => { q.points = each; });
    const rest = Math.round((10 - each * n) * 1000) / 1000;
    if (rest > 0) Q[n - 1].points = Math.round((each + rest) * 1000) / 1000;
    markDirty(); renderAll(); toast('Đã chia đều 10 điểm', 'ok');
  };
  $('#pts-2025').onclick = () => {
    const math = /toán/i.test(exam.subject || '');
    Q.forEach((q) => { q.points = q.type === 'tf' ? 1 : q.type === 'short' ? (math ? 0.5 : 0.25) : q.type === 'essay' ? q.points || 1 : 0.25; });
    markDirty(); renderAll(); toast(`Đã đặt điểm: trắc nghiệm 0,25 · đúng/sai 1 · trả lời ngắn ${math ? '0,5' : '0,25'}`, 'ok');
  };
  $('#parts-btn').onclick = () => {
    const body = el(`<div><p class="small muted">Chia đề thành các phần (VD: Phần I – Trắc nghiệm, Phần II – Đúng/Sai). Khi đảo câu, câu chỉ đảo trong cùng phần.</p><div id="plist" class="col"></div><button class="btn sm mt-s" id="padd">${icon.plus} Thêm phần</button></div>`);
    const parts = JSON.parse(JSON.stringify(exam.parts));
    const draw = () => {
      $('#plist', body).innerHTML = parts.map((p, k) => `<div class="row"><b>Phần ${k + 1}</b><input type="text" data-pk="${k}" value="${esc(p.title)}" class="grow" style="flex:1"><button class="btn ghost icon sm" data-pd="${k}">${icon.trash}</button></div>`).join('') || '<p class="muted small">Chưa có phần nào.</p>';
    };
    draw();
    body.addEventListener('input', (e) => { if (e.target.dataset.pk) parts[+e.target.dataset.pk].title = e.target.value; });
    body.addEventListener('click', (e) => {
      if (e.target.closest('#padd')) { parts.push({ index: parts.length + 1, title: `PHẦN ${['I', 'II', 'III', 'IV', 'V', 'VI'][parts.length] || parts.length + 1}` }); draw(); }
      const d = e.target.closest('[data-pd]'); if (d) { parts.splice(+d.dataset.pd, 1); draw(); }
    });
    modal({
      title: 'Quản lý phần', body, actions: [{ label: 'Huỷ' }, {
        label: 'Áp dụng', cls: 'primary', onClick: () => {
          const map = {};
          parts.forEach((p, k) => { map[p.index] = k + 1; p.index = k + 1; });
          Q.forEach((q) => { q.part = map[q.part] || 0; });
          exam.parts = parts; markDirty(); sortByPart(); renderAll();
        },
      }],
    });
  };
  $('#import-q').onclick = () => importFromExam(exam, Q, () => { markDirty(); renderAll(); });
  $('#add-file').onclick = () => {
    const inp = el('<input type="file" accept=".docx,.doc,.pdf,.txt">');
    inp.onchange = async () => {
      const fd = new FormData(); fd.append('file', inp.files[0]);
      toast('Đang tách câu hỏi...');
      try {
        const r = await api('POST', '/api/parse', fd);
        if (!r.questions.length) return toast(r.warnings[0] || 'Không tìm thấy câu hỏi', 'error');
        r.questions.forEach((q) => { q.part = 0; });
        Q.push(...r.questions); markDirty(); renderAll(); toast(`Đã thêm ${r.questions.length} câu`, 'ok');
      } catch (e) { toast(e.message, 'error'); }
    };
    inp.click();
  };

  // ---------- Tab cài đặt ----------
  const S = exam.settings;
  $('#tab-s').innerHTML = `<div class="grid c2">
    <div class="card"><h3>Thời gian</h3><div class="col mt-s">
      <label class="field">Thời gian làm bài (phút, 0 = không giới hạn)<input type="number" min="0" max="600" data-s="duration" value="${S.duration}"></label>
      <label class="field">Mở đề lúc (bỏ trống = mở ngay)<input type="datetime-local" data-s="startAt" value="${toLocalInput(S.startAt)}"></label>
      <label class="field">Đóng đề lúc (bỏ trống = không đóng)<input type="datetime-local" data-s="endAt" value="${toLocalInput(S.endAt)}"></label>
      <label class="field">Số lượt làm tối đa mỗi học sinh (0 = không giới hạn)<input type="number" min="0" max="100" data-s="maxAttempts" value="${S.maxAttempts}"></label>
    </div></div>
    <div class="card"><h3>Bảo mật & chống gian lận</h3><div class="col mt-s">
      <label class="field">Mật khẩu vào đề (bỏ trống nếu không cần)<input type="text" data-s="password" value="${esc(S.password || '')}"></label>
      <label class="check"><input type="checkbox" data-s="shuffleQuestions" ${S.shuffleQuestions ? 'checked' : ''}><span>Đảo thứ tự câu hỏi <span class="hint">(mỗi học sinh một thứ tự, đảo trong từng phần)</span></span></label>
      <label class="check"><input type="checkbox" data-s="shuffleOptions" ${S.shuffleOptions ? 'checked' : ''}><span>Đảo thứ tự phương án A, B, C, D <span class="hint">(tự bỏ qua câu có "cả A và B", "tất cả đều đúng")</span></span></label>
      <label class="check"><input type="checkbox" data-s="detectTab" ${S.detectTab ? 'checked' : ''}><span>Phát hiện học sinh rời màn hình / chuyển tab</span></label>
      <label class="field">Tự động nộp khi rời màn hình quá (lần, 0 = chỉ cảnh báo)<input type="number" min="0" max="100" data-s="maxTabSwitches" value="${S.maxTabSwitches}"></label>
      <label class="check"><input type="checkbox" data-s="blockCopy" ${S.blockCopy ? 'checked' : ''}><span>Chặn sao chép, bôi đen, chuột phải</span></label>
    </div></div>
    <div class="card"><h3>Sau khi nộp bài</h3><div class="col mt-s">
      <label class="check"><input type="checkbox" data-s="showScore" ${S.showScore ? 'checked' : ''}><span>Cho học sinh xem điểm</span></label>
      <label class="field">Cho xem đáp án & bài làm<select data-s="showReview">
        <option value="after_submit" ${S.showReview === 'after_submit' ? 'selected' : ''}>Ngay sau khi nộp</option>
        <option value="after_close" ${S.showReview === 'after_close' ? 'selected' : ''}>Sau khi đề đóng</option>
        <option value="never" ${S.showReview === 'never' ? 'selected' : ''}>Không cho xem</option></select></label>
      <label class="check"><input type="checkbox" data-s="showExplanation" ${S.showExplanation ? 'checked' : ''}><span>Hiện lời giải khi xem lại</span></label>
    </div></div>
    <div class="card"><h3>Chấm điểm</h3><div class="col mt-s">
      <label class="field">Câu đúng/sai<select data-s="tfScoring">
        <option value="bgd" ${S.tfScoring === 'bgd' ? 'selected' : ''}>Thang Bộ GD: đúng 1 ý 10%, 2 ý 25%, 3 ý 50%, 4 ý 100%</option>
        <option value="ratio" ${S.tfScoring === 'ratio' ? 'selected' : ''}>Theo tỉ lệ số ý đúng</option>
        <option value="all" ${S.tfScoring === 'all' ? 'selected' : ''}>Đúng tất cả các ý mới có điểm</option></select></label>
      <label class="check"><input type="checkbox" data-s="scaleTo10" ${S.scaleTo10 ? 'checked' : ''}><span>Quy đổi điểm về thang 10 <span class="hint">(khi tổng điểm các câu khác 10)</span></span></label>
    </div></div>
  </div>`;
  $('#tab-s').addEventListener('input', (e) => {
    const k = e.target.dataset.s;
    if (!k) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.type === 'number') v = Number(v) || 0;
    if (e.target.type === 'datetime-local') v = v ? new Date(v).getTime() : null;
    S[k] = v;
    markDirty();
    if (k === 'tfScoring') renderAll();
  });

  // ---------- Tab thông tin & lớp ----------
  $('#tab-c').innerHTML = `<div class="grid c2">
    <div class="card"><h3>Thông tin đề</h3><div class="col mt-s">
      <div class="grid c2"><label class="field">Môn học<input type="text" data-i="subject" value="${esc(exam.subject || '')}" placeholder="VD: Toán"></label>
      <label class="field">Khối / lớp<input type="text" data-i="grade" value="${esc(exam.grade || '')}" placeholder="VD: 12"></label></div>
      <label class="field">Mô tả / lời dặn<textarea data-i="description" rows="3">${esc(exam.description || '')}</textarea></label>
      <label class="field">Thư mục<select data-i="folderId"><option value="">— Không có —</option>${folders.map((f) => `<option value="${f.id}" ${exam.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
    </div></div>
    <div class="card"><h3>Cách học sinh vào làm</h3><div class="col mt-s">
      <label class="check"><input type="radio" name="ident" value="free" ${S.identity !== 'roster' ? 'checked' : ''}><span><b>Tự nhập họ tên</b><br><span class="hint">Ai có mã đề / link đều làm được</span></span></label>
      <label class="check"><input type="radio" name="ident" value="roster" ${S.identity === 'roster' ? 'checked' : ''}><span><b>Chọn tên trong danh sách lớp</b><br><span class="hint">Chỉ học sinh trong các lớp được giao; theo dõi được ai chưa làm</span></span></label>
      <label class="check"><input type="checkbox" data-s2="requireClass" ${S.requireClass ? 'checked' : ''}><span>Bắt buộc nhập lớp (khi tự nhập tên)</span></label>
      <label class="check"><input type="checkbox" data-s2="requireCode" ${S.requireCode ? 'checked' : ''}><span>Bắt buộc nhập số báo danh / mã học sinh</span></label>
      <div class="section-label">Giao cho lớp</div>
      ${classes.length ? classes.map((c) => `<label class="check"><input type="checkbox" data-class="${c.id}" ${exam.classIds.includes(c.id) ? 'checked' : ''}><span>${esc(c.name)} <span class="hint">(${c.studentCount} HS)</span></span></label>`).join('') : `<p class="small muted">Chưa có lớp. <a href="/app/lop">Tạo lớp học</a> để giao bài theo danh sách.</p>`}
    </div></div></div>`;
  $('#tab-c').addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.i) { exam[t.dataset.i] = t.value || (t.dataset.i === 'folderId' ? null : ''); markDirty(); }
    if (t.name === 'ident') { S.identity = t.value; markDirty(); }
    if (t.dataset.s2) { S[t.dataset.s2] = t.checked; markDirty(); }
    if (t.dataset.class) { exam.classIds = $$('[data-class]', $('#tab-c')).filter((x) => x.checked).map((x) => x.dataset.class); markDirty(); }
  });

  // ---------- Lưu ----------
  async function save(publish) {
    if (!exam.title.trim()) { toast('Hãy đặt tên cho đề', 'error'); $('#e-title').focus(); return null; }
    const bad = Q.filter((q) => issuesOf(q).some((x) => x !== 'Điểm = 0' && x !== 'Có phương án trống'));
    if (publish) {
      if (!Q.length) { toast('Đề chưa có câu hỏi', 'error'); return null; }
      if (bad.length && !(await confirmDialog(`Có <b>${bad.length}</b> câu chưa hoàn chỉnh (thiếu đáp án hoặc nội dung): câu ${bad.slice(0, 15).map((q) => Q.indexOf(q) + 1).join(', ')}. Các câu thiếu đáp án sẽ không được chấm. Vẫn giao bài?`, { ok: 'Vẫn giao bài' }))) return null;
      if (S.identity === 'roster' && !exam.classIds.length) { toast('Chọn chế độ "danh sách lớp" thì cần giao cho ít nhất một lớp (tab Thông tin & giao lớp)', 'error'); return null; }
    }
    const body = {
      title: exam.title, subject: exam.subject, grade: exam.grade, description: exam.description, folderId: exam.folderId,
      questions: Q, parts: exam.parts, settings: S, classIds: exam.classIds,
      status: publish ? 'published' : exam.status,
    };
    const btns = ['#save', '#publish'].map((s) => $(s));
    btns.forEach((b) => { b.disabled = true; });
    try {
      const r = exam.id ? await api('PUT', '/api/exams/' + exam.id, body) : await api('POST', '/api/exams', body);
      dirty = false;
      $('#dirty-state').textContent = '✓ Đã lưu';
      Object.assign(exam, { id: r.exam.id, code: r.exam.code, status: r.exam.status });
      toast(publish ? 'Đã lưu và giao bài' : 'Đã lưu đề', 'ok');
      if (!examId) history.replaceState({}, '', `/app/de/${r.exam.id}/sua`);
      return r.exam;
    } catch (e) { toast(e.message, 'error'); return null; } finally { btns.forEach((b) => { b.disabled = false; }); }
  }
  $('#save').onclick = () => save(false);
  $('#publish').onclick = async () => { const r = await save(true); if (r) navigate('/app/de/' + r.id); };
  $('#preview').onclick = () => previewExam(exam, Q);
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(false); } };
  document.addEventListener('keydown', onKey);
  onLeave(() => { document.removeEventListener('keydown', onKey); document.removeEventListener('selectionchange', saveSel); });
}

function debounce2(fn, ms) { const t = {}; return (i) => { clearTimeout(t[i]); t[i] = setTimeout(() => fn(i), ms); }; }

async function uploadImage(file) {
  if (!file) return null;
  const fd = new FormData(); fd.append('file', file, file.name || 'anh.png');
  try { return (await api('POST', '/api/upload-image', fd)).url; } catch (e) { toast(e.message, 'error'); return null; }
}

function previewExam(exam, Q) {
  const body = Q.map((q, i) => {
    let b = '';
    if (q.type === 'mc' || q.type === 'multi') b = `<div class="opts cols-2">${q.options.map((o, k) => `<div class="opt ${Array.isArray(q.answer) && q.answer.includes(k) ? 'right' : ''}"><span class="key">${OPT[k]}</span><span class="txt">${o.html}</span></div>`).join('')}</div>`;
    else if (q.type === 'tf') b = `<div class="col" style="gap:6px">${q.options.map((o, k) => `<div class="tf-row"><b>${TFL[k]})</b><div class="txt">${o.html}</div><span class="badge ${q.answer && q.answer[k] ? 'green' : 'red'}">${q.answer && q.answer[k] ? 'Đúng' : 'Sai'}</span></div>`).join('')}</div>`;
    else if (q.type === 'short') b = `<p class="small">Đáp án: <b>${esc(q.answer || '—')}</b></p>`;
    else b = '<p class="hint">Câu tự luận</p>';
    return `<div class="question"><div class="qhead"><span class="qlabel">Câu ${i + 1}</span><span class="small muted">${TYPE_NAME[q.type]} · ${fmtNum(q.points)} điểm</span></div><div class="qcontent">${q.content}</div>${b}${q.explanation ? `<div class="expl"><b>Lời giải:</b> ${q.explanation}</div>` : ''}</div>`;
  }).join('');
  modal({ title: 'Xem trước: ' + (exam.title || 'Đề chưa đặt tên'), body: `<p class="small muted">Đáp án đúng được tô xanh (học sinh sẽ không thấy).</p>${body}`, wide: true });
}

async function importFromExam(cur, Q, done) {
  const { exams } = await api('GET', '/api/exams');
  const others = exams.filter((e) => e.id !== cur.id);
  if (!others.length) return toast('Chưa có đề khác để lấy câu hỏi', 'error');
  const body = el(`<div><label class="field">Chọn đề<select id="src">${others.map((e) => `<option value="${e.id}">${esc(e.title)} (${e.questionCount} câu)</option>`).join('')}</select></label><div id="src-q" class="mt" style="max-height:50vh;overflow:auto"></div></div>`);
  let src = null;
  const load = async () => {
    $('#src-q', body).innerHTML = '<div class="spinner"></div>';
    src = (await api('GET', '/api/exams/' + $('#src', body).value)).exam;
    $('#src-q', body).innerHTML = `<label class="check"><input type="checkbox" id="all"><b>Chọn tất cả</b></label>` + src.questions.map((q, i) => `<label class="check" style="border-bottom:1px solid var(--line);padding:6px 0"><input type="checkbox" data-qi="${i}"><span><b>Câu ${i + 1}</b> <span class="badge">${TYPE_NAME[q.type]}</span> ${esc(plainText(q.content).slice(0, 140))}</span></label>`).join('');
    $('#all', body).onchange = (e) => $$('[data-qi]', body).forEach((c) => { c.checked = e.target.checked; });
  };
  $('#src', body).onchange = load;
  modal({
    title: 'Lấy câu hỏi từ đề khác', body, wide: true, actions: [{ label: 'Huỷ' }, {
      label: 'Thêm câu đã chọn', cls: 'primary', onClick: () => {
        const picked = $$('[data-qi]', body).filter((c) => c.checked).map((c) => src.questions[+c.dataset.qi]);
        if (!picked.length) { toast('Chưa chọn câu nào', 'error'); return false; }
        for (const q of picked) { const c = JSON.parse(JSON.stringify(q)); c.id = uid(); c.part = 0; c.options.forEach((o) => { o.id = uid(); }); Q.push(c); }
        toast(`Đã thêm ${picked.length} câu`, 'ok');
        done();
      },
    }],
  });
  load();
}

// ================= Chi tiết đề: chia sẻ, kết quả, thống kê =================
export async function examDetail(id, initialTab) {
  loading('exams');
  let data = await api('GET', `/api/exams/${id}/submissions`);
  let exam = data.exam;
  let tab = initialTab || query().tab || (data.submissions.length ? 'results' : 'share');
  const link = `${location.origin}/de/${exam.code}`;
  const main = shell('exams', `
    <div class="page-head"><div class="grow">
      <div class="row" style="gap:8px"><a href="/app/de" class="small">← Đề thi</a> <span id="st-badge">${statusBadge(exam.status)}</span></div>
      <h1 class="mt-s">${esc(exam.title)}</h1>
      <p class="muted small">${exam.questionCount} câu · ${fmtNum(exam.totalPoints)} điểm · ${exam.settings.duration ? exam.settings.duration + ' phút' : 'Không giới hạn thời gian'} · Mã đề <span class="code-pill">${exam.code}</span></p></div>
      <div class="row">
        <a class="btn" href="/app/de/${id}/sua">${icon.edit} Sửa đề</a>
        <a class="btn" href="/app/de/${id}/in">${icon.print} In đề</a>
        <button class="btn ${exam.status === 'published' ? 'danger' : 'primary'}" id="toggle">${exam.status === 'published' ? `${icon.lock} Đóng đề` : `${icon.send} Mở / giao đề`}</button>
      </div></div>
    <div class="tabs"><button data-t="share">Chia sẻ</button><button data-t="results">Kết quả (<span id="sub-n">${data.submissions.filter((s) => s.status === 'submitted').length}</span>)</button><button data-t="stats">Thống kê</button></div>
    <div id="pane"></div>`);
  const pane = $('#pane', main);
  $('#toggle', main).onclick = async () => {
    const ns = exam.status === 'published' ? 'closed' : 'published';
    if (ns === 'closed' && !(await confirmDialog('Đóng đề? Học sinh sẽ không vào làm được nữa (bài đang làm vẫn nộp được trong thời gian còn lại).', { ok: 'Đóng đề' }))) return;
    await api('PUT', '/api/exams/' + id, { status: ns });
    toast(ns === 'published' ? 'Đề đã mở cho học sinh' : 'Đã đóng đề', 'ok');
    examDetail(id, tab);
  };
  const setTab = (t) => {
    tab = t;
    $$('.tabs button', main).forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    history.replaceState({}, '', `/app/de/${id}?tab=${t}`);
    if (t === 'share') renderShare(); else if (t === 'results') reloadResults(); else renderStats();
  };
  let initial = true;
  async function reloadResults() {
    if (!initial) {
      try { data = await api('GET', `/api/exams/${id}/submissions`); exam = data.exam; } catch (_) { /* giữ dữ liệu cũ */ }
      $('#sub-n').textContent = data.submissions.filter((s) => s.status === 'submitted').length;
    }
    if (tab === 'results') renderResults();
  }
  $$('.tabs button', main).forEach((b) => { b.onclick = () => setTab(b.dataset.t); });

  function renderShare() {
    const S = exam.settings;
    pane.innerHTML = `<div class="grid c2">
      <div class="card">
        ${exam.status !== 'published' ? `<div class="alert warn mb">${icon.alert}<div>Đề đang ở trạng thái <b>${exam.status === 'draft' ? 'nháp' : 'đã đóng'}</b> — học sinh chưa vào được. Bấm <b>Mở / giao đề</b> ở trên.</div></div>` : ''}
        <h3>Gửi cho học sinh</h3>
        <p class="muted small">Học sinh vào trang chủ nhập mã đề, hoặc mở trực tiếp đường link / quét mã QR.</p>
        <div class="big-code">${exam.code}</div>
        <div class="share-link mt"><input type="text" readonly value="${esc(link)}" id="link"><button class="btn primary" id="cp">${icon.copy} Sao chép</button></div>
        <div class="row mt"><a class="btn sm" href="${esc(link)}" target="_blank">${icon.eye} Mở thử như học sinh</a><button class="btn sm" id="cp-msg">${icon.share} Sao chép lời nhắn</button></div>
      </div>
      <div class="card" style="text-align:center"><h3>Mã QR</h3><div class="qr-box mt-s" id="qr"></div><p class="small muted">Chiếu lên màn hình để học sinh quét bằng điện thoại</p><button class="btn sm" id="dl-qr">${icon.download} Tải ảnh QR</button></div>
      <div class="card" style="grid-column:1/-1"><div class="card-title"><h3>Cài đặt hiện tại</h3><a class="btn sm" href="/app/de/${id}/sua">${icon.settings} Thay đổi</a></div>
        <div class="grid c3 small">
          <div>⏱ Thời gian: <b>${S.duration ? S.duration + ' phút' : 'không giới hạn'}</b></div>
          <div>📅 Mở: <b>${S.startAt ? fmtDate(S.startAt) : 'ngay'}</b> · Đóng: <b>${S.endAt ? fmtDate(S.endAt) : 'không'}</b></div>
          <div>🔁 Lượt làm: <b>${S.maxAttempts || 'không giới hạn'}</b></div>
          <div>🔀 Đảo câu: <b>${S.shuffleQuestions ? 'có' : 'không'}</b> · Đảo đáp án: <b>${S.shuffleOptions ? 'có' : 'không'}</b></div>
          <div>🔒 Mật khẩu: <b>${S.password ? 'có' : 'không'}</b></div>
          <div>👤 Học sinh: <b>${S.identity === 'roster' ? 'chọn theo danh sách lớp' : 'tự nhập tên'}</b></div>
          <div>📊 Xem điểm: <b>${S.showScore ? 'có' : 'không'}</b> · Xem đáp án: <b>${{ after_submit: 'ngay khi nộp', after_close: 'khi đóng đề', never: 'không' }[S.showReview]}</b></div>
          <div>🛡 Rời màn hình: <b>${S.detectTab ? (S.maxTabSwitches ? `tự nộp sau ${S.maxTabSwitches} lần` : 'ghi nhận + cảnh báo') : 'không theo dõi'}</b></div>
        </div></div></div>`;
    $('#cp').onclick = () => copyText(link);
    $('#cp-msg').onclick = () => copyText(`Các em vào làm bài "${exam.title}" tại: ${link}\n(hoặc vào ${location.origin} nhập mã đề: ${exam.code})${S.duration ? `\nThời gian: ${S.duration} phút.` : ''}`);
    if (window.qrcode) {
      const qr = window.qrcode(0, 'M'); qr.addData(link); qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      $('#qr svg').style.width = '200px'; $('#qr svg').style.height = '200px';
      $('#dl-qr').onclick = () => {
        const img = new Image();
        img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 600; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 600); ctx.drawImage(img, 0, 0, 600, 600); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `QR-${exam.code}.png`; a.click(); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.createSvgTag({ cellSize: 10, margin: 2 }));
      };
    }
  }

  let sort = { k: 'submittedAt', dir: -1 }, search = '';
  function renderResults() {
    const subs = data.submissions;
    const submitted = subs.filter((s) => s.status === 'submitted');
    const doing = subs.filter((s) => s.status === 'doing');
    pane.innerHTML = `<div class="row between mb">
        <div class="row"><input type="search" id="rs" placeholder="Tìm học sinh, lớp..." value="${esc(search)}" style="width:260px">
          <span class="small muted">${submitted.length} đã nộp · ${doing.length} đang làm${data.missing.length ? ` · <b style="color:var(--danger)">${data.missing.length} chưa làm</b>` : ''}</span></div>
        <div class="row"><button class="btn sm" id="refresh">${icon.refresh} Làm mới</button><button class="btn sm" id="regrade" title="Chấm lại theo đáp án hiện tại">${icon.check} Chấm lại</button><button class="btn sm primary" id="xlsx">${icon.download} Xuất Excel</button></div></div>
      <div class="table-wrap"><table class="table"><thead><tr>
        <th>#</th><th class="sort" data-k="studentName">Họ và tên</th><th class="sort" data-k="studentClass">Lớp</th><th class="sort num" data-k="score">Điểm</th><th class="num">Số câu đúng</th>
        <th class="sort" data-k="duration">Thời gian làm</th><th class="sort" data-k="submittedAt">Nộp lúc</th><th class="sort num" data-k="tabSwitches">Rời màn hình</th><th></th></tr></thead>
        <tbody id="rows"></tbody></table></div>
      ${data.missing.length ? `<div class="card mt"><h3>Học sinh chưa làm bài (${data.missing.length})</h3><div class="row small mt-s" style="gap:6px">${data.missing.map((m) => `<span class="badge">${esc(m.name)} · ${esc(m.className)}</span>`).join('')}</div></div>` : ''}`;
    const draw = () => {
      const t = search.toLowerCase();
      const list = subs.filter((s) => !t || (s.studentName + ' ' + s.studentClass + ' ' + s.studentCode).toLowerCase().includes(t));
      list.sort((a, b) => { const x = a[sort.k], y = b[sort.k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * sort.dir; });
      $('#rows').innerHTML = list.length ? list.map((s, i) => `<tr>
        <td class="muted">${i + 1}</td>
        <td><a href="/app/bai/${s.id}"><b>${esc(s.studentName)}</b></a>${s.studentCode ? `<div class="tiny muted">${esc(s.studentCode)}</div>` : ''}</td>
        <td>${esc(s.studentClass)}</td>
        <td class="num">${s.status === 'submitted' ? `<b style="font-size:15px">${fmtNum(s.score)}</b><span class="muted small">/${fmtNum(s.maxScore)}</span>${s.pending ? ' <span class="badge blue">chờ chấm</span>' : ''}` : '<span class="badge amber">Đang làm</span>'}</td>
        <td class="num">${s.status === 'submitted' ? `${s.correct}/${s.total}` : '—'}</td>
        <td>${s.status === 'submitted' ? fmtDur(s.duration) : '—'}</td>
        <td class="small">${s.status === 'submitted' ? fmtDate(s.submittedAt) : 'Bắt đầu ' + fmtDate(s.startedAt)}</td>
        <td class="num">${s.tabSwitches ? `<span class="badge ${s.tabSwitches > 2 ? 'red' : 'amber'}">${s.tabSwitches}</span>` : '0'}</td>
        <td class="nowrap"><a class="btn sm ghost" href="/app/bai/${s.id}">${icon.eye}</a><button class="btn sm ghost" data-del="${s.id}" title="Xoá bài (cho làm lại)">${icon.trash}</button></td></tr>`).join('')
        : `<tr><td colspan="9"><div class="empty">${icon.users}<p>Chưa có bài làm nào.</p><button class="btn sm" data-goshare>Lấy link gửi học sinh</button></div></td></tr>`;
      $$('th.sort').forEach((th) => { th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.k === sort.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''); });
    };
    draw();
    $('#rs').oninput = (e) => { search = e.target.value; draw(); };
    $$('th.sort').forEach((th) => { th.onclick = () => { sort = { k: th.dataset.k, dir: sort.k === th.dataset.k ? -sort.dir : 1 }; draw(); }; });
    $('#rows').onclick = async (e) => {
      if (e.target.closest('[data-goshare]')) return setTab('share');
      const d = e.target.closest('[data-del]');
      if (!d) return;
      const s = subs.find((x) => x.id === d.dataset.del);
      if (!(await confirmDialog(`Xoá bài làm của <b>${esc(s.studentName)}</b>? Học sinh sẽ có thể làm lại.`, { danger: true, ok: 'Xoá' }))) return;
      await api('DELETE', '/api/submissions/' + s.id);
      data.submissions = subs.filter((x) => x.id !== s.id);
      renderResults();
    };
    $('#refresh').onclick = async () => { data = await api('GET', `/api/exams/${id}/submissions`); exam = data.exam; $('#sub-n').textContent = data.submissions.filter((s) => s.status === 'submitted').length; renderResults(); toast('Đã cập nhật'); };
    $('#regrade').onclick = async () => {
      if (!(await confirmDialog('Chấm lại toàn bộ bài theo đáp án và thang điểm hiện tại của đề?'))) return;
      const r = await api('POST', `/api/exams/${id}/regrade`);
      toast(`Đã chấm lại ${r.count} bài`, 'ok');
      $('#refresh').click();
    };
    $('#xlsx').onclick = () => exportExcel(exam, data);
  }

  async function renderStats() {
    pane.innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';
    const st = await api('GET', `/api/exams/${id}/stats`);
    if (!st.count) { pane.innerHTML = `<div class="card empty">${icon.chart}<p>Chưa có bài nộp để thống kê.</p></div>`; return; }
    const maxB = Math.max(1, ...st.buckets);
    const qs = exam.questions;
    const L = st.levels, tot = st.count;
    pane.innerHTML = `<div class="grid c4">
      ${[['Bài đã nộp', st.count + (st.doing ? ` <span class="small muted">(+${st.doing} đang làm)</span>` : '')], ['Điểm trung bình', fmtNum(st.avg)], ['Cao nhất / thấp nhất', `${fmtNum(st.max)} / ${fmtNum(st.min)}`], ['Trung vị', fmtNum(st.median)]]
        .map(([l, v]) => `<div class="card"><div class="lbl small muted">${l}</div><div style="font-size:24px;font-weight:700">${v}</div></div>`).join('')}
    </div>
    <div class="grid c2 mt">
      <div class="card"><h3>Phổ điểm (quy về thang 10)</h3><div class="bars">${st.buckets.map((n, i) => `<div class="bar"><span class="v">${n || ''}</span><div class="fill" style="height:${(n / maxB) * 140}px;background:${i < 5 ? '#e0796d' : i < 8 ? '#e8a33c' : 'var(--ok)'}"></div><span class="l">${i}–${i + 1}</span></div>`).join('')}</div></div>
      <div class="card"><h3>Xếp loại</h3>
        <div class="levels mt">${[[L.gioi, 'var(--ok)'], [L.kha, '#5fb3a1'], [L.tb, '#e8a33c'], [L.yeu, '#e0796d']].map(([n, c]) => `<div style="width:${(n / tot) * 100}%;background:${c}"></div>`).join('')}</div>
        <div class="col mt small">${[['Giỏi (≥ 8)', L.gioi, 'var(--ok)'], ['Khá (6,5 – 8)', L.kha, '#5fb3a1'], ['Trung bình (5 – 6,5)', L.tb, '#e8a33c'], ['Yếu (< 5)', L.yeu, '#e0796d']].map(([l, n, c]) => `<div class="row between"><span><span class="dot" style="background:${c}"></span> ${l}</span><b>${n} HS · ${fmtNum((n / tot) * 100, 1)}%</b></div>`).join('')}</div></div>
    </div>
    <div class="card mt"><div class="card-title"><h3>Phân tích từng câu</h3><span class="small muted">Sắp xếp: câu khó lên trước <input type="checkbox" id="hard-first"></span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Câu</th><th>Loại</th><th>Nội dung</th><th>Tỉ lệ đúng</th><th class="num">Đúng</th><th class="num">Một phần</th><th class="num">Sai</th><th class="num">Bỏ trống</th><th>Lựa chọn</th></tr></thead><tbody id="pq"></tbody></table></div></div>`;
    const drawPq = (hard) => {
      const rows = st.perQ.map((p, i) => ({ p, i, q: qs.find((x) => x.id === p.id) })).filter((r) => r.q);
      if (hard) rows.sort((a, b) => a.p.rate - b.p.rate);
      $('#pq').innerHTML = rows.map(({ p, i, q }) => `<tr><td><b>${i + 1}</b></td><td class="small">${TYPE_NAME[q.type]}</td>
        <td class="small" style="max-width:340px">${esc(plainText(q.content).slice(0, 110)) || '<i class="muted">(ảnh / công thức)</i>'}</td>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="meter"><div style="width:${p.rate}%;background:${p.rate < 40 ? 'var(--danger)' : p.rate < 70 ? 'var(--accent)' : 'var(--ok)'}"></div></div><b class="small">${fmtNum(p.rate, 1)}%</b></div></td>
        <td class="num">${p.correct}</td><td class="num">${p.partial}</td><td class="num">${p.wrong}</td><td class="num">${p.blank}${p.pending ? ` <span class="badge blue">${p.pending} chờ</span>` : ''}</td>
        <td class="small nowrap">${q.type === 'mc' || q.type === 'multi' ? q.options.map((o, k) => `<span style="${(q.answer || []).includes(k) ? 'color:var(--ok);font-weight:700' : ''}">${OPT[k]}:${p.picks[o.id] || 0}</span>`).join(' ') : ''}</td></tr>`).join('');
    };
    drawPq(false);
    $('#hard-first').onchange = (e) => drawPq(e.target.checked);
  }

  setTab(tab);
  initial = false;
  const timer = setInterval(async () => {
    if (tab !== 'results' || document.hidden) return;
    try {
      const nd = await api('GET', `/api/exams/${id}/submissions`);
      if (JSON.stringify(nd.submissions) !== JSON.stringify(data.submissions)) { data = nd; exam = nd.exam; $('#sub-n').textContent = data.submissions.filter((s) => s.status === 'submitted').length; renderResults(); }
    } catch (_) { /* ignore */ }
  }, 20000);
  onLeave(() => clearInterval(timer));
}

function answerLetters(q, a) {
  if (a == null) return '';
  if (q.type === 'mc' || q.type === 'multi') return (Array.isArray(a) ? a : [a]).map((oid) => OPT[q.options.findIndex((o) => o.id === oid)] || '?').sort().join('');
  if (q.type === 'tf') return q.options.map((o) => (a[o.id] === true ? 'Đ' : a[o.id] === false ? 'S' : '-')).join('');
  if (q.type === 'short') return String(a);
  if (q.type === 'essay') return (a.text || '').slice(0, 300) + (a.images && a.images.length ? ` [${a.images.length} ảnh]` : '');
  return '';
}
function keyLetters(q) {
  if (q.type === 'mc' || q.type === 'multi') return (q.answer || []).map((i) => OPT[i]).join('');
  if (q.type === 'tf') return (q.answer || []).map((v) => (v ? 'Đ' : 'S')).join('');
  if (q.type === 'short') return q.answer || '';
  return '(tự luận)';
}

async function exportExcel(exam, data) {
  toast('Đang tạo file Excel...');
  await loadScript('/vendor/xlsx.full.min.js');
  const XLSX = window.XLSX;
  const subs = data.submissions.filter((s) => s.status === 'submitted').sort((a, b) => a.studentClass.localeCompare(b.studentClass, 'vi') || a.studentName.localeCompare(b.studentName, 'vi'));
  const details = await Promise.all(subs.map((s) => api('GET', '/api/submissions/' + s.id).then((r) => r.submission)));
  const qs = exam.questions;
  const head = ['STT', 'Họ và tên', 'Lớp', 'Mã HS / SBD', 'Điểm', 'Thang điểm', 'Số câu đúng', 'Tổng số câu', 'Thời gian làm', 'Bắt đầu', 'Nộp lúc', 'Số lần rời màn hình', 'Nhận xét'];
  const rows = subs.map((s, i) => [i + 1, s.studentName, s.studentClass, s.studentCode, s.score, s.maxScore, s.correct, s.total, fmtDur(s.duration), fmtDate(s.startedAt), fmtDate(s.submittedAt), s.tabSwitches, s.comment || '']);
  const ws1 = XLSX.utils.aoa_to_sheet([[exam.title], [`Mã đề: ${exam.code} — Xuất lúc ${fmtDate(Date.now())}`], [], head, ...rows]);
  ws1['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 17 }, { wch: 17 }, { wch: 10 }, { wch: 30 }];
  const head2 = ['STT', 'Họ và tên', 'Lớp', 'Điểm', ...qs.map((_, i) => `Câu ${i + 1}`)];
  const keyRow = ['', 'ĐÁP ÁN', '', '', ...qs.map(keyLetters)];
  const rows2 = details.map((d, i) => [i + 1, d.studentName, d.studentClass, d.score, ...qs.map((q) => {
    const det = (d.details || []).find((x) => x.qid === q.id);
    const a = answerLetters(q, d.answers[q.id]);
    return a + (det ? (det.status === 'correct' ? ' ✓' : det.status === 'partial' ? ` (${det.k}/${det.n})` : det.status === 'wrong' ? ' ✗' : '') : '');
  })]);
  const ws2 = XLSX.utils.aoa_to_sheet([head2, keyRow, ...rows2]);
  ws2['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 9 }, { wch: 7 }, ...qs.map(() => ({ wch: 9 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Bảng điểm');
  XLSX.utils.book_append_sheet(wb, ws2, 'Chi tiết bài làm');
  if (data.missing.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['STT', 'Họ và tên', 'Lớp', 'Mã HS'], ...data.missing.map((m, i) => [i + 1, m.name, m.className, m.code])]), 'Chưa làm bài');
  XLSX.writeFile(wb, `Ket-qua-${exam.code}-${exam.title.replace(/[^\p{L}\d]+/gu, '-').slice(0, 40)}.xlsx`);
}

// ================= Bài làm của một học sinh =================
export async function submissionDetail(sid) {
  loading('exams');
  const { submission: s, exam } = await api('GET', '/api/submissions/' + sid);
  const qs = exam.questions;
  const layout = s.layout || {};
  const order = (layout.order || qs.map((q) => q.id)).map((id) => qs.find((q) => q.id === id)).filter(Boolean);
  const manual = { ...(s.manual || {}) };
  const main = shell('exams', `
    <div class="page-head"><div><a href="/app/de/${exam.id}?tab=results" class="small">← ${esc(exam.title)}</a><h1 class="mt-s">${esc(s.studentName)}</h1>
      <p class="muted small">${esc(s.studentClass)}${s.studentCode ? ' · ' + esc(s.studentCode) : ''} · ${s.status === 'submitted' ? 'Nộp lúc ' + fmtDate(s.submittedAt) + ' · làm trong ' + fmtDur(s.duration) : 'Đang làm bài'}</p></div>
      <div class="card" style="padding:12px 20px;text-align:center"><div class="small muted">Điểm</div><div style="font-size:30px;font-weight:800;color:var(--primary-700)" id="score">${fmtNum(s.score)}<span class="small muted">/${fmtNum(s.maxScore)}</span></div><div class="small muted">${s.correct ?? 0}/${s.total ?? qs.length} câu đúng</div></div></div>
    <div class="grid c2 mb">
      <div class="card"><h3>Nhận xét cho học sinh</h3><textarea id="cmt" rows="3" placeholder="Học sinh sẽ thấy nhận xét này trong trang kết quả">${esc(s.comment || '')}</textarea>
        <div class="row mt-s"><button class="btn primary" id="save-grade">${icon.check} Lưu điểm & nhận xét</button><span class="hint">Có thể sửa điểm từng câu ở bên dưới.</span></div></div>
      <div class="card"><h3>Nhật ký làm bài</h3><div class="small" style="max-height:150px;overflow:auto">
        <div>• Bắt đầu: ${fmtDate(s.startedAt)}</div>${(s.events || []).map((e) => `<div>• ${fmtDate(e.t)}: ${esc(e.e)}</div>`).join('')}${s.submittedAt ? `<div>• Nộp bài: ${fmtDate(s.submittedAt)}</div>` : ''}
        <div class="muted mt-s">Rời màn hình: <b>${s.tabSwitches}</b> lần · IP: ${esc(s.ip || '')}</div></div></div></div>
    <div id="qs"></div>`);
  const det = (q) => (s.details || []).find((d) => d.qid === q.id) || { earned: 0, max: q.points, status: 'blank' };
  $('#qs', main).innerHTML = order.map((q, i) => {
    const a = s.answers[q.id];
    const d = det(q);
    const optIds = layout.opt && layout.opt[q.id] ? layout.opt[q.id] : q.options.map((o) => o.id);
    const opts = optIds.map((oid) => q.options.find((o) => o.id === oid)).filter(Boolean);
    let body = '';
    if (q.type === 'mc' || q.type === 'multi') {
      const given = a == null ? [] : Array.isArray(a) ? a : [a];
      const correct = (q.answer || []).map((k) => q.options[k] && q.options[k].id);
      body = `<div class="opts cols-2">${opts.map((o, k) => `<div class="opt ${correct.includes(o.id) ? 'right' : given.includes(o.id) ? 'wrong' : ''}"><span class="key">${OPT[k]}</span><span class="txt">${o.html}${given.includes(o.id) ? ' <span class="badge blue">HS chọn</span>' : ''}</span></div>`).join('')}</div>
        <p class="tiny muted mt-s">Chữ cái theo thứ tự học sinh thấy${optIds.join() !== q.options.map((o) => o.id).join() ? ' (đã đảo đáp án)' : ''}.</p>`;
    } else if (q.type === 'tf') {
      body = `<div class="col" style="gap:6px">${q.options.map((o, k) => { const g = a ? a[o.id] : undefined; const c = !!(q.answer || [])[k]; return `<div class="tf-row ${g === undefined ? '' : g === c ? 'right' : 'wrong'}"><b>${TFL[k]})</b><div class="txt">${o.html}</div><span class="small">HS: <b>${g === true ? 'Đúng' : g === false ? 'Sai' : '—'}</b></span><span class="badge ${c ? 'green' : 'red'}">ĐA: ${c ? 'Đúng' : 'Sai'}</span></div>`; }).join('')}</div>`;
    } else if (q.type === 'short') {
      body = `<p>Học sinh trả lời: <b>${esc(a || '—')}</b></p><p class="small">Đáp án: <b>${esc(q.answer || '—')}</b></p>`;
    } else {
      body = `<div style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px;border:1px solid var(--line)">${esc((a && a.text) || '(không có bài làm dạng chữ)')}</div>
        ${a && a.images && a.images.length ? `<div class="row mt-s">${a.images.map((u) => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}" style="max-height:220px;border-radius:8px;border:1px solid var(--line)"></a>`).join('')}</div>` : ''}`;
    }
    const map = { correct: ['green', 'Đúng'], wrong: ['red', 'Sai'], partial: ['amber', 'Một phần'], blank: ['gray', 'Bỏ trống'], pending: ['blue', 'Chờ chấm'], nokey: ['gray', 'Chưa có đáp án'] };
    const [c, t] = map[d.status] || ['gray', d.status];
    return `<div class="question"><div class="qhead"><span class="qlabel">Câu ${i + 1} <span class="badge">${TYPE_NAME[q.type]}</span></span>
      <span class="row" style="gap:8px"><span class="badge ${c}">${t}</span><label class="small row" style="gap:4px">Điểm <input type="number" step="0.05" min="0" max="${q.points}" data-m="${q.id}" value="${manual[q.id] ?? (d.status === 'pending' ? '' : d.earned)}" placeholder="?" style="width:80px;padding:4px 8px"> / ${fmtNum(q.points)}</label></span></div>
      <div class="qcontent">${q.content}</div>${body}</div>`;
  }).join('');
  renderMath($('#qs', main));
  $('#qs', main).addEventListener('input', (e) => {
    const k = e.target.dataset.m;
    if (!k) return;
    const q = qs.find((x) => x.id === k);
    const d = det(q);
    if (e.target.value === '' ) delete manual[k];
    else if (Number(e.target.value) !== d.earned || manual[k] !== undefined || q.type === 'essay') manual[k] = Number(e.target.value);
  });
  $('#save-grade', main).onclick = async () => {
    const r = await api('PUT', `/api/submissions/${sid}/grade`, { manual, comment: $('#cmt').value });
    $('#score').innerHTML = `${fmtNum(r.score)}<span class="small muted">/${fmtNum(s.maxScore)}</span>`;
    toast('Đã lưu điểm', 'ok');
  };
}

// ================= Lớp học =================
export async function classList() {
  loading('classes');
  const { classes } = await api('GET', '/api/classes');
  const main = shell('classes', `
    <div class="page-head"><div><h1>Lớp học</h1><p class="muted">Quản lý danh sách học sinh để giao bài và theo dõi ai chưa làm</p></div><button class="btn primary" id="new">${icon.plus} Tạo lớp</button></div>
    <div class="grid c3">${classes.length ? classes.map((c) => `<a class="card exam-card" href="/app/lop/${c.id}" style="color:inherit;text-decoration:none">
      <div class="stat"><div class="ico">${icon.users}</div><div><h3 style="margin:0">${esc(c.name)}</h3><div class="small muted">${c.studentCount} học sinh</div></div></div>
      ${c.description ? `<p class="small muted" style="margin:0">${esc(c.description)}</p>` : ''}</a>`).join('')
      : `<div class="card empty" style="grid-column:1/-1">${icon.users}<p>Chưa có lớp nào.</p></div>`}</div>`);
  $('#new', main).onclick = async () => {
    const name = await promptDialog('Tạo lớp mới', { label: 'Tên lớp', placeholder: 'VD: 12A1' });
    if (!name) return;
    const r = await api('POST', '/api/classes', { name });
    navigate('/app/lop/' + r.class.id);
  };
}

export async function classDetail(id) {
  loading('classes');
  const { class: c } = await api('GET', '/api/classes/' + id);
  const students = c.students.map((s) => ({ ...s }));
  let dirty = false;
  const main = shell('classes', `
    <div class="page-head"><div class="grow"><a href="/app/lop" class="small">← Lớp học</a>
      <div class="row mt-s"><input type="text" id="cname" value="${esc(c.name)}" style="font-size:22px;font-weight:700;max-width:340px"><input type="text" id="cdesc" value="${esc(c.description || '')}" placeholder="Mô tả (năm học, môn...)" style="max-width:340px"></div></div>
      <div class="row"><button class="btn danger" id="del">${icon.trash} Xoá lớp</button><button class="btn primary" id="save">${icon.check} Lưu</button></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)">
      <div class="card"><div class="card-title"><h3>Danh sách học sinh (<span id="n">${students.length}</span>)</h3>
        <div class="row" style="gap:6px"><button class="btn sm" id="paste">${icon.list} Dán danh sách</button><label class="btn sm">${icon.upload} Nhập Excel<input type="file" id="xl" accept=".xlsx,.xls,.csv" hidden></label><button class="btn sm" id="exp">${icon.download} Xuất Excel</button></div></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Họ và tên</th><th>Mã HS</th><th>Ngày sinh</th><th>SĐT</th><th></th></tr></thead><tbody id="st"></tbody></table></div>
        <button class="btn sm mt-s" id="add">${icon.plus} Thêm học sinh</button></div>
      <div class="card"><h3>Đề đã giao cho lớp</h3>${c.exams.length ? c.exams.map((e) => `<a href="/app/de/${e.id}?tab=results" class="row between" style="padding:8px 0;border-bottom:1px solid var(--line);color:inherit;text-decoration:none"><span class="grow nowrap">${esc(e.title)}</span>${statusBadge(e.status)}</a>`).join('') : '<p class="small muted">Chưa có. Khi soạn đề, vào tab "Thông tin & giao lớp" để giao cho lớp này.</p>'}</div>
    </div>`);
  if (window.innerWidth < 900) main.querySelector('.grid').style.gridTemplateColumns = '1fr';
  setLeaveGuard(() => !dirty || confirm('Danh sách lớp chưa lưu. Rời trang?'));
  const mark = () => { dirty = true; };
  const draw = () => {
    $('#st').innerHTML = students.map((s, i) => `<tr><td class="muted">${i + 1}</td>
      <td><input type="text" data-i="${i}" data-k="name" value="${esc(s.name)}" placeholder="Họ và tên"></td>
      <td><input type="text" data-i="${i}" data-k="code" value="${esc(s.code || '')}" style="width:110px"></td>
      <td><input type="text" data-i="${i}" data-k="dob" value="${esc(s.dob || '')}" style="width:110px" placeholder="dd/mm/yyyy"></td>
      <td><input type="text" data-i="${i}" data-k="phone" value="${esc(s.phone || '')}" style="width:120px"></td>
      <td><button class="btn ghost icon sm" data-rm="${i}">${icon.x}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted small">Chưa có học sinh.</td></tr>';
    $('#n').textContent = students.length;
  };
  draw();
  $('#st').oninput = (e) => { const i = e.target.dataset.i; if (i !== undefined) { students[+i][e.target.dataset.k] = e.target.value; mark(); } };
  $('#st').onclick = (e) => { const r = e.target.closest('[data-rm]'); if (r) { students.splice(+r.dataset.rm, 1); mark(); draw(); } };
  $('#add').onclick = () => { students.push({ name: '', code: '', dob: '', phone: '' }); mark(); draw(); $$('#st input[data-k=name]').pop().focus(); };
  $('#cname').oninput = mark; $('#cdesc').oninput = mark;
  const addRows = (rows) => {
    let n = 0;
    for (const r of rows) {
      const cells = r.map((x) => String(x ?? '').trim());
      if (!cells.some(Boolean)) continue;
      // bỏ cột STT nếu có
      if (/^\d{1,3}$/.test(cells[0]) && cells[1]) cells.shift();
      if (/^(họ|ho|họ và tên|tên|stt|name)/i.test(cells[0])) continue;
      if (!cells[0]) continue;
      students.push({ name: cells[0], code: cells[1] || '', dob: cells[2] || '', phone: cells[3] || '' }); n++;
    }
    mark(); draw(); toast(`Đã thêm ${n} học sinh`, 'ok');
  };
  $('#paste').onclick = async () => {
    const t = await promptDialog('Dán danh sách học sinh', { label: 'Mỗi dòng một học sinh. Có thể dán trực tiếp từ Excel: Họ tên [Tab] Mã HS [Tab] Ngày sinh [Tab] SĐT', textarea: true, ok: 'Thêm' });
    if (!t) return;
    addRows(t.split(/\r?\n/).map((l) => l.split(/\t|;|,(?=\s*\S)/)));
  };
  $('#xl').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await loadScript('/vendor/xlsx.full.min.js');
    const wb = window.XLSX.read(await f.arrayBuffer());
    const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    addRows(rows);
    e.target.value = '';
  };
  $('#exp').onclick = async () => {
    await loadScript('/vendor/xlsx.full.min.js');
    const ws = window.XLSX.utils.aoa_to_sheet([['STT', 'Họ và tên', 'Mã HS', 'Ngày sinh', 'SĐT'], ...students.map((s, i) => [i + 1, s.name, s.code, s.dob, s.phone])]);
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
    window.XLSX.writeFile(wb, `Lop-${$('#cname').value}.xlsx`);
  };
  $('#save').onclick = async () => {
    await api('PUT', '/api/classes/' + id, { name: $('#cname').value, description: $('#cdesc').value, students: students.filter((s) => s.name.trim()) });
    dirty = false; toast('Đã lưu lớp', 'ok');
    classDetail(id);
  };
  $('#del').onclick = async () => {
    if (!(await confirmDialog(`Xoá lớp <b>${esc(c.name)}</b>? Bài làm của học sinh vẫn được giữ.`, { danger: true, ok: 'Xoá lớp' }))) return;
    await api('DELETE', '/api/classes/' + id); dirty = false; navigate('/app/lop');
  };
}

// ================= In đề =================
export async function printExam(id) {
  loading('exams');
  const { exam } = await api('GET', '/api/exams/' + id);
  const school = state.user.school || '';
  app().innerHTML = `<div class="no-print topbar"><div class="inner"><a href="/app/de/${id}" class="btn ghost">${icon.back} Quay lại</a><b class="grow">In đề: ${esc(exam.title)}</b>
    <label class="small row" style="gap:6px">Số mã đề <input type="number" id="nv" min="1" max="24" value="1" style="width:70px"></label>
    <label class="check small"><input type="checkbox" id="sq" checked> Đảo câu</label><label class="check small"><input type="checkbox" id="so" checked> Đảo đáp án</label>
    <label class="check small"><input type="checkbox" id="ak" checked> Kèm đáp án</label><label class="check small"><input type="checkbox" id="ex"> Kèm lời giải</label>
    <button class="btn" id="gen">${icon.refresh} Tạo</button><button class="btn primary" id="pr">${icon.print} In / Lưu PDF</button></div></div><div id="pages"></div>`;
  const shuffle = (a, rnd) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const seeded = (s) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const positional = (q) => q.options.some((o) => /\b(cả|tất cả)\b.*\b(đều|trên)\b|\b(A|B|C)\s*(và|,)\s*(B|C|D)\b|all of the above|none of the above|both/i.test(plainText(o.html)));
  const gen = () => {
    const nv = Math.max(1, Math.min(24, +$('#nv').value || 1));
    const sq = $('#sq').checked && nv > 1, so = $('#so').checked && nv > 1, ak = $('#ak').checked, ex = $('#ex').checked;
    const versions = [];
    for (let v = 0; v < nv; v++) {
      const code = nv === 1 ? '' : String(101 + v * 7 + Math.floor(Math.random() * 6));
      const rnd = seeded(v * 9973 + 17 + Date.now() % 1000);
      let qs = exam.questions.map((q) => ({ ...q }));
      if (sq) {
        const groups = [];
        for (const q of qs) { let g = groups.find((x) => x.p === (q.part || 0)); if (!g) { g = { p: q.part || 0, l: [] }; groups.push(g); } g.l.push(q); }
        qs = groups.flatMap((g) => shuffle(g.l, rnd));
      }
      qs = qs.map((q) => {
        if (so && (q.type === 'mc' || q.type === 'multi') && !positional(q)) {
          const idx = shuffle(q.options.map((_, k) => k), rnd);
          return { ...q, options: idx.map((k) => q.options[k]), answer: (q.answer || []).map((a) => idx.indexOf(a)).sort() };
        }
        return q;
      });
      versions.push({ code, qs });
    }
    let html = '';
    for (const v of versions) {
      let lastPart = null, n = 0;
      html += `<div class="print-page">
        <div class="p-head"><div><b>${esc(school.toUpperCase() || 'TRƯỜNG ................................')}</b><br>${exam.subject ? 'Môn: ' + esc(exam.subject) : ''}</div>
          <div><b>${esc(exam.title.toUpperCase())}</b><br>${exam.settings.duration ? `Thời gian làm bài: ${exam.settings.duration} phút` : ''}${v.code ? `<br><b>Mã đề: ${v.code}</b>` : ''}</div></div>
        <p>Họ và tên: ............................................................. Lớp: .............. SBD: ..............</p>`;
      for (const q of v.qs) {
        n++;
        if (exam.parts.length && q.part && q.part !== lastPart) { const p = exam.parts.find((x) => x.index === q.part); html += `<p style="margin-top:12px"><b>${esc(p ? p.title : 'Phần ' + q.part)}</b></p>`; lastPart = q.part; }
        let body = '';
        if (q.type === 'mc' || q.type === 'multi') {
          const lens = q.options.map((o) => plainText(o.html).length + (/<img/.test(o.html) ? 40 : 0));
          const cls = Math.max(...lens) <= 22 ? '' : Math.max(...lens) <= 48 ? 'c2' : 'c1';
          body = `<div class="p-opts ${cls}">${q.options.map((o, k) => `<div><b>${OPT[k]}.</b> ${o.html}</div>`).join('')}</div>`;
        } else if (q.type === 'tf') body = q.options.map((o, k) => `<div>${TFL[k]}) ${o.html}</div>`).join('');
        else if (q.type === 'short') body = '<div>Trả lời: ..........................</div>';
        else body = '<div style="height:90px"></div>';
        html += `<div class="p-q"><b>Câu ${n}${q.type === 'essay' ? ` (${fmtNum(q.points)} điểm)` : ''}.</b> ${q.content}${body}</div>`;
        if (ex && q.explanation) html += `<div class="p-q" style="font-style:italic">Lời giải: ${q.explanation}</div>`;
      }
      html += '<p style="text-align:center;margin-top:16px">------------- HẾT -------------</p></div>';
      if (ak) {
        html += `<div class="page-break"></div><div class="print-page"><h3 style="text-align:center">ĐÁP ÁN${v.code ? ' — MÃ ĐỀ ' + v.code : ''}: ${esc(exam.title)}</h3>`;
        const rows = [];
        for (let i = 0; i < v.qs.length; i += 10) rows.push(v.qs.slice(i, i + 10).map((q, k) => [i + k + 1, keyLetters(q)]));
        html += `<table class="key">${rows.map((r) => `<tr>${r.map(([n2]) => `<td><b>${n2}</b></td>`).join('')}</tr><tr>${r.map(([, a]) => `<td>${esc(a)}</td>`).join('')}</tr>`).join('')}</table></div>`;
      }
      html += '<div class="page-break"></div>';
    }
    $('#pages').innerHTML = html;
    renderMath($('#pages'));
  };
  $('#gen').onclick = gen; $('#pr').onclick = () => window.print();
  gen();
}

// ================= Tài khoản =================
export async function profile() {
  const u = state.user;
  const main = shell('', `<div class="container narrow" style="padding:0"><h1>Tài khoản</h1>
    <div class="card mt"><form id="pf" class="col">
      <label class="field">Họ và tên<input type="text" name="name" value="${esc(u.name)}"></label>
      <label class="field">Trường (hiện trên đề in và trang làm bài)<input type="text" name="school" value="${esc(u.school || '')}"></label>
      <label class="field">Email<input type="email" value="${esc(u.email)}" disabled></label>
      <div class="section-label">Đổi mật khẩu (không bắt buộc)</div>
      <div class="grid c2"><label class="field">Mật khẩu hiện tại<input type="password" name="oldPassword" autocomplete="current-password"></label><label class="field">Mật khẩu mới<input type="password" name="newPassword" autocomplete="new-password"></label></div>
      <div><button class="btn primary">${icon.check} Lưu thay đổi</button></div></form></div></div>`);
  $('#pf', main).onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api('PUT', '/api/auth/profile', Object.fromEntries(new FormData(e.target))); state.user = r.user; toast('Đã lưu', 'ok'); profile(); } catch (err) { toast(err.message, 'error'); }
  };
}

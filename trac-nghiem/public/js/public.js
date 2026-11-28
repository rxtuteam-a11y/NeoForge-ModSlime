// Trang công khai: trang chủ, đăng nhập/đăng ký, học sinh vào đề, làm bài, xem kết quả.
import { state, esc, $, $$, el, icon, api, toast, modal, renderMath, navigate, fmtDate, fmtDur, fmtNum, debounce, query, onLeave, setLeaveGuard } from './core.js';

const app = () => $('#app');

export function publicTopbar() {
  const u = state.user;
  return `<header class="topbar"><div class="inner">
    <a class="brand" href="/"><span class="brand-mark">${icon.check}</span>Trắc Nghiệm Online</a>
    <div class="grow"></div>
    ${u ? `<a class="btn primary" href="/app">${icon.grid} Trang giáo viên</a>`
      : `<a class="btn ghost" href="/dang-nhap">Đăng nhập</a><a class="btn primary" href="/dang-ky">Đăng ký giáo viên</a>`}
  </div></header>`;
}

// ---------- Trang chủ ----------
export function landing() {
  const feats = [
    [icon.upload, 'Tạo đề từ Word, PDF', 'Tải file .docx / .pdf, hệ thống tự tách từng câu, phương án, hình ảnh và công thức toán.'],
    [icon.check, 'Tự nhận đáp án', 'Nhận đáp án qua gạch chân, tô màu, in đậm, dấu *, dòng "Đáp án:", "Chọn B" hoặc bảng đáp án cuối đề.'],
    [icon.layers, 'Đủ dạng câu hỏi mới', 'Trắc nghiệm 4 phương án, nhiều đáp án, đúng/sai (chấm theo thang Bộ GD), trả lời ngắn, tự luận.'],
    [icon.award, 'Chấm điểm tức thì', 'Học sinh nộp bài là có điểm, xem lại đáp án và lời giải theo cài đặt của giáo viên.'],
    [icon.chart, 'Thống kê & xuất Excel', 'Phổ điểm, tỉ lệ đúng từng câu, danh sách chưa làm bài, xuất bảng điểm ra Excel.'],
    [icon.shield, 'Chống gian lận', 'Đảo câu, đảo đáp án, mật khẩu, giới hạn lượt, ghi nhận và giới hạn số lần rời màn hình.'],
  ];
  app().innerHTML = `${publicTopbar()}
  <section class="hero"><div class="inner">
    <div class="fade-in">
      <span class="badge green">${icon.sparkle} Miễn phí · Không cần cài đặt</span>
      <h1 class="mt-s">Giao bài trắc nghiệm <em>từ file Word</em> chỉ trong một phút</h1>
      <p class="lead">Tải đề lên, hệ thống tự tách câu hỏi và đáp án. Gửi mã đề cho học sinh, bài làm được chấm ngay khi nộp.</p>
      <div class="row mt">
        <a class="btn primary lg" href="${state.user ? '/app/de/moi' : '/dang-ky'}">${icon.plus} Tạo đề ngay</a>
        ${state.user ? '' : '<a class="btn lg" href="/dang-nhap">Tôi đã có tài khoản</a>'}
      </div>
    </div>
    <div class="join-card fade-in">
      <h2>Học sinh vào làm bài</h2>
      <p class="muted small">Nhập mã đề giáo viên gửi cho bạn (6 ký tự).</p>
      <form id="join" class="col">
        <input type="text" class="code" id="code" maxlength="6" placeholder="VD: K7M2QX" autocomplete="off" autocapitalize="characters">
        <button class="btn primary lg block">${icon.play} Vào làm bài</button>
      </form>
    </div>
  </div></section>
  <section class="features"><div class="grid c3">
    ${feats.map(([ic, t, d]) => `<div class="feature"><div class="ico">${ic}</div><div><h3>${t}</h3><p>${d}</p></div></div>`).join('')}
  </div></section>`;
  $('#join').onsubmit = (e) => {
    e.preventDefault();
    const c = $('#code').value.trim().toUpperCase();
    if (c.length < 4) return toast('Mã đề chưa đúng', 'error');
    navigate('/de/' + c);
  };
}

// ---------- Đăng nhập / đăng ký ----------
export function authPage(mode) {
  const reg = mode === 'register';
  app().innerHTML = `${publicTopbar()}<div class="auth-wrap"><div class="card auth-card fade-in">
    <h1>${reg ? 'Tạo tài khoản giáo viên' : 'Đăng nhập'}</h1>
    <p class="muted">${reg ? 'Để tạo đề, giao bài và xem kết quả của học sinh.' : 'Dành cho giáo viên quản lý đề và lớp học.'}</p>
    <form id="f" class="col mt">
      ${reg ? '<label class="field">Họ và tên<input type="text" name="name" required autocomplete="name"></label><label class="field">Trường (không bắt buộc)<input type="text" name="school"></label>' : ''}
      <label class="field">Email<input type="email" name="email" required autocomplete="email"></label>
      <label class="field">Mật khẩu<input type="password" name="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary lg block mt-s">${reg ? 'Đăng ký' : 'Đăng nhập'}</button>
    </form>
    <p class="small muted mt">${reg ? 'Đã có tài khoản? <a href="/dang-nhap">Đăng nhập</a>' : 'Chưa có tài khoản? <a href="/dang-ky">Đăng ký miễn phí</a>'}</p>
  </div></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(e.target));
      const r = await api('POST', reg ? '/api/auth/register' : '/api/auth/login', data, { noRedirect: true });
      state.user = r.user;
      toast(reg ? 'Tạo tài khoản thành công' : 'Chào mừng trở lại!', 'ok');
      const next = query().next;
      navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  };
}

// ---------- Học sinh: thông tin đề ----------
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } },
};

export async function lobby(code) {
  code = code.toUpperCase();
  app().innerHTML = `${publicTopbar()}<div class="loading-page"><div class="spinner"></div></div>`;
  let ex;
  try { ex = (await api('GET', '/api/public/exam/' + encodeURIComponent(code))).exam; }
  catch (e) {
    app().innerHTML = `${publicTopbar()}<div class="container narrow"><div class="card empty mt">${icon.alert}<h2>${esc(e.message)}</h2><p>Kiểm tra lại mã đề với giáo viên.</p><a class="btn" href="/">← Nhập mã khác</a></div></div>`;
    return;
  }
  const saved = LS.get('tn:last:' + code);
  let prev = null;
  if (saved && saved.token) {
    try { prev = await api('GET', '/api/public/attempt/' + saved.token); prev.token = saved.token; } catch (_) { LS.del('tn:last:' + code); }
  }
  const types = [];
  if (ex.types.mc) types.push(`${ex.types.mc} trắc nghiệm`);
  if (ex.types.tf) types.push(`${ex.types.tf} đúng/sai`);
  if (ex.types.short) types.push(`${ex.types.short} trả lời ngắn`);
  if (ex.types.essay) types.push(`${ex.types.essay} tự luận`);
  const win = ex.window;
  const ident = saved || {};
  app().innerHTML = `${publicTopbar()}<div class="container narrow fade-in">
    <div class="card mt">
      <div class="row between"><span class="code-pill">${esc(ex.code)}</span>${ex.subject ? `<span class="badge">${esc(ex.subject)}${ex.grade ? ' · ' + esc(ex.grade) : ''}</span>` : ''}</div>
      <h1 class="mt">${esc(ex.title)}</h1>
      ${ex.description ? `<p class="muted">${esc(ex.description)}</p>` : ''}
      <div class="grid c3 mt">
        <div class="stat"><div class="ico">${icon.list}</div><div><div class="num">${ex.questionCount}</div><div class="lbl">câu hỏi</div></div></div>
        <div class="stat"><div class="ico">${icon.clock}</div><div><div class="num">${ex.duration ? ex.duration + "'" : '∞'}</div><div class="lbl">${ex.duration ? 'phút làm bài' : 'không giới hạn'}</div></div></div>
        <div class="stat"><div class="ico">${icon.refresh}</div><div><div class="num">${ex.maxAttempts || '∞'}</div><div class="lbl">lượt làm</div></div></div>
      </div>
      <p class="small muted mt">${types.join(' · ')}${ex.teacher ? ` · Giáo viên: <b>${esc(ex.teacher)}</b>` : ''}${ex.school ? ' · ' + esc(ex.school) : ''}</p>
      ${ex.startAt || ex.endAt ? `<p class="small muted">${ex.startAt ? 'Mở: ' + fmtDate(ex.startAt) : ''}${ex.startAt && ex.endAt ? ' — ' : ''}${ex.endAt ? 'Đóng: ' + fmtDate(ex.endAt) : ''}</p>` : ''}
    </div>
    ${prev && prev.status === 'doing' ? `<div class="alert info mt">${icon.info}<div class="grow">Bạn đang làm dở bài này (<b>${esc(prev.studentName || ident.name || '')}</b>).</div><a class="btn primary sm" href="/lam-bai/${prev.token}">Tiếp tục làm bài</a></div>` : ''}
    ${prev && prev.status === 'submitted' ? `<div class="alert ok mt">${icon.check}<div class="grow">Bạn đã nộp bài này.</div><a class="btn sm" href="/ket-qua/${prev.token}">Xem kết quả</a></div>` : ''}
    <div class="card mt">
      ${win.open ? '' : `<div class="alert warn mb">${icon.alert}<div>${esc(win.reason)}</div></div>`}
      <h2>Thông tin thí sinh</h2>
      <form id="start" class="col mt-s">
        ${ex.identity === 'roster' ? rosterFields(ex, ident) : `
          <label class="field">Họ và tên *<input type="text" name="name" required value="${esc(ident.name || '')}" autocomplete="name"></label>
          <div class="grid c2">
            <label class="field">Lớp ${ex.requireClass ? '*' : ''}<input type="text" name="className" ${ex.requireClass ? 'required' : ''} value="${esc(ident.className || '')}"></label>
            <label class="field">Số báo danh / Mã HS ${ex.requireCode ? '*' : ''}<input type="text" name="studentCode" ${ex.requireCode ? 'required' : ''} value="${esc(ident.studentCode || '')}"></label>
          </div>`}
        ${ex.needPassword ? `<label class="field">Mật khẩu đề *<input type="password" name="password" required></label>` : ''}
        <button class="btn primary lg block mt-s" ${win.open ? '' : 'disabled'}>${icon.play} Bắt đầu làm bài</button>
        <p class="hint">Bài làm được lưu tự động. Nếu mất mạng hoặc tải lại trang, bạn vẫn có thể làm tiếp.</p>
      </form>
    </div></div>`;
  if (ex.identity === 'roster') bindRoster(ex);
  $('#start').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button.primary', e.target);
    const data = Object.fromEntries(new FormData(e.target));
    btn.disabled = true;
    try {
      const r = await api('POST', `/api/public/exam/${encodeURIComponent(code)}/start`, data);
      LS.set('tn:last:' + code, { token: r.token, name: data.name, className: data.className, studentCode: data.studentCode, studentId: data.studentId });
      LS.set('tn:attempt:' + r.token, { payload: r, at: Date.now() });
      navigate('/lam-bai/' + r.token);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  };
}

function rosterFields(ex, ident) {
  if (!ex.rosters.length) return '<div class="alert warn">Đề này yêu cầu chọn tên trong danh sách lớp nhưng giáo viên chưa gán lớp.</div>';
  return `<label class="field">Lớp *<select name="classId" id="r-class">${ex.rosters.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="field">Tìm tên<input type="search" id="r-search" placeholder="Gõ để lọc..."></label>
    <label class="field">Chọn tên của bạn *<select name="studentId" id="r-student" required size="6" style="height:auto"></select></label>
    ${ex.requireCode ? '<label class="field">Mã học sinh *<input type="text" name="studentCode" required></label>' : ''}
    <input type="hidden" data-pref="${esc(ident.studentId || '')}">`;
}
function bindRoster(ex) {
  if (!ex.rosters.length) return;
  const cs = $('#r-class'), ss = $('#r-student'), q = $('#r-search');
  const pref = $('input[data-pref]').dataset.pref;
  if (pref) { const c = ex.rosters.find((r) => r.students.some((s) => s.id === pref)); if (c) cs.value = c.id; }
  const fill = () => {
    const c = ex.rosters.find((r) => r.id === cs.value);
    const term = q.value.trim().toLowerCase();
    ss.innerHTML = c.students.filter((s) => !term || s.name.toLowerCase().includes(term)).map((s) => `<option value="${s.id}" ${s.id === pref ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  };
  cs.onchange = fill; q.oninput = fill; fill();
}

// ---------- Làm bài ----------
const OPT = 'ABCDEFGHIJ', TFL = 'abcdefghij';
function optCols(options) {
  const lens = options.map((o) => ({ len: o.html.replace(/<[^>]+>/g, '').length + (o.html.includes('class="math') ? 12 : 0), img: /<img(?![^>]*inline-img)/.test(o.html) }));
  if (lens.some((l) => l.img)) return options.length === 4 ? 'cols-2' : '';
  const max = Math.max(...lens.map((l) => l.len));
  if (max <= 24 && options.length === 4) return 'cols-4';
  if (max <= 55) return 'cols-2';
  return '';
}

function questionHtml(q, i, ans, review) {
  const r = review || null;
  let body = '';
  if (q.type === 'mc' || q.type === 'multi') {
    const given = ans == null ? [] : Array.isArray(ans) ? ans : [ans];
    body = `<div class="opts ${optCols(q.options)}">${q.options.map((o, k) => {
      let cls = given.includes(o.id) ? 'sel' : '';
      if (r) { const ok = (r.correct || []).includes(o.id); cls = ok ? 'right' : given.includes(o.id) ? 'wrong' : ''; }
      return `<button type="button" class="opt ${cls}" data-q="${q.id}" data-o="${o.id}" ${r ? 'disabled' : ''}><span class="key">${OPT[k]}</span><span class="txt">${o.html}</span></button>`;
    }).join('')}</div>${q.type === 'multi' ? `<p class="hint mt-s">Câu có nhiều đáp án đúng${q.multiCount ? ` (chọn ${q.multiCount} đáp án)` : ''}.</p>` : ''}`;
  } else if (q.type === 'tf') {
    const a = ans || {};
    body = `<div class="col" style="gap:8px">${q.options.map((o, k) => {
      const v = a[o.id];
      let cls = '';
      if (r && r.correct) cls = v === undefined ? '' : v === r.correct[o.id] ? 'right' : 'wrong';
      return `<div class="tf-row ${cls}"><b>${TFL[k]})</b><div class="txt">${o.html}</div>
        <div class="tf-btns"><button type="button" class="t ${v === true ? 'on' : ''}" data-q="${q.id}" data-o="${o.id}" data-v="1" ${r ? 'disabled' : ''}>Đúng</button>
        <button type="button" class="f ${v === false ? 'on' : ''}" data-q="${q.id}" data-o="${o.id}" data-v="0" ${r ? 'disabled' : ''}>Sai</button></div>
        ${r && r.correct ? `<span class="badge ${r.correct[o.id] ? 'green' : 'red'}">${r.correct[o.id] ? 'Đ' : 'S'}</span>` : ''}</div>`;
    }).join('')}</div>`;
  } else if (q.type === 'short') {
    body = `<label class="field" style="max-width:360px">Câu trả lời<input type="text" data-short="${q.id}" value="${esc(ans || '')}" ${r ? 'disabled' : ''} placeholder="Nhập đáp số..." autocomplete="off"></label>
      ${r ? `<p class="mt-s small">Đáp án đúng: <b>${esc(r.correct || '—')}</b></p>` : ''}`;
  } else {
    const a = ans || { text: '', images: [] };
    body = `<textarea data-essay="${q.id}" rows="5" placeholder="Nhập bài làm..." ${r ? 'disabled' : ''}>${esc(a.text || '')}</textarea>
      <div class="row mt-s" data-imgs="${q.id}">${(a.images || []).map((u) => `<a href="${esc(u)}" target="_blank"><img src="${esc(u)}" style="height:80px;border-radius:8px;border:1px solid var(--line)"></a>${r ? '' : `<button type="button" class="btn sm ghost" data-rmimg="${q.id}" data-url="${esc(u)}">${icon.x}</button>`}`).join('')}
      ${r ? '' : `<label class="btn sm">${icon.image} Thêm ảnh bài làm<input type="file" accept="image/*" data-upimg="${q.id}" hidden multiple></label>`}</div>`;
  }
  let status = '';
  if (r) {
    const map = { correct: ['green', 'Đúng'], wrong: ['red', 'Sai'], partial: ['amber', 'Đúng một phần'], blank: ['gray', 'Chưa làm'], pending: ['blue', 'Chờ chấm'], nokey: ['gray', 'Chưa có đáp án'] };
    const [c, t] = map[r.status] || ['gray', r.status || ''];
    status = `<span class="badge ${c}">${t}</span> <span class="small muted">${fmtNum(r.earned)}/${fmtNum(r.max)} điểm</span>`;
  }
  return `<div class="question" id="q-${q.id}">
    <div class="qhead"><span class="qlabel">Câu ${i + 1}</span>
      <span class="row" style="gap:6px">${status}${r ? '' : `<span class="small muted">${fmtNum(q.points)} điểm</span><button type="button" class="flag-btn" data-flag="${q.id}">${icon.flag} Đánh dấu</button>`}</span></div>
    <div class="qcontent">${q.content || ''}</div>${body}
    ${r && r.explanation ? `<div class="expl"><b>Lời giải:</b> ${r.explanation}</div>` : ''}
  </div>`;
}

function partTitle(parts, idx) {
  const p = parts.find((x) => x.index === idx);
  return p && p.title ? p.title : `Phần ${idx}`;
}

export async function take(token) {
  app().innerHTML = '<div class="loading-page"><div class="spinner"></div></div>';
  let P;
  const backup = LS.get('tn:answers:' + token);
  try {
    P = await api('GET', '/api/public/attempt/' + token);
  } catch (e) {
    const cached = LS.get('tn:attempt:' + token);
    if (!cached) throw e;
    P = { status: 'doing', ...cached.payload };
    toast('Đang làm bài ngoại tuyến — sẽ lưu khi có mạng lại', 'error');
  }
  if (P.status !== 'doing') { navigate('/ket-qua/' + token, { replace: true }); return; }
  LS.set('tn:attempt:' + token, { payload: P, at: Date.now() });
  const offset = P.serverNow - Date.now();
  const answers = { ...(P.answers || {}) };
  if (backup && backup.answers && backup.at > (P.serverNow - 3600 * 1000)) {
    for (const [k, v] of Object.entries(backup.answers)) if (answers[k] === undefined) answers[k] = v;
  }
  const flags = new Set(LS.get('tn:flags:' + token) || []);
  let tabSwitches = Math.max(P.tabSwitches || 0, (backup && backup.tabSwitches) || 0);
  const pendingEvents = [];
  let submitted = false, dirty = false;
  const qs = P.questions;

  document.body.classList.add('taking');
  let lastPart = null;
  const qHtml = qs.map((q, i) => {
    let head = '';
    if (P.parts && P.parts.length && q.part && q.part !== lastPart) { head = `<div class="part-head">${esc(partTitle(P.parts, q.part))}</div>`; lastPart = q.part; }
    return head + questionHtml(q, i, answers[q.id]);
  }).join('');
  app().innerHTML = `<div class="exam-top"><div class="inner">
      <div class="grow exam-title"><div style="font-weight:700;line-height:1.2" class="nowrap" title="${esc(P.examTitle)}">${esc(P.examTitle.length > 60 ? P.examTitle.slice(0, 58) + '…' : P.examTitle)}</div>
        <div class="small muted">${esc(P.studentName)}${P.studentClass ? ' · ' + esc(P.studentClass) : ''} <span class="save-state" id="save-state"></span></div></div>
      <div class="timer" id="timer">${icon.clock}<span>--:--</span></div>
      <button class="btn primary" id="submit-btn">${icon.send}<span class="hide-sm">Nộp bài</span></button>
    </div></div>
    <div class="exam-layout ${P.settings.blockCopy ? 'no-select' : ''}">
      <main id="qlist">${qHtml}</main>
      <aside class="card sheet" id="sheet">
        <div class="row between" id="sheet-toggle" style="cursor:pointer"><h3 style="margin:0">Phiếu trả lời</h3><span class="small muted" id="done-count"></span></div>
        <div class="sheet-grid mt" id="sheet-grid"></div>
        <div class="row small muted mt" style="gap:14px"><span><span class="dot" style="background:var(--primary)"></span> Đã làm</span><span><span class="dot" style="background:var(--accent)"></span> Đánh dấu</span></div>
        <button class="btn primary block mt" id="submit-btn2">${icon.send} Nộp bài</button>
      </aside></div>`;
  renderMath($('#qlist'));

  const isDone = (q) => {
    const a = answers[q.id];
    if (a == null) return false;
    if (q.type === 'tf') return Object.keys(a).length >= q.options.length;
    if (q.type === 'multi') return a.length > 0;
    if (q.type === 'essay') return !!((a.text && a.text.trim()) || (a.images && a.images.length));
    return String(a).trim() !== '';
  };
  const shortAns = (q) => {
    const a = answers[q.id];
    if (a == null) return '';
    if (q.type === 'mc') { const k = q.options.findIndex((o) => o.id === a); return k >= 0 ? OPT[k] : ''; }
    if (q.type === 'multi') return a.map((id) => OPT[q.options.findIndex((o) => o.id === id)]).sort().join('');
    if (q.type === 'tf') return q.options.map((o) => (a[o.id] === true ? 'Đ' : a[o.id] === false ? 'S' : '·')).join('');
    return '✓';
  };
  const renderSheet = () => {
    $('#sheet-grid').innerHTML = qs.map((q, i) => `<button type="button" class="${isDone(q) ? 'done' : ''} ${flags.has(q.id) ? 'flag' : ''}" data-go="${q.id}">${i + 1}<span class="ans">${esc(shortAns(q)) || '&nbsp;'}</span></button>`).join('');
    $('#done-count').textContent = `${qs.filter(isDone).length}/${qs.length} câu`;
    for (const b of $$('[data-flag]')) b.classList.toggle('on', flags.has(b.dataset.flag));
  };
  renderSheet();

  const saveState = (t, err) => { const s = $('#save-state'); if (s) { s.textContent = t; s.classList.toggle('err', !!err); } };
  const backupLocal = () => LS.set('tn:answers:' + token, { answers, tabSwitches, at: Date.now() + offset });
  const doSave = async () => {
    if (submitted) return;
    dirty = false;
    saveState('· Đang lưu...');
    try {
      const r = await api('POST', `/api/public/attempt/${token}/save`, { answers, tabSwitches, events: pendingEvents.splice(0) });
      if (r.status === 'submitted') { submitted = true; toast('Bài đã được nộp (hết giờ)', 'error'); navigate('/ket-qua/' + token, { replace: true }); return; }
      saveState('· Đã lưu ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) { dirty = true; saveState('· Chưa lưu được (mất mạng?)', true); }
  };
  const save = debounce(doSave, 1200);
  const changed = () => { dirty = true; backupLocal(); renderSheet(); save(); };

  const ql = $('#qlist');
  ql.addEventListener('click', async (e) => {
    const opt = e.target.closest('.opt[data-o]');
    if (opt) {
      const q = qs.find((x) => x.id === opt.dataset.q);
      if (q.type === 'mc') {
        answers[q.id] = answers[q.id] === opt.dataset.o ? undefined : opt.dataset.o;
        if (answers[q.id] === undefined) delete answers[q.id];
        for (const b of $$(`.opt[data-q="${q.id}"]`)) b.classList.toggle('sel', b.dataset.o === answers[q.id]);
      } else {
        const cur = new Set(answers[q.id] || []);
        if (cur.has(opt.dataset.o)) cur.delete(opt.dataset.o); else cur.add(opt.dataset.o);
        if (cur.size) answers[q.id] = [...cur]; else delete answers[q.id];
        opt.classList.toggle('sel', cur.has(opt.dataset.o));
      }
      changed();
      return;
    }
    const tf = e.target.closest('.tf-btns button');
    if (tf) {
      const qid = tf.dataset.q, oid = tf.dataset.o, v = tf.dataset.v === '1';
      const a = { ...(answers[qid] || {}) };
      if (a[oid] === v) delete a[oid]; else a[oid] = v;
      if (Object.keys(a).length) answers[qid] = a; else delete answers[qid];
      const row = tf.closest('.tf-btns');
      for (const b of $$('button', row)) b.classList.toggle('on', a[oid] === (b.dataset.v === '1'));
      changed();
      return;
    }
    const fl = e.target.closest('[data-flag]');
    if (fl) {
      const id = fl.dataset.flag;
      if (flags.has(id)) flags.delete(id); else flags.add(id);
      LS.set('tn:flags:' + token, [...flags]);
      renderSheet();
      return;
    }
    const rm = e.target.closest('[data-rmimg]');
    if (rm) {
      const a = answers[rm.dataset.rmimg];
      a.images = a.images.filter((u) => u !== rm.dataset.url);
      rerenderEssay(rm.dataset.rmimg);
      changed();
    }
  });
  ql.addEventListener('input', (e) => {
    const s = e.target.closest('[data-short]');
    if (s) { if (s.value.trim()) answers[s.dataset.short] = s.value; else delete answers[s.dataset.short]; changed(); return; }
    const es = e.target.closest('[data-essay]');
    if (es) { const a = answers[es.dataset.essay] || { text: '', images: [] }; a.text = es.value; answers[es.dataset.essay] = a; changed(); }
  });
  ql.addEventListener('change', async (e) => {
    const up = e.target.closest('[data-upimg]');
    if (!up) return;
    const qid = up.dataset.upimg;
    for (const f of up.files) {
      const fd = new FormData(); fd.append('file', f);
      try {
        const r = await api('POST', `/api/public/attempt/${token}/upload`, fd);
        const a = answers[qid] || { text: '', images: [] };
        a.images = [...(a.images || []), r.url];
        answers[qid] = a;
      } catch (err) { toast(err.message, 'error'); }
    }
    rerenderEssay(qid);
    changed();
  });
  function rerenderEssay(qid) {
    const q = qs.find((x) => x.id === qid);
    const i = qs.indexOf(q);
    const node = $('#q-' + qid);
    node.outerHTML = questionHtml(q, i, answers[qid]);
    renderMath($('#q-' + qid));
  }
  $('#sheet-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    $('#q-' + b.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#sheet').classList.remove('open');
  });
  $('#sheet-toggle').onclick = () => $('#sheet').classList.toggle('open');

  // Đồng hồ
  const timerEl = $('#timer span');
  let timerId = null;
  const tick = () => {
    if (!P.deadline) { const el2 = Math.floor((Date.now() + offset - P.startedAt) / 1000); timerEl.textContent = clock(el2); return; }
    const left = Math.floor((P.deadline - (Date.now() + offset)) / 1000);
    timerEl.textContent = clock(Math.max(0, left));
    $('#timer').classList.toggle('low', left <= 300);
    if (left <= 0 && !submitted) { clearInterval(timerId); doSubmit('Hết giờ - tự động nộp bài'); }
  };
  timerId = setInterval(tick, 1000);
  tick();
  const autoSave = setInterval(() => { if (dirty) doSave(); }, 15000);

  // Chống gian lận
  let away = false;
  const goAway = () => {
    if (submitted || away || !P.settings.detectTab) return;
    away = true;
    tabSwitches++;
    pendingEvents.push({ t: Date.now() + offset, e: `Rời khỏi màn hình làm bài (lần ${tabSwitches})` });
    backupLocal();
    doSave();
  };
  const comeBack = () => {
    if (!away) return;
    away = false;
    if (submitted) return;
    const max = P.settings.maxTabSwitches;
    if (max && tabSwitches > max) { doSubmit(`Tự động nộp do rời màn hình quá ${max} lần`); return; }
    modal({ title: 'Cảnh báo', body: `<div class="alert warn">${icon.alert}<div>Bạn vừa rời khỏi màn hình làm bài (lần thứ <b>${tabSwitches}</b>). Hành động này đã được ghi lại và giáo viên có thể xem.${max ? ` Quá <b>${max}</b> lần bài sẽ tự động nộp.` : ''}</div></div>`, actions: [{ label: 'Tiếp tục làm bài', cls: 'primary' }] });
  };
  const onVis = () => (document.hidden ? goAway() : comeBack());
  const onBlur = () => setTimeout(() => { if (!document.hasFocus()) goAway(); }, 300);
  const onFocus = () => comeBack();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  const block = (e) => { if (P.settings.blockCopy && !e.target.closest('input,textarea')) e.preventDefault(); };
  document.addEventListener('copy', block);
  document.addEventListener('contextmenu', block);
  const flushOnHide = () => {
    if (submitted) return;
    try { fetch(`/api/public/attempt/${token}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, tabSwitches, events: pendingEvents.splice(0) }), keepalive: true }); } catch (_) { /* ignore */ }
  };
  window.addEventListener('pagehide', flushOnHide);
  window.onbeforeunload = (e) => { if (!submitted) { flushOnHide(); e.preventDefault(); e.returnValue = ''; } };
  setLeaveGuard(() => submitted || confirm('Bạn đang làm bài. Rời trang? (Bài làm đã được lưu, có thể quay lại làm tiếp)'));

  onLeave(() => {
    clearInterval(timerId); clearInterval(autoSave);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('copy', block);
    document.removeEventListener('contextmenu', block);
    window.removeEventListener('pagehide', flushOnHide);
  });

  async function doSubmit(auto) {
    if (submitted) return;
    submitted = true;
    const m = modal({ title: 'Đang nộp bài...', body: '<div class="loading-page" style="padding:20px"><div class="spinner"></div></div>' });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await api('POST', `/api/public/attempt/${token}/submit`, { answers, tabSwitches, events: pendingEvents.splice(0), auto: auto || undefined });
        LS.del('tn:answers:' + token); LS.del('tn:flags:' + token); LS.del('tn:attempt:' + token);
        m.close();
        toast(auto || 'Nộp bài thành công', 'ok');
        navigate('/ket-qua/' + token, { replace: true });
        return;
      } catch (e) {
        if (e.status && e.status < 500) { m.close(); toast(e.message, 'error'); navigate('/ket-qua/' + token, { replace: true }); return; }
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    m.close();
    submitted = false;
    toast('Không nộp được bài do mất mạng. Bài đã lưu trên máy, hãy thử lại.', 'error');
  }
  const askSubmit = () => {
    const left = qs.filter((q) => !isDone(q));
    modal({
      title: 'Nộp bài?',
      body: left.length ? `<div class="alert warn">${icon.alert}<div>Bạn còn <b>${left.length}</b> câu chưa làm hoặc làm chưa đủ: ${left.slice(0, 30).map((q) => 'Câu ' + (qs.indexOf(q) + 1)).join(', ')}${left.length > 30 ? '...' : ''}</div></div>` : '<p>Bạn đã làm hết các câu. Xác nhận nộp bài?</p>',
      actions: [{ label: 'Làm tiếp' }, { label: 'Nộp bài', cls: 'primary', onClick: () => { doSubmit(); } }],
    });
  };
  $('#submit-btn').onclick = askSubmit;
  $('#submit-btn2').onclick = askSubmit;
}
function clock(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

// ---------- Kết quả ----------
export async function result(token) {
  app().innerHTML = `${publicTopbar()}<div class="loading-page"><div class="spinner"></div></div>`;
  const R = await api('GET', `/api/public/attempt/${token}/result`);
  if (R.status === 'doing') { navigate('/lam-bai/' + token, { replace: true }); return; }
  const hasScore = R.score !== undefined && R.score !== null;
  const pct = hasScore && R.maxScore ? R.score / R.maxScore : 0;
  const color = pct >= 0.8 ? 'var(--ok)' : pct >= 0.5 ? 'var(--accent)' : 'var(--danger)';
  let reviewHtml = '';
  if (R.review) {
    let lastPart = null;
    reviewHtml = R.review.questions.map((q, i) => {
      let head = '';
      if (R.review.parts && R.review.parts.length && q.part && q.part !== lastPart) { head = `<div class="part-head">${esc(partTitle(R.review.parts, q.part))}</div>`; lastPart = q.part; }
      return head + questionHtml(q, i, R.review.answers[q.id], q);
    }).join('');
  }
  app().innerHTML = `${publicTopbar()}<div class="container narrow fade-in">
    <div class="card mt" style="text-align:center">
      <p class="muted small" style="margin:0">${esc(R.studentName)}${R.studentClass ? ' · ' + esc(R.studentClass) : ''}</p>
      <h2 class="mt-s">${esc(R.examTitle)}</h2>
      ${hasScore ? `<div class="score-ring mt" style="background:conic-gradient(${color} ${pct * 360}deg, #edf1ef 0)"><div style="background:#fff;width:124px;height:124px;border-radius:50%;display:grid;place-items:center"><div><div class="val" style="color:${color}">${fmtNum(R.score)}</div><div class="of">/ ${fmtNum(R.maxScore)} điểm</div></div></div></div>
        <div class="row mt" style="justify-content:center;gap:28px">
          <div><div style="font-size:22px;font-weight:700">${R.correct}/${R.total}</div><div class="small muted">câu đúng hoàn toàn</div></div>
          <div><div style="font-size:22px;font-weight:700">${fmtDur((R.submittedAt - R.startedAt) / 1000)}</div><div class="small muted">thời gian làm</div></div>
        </div>
        ${R.pending ? `<div class="alert info mt" style="text-align:left">${icon.info}<div>Có ${R.pending} câu tự luận đang chờ giáo viên chấm — điểm có thể thay đổi.</div></div>` : ''}`
      : `<div class="alert ok mt" style="text-align:left">${icon.check}<div>Bạn đã nộp bài thành công lúc ${fmtDate(R.submittedAt)}. Giáo viên chưa công bố điểm.</div></div>`}
      ${R.comment ? `<div class="alert info mt" style="text-align:left">${icon.info}<div><b>Nhận xét của giáo viên:</b> ${esc(R.comment)}</div></div>` : ''}
      ${R.reviewNote ? `<p class="small muted mt">${esc(R.reviewNote)}</p>` : ''}
      <div class="row mt" style="justify-content:center"><a class="btn" href="/de/${esc(R.code)}">Về trang đề</a><a class="btn" href="/">Trang chủ</a></div>
    </div>
    ${R.review ? `<h2 class="mt" style="margin-top:28px">Xem lại bài làm</h2>${reviewHtml}` : ''}
  </div>`;
  renderMath(app());
}

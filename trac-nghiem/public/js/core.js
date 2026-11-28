// Tiện ích dùng chung: API, router, hộp thoại, biểu tượng, công thức toán.
export const state = { user: undefined };

export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icon = {
  home: P('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  file: P('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  upload: P('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  users: P('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.6 3 5.2"/>'),
  chart: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  check: P('<path d="M20 6 9 17l-5-5"/>'),
  x: P('<path d="M18 6 6 18M6 6l12 12"/>'),
  flag: P('<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>'),
  copy: P('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  edit: P('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  print: P('<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'),
  download: P('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  menu: P('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  folder: P('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  link: P('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  play: P('<path d="M6 4l14 8-14 8z"/>'),
  list: P('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  award: P('<circle cx="12" cy="9" r="6"/><path d="m8.2 13.8-1.7 7.2 5.5-3 5.5 3-1.7-7.2"/>'),
  alert: P('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  image: P('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  up: P('<path d="m18 15-6-6-6 6"/>'),
  down: P('<path d="m6 9 6 6 6-6"/>'),
  refresh: P('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  share: P('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  back: P('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  lock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  send: P('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'),
  book: P('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>'),
  sparkle: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
  type: P('<path d="M4 7V4h16v3M9 20h6M12 4v16"/>'),
  layers: P('<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  shield: P('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  grid: P('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
};

export async function api(method, url, body, opts = {}) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); } catch (e) { throw new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'); }
  let data = null;
  try { data = await res.json(); } catch (_) { /* ignore */ }
  if (!res.ok) {
    if (res.status === 401 && !opts.noRedirect) { state.user = null; navigate('/dang-nhap?next=' + encodeURIComponent(location.pathname)); }
    const err = new Error((data && data.error) || `Lỗi ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function toast(msg, type = '') {
  const t = el(`<div class="toast ${type}">${esc(msg)}</div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, type === 'error' ? 4500 : 2600);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const back = el(`<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title || '')}</h2><button class="btn ghost icon" data-x aria-label="Đóng">${icon.x}</button></div>
    <div class="modal-body"></div><div class="modal-foot"></div></div></div>`);
  const bodyEl = $('.modal-body', back);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const foot = $('.modal-foot', back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  for (const a of actions) {
    const b = el(`<button class="btn ${a.cls || ''}">${esc(a.label)}</button>`);
    b.onclick = async () => {
      if (a.onClick) {
        b.disabled = true;
        try { const r = await a.onClick({ close, body: bodyEl, button: b }); if (r !== false) close(); } catch (e) { toast(e.message, 'error'); } finally { b.disabled = false; }
      } else close();
    };
    foot.appendChild(b);
  }
  if (!actions.length) foot.remove();
  $('[data-x]', back).onclick = close;
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  const first = $('input, select, textarea', bodyEl);
  if (first) setTimeout(() => first.focus(), 30);
  renderMath(bodyEl);
  return { close, body: bodyEl, root: back };
}
export function confirmDialog(msg, { title = 'Xác nhận', ok = 'Đồng ý', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: `<p>${msg}</p>`,
      actions: [{ label: 'Huỷ' }, { label: ok, cls: danger ? 'solid-danger' : 'primary', onClick: () => { done = true; resolve(true); } }],
      onClose: () => { if (!done) resolve(false); },
    });
  });
}
export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Lưu', textarea = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = textarea ? `<textarea id="pd-in" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input type="text" id="pd-in" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
    const m = modal({
      title, body: `<label class="field">${esc(label)}${input}</label>`,
      actions: [{ label: 'Huỷ' }, { label: ok, cls: 'primary', onClick: ({ body }) => { done = true; resolve($('#pd-in', body).value); } }],
      onClose: () => { if (!done) resolve(null); },
    });
    const inp = $('#pd-in', m.body);
    if (!textarea) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; resolve(inp.value); m.close(); } });
  });
}

// ---------- Công thức ----------
export function renderMath(root, { editable = false } = {}) {
  if (!root) return;
  const els = root.matches && root.matches('span.math') ? [root] : $$('span.math[data-latex]', root);
  for (const m of els) {
    const tex = (m.getAttribute('data-latex') || '').replace(/(\d),(?=\d)/g, '$1{,}');
    if (editable) m.setAttribute('contenteditable', 'false');
    if (window.katex) {
      try { window.katex.render(tex, m, { throwOnError: false, displayMode: m.classList.contains('math-display'), strict: false, trust: false }); }
      catch (_) { m.textContent = tex; }
    } else m.textContent = tex;
  }
}
// Lấy HTML từ vùng soạn thảo, xoá phần hiển thị KaTeX
export function cleanEditableHtml(node) {
  const c = node.cloneNode(true);
  for (const m of $$('span.math', c)) { m.innerHTML = ''; m.removeAttribute('contenteditable'); }
  let h = c.innerHTML.replace(/<div><br><\/div>/g, '<br>').replace(/&nbsp;/g, ' ').trim();
  if (h === '<br>') h = '';
  return h;
}

// ---------- Định dạng ----------
export function fmtDate(t, withTime = true) {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` + (withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : '');
}
export function fmtDur(sec) {
  if (sec == null) return '—';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s} giây` : `${s} giây`;
}
export function fmtNum(x, d = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ',');
}
export function toLocalInput(t) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function debounce(fn, ms) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); return fn(...a); };
  return f;
}
export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast('Đã sao chép', 'ok'));
  const ta = el('<textarea style="position:fixed;opacity:0"></textarea>');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Đã sao chép', 'ok'); } catch (_) { toast('Không sao chép được', 'error'); }
  ta.remove();
  return Promise.resolve();
}
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) && window.XLSX) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Không tải được thư viện'));
    document.head.appendChild(s);
  });
}
export const TYPE_NAME = { mc: 'Một đáp án', multi: 'Nhiều đáp án', tf: 'Đúng / Sai', short: 'Trả lời ngắn', essay: 'Tự luận' };
export function plainText(html) {
  const d = document.createElement('div');
  d.innerHTML = String(html || '').replace(/<span class="math[^"]*" data-latex="([^"]*)"[^>]*>(?:<\/span>)?/g, ' $1 ');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

// ---------- Router ----------
const routes = [];
export function route(pattern, handler) { routes.push({ pattern, handler }); }
let cleanup = null;
export function onLeave(fn) { cleanup = fn; }
let leaveGuard = null;
export function setLeaveGuard(fn) { leaveGuard = fn; }

export async function navigate(path, { replace = false } = {}) {
  if (leaveGuard && !leaveGuard()) return;
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  await render();
}
export async function render() {
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
  leaveGuard = null;
  window.onbeforeunload = null;
  document.body.className = '';
  const path = location.pathname;
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      window.scrollTo(0, 0);
      try { await r.handler(...m.slice(1).map(decodeURIComponent)); }
      catch (e) {
        console.error(e);
        $('#app').innerHTML = `<div class="container narrow"><div class="card mt"><div class="alert error">${icon.alert}<div>${esc(e.message)}</div></div><p class="mt"><a href="/">← Về trang chủ</a></p></div></div>`;
      }
      return;
    }
  }
  $('#app').innerHTML = '<div class="container narrow"><div class="card empty"><h2>Không tìm thấy trang</h2><a href="/">Về trang chủ</a></div></div>';
}
window.addEventListener('popstate', () => {
  if (leaveGuard && !leaveGuard()) { history.pushState({}, '', window.__lastPath || '/'); return; }
  render();
});
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/uploads/')) return;
  e.preventDefault();
  navigate(href);
});
const _push = history.pushState.bind(history);
history.pushState = (...a) => { window.__lastPath = location.pathname; return _push(...a); };

export function query() { return Object.fromEntries(new URLSearchParams(location.search)); }

'use strict';
// Bộ lọc HTML danh sách trắng cho nội dung câu hỏi (chặn script / thuộc tính sự kiện).

const ALLOWED = {
  b: [], strong: [], i: [], em: [], u: [], s: [], sup: [], sub: [], br: [], p: [], div: [], span: ['class', 'data-latex'],
  img: ['src', 'width', 'height', 'style', 'class', 'alt'], table: ['class'], tbody: [], thead: [], tr: [],
  td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], ul: [], ol: [], li: [], font: [],
};
const VOID = new Set(['br', 'img']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select', 'button', 'head', 'title']);

function escAttr(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escText(t) { return t.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function decode(v) { return String(v).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }

function safeSrc(src) {
  src = decode(src).trim();
  if (/^\/uploads\/[\w.\-/]+$/.test(src) && !src.includes('..')) return src;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src)) return src;
  return null;
}
function safeStyle(st) {
  const out = [];
  for (const part of decode(st).split(';')) {
    const m = part.match(/^\s*(width|height|max-width)\s*:\s*([\d.]+(?:px|%|em)?|auto)\s*$/i);
    if (m) out.push(`${m[1].toLowerCase()}:${m[2]}`);
  }
  return out.join(';');
}

function sanitizeHtml(html) {
  if (html == null) return '';
  html = String(html).replace(/<!--[\s\S]*?-->/g, '');
  let out = '';
  const stack = [];
  let dropDepth = 0;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (!dropDepth) out += escText(html.slice(last, m.index));
    last = re.lastIndex;
    const closing = !!m[1];
    const tag = m[2].toLowerCase();
    if (DROP_CONTENT.has(tag)) {
      if (!closing && !/\/\s*$/.test(m[3])) dropDepth++;
      else if (closing && dropDepth) dropDepth--;
      continue;
    }
    if (dropDepth) continue;
    if (!ALLOWED[tag]) continue;
    if (closing) {
      const idx = stack.lastIndexOf(tag);
      if (idx >= 0) { while (stack.length > idx) out += `</${stack.pop()}>`; }
      continue;
    }
    let attrs = '';
    const are = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a;
    while ((a = are.exec(m[3]))) {
      const name = a[1].toLowerCase();
      const val = a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : a[5] !== undefined ? a[5] : '';
      if (!ALLOWED[tag].includes(name)) continue;
      if (name === 'src') { const s = safeSrc(val); if (s) attrs += ` src="${escAttr(s)}"`; continue; }
      if (name === 'style') { const s = safeStyle(val); if (s) attrs += ` style="${s}"`; continue; }
      if (name === 'class') { const c = decode(val).split(/\s+/).filter((x) => /^(math|math-display|inline-img|q-table)$/.test(x)).join(' '); if (c) attrs += ` class="${c}"`; continue; }
      if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan') { if (/^\d{1,4}$/.test(val)) attrs += ` ${name}="${val}"`; continue; }
      attrs += ` ${name}="${escAttr(decode(val))}"`;
    }
    if (tag === 'img' && !/ src=/.test(attrs)) continue;
    if (tag === 'font') continue;
    out += `<${tag}${attrs}>`;
    if (!VOID.has(tag)) stack.push(tag);
  }
  if (!dropDepth) out += escText(html.slice(last));
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

function cleanText(s, max = 500) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

module.exports = { sanitizeHtml, cleanText };

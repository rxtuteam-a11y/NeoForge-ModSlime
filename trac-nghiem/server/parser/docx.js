// Đọc file .docx thành danh sách đoạn văn (blocks) giữ nguyên định dạng:
// đậm / nghiêng / gạch chân / màu chữ / tô sáng / chỉ số trên-dưới / ảnh / công thức.
'use strict';

const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const path = require('path');
const { ommlToLatex } = require('./omml');

function kids(node) {
  const r = [];
  if (!node || !node.childNodes) return r;
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.nodeType === 1) r.push(c);
  }
  return r;
}
function child(node, name) { return kids(node).find((k) => k.nodeName === name) || null; }
function attr(node, name) { return node ? node.getAttribute(name) : null; }
function onOff(node) {
  if (!node) return undefined;
  const v = attr(node, 'w:val');
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

function parseXml(str) {
  return new DOMParser({ onError: () => {} }).parseFromString(str, 'text/xml');
}

// Đọc thuộc tính định dạng (rPr)
function readRPr(rPr) {
  const f = {};
  if (!rPr) return f;
  const b = child(rPr, 'w:b'); if (b) f.b = onOff(b);
  const i = child(rPr, 'w:i'); if (i) f.i = onOff(i);
  const u = child(rPr, 'w:u'); if (u) f.u = onOff(u);
  const st = child(rPr, 'w:strike'); if (st) f.s = onOff(st);
  const c = child(rPr, 'w:color');
  if (c) {
    const v = (attr(c, 'w:val') || '').toUpperCase();
    f.color = v && v !== 'AUTO' ? v : null;
  }
  const hl = child(rPr, 'w:highlight');
  if (hl) { const v = attr(hl, 'w:val'); f.hl = v && v !== 'none' ? v : null; }
  const shd = child(rPr, 'w:shd');
  if (shd) {
    const fill = (attr(shd, 'w:fill') || '').toUpperCase();
    if (fill && fill !== 'AUTO' && fill !== 'FFFFFF') f.hl = f.hl || fill;
  }
  const va = child(rPr, 'w:vertAlign');
  if (va) { const v = attr(va, 'w:val'); f.sup = v === 'superscript'; f.sub = v === 'subscript'; }
  const rs = child(rPr, 'w:rStyle'); if (rs) f.rStyle = attr(rs, 'w:val');
  const vanish = child(rPr, 'w:vanish'); if (vanish) f.hidden = onOff(vanish);
  return f;
}

function merge(...fs) {
  const out = {};
  for (const f of fs) {
    if (!f) continue;
    for (const k of Object.keys(f)) if (f[k] !== undefined && k !== 'rStyle') out[k] = f[k];
  }
  return out;
}

class Styles {
  constructor(xml) {
    this.map = {};
    this.defaults = {};
    if (!xml) return;
    const doc = parseXml(xml);
    const root = doc.documentElement;
    const dd = child(root, 'w:docDefaults');
    if (dd) {
      const rd = child(dd, 'w:rPrDefault');
      if (rd) this.defaults = readRPr(child(rd, 'w:rPr'));
    }
    for (const s of kids(root).filter((k) => k.nodeName === 'w:style')) {
      const id = attr(s, 'w:styleId');
      const based = child(s, 'w:basedOn');
      this.map[id] = { basedOn: based ? attr(based, 'w:val') : null, rPr: readRPr(child(s, 'w:rPr')), type: attr(s, 'w:type') };
    }
  }
  resolve(id, depth = 0) {
    if (!id || !this.map[id] || depth > 10) return {};
    const s = this.map[id];
    return merge(this.resolve(s.basedOn, depth + 1), s.rPr);
  }
}

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
function toRoman(n) { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }
function toLetter(n) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
function fmtNum(n, fmt) {
  switch (fmt) {
    case 'upperLetter': return toLetter(n);
    case 'lowerLetter': return toLetter(n).toLowerCase();
    case 'upperRoman': return toRoman(n);
    case 'lowerRoman': return toRoman(n).toLowerCase();
    case 'bullet': case 'none': return '';
    default: return String(n);
  }
}

class Numbering {
  constructor(xml) {
    this.abs = {};
    this.nums = {};
    this.counters = {};
    if (!xml) return;
    const root = parseXml(xml).documentElement;
    for (const a of kids(root).filter((k) => k.nodeName === 'w:abstractNum')) {
      const id = attr(a, 'w:abstractNumId');
      const lvls = {};
      for (const l of kids(a).filter((k) => k.nodeName === 'w:lvl')) {
        const il = attr(l, 'w:ilvl');
        const start = child(l, 'w:start');
        const fmt = child(l, 'w:numFmt');
        const txt = child(l, 'w:lvlText');
        lvls[il] = {
          start: start ? parseInt(attr(start, 'w:val'), 10) : 1,
          fmt: fmt ? attr(fmt, 'w:val') : 'decimal',
          text: txt ? attr(txt, 'w:val') || '' : '',
          rPr: readRPr(child(l, 'w:rPr')),
        };
      }
      this.abs[id] = lvls;
    }
    for (const n of kids(root).filter((k) => k.nodeName === 'w:num')) {
      const id = attr(n, 'w:numId');
      const an = child(n, 'w:abstractNumId');
      const overrides = {};
      for (const o of kids(n).filter((k) => k.nodeName === 'w:lvlOverride')) {
        const so = child(o, 'w:startOverride');
        if (so) overrides[attr(o, 'w:ilvl')] = parseInt(attr(so, 'w:val'), 10);
      }
      this.nums[id] = { abs: an ? attr(an, 'w:val') : null, overrides };
    }
  }
  label(numId, ilvl) {
    const num = this.nums[numId];
    if (!num || numId === '0') return null;
    const lvls = this.abs[num.abs];
    if (!lvls) return null;
    const lvl = lvls[ilvl];
    if (!lvl) return null;
    // Bộ đếm dùng chung theo abstractNum (giống Word) nhưng tách theo numId nếu có startOverride
    const key = Object.keys(num.overrides).length ? `n${numId}` : `a${num.abs}`;
    const c = this.counters[key] || (this.counters[key] = {});
    const L = parseInt(ilvl, 10);
    if (c[L] === undefined) c[L] = (num.overrides[ilvl] !== undefined ? num.overrides[ilvl] : lvl.start);
    else c[L]++;
    for (const k of Object.keys(c)) if (parseInt(k, 10) > L) delete c[k];
    if (lvl.fmt === 'bullet' || lvl.fmt === 'none') return null;
    const text = lvl.text.replace(/%(\d)/g, (_, d) => {
      const lv = parseInt(d, 10) - 1;
      const l2 = lvls[String(lv)];
      const val = c[lv] !== undefined ? c[lv] : (l2 ? l2.start : 1);
      return fmtNum(val, l2 ? l2.fmt : 'decimal');
    });
    return { text, rPr: lvl.rPr };
  }
}

async function parseDocx(buffer, saveImage) {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('File không phải định dạng Word .docx hợp lệ');
  const docXml = await docFile.async('string');
  const stylesXml = zip.file('word/styles.xml') ? await zip.file('word/styles.xml').async('string') : null;
  const numXml = zip.file('word/numbering.xml') ? await zip.file('word/numbering.xml').async('string') : null;
  const relsXml = zip.file('word/_rels/document.xml.rels') ? await zip.file('word/_rels/document.xml.rels').async('string') : null;

  const styles = new Styles(stylesXml);
  const numbering = new Numbering(numXml);
  const rels = {};
  if (relsXml) {
    const r = parseXml(relsXml).documentElement;
    for (const rel of kids(r)) rels[attr(rel, 'Id')] = { target: attr(rel, 'Target'), mode: attr(rel, 'TargetMode') };
  }

  const imageCache = {};
  const pendingImages = [];
  async function imageFor(rid, size) {
    const rel = rels[rid];
    if (!rel || rel.mode === 'External') return null;
    let p = rel.target.replace(/^\//, '');
    if (!p.startsWith('word/')) p = path.posix.normalize('word/' + p);
    if (!imageCache[p]) {
      const f = zip.file(p);
      if (!f) return null;
      const data = await f.async('nodebuffer');
      imageCache[p] = saveImage(data, path.posix.extname(p).toLowerCase());
      pendingImages.push(imageCache[p]);
    }
    const url = await imageCache[p];
    return url ? { img: url, w: size && size.w, h: size && size.h } : null;
  }

  const doc = parseXml(docXml);
  const body = doc.getElementsByTagName('w:body')[0];
  const blocks = [];
  const tables = [];

  let cur = null; // đoạn hiện tại
  function newBlock(extra) {
    cur = { runs: [], ...extra };
    blocks.push(cur);
    return cur;
  }

  function emuSize(drawing) {
    const ext = drawing.getElementsByTagName('wp:extent')[0];
    if (!ext) return null;
    const cx = parseInt(attr(ext, 'cx'), 10), cy = parseInt(attr(ext, 'cy'), 10);
    if (!cx || !cy) return null;
    return { w: Math.round(cx / 9525), h: Math.round(cy / 9525) };
  }
  function vmlSize(shape) {
    if (!shape) return null;
    const st = attr(shape, 'style') || '';
    const g = (k) => { const m = st.match(new RegExp(k + '\\s*:\\s*([\\d.]+)(pt|px|in|cm)?')); if (!m) return null; const v = parseFloat(m[1]); const u = m[2] || 'px'; return u === 'pt' ? v * 4 / 3 : u === 'in' ? v * 96 : u === 'cm' ? v * 37.8 : v; };
    const w = g('width'), h = g('height');
    return w && h ? { w: Math.round(w), h: Math.round(h) } : null;
  }

  async function handleRun(r, pFmt, ctx) {
    const rPr = child(r, 'w:rPr');
    const direct = readRPr(rPr);
    const fmt = merge(styles.defaults, pFmt, styles.resolve(direct.rStyle), direct);
    if (fmt.hidden) return;
    for (const k of kids(r)) {
      switch (k.nodeName) {
        case 'w:t': cur.runs.push({ ...fmtOut(fmt), t: k.textContent }); break;
        case 'w:tab': cur.runs.push({ ...fmtOut(fmt), t: '\t' }); break;
        case 'w:noBreakHyphen': cur.runs.push({ ...fmtOut(fmt), t: '-' }); break;
        case 'w:sym': {
          const ch = attr(k, 'w:char');
          let t = '';
          if (ch) {
            const code = parseInt(ch, 16);
            const font = (attr(k, 'w:font') || '').toLowerCase();
            const symMap = { 0xF0B3: '≥', 0xF0A3: '≤', 0xF0B9: '≠', 0xF0B1: '±', 0xF0B4: '×', 0xF0DE: '⇒', 0xF0DB: '⇔', 0xF0AE: '→', 0xF0CE: '∈', 0xF0CF: '∉', 0xF0C6: '∅', 0xF0A5: '∞', 0xF0D6: '√', 0xF070: 'π', 0xF061: 'α', 0xF062: 'β', 0xF067: 'γ', 0xF064: 'δ', 0xF044: 'Δ', 0xF06A: 'φ', 0xF077: 'ω', 0xF057: 'Ω', 0xF06C: 'λ', 0xF06D: 'μ', 0xF071: 'θ', 0xF0B0: '°', 0xF0BB: '≈', 0xF0BA: '≡', 0xF0C7: '∩', 0xF0C8: '∪', 0xF0CC: '⊂', 0xF0B6: '∂', 0xF0E5: '∑', 0xF0F2: '∫', 0xF0D7: '·', 0xF02D: '−', 0xF02B: '+', 0xF03D: '=' };
            t = font.includes('symbol') && symMap[code] ? symMap[code] : (code >= 0xF000 ? (symMap[code] || '') : String.fromCharCode(code));
          }
          if (t) cur.runs.push({ ...fmtOut(fmt), t });
          break;
        }
        case 'w:br': case 'w:cr': {
          const type = attr(k, 'w:type');
          if (type === 'page' || type === 'column') break;
          // Xuống dòng mềm (Shift+Enter) => coi như đoạn mới
          newBlock({ table: cur.table, cont: true });
          break;
        }
        case 'w:drawing': {
          const blip = k.getElementsByTagName('a:blip')[0];
          if (blip) {
            const rid = attr(blip, 'r:embed') || attr(blip, 'r:link');
            const im = await imageFor(rid, emuSize(k));
            if (im) cur.runs.push({ ...fmtOut(fmt), t: '', ...im });
          } else {
            // Hộp văn bản trong drawing
            const tx = k.getElementsByTagName('w:txbxContent')[0];
            if (tx) for (const p of kids(tx).filter((n) => n.nodeName === 'w:p')) { await handleParaInline(p, ctx); }
          }
          break;
        }
        case 'w:pict': case 'w:object': {
          const imd = k.getElementsByTagName('v:imagedata')[0];
          if (imd) {
            const shape = k.getElementsByTagName('v:shape')[0];
            const im = await imageFor(attr(imd, 'r:id') || attr(imd, 'r:pict'), vmlSize(shape));
            if (im) cur.runs.push({ ...fmtOut(fmt), t: '', ...im, ole: k.nodeName === 'w:object' });
          } else {
            const tx = k.getElementsByTagName('w:txbxContent')[0];
            if (tx) for (const p of kids(tx).filter((n) => n.nodeName === 'w:p')) { await handleParaInline(p, ctx); }
          }
          break;
        }
        case 'mc:AlternateContent': {
          const choice = child(k, 'mc:Choice');
          if (choice) await handleRunChildren(choice, fmt, ctx);
          break;
        }
        default: break;
      }
    }
  }

  // Xử lý nội dung con của mc:Choice như thể nằm trong một run
  async function handleRunChildren(node, fmt, ctx) {
    for (const k of kids(node)) {
      if (k.nodeName === 'w:drawing') {
        const blip = k.getElementsByTagName('a:blip')[0];
        if (blip) {
          const im = await imageFor(attr(blip, 'r:embed'), emuSize(k));
          if (im) cur.runs.push({ ...fmtOut(fmt), t: '', ...im });
        } else {
          const tx = k.getElementsByTagName('w:txbxContent')[0];
          if (tx) for (const p of kids(tx).filter((n) => n.nodeName === 'w:p')) { await handleParaInline(p, ctx); }
        }
      }
    }
  }

  function fmtOut(f) {
    const o = {};
    if (f.b) o.b = true;
    if (f.i) o.i = true;
    if (f.u) o.u = true;
    if (f.s) o.s = true;
    if (f.color && f.color !== '000000') o.color = f.color;
    if (f.hl) o.hl = f.hl;
    if (f.sup) o.sup = true;
    if (f.sub) o.sub = true;
    return o;
  }

  async function handleInline(node, pFmt, ctx) {
    for (const k of kids(node)) {
      switch (k.nodeName) {
        case 'w:r': await handleRun(k, pFmt, ctx); break;
        case 'w:hyperlink': case 'w:smartTag': case 'w:ins': case 'w:fldSimple': case 'w:customXml':
        case 'w:moveTo': case 'w:dir': case 'w:bdo':
          await handleInline(k, pFmt, ctx); break;
        case 'w:sdt': { const c = child(k, 'w:sdtContent'); if (c) await handleInline(c, pFmt, ctx); break; }
        case 'm:oMath': case 'm:oMathPara': {
          const latex = ommlToLatex(k);
          if (latex) cur.runs.push({ t: '', math: latex, display: k.nodeName === 'm:oMathPara', ...fmtOut(mathFmt(k, pFmt)) });
          break;
        }
        case 'mc:AlternateContent': { const c = child(k, 'mc:Choice'); if (c) await handleInline(c, pFmt, ctx); break; }
        default: break;
      }
    }
  }

  // Định dạng của công thức (để nhận biết đáp án tô màu/gạch chân chứa công thức)
  function mathFmt(node, pFmt) {
    const rs = node.getElementsByTagName('m:r');
    for (let i = 0; i < rs.length; i++) {
      const w = child(rs[i], 'w:rPr');
      if (w) return merge(pFmt, readRPr(w));
    }
    return pFmt;
  }

  async function handleParaInline(p, ctx) {
    const pPr = child(p, 'w:pPr');
    const ps = pPr && child(pPr, 'w:pStyle');
    const pFmt = styles.resolve(ps ? attr(ps, 'w:val') : 'Normal');
    if (cur.runs.length) cur.runs.push({ t: ' ' });
    await handleInline(p, pFmt, ctx);
  }

  async function handlePara(p, ctx) {
    const pPr = child(p, 'w:pPr');
    const ps = pPr && child(pPr, 'w:pStyle');
    const styleId = ps ? attr(ps, 'w:val') : 'Normal';
    const pFmt = styles.resolve(styleId) || {};
    newBlock({ table: ctx.table });
    // Đánh số tự động (Câu 1., A., a) ...)
    let numPr = pPr && child(pPr, 'w:numPr');
    if (!numPr && styleId && styles.map[styleId]) {
      // numPr trong style đoạn
    }
    if (numPr) {
      const il = child(numPr, 'w:ilvl'), nid = child(numPr, 'w:numId');
      const lab = numbering.label(nid ? attr(nid, 'w:val') : null, il ? attr(il, 'w:val') : '0');
      if (lab && lab.text) cur.runs.push({ ...fmtOut(merge(pFmt, lab.rPr)), t: lab.text + ' ', auto: true });
    }
    await handleInline(p, pFmt, ctx);
  }

  async function handleBody(node, ctx) {
    for (const k of kids(node)) {
      if (k.nodeName === 'w:p') await handlePara(k, ctx);
      else if (k.nodeName === 'w:tbl') await handleTable(k, ctx);
      else if (k.nodeName === 'w:sdt') { const c = child(k, 'w:sdtContent'); if (c) await handleBody(c, ctx); }
      else if (k.nodeName === 'w:customXml' || k.nodeName === 'w:ins') await handleBody(k, ctx);
    }
  }

  async function handleTable(tbl, ctx) {
    const tIndex = tables.length;
    const t = { rows: [], blockStart: blocks.length, blockEnd: 0 };
    tables.push(t);
    for (const tr of kids(tbl).filter((k) => k.nodeName === 'w:tr')) {
      const row = [];
      for (const tc of kids(tr).filter((k) => k.nodeName === 'w:tc')) {
        const start = blocks.length;
        await handleBody(tc, { table: tIndex });
        const cellBlocks = blocks.slice(start);
        row.push(cellBlocks.map((b) => b.runs.map((r) => r.t).join('')).join('\n').trim());
      }
      t.rows.push(row);
    }
    t.blockEnd = blocks.length;
    newBlock({ table: ctx.table }); // ngắt sau bảng
  }

  await handleBody(body, { table: undefined });
  await Promise.all(pendingImages);
  return { blocks: blocks.filter((b) => b.runs.length), tables };
}

module.exports = { parseDocx };

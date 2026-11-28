// Đọc file PDF (có lớp chữ) thành danh sách dòng (blocks) kèm định dạng:
// đậm (theo tên font), màu chữ (theo lệnh tô màu) và gạch chân (đường kẻ mảnh dưới chữ).
'use strict';

const path = require('path');

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

function mul(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

function hexColor(args) {
  if (!args) return null;
  if (typeof args[0] === 'string') return args[0].replace('#', '').toUpperCase();
  const [r, g, b] = args;
  return [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function isDark(hex) {
  if (!hex) return true;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return Math.max(r, g, b) < 60 && Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

async function parsePdf(buffer) {
  const pdfjs = await loadPdfjs();
  const stdFonts = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep;
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl: stdFonts, disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 });
  const pdf = await task.promise;
  const blocks = [];
  let totalChars = 0;

  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn);
    const opList = await page.getOperatorList();
    const content = await page.getTextContent({ includeMarkedContent: false });
    const OPS = pdfjs.OPS;

    // 1) Duyệt lệnh vẽ: lấy màu của từng đoạn chữ và các đường kẻ mảnh (gạch chân)
    const colored = []; // {s, color}
    const lines = []; // {x1,x2,y}
    let ctm = [1, 0, 0, 1, 0, 0];
    let fill = null;
    const stack = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], args = opList.argsArray[i];
      if (fn === OPS.save) stack.push({ ctm, fill });
      else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill; } }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.setFillRGBColor) fill = hexColor(args);
      else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        const glyphs = args[0] || [];
        let s = '';
        for (const g of glyphs) if (g && typeof g === 'object' && g.unicode) s += g.unicode;
        if (s) colored.push({ s, color: fill });
      } else if (fn === OPS.constructPath) {
        const mm = args[2];
        if (mm && isFinite(mm[0])) {
          const [ax, ay] = apply(ctm, mm[0], mm[1]);
          const [bx, by] = apply(ctm, mm[2], mm[3]);
          const w = Math.abs(bx - ax), h = Math.abs(by - ay);
          if (h < 1.6 && w > 3) lines.push({ x1: Math.min(ax, bx), x2: Math.max(ax, bx), y: (ay + by) / 2 });
        }
      }
    }

    // Ghép màu theo thứ tự ký tự (bỏ khoảng trắng)
    const colorSeq = [];
    for (const c of colored) for (const ch of c.s) if (!/\s/.test(ch)) colorSeq.push(c.color);
    let seqPos = 0;

    // 2) Nhóm các mảnh chữ thành dòng
    const items = [];
    for (const it of content.items) {
      if (typeof it.str !== 'string') continue;
      const str = it.str.replace(/[\u0000-\u001f\u00ad]/g, '');
      if (!str.trim()) { continue; }
      const [a, b, , d, e, f] = it.transform;
      const size = Math.hypot(c0(a), c0(b)) || Math.abs(d) || 10;
      let bold = false;
      try {
        const font = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null;
        const name = (font && (font.name || font.loadedName)) || '';
        bold = /bold|black|heavy|semibold|demi|,B$|-B$/i.test(name) || (font && font.bold) || false;
      } catch (_) { /* ignore */ }
      // màu
      const counts = {};
      for (const ch of it.str) {
        if (/\s/.test(ch) || /[\u0000-\u001f]/.test(ch)) continue;
        const col = colorSeq[seqPos++];
        const k = col || '000000';
        counts[k] = (counts[k] || 0) + 1;
      }
      let color = null, best = 0;
      for (const [k, v] of Object.entries(counts)) if (v > best) { best = v; color = k; }
      if (isDark(color)) color = null;
      items.push({ str, x: e, y: f, w: it.width, size, bold, color, eol: it.hasEOL });
      totalChars += str.trim().length;
    }
    function c0(v) { return v || 0; }

    items.sort((p, q) => (Math.abs(q.y - p.y) > Math.min(p.size, q.size) * 0.45 ? q.y - p.y : p.x - q.x));
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const row = rows.find((r) => Math.abs(r.y - it.y) < Math.max(2, Math.min(r.size, it.size) * 0.45));
      if (row) { row.items.push(it); row.size = Math.max(row.size, it.size); }
      else rows.push({ y: it.y, size: it.size, items: [it] });
    }
    rows.sort((p, q) => q.y - p.y);

    for (const row of rows) {
      row.items.sort((p, q) => p.x - q.x);
      const runs = [];
      let lastEnd = null;
      let prevBold = null;
      for (const it of row.items) {
        if (lastEnd !== null) {
          const gap = it.x - lastEnd;
          if (gap > it.size * 1.5) runs.push({ t: '\t' });
          else if ((gap > it.size * 0.15 || (gap > -0.8 && prevBold !== it.bold)) && !/^\s/.test(it.str) && !(runs.length && /\s$/.test(runs[runs.length - 1].t))) runs.push({ t: ' ' });
        }
        if (runs.length && /^\p{M}/u.test(it.str)) {
          const prev = runs[runs.length - 1];
          if (prev.t === ' ') runs.pop();
          runs[runs.length - 1].t = (runs[runs.length - 1].t + it.str).normalize('NFC');
          lastEnd = it.x + it.w;
          continue;
        }
        const run = { t: it.str.normalize('NFC') };
        if (it.bold) run.b = true;
        if (it.color) run.color = it.color;
        // chỉ số trên / dưới
        if (it.size < row.size * 0.8 && it.str.trim()) {
          if (it.y > row.y + row.size * 0.15) run.sup = true;
          else if (it.y < row.y - row.size * 0.1) run.sub = true;
        }
        // gạch chân: đường mảnh nằm ngay dưới chữ, phủ phần lớn bề rộng
        if (it.w > 0 && it.str.trim()) {
          const under = lines.some((l) => l.y < it.y + 0.5 && l.y > it.y - it.size * 0.45 && Math.min(l.x2, it.x + it.w) - Math.max(l.x1, it.x) > it.w * 0.6);
          if (under) run.u = true;
        }
        runs.push(run);
        lastEnd = it.x + it.w;
        prevBold = it.bold;
      }
      blocks.push({ runs, soft: true, page: pn, rowIndex: rows.indexOf(row), rowCount: rows.length });
    }
    page.cleanup();
  }
  await pdf.destroy();
  // Bỏ đầu trang / chân trang lặp lại trên nhiều trang và số trang
  if (pdf.numPages >= 2 || blocks.length) {
    const norm = (b) => b.runs.map((r) => r.t).join('').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    const edge = (b) => b.rowIndex <= 1 || b.rowIndex >= b.rowCount - 2;
    const pagesOf = {};
    for (const b of blocks) if (edge(b)) { const k = norm(b); (pagesOf[k] = pagesOf[k] || new Set()).add(b.page); }
    const total = new Set(blocks.map((b) => b.page)).size;
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (!edge(b)) continue;
      const k = norm(b);
      if (k.length > 70 || /^\*?[A-Ha-h]\s*[.)]/.test(k) || /^(Câu|CÂU|Question|Bài|PHẦN|Phần)\b/.test(k)) continue;
      const isPageNo = /^[-–—(\s]*#[-–—)\s]*$/.test(k) || /^(trang|page)\s*#/i.test(k);
      if (isPageNo || (total >= 2 && pagesOf[k].size >= Math.max(2, Math.ceil(total * 0.5)) && !/^(Câu|Question|Bài)\s*#/i.test(k))) blocks.splice(i, 1);
    }
  }
  if (totalChars < 20) {
    const err = new Error('File PDF không có lớp chữ (có thể là ảnh scan). Hãy dùng file Word hoặc PDF xuất từ Word.');
    err.userMessage = true;
    throw err;
  }
  return { blocks, tables: [] };
}

module.exports = { parsePdf };

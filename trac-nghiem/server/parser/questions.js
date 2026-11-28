// Tách đề thành từng câu hỏi + nhận diện đáp án.
// Hỗ trợ: trắc nghiệm A-D (một / nhiều đáp án), đúng-sai a) b) c) d), trả lời ngắn, tự luận.
// Đáp án lấy theo thứ tự ưu tiên: dòng "Đáp án:"/"Chọn X" trong câu > bảng đáp án > định dạng
// (dấu *, gạch chân, tô sáng, màu chữ, in đậm khác biệt).
'use strict';

const crypto = require('crypto');

const uid = () => crypto.randomBytes(6).toString('hex');

// ---------- Tiện ích văn bản ----------
const QRE = /^[\s ]*(?:Câu|CÂU|Cau|Câu hỏi|Question|Bài|BÀI)\s*(\d{1,3})\s*(?:[*:.)\-–]\s*)?(\((?:[^()]{0,40})\)|\[(?:[^\]]{0,40})\])?\s*[:.)\-–]?\s*/i;
const NUMRE = /^[\s ]*(\d{1,3})\s*[.)]\s+(?=\S)/;
const PARTRE = /^[\s ]*(?:PHẦN|Phần|PHAN)\s+([IVX]+|\d+)\b\s*[.:\-–]?\s*(.*)$/;
const PART2RE = /^[\s ]*(?:([IVX]+|[A-D])\s*[.:\-–)])\s*((?:PHẦN\s+)?(?:TRẮC\s*NGHIỆM|TỰ\s*LUẬN|ĐÚNG\s*[-–\/]?\s*SAI|TRẢ\s*LỜI\s*NGẮN|CÂU\s*HỎI\s*ĐÚNG)[^]*)$/;
const ENDRE = /^[\s \-–—_.=*]*(?:HẾT|Hết|---\s*HẾT\s*---)[\s \-–—_.=*!]*$/;
const KEYHEADRE_OLD = /^[\s ]*(?:BẢNG\s+)?(?:ĐÁP\s*ÁN|Đáp\s*án|HƯỚNG\s*DẪN\s*(?:GIẢI|CHẤM)|LỜI\s*GIẢI\s*CHI\s*TIẾT|ĐÁP\s*ÁN\s*VÀ\s*LỜI\s*GIẢI)(?:\s+(?:VÀ|&)\s+[^\n]{0,40})?(?:\s+(?:CHI\s*TIẾT|THAM\s*KHẢO|ĐỀ\s*[^\n]{0,30}|MÃ\s*ĐỀ[^\n]{0,20}))?\s*[:.]?\s*$/;
const KEYHEADRE = /^[\s ]*(?:(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s+(?:VÀ|&)\s+(?:LỜI\s*GIẢI|HƯỚNG\s*DẪN)[^\n]{0,30}|\s+(?:CHI\s*TIẾT|THAM\s*KHẢO|TRẮC\s*NGHIỆM|ĐỀ[^\n]{0,30}|MÃ\s*ĐỀ[^\n]{0,20}|PHẦN[^\n]{0,30}))?|HƯỚNG\s*DẪN\s*(?:GIẢI\s*CHI\s*TIẾT|CHẤM)[^\n]{0,30}|LỜI\s*GIẢI\s*CHI\s*TIẾT[^\n]{0,30}|Bảng\s+đáp\s+án[^\n]{0,30}|Đáp\s*án\s+(?:và|&)\s+(?:lời\s*giải|hướng\s*dẫn)[^\n]{0,30}|Đáp\s*án\s+(?:chi\s*tiết|tham\s*khảo)|Hướng\s*dẫn\s*(?:giải\s*chi\s*tiết|chấm)[^\n]{0,30}|Lời\s*giải\s*chi\s*tiết)\s*[:.]?\s*$/u;
const KEYWEAKRE = /^[\s ]*Đáp\s*án\s*[:.]?\s*$/i;
const NOISERE = [
  /^[\s \-–—]*(?:Trang|Page)\s*\d+(?:\s*(?:\/|of|trên)\s*\d+)?[\s\-–—]*$/i,
  /^[\s ]*Mã\s*đề(?:\s*thi)?\s*[:.]?\s*\d{2,4}(?:\s*[-–|,]?\s*(?:Trang|Page)\s*\d+(?:\s*\/\s*\d+)?)?\s*$/i,
];
const EXPLRE = /^[\s ]*(?:(?:Lời\s*giải|LỜI\s*GIẢI|Hướng\s*dẫn\s*giải|HƯỚNG\s*DẪN\s*GIẢI|Hướng\s*dẫn|HDG|Giải\s*thích|GIẢI\s*THÍCH|Phương\s*pháp\s*giải|Cách\s*giải)(?:\s*chi\s*tiết)?\s*[:.]?|Giải\s*[:.]|Giải\s*$)/i;
const ANSRE = /^[\s ]*(?:Đáp\s*án|ĐÁP\s*ÁN|ĐA|Đ\/A|Đáp\s*số|ĐS|Answer|Key|Trả\s*lời|Kết\s*quả)\s*(?:đúng)?\s*[:.\-–=]\s*(.+)$/i;
const ANS2RE = /^[\s ]*(?:Đáp\s*án|ĐÁP\s*ÁN)\s+([A-H])(?![\p{L}\d])/u;
const CHOOSERE = /(?:^|[\s.(])Chọn\s*(?:đáp\s*án|phương\s*án|câu)?\s*:?\s*([A-H])(?![\p{L}\d])/u;

const OBJ = '\uFFFC'; // ký tự đại diện cho ảnh / công thức khi quét nhãn
function isMedia(r) { return !!(r.img || r.math); }
function lineText(runs) { return runs.map((r) => (isMedia(r) ? OBJ : r.t || '')).join(''); }
function plain(s) { return String(s).replace(/\uFFFC/g, ''); }

function isDarkColor(hex) {
  if (!hex) return true;
  hex = String(hex).replace('#', '');
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return Math.max(r, g, b) < 90 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Cắt runs theo khoảng ký tự [start, end)
function sliceRuns(runs, start, end, total) {
  const out = [];
  let pos = 0;
  void total;
  for (const r of runs) {
    if (isMedia(r)) {
      if (pos >= start && pos < end) out.push(r);
      pos += 1;
      continue;
    }
    const t = r.t || '';
    const len = t.length;
    if (len === 0) continue;
    const a = Math.max(start, pos), b = Math.min(end, pos + len);
    if (a < b) out.push({ ...r, t: t.slice(a - pos, b - pos) });
    pos += len;
  }
  return out;
}

// Chuyển runs -> HTML. mode 'option' bỏ các định dạng có thể lộ đáp án.
function runsToHtml(runs, mode) {
  let html = '';
  for (const r of runs) {
    if (r.math) {
      html += `<span class="math${r.display ? ' math-display' : ''}" data-latex="${esc(r.math)}"></span>`;
      continue;
    }
    if (r.img) {
      let style = '';
      if (r.w && r.h) {
        let w = r.w, h = r.h;
        if (w > 640) { h = Math.round(h * 640 / w); w = 640; }
        style = ` width="${w}" height="${h}" style="width:${w}px;max-width:100%;height:auto"`;
      }
      const inline = r.h && r.h <= 40 ? ' class="inline-img"' : '';
      html += `<img src="${esc(r.img)}"${style}${inline} alt="">`;
      continue;
    }
    let t = esc(r.t || '').replace(/\t/g, ' &nbsp; ');
    if (!t) continue;
    if (r.sup) t = `<sup>${t}</sup>`;
    if (r.sub) t = `<sub>${t}</sub>`;
    if (r.i) t = `<i>${t}</i>`;
    if (mode !== 'option') {
      if (r.b) t = `<b>${t}</b>`;
      if (r.u) t = `<u>${t}</u>`;
    }
    html += t;
  }
  // gộp thẻ liền nhau
  html = html.replace(/<\/b><b>/g, '').replace(/<\/i><i>/g, '').replace(/<\/u><u>/g, '');
  return html.replace(/^(\s|&nbsp;)+/, '').replace(/(\s|&nbsp;)+$/, '').replace(/ {2,}/g, ' ');
}

function joinHtml(parts, soft) {
  return parts.filter((p) => p && p.trim()).join(soft ? ' ' : '<br>');
}

// ---------- Nhận diện nhãn phương án trong một dòng ----------
// Trả về danh sách nhãn [{letter, start, cstart, star}] — dòng phải BẮT ĐẦU bằng nhãn mong đợi.
function findLabels(text, expectLetter, lower) {
  const L = lower ? 'a-h' : 'A-H';
  const re = new RegExp(`(^|[\\s\\u00a0|])(\\*\\s*)?([${L}])\\s*(\\*)?\\s*([.):])(\\*)?\\s*`, 'g');
  const cands = [];
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length;
    const cstart = m.index + m[0].length;
    // Nhãn dạng "A:" ít gặp -> chỉ chấp nhận . và )
    if (m[5] === ':' && !lower) { re.lastIndex = m.index + 1; continue; }
    const pre = text.slice(Math.max(0, m.index + m[1].length - 2), m.index + m[1].length);
    const strong = start === 0 || /\t|\s\s|\|/.test(pre) || /\t/.test(m[1]);
    cands.push({ letter: m[3], start, cstart, star: !!(m[2] || m[4] || m[6]), sep: m[5], strong });
    re.lastIndex = m.index + m[1].length + 1;
  }
  if (!cands.length) return [];
  // Nhãn đầu tiên phải ở đầu dòng
  const first = cands[0];
  if (text.slice(0, first.start).trim() !== '' || first.letter !== expectLetter) return [];
  // Tìm chuỗi nhãn liên tiếp dài nhất, mỗi phương án có nội dung không rỗng
  const code = (c) => c.letter.charCodeAt(0);
  let best = [first];
  const score = (seq) => seq.length * 100 + seq.filter((c) => c.strong).length;
  function search(seq) {
    if (score(seq) > score(best)) best = seq.slice();
    const last = seq[seq.length - 1];
    for (const c of cands) {
      if (c.start <= last.start || code(c) !== code(last) + 1) continue;
      if (c.sep !== first.sep && !(lower && (c.sep === '.' || c.sep === ')'))) continue;
      if (text.slice(last.cstart, c.start).trim() === '') continue; // phương án rỗng
      seq.push(c); search(seq); seq.pop();
    }
  }
  search([first]);
  // phương án cuối phải có nội dung (hoặc là ảnh/công thức — kiểm tra sau)
  return best;
}

// ---------- Phân tích giá trị đáp án ----------
function parseMcValue(s) {
  s = String(s).trim().replace(/[.;,]+$/, '').trim();
  const m = s.match(/^\*?\s*([A-H])((?:\s*(?:,|;|&|và|\+|\s)\s*[A-H])*)\s*$/i);
  if (!m) return null;
  const letters = (m[1] + m[2]).toUpperCase().match(/[A-H]/g);
  return [...new Set(letters)];
}
function parseTfValue(s) {
  s = String(s).trim();
  // a) Đ b) S | a-Đ, b-S | ĐSĐS | Đúng, Sai, ...
  const cleaned = s.replace(/(^|[\s,;(])([a-h])\s*[).:\-–=]\s*/gi, '$1 ');
  const tokens = [];
  const re = /(Đúng|ĐÚNG|đúng|Sai|SAI|sai|True|False|Đ|đ|S|s|T|F)/gu;
  // Kiểm tra chuỗi chỉ gồm các token + dấu phân cách
  const rest = cleaned.replace(re, '').replace(/[\s,;.\-–|/]+/g, '');
  if (rest.length) return null;
  let m;
  while ((m = re.exec(cleaned))) {
    const v = m[1].toLowerCase();
    tokens.push(v === 'đúng' || v === 'đ' || v === 'true' || v === 't');
  }
  return tokens.length ? tokens : null;
}
function cleanShort(s) {
  s = String(s).trim().replace(/^[:=]\s*/, '').replace(/\s*[.;]$/, '').trim();
  if (!s || /^[._…\s-]+$/.test(s)) return null;
  return s;
}

// ---------- Định dạng đánh dấu đáp án ----------
function featuresOf(labelRuns, contentRuns) {
  const f = { u: false, hl: false, b: false, color: null };
  const lab = labelRuns.filter((r) => /[A-Za-z]/.test(r.t || ''));
  const has = (runs, key) => runs.some((r) => r[key] && ((r.t || '').trim() || r.math));
  if (lab.length) {
    if (lab.every((r) => r.u)) f.u = true;
    if (lab.every((r) => r.hl)) f.hl = true;
    if (lab.every((r) => r.b)) f.b = true;
    const lc = lab.map((r) => (isDarkColor(r.color) ? null : r.color));
    if (lc[0] && lc.every((c) => c === lc[0])) f.color = lc[0];
  }
  let total = 0;
  const cnt = { u: 0, hl: 0, b: 0 };
  const colorCnt = {};
  for (const r of contentRuns) {
    const n = r.math ? 3 : (r.t || '').replace(/\s/g, '').length;
    if (!n) continue;
    total += n;
    if (r.u) cnt.u += n;
    if (r.hl) cnt.hl += n;
    if (r.b) cnt.b += n;
    const c = isDarkColor(r.color) ? '_' : r.color;
    colorCnt[c] = (colorCnt[c] || 0) + n;
  }
  if (total) {
    if (cnt.u / total >= 0.6) f.u = true;
    if (cnt.hl / total >= 0.6) f.hl = true;
    if (!lab.length && cnt.b / total >= 0.6) f.b = true;
    if (!f.color) {
      for (const [c, n] of Object.entries(colorCnt)) if (c !== '_' && n / total >= 0.6) f.color = c;
    }
  }
  void has;
  return f;
}

function isReddish(hex) {
  if (!hex) return false;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return r > 150 && g < 110 && b < 110;
}

// Trả về {feature, set:Set(index)} các phương án được đánh dấu
function markedSets(opts) {
  const n = opts.length;
  const res = {};
  res.star = opts.map((o, i) => (o.star ? i : -1)).filter((i) => i >= 0);
  res.u = opts.map((o, i) => (o.f.u ? i : -1)).filter((i) => i >= 0);
  res.hl = opts.map((o, i) => (o.f.hl ? i : -1)).filter((i) => i >= 0);
  res.b = opts.map((o, i) => (o.f.b ? i : -1)).filter((i) => i >= 0);
  // màu: lấy các phương án có màu khác màu đa số
  const colors = opts.map((o) => o.f.color || null);
  const freq = {};
  for (const c of colors) freq[c] = (freq[c] || 0) + 1;
  let major = null, mf = -1;
  for (const [c, k] of Object.entries(freq)) {
    const key = c === 'null' ? null : c;
    if (k > mf || (k === mf && key === null)) { mf = k; major = key; }
  }
  let colSet = colors.map((c, i) => (c !== major ? i : -1)).filter((i) => i >= 0);
  if (major === null) colSet = colors.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  else if (colSet.length === 0 && isReddish(major) && n > 0) colSet = []; // tất cả cùng màu đỏ: không rõ
  // Nếu hai nhóm màu bằng nhau, ưu tiên nhóm màu đỏ
  if (major !== null && colSet.length && mf * 2 === n) {
    const red = colors.map((c, i) => (isReddish(c) ? i : -1)).filter((i) => i >= 0);
    if (red.length && red.length < n) colSet = red;
  }
  res.color = colSet;
  res.allColor = colors.map((c, i) => (c && isReddish(c) ? i : -1)).filter((i) => i >= 0);
  return res;
}

const FEATURE_ORDER = ['star', 'u', 'hl', 'color', 'b'];
const FEATURE_NAME = { star: 'dấu *', u: 'gạch chân', hl: 'tô sáng', color: 'màu chữ', b: 'in đậm' };

// ---------- Bảng đáp án ----------
function normCell(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function keyFromTable(t) {
  const entries = [];
  const g = t.rows.map((r) => r.map(normCell));
  const isInt = (s) => /^(?:Câu\s*)?\d{1,3}$/i.test(s);
  const toInt = (s) => parseInt(s.replace(/\D/g, ''), 10);
  const looksVal = (s) => s && (parseMcValue(s) || parseTfValue(s) || /^-?[\d.,/]+$/.test(s));
  for (let i = 0; i < g.length; i++) {
    const row = g[i];
    const ints = row.filter(isInt).length;
    if (ints >= 2 && g[i + 1] && g[i + 1].filter(isInt).length < ints) {
      for (let j = 0; j < row.length; j++) {
        if (isInt(row[j]) && g[i + 1][j] !== undefined && g[i + 1][j] !== '') entries.push({ num: toInt(row[j]), raw: g[i + 1][j] });
      }
      i++; // dòng tiếp theo đã dùng
      continue;
    }
    // Dạng cặp: | 1 | A | 2 | B |  hoặc | Câu | Đáp án | ... |
    for (let j = 0; j + 1 < row.length; j++) {
      if (isInt(row[j]) && row[j + 1] && !isInt(row[j + 1])) { entries.push({ num: toInt(row[j]), raw: row[j + 1] }); j++; }
    }
    // Ô dạng "1.A" hoặc "1-B"
    for (const cell of row) {
      const m = cell.match(/^(?:Câu\s*)?(\d{1,3})\s*[.:\-–)]\s*(.+)$/i);
      if (m && !isInt(cell)) entries.push({ num: parseInt(m[1], 10), raw: m[2] });
    }
  }
  const good = entries.filter((e) => looksVal(e.raw));
  if (good.length < 3 || good.length < entries.length * 0.6) return null;
  return good;
}

function keyFromText(lines) {
  // lines: [{text, part}]
  const entries = [];
  let seg = null; // dạng lời giải "Câu N ... Chọn X"
  const flush = () => {
    if (!seg) return;
    const txt = seg.lines.join('\n');
    let m = txt.match(CHOOSERE) || txt.match(/Đáp\s*án\s*(?:đúng)?\s*(?:là)?\s*[:.]?\s*([A-H])(?![\p{L}\d])/u);
    if (m) entries.push({ part: seg.part, num: seg.num, raw: m[1] });
    else {
      for (const l of seg.lines) {
        const a = l.match(ANSRE);
        if (a) { entries.push({ part: seg.part, num: seg.num, raw: a[1] }); break; }
      }
    }
    seg = null;
  };
  for (const { text, part } of lines) {
    const q = text.match(QRE);
    if (q) {
      // "Câu 1: A" (ngắn) hay "Câu 1. <lời giải>"?
      const rest = text.slice(q[0].length);
      const restTrim = rest.trim();
      const pairs = scanPairs(text, part);
      if (pairs.length > 1 || (pairs.length === 1 && restTrim.length <= 40 && !/[\p{L}]{4,}/u.test(restTrim.replace(/Đúng|Sai/gi, '')))) {
        flush();
        entries.push(...pairs);
        continue;
      }
      flush();
      seg = { num: parseInt(q[1], 10), part, lines: [rest] };
      continue;
    }
    if (seg) { seg.lines.push(text); continue; }
    entries.push(...scanPairs(text, part));
  }
  flush();
  return entries;
}

// Quét các cặp "số - đáp án" trong một dòng
function scanPairs(text, part) {
  const out = [];
  const labRe = /(?:^|[\s,;|])(?:[Cc]âu\s*)?(\d{1,3})\s*(?:[.:)–\-]\s*(?!\d)|\s+(?=[A-HĐS](?:[^\p{L}]|$)))/gu;
  const labs = [];
  let m;
  while ((m = labRe.exec(text))) labs.push({ num: parseInt(m[1], 10), start: m.index, cstart: m.index + m[0].length });
  for (let i = 0; i < labs.length; i++) {
    const raw = text.slice(labs[i].cstart, i + 1 < labs.length ? labs[i + 1].start : text.length).trim().replace(/[,;|]+$/, '').trim();
    if (raw) out.push({ part, num: labs[i].num, raw });
  }
  // "1A 2B 3C" không có dấu phân cách
  if (!out.length) {
    const re2 = /(?:^|[\s,;|])(\d{1,3})([A-H])(?![\p{L}\d])/gu;
    while ((m = re2.exec(text))) out.push({ part, num: parseInt(m[1], 10), raw: m[2] });
  }
  return out;
}

// ---------- Hàm chính ----------
function partTypeHint(text) {
  const t = text.toLowerCase();
  if (/đúng\s*(hoặc|\/|-|–)?\s*sai|đúng sai|chọn đúng hoặc sai/.test(t)) return 'tf';
  if (/trả lời ngắn|điền đáp số|điền kết quả|điền đáp án|tự điền/.test(t)) return 'short';
  if (/tự luận/.test(t)) return 'essay';
  if (/nhiều phương án|trắc nghiệm|lựa chọn|một phương án|chọn một/.test(t)) return 'mc';
  return null;
}

function parsePoints(s) {
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:điểm|đ\b|đ\)|đ$)/i);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

function extractQuestions(input, opts = {}) {
  const { blocks, tables = [] } = input;
  const warnings = [];
  const meta = { title: null, duration: null, subject: null };

  // 1) Bảng đáp án
  const keyTables = new Set();
  const tableKeys = [];
  tables.forEach((t, idx) => {
    const k = keyFromTable(t);
    if (k) { keyTables.add(idx); tableKeys.push({ idx, entries: k }); }
  });

  // 2) Dòng
  const lines = [];
  blocks.forEach((b, bi) => {
    if (b.table !== undefined && keyTables.has(b.table)) {
      lines.push({ keyTable: b.table, bi });
      return;
    }
    const text = lineText(b.runs);
    const hasMedia = b.runs.some((r) => r.img || r.math);
    if (!text.trim() && !hasMedia) return;
    if (!hasMedia && NOISERE.some((re) => re.test(text))) return;
    lines.push({ text, runs: b.runs, soft: !!b.soft, hasMedia, bi });
  });

  // Vị trí bắt đầu phần đáp án / lời giải (nếu có)
  const maxNumIn = (arr) => Math.max(0, ...arr.filter((l) => l.text).map((l) => { const m = l.text.match(QRE) || l.text.match(NUMRE); return m ? parseInt(m[1], 10) : 0; }));
  let keyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    if (!t) continue;
    let isHead = ENDRE.test(t) || KEYHEADRE.test(t);
    if (!isHead && KEYWEAKRE.test(t)) {
      const nx = lines.slice(i + 1, i + 3);
      isHead = nx.some((l) => l.keyTable !== undefined || (l.text && scanPairs(l.text, null).length >= 2));
    }
    if (!isHead) continue;
    const before = lines.slice(0, i);
    if (!before.some((l) => l.text && (QRE.test(l.text) || NUMRE.test(l.text)))) continue;
    // Phần sau tiêu đề không được chứa câu hỏi có số lớn hơn số câu đã gặp (tránh nhầm tiêu đề lời giải từng câu)
    if (!ENDRE.test(t) && maxNumIn(lines.slice(i + 1)) > maxNumIn(before)) continue;
    keyStart = i;
    break;
  }
  const qZone = keyStart >= 0 ? lines.slice(0, keyStart) : lines;
  const useCau = qZone.some((l) => l.text && QRE.test(l.text));
  const isQStart = (text, lastNum) => {
    if (useCau) return text.match(QRE);
    const m = text.match(NUMRE);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (lastNum === null ? n <= 2 : (n === lastNum + 1 || n === 1)) return m;
    return null;
  };

  const questions = [];
  const keyZone = [];
  const parts = []; // {index, title, hint}
  let part = null;
  let q = null;
  let state = 'pre'; // pre | partHead | stem | options | expl | key
  let lastNum = null;
  const preLines = [];

  function closeQ() {
    if (q) questions.push(q);
    q = null;
  }

  for (let li = 0; li < lines.length; li++) {
    const L = lines[li];
    if (L.keyTable !== undefined) {
      if (state !== 'key') { closeQ(); }
      continue;
    }
    const text = L.text;

    if (state === 'key') {
      const pm = text.match(PARTRE) || text.match(PART2RE);
      if (pm) { part = partIndexFor(pm[1]); }
      keyZone.push({ text, part: part ? part.index : null });
      continue;
    }

    // Hết đề / bảng đáp án
    if (li === keyStart) {
      closeQ();
      state = 'key';
      part = null;
      continue;
    }

    // Phần
    const pm = text.match(PARTRE) || (text.match(PART2RE));
    if (pm && !(q && state === 'stem' && !pm[2])) {
      closeQ();
      const p = { index: parts.length + 1, label: pm[1], title: text.trim(), hint: partTypeHint(text) };
      parts.push(p);
      part = p;
      state = 'partHead';
      lastNum = null;
      continue;
    }

    const qm = isQStart(text, lastNum);
    if (qm) {
      closeQ();
      const num = parseInt(qm[1], 10);
      lastNum = num;
      q = {
        num, part: part ? part.index : 0, hint: part ? part.hint : null,
        stem: [], options: [], lower: null, expl: [], explicit: null, explicitChoose: null,
        points: parsePoints(qm[2] || ''), soft: L.soft,
      };
      state = 'stem';
      const rest = text.slice(qm[0].length);
      const restRuns = sliceRuns(L.runs, qm[0].length, text.length, text.length);
      handleContent(rest, restRuns, L, true);
      continue;
    }

    if (state === 'pre') { preLines.push(text); continue; }
    if (state === 'partHead') {
      if (part && !part.hint) part.hint = partTypeHint(text);
      else if (part && part.hint === 'mc') { const h = partTypeHint(text); if (h && h !== 'mc') part.hint = h; }
      continue;
    }
    handleContent(text, L.runs, L, false);
  }
  closeQ();

  function partIndexFor(label) {
    const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
    const n = roman[String(label).toUpperCase()] || parseInt(label, 10) || null;
    const p = parts.find((x) => x.index === n || String(x.label).toUpperCase() === String(label).toUpperCase());
    return p || (n ? { index: n } : null);
  }

  function handleContent(text, runs, L, firstLine) {
    if (!q) return;
    const total = text.length;
    const trimmed = plain(text).trim();
    const hasMedia = runs.some((r) => r.img || r.math);
    if (!trimmed && !hasMedia) return;

    // Lời giải
    if (!firstLine && EXPLRE.test(text)) {
      state = 'expl';
      const m = text.match(EXPLRE);
      const restRuns = sliceRuns(runs, m[0].length, total, total);
      if (plain(lineText(restRuns)).trim() || restRuns.some((r) => r.img || r.math)) q.expl.push(runsToHtml(restRuns));
      const ch = text.match(CHOOSERE);
      if (ch && !q.explicitChoose) q.explicitChoose = ch[1];
      return;
    }
    // Dòng đáp án
    const am = !firstLine ? (text.match(ANSRE) || text.match(ANS2RE)) : null;
    if (am) {
      const v = am[1].trim();
      if (cleanShort(v) !== null || /^[A-H]$/.test(v)) {
        if (!q.explicit) q.explicit = v;
        return;
      }
      if (state === 'stem' && !q.options.length) return; // "Trả lời: ......"
    }
    if (state === 'expl') {
      const ch = text.match(CHOOSERE);
      if (ch && !q.explicitChoose) q.explicitChoose = ch[1];
      q.expl.push(runsToHtml(runs));
      return;
    }
    if (!firstLine) {
      const ch = /^\s*Chọn\s*(?:đáp\s*án|phương\s*án)?\s*:?\s*([A-H])\s*[.;]?\s*$/u.exec(text);
      if (ch && q.options.length) { q.explicitChoose = ch[1]; return; }
    }

    // Phương án
    const tryLabels = (lower) => {
      const expect = q.options.length && q.lower === lower
        ? String.fromCharCode(q.options[q.options.length - 1].labelLetter.charCodeAt(0) + 1)
        : (lower ? 'a' : 'A');
      if (q.options.length && q.lower !== lower) return [];
      return findLabels(text, expect, lower);
    };
    let labels = tryLabels(false);
    let lower = false;
    if (!labels.length) { labels = tryLabels(true); lower = true; }
    if (labels.length && !(firstLine && !q.options.length && labels[0].letter !== 'A' && labels[0].letter !== 'a')) {
      // Dòng đầu tiên "Câu 1. A. ..." hiếm gặp: chỉ chấp nhận khi không có nội dung câu hỏi
      if (firstLine && labels[0].start > 0) { /* noop */ }
      q.lower = lower;
      state = 'options';
      for (let k = 0; k < labels.length; k++) {
        const lab = labels[k];
        const endPos = k + 1 < labels.length ? labels[k + 1].start : total;
        const labelRuns = sliceRuns(runs, lab.start, lab.cstart, total);
        const contentRuns = sliceRuns(runs, lab.cstart, endPos, total);
        q.options.push({ letter: lab.letter.toUpperCase(), labelLetter: lab.letter, star: lab.star, labelRuns, contentRuns: [...contentRuns], htmlParts: [runsToHtml(contentRuns, 'option')] });
      }
      return;
    }

    if (state === 'stem' && !q.options.length) {
      // Phương án nằm chung dòng với câu hỏi: "... là A. x  B. y  C. z  D. t"
      const re = /(^|[\s\u00a0])(\*?)A\s*[.)]\s*\S/g;
      let m;
      while ((m = re.exec(text))) {
        const pos = m.index + m[1].length;
        const labs = findLabels(text.slice(pos), 'A', false);
        if (labs.length >= 3 && (pos === 0 || plain(text.slice(0, pos)).trim())) {
          const before = sliceRuns(runs, 0, pos, total);
          if (plain(lineText(before)).trim() || before.some(isMedia)) { q.stem.push(runsToHtml(before)); q.stemRuns = (q.stemRuns || []).concat(before); }
          handleContent(text.slice(pos), sliceRuns(runs, pos, total, total), L, false);
          return;
        }
        re.lastIndex = m.index + 1;
      }
    }
    if (state === 'stem') {
      q.stem.push(runsToHtml(runs));
      q.stemRuns = (q.stemRuns || []).concat(runs);
      return;
    }
    if (state === 'options') {
      const last = q.options[q.options.length - 1];
      const onlyMedia = !trimmed && hasMedia;
      const lastEmpty = !last.htmlParts.join('').trim();
      const looksSolution = /^\s*(Ta có|Vì|Do|Theo|Suy ra|Xét|Gọi|Áp dụng|Khi đó|=>|⇒|→|Vậy)/i.test(text);
      if (onlyMedia || lastEmpty || L.soft || q.lower || (trimmed.length < 80 && !looksSolution)) {
        last.htmlParts.push(runsToHtml(runs, 'option'));
        last.contentRuns.push(...runs);
        last.soft = L.soft;
      } else {
        state = 'expl';
        q.expl.push(runsToHtml(runs));
      }
    }
  }

  // 3) Metadata từ phần đầu đề
  for (const t of preLines) {
    const d = t.match(/Thời\s*gian(?:\s*làm\s*bài)?\s*[:：]?\s*(\d{1,3})\s*phút/i);
    if (d && !meta.duration) meta.duration = parseInt(d[1], 10);
    const s = t.match(/Môn(?:\s*(?:thi|học))?\s*[:：]\s*([^\n,;–\-()]{2,40})/i) || t.match(/MÔN\s+([A-ZÀ-Ỹ ]{2,30})/);
    if (s && !meta.subject) meta.subject = s[1].trim();
    if (!meta.title && /(ĐỀ|KIỂM TRA|THI|ÔN TẬP)/.test(t) && t.trim().length < 120) meta.title = t.trim();
  }

  // 4) Đáp án từ bảng / khu vực đáp án
  const keyEntries = [];
  for (const tk of tableKeys) {
    // phần của bảng: dựa vào dòng "PHẦN" gần nhất trước bảng
    const firstBlock = blocks.findIndex((b) => b.table === tk.idx);
    let p = null;
    for (const L of lines) {
      if (L.bi >= firstBlock) break;
      if (L.text) { const pm = L.text.match(PARTRE) || L.text.match(PART2RE); if (pm) p = partIndexFor(pm[1]); }
    }
    // Nếu bảng nằm trong phần đề (trước HẾT) thì p là phần của câu hỏi -> chỉ dùng nếu bảng nằm sau câu cuối của phần đó
    const lastQBlock = Math.max(-1, ...lines.filter((L) => L.text && QRE.test(L.text)).map((L) => L.bi));
    const inKeyArea = firstBlock > lastQBlock;
    for (const e of tk.entries) keyEntries.push({ ...e, part: inKeyArea ? (p ? p.index : null) : null, src: 'table' });
  }
  keyEntries.push(...keyFromText(keyZone).map((e) => ({ ...e, src: 'text' })));

  // 5) Xây dựng câu hỏi
  const result = [];
  const used = new Set();
  const featureTally = {};

  // Bước 5a: xác định loại câu + đáp án theo định dạng
  const draft = questions.map((qq) => {
    const opts = qq.options.map((o) => ({ ...o, f: featuresOf(o.labelRuns, o.contentRuns) }));
    let type;
    const imperative = /^\s*(Tính|Tìm|Chứng\s*minh|Giải|Vẽ|Viết|Xác\s*định|Rút\s*gọn|So\s*sánh|Nêu|Trình\s*bày|Giải\s*thích|Lập|Phân\s*tích|Hãy|Cho\s*biết|Biểu\s*diễn|Thực\s*hiện|Kể|Mô\s*tả)\b/i;
    const essayLike = qq.lower && opts.length >= 2 && (qq.hint === 'essay' || (!qq.hint && opts.filter((o) => imperative.test(lineText(o.contentRuns))).length >= Math.ceil(opts.length / 2)));
    if (essayLike) {
      // Ghép các ý a), b) vào nội dung câu tự luận
      qq.stem.push(...opts.map((o) => `${o.labelLetter}) ${joinHtml(o.htmlParts, o.soft)}`));
      opts.length = 0;
      qq.options = [];
      type = 'essay';
    } else if (opts.length >= 2) {
      if (qq.lower) type = qq.hint === 'mc' ? 'mc' : (qq.hint === 'tf' || !qq.hint ? 'tf' : 'tf');
      else type = qq.hint === 'tf' ? 'tf' : 'mc';
      if (qq.lower && !qq.hint && opts.length >= 2 && opts.every((o) => o.labelRuns && /\./.test(lineText(o.labelRuns))) && opts.length <= 6) {
        // a. b. c. d. -> thường là trắc nghiệm trong đề cũ, trừ khi có dấu hiệu đúng/sai
        const stemTxt = (qq.stemRuns ? lineText(qq.stemRuns) : '').toLowerCase();
        type = /đúng|sai/.test(stemTxt) ? 'tf' : 'mc';
      }
    } else if (qq.hint === 'essay') type = 'essay';
    else if (qq.hint === 'short') type = 'short';
    else if (qq.explicit && cleanShort(qq.explicit) && !parseMcValue(qq.explicit)) type = 'short';
    else type = qq.hint === 'mc' && opts.length === 1 ? 'mc' : 'essay';

    let fmtAns = null, fmtFeature = null;
    if (type === 'mc' || type === 'tf') {
      const sets = markedSets(opts);
      for (const ft of FEATURE_ORDER) {
        const s = sets[ft];
        if (s.length >= 1 && s.length < opts.length) { fmtAns = s; fmtFeature = ft; break; }
      }
      if (fmtFeature) featureTally[fmtFeature] = (featureTally[fmtFeature] || 0) + 1;
      qq._sets = sets;
    }
    return { qq, opts, type, fmtAns, fmtFeature };
  });
  const docFeature = Object.entries(featureTally).sort((a, b) => b[1] - a[1])[0];
  const docFeat = docFeature ? docFeature[0] : null;

  for (const d of draft) {
    const { qq, opts } = d;
    let type = d.type;
    // Câu đúng/sai: dùng kiểu đánh dấu chung của cả đề
    if (type === 'tf' && docFeat && qq._sets) {
      const s = qq._sets[docFeat === 'color' ? 'allColor' : docFeat];
      const chosen = (docFeat === 'color' && !(s && s.length)) ? qq._sets.color : s;
      d.fmtAns = chosen || [];
      d.fmtFeature = docFeat;
    } else if (type === 'mc' && docFeat && d.fmtFeature && d.fmtFeature !== docFeat && qq._sets && qq._sets[docFeat]) {
      const s = qq._sets[docFeat];
      if (s.length >= 1 && s.length < opts.length) { d.fmtAns = s; d.fmtFeature = docFeat; }
    }

    // đáp án từ bảng
    const fits = (raw) => {
      if (type === 'mc') return !!parseMcValue(raw);
      if (type === 'tf') return !!parseTfValue(raw) || (/^[A-H]$/.test(String(raw).trim()) && false);
      if (type === 'short') return cleanShort(raw) !== null && !/^[A-H]$/.test(String(raw).trim());
      return false;
    };
    let keyRaw = null;
    for (let i = 0; i < keyEntries.length; i++) {
      if (used.has(i)) continue;
      const e = keyEntries[i];
      if (e.num !== qq.num) continue;
      if (e.part !== null && e.part !== undefined && parts.length && e.part !== qq.part) continue;
      if (!fits(e.raw)) continue;
      used.add(i); keyRaw = e.raw; break;
    }

    const question = {
      id: uid(), type, num: qq.num, part: qq.part,
      content: joinHtml(qq.stem, qq.soft),
      options: opts.map((o) => ({ id: uid(), label: o.letter, html: joinHtml(o.htmlParts, o.soft) })),
      answer: null, explanation: joinHtml(qq.expl, qq.soft), points: qq.points, source: null,
    };
    if (type === 'tf') question.options.forEach((o, i) => { o.label = String.fromCharCode(97 + i); });

    const explicit = qq.explicit || qq.explicitChoose;
    const setFrom = (raw, src) => {
      if (raw === null || raw === undefined) return false;
      if (type === 'mc') {
        const v = parseMcValue(raw);
        if (!v) return false;
        const idx = v.map((l) => l.charCodeAt(0) - 65).filter((i) => i >= 0 && i < opts.length);
        if (!idx.length) return false;
        question.answer = idx; question.source = src; return true;
      }
      if (type === 'tf') {
        const v = parseTfValue(raw);
        if (!v || !v.length) return false;
        question.answer = opts.map((_, i) => (v[i] === undefined ? false : v[i])); question.source = src; return true;
      }
      if (type === 'short') {
        const v = cleanShort(raw);
        if (v === null) return false;
        question.answer = v; question.source = src; return true;
      }
      return false;
    };
    if (!(explicit && setFrom(explicit, 'Dòng "Đáp án/Chọn" trong câu'))) {
      if (!(keyRaw !== null && setFrom(keyRaw, 'Bảng đáp án'))) {
        if (d.fmtAns && (type === 'mc' || type === 'tf')) {
          if (type === 'mc' && d.fmtAns.length) { question.answer = d.fmtAns; question.source = FEATURE_NAME[d.fmtFeature]; }
          if (type === 'tf') { question.answer = opts.map((_, i) => d.fmtAns.includes(i)); question.source = FEATURE_NAME[d.fmtFeature]; }
        }
      }
    }
    if (type === 'mc' && Array.isArray(question.answer) && question.answer.length > 1) question.type = 'multi';
    if (type === 'mc' && question.options.length < 2) question.type = 'essay';
    result.push(question);
  }

  // 6) Điểm mặc định
  assignDefaultPoints(result, opts.subject || meta.subject);

  // 7) Cảnh báo
  result.forEach((qq, i) => {
    const issues = [];
    if (!qq.content && !qq.options.length) issues.push('Câu không có nội dung');
    if ((qq.type === 'mc' || qq.type === 'multi') && qq.options.length < 4) issues.push(`Chỉ có ${qq.options.length} phương án`);
    if (qq.type !== 'essay' && (qq.answer === null || qq.answer === undefined)) issues.push('Chưa xác định được đáp án');
    qq.issues = issues;
    qq.index = i + 1;
  });

  if (!result.length) warnings.push('Không tìm thấy câu hỏi nào. Mỗi câu cần bắt đầu bằng "Câu 1.", "Câu 2:"... (hoặc "1.", "2.")');
  const noAns = result.filter((x) => x.type !== 'essay' && x.answer == null).length;
  if (noAns) warnings.push(`${noAns} câu chưa có đáp án — hãy chọn đáp án đúng trong trình soạn thảo trước khi giao bài.`);

  return { questions: result, parts: parts.map((p) => ({ index: p.index, title: p.title, hint: p.hint })), meta, warnings };
}

function assignDefaultPoints(qs, subject) {
  const hasNew = qs.some((q) => q.type === 'tf' || q.type === 'short');
  const isMath = /toán/i.test(subject || '');
  if (hasNew) {
    for (const q of qs) {
      if (q.points != null) continue;
      q.points = q.type === 'tf' ? 1 : q.type === 'short' ? (isMath ? 0.5 : 0.25) : q.type === 'essay' ? 1 : 0.25;
    }
  } else {
    const free = qs.filter((q) => q.points == null);
    const fixed = qs.reduce((s, q) => s + (q.points || 0), 0);
    const remain = Math.max(0, 10 - fixed);
    const each = free.length ? Math.floor((remain / free.length) * 1000) / 1000 : 0;
    for (const q of free) q.points = each;
    if (free.length) free[free.length - 1].points = Math.round((remain - each * (free.length - 1)) * 1000) / 1000;
  }
}

// Chuyển văn bản thuần (dán vào) thành blocks
function textToBlocks(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((line) => {
    // Hỗ trợ $...$ công thức LaTeX
    const runs = [];
    const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) runs.push({ t: line.slice(last, m.index) });
      runs.push({ t: '', math: (m[1] || m[2]).trim(), display: !!m[1] });
      last = m.index + m[0].length;
    }
    if (last < line.length) runs.push({ t: line.slice(last) });
    return { runs };
  }).filter((b) => b.runs.length);
}

module.exports = { extractQuestions, textToBlocks, parseMcValue, parseTfValue, assignDefaultPoints };

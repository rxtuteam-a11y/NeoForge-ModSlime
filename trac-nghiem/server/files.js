'use strict';
// Lưu ảnh trong đề, chuyển ảnh WMF/EMF (công thức MathType) sang PNG, chuyển .doc -> .docx.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { DATA_DIR } = require('./db');

const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MISSING = path.join(UPLOAD_DIR, '_missing.svg');
if (!fs.existsSync(MISSING)) {
  fs.writeFileSync(MISSING, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="28"><rect x="0.5" y="0.5" width="119" height="27" rx="4" fill="#fff7e6" stroke="#f0b35a"/><text x="60" y="18" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#a35a00">[công thức]</text></svg>');
}

function findSoffice() {
  const cands = process.platform === 'win32'
    ? ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe']
    : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/bin/libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice', '/opt/libreoffice/program/soffice'];
  return cands.find((c) => fs.existsSync(c)) || null;
}
const SOFFICE = findSoffice();

// Mỗi "làn" dùng một hồ sơ LibreOffice riêng để có thể chạy song song
const LANES = 4;
const lanes = Array.from({ length: LANES }, () => Promise.resolve());
let rr = 0;
function soffice(args, timeout = 90000, lane) {
  if (!SOFFICE) return Promise.reject(new Error('Không tìm thấy LibreOffice'));
  const k = lane === undefined ? (rr++ % LANES) : lane % LANES;
  const profile = path.join(os.tmpdir(), 'tn-lo-profile-' + k);
  const job = () => new Promise((resolve, reject) => {
    execFile(SOFFICE, [`-env:UserInstallation=${require('url').pathToFileURL(profile).href}`, '--headless', '--norestore', ...args], { timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message)); else resolve(stdout);
    });
  });
  const p = lanes[k].then(job, job);
  lanes[k] = p.catch(() => {});
  return p;
}

// Kích thước thật (inch) của ảnh WMF / EMF đọc từ phần đầu file
function metaSize(buf) {
  try {
    if (buf.readUInt32LE(0) === 0x9AC6CDD7) { // WMF có header "placeable"
      const l = buf.readInt16LE(6), t = buf.readInt16LE(8), r = buf.readInt16LE(10), b = buf.readInt16LE(12), inch = buf.readUInt16LE(14) || 1440;
      return { w: Math.abs(r - l) / inch, h: Math.abs(b - t) / inch };
    }
    if (buf.readUInt32LE(0) === 1 && buf.readUInt32LE(40) === 0x464D4520) { // EMF, rclFrame đơn vị 0.01mm
      const l = buf.readInt32LE(24), t = buf.readInt32LE(28), r = buf.readInt32LE(32), b = buf.readInt32LE(36);
      return { w: Math.abs(r - l) / 2540, h: Math.abs(b - t) / 2540 };
    }
  } catch (_) { /* ignore */ }
  return null;
}

function newName(ext) { return crypto.randomBytes(10).toString('hex') + ext; }

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);

class ImageSaver {
  constructor() { this.pending = []; this.tmp = null; }
  save(buf, ext) {
    ext = (ext || '').toLowerCase();
    if (ext === '.wmf' || ext === '.emf') {
      if (!this.tmp) this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-img-'));
      const base = crypto.randomBytes(10).toString('hex');
      fs.writeFileSync(path.join(this.tmp, base + ext), buf);
      this.pending.push({ base, file: base + ext });
      return `/uploads/${base}.png`;
    }
    if (!IMG_EXT.has(ext)) ext = '.png';
    if (ext === '.svg') return '/uploads/_missing.svg'; // không nhận svg từ file để tránh mã độc
    const name = newName(ext === '.jpeg' ? '.jpg' : ext);
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  }
  // Chuyển WMF/EMF (công thức MathType) -> PNG nét cao. Trả về map url lỗi -> url thay thế
  async finish() {
    const fail = {};
    if (!this.pending.length) return fail;
    const SCALE = 3 * 96; // 3 lần độ phân giải màn hình
    const sized = [], plain = [];
    for (const p of this.pending) {
      const sz = metaSize(fs.readFileSync(path.join(this.tmp, p.file)));
      if (sz && sz.w > 0.01 && sz.h > 0.01 && sz.w < 30 && sz.h < 30) {
        let w = Math.round(sz.w * SCALE), h = Math.round(sz.h * SCALE);
        if (w > 2400) { h = Math.round(h * 2400 / w); w = 2400; }
        sized.push({ ...p, w: Math.max(8, w), h: Math.max(8, h) });
      } else plain.push(p);
    }
    const jobs = sized.map((p, i) => soffice(['--convert-to', `png:draw_png_Export:{"PixelWidth":{"type":"long","value":"${p.w}"},"PixelHeight":{"type":"long","value":"${p.h}"}}`, '--outdir', this.tmp, path.join(this.tmp, p.file)], 60000, i).catch(() => plain.push(p)));
    await Promise.all(jobs);
    const rest = plain.filter((p) => !fs.existsSync(path.join(this.tmp, p.base + '.png')));
    if (rest.length) {
      try { await soffice(['--convert-to', 'png', '--outdir', this.tmp, ...rest.map((p) => path.join(this.tmp, p.file))], 120000); }
      catch (_) {
        for (const p of rest) {
          const f = path.join(this.tmp, p.file);
          await new Promise((res) => execFile('convert', ['-density', '200', f, path.join(this.tmp, p.base + '.png')], { timeout: 20000 }, () => res()));
        }
      }
    }
    for (const p of this.pending) {
      const png = path.join(this.tmp, p.base + '.png');
      if (fs.existsSync(png)) fs.copyFileSync(png, path.join(UPLOAD_DIR, p.base + '.png'));
      else fail[`/uploads/${p.base}.png`] = '/uploads/_missing.svg';
    }
    fs.rmSync(this.tmp, { recursive: true, force: true });
    return fail;
  }
}

async function docToDocx(buf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-doc-'));
  try {
    const src = path.join(tmp, 'input.doc');
    fs.writeFileSync(src, buf);
    await soffice(['--convert-to', 'docx', '--outdir', tmp, src]);
    return fs.readFileSync(path.join(tmp, 'input.docx'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function saveUpload(buf, ext) {
  ext = (ext || '').toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) throw Object.assign(new Error('Chỉ nhận ảnh PNG, JPG, GIF, WEBP'), { status: 400 });
  const name = newName(ext === '.jpeg' ? '.jpg' : ext);
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

module.exports = { ImageSaver, docToDocx, saveUpload, UPLOAD_DIR, hasSoffice: !!SOFFICE };

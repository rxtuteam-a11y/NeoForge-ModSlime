'use strict';

function normShort(s) {
  return String(s == null ? '' : s)
    .normalize('NFC').trim().toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[.;]+$/, '')
    .replace(/^\+/, '');
}
function numVal(s) {
  const t = normShort(s);
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  if (/^-?\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
  return null;
}
function shortMatches(expected, given) {
  if (given == null || String(given).trim() === '') return false;
  const alts = String(expected).split(/\s*(?:\|\||\||;|\bhoặc\b)\s*/i).filter((x) => x.trim() !== '');
  for (const alt of alts) {
    const a = numVal(alt), b = numVal(given);
    if (a !== null && b !== null) { if (Math.abs(a - b) < 1e-9) return true; continue; }
    if (normShort(alt) === normShort(given)) return true;
  }
  return false;
}

const BGD = [0, 0.1, 0.25, 0.5, 1];

function gradeQuestion(q, ans, settings = {}, manual = {}) {
  const max = Number(q.points) || 0;
  const r = { qid: q.id, max, earned: 0, status: 'blank' };
  if (q.type === 'essay') {
    const m = manual[q.id];
    const has = ans && ((ans.text && ans.text.trim()) || (ans.images && ans.images.length));
    if (m !== undefined && m !== null && m !== '') { r.earned = Math.min(max, Math.max(0, Number(m) || 0)); r.status = r.earned >= max ? 'correct' : r.earned > 0 ? 'partial' : 'wrong'; }
    else r.status = has ? 'pending' : 'blank';
    return r;
  }
  if (manual[q.id] !== undefined && manual[q.id] !== null && manual[q.id] !== '') {
    r.earned = Math.min(max, Math.max(0, Number(manual[q.id]) || 0));
    r.status = r.earned >= max ? 'correct' : r.earned > 0 ? 'partial' : 'wrong';
    r.manual = true;
    return r;
  }
  if (q.answer === null || q.answer === undefined) { r.status = ans == null ? 'blank' : 'nokey'; return r; }
  if (q.type === 'mc' || q.type === 'multi') {
    const correct = (Array.isArray(q.answer) ? q.answer : [q.answer]).map((i) => q.options[i] && q.options[i].id).filter(Boolean);
    const given = ans == null ? [] : (Array.isArray(ans) ? ans : [ans]);
    if (!given.length) return r;
    const ok = given.length === correct.length && given.every((g) => correct.includes(g));
    r.earned = ok ? max : 0;
    r.status = ok ? 'correct' : 'wrong';
    return r;
  }
  if (q.type === 'tf') {
    const n = q.options.length;
    if (!ans || typeof ans !== 'object') return r;
    let k = 0, answered = 0;
    q.options.forEach((o, i) => {
      const g = ans[o.id];
      if (g === true || g === false) { answered++; if (g === !!q.answer[i]) k++; }
    });
    if (!answered) return r;
    r.k = k; r.n = n;
    const mode = settings.tfScoring || 'bgd';
    let ratio;
    if (mode === 'all') ratio = k === n ? 1 : 0;
    else if (mode === 'ratio' || n !== 4) ratio = k / n;
    else ratio = BGD[k];
    r.earned = Math.round(max * ratio * 1000) / 1000;
    r.status = k === n ? 'correct' : k === 0 ? 'wrong' : 'partial';
    return r;
  }
  if (q.type === 'short') {
    if (ans == null || String(ans).trim() === '') return r;
    const ok = shortMatches(q.answer, ans);
    r.earned = ok ? max : 0;
    r.status = ok ? 'correct' : 'wrong';
    return r;
  }
  return r;
}

function gradeAll(questions, answers, settings = {}, manual = {}) {
  const details = questions.map((q) => gradeQuestion(q, answers ? answers[q.id] : undefined, settings, manual));
  const raw = details.reduce((s, d) => s + d.earned, 0);
  const max = details.reduce((s, d) => s + d.max, 0);
  const correct = details.filter((d) => d.status === 'correct').length;
  const pending = details.filter((d) => d.status === 'pending').length;
  let score = raw;
  if (settings.scaleTo10 && max > 0) score = (raw / max) * 10;
  return {
    details, raw: round(raw), max: round(settings.scaleTo10 ? 10 : max), score: round(score), correct, total: questions.length, pending,
  };
}
function round(x) { return Math.round(x * 100) / 100; }

module.exports = { gradeAll, gradeQuestion, shortMatches };

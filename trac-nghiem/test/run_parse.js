const fs = require('fs');
const path = require('path');
const { parseDocx } = require('../server/parser/docx');
const { parsePdf } = require('../server/parser/pdf');
const { extractQuestions } = require('../server/parser/questions');
const strip = (h) => String(h || '').replace(/<span class="math[^"]*" data-latex="([^"]*)"><\/span>/g, '$[$1]').replace(/<img[^>]*>/g, '[IMG]').replace(/<br>/g, ' / ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g,'&');
(async () => {
  for (const f of process.argv.slice(2)) {
    const buf = fs.readFileSync(f);
    const save = async () => '/uploads/x.png';
    const parsed = f.endsWith('.pdf') ? await parsePdf(buf) : await parseDocx(buf, save);
    const r = extractQuestions(parsed);
    console.log('=====', path.basename(f), JSON.stringify(r.meta), r.parts.map((p) => p.index + ':' + p.hint).join(','));
    for (const q of r.questions) {
      console.log(`#${q.index} [${q.type}] p${q.part} n${q.num} pts=${q.points} ans=${JSON.stringify(q.answer)} (${q.source || '-'})${q.issues.length ? ' !! ' + q.issues.join('; ') : ''}`);
      console.log('   Q:', strip(q.content).slice(0, 110));
      q.options.forEach((o) => console.log(`     ${o.label}. ${strip(o.html).slice(0, 80)}`));
      if (q.explanation) console.log('   EXPL:', strip(q.explanation).slice(0, 80));
    }
    r.warnings.forEach((w) => console.log('  WARN', w));
  }
})().catch((e) => { console.error(e); process.exit(1); });

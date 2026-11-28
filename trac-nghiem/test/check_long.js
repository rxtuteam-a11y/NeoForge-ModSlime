const fs = require('fs');
const { parseDocx } = require('../server/parser/docx');
const { parsePdf } = require('../server/parser/pdf');
const { extractQuestions } = require('../server/parser/questions');
(async () => {
  const key = fs.readFileSync(__dirname + '/samples/de7_key.txt', 'utf8');
  for (const f of ['de7_40cau.docx', 'de7_40cau.pdf']) {
    const buf = fs.readFileSync(__dirname + '/samples/' + f);
    const r = extractQuestions(f.endsWith('pdf') ? await parsePdf(buf) : await parseDocx(buf, async () => '/x.png'));
    let ok = 0; const bad = [];
    r.questions.forEach((q, i) => {
      const good = q.options.length === 4 && q.answer && 'ABCD'[q.answer[0]] === key[i] && !/Trang|Mã đề/.test(q.content + q.options.map((o) => o.html).join(''))
        && q.options.every((o, k) => o.html.includes(`${i + 1}${'ABCD'[k]}`) || o.html.includes(`Phương án ${'ABCD'[k]} của câu ${i + 1}`));
      if (good) ok++; else bad.push({ i: i + 1, ans: q.answer, key: key[i], opts: q.options.map((o) => o.html.slice(0, 60)), c: q.content.slice(-60) });
    });
    console.log(f, 'questions', r.questions.length, 'correct', ok, 'sumPoints', r.questions.reduce((s, q) => s + q.points, 0));
    bad.slice(0, 4).forEach((b) => console.log('  BAD', JSON.stringify(b)));
  }
})();

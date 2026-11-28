// Kiểm thử giao diện phần 2: trình soạn đề, đề 2025, chống chuyển tab, xuất Excel, in nhiều mã đề.
const path = require('path');
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { console.log((c ? 'ok - ' : 'FAIL - ') + m); if (!c) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const watch = (pg, tag) => {
    pg.on('pageerror', (e) => errs.push(`${tag} PAGEERR ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(`${tag} CONSOLE ${m.text()}`); });
  };
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  watch(p, 'T');
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + '/dang-ky');
  await p.fill('input[name=name]', 'Cô Hoa'); await p.fill('input[name=email]', `h${Date.now()}@x.vn`); await p.fill('input[name=password]', '123456');
  await p.click('form button.primary'); await p.waitForURL('**/app');
  // Lớp học
  await p.goto(BASE + '/app/lop'); await p.click('#new'); await p.fill('#pd-in', '12A5'); await p.click('.modal-foot button.primary');
  await p.waitForURL(/\/app\/lop\/[\w-]+$/);
  await p.click('#paste'); await p.fill('#pd-in', 'STT\tHọ tên\tMã\n1\tNguyễn An\tA1\n2\tTrần Bình\tB2\n3\tLê Chi\tC3');
  await p.click('.modal-foot button.primary'); await p.click('#save'); await p.waitForTimeout(800);
  ok((await p.$$('#st tr')).length === 3, 'dán danh sách 3 học sinh từ Excel');
  // Tạo đề 2025
  await p.goto(BASE + '/app/de/moi');
  await p.setInputFiles('#file', path.join(__dirname, 'samples', 'de2_thpt2025.docx'));
  await p.waitForURL('**/app/de/soan', { timeout: 15000 }); await p.waitForTimeout(600);
  ok((await p.$$('.qcard')).length === 7, 'trình soạn hiện 7 câu');
  ok((await p.$$('.part-head')).length === 3, 'hiện 3 phần');
  // đổi đáp án câu 1 sang B rồi lại A
  const c1 = (await p.$$('.qcard'))[0];
  await (await c1.$$('.opt-key'))[1].click(); await p.waitForTimeout(100);
  ok(await p.$eval('.qcard >> nth=0', (n) => n.querySelector('.opt-key.on').textContent) === 'B', 'chọn lại đáp án đúng');
  await (await (await p.$$('.qcard'))[0].$$('.opt-key'))[0].click();
  // sửa nội dung câu 1 + chèn công thức
  const rich = await p.$('.qcard >> nth=0 >> .rich[data-f=content]');
  await rich.click(); await p.keyboard.press('End'); await p.keyboard.type(' (chọn 1)');
  await p.click('#tb button[data-cmd=math]'); await p.fill('#tex', '\\frac{1}{x}'); await p.click('.modal-foot button.primary');
  await p.waitForTimeout(300);
  ok(await p.$eval('.qcard >> nth=0 >> .rich[data-f=content]', (n) => !!n.querySelector('span.math .katex')), 'chèn công thức KaTeX vào câu hỏi');
  // thêm câu tự luận
  await p.click('#add-q'); await p.waitForTimeout(400);
  const last = (await p.$$('.qcard')).pop();
  await (await last.$('select[data-k=type]')).selectOption('essay');
  await p.waitForTimeout(200);
  const last2 = (await p.$$('.qcard')).pop();
  await (await last2.$('.rich[data-f=content]')).click(); await p.keyboard.type('Trình bày cảm nghĩ của em về môn Toán.');
  await (await last2.$('input[data-k=points]')).fill('1');
  // cài đặt: chống chuyển tab tự nộp sau 1 lần, giao lớp theo danh sách
  await p.click('.tabs button[data-tab=s]');
  await p.fill('input[data-s=maxTabSwitches]', '1');
  await p.click('.tabs button[data-tab=c]');
  await p.check('input[name=ident][value=roster]');
  await p.check('input[data-class]');
  await p.screenshot({ path: path.join(OUT, '20-editor-settings.png') });
  await p.click('#publish');
  await p.waitForURL(/\/app\/de\/[\w-]+(\?.*)?$/, { timeout: 10000 });
  await p.waitForTimeout(500);
  const code = (await p.textContent('.big-code')).trim();
  ok(/^[A-Z0-9]{6}$/.test(code), 'giao bài, mã ' + code);

  // Học sinh 1: làm đúng phần lớn, chuyển tab 1 lần (cảnh báo)
  const sctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  const s = await sctx.newPage(); watch(s, 'S');
  await s.goto(BASE + '/de/' + code); await s.waitForTimeout(400);
  await s.selectOption('#r-student', { label: 'Trần Bình' });
  await s.click('#start button.primary'); await s.waitForURL('**/lam-bai/**'); await s.waitForTimeout(700);
  ok((await s.$$('.question')).length === 8, 'học sinh thấy 8 câu');
  ok((await s.$$('.part-head')).length === 3, 'học sinh thấy tiêu đề các phần');
  const qs = await s.$$('.question');
  // Phần I: đáp án A, B, C (theo màu đỏ trong file)
  const clickOpt = async (q, k) => (await q.$$('.opt'))[k].click();
  await clickOpt(qs[0], 0); await clickOpt(qs[1], 1); await clickOpt(qs[2], 2);
  // Phần II câu 1: Đ S Đ S (đúng hết)
  const tf = async (q, arr) => { const rows = await q.$$('.tf-row'); for (let i = 0; i < arr.length; i++) await (await rows[i].$(arr[i] ? 'button.t' : 'button.f')).click(); };
  await tf(qs[3], [true, false, true, false]);
  await tf(qs[4], [true, true, true, true]); // 3/4 ý đúng -> 0.5
  await (await qs[5].$('input[data-short]')).fill('6.25');
  await (await qs[6].$('input[data-short]')).fill('91');
  await (await qs[7].$('textarea')).fill('Em rất thích môn Toán.');
  await s.waitForTimeout(1500);
  // mô phỏng rời tab
  await s.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await s.waitForTimeout(400);
  await s.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await s.waitForTimeout(400);
  ok(!!(await s.$('.modal-back')), 'cảnh báo khi rời màn hình');
  await s.screenshot({ path: path.join(OUT, '21-tab-warning.png') });
  await s.click('.modal-foot button.primary');
  await s.screenshot({ path: path.join(OUT, '22-taking-2025.png'), fullPage: true });
  await s.click('#submit-btn'); await s.click('.modal-foot button.primary');
  await s.waitForURL('**/ket-qua/**'); await s.waitForTimeout(700);
  const sc = (await s.textContent('.score-ring .val')).trim();
  // MC 0.75 + TF 1 + 0.5 + short 0.5 + 0 + essay chờ chấm = 2.75
  ok(sc === '2,75', 'điểm đề 2025 = ' + sc + ' (mong đợi 2,75)');
  ok(/chờ giáo viên chấm/.test(await s.textContent('body')), 'thông báo câu tự luận chờ chấm');
  await s.screenshot({ path: path.join(OUT, '23-result-2025.png'), fullPage: true });

  // Học sinh 2: rời tab 2 lần -> tự nộp
  const s2 = await (await b.newContext({ ...devices['Pixel 7'] })).newPage(); watch(s2, 'S2');
  await s2.goto(BASE + '/de/' + code); await s2.waitForTimeout(400);
  await s2.selectOption('#r-student', { label: 'Lê Chi' });
  await s2.click('#start button.primary'); await s2.waitForURL('**/lam-bai/**'); await s2.waitForTimeout(600);
  await s2.screenshot({ path: path.join(OUT, '24-mobile-2025.png') });
  for (let k = 0; k < 2; k++) {
    await s2.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await s2.waitForTimeout(300);
    await s2.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await s2.waitForTimeout(500);
    if (k === 0) await s2.click('.modal-foot button.primary');
  }
  await s2.waitForURL('**/ket-qua/**', { timeout: 8000 }).then(() => ok(true, 'tự nộp khi rời màn hình quá giới hạn')).catch(() => ok(false, 'tự nộp khi rời màn hình quá giới hạn'));

  // Giáo viên: kết quả, chấm tự luận, xuất Excel
  await p.click('.tabs button[data-t=results]'); await p.waitForTimeout(700);
  const rows = await p.$$('#rows tr');
  ok(rows.length === 2, 'giáo viên thấy 2 bài nộp');
  ok(/Nguyễn An/.test(await p.textContent('#pane')), 'hiện học sinh chưa làm (Nguyễn An)');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#xlsx')]);
  const file = path.join(OUT, await dl.suggestedFilename());
  await dl.saveAs(file);
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(file);
  ok(wb.SheetNames.includes('Bảng điểm') && wb.SheetNames.includes('Chi tiết bài làm'), 'xuất Excel: ' + wb.SheetNames.join(', '));
  await p.click('#rows a:has-text("Trần Bình")'); await p.waitForTimeout(700);
  const essayInput = (await p.$$('input[data-m]')).pop();
  await essayInput.fill('0.75');
  await p.fill('#cmt', 'Bài làm tốt');
  await p.click('#save-grade'); await p.waitForTimeout(500);
  ok(/3,5/.test(await p.textContent('#score')), 'chấm tự luận, điểm mới = ' + (await p.textContent('#score')));
  await p.screenshot({ path: path.join(OUT, '25-grade.png'), fullPage: true });
  await s.reload(); await s.waitForTimeout(700);
  ok(/Bài làm tốt/.test(await s.textContent('body')) && (await s.textContent('.score-ring .val')).trim() === '3,5', 'học sinh thấy điểm mới + nhận xét');
  // In 3 mã đề
  const ex = (await p.evaluate(() => fetch('/api/exams').then((r) => r.json()))).exams.find((e) => e.code === code);
  await p.goto(BASE + `/app/de/${ex.id}/in`); await p.fill('#nv', '3'); await p.click('#gen'); await p.waitForTimeout(500);
  ok((await p.$$('.print-page')).length === 6, 'in 3 mã đề kèm đáp án');
  // Thống kê
  await p.goto(BASE + `/app/de/${ex.id}?tab=stats`); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, '26-stats-2025.png'), fullPage: true });
  console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

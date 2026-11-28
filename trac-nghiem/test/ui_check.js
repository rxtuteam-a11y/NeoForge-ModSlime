// Kiểm thử giao diện bằng Playwright: node test/ui_check.js <base_url> <thư_mục_ảnh>
const path = require('path');
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.argv[3] || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const watch = (pg, tag) => {
    pg.on('pageerror', (e) => errs.push(`${tag} PAGEERR ${e.message}`));
    pg.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(`${tag} CONSOLE ${m.text()}`); });
  };
  const p = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  watch(p, 'T');
  const shot = (pg, n, full) => pg.screenshot({ path: path.join(OUT, n + '.png'), fullPage: !!full });
  await p.goto(BASE); await p.waitForTimeout(500); await shot(p, '01-landing');
  await p.click('text=Đăng ký giáo viên');
  await p.fill('input[name=name]', 'Thầy Minh'); await p.fill('input[name=email]', `t${Date.now()}@x.vn`); await p.fill('input[name=password]', '123456');
  await p.click('form button.primary'); await p.waitForURL('**/app'); await p.waitForTimeout(400); await shot(p, '02-dashboard');
  await p.goto(BASE + '/app/de/moi'); await p.waitForTimeout(300);
  await p.setInputFiles('#file', path.join(__dirname, 'samples', 'de1_gachchan.docx'));
  await p.waitForURL('**/app/de/soan', { timeout: 15000 }); await p.waitForTimeout(800); await shot(p, '03-editor');
  await p.click('#publish');
  await p.waitForURL(/\/app\/de\/[\w-]+(\?.*)?$/, { timeout: 10000 });
  await p.waitForTimeout(800); await shot(p, '04-share');
  const code = (await p.textContent('.big-code')).trim();
  console.log('code', code);

  const s = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
  watch(s, 'S');
  await s.goto(BASE); await s.fill('#code', code); await s.click('#join button');
  await s.waitForTimeout(700); await shot(s, '05-lobby');
  await s.fill('input[name=name]', 'Phạm Thu Hà'); await s.fill('input[name=className]', '10A3');
  await s.click('#start button.primary'); await s.waitForURL('**/lam-bai/**'); await s.waitForTimeout(800);
  console.log('questions', (await s.$$('.question')).length);
  const pick = async (qi, k) => { const q = (await s.$$('.question'))[qi]; const opts = await q.$$('.opt'); await opts[k].click(); };
  await pick(0, 1); await pick(1, 2); await pick(2, 0); await pick(3, 0);
  await s.waitForTimeout(1800); await shot(s, '06-taking');
  await s.click('#submit-btn'); await s.waitForTimeout(300); await shot(s, '07-confirm');
  await s.click('.modal-foot button.primary'); await s.waitForURL('**/ket-qua/**'); await s.waitForTimeout(900);
  await shot(s, '08-result', true);
  console.log('score', (await s.textContent('.score-ring')).trim());

  await p.click('.tabs button[data-t=results]'); await p.waitForTimeout(600); await shot(p, '09-results');
  await p.click('.tabs button[data-t=stats]'); await p.waitForTimeout(900); await shot(p, '10-stats', true);
  await p.click('.tabs button[data-t=results]'); await p.waitForTimeout(400);
  await p.click('#rows a >> nth=0'); await p.waitForTimeout(700); await shot(p, '11-submission', true);
  await p.goto(BASE + '/app/de'); await p.waitForTimeout(500); await shot(p, '12-examlist');
  await p.goto(BASE + '/app/lop'); await p.waitForTimeout(300);
  await p.click('#new'); await p.fill('#pd-in', '11B2'); await p.click('.modal-foot button.primary'); await p.waitForTimeout(700);
  await p.click('#add'); await p.fill('#st input[data-k=name]', 'Đỗ Hoàng Nam'); await p.click('#save'); await p.waitForTimeout(800); await shot(p, '13-class');
  const ex = (await p.evaluate(() => fetch('/api/exams').then((r) => r.json()))).exams.find((e) => e.code === code);
  await p.goto(BASE + `/app/de/${ex.id}/sua`); await p.waitForTimeout(700);
  await p.click('.tabs button[data-tab=s]'); await p.waitForTimeout(200); await shot(p, '14-settings');
  await p.goto(BASE + `/app/de/${ex.id}/in`); await p.waitForTimeout(800); await shot(p, '15-print');

  const m = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  watch(m, 'M');
  await m.goto(BASE + '/de/' + code); await m.waitForTimeout(500);
  await m.fill('input[name=name]', 'Vũ Lan'); await m.fill('input[name=className]', '10A1');
  await m.click('#start button.primary'); await m.waitForURL('**/lam-bai/**'); await m.waitForTimeout(800);
  await shot(m, '16-mobile');
  console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

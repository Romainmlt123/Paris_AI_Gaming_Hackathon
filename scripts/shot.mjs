// Capture mobile 390x844 : node scripts/shot.mjs [url] [out] [scenario]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/shot.png';
const scenario = process.argv[4] ?? 'intro';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(url);
await page.waitForTimeout(2500);
if (scenario !== 'intro') {
  await page.fill('.intro input', 'Baptiste');
  await page.click('.intro .btn');
  await page.waitForTimeout(1500);
}
if (scenario === 'dialog') {
  await page.evaluate(() => window.ragots.openDialog('marius'));
  await page.waitForTimeout(2500);
}
if (scenario === 'recap') {
  await page.evaluate(() => window.ragots.doAbsence(8));
  await page.waitForTimeout(6500);
}
if (scenario === 'demo') {
  const snap = async (n) => { await page.screenshot({ path: out.replace('.png', `-${n}.png`) }); };
  await page.evaluate(() => window.ragots.openDialog('marius'));
  await page.waitForTimeout(2500);
  await page.fill('.inputrow input', 'Marius, tes poissons puent et toi aussi, vieux croûton.');
  await page.click('.inputrow .send');
  await page.waitForTimeout(5000);
  await snap(1);
  await page.evaluate(() => window.ragots.closeDialog());
  await page.evaluate(() => window.ragots.doAbsence(8));
  await page.waitForTimeout(6500);
  await snap(2);
  await page.click('.card .row .btn');
  await page.waitForSelector('.sheet .inputrow input', { timeout: 20000 });
  await page.waitForTimeout(5000);
  await snap(3);
  await page.fill('.inputrow input', "C'est faux, j'ai rien dit à Marius !");
  await page.click('.inputrow .send');
  await page.waitForSelector('.stamp', { timeout: 15000 });
  await page.waitForTimeout(400);
  await snap(4);
  await page.waitForTimeout(4000);
}
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);

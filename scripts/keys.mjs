// Vérifie le déplacement clavier : node scripts/keys.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?q=high'); await page.evaluate(() => localStorage.clear()); await page.goto('http://localhost:5173/?q=high');
await page.waitForTimeout(2500);
const pos = () => page.evaluate(() => { const s = window.__ragots.state(); return 0; });
await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
await page.keyboard.down('z'); await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/k1-walk.png' });
await page.keyboard.up('z');
await page.waitForTimeout(300);
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/k2-talk.png' });
await page.keyboard.press('Escape');
await browser.close();
console.log('ok');

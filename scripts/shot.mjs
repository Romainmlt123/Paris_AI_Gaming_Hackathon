// Capture mobile 390×844 : node scripts/shot.mjs [url] [out.png] [waitMs]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'shots/shot.png';
const wait = Number(process.argv[4] ?? 2500);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
await browser.close();
console.log('ok', out);

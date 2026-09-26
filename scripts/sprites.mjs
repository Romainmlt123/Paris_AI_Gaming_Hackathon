// Planche de contrôle des personnages (agrandie ×8) : node scripts/sprites.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/scripts/sprites.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/sprites.png', fullPage: true });
await browser.close();

// Scénario de démo (section 12) de bout en bout, avec captures : node scripts/demo.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5173/';
const dir = process.argv[3] ?? 'shots';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('console', (m) => { if (['error', 'warning', 'info'].includes(m.type())) console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const shot = async (name) => { await page.screenshot({ path: `${dir}/${name}.png` }); console.log('📸', name); };
const R = (fn, arg) => page.evaluate(fn, arg);

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.goto(base);
await page.waitForTimeout(2500);
await shot('01-ile');

await R(() => window.__ragots.talk('marius'));
await page.waitForTimeout(1500);
await shot('02-marius');
await R(() => window.__ragots.say('T’es qu’un vieux radoteur, Marius, tes poissons puent.'));
await page.waitForTimeout(3500);
await shot('03-insulte');
await R(() => window.__ragots.close());

const sleeping = R(() => window.__ragots.sleep(8));
await page.waitForTimeout(1500);
await shot('04-nuit');
await sleeping;
await page.waitForTimeout(6000);
await shot('05-recap');
await page.click('.wake');
await page.waitForTimeout(6000);
await shot('06-josette-vient');
await page.waitForSelector('.dialogue:not(.hidden)', { timeout: 15000 }).catch(() => console.log('⚠ Josette n’a pas ouvert le dialogue'));
await page.waitForTimeout(2000);
await shot('07-josette');
await R(() => window.__ragots.say("Quoi ? Mais non, j'ai jamais insulté Marius, je l'adore !"));
await page.waitForTimeout(4000);
await shot('08-mensonge');
await R(() => window.__ragots.close());

await R(() => window.__ragots.bells(8000));
await R(() => window.__ragots.talk('gaston'));
await page.waitForTimeout(1000);
await R(() => window.__ragots.say('Gaston, mon ami, toi qui as tant de goût : ta statue dorée, tu me la fais à 4000 ?'));
await page.waitForTimeout(4500);
await shot('09-gaston');
const hasDeal = await page.$('.deal.show');
if (hasDeal) { await page.click('.deal .ok'); await page.waitForTimeout(1500); }
else { console.log('⚠ pas de deal proposé'); await R(() => window.__ragots.give('statue-doree-moche')); }
await shot('10-achat');
await R(() => window.__ragots.close());
await R(() => window.__ragots.place('placette', 'statue-doree-moche'));
await page.waitForTimeout(1800);
await shot('11-deco');
console.log(JSON.stringify(await R(() => { const s = window.__ragots.state(); return { bells: s.player.bells, rel: Object.fromEntries(Object.entries(s.npcs).map(([k, v]) => [k, v.relation])) }; })));
await browser.close();

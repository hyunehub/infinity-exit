// Offline check: no network at all, the embedded fonts load, and the panels fold away and come back (button and H key).
import { chromium } from 'playwright';
import { EXE } from './lib.mjs';
const b = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, offline: true }); const p = await ctx.newPage(); const net = []; const errs = [];
p.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) net.push(r.url()); }); p.on('pageerror', (e) => errs.push(e.message));
await p.goto('file:///home/user/v4/web/site/index.html?q=low'); await p.waitForFunction(() => window.__v4 && window.__v4.ready, null, { timeout: 90000 });
await p.evaluate(() => document.fonts.ready);
console.log('fonts', await p.evaluate(() => [...document.fonts].map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status).join(', ')));
console.log('check KR', await p.evaluate(() => document.fonts.check('600 16px "IBM Plex Sans KR"', '경우의 수 구조대')), 'mono', await p.evaluate(() => document.fonts.check('500 16px "IBM Plex Mono"', '0123')));
console.log('h1 font in use', await p.evaluate(() => getComputedStyle(document.querySelector('h1 b')).fontFamily));
await p.waitForTimeout(800); await p.screenshot({ path: 'shots/ui_open.png' });
await p.click('#uiBtn'); await p.waitForTimeout(800); await p.screenshot({ path: 'shots/ui_min.png' });
console.log('folded', await p.evaluate(() => [document.getElementById('app').classList.contains('ui-min'), getComputedStyle(document.getElementById('cases')).display, document.getElementById('uiBtn').textContent]));
await p.click('#uiTog'); await p.waitForTimeout(300); console.log('after small button', await p.evaluate(() => document.getElementById('app').classList.contains('ui-min')));
await p.keyboard.press('h'); await p.waitForTimeout(300); console.log('after H', await p.evaluate(() => document.getElementById('app').classList.contains('ui-min')));
await p.keyboard.press('r'); await p.waitForTimeout(1500); await p.screenshot({ path: 'shots/ui_min_hl.png' });
await p.keyboard.press('h'); await p.waitForTimeout(500); await p.screenshot({ path: 'shots/ui_open_hl.png' });
console.log('network requests', net.length, net.slice(0, 3), 'errors', errs.slice(0, 3)); await b.close();

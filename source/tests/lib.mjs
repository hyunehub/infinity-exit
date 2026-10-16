import { chromium } from 'playwright';
export const EXE = '/opt/pw-browsers/chromium';
export async function launch() { return chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); }
export async function openPage(b, w, h, q = '?q=high&autoplay=0&preset=-1', file = '/home/user/v4/web/site/index.html') {
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.errors = [];
  p.on('pageerror', (e) => p.errors.push('PAGEERR ' + e.message)); p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(t)) p.errors.push('CONSOLE ' + t.slice(0, 300)); if (m.type() === 'warning' && !/GPU stall|swiftshader|ReadPixels/i.test(t)) p.errors.push('WARN ' + t.slice(0, 200)); });
  await p.goto('file://' + file + q); await p.waitForFunction(() => window.__v4 && window.__v4.ready, null, { timeout: 60000 }); return p;
}

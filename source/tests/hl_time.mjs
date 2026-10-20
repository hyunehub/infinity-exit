// 119 rescue highlight at a steady 60 fps (frames stepped by hand): how long each phase lasts on screen, plus a screenshot of each.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1100, 620, '?q=low');
await p.evaluate(() => { __v4.ui.enterCases(); __v4.view.running = false; });
await p.evaluate(() => __v4.ui.startHl());
let frames = 0, last = null, t0 = 0; const segs = [];
for (let guard = 0; guard < 400; guard++) {
  const r = await p.evaluate(() => { const v = __v4.view; v.noRender = true; let n = 0; const ph0 = __v4.ui.hl().ph; while (n < 120) { v.frame(1 / 60); n++; if (__v4.ui.hl().ph !== ph0) break; } v.noRender = false; return { n, ph: __v4.ui.hl().ph, t: __v4.sim.t }; });
  frames += r.n;
  if (r.ph !== last) { if (last) segs.push([last, ((frames - t0) / 60).toFixed(1)]); last = r.ph; t0 = frames;
    await p.evaluate(() => { const v = __v4.view; v.noRender = true; for (let i = 0; i < 40; i++) v.frame(1 / 60); v.noRender = false; v.frame(1 / 60); }); frames += 41; // let the camera settle a bit
    await p.waitForTimeout(400); await p.screenshot({ timeout: 120000, path: `shots/hl_${segs.length + 1}_${r.ph}.png` }); console.log('phase', r.ph, 'at real', (frames / 60).toFixed(1), 's, sim', r.t.toFixed(1), JSON.stringify(await p.evaluate(() => __v4.ui.hl()))); }
  if (r.ph === 'end') break;
}
console.log('segments (s on screen):', JSON.stringify(segs), 'total', (frames / 60).toFixed(1), 's');
console.log('errors', p.errors.slice(0, 6)); await b.close();

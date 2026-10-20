// Emergency Escape speed slider: moving it scales the playback speed and the badge says so.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1280, 720, '?q=low');
await p.evaluate(() => { __v4.ui.startHl(); }); await p.waitForTimeout(500);
const r = [];
for (const v of ['1', '2', '0.5']) { await p.evaluate((v) => { const el = document.getElementById('hlSp'); el.value = v; el.dispatchEvent(new Event('input')); __v4.view.frame(0.016); }, v); await p.waitForTimeout(300);
  r.push(await p.evaluate(() => ({ ph: __v4.ui.hl().ph, speed: __v4.sim.speed, badge: __v4.ui.hl().ff, val: document.getElementById('hlSp').value }))); }
console.log(JSON.stringify(r)); await p.screenshot({ path: 'shots/hl_speed.png' }); console.log('errors', p.errors.slice(0, 3)); await b.close();

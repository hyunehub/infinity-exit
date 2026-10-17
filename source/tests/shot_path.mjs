// All exits blocked, smart mode: fans stop at detection, then open one escape route.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high');
await p.evaluate(() => __v4.ui.enterCases());
await p.evaluate(() => { document.querySelector('#cVent button[data-v="smart"]').click(); __v4.sim.reset({ fire: 'A', smokeZ: 'BCD', vent: 'smart', smoke: 'ceil', stairs: 'ok', ramp: 'dense', refuge: 'no' }); __v4.afterReset(); __v4.setPlaying(false); });
let t = 0; for (const T of [3, 10, 18, 30]) { await p.evaluate((dt) => __v4.advance(dt), T - t); t = T; await p.waitForTimeout(700); await p.screenshot({ path: `shots/p_${T}.png` }); }
console.log(await p.evaluate(() => __v4.sim.log.filter((l) => l.kind === 'vent').reverse().map((l) => l.t.toFixed(1) + ' ' + l.text)));
console.log(p.errors.slice(0, 5)); await b.close();

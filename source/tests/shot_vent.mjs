// Overview shots: vent modes and the rescue sequence.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high&autoplay=0&preset=-1');
const run = async (cond, times, tag) => { await p.evaluate((c) => { __v4.sim.reset(c); __v4.afterReset(); __v4.view.setView('overview', true); }, cond); let t = 0;
  for (const T of times) { await p.evaluate((dt) => __v4.advance(dt), T - t); t = T; await p.waitForTimeout(400); await p.screenshot({ path: `shots/v_${tag}_${T}.png`, clip: { x: 16, y: 66, width: 1368, height: 644 } }); } };
const base = { smoke: 'ceil', stairs: 'ok', ramp: 'ok', refuge: 'no', wind: 'auto', car: true, power: true, lost: null, doors: { E1: null, E2: null, E3: null, E4: null } };
for (const v of (process.env.V || 'normal,smart').split(',')) await run(Object.assign({}, base, { fire: 'A', smokeZ: '', vent: v }), [12, 40], v);
if (process.env.R) await run({ fire: 'C', smoke: 'ceil', stairs: 'none', ramp: 'blocked', refuge: 'no', vent: 'smart' }, [36, 50, 80, 95], 'rescue');
console.log(p.errors.slice(0, 5)); await b.close();

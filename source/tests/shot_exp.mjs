// Experiment mode: fire D, stairs locked, dense smoke: where do people wait?
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high');
await p.evaluate(() => { __v4.ui.enterExp(); __v4.sim.reset(Object.assign({}, __v4.sim.cond, { fire: 'D', stairs: 'none', smoke: 'dense', ramp: 'dense', doors: { E1: null, E2: null, E3: null, E4: null } })); __v4.afterReset(); __v4.setPlaying(false); __v4.advance(30); });
await p.waitForTimeout(800); await p.screenshot({ path: 'shots/exp_d.png' });
console.log(await p.evaluate(() => __v4.sim.agents.map((a) => a.state + ':' + (a.target || a.kind)).join(' ')));
await p.evaluate(() => { __v4.sim.reset(Object.assign({}, __v4.sim.cond, { fire: 'D', smoke: 'none', ramp: 'blocked' })); __v4.afterReset(); __v4.setPlaying(false); __v4.advance(30); });
await p.waitForTimeout(800); await p.screenshot({ path: 'shots/exp_d2.png' });
console.log(await p.evaluate(() => __v4.sim.agents.map((a) => a.state + ':' + (a.target || a.kind) + '@' + a.x.toFixed(0) + ',' + a.y.toFixed(0)).join(' ')));
console.log(p.errors.slice(0, 3)); await b.close();

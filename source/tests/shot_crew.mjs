// Firefighter close-ups: posed crew members next to evacuees (mask fitting, escort line).
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high&autoplay=0&preset=-1');
await p.evaluate(() => { const { sim } = __v4; sim.reset({ fire: 'C', smoke: 'none', stairs: 'none', ramp: 'blocked', refuge: 'no' }); __v4.afterReset(); });
const shot = async (name, P, T) => { await p.evaluate(([P, T]) => { const v = __v4.view; v.tween = null; v.camera.position.set(...P); v.controls.target.set(...T); v.controls.update(); v.frame(0.016); v.frame(0.016); }, [P, T]); await p.waitForTimeout(600); await p.screenshot({ path: `shots/${name}.png` }); };
const T0 = +(process.env.T0 || 60);
await p.evaluate((t) => { __v4.advance(t); }, T0);
const st = await p.evaluate(() => ({ crew: __v4.sim.crew.map((c) => [c.visible, c.x.toFixed(1), c.y.toFixed(1), c.pose, c.anim]), log: __v4.sim.log.slice(0, 6).map((l) => l.t.toFixed(0) + ' ' + l.text) }));
console.log(JSON.stringify(st, null, 1));
const c0 = await p.evaluate(() => { const c = __v4.sim.crew.find((c) => c.visible) || __v4.sim.crew[0]; return [c.x, c.y]; });
await shot('crew_a', [c0[0] + 3.2, 2.2, -c0[1] + 2.6], [c0[0], 0.9, -c0[1]]);
await shot('crew_b', [c0[0] - 2.6, 1.6, -c0[1] - 2.4], [c0[0], 0.9, -c0[1]]);
console.log(p.errors.slice(0, 5));
await b.close();

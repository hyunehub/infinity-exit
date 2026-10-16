// Quality review shots (overview, car close-up, fire, people, smoke, story chapter 5).
import { launch, openPage } from './lib.mjs';
const only = process.argv[2] ? process.argv[2].split(',') : null; const want = (n) => !only || only.includes(n);
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high&autoplay=0&preset=0');
const pose = async (name, P, T, adv = 0) => { if (!want(name)) return; await p.evaluate(([P, T, adv]) => { const v = __v4.view; if (adv) __v4.sim.advance(adv); v.tween = null; v.camera.position.set(...P); v.controls.target.set(...T); v.controls.update(); }, [P, T, adv]); await p.waitForTimeout(1500); await p.screenshot({ path: `shots/q_${name}.png`, clip: { x: 16, y: 56, width: 1368, height: 646 } }); };
await pose('over', [0, 19.7, 8.6], [0, 0.3, -2.2], 6);
await pose('car', [7, 2.6, -1.5], [10, 0.8, -6.5]);
await pose('fire', [-4.5, 2.6, -1.5], [-10, 1.4, -6.5], 10);
await pose('fire2', [-3, 9, 6], [-9, 1.5, -5], 15);
await pose('people', [2, 3.2, -9], [0, 0.9, -3]);
if (want('smoke')) { await p.evaluate(() => { __v4.setPreset(5); }); await pose('smoke', [10, 9, 12], [0, 1, -1], 25); }
if (want('ramp')) { await p.evaluate(() => { __v4.setPreset(2); }); await pose('ramp', [18, 16, 6], [0, 2, -16], 12); }
await b.close();

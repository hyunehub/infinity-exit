// Close-up quality shots: cars, fire, people, smoke.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high&autoplay=0&preset=0');
const pose = async (name, P, T, adv = 0) => { await p.evaluate(([P, T, adv]) => { const v = __v4.view; if (adv) __v4.sim.advance(adv); v.tween = null; v.camera.position.set(...P); v.controls.target.set(...T); v.controls.update(); }, [P, T, adv]); await p.waitForTimeout(1200); await p.screenshot({ path: `shots/q_${name}.png` }); };
await pose('car_fire', [-3, 4.5, -2], [-10, 0.8, -6.5], 14);
await pose('people', [2, 3.2, -9], [0, 0.9, -3], 1.5);
await p.evaluate(() => __v4.setPreset(5)); await pose('smoke', [6, 6, 8], [0, 1, 0], 20);
await b.close();

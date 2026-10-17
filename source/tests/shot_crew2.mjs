import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1200, 760, '?q=high&autoplay=0&preset=-1');
await p.evaluate(() => { const { sim } = __v4; sim.reset({ fire: 'C', smoke: 'ceil', stairs: 'none', ramp: 'blocked', refuge: 'no' }); __v4.afterReset(); });
const shot = async (name, P, T) => { await p.evaluate(([P, T]) => { const v = __v4.view; v.tween = null; v.camera.position.set(...P); v.controls.target.set(...T); v.controls.update(); v.frame(0.016); v.frame(0.016); }, [P, T]); await p.waitForTimeout(500); await p.screenshot({ path: `shots/${name}.png`, clip: { x: 16, y: 66, width: 1168, height: 560 } }); };
let t = 0; for (const [T, who, d] of [[47, 0, 'front'], [66, 1, 'side'], [76, 0, 'high'], [86, 0, 'high'], [96, 0, 'high']]) {
  await p.evaluate((dt) => __v4.advance(dt), T - t); t = T;
  const c = await p.evaluate((w) => { const c = __v4.sim.crew[w]; return [c.x, c.y, c.yaw, c.visible, c.pose, c.anim, __v4.sim.agents.filter((a) => a.mask).length]; }, who); console.log(T, JSON.stringify(c));
  const [x, y, yaw] = c; const fx = Math.cos(yaw), fy = Math.sin(yaw);
  if (d === 'front') await shot('cr_' + T, [x + fx * 2.4 + fy * 0.8, 1.5, -(y + fy * 2.4 - fx * 0.8)], [x, 1.1, -y]);
  else if (d === 'side') await shot('cr_' + T, [x - fy * 2.6 + fx * 0.6, 1.4, -(y + fx * 2.6 + fy * 0.6)], [x, 0.8, -y]);
  else await shot('cr_' + T, [x + 2 - fx * 6, 7, -(y - fy * 6) + 4], [x + fx * 2, 0.5, -(y + fy * 2)]);
}
console.log(p.errors.slice(0, 5)); await b.close();

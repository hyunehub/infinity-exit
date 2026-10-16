import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1600, 1000, '?q=high&mode=exp');
console.log(await p.evaluate(() => { const v = __v4.view; return JSON.stringify({ pos: v.camera.position.toArray(), t: v.controls.target.toArray(), fov: v.camera.fov, asp: v.camera.aspect, inset: [v.inset, v.insetY], w: v.wrap.clientWidth, h: v.wrap.clientHeight, st: v.camState, dist: v.controls.minDistance + '/' + v.controls.maxDistance }); }));
await b.close();

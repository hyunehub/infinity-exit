import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 800, 600, '?q=high&autoplay=0&preset=1');
const r = await p.evaluate(() => {
  const v = __v4.view; const out = [];
  v.lot.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; out.push((o.parent && o.parent.name !== 'Scene' ? o.parent.name + '/' : '') + o.name + ' | ' + ms.map((m) => m.name + (m.transparent ? 'T' : '') + (m.side === 2 ? 'D' : '') + (m.map ? 'm' : '')).join(',') + ' | tris ' + Math.round(o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3)); } });
  return out;
});
console.log(r.join('\n')); await b.close();

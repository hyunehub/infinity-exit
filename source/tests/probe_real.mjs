import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1600, 1000, '?q=high&autoplay=0&preset=1');
const r = await p.evaluate(() => {
  const v = __v4.view; v.frame(0.05);
  const cat = {}; const cnt = (name, o) => { let n = 0; o.traverse((m) => { if (m.isMesh && m.visible) { n += Array.isArray(m.material) ? m.geometry.groups.length || 1 : 1; } }); cat[name] = (cat[name] || 0) + n; };
  cnt('lot', v.lot); for (const id in v.cars) cnt('cars', v.cars[id].group); v.people.groups.forEach((g) => cnt('people', g));
  cnt('fx', v.fx.group || v.fx.root || v.scene);
  const person = v.assets.person.scene; const info = []; person.traverse((o) => { info.push(o.type + ':' + o.name + (o.isSkinnedMesh ? ' sk' : '') + ' s=' + o.scale.toArray().map((x) => +x.toFixed(3)).join(',')); });
  const sk = []; v.people.models[0].traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); sk.push(o.name + ' bb=' + JSON.stringify(o.geometry.boundingBox.min.toArray().map((x) => +x.toFixed(2))) + JSON.stringify(o.geometry.boundingBox.max.toArray().map((x) => +x.toFixed(2)))); } });
  return { cat, info: info.slice(0, 40), sk, scale: v.people.scale, yOff: v.people.yOff, calls: v.renderer.info.render.calls };
});
console.log(JSON.stringify(r, null, 1)); await b.close();

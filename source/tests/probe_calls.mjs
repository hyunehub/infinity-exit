import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1600, 1000, '?q=high&autoplay=0&preset=' + (process.argv[2] || 1));
const r = await p.evaluate(() => {
  const v = __v4.view; __v4.advance(25); v.noRender = false; v.frame(0.05);
  const kids = v.scene.children.slice(); const out = []; 
  const base = kids.map((k) => k.visible);
  for (let i = 0; i < kids.length; i++) { kids.forEach((k, j) => k.visible = j === i && base[j]); v.renderer.info.reset(); v.renderer.render(v.scene, v.camera); if (v.renderer.info.render.calls) out.push(kids[i].type + ':' + (kids[i].name || '') + ' ' + v.renderer.info.render.calls); }
  kids.forEach((k, j) => k.visible = base[j]); v.renderer.info.reset(); v.renderer.render(v.scene, v.camera);
  return { out, total: v.renderer.info.render.calls };
});
console.log(JSON.stringify(r, null, 1)); await b.close();

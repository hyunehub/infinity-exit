import { launch, openPage } from './lib.mjs';
const b = await launch();
const [preset, t, cam, out, w, h, opts] = process.argv.slice(2);
const p = await openPage(b, +(w||1600), +(h||1000), `?q=high&autoplay=0&preset=${preset}`);
const [px,py,pz,tx,ty,tz] = cam.split(',').map(Number);
await p.evaluate(([t, c, opts]) => { const v=__v4.view; if(opts) eval(opts); __v4.advance(+t); v.tween=null; v.camera.position.set(c[0],c[1],c[2]); v.controls.target.set(c[3],c[4],c[5]); v.controls.update(); __v4.advance(0.1); }, [t, [px,py,pz,tx,ty,tz], opts]);
await p.screenshot({ path: out });
console.log(p.errors, await p.evaluate(() => JSON.stringify(__v4.view.info())));
await b.close();

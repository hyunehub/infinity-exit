import { launch, openPage } from './lib.mjs';
const b = await launch();
const [preset, t, view, out, w, h, extra] = process.argv.slice(2);
const p = await openPage(b, +(w||1600), +(h||1000), `?q=high&autoplay=0&preset=${preset}`);
await p.evaluate(([t, view, extra]) => { if (extra) { eval(extra); } __v4.advance(+t); if (view) { __v4.view.setView(view, true); } __v4.advance(0.1); __v4.view.running = false; }, [t, view, extra]);
await p.waitForTimeout(800);
await p.screenshot({ path: out || 'shots/look.png', fullPage: process.env.FULL === '1' });
console.log(p.errors, await p.evaluate(() => JSON.stringify(__v4.view.info())));
await b.close();

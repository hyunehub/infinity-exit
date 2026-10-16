// UX screenshots: node tests/ux.mjs landing|story <i> <ch> |exp|mobile <i> <ch>  out [w h]
import { launch, openPage } from './lib.mjs';
const [kind, a, c, out, w, h] = process.argv.slice(2);
const b = await launch(); const process_adv = process.env.ADV || '0.01';
const W = +(w || 1600), H = +(h || 1000);
let q = '?q=high';
if (kind === 'story' || kind === 'mobile') q += `&story=${a}&chapter=${c}&autoplay=0`; else if (kind === 'exp') q += '&mode=exp';
const p = await openPage(b, kind === 'mobile' ? 390 : W, kind === 'mobile' ? 844 : H, q);
await p.evaluate(async ([kind, adv]) => {
  const v = __v4.view; if (kind === 'story' || kind === 'mobile') { __v4.advance(+adv); __v4.ui.snapCam(); __v4.ui.snapCam(); }
  if (kind === 'exp') { __v4.advance(8); } if (kind === 'landing') { __v4.advance(0.1); }
  for (let i = 0; i < 6; i++) v.frame(0.05);
  v.running = false;
}, [kind, process_adv]);
await p.waitForTimeout(900);
await p.screenshot({ path: out, fullPage: false, animations: 'disabled', timeout: 90000 });
console.log(p.errors, JSON.stringify(await p.evaluate(() => ({ mode: __v4.ui.mode(), cap: __v4.ui.cap(), co: __v4.ui.callouts() }))));
await b.close();

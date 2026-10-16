// Screenshot: preset 8 (all to E4) at ~13 s, camera near E4 to see the door queue.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1280, 760, '?q=high&autoplay=0&preset=7');
await p.evaluate(() => { const { sim, view } = __v4; sim.advance(13); if (view.setView) view.setView('stairs'); });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => __v4.sim.agents.map((a) => a.state + (a.queued ? '*' : '') + '@' + a.x.toFixed(1) + ',' + a.y.toFixed(1)).join(' '));
console.log(info);
await p.screenshot({ path: 'shots/queue_p8.png' }); await b.close();

import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 800, 500, '?q=high&autoplay=0&preset=3');
console.log(JSON.stringify(await p.evaluate(() => { const v = __v4.view, T = __v4.THREE; const o = {}; for (const n of ['SOS_S1', 'SOS_S2', 'BEACON_S1', 'ANCHOR_S1', 'ANCHOR_S2']) { const g = v.lot.getObjectByName(n); if (!g) continue; const bb = new T.Box3().setFromObject(g); o[n] = [bb.min.toArray().map((x) => +x.toFixed(2)), bb.max.toArray().map((x) => +x.toFixed(2))]; } return o; })));
await b.close();

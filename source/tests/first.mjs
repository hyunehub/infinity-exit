import { launch, openPage } from './lib.mjs';
const b = await launch(); const t0 = Date.now();
const p = await openPage(b, 1600, 1000, '?q=high&autoplay=0&preset=1');
console.log('open ms', Date.now() - t0, 'errors', p.errors);
await p.evaluate(() => { __v4.advance(14); });
await p.screenshot({ path: 'shots/dbg1.png' });
console.log(await p.evaluate(() => JSON.stringify(__v4.view.info())));
await b.close();

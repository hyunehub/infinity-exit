import { launch, openPage } from './lib.mjs';
const b = await launch(); const t0 = Date.now();
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto('file:///home/user/v4/web/site/index.html?q=high&autoplay=0&preset=1'); const tl = Date.now() - t0;
await p.waitForFunction(() => window.__v4 && window.__v4.ready, null, { timeout: 60000 }); const tr = Date.now() - t0;
console.log('load event', tl, 'ready', tr, JSON.stringify(await p.evaluate(() => ({ ff: __v4.firstFrame, tm: __v4.timing, nav: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd })))); await b.close();

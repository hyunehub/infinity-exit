import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high');
await p.evaluate(() => { __v4.ui.enterCases(); document.querySelector('#cVent button[data-v="smart"]').click(); __v4.ui.loadCase('A', ''); __v4.setPlaying(false); });
const cnt = async () => p.evaluate(() => ({ streaks: __v4.view.air.streak.count, labels: Object.values(__v4.view.air.labels).filter((l) => l.visible).length, phase: __v4.sim.vent.phase }));
await p.evaluate(() => __v4.advance(0.5)); console.log('before fire', JSON.stringify(await cnt())); await p.screenshot({ path: 'shots/still_0.png' });
await p.evaluate(() => __v4.advance(15)); console.log('A fire, open exits', JSON.stringify(await cnt()));
await p.evaluate(() => { __v4.ui.loadCase('A', 'BCDR'); __v4.setPlaying(false); __v4.advance(20); }); console.log('trapped, waiting', JSON.stringify(await cnt())); await p.screenshot({ path: 'shots/still_1.png' });
console.log(p.errors.slice(0, 3)); await b.close();

// Story "불난 차가 경사로를 막았을 때": result chapter with the 119 panel and the rescue team.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high');
await p.evaluate(() => { __v4.ui.startStory(4); __v4.story.setChapter(5); __v4.setPlaying(false); __v4.story.playing = false; });
let t = await p.evaluate(() => __v4.sim.t); console.log('ch5 at', t.toFixed(1));
for (const T of [70, 150]) { await p.evaluate((dt) => __v4.advance(dt), T - t); t = T; await p.waitForTimeout(900);
  console.log(T, await p.evaluate(() => [__v4.ui.cap().s, __v4.ui.callouts().join(' | ')])); await p.screenshot({ path: `shots/s_rescue_${T}.png` }); }
console.log(p.errors.slice(0, 5)); await b.close();

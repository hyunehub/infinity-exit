// Story-mode review shots: story s (1-based), chapter k (1-based), extra sim seconds.
import { launch, openPage } from './lib.mjs';
const list = (process.argv[2] || '2:4:3,2:5:6,4:5:4,6:5:6').split(',').map((x) => x.split(':').map(Number));
const b = await launch(); const p = await openPage(b, 1600, 1000, '?q=high&autoplay=0', '/home/user/v4/web/site/index.html');
for (const [s, k, adv] of list) {
  await p.evaluate(([s, k, adv]) => { const v = __v4.view; v.noRender = false; __v4.ui.startStory(s - 1); __v4.story.setChapter(k - 1); __v4.story.playing = false; __v4.sim.playing = false; __v4.advance(adv); __v4.ui.snapCam(); __v4.ui.snapCam(); }, [s, k, adv]);
  await p.waitForTimeout(1500); await p.screenshot({ path: `shots/st_${s}_${k}.png`, timeout: 90000 });
}
await b.close();

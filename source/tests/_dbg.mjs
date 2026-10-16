import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 800, 500, '?q=high&autoplay=0&preset=3');
console.log(JSON.stringify(await p.evaluate(() => { __v4.setPlaying(false); __v4.advance(26); __v4.view.setView('sos', true); __v4.advance(0.1); const A = __v4.sim.agents, P = __v4.view.people; return A.map((a) => [a.id, a.state, a.anim, P.cur[a.id], P.actions[a.id].WaitCrouch.getEffectiveWeight().toFixed(2), P.actions[a.id].Run.getEffectiveWeight().toFixed(2), P.actions[a.id].PressButton.getEffectiveWeight().toFixed(2)]); })));
await b.close();

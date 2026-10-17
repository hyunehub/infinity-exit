// Cases mode with ventilation + 119 panel.
import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, +(process.env.W || 1400), +(process.env.H || 860), '?q=high');
await p.evaluate(() => __v4.ui.enterCases());
const go = async (f, sm, vent, times, tag) => { await p.evaluate(([f, sm, v]) => { document.querySelector(`#cVent button[data-v="${v}"]`).click(); __v4.ui.loadCase(f, sm); __v4.setPlaying(false); }, [f, sm, vent]); let t = 0;
  for (const T of times) { await p.evaluate((dt) => __v4.advance(dt), T - t); t = T; await p.waitForTimeout(700); await p.screenshot({ path: `shots/c_${tag}_${T}.png` }); } };
await go('A', '', 'normal', [20], 'An');
await go('A', '', 'smart', [20], 'As');
await go('AB', 'CD', 'smart', [30, 60, 90], 'iso');
console.log(p.errors.slice(0, 6)); await b.close();

import { launch, openPage } from './lib.mjs';
const b = await launch(); const p = await openPage(b, 1400, 860, '?q=high');
await p.evaluate(() => { __v4.ui.enterCases(); document.querySelector('#cVent button[data-v="smart"]').click(); __v4.ui.loadCase('A', 'BCDR'); __v4.setPlaying(false); });
let t = 0; for (const T of [11, 24]) { await p.evaluate((dt) => __v4.advance(dt), T - t); t = T; await p.waitForTimeout(800); await p.screenshot({ path: `shots/p2_${T}.png` }); }
console.log(await p.evaluate(() => [document.getElementById('ctSum').textContent, document.querySelectorAll('#ctBody tr').length, document.getElementById('cRes').innerText, __v4.ui.callouts().join(' | ')]));
console.log(p.errors.slice(0, 5)); await b.close();

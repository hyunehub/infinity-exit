// "Every exit blocked" scenarios: the fire in some zones, smoke drifted into all the others, the ramp full of smoke.
// People wait for 119 at an SOS area. Fans off vs smart mode, where the fans run only while people wait: fresh air into the
// waiting area, exhaust around it. Measures the smoke the waiting people breathe until the rescue team takes them out.
import { Sim } from '../src/sim/sim.js';
import fs from 'fs';
const O = JSON.parse(fs.readFileSync(new URL('./obstacles.json', import.meta.url)));
const Z = ['A', 'B', 'C', 'D']; const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => s + x)), ['']);
const cases = subsets(Z).filter((f) => f && f.length < 4).map((f) => ({ fire: f, smokeZ: Z.filter((z) => !f.includes(z)).join('') }));
const out = { off: [], normal: [], smart: [] };
for (const c of cases) for (const v of ['off', 'normal', 'smart']) {
  const S = new Sim(7); S.setSpawns(O.spawns); S.setObstacles(O.obst);
  S.reset(Object.assign({ vent: v, ramp: 'dense', smoke: 'ceil', stairs: 'ok', refuge: 'no' }, c));
  let w1 = 0, w2 = 0, wt = 0, maxSt = 0; const T = +(process.env.T || 220);
  for (let k = 0; k < T * 20; k++) { S.step(); for (const a of S.agents) if (a.visible && ['wait', 'press', 'rescued'].includes(a.state)) { wt += 0.05; if (a.stage >= 1) w1 += 0.05; if (a.stage >= 2) w2 += 0.05; maxSt = Math.max(maxSt, a.stage); }
    if (S.agents.every((a) => a.state === 'done') && (S.rescue.doneAt != null)) break; }
  const done = S.agents.filter((a) => a.state === 'done');
  const r = { ...c, self: done.filter((a) => !a.rescued).length, rescued: S.stats.rescued, last: Math.round(Math.max(0, ...done.map((a) => a.doneAt))), wt: Math.round(wt), w1: Math.round(w1), w2: Math.round(w2), maxSt, sos: S.vent.sos && S.vent.sos.join(','), start: S.vent.startAt };
  out[v].push(r); if (process.env.V) console.log(v.padEnd(5), c.fire.padEnd(4), '+' + c.smokeZ.padEnd(4), `self ${r.self} rescued ${r.rescued} last ${r.last}s waiting ${r.wt}s in smoke>=1 ${r.w1}s >=2 ${r.w2}s max stage ${r.maxSt}`, v === 'smart' ? `fans from ${r.start?.toFixed(1)}` : '');
}
for (const v of ['off', 'normal', 'smart']) { const o = out[v], sum = (k) => o.reduce((a, r) => a + (r[k] || 0), 0); console.log(`[${v}] cases ${o.length} self ${sum('self')} rescued ${sum('rescued')} mean last ${(sum('last') / o.length).toFixed(1)}s waiting ${sum('wt')}s, in smoke stage>=1 ${sum('w1')}s (${(sum('w1') / sum('wt') * 100).toFixed(0)}%), stage>=2 ${sum('w2')}s (${(sum('w2') / sum('wt') * 100).toFixed(0)}%)`); }

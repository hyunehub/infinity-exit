// "Every exit blocked" scenarios: the fire in some zones, smoke drifted into all the others, the ramp full of smoke.
// Compares fans off with the smart mode, where the fans only run to open one escape route while everybody is trapped.
import { run } from './vent.mjs';
const Z = ['A', 'B', 'C', 'D']; const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => s + x)), ['']);
const cases = subsets(Z).filter((f) => f && f.length < 4).map((f) => ({ fire: f, smokeZ: Z.filter((z) => !f.includes(z)).join('') }));
const out = { off: [], smart: [] };
for (const c of cases) for (const v of ['off', 'smart']) {
  const r = run(Object.assign({ vent: v, ramp: 'dense' }, c), { T: +(process.env.T || 200) }); const S = r.sim, V = S.vent;
  const res = { ...c, evac: r.evac, self: S.agents.filter((a) => a.state === 'done' && !a.rescued).length, rescued: S.stats.rescued, last: r.time, expo2: r.expo2, target: V.target, start: V.startAt, open: V.openAt, phase: V.phase, iso: S.agents.some((a) => a.kind === 'sos' || a.kind === 'stay') };
  out[v].push(res);
  if (process.env.V) console.log(v.padEnd(5), c.fire.padEnd(4), '+' + c.smokeZ.padEnd(4), `self ${res.self} rescued ${res.rescued} last ${res.last}s expo2 ${res.expo2}`, v === 'smart' ? `path ${res.target || '-'} start ${res.start?.toFixed(1)} open ${res.open?.toFixed(1)} ${res.phase}` : '');
}
for (const v of ['off', 'smart']) { const o = out[v], sum = (k) => o.reduce((a, r) => a + (r[k] || 0), 0); console.log(`[${v}] cases ${o.length} self-evac ${sum('self')} rescued ${sum('rescued')} mean last ${(sum('last') / o.length).toFixed(1)}s expo2 ${sum('expo2')}s` + (v === 'smart' ? ` opened ${o.filter((r) => r.open != null).length} mean open after fans ${(o.filter((r) => r.open != null).reduce((a, r) => a + r.open - r.start, 0) / Math.max(1, o.filter((r) => r.open != null).length)).toFixed(1)}s` : '')); }

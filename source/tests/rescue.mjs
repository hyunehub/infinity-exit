import { run } from './vent.mjs';
const cs = [{ fire: 'C', smoke: 'dense', stairs: 'none', ramp: 'dense', refuge: 'no' }, { fire: 'C', smoke: 'dense', stairs: 'none', ramp: 'dense', refuge: 'yes' }, { fire: 'ABCD', smokeZ: '' }, { fire: 'A', smokeZ: 'BCD', ramp: 'dense' }];
for (const c of cs) for (const loc of [true, false]) {
  const r = run(Object.assign({ loc119: loc }, c), { T: +(process.env.T || 160) }); const R = r.sim.rescue;
  console.log(JSON.stringify(c), 'loc', loc, '→ evac', r.evac, 'rescued', R.rescued, 'steps', JSON.stringify(Object.fromEntries(Object.entries(R.steps).map(([k, v]) => [k, +v.toFixed(1)]))), 'last', r.time);
  if (process.env.LOG) console.log(r.sim.log.filter((l) => l.kind === 'r119' || l.kind === 'sos' || l.kind === 'vent').reverse().map((l) => '   ' + l.t.toFixed(1) + ' ' + l.text).join('\n'));
}

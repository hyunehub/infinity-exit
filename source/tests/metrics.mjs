// Behaviour metrics per preset: target switches, evac time, smoke exposure, exit-state flapping.
import { Sim, PRESETS } from '../src/sim/sim.js';
const T = +(process.env.T || 120);
const only = process.env.P ? process.env.P.split(',').map(Number) : null;
const sim = new Sim(7);
const rows = [];
for (let i = 0; i < PRESETS.length; i++) {
  if (only && !only.includes(i + 1)) continue;
  sim.preset(i);
  const sw = new Array(12).fill(0), lastT = new Array(12).fill(null), seq = Array.from({ length: 12 }, () => []);
  const expo = new Array(12).fill(0), st2 = new Array(12).fill(0); let flaps = 0; const lastEx = {}; const flapLog = [];
  let rampBack = 0; const maxY = new Array(12).fill(-99);
  for (let k = 0; k < T * 20; k++) {
    sim.step();
    sim.agents.forEach((a, j) => {
      if (a.target !== lastT[j]) { if (lastT[j] != null && a.target != null) { sw[j]++; } if (a.target != null) seq[j].push(a.target + '@' + sim.t.toFixed(1)); lastT[j] = a.target; }
      if (a.visible && a.state !== 'done') { const r = sim.field.read(a.x, Math.min(a.y, 41.3), {}); expo[j] += (a.crouch ? r.low * 0.5 : r.low) * 0.05; if (a.stage >= 2) st2[j] += 0.05; }
      if (a.y > maxY[j]) maxY[j] = a.y; if (maxY[j] > 13 && a.y < maxY[j] - 2) { rampBack++; maxY[j] = a.y; }
    });
    const ex = sim.exitDisplay();
    for (const X in ex) { if (lastEx[X] && lastEx[X] !== ex[X].s) { flaps++; flapLog.push(`${X}:${lastEx[X]}->${ex[X].s}@${sim.t.toFixed(1)}`); } lastEx[X] = ex[X].s; }
  }
  const done = sim.agents.filter((a) => a.state === 'done');
  const tEv = done.map((a) => a.doneAt); const maxT = tEv.length ? Math.max(...tEv).toFixed(1) : '-';
  rows.push({ p: i + 1, done: done.length, waiting: 12 - done.length, lastEvac: maxT, switches: sw.reduce((a, b) => a + b, 0), maxSw: Math.max(...sw), expoMax: Math.max(...expo).toFixed(1), st2Max: Math.max(...st2).toFixed(1), flaps, rampBack });
  if (process.env.V) { console.log('#' + (i + 1), flapLog.join(' ')); seq.forEach((s, j) => sw[j] > 0 && console.log('  a' + j, s.join(' '))); }
}
console.table(rows);

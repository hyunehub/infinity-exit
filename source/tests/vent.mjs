// Ventilation comparison: same fire, vent off / normal / smart. Prints exits over time, smoke exposure, evacuation.
import { Sim } from '../src/sim/sim.js';
import fs from 'fs';
const O = JSON.parse(fs.readFileSync(new URL('./obstacles.json', import.meta.url)));
const fires = (process.env.F || 'A').split(','); const sms = (process.env.SM || '').split(',');
const map = (sim) => { let s = ''; for (let y = 9; y >= -9; y -= 2) { let l = ''; for (let x = -13; x <= 13; x += 1.3) { const r = sim.field.read(x, y, {}); l += r.ceil >= 15 || r.low >= 8 ? '#' : r.ceil >= 3 ? '+' : r.ceil >= 0.8 ? '.' : ' '; } s += '|' + l + '|\n'; } return s; };
export function run(c, opt = {}) {
  const sim = new Sim(7); sim.setSpawns(O.spawns); sim.setObstacles(O.obst);
  sim.reset(Object.assign({ smoke: 'ceil', stairs: 'ok', ramp: 'ok', refuge: 'no', wind: 'auto', car: true, power: true, lost: null, doors: { E1: null, E2: null, E3: null, E4: null } }, c));
  let expo = 0, expo2 = 0; const tl = []; let last = '';
  for (let k = 0; k < (opt.T || 90) * 20; k++) {
    sim.step(); for (const a of sim.agents) if (a.visible && a.state !== 'done') { if (a.stage >= 1) expo += 0.05; if (a.stage >= 2) expo2 += 0.05; }
    if (k % 20 === 0) { const ex = sim.exitDisplay(); const sig = ['E1', 'E2', 'E3', 'E4', 'V'].map((X) => X + ':' + ex[X].s[0] + (ex[X].why ? '(' + ex[X].why + ')' : '')).join(' '); if (sig !== last) { tl.push(sim.t.toFixed(0) + 's ' + sig); last = sig; } }
    if (opt.map && Math.abs(sim.t - opt.map) < 0.026) console.log(map(sim));
  }
  const done = sim.agents.filter((a) => a.state === 'done');
  const used = {}; for (const a of done) used[a.exitId] = (used[a.exitId] || 0) + 1;
  const zst = Object.fromEntries(['A', 'B', 'C', 'D'].map((z) => [z, sim.nodes[z].stage]));
  return { evac: done.length, time: done.length ? Math.round(Math.max(...done.map((a) => a.doneAt))) : 0, expo: Math.round(expo), expo2: Math.round(expo2), used, zst, tl, sim };
}
if (process.argv[1].endsWith('vent.mjs')) for (const f of fires) for (const sm of sms) for (const v of (process.env.V || 'off,normal,smart').split(',')) {
  const r = run({ fire: f, smokeZ: sm, vent: v, flowPred: process.env.NOFP ? false : true }, { map: +(process.env.MAP || 0), T: +(process.env.T || 90) });
  console.log(`== fire ${f} smoke+${sm || '-'} vent ${v}: evac ${r.evac} last ${r.time}s exposure ${r.expo} (stage2 ${r.expo2}) used ${JSON.stringify(r.used)} zones ${JSON.stringify(r.zst)}`);
  if (process.env.TL) console.log('  ' + r.tl.join('\n  '));
}

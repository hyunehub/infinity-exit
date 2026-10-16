// All combinations: fire in any non-empty set of zones A-D, smoke drifted into any subset of the other zones (65 cases).
// Writes src/cases.json (guidance + outcome per case) and prints a summary. Uses the real car obstacles from the 3D view.
import { Sim } from '../src/sim/sim.js';
import fs from 'fs';
const O = JSON.parse(fs.readFileSync(new URL('./obstacles.json', import.meta.url)));
const Z = ['A', 'B', 'C', 'D']; const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => s + x)), ['']);
export const CASES = []; for (const f of subsets(Z).filter(Boolean).sort((a, b) => a.length - b.length || a.localeCompare(b))) for (const sm of subsets(Z.filter((z) => !f.includes(z))).sort((a, b) => a.length - b.length || a.localeCompare(b))) CASES.push({ fire: f, smokeZ: sm });
const T_GUIDE = +(process.env.TG || 12), T_END = +(process.env.TE || 70);
const out = []; const t0 = Date.now();
for (const cs of CASES) {
  const sim = new Sim(7); sim.setSpawns(O.spawns); sim.setObstacles(O.obst);
  sim.reset({ fire: cs.fire, smokeZ: cs.smokeZ, smoke: 'ceil', stairs: 'ok', ramp: 'ok', refuge: 'no', wind: 'auto', car: true, power: true, lost: null, doors: { E1: null, E2: null, E3: null, E4: null } });
  let guide = null;
  for (let k = 0; k < T_END * 20; k++) {
    sim.step();
    if (!guide && sim.t >= T_GUIDE) { const ex = sim.exitDisplay(); const M = sim.nodes.M.dec; const tg = {}; for (const id of ['A', 'B', 'C', 'D']) { const d = sim.nodes[id].dec; tg[id] = d && d.alive !== false && sim.nodes[id].ok ? d.target : null; }
      guide = { smoke: Object.fromEntries(['A', 'B', 'C', 'D'].map((z) => [z, sim.nodes[z].stage])), mode: M.mode, exits: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.s])), why: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.why])), targets: tg }; }
    if (sim.agents.every((a) => a.state === 'done' || a.state === 'wait' || a.state === 'press') && sim.t > T_GUIDE) break;
  }
  const done = sim.agents.filter((a) => a.state === 'done'); const used = {}; for (const a of done) used[a.exitId] = (used[a.exitId] || 0) + 1;
  out.push({ ...cs, ...guide, evac: done.length, wait: sim.agents.length - done.length, time: Math.round(Math.max(sim.t, ...done.map((a) => a.doneAt))), used });
}
fs.writeFileSync(new URL('../src/cases.json', import.meta.url), JSON.stringify(out));
const name = (x) => (x === 'V' ? '경사로' : x);
for (const r of out) console.log(`${r.fire.padEnd(4)} 연기+${(r.smokeZ || '-').padEnd(3)} ${r.mode.padEnd(9)} 출구 ${Object.keys(r.used).map(name).join(',') || '-'}  닫힘 ${Object.entries(r.exits).filter(([, v]) => v === 'closed').map(([k]) => name(k)).join(',')}  대피 ${r.evac} 대기 ${r.wait} ${r.time}s`);
console.log(`cases ${out.length}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);

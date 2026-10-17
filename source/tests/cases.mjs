// All combinations: fire in any non-empty set of zones A-D, smoke drifted into any subset of the other zones (65 cases),
// with and without smoke on the ramp (130),
// each under three ventilation modes (off, everyday pattern left running, smart control). Writes src/cases.json
// ({off:[...], normal:[...], smart:[...]}: guidance + outcome per case, rescue included) and prints a summary.
import { Sim } from '../src/sim/sim.js';
import fs from 'fs';
const O = JSON.parse(fs.readFileSync(new URL('./obstacles.json', import.meta.url)));
const Z = ['A', 'B', 'C', 'D']; const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => s + x)), ['']);
export const CASES = []; for (const R of ['', 'R']) for (const f of subsets(Z).filter(Boolean).sort((a, b) => a.length - b.length || a.localeCompare(b))) for (const sm of subsets(Z.filter((z) => !f.includes(z))).sort((a, b) => a.length - b.length || a.localeCompare(b))) CASES.push({ fire: f, smokeZ: sm + R }); // R: the ramp is full of smoke too
const T_GUIDE = +(process.env.TG || 12), T_END = +(process.env.TE || 200);
const MODES = (process.env.MODES || 'off,normal,smart').split(',');
const res = {}; const t0 = Date.now();
for (const vent of MODES) {
  const out = (res[vent] = []);
  for (const cs of CASES) {
    const sim = new Sim(7); sim.setSpawns(O.spawns); sim.setObstacles(O.obst);
    sim.reset({ fire: cs.fire, smokeZ: cs.smokeZ.replace('R', ''), vent, flowPred: !process.env.NOFP, smoke: 'ceil', stairs: 'ok', ramp: cs.smokeZ.includes('R') ? 'dense' : 'ok', refuge: 'no', wind: 'auto', car: true, power: true, lost: null, doors: { E1: null, E2: null, E3: null, E4: null } });
    let guide = null, expo = 0, expo2 = 0, open60 = null;
    for (let k = 0; k < T_END * 20; k++) {
      sim.step();
      for (const a of sim.agents) if (a.visible && a.state !== 'done') { if (a.stage >= 1) expo += 0.05; if (a.stage >= 2) expo2 += 0.05; }
      if (!guide && sim.t >= T_GUIDE) { const ex = sim.exitDisplay(); const M = sim.nodes.M.dec; const tg = {}; for (const id of Z) { const d = sim.nodes[id].dec; tg[id] = d && sim.nodes[id].ok ? d.target : null; }
        guide = { smoke: Object.fromEntries(Z.map((z) => [z, sim.nodes[z].stage])), mode: M.mode, exits: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.s])), why: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.why])), targets: tg }; }
      if (open60 == null && sim.t >= 60) { const ex = sim.exitDisplay(); open60 = ['E1', 'E2', 'E3', 'E4'].filter((X) => ex[X].s !== 'closed').length; }
      if (sim.agents.every((a) => a.state === 'done') && sim.t > T_GUIDE && (sim.rescue.doneAt != null || sim.rescue.clearAt != null || !sim.agents.some((a) => a.rescued))) { if (open60 == null) open60 = -1; break; }
    }
    const done = sim.agents.filter((a) => a.state === 'done'); const used = {}; for (const a of done) used[a.exitId] = (used[a.exitId] || 0) + 1;
    const R = sim.rescue; const r1 = (v) => (v == null ? null : Math.round(v));
    out.push({ ...cs, ...guide, evac: done.length, rescued: done.filter((a) => a.rescued).length, wait: sim.agents.length - done.length, time: Math.round(Math.max(sim.t * 0, ...done.map((a) => a.doneAt))), used, expo: Math.round(expo), expo2: Math.round(expo2), open60,
      r: R.steps.entry != null ? { entry: r1(R.steps.entry), contact: r1(R.steps.contact), done: r1(R.steps.done), via: R.teams[0] && R.teams[0].entry } : null });
  }
}
fs.writeFileSync(new URL('../src/cases.json', import.meta.url), JSON.stringify(res));
const name = (x) => (x === 'V' ? '경사로' : x);
for (const vent of MODES) {
  const o = res[vent]; const sum = (k) => o.reduce((a, r) => a + (r[k] || 0), 0);
  if (process.env.V) for (const r of o) console.log(`${vent.padEnd(6)} ${r.fire.padEnd(4)} 연기+${(r.smokeZ || '-').padEnd(3)} ${r.mode.padEnd(9)} 출구 ${Object.keys(r.used).map(name).join(',') || '-'}  닫힘 ${Object.entries(r.exits).filter(([, v]) => v === 'closed').map(([k]) => name(k)).join(',')}  대피 ${r.evac} (구조 ${r.rescued}) 대기 ${r.wait} ${r.time}s 노출 ${r.expo}/${r.expo2}`);
  const iso = o.filter((r) => ['isolation', 'stay', 'refuge'].includes(r.mode)).length;
  for (const R of [false, true]) { const q = o.filter((r) => r.smokeZ.includes('R') === R), s2 = (k) => q.reduce((a, r) => a + (r[k] || 0), 0); console.log(`  [${vent} ramp ${R ? 'smoke' : 'clear'}] self ${s2('evac') - s2('rescued')} rescued ${s2('rescued')} wait ${s2('wait')} isolation ${q.filter((r) => ['isolation', 'stay', 'refuge'].includes(r.mode)).length} mean ${(s2('time') / q.length).toFixed(1)}s expo2 ${s2('expo2')}`); }
  console.log(`[${vent}] cases ${o.length}  evac ${sum('evac')}  rescued ${sum('rescued')}  wait ${sum('wait')}  isolation ${iso}  mean time ${(sum('time') / o.length).toFixed(1)}s  exposure stage>=1 ${sum('expo')}s, stage>=2 ${sum('expo2')}s`);
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s`);

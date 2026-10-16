import { Sim, PRESETS } from '../src/sim/sim.js';
const sim = new Sim(7);
for (const i of [0, 1, 2, 3, 4, 8]) {
  sim.preset(i); const ev = {}; 
  for (let k = 0; k < 20 * 70; k++) { sim.step(); const t = sim.t;
    if (ev.det == null && Object.values(sim.nodes).some((n) => Object.keys(n.knownFires).length)) ev.det = t;
    if (ev.M == null && sim.nodes.M && Object.keys(sim.nodes.M.knownFires).length) ev.M = t;
    if (ev.allP == null && ['A', 'B', 'C', 'D'].every((id) => Object.keys(sim.nodes[id].knownFires).length)) ev.allP = t;
    if (ev.dec == null && ['A', 'B', 'C', 'D', 'M'].some((id) => sim.nodes[id].dec && ['stairs', 'ramp', 'caution', 'isolation', 'refuge', 'stay'].includes(sim.nodes[id].dec.mode))) ev.dec = t;
    if (ev.go == null && sim.agents.some((a) => a.state === 'go')) ev.go = t;
    if (ev.press == null && sim.agents.some((a) => a.state === 'press')) ev.press = t;
    if (ev.firstDone == null && sim.agents.some((a) => a.state === 'done')) ev.firstDone = t;
    if (ev.settle == null && sim.agents.every((a) => a.state === 'done' || a.state === 'wait')) ev.settle = t;
  }
  console.log(i, JSON.stringify(ev), sim.stats, sim.agents.map((a) => a.state[0]).join(''));
}

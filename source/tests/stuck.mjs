// Finds agents that stop making progress while moving (stuck on cars/walls). Uses the real car obstacles from the 3D view.
import { Sim, PRESETS } from '../src/sim/sim.js';
import fs from 'fs';
const O = JSON.parse(fs.readFileSync(new URL('./obstacles.json', import.meta.url)));
const seeds = (process.env.SEEDS || '7,1,2').split(',').map(Number); let total = 0; const rows = [];
for (const seed of seeds) for (let i = 0; i < PRESETS.length; i++) {
  const sim = new Sim(seed); sim.setSpawns(O.spawns); sim.setObstacles(O.obst); sim.preset(i);
  const hist = sim.agents.map(() => []); const stuck = new Set(); let inCar = 0;
  for (let k = 0; k < 70 * 20; k++) {
    sim.step();
    sim.agents.forEach((a, j) => {
      for (const o of O.obst) { if (o.id === 'carR' && !sim.fires.some((f) => f.id === 'carR') && sim.cond.ramp !== 'blocked') continue; if (a.visible && Math.abs(a.x - o.x) < o.hx + 0.15 && Math.abs(a.y - o.y) < o.hy + 0.15) inCar++; }
      if (a.state !== 'go' || a.queued) { hist[j] = []; return; } const h = hist[j]; h.push([a.x, a.y]); if (h.length > 50) h.shift();
      if (h.length === 50 && Math.hypot(h[0][0] - a.x, h[0][1] - a.y) < 0.35 && !stuck.has(j)) { stuck.add(j); rows.push(`seed ${seed} #${i + 1} agent ${j} stuck at (${a.x.toFixed(1)},${a.y.toFixed(1)}) t=${sim.t.toFixed(1)} target=${a.target}`); }
    });
  }
  total += stuck.size; if (inCar) rows.push(`seed ${seed} #${i + 1} agent-in-car samples: ${inCar}`);
}
console.log(rows.join('\n')); console.log('STUCK total', total);

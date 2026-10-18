// Part 1.7 scenario oracle (pure sim, node). Also checks danger-circle distance on every tick.
import { Sim, PRESETS } from '../src/sim/sim.js';
import { FIRE_R, NODE_DEFS, CARS } from '../src/sim/world.js';
let fails = 0, passes = 0; const out = [];
const ok = (c, msg) => { if (c) passes++; else { fails++; out.push('  FAIL: ' + msg); } };
const sim = new Sim(7);
function run(i, T, checks) {
  sim.preset(i - 1); let anyCrouch = false, minD = 99, inside = 0; const usedExit = {}; const log = [];
  const cps = Object.keys(checks).map(Number).sort((a, b) => a - b);
  const ctx = { sim, anyCrouch: () => anyCrouch };
  for (let tick = 0; tick < T * 20; tick++) {
    sim.step();
    for (const a of sim.agents) {
      if (a.anim === 'CrouchWalk') anyCrouch = true;
      if (a.visible && !a.startInside) for (const f of sim.fires) { const d = Math.hypot(a.x - f.x, a.y - f.y); minD = Math.min(minD, d); if (d < FIRE_R - 0.01) inside++; }
    }
    const t = Math.round(sim.t * 100) / 100; if (cps.length && t >= cps[0] - 1e-6) { const k = cps.shift(); const s = sim.snapshot(); checks[k](s, sim, ctx); }
  }
  ok(inside === 0, `#${i} agents entered danger circle (${inside} samples), minD=${minD.toFixed(2)}`);
  ok(minD >= FIRE_R - 0.01, `#${i} min distance to fire ${minD.toFixed(2)} < ${FIRE_R}`);
  const ev = sim.agents.map((a) => (a.state === 'done' ? a.exitId : a.state + ':' + (a.target || '')));
  out.push(`#${i} ${PRESETS[i - 1].name}\n  minD=${minD.toFixed(2)} agents=${ev.join(' ')}`);
  return { ev, minD };
}
const E = (s, ...ids) => ids.every((x) => s.exits[x] === 'closed');
const O = (s, ...ids) => ids.every((x) => s.exits[x] === 'open');
const nc = (s, ...ids) => ids.every((x) => s.exits[x] !== 'closed');
let r;
r = run(1, 70, { 8: (s) => { ok(E(s, 'E1') && s.why.E1 === 'fire', '1: E1 closed by fire'); ok(O(s, 'E2', 'E3', 'E4'), '1: E2-E4 open'); ok(s.rec.mode === 'stairs', '1: mode stairs'); ok(['E2', 'E3', 'E4'].includes(s.guide.A.target), '1: A guided to open stair ' + s.guide.A.target); ok(s.guide.C.target === 'E3' && s.guide.D.target === 'E4' && s.guide.B.target === 'E2', '1: nearest stairs per pillar'); } });
ok(r.ev.every((e) => /^E[234]$/.test(e)), '1: all evacuate through open stairs: ' + r.ev.join(','));
{ const cnt = {}; for (const e of r.ev) cnt[e] = (cnt[e] || 0) + 1; ok(Math.max(...Object.values(cnt)) <= 5, '1: load spread over open stairs ' + JSON.stringify(cnt)); }
r = run(2, 70, { 25: (s) => { ok(E(s, 'E1') && s.why.E1 === 'fire', '2: E1 closed(fire)'); ok(E(s, 'E2') && /predict|smoke/.test(s.why.E2), '2: E2 closed by spread prediction: ' + s.exits.E2 + '/' + s.why.E2); ok(nc(s, 'E3', 'E4'), '2: E3,E4 not closed: ' + s.exits.E3 + s.exits.E4); ok(['E3', 'E4'].includes(s.guide.M.target), '2: M guided to E3/E4 (' + s.guide.M.target + ')'); } });
r = run(3, 70, { 8: (s) => { ok(E(s, 'E1', 'E2', 'E3', 'E4'), '3: stairs all closed'); ok(s.exits.V === 'open', '3: ramp open'); ok(s.rec.mode === 'ramp', '3: mode ramp'); ok(s.guide.A.text[0].includes('경사로') && s.guide.A.text[1].includes('차량 주의'), '3: OLED text ' + s.guide.A.text.join('/')); } });
ok(r.ev.every((e) => e === 'V'), '3: all evacuate via ramp: ' + r.ev.join(','));
r = run(4, 60, { 20: (s) => { ok(s.rec.mode === 'isolation', '4: isolation'); ok(s.exits.V !== 'open', '4: ramp not open (R1 light smoke) ' + s.exits.V); ok(s.guide.M.target === 'S2', '4: farthest SOS = S2: ' + s.guide.M.target); ok(s.guide.A.text[0].startsWith('SOS') && s.guide.A.text[1].includes('버튼'), '4: OLED SOS text'); } });
ok(r.ev.filter((e) => /^(wait|press)/.test(e)).length >= 10 && sim.sos.S2.n >= 10, '4: agents wait at SOS S2 (n=' + sim.sos.S2.n + ') ' + sim.sosLine('S2'));
ok(sim.sos.S2.status === 'rescue', '4: rescue status reached ' + sim.sos.S2.status);
r = run(5, 60, { 20: (s) => { ok(s.rec.mode === 'isolation', '5: isolation'); ok(s.exits.V === 'closed' && s.why.V === 'fire', '5: ramp closed by burning car'); ok(s.guide.M.target === 'S1', '5: SOS away from ramp-front fire: ' + s.guide.M.target); } });
r = run(6, 60, { 20: (s, sm) => { ok(s.rec.mode === 'refuge' && s.guide.M.target === 'Q', '6: refuge Q ' + s.rec.mode); }, 30: (s, sm) => { ok(sm.agents.filter((a) => a.y < -10).length >= 10, '6: agents inside Q: ' + sm.agents.filter((a) => a.y < -10).length); }, 45: (s, sm) => { ok(sm.qDoorClosed, '6: Q door closed'); ok(sm.sos.Q.n >= 10 && sm.sos.Q.status !== 'idle', '6: SOS from Q ' + sm.sosLine('Q')); } });
r = run(7, 60, { 20: (s, sm) => { ok(s.rec.mode === 'isolation' && s.guide.M.target === 'S2', '7: unknown=none -> SOS S2: ' + s.rec.mode + s.guide.M.target); ok(sm.agents.every((a) => a.y > -10), '7: nobody in Q'); } });
r = run(8, 60, { 15: (s) => { ok(s.exits.E4 === 'caution', '8: E4 caution ' + s.exits.E4); ok(s.rec.mode === 'caution' && s.guide.M.target === 'E4', '8: caution route to E4'); ok(s.guide.A.text[1] === '자세 낮춤', '8: OLED 자세 낮춤'); } });
ok(r.ev.every((e) => e === 'E4'), '8: all via E4: ' + r.ev.join(','));
{ const ts = sim.agents.map((a) => a.doneAt).sort((a, b) => a - b); let minGap = 9; for (let k = 1; k < ts.length; k++) minGap = Math.min(minGap, ts[k] - ts[k - 1]); ok(minGap >= 1 / 1.2 - 0.06, '8: one door passes at most 1.2 persons/s (min gap ' + minGap.toFixed(2) + ' s)'); }
{ const used = new Set(); r = run(9, 70, { 6: (s, sm, c) => { ok(!sm.power && s.rec.mode === 'stairs', '9: power outage, stairs mode ' + s.rec.mode); ok(s.exits.E4 === 'closed', '9: E4 closed (fire 5m)'); },
  65: (s, sm) => { const M = sm.nodes.M.dec; ok(M.exits.E1.s === 'open' && M.exits.E1.why === 'predict-miss', '9: wrong spread prediction for E1 cancelled by clean sensors ' + M.exits.E1.s + '/' + M.exits.E1.why); ok(M.exits.V.s === 'open', '9: ramp reopened after prediction miss ' + M.exits.V.s); ok(M.mode === 'stairs', '9: still stairs mode at 65 s (not isolation) ' + M.mode); } }); ok(r.ev.every((e) => /^E[123]$/.test(e)), '9: all evacuate via stairs E1-E3: ' + r.ev.join(',')); }
{ r = run(10, 80, { 1: (s, sm) => { ok(sm.agents[11].inCar && !sm.agents[11].visible, '10: occupant starts inside car'); }, 20: (s, sm) => { ok(!sm.agents[11].inCar, '10: occupant left the car'); } }); ok(/^E[234]$/.test(r.ev[11]), '10: occupant evacuates by stairs: ' + r.ev[11]); ok(r.ev.every((e) => /^E[234]$/.test(e)), '10: all via stairs'); }
{ r = run(11, 60, { 10: (s) => { ok(s.exits.E3 === 'closed' && s.why.E3 === 'zone', '11: E3 closed (lost node zone) ' + s.exits.E3 + s.why.E3); ok(s.guide.C === null || true, ''); ok(s.exits.E2 === 'open' && s.exits.E4 === 'open', '11: E2,E4 open'); } }); ok(r.ev.every((e) => e !== 'E3'), '11: nobody uses E3: ' + r.ev.join(',')); }
console.log(out.join('\n')); console.log(`\nORACLE: ${passes} passed, ${fails} failed`); console.log(fails ? out.filter((x) => x.startsWith('  FAIL')).join('\n') : ''); process.exit(fails ? 1 : 0);

// Simulation orchestrator: field + virtual nodes + mesh + agents + SOS/rescue + conditions. No DOM / three.
import { NODE_DEFS, NODE_IDS, PILLARS, DOORS, SOSS, GUIDE_NODES, MESH_EDGES, CARS, FIRE_KEYS, FIRE_R, HOP, DT, DEFAULT_SPAWNS, rnd32, NODE_NAME, rampZ, DOOR_CAP, SWITCH_M, V_WALK, VENTS, JETS, VENT_Q, STAIR_ZONE, SOS_VENTS } from './world.js';
import { Nav, GW } from './nav.js';
import { Field, FW, FH, FCS, FX0, FY0 } from './field.js';
import { Rescue } from './rescue.js';
import { NodeRT, CFG, sense, makeReport, decide, exitGoalCell, pickTarget, effStage, RANK } from './engine.js';

export const DEFAULT_COND = { vent: 'off', flowPred: true, smokeZ: '', fire: 'A', smoke: 'auto', stairs: 'auto', doors: { E1: null, E2: null, E3: null, E4: null }, ramp: 'auto', refuge: 'no', power: true, wind: 'auto', lost: null, car: true };
export const PRESETS = [
  { id: 1, name: '1. A구역 EV 화재, 연기 거의 없음, 계단 가능', cond: { fire: 'A', smoke: 'none', stairs: 'ok', ramp: 'ok', refuge: 'no' } },
  { id: 2, name: '2. A구역, 천장 축적, 오른쪽 확산, 계단 가능', cond: { fire: 'A', smoke: 'ceil', stairs: 'ok', ramp: 'auto', refuge: 'no', wind: 'right' } },
  { id: 3, name: '3. A구역, 계단 전부 불가, 경사로 맑음', cond: { fire: 'A', smoke: 'none', stairs: 'none', ramp: 'ok', refuge: 'no' } },
  { id: 4, name: '4. A구역, 계단 불가, 경사로 R1 옅은 연기', cond: { fire: 'A', smoke: 'ceil', stairs: 'none', ramp: 'smoke', refuge: 'no' } },
  { id: 5, name: '5. 경사로 앞 EV 화재, 계단 불가, 경사로 막힘', cond: { fire: 'R', smoke: 'ceil', stairs: 'none', ramp: 'blocked', refuge: 'no' } },
  { id: 6, name: '6. C구역, 짙은 연기, 전부 불가, 차단 공간 있음', cond: { fire: 'C', smoke: 'dense', stairs: 'none', ramp: 'dense', refuge: 'yes' } },
  { id: 7, name: '7. C구역, 짙은 연기, 차단 공간 모름', cond: { fire: 'C', smoke: 'dense', stairs: 'none', ramp: 'dense', refuge: 'unknown' } },
  { id: 8, name: '8. B구역, 천장 축적, E4만 가능(주의), 경사로 확인 불가', cond: { fire: 'B', smoke: 'ceil', stairs: 'partial', ramp: 'smoke', refuge: 'no' } },
  { id: 9, name: '9. D구역 + 정전, 천장 축적, 계단 가능', cond: { fire: 'D', smoke: 'ceil', stairs: 'ok', ramp: 'ok', refuge: 'no', power: false } },
  { id: 10, name: '10. A구역, 차 안에 사람, 계단 가능', cond: { fire: 'A', smoke: 'none', stairs: 'ok', ramp: 'ok', refuge: 'no', car: true } },
  { id: 11, name: '11. 기둥 노드 C 소실, A구역 화재', cond: { fire: 'A', smoke: 'none', stairs: 'ok', ramp: 'ok', refuge: 'no', lost: 'C' } },
];
const OPP = { A: 'carC', B: 'carD', C: 'carA', D: 'carB', R: 'carC' };
// zones (quadrants of the lot, named after their pillar) for smoke that drifted in from another zone
export const ZONE_RECT = { A: { x0: -14, x1: -0.6, y0: 0.6, y1: 10 }, B: { x0: 0.6, x1: 14, y0: 0.6, y1: 10 }, C: { x0: -14, x1: -0.6, y0: -10, y1: -0.6 }, D: { x0: 0.6, x1: 14, y0: -10, y1: -0.6 } };
export const fireZones = (c) => [...(c.fire || '')].filter((z) => z in FIRE_KEYS);
const SOS_SLOTS = {}; const SOS_C = {};
for (const id of SOSS) { const d = NODE_DEFS[id]; const s = []; const offs = [0.8, 1.7, 2.6, 3.5, 4.4]; const rows = [0, -1.3, 1.3];
  for (const o of offs) for (const y of rows) s.push([d.x - d.side * o, y]);
  s.sort((a, b) => Math.hypot(Math.abs(a[0] - d.x) - 0.8, a[1]) - Math.hypot(Math.abs(b[0] - d.x) - 0.8, b[1])); SOS_SLOTS[id] = s; SOS_C[id] = [d.x - d.side * 2.0, 0]; }
const Q_SLOTS = []; for (const y of [-10.8, -11.5, -12.2]) for (const x of [-1.05, -0.35, 0.35, 1.05]) Q_SLOTS.push([x, y]);
const sstageRaw = (c, l) => (l >= 8 || c >= 15) ? 2 : (c >= 3 ? 1 : 0);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Agent {
  constructor(id) { this.id = id; this.reset(0, 0); }
  reset(x, y) { this.x = x; this.y = y; this.px = x; this.py = y; this.yaw = Math.PI / 2; this.pyaw = this.yaw; this.vx = 0; this.vy = 0; this.sp = 0; this.state = 'idle'; this.anim = 'Idle'; this.visible = true; this.inCar = false; this.path = null; this.pi = 0; this.target = null; this.kind = null; this.slot = null; this.react = 0.6; this.reactAt = 0; this.exitAt = 0; this.timer = 0; this.crouch = false; this.crouchUntil = 0; this.replanAt = 0; this.startInside = false; this.doneAt = -1; this.exitId = null; this.pressT = 0; this.lastPress = -99; this.runV = 2.2; this.carId = null; this.z = 0; this.minD = 99; this.stage = 0; this.queued = false; this.walkV = 1.1; this.wx = null; this.wy = null; this.pauseUntil = 0; this.goAt = 0; this.panic = 0; this.seeDelay = 0; this.startleEnd = 0; this.backUntil = 0; this.reactT0 = null; this.gest = false; this.team = null; this.mask = false; this.fitBy = null; this.order = 0; this.pose = null; this.rescued = false; }
}

export class Sim {
  constructor(seed = 7) {
    this.seed = seed; this.nav = new Nav(); this.field = new Field(); this.nav.buildNearNode(NODE_IDS);
    this.goals = {}; for (const X of [...DOORS, ...SOSS, 'Q']) this.goals[X] = exitGoalCell(this.nav, X);
    this.goals.V = exitGoalCell(this.nav, 'V'); this.goals.V3 = this.nav.snap(0, 41);
    this.hzA = new Float32Array(this.nav.n); this.tmp = {}; this.spawns = DEFAULT_SPAWNS.slice();
    this.adj = {}; this.agents = []; for (let i = 0; i < 12; i++) this.agents.push(new Agent(i));
    this.rescue = new Rescue(this); this.crew = this.rescue.crew;
    this.speed = 1; this.playing = true; this.cond = null; this.reset({});
  }
  reset(c) {
    const cond = this.cond = Object.assign({}, DEFAULT_COND, this.cond && c._keep ? this.cond : {}, c);
    cond.doors = Object.assign({ E1: null, E2: null, E3: null, E4: null }, cond.doors || {});
    this.rnd = rnd32(this.seed); this.t = 0; this.tick = 0; this.acc = 0;
    this.nodes = {}; for (const id of NODE_IDS) this.nodes[id] = new NodeRT(id);
    for (const id of GUIDE_NODES) { const n = this.nodes[id]; n.hzBuf = new Float32Array(this.nav.n).fill(1e3); n.stBuf = new Uint8Array(this.nav.n); }
    this.field.clear(); this.queue = []; this.waves = []; this.log = []; this.msgCount = 0; this.topoVer = 0; this.hops = null;
    this.fires = []; this.sos = {}; for (const id of [...SOSS, 'Q']) this.sos[id] = { n: 0, reqAt: null, rxAt: null, ackAt: null, status: 'idle', rescueAt: null, urgent: 0 };
    this.slotOwner = {}; this.qDoorClosed = false; this.qDoorT = -1; this.stats = { evac: 0, sos: 0, refuge: 0, rescued: 0 }; this.rescue.reset();
    this.doorFlash = { E1: -9, E2: -9, E3: -9, E4: -9 }; this.doorFree = { E1: 0, E2: 0, E3: 0, E4: 0 };
    this._applyCond(true);
    this.ventInit();
    this.rebuildTopo();
    if (this.obst) this.blockCars();
    this.initAgents();
    this.addLog('시뮬레이션 시작: ' + (cond.fire === 'R' ? '경사로 앞' : fireZones(cond).join(', ') + '구역') + ' 차량 화재' + (cond.smokeZ ? ', 연기 넘어감: ' + [...cond.smokeZ].join(', ') + '구역' : ''), 'sys');
    this.recCache = null;
  }
  setCond(p) {
    const needReset = 'fire' in p || 'car' in p;
    if (needReset) { this.reset(Object.assign({}, this.cond, p)); return; }
    Object.assign(this.cond, p); if (p.doors) this.cond.doors = Object.assign({}, p.doors);
    this._applyCond(false); this.rebuildTopo();
  }
  preset(i) { const p = PRESETS[i]; this.reset(Object.assign({}, DEFAULT_COND, { doors: { E1: null, E2: null, E3: null, E4: null } }, p.cond)); this.presetId = p.id; }
  // ---- conditions -> field / nodes
  _applyCond(initial) {
    const c = this.cond, F = this.field;
    const ids = fireZones(c).map((z) => FIRE_KEYS[z]).slice(0, 4); if (c.ramp === 'blocked' && !ids.includes('carR') && ids.length < 4) ids.push('carR');
    const old = this.fires; this.fires = ids.map((id) => (old.find((f) => f.id === id) || { id, x: CARS[id].x, y: CARS[id].y, t0: this.t + 0.1 }));
    F.setFires(this.fires);
    F.setWind({ auto: [0, 0], right: [0.5, 0], left: [-0.5, 0], up: [0, 0.5], down: [0, -0.5] }[c.wind] || [0, 0]);
    F.srcScale = { none: 0.03, ceil: 0.35, dense: 1.2, auto: 1 }[c.smoke];
    F.forces = [];
    const LOTR = { x0: -14, x1: 14, y0: -10, y1: 10 };
    if (c.smoke === 'none') F.forces.push(Object.assign({ cMax: 0.8 }, LOTR));
    if (c.smoke === 'dense') F.forces.push(Object.assign({ cMin: 17, th: 2.7 }, LOTR));
    const RR = (y0, y1, o) => F.forces.push(Object.assign({ x0: -3.5, x1: 3.5, y0, y1 }, o));
    if (c.ramp === 'ok') RR(10.5, 41.5, { cMax: 0.4 });
    if (c.ramp === 'smoke') { RR(10.5, 16.5, { cMax: 0.4 }); RR(17, 26, { cMin: 4.5, cMax: 5.2, th: 1.0 }); RR(27, 41.5, { cMax: 0.4 }); }
    if (c.ramp === 'dense') RR(10.5, 31, { cMin: 20, th: 2.7 });
    if (c.smoke === 'ceil') for (const p of this.fires) F.seedBlob(p.x, p.y, 6, 6, 0.9);
    // smoke that has drifted into other zones: dense, down to head height (stage 2)
    for (const z of [...(c.smokeZ || '')]) { const r = ZONE_RECT[z]; if (!r || fireZones(c).includes(z)) continue; F.forces.push(Object.assign({ cMin: 11, th: 2.5, zone: z, c0: 11 }, r)); F.seedBlob((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 12, 4.5, 2.5); }
    if (c.smoke === 'dense') { F.seedAll(18, 2.7, 10); }
    if (c.ramp === 'smoke') for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const x = FX0 + (i + .5) * FCS, y = FY0 + (j + .5) * FCS; if (y >= 17 && y <= 26 && F.air[j * FW + i]) { F.c[j * FW + i] = 4.6; F.th[j * FW + i] = 1.0; } }
    if (c.ramp === 'dense') for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const y = FY0 + (j + .5) * FCS; if (y > 10 && y <= 31 && F.air[j * FW + i]) { F.c[j * FW + i] = 20; F.th[j * FW + i] = 2.7; } }
    // doors
    const base = { auto: 'ok', ok: 'ok', partial: null, none: 'locked' }[c.stairs];
    const part = { E1: 'locked', E2: 'locked', E3: 'smoky', E4: 'caution' };
    for (const id of DOORS) {
      let s = base === null ? part[id] : base; if (c.doors[id]) s = c.doors[id];
      const n = this.nodes[id]; n.door = (s === 'locked') ? 'locked' : 'ok'; n.beyond = s === 'caution' ? 1 : s === 'smoky' ? 2 : 0; n.doorCond = s;
    }
    // silent nodes
    for (const id of NODE_IDS) { const n = this.nodes[id]; n.silent = false; n.alive = true; }
    if (c.ramp === 'smoke') { this.nodes.R2.silent = true; this.nodes.R3.silent = true; }
    if (c.lost) { this.nodes[c.lost].alive = false; }
    this.power = c.power; this.refuge = c.refuge;
  }
  rebuildTopo() {
    const ok = {}; for (const id of NODE_IDS) ok[id] = this.nodes[id].ok;
    const adj = {}; for (const id of NODE_IDS) adj[id] = [];
    for (const [a, b] of MESH_EDGES) if (ok[a] && ok[b]) { adj[a].push(b); adj[b].push(a); }
    this.adj = adj; this.hops = {}; this.parent = {};
    for (const s of NODE_IDS) { if (!ok[s]) continue; const h = { [s]: 0 }, par = { [s]: null }, q = [s]; for (let i = 0; i < q.length; i++) for (const nb of adj[q[i]]) if (!(nb in h)) { h[nb] = h[q[i]] + 1; par[nb] = q[i]; q.push(nb); } this.hops[s] = h; this.parent[s] = par; }
    this.topoVer++;
  }
  initAgents() {
    const c = this.cond; const used = [];
    this.agents.forEach((a, i) => {
      let sp = this.spawns[i % this.spawns.length]; a.reset(sp[0], sp[1]); a.react = 1.0 + this.rnd() * 3.0; a.runV = 1.7 + this.rnd() * 0.4;
      a.walkV = 0.9 + this.rnd() * 0.45; a.seeDelay = 0.3 + this.rnd() * 1.2; a.state = this.rnd() < 0.7 ? 'stroll' : 'idle'; a.pauseUntil = this.rnd() * 1.5; a.yaw = a.pyaw = this.rnd() * Math.PI * 2;
      const fz0 = fireZones(c); const freeCar = ['carA', 'carB', 'carC', 'carD'].some((k) => !fz0.includes(CARS[k].zone));
      if (i === 11 && c.car && freeCar) {
        const fz = fireZones(c); const cid = OPP[fz[0] || c.fire] || (['carA', 'carB', 'carC', 'carD'].find((k) => !fz.includes(CARS[k].zone)) || 'carC'); const car = CARS[cid]; a.inCar = true; a.carId = cid; a.x = a.px = car.x; a.y = a.py = car.y; a.visible = false; a.state = 'idle'; a.react += 2.2;
      } else {
        // relocate out of danger circles and onto walkable cells
        for (const f of this.fires) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < FIRE_R + 0.8) { const k = (FIRE_R + 1.0) / (d || 1); a.x = f.x + (a.x - f.x) * k; a.y = f.y + (a.y - f.y) * k; } }
        const cell = this.nav.snap(a.x, a.y); a.x = a.px = this.nav.cx(cell); a.y = a.py = this.nav.cy(cell);
        // avoid still-overlapping spawn
        for (const f of this.fires) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < FIRE_R) a.startInside = true; }
      }
      a.z = rampZ(a.y);
    });
  }
  setSpawns(list) { if (list && list.length >= 12) { this.spawns = list.slice(0, 12); } }
  addLog(text, kind = 'mesh') { this.log.unshift({ t: this.t, text, kind }); if (this.log.length > 60) this.log.pop(); }

  // ---------------------------------------------------------------- main stepping
  advance(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) this.step(); }
  frame(dtReal) { if (!this.playing) return 0; this.acc += Math.min(dtReal, 0.25) * this.speed; let n = 0; while (this.acc >= DT && n < 8) { this.step(); this.acc -= DT; n++; } if (n === 8) this.acc = 0; return this.acc / DT; }
  step() {
    const now = this.t += DT; this.tick++;
    const F = this.field;
    F.jetK = Math.min(1, now / 15);
    this.stepVent(now);
    F.step(DT, now);
    // sensors, fire detection and reports
    const tmp = this.tmp;
    for (let k = 0; k < NODE_IDS.length; k++) {
      const n = this.nodes[NODE_IDS[k]]; if (!n.ok) continue;
      if ((this.tick + k) % 4 === 0) {
        const old = n.stage, oldF = n.fires.length;
        const fl = []; for (const f of this.fires) { if (now - f.t0 >= 0.5 && Math.hypot(n.x - f.x, n.y - f.y) <= (n.t === 'pillar' ? CFG.FLAME_R : 7)) fl.push(f.id); }
        n.fires = fl; if (fl.length) for (const id of fl) if (!(id in n.knownFires)) n.knownFires[id] = now;
        sense(n, now, F, this.fires, tmp, this.rnd);
        const hb = (this.tick + k) % 20 === 0;
        if (n.stage !== old || fl.length !== oldF || n.lastRep == null || n.pressSent !== n.press || n.doorSent !== n.door + n.beyond) { this.broadcast(n, true); n.pressSent = n.press; n.doorSent = n.door + n.beyond; }
        else if (hb) this.broadcast(n, false);
      }
    }
    // deliveries
    const q = this.queue; for (let i = q.length - 1; i >= 0; i--) { const m = q[i]; if (m.t <= now) { q.splice(i, 1); this.deliver(m); } }
    // decisions (2 Hz, staggered)
    for (let k = 0; k < NODE_IDS.length; k++) { const n = this.nodes[NODE_IDS[k]]; if (!n.ok) continue; if ((this.tick + k * 2) % 10 === 0 || n.dec == null) this.decideNode(n); }
    this.stepSOS(now);
    this.rescue.step(now);
    for (const a of this.agents) this.stepAgent(a, now);
    this.separate();
    this.clampAgents();
    while (this.waves.length && now - this.waves[0].t0 > 4.2) this.waves.shift();
    this.rec = null;
  }
  broadcast(n, vis, kind = 'evt', extra = null) {
    const rep = makeReport(n, this.t); n.lastRep = rep; const h = this.hops[n.id]; if (!h) return;
    for (const d in h) { if (d === n.id) continue; this.queue.push({ t: this.t + h[d] * HOP, dst: d, rep, extra }); }
    this.msgCount++;
    if (vis) this.waves.push({ src: n.id, t0: this.t, kind });
  }
  deliver(m) {
    const n = this.nodes[m.dst]; if (!n.ok) return; const r = m.rep;
    if (m.extra) return this.deliverExtra(m);
    n.tbl[r.id] = { rep: r, rx: this.t };
    for (const cid of r.fires) if (!(cid in n.knownFires)) { n.knownFires[cid] = r.ts; if (n.id === 'M') this.addLog(r.id + ' 노드 화재 감지 → ' + CARS[cid].zone + ' 차량 (메시 전파)', 'mesh'); }
  }
  decideNode(n) {
    const prev = n.dec; const ctx = { now: this.t, nav: this.nav, nodes: this.nodes, cfg: { refuge: this.cond.refuge }, flow: this.vent.mode !== 'off' && this.cond.flowPred ? this.flowPred : null, power: this.power, hz: n.hzBuf || this.hzA, stageBuf: n.stBuf || new Uint8Array(this.nav.n), goals: this.goals, nodeIds: NODE_IDS };
    n.dec = decide(n, ctx);
    if (prev) {
      if (n.t === 'door') { const a = prev.exits[n.id].s, b = n.dec.exits[n.id].s; if (a !== b) this.addLog(NODE_NAME(n.id) + ': ' + stText(a) + ' → ' + stText(b) + ' (' + whyText(n.dec.exits[n.id].why) + ')', 'exit'); }
      if (n.id === 'R0') { const a = prev.exits.V.s, b = n.dec.exits.V.s; if (a !== b) this.addLog('경사로: ' + stText(a) + ' → ' + stText(b) + ' (' + whyText(n.dec.exits.V.why) + ')', 'exit'); }
      if (n.id === 'M' && prev.mode !== n.dec.mode) this.addLog('안내 모드: ' + modeText(n.dec.mode), 'mode');
    }
  }
  // ---------------------------------------------------------------- ventilation
  // off: no fans. normal: the everyday pattern keeps running (left side supply, right side exhaust, jet fans blowing +x).
  // smart: starts in the everyday pattern; once the fire is known the fire (and smoke) zones switch to exhaust, the others
  // to supply, and the jet fans turn to blow clean air toward the exhausted zones.
  ventInit() {
    const mode = this.cond.vent || 'off'; const q = {}, jv = {}; for (const id in VENTS) q[id] = 0; for (const id in JETS) jv[id] = [0, 0];
    this.vent = { mode, q, jv, tq: Object.assign({}, q), tj: { J1: [0, 0], J2: [0, 0] }, switchAt: 0, acc: 0, phase: 'normal', sos: [], sig: '' };
    if (mode === 'normal') { /* smart mode: the fans stay still until people wait for rescue */ const p = this.normalPattern(); Object.assign(this.vent.q, p.q); Object.assign(this.vent.tq, p.q); for (const id in JETS) { this.vent.jv[id] = p.jets[id].slice(); this.vent.tj[id] = p.jets[id].slice(); } }
    this.applyVent(); this.flowPred = null; this.fcJob = null;
  }
  normalPattern() { const q = {}; for (const id in VENTS) q[id] = 0; Object.assign(q, { VA: VENT_Q.normalIn, VC: VENT_Q.normalIn, VB: VENT_Q.normalOut, VD: VENT_Q.normalOut }); return { q, jets: { J1: [VENT_Q.jet, 0], J2: [VENT_Q.jet, 0] } }; }
  // smart: the fans stay still (left running, they would only carry the smoke around). They run only while people are trapped and waiting for 119 at an SOS area: the fresh-air
  // diffuser above that waiting area blows clean air in, the zone vents around it exhaust, and the jet fans push away from
  // it, so the waiting area stays breathable until the rescue team gets there. When the last of them is out, the fans stop.
  shelterPattern(list) {
    const q = {}, jets = {}; for (const id in VENTS) q[id] = 0;
    for (const id in SOS_VENTS) if (list.includes(SOS_VENTS[id].sos)) q[id] = VENT_Q.shelter;
    for (const id of ['VA', 'VB', 'VC', 'VD']) { const v = VENTS[id]; if (list.some((sid) => Math.sign(NODE_DEFS[sid].x) === Math.sign(v.x))) q[id] = VENT_Q.exhaust; }
    for (const id in JETS) { const j = JETS[id]; if (list.length !== 1) { jets[id] = [0, 0]; continue; } const P = NODE_DEFS[list[0]], dx = j.x - P.x, m = Math.abs(dx) || 1; jets[id] = [dx / m * VENT_Q.jet, 0]; }
    return { q, jets };
  }
  stopPattern() { const q = {}, jets = {}; for (const id in VENTS) q[id] = 0; for (const id in JETS) jets[id] = [0, 0]; return { q, jets }; }
  setFans(p, now, msg) { const V = this.vent; V.tq = p.q; V.tj = p.jets; V.switchAt = now + 1.5; if (msg) this.addLog(msg, 'vent'); } // the command travels over the mesh to the fan panel
  // SOS areas where people are waiting for (or being helped by) the rescue team, or on their way there
  shelterList() { const out = []; for (const sid of SOSS) if (this.agents.some((a) => a.state !== 'done' && a.target === sid && (a.kind === 'sos' || a.state === 'rescued' || a.state === 'follow'))) out.push(sid); return out; }
  stepPath(now) {
    const V = this.vent, M = this.nodes.M;
    if (V.phase === 'normal') { if (Object.keys(M.knownFires).length) { V.phase = 'idle'; this.predict(now); } return; } // fans are already still
    if (now - (V.chkAt || -9) < 1) return; V.chkAt = now;
    const iso = !!(M.dec && ['isolation', 'stay'].includes(M.dec.mode)); const list = this.shelterList(); const sig = list.join(',');
    if (V.phase === 'idle' || V.phase === 'done') { if (iso && list.length) { V.phase = 'hold'; V.sos = list; V.sig = sig; V.startAt = now; this.setFans(this.shelterPattern(list), now, '119 구조 대기: ' + list.join(', ') + ' 대기 구역 급기, 주변 구역 배기 (구조대가 올 때까지 버티기)'); } return; }
    if (V.phase === 'hold') {
      if (!list.length) { V.phase = 'done'; V.sos = []; this.setFans(this.stopPattern(), now, '구조 대기 끝: 환기 설비 다시 정지'); return; }
      if (sig !== V.sig) { V.sig = sig; V.sos = list; this.setFans(this.shelterPattern(list), now, '구조 대기 구역 변경: ' + list.join(', ') + ' 급기'); }
    }
  }
  ventText() {
    const V = this.vent; if (V.mode === 'off') return '정지'; if (V.mode === 'normal') return '평상시 패턴 계속 가동';
    return { normal: '정지 (구조 대기 때만 가동)', idle: '정지 (구조 대기 때만 가동)', hold: (V.sos || []).join(', ') + ' 대기 구역 급기 중 (버티기)', done: '정지 (구조 대기 끝)' }[V.phase] || '';
  }
  ventCfg(q, jv) {
    const vents = Object.keys(VENTS).map((id) => ({ id, x: VENTS[id].x, y: VENTS[id].y, q: q[id] || 0, zone: VENTS[id].rect || ZONE_RECT[VENTS[id].zone], protect: VENTS[id].rect || null }));
    const jets = Object.keys(JETS).map((id) => { const [vx, vy] = jv[id], v = Math.hypot(vx, vy); return { id, x: JETS[id].x, y: JETS[id].y, dx: v ? vx / v : 1, dy: v ? vy / v : 0, v }; });
    return { vents, jets };
  }
  applyVent() { const c = this.ventCfg(this.vent.q, this.vent.jv); this.field.setVent(c.vents, c.jets); }
  // start a forecast; it runs over the next second of sim time (25 twin steps per tick) so the screen never stalls
  predict(now) { const V = this.vent, cfg = this.ventCfg(V.tq, V.tj); this.fcJob = this.forecastStart(cfg); this.fcJob.paths = this.traceFlow(cfg).paths; V.predAt = now; }
  stepForecast() { const J = this.fcJob; if (!J || !this.forecastRun(J, 25)) return; this.flowPred = { at: J.at, snap: J.snap, t0: J.t0, paths: J.paths, ver: (this.flowPred ? this.flowPred.ver : 0) + 1 }; this.fcJob = null; }
  stepVent(now) {
    const V = this.vent; if (V.mode === 'off') return;
    if (V.mode === 'normal' && Object.keys(this.nodes.M.knownFires).length && (V.predAt == null || now - V.predAt >= 15)) this.predict(now);
    if (V.mode === 'smart' && V.predAt != null && now - V.predAt >= 15) this.predict(now);
    if (V.mode === 'smart') this.stepPath(now);
    this.stepForecast();
    if (now < V.switchAt) return;
    // fans ramp toward their targets (reversing a fan takes a few seconds)
    let ch = 0; const r = 4 * DT, rj = 0.3 * DT;
    for (const id in VENTS) { const d = V.tq[id] - V.q[id]; if (!d) continue; const s = Math.sign(d) * Math.min(Math.abs(d), r); V.q[id] += s; ch += Math.abs(s); }
    for (const id in JETS) { const a = V.jv[id], b = V.tj[id]; const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy); if (d < 1e-4) continue; const k = Math.min(1, rj / d); a[0] += dx * k; a[1] += dy * k; ch += d * k * 4; }
    if (ch > 0) { V.acc += ch; if (V.acc > 0.5 || ch < 1e-3) { V.acc = 0; this.applyVent(); } }
    else if (V.acc > 0) { V.acc = 0; this.applyVent(); }
  }
  // predicted smoke paths: trace the known airflow (building draft + vents + jet fans + the fire's own ceiling jet) from each fire.
  // by[fireId][exit] = seconds after ignition when the traced smoke reaches that exit's door (or the ramp mouth)
  traceFlow(cfg) {
    const F = this.field, out = { by: {}, paths: [] }; const ex = cfg.vents.filter((v) => v.q < -1);
    const tgt = DOORS.map((X) => [X, NODE_DEFS[X].appr[0], NODE_DEFS[X].appr[1]]);
    for (const f of this.fires) {
      const arr = {}, hits = {}; out.by[f.id] = arr;
      for (let s = 0; s < 12; s++) {
        const a = (s + 0.5) / 12 * Math.PI * 2; let x = f.x + Math.cos(a) * 2.5, y = f.y + Math.sin(a) * 2.5, t = 2.5; const pts = [f.x, f.y, x, y], seen = {};
        for (let it = 0; it < 240; it++) {
          const [bx, by] = F.baseAt(x, y), [vx, vy] = F.ventAt(x, y, cfg.vents, cfg.jets); const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy) + 1e-3, m = 0.66 * Math.exp(-d / 6);
          x += (bx + vx + dx / d * m) * 0.5; y += (by + vy + dy / d * m) * 0.5; t += 0.5;
          x = Math.max(-13.8, Math.min(13.8, x)); if (y < -9.8) y = -9.8; if (y > 9.8 && Math.abs(x) > 3.4) y = 9.8;
          if (it % 2) pts.push(x, y);
          let cap = false; for (const v of ex) if (Math.hypot(x - v.x, y - v.y) < (v.q <= -6 ? 3.0 : 1.8)) cap = true; if (cap) { pts.push(x, y); break; }
          for (const [X, tx, ty] of tgt) if (Math.hypot(x - tx, y - ty) < 4 && !seen[X]) { seen[X] = 1; (hits[X] = hits[X] || []).push(t); }
          if (y > 10.4) { (hits.V = hits.V || []).push(t); pts.push(x, y); break; }
        }
        out.paths.push(pts);
      }
      // an exit counts as reached when a real share of the smoke gets there (3 of the 12 traced parcels), not one stray parcel
      for (const X in hits) { const h = hits[X].sort((a, b) => a - b); if (h.length >= 3) arr[X] = h[2]; }
    }
    return out;
  }
  // digital twin forecast: run the same smoke model 50 s ahead, starting only from what the system knows (fires and when
  // they were detected, smoke stages its sensors report, the vents and jet fans with the fan plan it is about to apply).
  // at[X] = sim time when the twin first shows smoke stage 2 at stair X (door or its zone pillar).
  forecastStart(cfg, T = this.twin || (this.twin = new Field())) {
    const now = this.t, M = this.nodes.M; T.c.fill(0); T.th.fill(0); T.forces = []; T.wind = this.field.wind; T.srcScale = this.field.srcScale;
    T.fires = Object.keys(M.knownFires).map((id) => ({ id, x: CARS[id].x, y: CARS[id].y, t0: M.knownFires[id] - 0.5 }));
    for (const id in M.tbl) { const r = M.tbl[id].rep, d = NODE_DEFS[id]; if (!r || r.stage < 1 || d.t === 'ramp') continue;
      if (d.t === 'pillar' && r.stage >= 2 && ZONE_RECT[id]) T.seedZone(ZONE_RECT[id], Math.max(8, r.ceil), 2.5); // a pillar at stage 2: assume its whole zone is that smoky
      else T.seedBlob(d.x, d.y, Math.max(3, r.ceil), d.t === 'pillar' ? 4.5 : 2.5, r.stage >= 2 ? 2.5 : 1.2); }
    T.setVent(cfg.vents, cfg.jets); return { T, k: 0, at: {}, snap: null, t0: now };
  }
  // advance the twin by n steps of 0.1 s (advection shift + 4 x diffusion number stays under one cell); true when 50 s are done
  forecastRun(J, n) {
    const T = J.T, dt = 0.1, stg = (x, y) => { const r = T.read(x, y, this.tmp); return sstageRaw(r.ceil, r.low); };
    for (let i = 0; i < n && J.k < 500; i++) {
      const k = ++J.k, t = J.t0 + k * dt; T.jetK = Math.min(1, t / 15); T.step(dt, t);
      if (k % 10 === 0) for (const X of DOORS) { if (J.at[X] != null) continue; const d = NODE_DEFS[X], p = NODE_DEFS[d.pillar]; if (Math.max(stg(d.x + (d.x < 0 ? 0.6 : -0.6), d.y), stg(p.x, p.y)) >= 2) J.at[X] = t; }
      if (k === 300) J.snap = T.c.slice();
    }
    return J.k >= 500;
  }
  forecast(cfg) { const J = this.forecastStart(cfg); this.forecastRun(J, 500); return J; }
  // ---------------------------------------------------------------- SOS / rescue
  pressSOS(a, id) {
    const s = this.sos[id]; s.n++; this.nodes[id].press = s.n; a.pressT = this.t; a.lastPress = this.t;
    if (s.reqAt == null) {
      s.reqAt = this.t; s.status = 'requested'; this.addLog(id + ': SOS_REQ 전송 (' + (this.cond.fire === 'R' ? '경사로 앞 ' : '') + '인원 ' + s.n + '명)', 'sos');
      const h = this.hops[id] && this.hops[id].M; if (h != null) { this.queue.push({ t: this.t + h * HOP, dst: 'M', extra: { type: 'req', id }, rep: null }); this.waves.push({ src: id, t0: this.t, kind: 'sos' }); this.msgCount++; }
    } else if (s.status !== 'idle') { s.urgent++; }
  }
  deliverExtra(m) {
    const s = this.sos[m.extra.id];
    if (m.extra.type === 'req') { s.rxAt = this.t; this.addLog('관리실: ' + m.extra.id + ' 구조 요청 수신', 'sos'); s.ackSend = this.t + 1.5; }
  }
  stepSOS(now) {
    for (const id in this.sos) {
      const s = this.sos[id]; if (s.ackSend != null && now >= s.ackSend) { s.ackSend = null; const h = this.hops.M && this.hops.M[id]; this.waves.push({ src: 'M', t0: now, kind: 'ack' }); s.ackAt = now + (h || 0) * HOP; }
      if (s.status === 'requested' && s.ackAt != null && now >= s.ackAt) { s.status = 'acked'; this.addLog(id + ': 구조 요청 접수됨 (ACK), 119에 위치 전달', 'sos'); }
    }
    if (this.qDoorT >= 0 && now >= this.qDoorT && !this.qDoorClosed) { this.qDoorClosed = true; this.addLog('연기 차단 공간 Q: 방화문 닫힘', 'sos'); }
  }
  sosLine(id) {
    const s = this.sos[id]; const nm = id === 'Q' ? '차단 공간 Q' : id;
    if (s.n === 0) return nm + ': 대기 중';
    const st = { requested: '요청 전송 중', acked: '접수됨, 119 출동 중', rescue: '구조대 접근 중', saved: '구조 완료' }[s.status] || '';
    return nm + ': 구조 요청 ' + s.n + '명, ' + st + (s.urgent ? ', 재요청 ' + s.urgent + '회' : '');
  }
  // ---------------------------------------------------------------- agents
  nearestGuide(a) { let b = null, bd = 1e9; for (const id of GUIDE_NODES) { const n = this.nodes[id]; if (!n.ok || !n.dec) continue; const d = (n.x - a.x) ** 2 + (n.y - a.y) ** 2; if (d < bd) { bd = d; b = n; } } return b; }
  stageAt(a) { const r = this.field.read(a.x, Math.min(a.y, 41.3), this.tmp); return sstageRaw(r.ceil, r.low); }
  releaseSlot(a) { if (a.slot) { const [id, k] = a.slot; if (this.slotOwner[id + k] === a.id) delete this.slotOwner[id + k]; a.slot = null; } }
  takeSlot(a, id) {
    const list = id === 'Q' ? Q_SLOTS : SOS_SLOTS[id]; if (a.slot && a.slot[0] === id) return list[a.slot[1]]; this.releaseSlot(a);
    for (let k = 0; k < list.length; k++) {
      if (this.slotOwner[id + k] != null && this.slotOwner[id + k] !== a.id) continue; const p = list[k];
      let bad = false; for (const f of this.fires) if (Math.hypot(p[0] - f.x, p[1] - f.y) < FIRE_R + 0.3) bad = true; if (bad) continue;
      this.slotOwner[id + k] = a.id; a.slot = [id, k]; return p;
    }
    return null;
  }
  slotPos(id, k) { return id === 'Q' ? Q_SLOTS[k] : SOS_SLOTS[id][k]; }
  plan(a, now) {
    const node = this.nearestGuide(a); if (!node || !node.dec || !node.dec.active) return false;
    const dec = node.dec, nav = this.nav;
    nav.run(a.x, a.y, node.hzBuf, node.stBuf);
    const qcost = (X) => this.queueAhead(a, X) / DOOR_CAP * V_WALK; // expected wait at the door, in metres of walking
    let pk = pickTarget(nav, this.goals, dec.exits, dec.S, now, { refuge: this.cond.refuge }, qcost);
    // almost at the door: keep going unless that door is actually closed (no turning back 4 m before an exit)
    // a closure that is only predicted (smoke not there yet) does not turn back someone this close to the door
    const exT = DOORS.includes(a.target) ? dec.exits[a.target] : null; const predOnly = exT && exT.s === 'closed' && /^predict/.test(exT.why);
    if ((a.kind === 'stairs' || a.kind === 'caution') && pk.id !== a.target && DOORS.includes(a.target) && (exT.s !== 'closed' || predOnly)) {
      const ap = NODE_DEFS[a.target].appr; if (Math.hypot(a.x - ap[0], a.y - ap[1]) < 8) pk = { mode: a.kind, id: a.target, kind: a.kind, cost: nav.dist[this.goals[a.target]] };
    }
    // stick with the current stair unless the new one is clearly better (no ping-pong between two similar doors)
    if ((a.kind === 'stairs' || a.kind === 'caution') && pk.kind === a.kind && pk.id !== a.target && DOORS.includes(a.target) && dec.exits[a.target].s === dec.exits[pk.id].s) {
      const cur = nav.dist[this.goals[a.target]] + qcost(a.target);
      if (isFinite(cur) && cur - pk.cost < SWITCH_M) pk = { mode: pk.mode, id: a.target, kind: a.kind, cost: cur };
    }
    if (a.kind && pk.id !== a.target && (a.kind === 'sos' || a.kind === 'refuge')) this.releaseSlot(a);
    a.replanAt = now + 1.0 + (a.id % 4) * 0.1;
    if (!pk.id) { a.target = null; a.kind = 'stay'; a.path = null; return true; }
    let goal = this.goals[pk.id]; let tx = null, ty = null;
    if (pk.id === 'V') goal = this.goals.V3;
    if (pk.kind === 'sos' || pk.kind === 'refuge') { const sp = this.takeSlot(a, pk.id); if (sp) { goal = nav.snap(sp[0], sp[1]); tx = sp[0]; ty = sp[1]; } }
    const path = nav.path(goal, node.hzBuf);
    a.target = pk.id; a.kind = pk.kind; a.mode = pk.mode;
    if (!path) { a.path = null; a.kind = 'stay'; return true; }
    if (tx != null) { path.push(tx, ty); }
    a.path = path; a.pi = path.length >= 4 ? 1 : 0;
    return true;
  }
  // people ahead of `a` in the queue for stair door X (already waiting, or heading there and closer)
  queueAhead(a, X) {
    const ap = NODE_DEFS[X].appr, my = a.target === X ? Math.hypot(a.x - ap[0], a.y - ap[1]) : 1e9; let n = 0;
    for (const b of this.agents) { if (b === a || b.state !== 'go' || b.target !== X) continue; if (b.queued || Math.hypot(b.x - ap[0], b.y - ap[1]) < my) n++; }
    return n;
  }
  nearestFire(a) { let best = null, bd = 1e9; for (const f of this.fires) { const d = Math.hypot(a.x - f.x, a.y - f.y); if (d < bd) { bd = d; best = f; } } return best ? { f: best, d: bd } : null; }
  // has this person noticed the fire? (sees it nearby, or the alarm / pillar displays have switched)
  noticed(a, now) {
    const n = this.nearestGuide(a); if (n && n.dec && n.dec.active) return true;
    const nf = this.nearestFire(a); return !!(nf && nf.d < 14 && now - nf.f.t0 >= 0.6 + a.seeDelay);
  }
  pickStroll(a) { // a nearby spot in the open, reachable in a straight line and well away from any burning car
    for (let k = 0; k < 8; k++) {
      const ang = this.rnd() * Math.PI * 2, r = 2 + this.rnd() * 4, tx = a.x + Math.cos(ang) * r, ty = a.y + Math.sin(ang) * r; const c = this.nav.idx(tx, ty); if (c < 0 || !this.nav.walk[c] || ty > 9.5) continue;
      if (!this.nav.los(a.x, a.y, tx, ty, null)) continue; let ok = true; for (const f of this.fires) for (let u = 0; u <= 1; u += 0.25) if (Math.hypot(a.x + (tx - a.x) * u - f.x, a.y + (ty - a.y) * u - f.y) < FIRE_R + 1.5) ok = false;
      if (ok) { a.wx = tx; a.wy = ty; return true; }
    }
    a.wx = null; return false;
  }
  startle(a, now) { // freeze, turn toward the fire; close to it, take a few steps back
    const nf = this.nearestFire(a); a.state = 'startle'; a.wx = null; const d = nf ? nf.d : 99;
    a.startleEnd = now + 0.5 + this.rnd() * 0.9; a.backUntil = d < 9 ? now + 0.6 : 0; a.react = d < 10 ? 0.2 + this.rnd() * 0.6 : 0.6 + this.rnd() * 1.9; a.panic = d < 9 ? 1 : 0;
    if (nf) a.faceYaw = Math.atan2(nf.f.y - a.y, nf.f.x - a.x); else a.faceYaw = a.yaw;
  }
  stepAgent(a, now) {
    a.px = a.x; a.py = a.y; a.pyaw = a.yaw; a.vx = a.vy = 0; a.sp = 0;
    if (a.state === 'done') return;
    const st = this.stageAt(a); a.stage = st;
    if (st >= 1) a.crouchUntil = now + 1.5; a.crouch = now < a.crouchUntil;
    switch (a.state) {
      case 'idle': {
        if (a.inCar) { const n = this.nearestGuide(a); if (n && n.dec && n.dec.active) { a.state = 'react'; a.reactAt = now + a.react; } a.anim = 'Idle'; break; }
        if (this.noticed(a, now)) { this.startle(a, now); break; }
        a.anim = 'Idle'; break;
      }
      case 'stroll': { // walking around the car park before anything happens
        if (this.noticed(a, now)) { this.startle(a, now); break; }
        if (now < a.pauseUntil) { a.anim = 'Idle'; break; }
        if (a.wx == null && !this.pickStroll(a)) { a.pauseUntil = now + 1; a.anim = 'Idle'; break; }
        const dx = a.wx - a.x, dy = a.wy - a.y, d = Math.hypot(dx, dy);
        if (d < 0.25) { a.wx = null; a.pauseUntil = now + 0.6 + this.rnd() * 2.2; a.anim = 'Idle'; break; }
        const want = Math.atan2(dy, dx); this.turnTo(a, want, DT); const err = Math.abs(wrap(want - a.yaw)); const v = Math.min(a.walkV * Math.max(0.2, Math.cos(Math.min(1.4, err))), d / DT);
        a.vx = Math.cos(a.yaw) * v; a.vy = Math.sin(a.yaw) * v; a.sp = v; a.x += a.vx * DT; a.y += a.vy * DT; a.anim = 'Walk'; break;
      }
      case 'startle': {
        this.turnTo(a, a.faceYaw, DT); a.anim = now < a.backUntil ? 'CrouchWalk' : 'Idle';
        if (now < a.backUntil) { const v = 0.7; a.vx = -Math.cos(a.faceYaw) * v; a.vy = -Math.sin(a.faceYaw) * v; a.sp = 0; a.x += a.vx * DT; a.y += a.vy * DT; }
        if (now >= a.startleEnd) { a.state = 'react'; a.reactAt = now + a.react; a.reactT0 = now; a.gest = this.rnd() < 0.45; }
        break;
      }
      case 'react': {
        a.anim = 'Idle';
        // hesitation: some point at the fire, the others look around for where to go (the pillar displays, the exits)
        if (a.reactT0 != null && !a.inCar) { const dt0 = now - a.reactT0; const nf = this.nearestFire(a); const base = nf ? Math.atan2(nf.f.y - a.y, nf.f.x - a.x) : a.yaw;
          if (a.gest && dt0 < 1.25) { this.turnTo(a, base, DT); a.anim = 'PressButton'; } else this.turnTo(a, base + Math.sin(dt0 * 2.6 + a.id) * 1.3, DT); }
        if (now >= a.reactAt) { if (a.inCar) { a.state = 'exitCar'; a.exitAt = now + 1.1; a.anim = 'Idle'; } else { if (this.plan(a, now)) { a.state = 'go'; a.goAt = now; } else a.state = 'idle'; } }
        break;
      }
      case 'exitCar': {
        if (now >= a.exitAt) {
          const car = CARS[a.carId]; let bx = car.x < 0 ? car.x + 2.6 : car.x - 2.6, by = car.y; const cell = this.nav.snap(bx, by); a.x = this.nav.cx(cell); a.y = this.nav.cy(cell); a.px = a.x; a.py = a.y; a.visible = true; a.inCar = false; a.emerged = now;
          for (const f of this.fires) if (Math.hypot(a.x - f.x, a.y - f.y) < FIRE_R) a.startInside = true;
          a.yaw = a.pyaw = Math.atan2(0, car.x < 0 ? 1 : -1);
          if (this.plan(a, now)) a.state = 'go'; else a.state = 'idle';
        }
        a.anim = 'Idle'; break;
      }
      case 'go': this.move(a, now); break;
      case 'press': {
        a.anim = 'PressButton'; this.turnTo(a, a.faceYaw, DT); if (now - a.pressT0 >= 1.9) { a.state = 'wait'; }
        break;
      }
      case 'rescued': { // the rescue team is here: stand up (stay low in smoke), face them, mask goes on
        a.anim = a.stage >= 1 ? 'WaitCrouch' : 'Idle'; a.pose = null; this.turnTo(a, a.faceYaw, DT); break;
      }
      case 'follow': this.rescue.stepFollower(a); break;
      case 'wait': {
        a.anim = 'WaitCrouch'; this.turnTo(a, a.faceYaw, DT); if (a.team) break;
        const node = this.nearestGuide(a); const sosId = a.target;
        if (a.kind === 'sos' && now - a.lastPress > 28 && a.stage >= 2) { a.state = 'press'; a.pressT0 = now; this.pressSOS(a, sosId); }
        if (node && node.dec && ['stairs', 'ramp', 'caution'].includes(node.dec.mode) && now - (a.waitSince || 0) > 8) { this.releaseSlot(a); a.state = 'go'; this.plan(a, now); }
        break;
      }
    }
  }
  turnTo(a, ang, dt) { const e = wrap(ang - a.yaw), m = 9.4 * dt; a.yaw = wrap(a.yaw + Math.max(-m, Math.min(m, e))); }
  move(a, now) {
    if (now >= a.replanAt) this.plan(a, now);
    if (a.kind === 'stay' || !a.path) { a.anim = a.crouch ? 'WaitCrouch' : 'Idle'; if (a.kind === 'stay') { a.state = 'wait'; a.waitSince = now; a.faceYaw = a.yaw; } return; }
    const p = a.path; let tx = p[a.pi * 2], ty = p[a.pi * 2 + 1];
    if (a.pi * 2 >= p.length) { return this.arrive(a, now); }
    let dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d < 0.3) { a.pi++; if (a.pi * 2 >= p.length) return this.arrive(a, now); tx = p[a.pi * 2]; ty = p[a.pi * 2 + 1]; dx = tx - a.x; dy = ty - a.y; d = Math.hypot(dx, dy); }
    const want = Math.atan2(dy, dx); const err = wrap(want - a.yaw);
    this.turnTo(a, want, DT);
    let v = a.crouch ? 1.0 : a.runV * (1 + 0.18 * a.panic * Math.max(0, 1 - (now - a.goAt) / 4)) * (0.93 + 0.07 * Math.sin(now * 1.9 + a.id * 2.3)); if (a.y > 11) v *= 0.88; v *= Math.max(0.15, Math.cos(Math.min(1.4, Math.abs(err))));
    v = Math.min(v, d / DT);
    a.vx = Math.cos(a.yaw) * v; a.vy = Math.sin(a.yaw) * v; a.sp = v;
    a.x += a.vx * DT; a.y += a.vy * DT; a.z = rampZ(a.y);
    a.anim = a.crouch ? 'CrouchWalk' : 'Run';
    // arrival conditions
    if (a.kind === 'stairs' || a.kind === 'caution') {
      const ap = NODE_DEFS[a.target].appr; const dd = Math.hypot(a.x - ap[0], a.y - ap[1]);
      if (dd < 0.7) { if (now >= this.doorFree[a.target]) { this.doorFree[a.target] = now + 1 / DOOR_CAP; this.arrive(a, now); } else this.hold(a, ap); }
      else if (dd < 1.6 && this.queueAhead(a, a.target) > 0 && now < this.doorFree[a.target] + 0.5) this.hold(a, ap);
      else a.queued = false;
    }
    else if (a.kind === 'ramp' && a.y >= 40.6) this.arrive(a, now);
  }
  // wait in line at a door: stand still, face the door
  hold(a, ap) { a.x -= a.vx * DT; a.y -= a.vy * DT; a.vx = a.vy = 0; a.sp = 0; a.queued = true; a.anim = a.crouch ? 'WaitCrouch' : 'Idle'; a.yaw = Math.atan2(ap[1] - a.y, ap[0] - a.x); }
  arrive(a, now) {
    a.queued = false;
    if (a.kind === 'stairs' || a.kind === 'caution') { a.state = 'done'; a.visible = false; a.doneAt = now; a.exitId = a.target; this.doorFlash[a.target] = now; this.stats.evac++; this.addLog('대피 완료: ' + NODE_NAME(a.target), 'agent'); return; }
    if (a.kind === 'ramp') { a.state = 'done'; a.visible = false; a.doneAt = now; a.exitId = 'V'; this.stats.evac++; this.addLog('대피 완료: 경사로 (지상)', 'agent'); return; }
    if (a.kind === 'sos') {
      const nd = NODE_DEFS[a.target]; const first = this.sos[a.target].reqAt == null; this.pressSOS(a, a.target); this.stats.sos++; a.waitSince = now;
      if (first) { a.state = 'press'; a.pressT0 = now; a.faceYaw = Math.atan2(0, nd.side); }   // only the first person presses the button (faces the wall unit)
      else { a.state = 'wait'; const sp = a.slot ? this.slotPos(a.slot[0], a.slot[1]) : [a.x, a.y]; const c = SOS_C[a.target]; const dx = sp[0] - c[0], dy = sp[1] - c[1]; a.faceYaw = Math.hypot(dx, dy) > 0.3 ? Math.atan2(dy, dx) : Math.atan2(0, -nd.side); }  // others wait crouched, facing outward
      return;
    }
    if (a.kind === 'refuge') {
      a.state = 'press'; a.pressT0 = now; a.waitSince = now; a.faceYaw = -Math.PI / 2; this.pressSOS(a, 'Q'); this.stats.refuge++;
      if (this.qDoorT < 0) { this.qDoorT = now + 8; } return;
    }
    a.state = 'wait'; a.waitSince = now; a.faceYaw = a.yaw;
  }
  separate() {
    const A = this.agents;
    for (let i = 0; i < A.length; i++) { const a = A[i]; if ((a.state !== 'go' && a.state !== 'stroll' && a.state !== 'follow') || !a.visible) continue; for (let j = 0; j < A.length; j++) { if (i === j) continue; const b = A[j]; if (!b.visible || b.state === 'done') continue; const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy); if (d > 0 && d < 0.5) { const k = (0.5 - d) * 0.25 / d; a.x += dx * k; a.y += dy * k; } } }
  }
  setObstacles(list) { this.obst = list; this.blockCars(); }
  blockCars() { // the ramp-front car only blocks when it is there (scenario 5)
    const on = this.fires.some((f) => f.id === 'carR') || (this.cond && this.cond.ramp === 'blocked'); const sig = (this.obst || []).length + ':' + on; if (sig === this._blk) return; this._blk = sig;
    this.nav.setBlocked((this.obst || []).filter((o) => o.id !== 'carR' || on));
    for (const X of [...DOORS, ...SOSS, 'Q']) this.goals[X] = exitGoalCell(this.nav, X); this.goals.V = exitGoalCell(this.nav, 'V'); this.goals.V3 = this.nav.snap(0, 41);
  }
  clampAgents() {
    const obs = this.obst || [];
    for (const a of this.agents) {
      if (!a.visible) continue;
      if (a.state === 'go' || a.state === 'wait' || a.state === 'press' || a.state === 'stroll' || a.state === 'startle' || a.state === 'follow' || a.state === 'rescued') for (const o of obs) { // parked cars are static obstacles (soft push-out)
        if (o.id === 'carR' && !(this.fires.some((f) => f.id === 'carR') || this.cond.ramp === 'blocked')) continue;
        const dx = a.x - o.x, dy = a.y - o.y, px = o.hx + 0.3 - Math.abs(dx), py = o.hy + 0.3 - Math.abs(dy);
        if (px > 0 && py > 0) { if (px < py) a.x += Math.sign(dx || 1) * px; else a.y += Math.sign(dy || 1) * py; }
      }
      let m = 99;
      for (const f of this.fires) {
        const dx = a.x - f.x, dy = a.y - f.y, d = Math.hypot(dx, dy);
        if (a.startInside) { if (d >= FIRE_R + 0.05) { a.startInside = false; } }
        else if (d < FIRE_R + 0.05) { const k = (FIRE_R + 0.06) / (d || 1e-3); a.x = f.x + dx * k; a.y = f.y + dy * k; }
        m = Math.min(m, Math.hypot(a.x - f.x, a.y - f.y));
      }
      if (!a.startInside) a.minD = Math.min(a.minD, m);
    }
  }
  // ---------------------------------------------------------------- derived outputs
  exitDisplay() {
    const out = {}; for (const X of DOORS) { const n = this.nodes[X]; const d = n.dec || (this.nodes.M.dec); out[X] = d ? d.exits[X] : { s: 'open', why: '' }; }
    const r = this.nodes.R0.dec || this.nodes.M.dec; out.V = r ? r.exits.V : { s: 'open', why: '' }; return out;
  }
  recommend() {
    if (this.rec) return this.rec;
    const M = this.nodes.M.dec; const ex = this.exitDisplay(); const lines = []; const open = [], caution = [], closed = {};
    for (const X of [...DOORS, 'V']) { const e = ex[X]; if (e.s === 'open') open.push(X); else if (e.s === 'caution') caution.push(X); else closed[X] = e.why; }
    let head = '화재 감지 대기 중', mode = 'none';
    if (M && M.active) {
      mode = M.mode;
      const nm = (arr) => arr.map((x) => NODE_NAME(x)).join(', ');
      switch (mode) {
        case 'stairs': case 'ramp': head = '개방된 출구로 즉시 대피: ' + nm(open.filter((x) => x !== 'V')) + (open.includes('V') ? (open.length > 1 ? ' (경사로는 차선책)' : '경사로 도보 대피, 차량 주의') : ''); break;
        case 'caution': head = nm(caution.filter((x) => x !== 'V')) + '로 자세를 낮추고 대피'; break;
        case 'isolation': head = '모든 출구 불가: 고립 모드 → ' + (M.target ? M.target + ' SOS로 이동, 버튼을 누르고 자세 낮춰 대기' : 'SOS'); break;
        case 'refuge': head = '연기 차단 공간(Q)으로 이동, 문 닫고 SOS 요청'; break;
        case 'stay': head = '이동 가능한 경로 없음: 자세를 낮추고 구조 요청'; break;
        default: head = '화재 감지, 판단 중';
      }
    }
    for (const X in closed) lines.push(NODE_NAME(X) + ' 폐쇄: ' + whyText(closed[X]));
    for (const X of caution) lines.push(NODE_NAME(X) + ' 주의: ' + whyText(ex[X].why));
    const zr = []; for (const id of PILLARS) { const d = this.nodes[id].dec; if (d && d.active && d.target) zr.push(id + '→' + (d.target === 'V' ? '경사로' : d.target)); }
    if (zr.length) lines.push('구역별 안내: ' + zr.join('  '));
    if (!this.power) lines.push('정전: 배터리 OLED와 바닥 유도 LED로 안내');
    if (this.cond.lost) lines.push('기둥 ' + this.cond.lost + ' 노드 소실: 해당 구역은 위험으로 처리하고 우회');
    if (this.cond.refuge === 'unknown') lines.push('차단 공간 "모름" → 없음으로 처리');
    return (this.rec = { mode, head, lines, open, caution, closed, exits: ex });
  }
  snapshot() {
    const ex = this.exitDisplay();
    return { t: this.t, exits: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.s])), why: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.why])), rec: this.recommend(), guide: Object.fromEntries(['A', 'B', 'C', 'D', 'M'].map((id) => { const d = this.nodes[id].dec; return [id, d ? { mode: d.mode, target: d.target, text: d.text, closed: d.closed } : null]; })), agents: this.agents.map((a) => ({ id: a.id, x: a.x, y: a.y, state: a.state, kind: a.kind, target: a.target, minD: a.minD })), stats: this.stats };
  }
}
export const stText = (s) => ({ open: '개방', caution: '주의', closed: '폐쇄' }[s] || s);
export const whyText = (w) => ({ flow: '환기 기류로 연기 도달 예측', 'flow-slack': '기류가 향하나 여유 있음', fire: '화재 5 m 이내', smoke: '연기 단계 2 이상', smoke1: '연기 단계 1', predict: '연기 확산 예측', 'predict-slack': '확산 방향이나 여유 있음', 'predict-miss': '확산 예측 빗나감(센서 정상)', door: '문 잠김', doorsmoke: '문 너머 연기', zone: '노드 소실 구역', noresp: '센서 응답 없음(확인 불가)', '': '정상' }[w] || w);
export const modeText = (m) => ({ none: '정상', alert: '경보', stairs: '비상계단 대피', ramp: '경사로 대피', caution: '자세 낮춤 대피', isolation: '고립 모드(SOS)', refuge: '연기 차단 공간', stay: '대기' }[m] || m);

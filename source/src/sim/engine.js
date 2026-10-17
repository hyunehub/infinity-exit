// Decision engine (Part 1): smoke stages, spread estimation, exit state machine, routing, isolation mode, texts.
import { NODE_DEFS, CARS, FIRE_R, V_WALK, DOORS, SOSS, NODE_NAME, STAIR_ZONE } from './world.js';

export const CFG = {
  STAGE: [3, 8, 15], HOLD_S1: 90, REOPEN: 30, SAFE_T: 30, COS: 0.7, STALE: 3.5,
  RAMP_PEN: 3, DEAD_R: 4.0, FLAME_R: 9,
  MISS_T: 5, REOPEN_MISS: 8,      // prediction falsified: zone still clean MISS_T s after predicted arrival -> reopen after REOPEN_MISS s
  EVID_COS: 0.85, EVID_FRAC: 0.35,
  REOPEN_PATH: 6,                 // stair the fans are clearing: reopen after 6 s of clean sensor readings
  FLOW_T: 12, FLOW_C: 40,         // airflow prediction: close if traced smoke arrives within walk + FLOW_T s, caution within walk + FLOW_C s // predict-close only if smoke was actually seen heading toward the exit (bearing within ~32 deg, >=35% of the way)
};
export const RANK = { open: 0, caution: 1, closed: 2 };
const sstage = (ceil, low, k = 1) => (low >= CFG.STAGE[1] * k || ceil >= CFG.STAGE[2] * k) ? 2 : (ceil >= CFG.STAGE[0] * k ? 1 : 0);

export class NodeRT {
  constructor(id) {
    const d = NODE_DEFS[id]; this.id = id; this.def = d; this.x = d.x; this.y = d.y; this.t = d.t;
    this.alive = true; this.silent = false; this.tbl = {}; this.knownFires = {}; this.exitFsm = {};
    this.ceil = 0; this.low = 0; this.temp = 20; this.co = 0; this.stage = 0; this.s1since = null; this.base = null; this.t1 = null; this.rise = 0; this.ring = new Float32Array(8); this.ringT = 0;
    this.door = 'ok'; this.beyond = 0; this.press = 0; this.fires = []; this.lastRep = null; this.dec = null; this.lastStageSent = -1; this.seq = 0;
    this.canRoute = ['A', 'B', 'C', 'D', 'M'].includes(id);
    this.sx = d.nrm ? d.x + d.nrm[0] * 3.3 : d.x; this.sy = d.nrm ? d.y + d.nrm[1] * 3.3 : d.y; if (id === 'M') { this.sx = 0; this.sy = 0; }
    this.ref = d.t === 'door' ? NODE_DEFS[d.pillar] : d.t === 'ramp' ? NODE_DEFS.M : d;
  }
  get ok() { return this.alive && !this.silent; }
}

export function effStage(rep, now) {
  if (!rep) return 0; let s = rep.stage; if (s === 1 && rep.s1since != null && now - rep.s1since >= CFG.HOLD_S1) s = 2; return s;
}

// sensor update from field (called each tick for alive nodes)
export function sense(n, now, field, fires, tmp, rnd) {
  field.read(n.x, Math.min(n.y, 41.3), tmp);
  const nz = 1 + (rnd() - 0.5) * 0.04;
  n.ceil = tmp.ceil * nz; n.low = tmp.low * nz; n.temp = field.temp(n.x, n.y, now, fires, tmp); n.co = n.ceil * 8;
  let s = sstage(n.ceil, n.low); if (s < n.stage) { const sd = sstage(n.ceil, n.low, 0.7); s = Math.max(s, Math.min(n.stage, sd)); }
  if (n.def.t === 'door') { const b = n.beyond; if (b > s) s = Math.min(2, b); }
  if (s >= 2 && (n.temp >= 60 || n.co >= 200)) s = 3;
  n.stage = s;
  if (s >= 1) { if (n.s1since == null) n.s1since = now; } else n.s1since = null;
  // rise-rate ring (1 Hz)
  if (now - n.ringT >= 1) { n.ringT = now; n.ring.copyWithin(0, 1); n.ring[7] = n.ceil; const older = n.ring[3]; n.rise = Math.max(0, (n.ceil - older) / 4); }
  const kf = Object.keys(n.knownFires);
  if (kf.length && n.base == null) { n.base = n.ceil; n.pre = n.stage >= 1; } // pre: smoke was already here before the fire was known (not evidence of spread)
  if (n.base != null && n.t1 == null && n.ceil >= n.base + 1.5) n.t1 = now;
}

export function makeReport(n, now) {
  return { id: n.id, ts: now, ceil: n.ceil, low: n.low, temp: n.temp, co: n.co, stage: n.stage, s1since: n.s1since, fires: n.fires, door: n.door, beyond: n.beyond, press: n.press, t1: n.t1, pre: !!n.pre, rise: n.rise, seq: ++n.seq };
}

function rep(me, id, now) {
  if (id === me.id) return me.lastRep || makeReport(me, now);
  const e = me.tbl[id]; if (!e) return null; if (now - e.rx > CFG.STALE) return null; return e.rep;
}

export function estimateSpread(me, now, F, tFire0) {
  let vx = 0, vy = 0, sw = 0, sv = 0, n = 0, nv = 0, svR = 0, nR = 0;
  for (const id in NODE_DEFS) {
    const r = rep(me, id, now); if (!r || r.t1 == null || r.pre) continue;
    const d = NODE_DEFS[id], dx = d.x - F.x, dy = d.y - F.y, dist = Math.hypot(dx, dy); if (dist < 2.5) continue;
    const dt1 = Math.max(1, r.t1 - tFire0), w = Math.max(0.02, r.rise) / dt1;
    vx += dx / dist * w; vy += dy / dist * w; sw += w; n++;
    // speed: ramp nodes sit in the exhaust draft (chimney) and would overstate how fast smoke crosses the lot floor
    if (d.t === 'ramp') { svR += dist / dt1; nR++; } else { sv += dist / dt1; nv++; }
  }
  if (n < 2 || sw <= 0) return { valid: false, n };
  const m = Math.hypot(vx, vy); if (m < 1e-6) return { valid: false, n };
  const v = nv ? sv / nv : svR / nR;
  return { valid: true, vx: vx / m, vy: vy / m, v: Math.min(1.6, Math.max(0.2, v)), n };
}

// state of one exit from node `me` viewpoint
function evalExit(me, X, now, S) {
  const isV = X === 'V'; const d = isV ? { x: 0, y: 10 } : NODE_DEFS[X];
  let state = 'open', why = '';
  const up = (s, w) => { if (RANK[s] > RANK[state]) { state = s; why = w; } };
  let stg = 0;
  if (!isV) {
    const er = rep(me, X, now), pr = rep(me, d.pillar, now);
    if (!pr && now > 3) up('closed', 'zone'); if (!er && now > 3) up('caution', 'noresp');
    if (er) { if (er.door === 'locked') up('closed', 'door'); if (er.beyond >= 2) up('closed', 'doorsmoke'); stg = Math.max(effStage(er, now), effStage(pr, now)); }
    else stg = effStage(pr, now);
  } else {
    for (const id of ['R0', 'R1', 'R2', 'R3']) { const r = rep(me, id, now); if (!r) { if (now > 3) up('caution', 'noresp'); } else stg = Math.max(stg, effStage(r, now)); }
  }
  for (const f of S.fires) if (Math.hypot(d.x - f.x, d.y - f.y) <= FIRE_R) up('closed', 'fire');
  if (stg >= 2) up('closed', 'smoke'); else if (stg === 1) up('caution', 'smoke1');
  let miss = false;
  if (S.spread.valid && S.F && !S.flow) { // with the airflow forecast available, it replaces the coarse sensor-direction guess
    const dx = d.x - S.F.x, dy = d.y - S.F.y, dist = Math.hypot(dx, dy), cos = (dx * S.spread.vx + dy * S.spread.vy) / (dist || 1);
    // prediction check: the exit's zone sensor (pillar, or R0 for the ramp) should already see smoke by now
    const zid = isV ? 'R0' : d.pillar, zd = NODE_DEFS[zid], zr = rep(me, zid, now), xr = isV ? null : rep(me, X, now);
    const zArrive = Math.hypot(zd.x - S.F.x, zd.y - S.F.y) / S.spread.v - (now - S.tFire0);
    if (cos >= CFG.COS && zr && zr.t1 == null && (!xr || xr.t1 == null) && zArrive < -CFG.MISS_T) { miss = true; if (me.predSince) me.predSince[X] = null; }
    else if (cos >= CFG.COS && !S.seenToward(dx / (dist || 1), dy / (dist || 1), dist)) { if (me.predSince) me.predSince[X] = null; up('caution', 'predict-slack'); }
    else if (cos >= CFG.COS) {
      const arrive = dist / S.spread.v - (now - S.tFire0); const walk = Math.hypot(me.ref.x - d.x, me.ref.y - d.y) / V_WALK;
      me.predSince = me.predSince || {};
      if (arrive < walk + CFG.SAFE_T) { if (me.predSince[X] == null) me.predSince[X] = now; if (now - me.predSince[X] >= 2.5) up('closed', 'predict'); else up('caution', 'predict-slack'); }
      else { me.predSince[X] = null; up('caution', 'predict-slack'); }
    } else if (me.predSince) me.predSince[X] = null;
  }
  // airflow-informed prediction: the system knows the vents and jet fans, so it knows where the smoke will be carried
  if (S.flow && S.F && !isV) { // stairs only: the ramp is the building's own exhaust path and has its own sensors
    const ta = S.flow.at && S.flow.at[X] != null ? S.flow.at[X] : Infinity;
    if (isFinite(ta)) {
      const arrive = ta - now, walk = Math.hypot(me.ref.x - d.x, me.ref.y - d.y) / V_WALK;
      const zid = isV ? 'R0' : d.pillar, zr = rep(me, zid, now); const wrong = arrive < -2 * CFG.MISS_T && zr && zr.t1 == null && zr.stage === 0;
      if (!wrong) { if (arrive < walk + CFG.FLOW_T) up('closed', 'flow'); else if (arrive < walk + CFG.FLOW_C) up('caution', 'flow-slack'); }
    }
  }
  if (miss && state === 'open') why = 'predict-miss';
  // hysteresis FSM (a falsified prediction-only closure reopens sooner than a real smoke/fire closure)
  let f = me.exitFsm[X]; if (!f) f = me.exitFsm[X] = { s: 'open', why: '', better: null };
  if (RANK[state] > RANK[f.s]) { f.s = state; f.why = why; f.better = null; }
  else if (RANK[state] < RANK[f.s]) {
    if (f.s === 'closed') { if (f.better == null) f.better = now; const hold = (miss && f.why === 'predict') || f.why === 'flow' ? CFG.REOPEN_MISS : X === S.clearing ? CFG.REOPEN_PATH : CFG.REOPEN; /* the stair the fans are clearing is watched closely */ if (now - f.better >= hold) { f.s = state; f.why = why; f.better = null; } }
    else { f.s = state; f.why = why; }
  } else { f.better = null; f.why = why || f.why; }
  return { s: f.s, why: f.why, cand: state };
}

export function exitGoalCell(nav, X) {
  if (X === 'V') return nav.snap(0, 11);
  const a = NODE_DEFS[X].appr; return nav.snap(a[0], a[1]);
}

// Choose target given nav.dist already computed from the evaluation point.
// extra(id): optional per-exit cost added on top of path cost (agents use it for the queue at a stair door).
export function pickTarget(nav, goals, exits, S, now, cfg, extra = null) {
  const dist = nav.dist; const cost = (id) => dist[goals[id]] + (extra && DOORS.includes(id) ? extra(id) : 0);
  // 1. open stairs / ramp
  let best = null;
  for (const X of DOORS) if (exits[X].s === 'open' && isFinite(cost(X))) { const c = cost(X); if (!best || c < best.cost) best = { id: X, kind: 'stairs', cost: c }; }
  if (exits.V.s === 'open' && isFinite(cost('V3'))) { const c = cost('V3') + CFG.RAMP_PEN; if (!best || c < best.cost) best = { id: 'V', kind: 'ramp', cost: c }; }
  if (best) return { mode: best.kind, ...best };
  // 2. caution stairs
  for (const X of DOORS) if (exits[X].s === 'caution' && isFinite(cost(X))) { const c = cost(X); if (!best || c < best.cost) best = { id: X, kind: 'caution', cost: c }; }
  if (best) return { mode: 'caution', ...best };
  // 3. isolation
  if (cfg.refuge === 'yes' && S.qOk && isFinite(cost('Q'))) return { mode: 'refuge', id: 'Q', kind: 'refuge', cost: cost('Q') };
  let bs = null;
  for (const id of SOSS) {
    if (!isFinite(cost(id)) || !S.sosOk[id]) continue; const d = NODE_DEFS[id];
    let df = 40; for (const f of S.fires) df = Math.min(df, Math.hypot(d.x - f.x, d.y - f.y));
    let ta = 60; if (S.stageOf(id) >= 1) ta = 0; else if (S.spread.valid && S.F) ta = Math.max(0, Math.min(120, Math.hypot(d.x - S.F.x, d.y - S.F.y) / S.spread.v - (now - S.tFire0)));
    const score = df + 0.5 * ta - 0.3 * cost(id) - 15 * S.stageOf(id); // never send people to wait in smoke that is already there
    if (!bs || score > bs.score) bs = { id, kind: 'sos', cost: cost(id), score };
  }
  if (bs) return { mode: 'isolation', ...bs };
  return { mode: 'stay', id: null, kind: 'stay', cost: 0 };
}

// Full decision for one node
export function decide(me, ctx) {
  const { now, nav, nodes, cfg, power } = ctx;
  // known fires
  const fires = []; let tFire0 = Infinity;
  for (const cid in me.knownFires) { const c = CARS[cid]; fires.push({ id: cid, x: c.x, y: c.y }); tFire0 = Math.min(tFire0, me.knownFires[cid]); }
  const F = fires.length ? fires[0] : null;
  let spread = F ? estimateSpread(me, now, F, tFire0) : { valid: false, n: 0 };
  if (spread.valid) { // low-pass filter the spread vector (tau ~ 1.5 s at 2 Hz decisions)
    const p = me.spreadF; if (!p) me.spreadF = { vx: spread.vx, vy: spread.vy, v: spread.v };
    else { const a = 0.3; let vx = p.vx * (1 - a) + spread.vx * a, vy = p.vy * (1 - a) + spread.vy * a; const m = Math.hypot(vx, vy) || 1; p.vx = vx / m; p.vy = vy / m; p.v = p.v * (1 - a) + spread.v * a; }
    spread = { valid: true, vx: me.spreadF.vx, vy: me.spreadF.vy, v: me.spreadF.v, n: spread.n };
  }
  const stageOf = (id) => effStage(rep(me, id, now), now);
  const lost = []; for (const id of ['A', 'B', 'C', 'D']) if (!rep(me, id, now) && now > 3) lost.push(id);
  // has smoke actually been observed travelling in direction (ux,uy) from the fire, far enough toward an exit at distance dist?
  const seenToward = (ux, uy, dist) => {
    for (const id in NODE_DEFS) {
      const r = rep(me, id, now); if (!r || r.t1 == null || r.pre || !F) continue; const d = NODE_DEFS[id], ex = d.x - F.x, ey = d.y - F.y, dd = Math.hypot(ex, ey);
      if (dd < 2.5) continue; if ((ex * ux + ey * uy) / dd >= CFG.EVID_COS && dd >= CFG.EVID_FRAC * dist) return true;
    }
    return false;
  };
  const S = { clearing: ctx.clearing || null, flow: ctx.flow || null, fires, F, tFire0, spread, stageOf, seenToward, qOk: !!rep(me, 'Q', now), sosOk: { S1: !!rep(me, 'S1', now), S2: !!rep(me, 'S2', now) } };
  const exits = {}; for (const X of ['E1', 'E2', 'E3', 'E4', 'V']) exits[X] = evalExit(me, X, now, S);
  let anyStage = 0; for (const id in NODE_DEFS) anyStage = Math.max(anyStage, stageOf(id));
  const active = fires.length > 0 || anyStage >= 1;
  const dec = { S, id: me.id, now, active, fires, spread, exits, lost, mode: 'none', target: null, kind: null, cost: 0, path: null, dir: null, dist: 0, stage: me.stage, power, text: ['정상', '대피 안내 대기', ''], led: 'off', closed: [], F };
  for (const X of ['E1', 'E2', 'E3', 'E4', 'V']) if (exits[X].s === 'closed') dec.closed.push(X);
  if (me.canRoute && active) {
    const hz = ctx.hz, st = ctx.stageBuf;
    const hl = fires.map((f) => ({ x: f.x, y: f.y, r: FIRE_R }));
    for (const id of lost) hl.push({ x: NODE_DEFS[id].x, y: NODE_DEFS[id].y, r: CFG.DEAD_R });
    nav.hazardField(hl, hz);
    const nn = nav.nearNode, ids = ctx.nodeIds; const ns = new Uint8Array(ids.length); for (let k = 0; k < ids.length; k++) ns[k] = stageOf(ids[k]);
    for (let c = 0; c < nav.n; c++) st[c] = nn[c] >= 0 ? ns[nn[c]] : 0;
    nav.run(me.sx, me.sy, hz, st);
    const pk = pickTarget(nav, ctx.goals, exits, S, now, cfg);
    dec.mode = pk.mode; dec.target = pk.id; dec.kind = pk.kind; dec.cost = pk.cost; dec.score = pk.score;
    if (pk.id) {
      const gc = pk.id === 'V' ? ctx.goals.V3 : ctx.goals[pk.id]; dec.path = nav.path(gc, hz); dec.dist = nav.dist[gc];
      if (dec.path && dec.path.length >= 4) { const px = dec.path[2] - dec.path[0], py = dec.path[3] - dec.path[1]; dec.dir = Math.atan2(py, px); }
    }
  } else if (active) dec.mode = 'alert';
  dec.text = buildText(me, dec, power, ctx); dec.led = ledOf(dec);
  return dec;
}

export function ledOf(dec) {
  switch (dec.mode) {
    case 'stairs': case 'ramp': return 'green';
    case 'caution': return 'orange';
    case 'isolation': case 'refuge': case 'stay': return 'blue';
    case 'alert': return 'orange';
    default: return 'off';
  }
}

function buildText(me, dec, power, ctx) {
  const t = ['', '', '']; const nm = NODE_NAME(dec.target || '');
  switch (dec.mode) {
    case 'stairs': t[0] = nm; t[1] = '문 닫고 올라가세요'; break;
    case 'ramp': t[0] = '경사로 도보대피'; t[1] = '차량 주의'; break;
    case 'caution': t[0] = nm; t[1] = '자세 낮춤'; break;
    case 'isolation': t[0] = 'SOS ' + Math.round(dec.dist) + 'm'; t[1] = '버튼 누르고 대기'; break;
    case 'refuge': t[0] = '연기 차단 공간 ' + Math.round(dec.dist) + 'm'; t[1] = '문 닫고 SOS'; break;
    case 'stay': t[0] = '이동 불가: 자세 낮춤'; t[1] = '구조 요청 중'; break;
    case 'alert': t[0] = '화재 감지'; t[1] = '출구 안내 대기'; break;
    default: t[0] = '정상'; t[1] = '화재 감지 대기';
  }
  if (me.canRoute && dec.active) {
    const cl = dec.closed.filter((x) => x !== 'V').map((x) => STAIR_ZONE[x]); const v = dec.closed.includes('V');
    if (cl.length || v) t[2] = '폐쇄: ' + (cl.length ? '계단' + cl.join(', ') : '') + (v ? (cl.length ? ' ' : '') + '경사로' : '');
  }
  return t;
}

// 119 link and rescue team. When people are trapped, the control room (관리실) calls 119 automatically and keeps sending what the
// mesh knows: where the fire is, how far the smoke has come, who is waiting where and which entrance is clean.
// The rescue team then follows the real sequence: arrive, put on the face piece, (force the door), go in as a pair,
// reach the people, report by radio, fit rescue masks, lead them out in a line along the way the team came in.
import { NODE_DEFS, DOORS, CARS, FIRE_R, DT, rampZ, NODE_NAME, STAIR_ZONE } from './world.js';

export const T_ARR = 35;                 // dispatch -> on scene, in sim seconds (about 7 min in reality, shown compressed)
export const TIME_K = 420 / T_ARR;       // real seconds per sim second while the team is on the way
const V_IN = 1.3, V_LOW = 0.95, V_SEARCH = 0.55, V_OUT = 0.9, GAP = 0.95, PER_TEAM = 6, SIZEUP = 8;
// the people waiting hold a wet towel over nose and mouth; they keep it there, stay low and follow the team out
const EXIT_PT = (X) => (X === 'V' ? [0, 40.8] : NODE_DEFS[X].appr);
const SOS_C = { S1: [-12, 0], S2: [12, 0], Q: [0, -11.2] };
// wall search tour (no location info): lane ends around the lot, walked in order from the entry
const TOUR = [[-13.3, 8], [-4, 8], [4, 8], [13.3, 8], [12.5, 1.3], [12.5, -1.3], [13.3, -8], [4, -8], [0, -10.8], [-4, -8], [-13.3, -8], [-12.5, -1.3], [-12.5, 1.3]];
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Crew {
  constructor(id, team, role) { this.id = id; this.team = team; this.role = role; this.x = this.y = this.px = this.py = 0; this.yaw = this.pyaw = 0; this.vx = this.vy = this.sp = 0; this.anim = 'Idle'; this.pose = null; this.visible = false; this.z = 0; this.stage = 0; this.path = null; this.pi = 0; }
  place(x, y, yaw) { this.x = this.px = x; this.y = this.py = y; this.yaw = this.pyaw = yaw; this.z = rampZ(y); this.visible = true; }
}

export class Rescue {
  constructor(sim) { this.sim = sim; this.crew = []; for (let i = 0; i < 4; i++) this.crew.push(new Crew(i, i >> 1, i % 2 ? 'rear' : 'lead')); this.reset(); }
  reset() {
    this.detectAt = null; this.reportAt = null; this.rxAt = null; this.dispatchAt = null; this.eta = null; this.arrivedAt = null; this.clearAt = null;
    this.sent = {}; this.packet = null; this.pktAt = -9; this.teams = []; this.rescued = 0; this.doneAt = null; this.steps = {}; this.route = null; this.planAt = -9;
    for (const c of this.crew) { c.visible = false; c.pose = null; c.anim = 'Idle'; }
  }
  mark(k, t) { if (this.steps[k] == null) this.steps[k] = t; }
  get loc() { return this.sim.cond.loc119 !== false; }
  // ---------------------------------------------------------------- per tick
  step(now) {
    const S = this.sim, M = S.nodes.M;
    // 119 is called only when someone is trapped and waits for rescue: an SOS request reaches the control room,
    // or the guidance tells people there is no way out and to wait where they are
    const sosIn = ['S1', 'S2', 'Q'].some((id) => S.sos[id].rxAt != null), stay = M.dec && M.dec.mode === 'stay' && S.agents.some((a) => a.state === 'wait');
    if (this.detectAt == null && (sosIn || stay)) { this.detectAt = now; this.reportAt = now + 0.5; this.mark('detect', now); }
    if (this.reportAt != null && this.rxAt == null && now >= this.reportAt) { this.rxAt = now; this.mark('report', now); S.addLog('관리실 → 119 구조 요청 자동 전송: 지하주차장 ' + this.fireText() + ' 화재, 갇힌 사람 위치와 인원, 연기 정보', 'r119'); this.dispatchAt = now + 2; }
    if (this.dispatchAt != null && this.eta == null && now >= this.dispatchAt) { this.eta = now + T_ARR; this.mark('dispatch', now); S.addLog('119 출동 지령: 구조대 출발 (도착까지 실제 약 7분)', 'r119'); }
    if (this.rxAt != null) for (const id of ['S1', 'S2', 'Q']) { const s = S.sos[id]; if (s.rxAt != null && !this.sent[id]) { this.sent[id] = now; S.addLog('119에 요구조자 위치 추가 전송: ' + (id === 'Q' ? '차단 공간 Q' : id + ' SOS') + ' ' + s.n + '명', 'r119'); } }
    if (this.rxAt != null && now - this.pktAt >= 1) { this.pktAt = now; this.packet = this.makePacket(now); }
    if (this.eta != null && this.arrivedAt == null && now >= this.eta) { this.arrivedAt = now; this.mark('arrive', now); S.addLog('구조대 현장 도착', 'r119'); }
    // without location data the team first has to find out what is going on (fire panel, asking around): size-up time
    if (this.arrivedAt != null && now - this.planAt >= 1 && (this.loc || now - this.arrivedAt >= SIZEUP)) { this.planAt = now; this.assign(now); }
    for (const T of this.teams) this.stepTeam(T, now);
  }
  fireText() { const z = this.sim.fires.map((f) => CARS[f.id].zone); return z.length ? (z.includes('R') ? '경사로 앞' : z.join(', ') + '구역') + ' 전기차' : '차량'; }
  // people still waiting for help, grouped by where they wait
  groups() {
    const S = this.sim, out = [];
    for (const id of ['S1', 'S2', 'Q']) { const m = S.agents.filter((a) => a.visible && (a.state === 'wait' || a.state === 'press') && a.target === id && !a.team); if (m.length) out.push({ id, members: m, x: SOS_C[id][0], y: SOS_C[id][1] }); }
    const stray = S.agents.filter((a) => a.visible && a.state === 'wait' && a.kind === 'stay' && !a.team);
    if (stray.length) { const x = stray.reduce((s, a) => s + a.x, 0) / stray.length, y = stray.reduce((s, a) => s + a.y, 0) / stray.length; out.push({ id: 'X', members: stray, x, y }); }
    return out.sort((a, b) => b.members.length - a.members.length);
  }
  // cleanest way in for a target: path length + smoke at the door; fire at the door rules it out; a locked door can be forced
  pickEntry(tx, ty) {
    const S = this.sim, nav = S.nav; let best = null;
    const hz = this.hazard(); nav.run(tx, ty, hz, null);
    for (const X of [...DOORS, 'V']) {
      const p = EXIT_PT(X); let bad = false; for (const f of S.fires) if (Math.hypot(p[0] - f.x, p[1] - f.y) < FIRE_R + 0.5) bad = true; if (bad) continue;
      const L = nav.dist[nav.snap(p[0], p[1])]; if (!isFinite(L)) continue;
      const n = S.nodes[X === 'V' ? 'R1' : X]; const st = Math.max(n.stage, X === 'V' ? S.nodes.R0.stage : 0); const locked = X !== 'V' && n.door === 'locked';
      const cost = L + 12 * st + (locked ? 6 : 0) + (X === 'V' ? 4 : 0); if (!best || cost < best.cost) best = { id: X, cost, L, stage: st, locked };
    }
    return best;
  }
  blindEntry() {
    const S = this.sim; for (const X of ['V', ...DOORS]) { const p = EXIT_PT(X); if (S.fires.some((f) => Math.hypot(p[0] - f.x, p[1] - f.y) < FIRE_R + 0.5)) continue; const n = S.nodes[X === 'V' ? 'R1' : X]; return { id: X, cost: 0, L: 0, stage: n.stage, locked: X !== 'V' && n.door === 'locked' }; }
    return null;
  }
  hazard() { const S = this.sim; const hz = S.hzR || (S.hzR = new Float32Array(S.nav.n)); S.nav.hazardField(S.fires.map((f) => ({ x: f.x, y: f.y, r: FIRE_R })), hz); return hz; }
  pathTo(x0, y0, x1, y1) { const S = this.sim, hz = this.hazard(); S.nav.run(x0, y0, hz, null); const p = S.nav.path(S.nav.snap(x1, y1), hz); if (p) p.push(x1, y1); return p; }
  assign(now) {
    const S = this.sim; const gs = this.groups(); // people already taken by a team are not in any group
    const inside = S.agents.filter((a) => a.state !== 'done').length;
    if (!gs.length) { if (!inside && this.clearAt == null && !this.teams.length) { this.clearAt = now; S.addLog('구조대: 남은 사람 0명 확인 (메시 기록), 인명 검색 생략', 'r119'); } return; }
    for (const g of gs) {
      let T = this.teams.find((t) => t.state === 'standby'); if (!T && this.teams.length < 2) { T = { id: this.teams.length, state: 'standby', members: [this.crew[this.teams.length * 2], this.crew[this.teams.length * 2 + 1]], trips: 0 }; this.teams.push(T); }
      if (!T) return;
      // with location data: the cleanest entrance for this group. Without: the vehicle entrance (or the first stair that is not on fire)
      const e = this.loc ? this.pickEntry(g.x, g.y) : this.blindEntry(); if (!e) return;
      const p0 = EXIT_PT(e.id); const take = g.members.slice().sort((a, b) => Math.hypot(a.x - p0[0], a.y - p0[1]) - Math.hypot(b.x - p0[0], b.y - p0[1])).slice(0, PER_TEAM); // a pair leads at most 6 people
      for (const a of take) a.team = T; g.members = take; if (S.sos[g.id]) S.sos[g.id].status = 'rescue';
      Object.assign(T, { group: g, entry: e.id, entryInfo: e, state: e.locked && !T.trips ? 'force' : 'mask', t0: now, victims: take.slice(), trail: [], fit: 0, tour: null });
      const p = EXIT_PT(e.id), [L, R] = T.members; const ix = e.id === 'V' ? 0 : -Math.sign(p[0]), iy = e.id === 'V' ? -1 : 0; const yaw = Math.atan2(iy, ix);
      L.place(p[0], p[1], yaw); R.place(p[0] - ix * 0.9, p[1] - iy * 0.9, yaw); S.doorFlash[e.id] = now; T.out = [-ix, -iy]; T.virt = 0;
      if (S.sos[g.id]) S.sos[g.id].status = 'rescue';
      this.mark('entry', now); S.addLog('구조대 ' + (T.id + 1) + '조 진입: ' + NODE_NAME(e.id) + (this.loc ? ' → ' + (g.id === 'X' ? '대기 인원' : g.id) + ' (위치 정보로 바로 이동)' : ' (위치 정보 없음: 벽 따라 검색)'), 'r119');
      if (e.locked && !T.trips) S.addLog(NODE_NAME(e.id) + ' 문 잠김: 구조대가 강제 개방', 'r119');
    }
  }
  // ---------------------------------------------------------------- team state machine
  stepTeam(T, now) {
    const S = this.sim, [L, R] = T.members; for (const c of T.members) { c.px = c.x; c.py = c.y; c.pyaw = c.yaw; c.sp = 0; c.stage = c.visible ? S.stageAt(c) : 0; }
    const dt = now - T.t0;
    switch (T.state) {
      case 'force': L.pose = 'force'; R.pose = null; L.anim = R.anim = 'Idle'; if (dt >= 2.5) { T.state = 'mask'; T.t0 = now; } break;
      case 'mask': // face piece on, then the pair goes in together
        L.pose = R.pose = 'mask'; L.anim = R.anim = 'Idle';
        if (dt >= 2.2) { L.pose = R.pose = null; T.t0 = now; T.trail = [L.x, L.y];
          if (this.loc || T.trips) { L.path = this.pathTo(L.x, L.y, T.group.x, T.group.y); L.pi = 1; T.state = 'approach'; this.route = { team: T.id, kind: 'in', pts: L.path ? L.path.slice() : [] }; }
          else { T.state = 'search'; T.tour = this.tourFrom(L.x, L.y); T.ti = 0; L.path = null; } }
        break;
      case 'approach': {
        const v = L.stage >= 1 ? V_LOW : V_IN; const arrived = this.follow(L, v, L.stage >= 1 ? 'CrouchWalk' : 'Walk'); this.trailPush(T, L); this.trailFollow(R, T, 1.2, v + 0.3);
        const near = T.victims.some((a) => Math.hypot(a.x - L.x, a.y - L.y) < 1.7);
        if (arrived || near) { T.state = 'contact'; T.t0 = now; this.mark('contact', now); for (const a of T.victims) { a.state = 'rescued'; a.faceYaw = Math.atan2(L.y - a.y, L.x - a.x); }
          S.addLog('구조대 ' + (T.id + 1) + '조: 요구조자 ' + T.victims.length + '명 접촉 "구조대입니다, 수건 계속 대고 낮은 자세로 따라오세요"', 'r119'); }
        break;
      }
      case 'search': { // no location: walk the wall lanes low with the thermal camera until someone shows up within 5 m
        if (!L.path || L.pi * 2 >= L.path.length) { const w = T.tour[T.ti++ % T.tour.length]; L.path = this.pathTo(L.x, L.y, w[0], w[1]); L.pi = 1; if (!L.path) break; }
        const onRamp = L.y > 10.5; this.follow(L, onRamp ? V_LOW : V_SEARCH, 'CrouchWalk'); L.pose = onRamp ? null : 'search'; this.trailPush(T, L); this.trailFollow(R, T, 1.2, V_SEARCH + 0.3); R.pose = null;
        if (T.victims.some((a) => Math.hypot(a.x - L.x, a.y - L.y) < 5 && S.nav.los(L.x, L.y, a.x, a.y, null))) { L.pose = null; L.path = this.pathTo(L.x, L.y, T.group.x, T.group.y); L.pi = 1; T.state = 'approach'; S.addLog('구조대 ' + (T.id + 1) + '조: 열화상 카메라로 요구조자 발견', 'r119'); }
        break;
      }
      case 'contact': { // lead reports by radio while both fit rescue masks, one person at a time each
        const radio = dt < 1.6; L.pose = radio ? 'radio' : null; if (radio) { L.anim = 'Idle'; }
        if (dt >= 1.6) { // radio report done: lead them out
          T.state = 'escort'; T.t0 = now; this.mark('escort', now); const p = EXIT_PT(T.entry); L.path = this.pathTo(L.x, L.y, p[0], p[1]); L.pi = 1; T.trail = [L.x, L.y];
          this.route = { team: T.id, kind: 'out', pts: L.path ? L.path.slice() : [] };
          T.victims.sort((a, b) => Math.hypot(a.x - L.x, a.y - L.y) - Math.hypot(b.x - L.x, b.y - L.y)); T.victims.forEach((a, i) => { a.state = 'follow'; a.order = i; });
          S.addLog('구조대 ' + (T.id + 1) + '조: 들어온 길로 이송 시작 (' + NODE_NAME(T.entry) + ', 낮은 자세로 앞 사람 어깨 잡고 한 줄로)', 'r119');
        }
        for (const c of T.members) if (!(c === L && radio)) { c.anim = c.stage >= 1 ? 'WaitCrouch' : 'Idle'; }
        break;
      }
      case 'escort': {
        // lead slows down when the line stretches; the rear member walks behind the last person
        const last = T.victims[T.victims.length - 1]; const gap = last && last.state === 'follow' ? this.trailGap(T, last, T.victims.length) : 0;
        const v = gap > 2.2 ? 0.35 : V_OUT; const p = EXIT_PT(T.entry); L.pose = 'lead';
        if (L.visible) { const arrived = this.follow(L, v, L.stage >= 1 ? 'CrouchWalk' : 'Walk'); this.trailPush(T, L); if (arrived || Math.hypot(L.x - p[0], L.y - p[1]) < 0.5) { L.visible = false; } }
        else { T.virt += V_OUT * DT; this.trailPushPoint(T, p[0] + T.out[0] * T.virt, p[1] + T.out[1] * T.virt); } // the lead keeps going up the stairs
        const inLine = T.victims.filter((a) => a.state === 'follow'); this.trailFollow(R, T, (inLine.length + 1) * GAP + 0.25, 1.6); R.pose = null;
        for (const a of inLine) if (Math.hypot(a.x - p[0], a.y - p[1]) < 0.7) { a.state = 'done'; a.visible = false; a.doneAt = now; a.exitId = T.entry; a.rescued = true; S.stats.evac++; S.stats.rescued++; this.rescued++; S.doorFlash[T.entry] = now; S.addLog('구조 완료: ' + NODE_NAME(T.entry) + '로 이송', 'agent'); }
        if (!T.victims.some((a) => a.state === 'follow') && (Math.hypot(R.x - p[0], R.y - p[1]) < 0.9 || !inLine.length && dt > 60)) {
          R.visible = false; L.visible = false; T.trips++; T.state = 'standby'; T.t0 = now; const g = T.group; T.group = null; if (S.sos[g.id]) S.sos[g.id].status = 'saved';
          if (!this.groups().length && !this.teams.some((t) => t !== T && t.state !== 'standby')) { this.doneAt = now; this.mark('done', now); S.addLog('구조 완료: 총 ' + this.rescued + '명', 'r119'); this.route = null; }
        }
        break;
      }
    }
    for (const c of T.members) { c.z = rampZ(c.y); }
  }
  tourFrom(x, y) { let k = 0, bd = 1e9; TOUR.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; k = i; } }); const out = []; for (let i = 1; i <= TOUR.length; i++) out.push(TOUR[(k + i) % TOUR.length]); return out; }
  // ---------------------------------------------------------------- movement helpers
  stepToward(c, tx, ty, v) { const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy); if (d < 1e-4) return true; const want = Math.atan2(dy, dx); const e = wrap(want - c.yaw), m = 7 * DT; c.yaw = wrap(c.yaw + Math.max(-m, Math.min(m, e))); const s = Math.min(v * Math.max(0.3, Math.cos(Math.min(1.3, Math.abs(e)))), d / DT); c.vx = Math.cos(c.yaw) * s; c.vy = Math.sin(c.yaw) * s; c.x += c.vx * DT; c.y += c.vy * DT; c.sp = s; return d < 0.05; }
  follow(c, v, anim) {
    const p = c.path; if (!p || c.pi * 2 >= p.length) { c.anim = c.stage >= 1 ? 'WaitCrouch' : 'Idle'; return true; }
    let tx = p[c.pi * 2], ty = p[c.pi * 2 + 1]; if (Math.hypot(tx - c.x, ty - c.y) < 0.3) { c.pi++; if (c.pi * 2 >= p.length) return true; tx = p[c.pi * 2]; ty = p[c.pi * 2 + 1]; }
    this.stepToward(c, tx, ty, v); c.anim = anim; return false;
  }
  trailPush(T, c) { this.trailPushPoint(T, c.x, c.y); }
  trailPushPoint(T, x, y) { const t = T.trail, n = t.length; if (!n || Math.hypot(t[n - 2] - x, t[n - 1] - y) >= 0.1) t.push(x, y); }
  // point on the trail at arc length `back` behind its head (or its start)
  trailAt(T, back) { const t = T.trail; let n = t.length / 2 - 1, acc = 0; if (n < 0) return null; while (n > 0) { const L = Math.hypot(t[2 * n] - t[2 * n - 2], t[2 * n + 1] - t[2 * n - 1]); if (acc + L >= back) { const u = (back - acc) / (L || 1); return [t[2 * n] + (t[2 * n - 2] - t[2 * n]) * u, t[2 * n + 1] + (t[2 * n - 1] - t[2 * n + 1]) * u]; } acc += L; n--; } return [t[0], t[1]]; }
  trailFollow(c, T, back, vmax) { const p = this.trailAt(T, back); if (!p) return; const d = Math.hypot(p[0] - c.x, p[1] - c.y); if (d > 0.15) { this.stepToward(c, p[0], p[1], Math.min(vmax, 0.6 + d * 0.9)); c.anim = c.stage >= 1 ? 'CrouchWalk' : 'Walk'; } else { c.anim = c.stage >= 1 ? 'WaitCrouch' : 'Idle'; } }
  trailGap(T, a, i) { const p = this.trailAt(T, i * GAP); return p ? Math.hypot(p[0] - a.x, p[1] - a.y) : 0; }
  // a person in the rescue line walks to their place behind the one in front, hand on that shoulder
  stepFollower(a) {
    const T = a.team; if (!T) return; const p = this.trailAt(T, (a.order + 1) * GAP); if (!p) return; const d = Math.hypot(p[0] - a.x, p[1] - a.y);
    if (d > 0.12) { const want = Math.atan2(p[1] - a.y, p[0] - a.x); const e = wrap(want - a.yaw), m = 7 * DT; a.yaw = wrap(a.yaw + Math.max(-m, Math.min(m, e))); const v = Math.min(1.5, 0.5 + d * 1.1, d / DT); a.vx = Math.cos(a.yaw) * v; a.vy = Math.sin(a.yaw) * v; a.x += a.vx * DT; a.y += a.vy * DT; a.sp = v; a.anim = a.stage >= 1 || a.crouch ? 'CrouchWalk' : 'Walk'; }
    else { a.anim = a.stage >= 1 ? 'WaitCrouch' : 'Idle'; }
    a.pose = a.order > 0 || T.members[0].visible ? 'holdcover' : 'cover'; // wet towel over nose and mouth, other hand on the shoulder in front
  }
  // ---------------------------------------------------------------- what the control room sends to 119
  makePacket(now) {
    const S = this.sim; const st = Object.fromEntries(['A', 'B', 'C', 'D'].map((z) => [z, S.nodes[z].ok ? S.nodes[z].stage : null]));
    const done = S.agents.filter((a) => a.state === 'done').length, moving = S.agents.filter((a) => a.state === 'go' || a.state === 'follow').length;
    const gs = this.groups(); const wait = []; for (const id of ['S1', 'S2', 'Q']) { const n = S.agents.filter((a) => a.state !== 'done' && a.target === id && (a.state === 'wait' || a.state === 'press' || a.state === 'rescued' || a.state === 'follow')).length; if (n) wait.push({ id, n, stage: S.nodes[id].stage }); }
    const g = gs[0] || (wait[0] && { x: SOS_C[wait[0].id][0], y: SOS_C[wait[0].id][1] }); const fz = S.fires[0];
    const e = g ? this.pickEntry(g.x, g.y) : fz ? this.pickEntry(fz.x, fz.y) : null;
    return { t: now, fire: this.fireText(), smoke: st, done, moving, wait, entry: e ? { id: e.id, name: NODE_NAME(e.id), stage: e.stage, locked: e.locked, dist: Math.round(e.L) } : null, eta: this.eta != null ? Math.max(0, this.eta - now) : null, vent: S.vent.mode, ventText: S.ventText() };
  }
}

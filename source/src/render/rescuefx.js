// Ventilation and rescue visuals. AirFX: ceiling vents (supply blue, exhaust red, spinning fans, ripples), jet fans,
// air streaks carried by the current airflow, and the predicted smoke paths traced from the known airflow.
// RescueFX: the rescue team's route on the floor, the control room on the street with its 119 uplink, the rescue truck.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VENTS, JETS, rampZ } from '../sim/world.js';
import { FW, FCS, FX0, FY0 } from '../sim/field.js';

const COL = { supply: new THREE.Color('#4aa8ff'), exhaust: new THREE.Color('#ff5a36'), off: new THREE.Color('#7d858c') };
const CEIL = 3.2;
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const FONT = '"IBM Plex Sans KR","Noto Sans KR","Malgun Gothic",sans-serif';
const label = (text, bg, fg = '#fff') => canvasTex(256, 96, (g, w, h) => { g.fillStyle = bg; g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 14); g.fill(); g.fillStyle = fg; g.font = `700 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
const box = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); return paint(g, hex); };
const cyl = (r0, r1, h, x, y, z, hex, rx = 0, rz = 0, seg = 16) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg).toNonIndexed(); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); return paint(g, hex); };
function paint(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[3 * i] = c.r; a[3 * i + 1] = c.g; a[3 * i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
const fanTex = () => canvasTex(128, 128, (g) => { g.translate(64, 64); g.fillStyle = 'rgba(255,255,255,.95)'; for (let k = 0; k < 5; k++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.moveTo(6, -4); g.quadraticCurveTo(46, -26, 54, 4); g.quadraticCurveTo(30, 6, 6, 6); g.fill(); } g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 59, 0, Math.PI * 2); g.stroke(); });

export class AirFX {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'AIR'; scene.add(this.group); this.t = 0;
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.3 });
    // vent housings + jet fan bodies (static parts, one mesh)
    const parts = [];
    for (const id in VENTS) { const v = VENTS[id]; parts.push(box(1.15, 0.22, 1.15, v.x, CEIL - 0.11, -v.y, '#59616a'), box(1.25, 0.04, 1.25, v.x, CEIL - 0.23, -v.y, '#3b4147')); }
    this.housing = new THREE.Mesh(mergeGeometries(parts), solid); this.group.add(this.housing);
    const ft = fanTex(); this.fans = {}; this.rings = {}; this.rips = {}; this.labels = {};
    this.tex = { supply: label('급기', 'rgba(26,96,170,.92)'), exhaust: label('배기', 'rgba(190,52,24,.92)'), off: label('정지', 'rgba(60,66,72,.85)') };
    for (const id in VENTS) {
      const v = VENTS[id];
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      fan.rotation.x = Math.PI / 2; fan.position.set(v.x, CEIL - 0.26, -v.y); fan.renderOrder = 7; this.group.add(fan); this.fans[id] = fan;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 32), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2; ring.position.set(v.x, CEIL - 0.27, -v.y); this.group.add(ring); this.rings[id] = ring;
      const rip = []; for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); r.rotation.x = Math.PI / 2; r.position.set(v.x, CEIL - 0.3, -v.y); r.renderOrder = 7; this.group.add(r); rip.push(r); } this.rips[id] = rip;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.off, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); sp.scale.set(1.25, 0.47, 1); sp.position.set(v.x, CEIL + 0.45, -v.y); sp.renderOrder = 20; this.group.add(sp); this.labels[id] = sp;
    }
    // jet fans: a short drum hung under the ceiling, turned to blow along its current direction
    this.jets = {};
    for (const id in JETS) {
      const j = JETS[id]; const g = new THREE.Group(); g.position.set(j.x, CEIL - 0.42, -j.y);
      const drum = new THREE.Mesh(mergeGeometries([cyl(0.33, 0.33, 1.3, 0, 0, 0, '#69717a', 0, Math.PI / 2, 20), box(0.1, 0.25, 0.1, -0.35, 0.3, 0, '#3b4147'), box(0.1, 0.25, 0.1, 0.35, 0.3, 0, '#3b4147')]), solid); g.add(drum);
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); fan.rotation.y = Math.PI / 2; fan.position.x = 0.66; g.add(fan);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.9, toneMapped: false })); arrow.rotation.z = -Math.PI / 2; arrow.position.x = 1.05; g.add(arrow);
      this.group.add(g); this.jets[id] = { g, fan, arrow, yaw: 0 };
    }
    // air streaks
    this.N = 170; this.P = []; for (let i = 0; i < this.N; i++) this.P.push({ x: 0, y: 0, life: 0, max: 1 });
    const sg = new THREE.PlaneGeometry(1.0, 0.12); sg.rotateX(-Math.PI / 2);
    this.streak = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), this.N); this.streak.frustumCulled = false; this.streak.renderOrder = 7; this.streak.count = 0; this.group.add(this.streak);
    // predicted smoke paths: thin ribbons just under the ceiling, dashes running the way the smoke will go
    this.predMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'attribute vec2 aUv; varying vec2 vUv; void main(){ vUv=aUv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uT,uA; varying vec2 vUv; void main(){ float k=fract(vUv.x*.55-uT*.7); float a=smoothstep(.0,.2,k)*(1.-smoothstep(.5,.62,k)); a=(.25+.75*a)*(1.-smoothstep(.55,1.,abs(vUv.y)))*uA*smoothstep(0.,1.5,vUv.x); if(a<.02) discard; gl_FragColor=vec4(1.,.5,.16,a*.9); }' });
    this.pred = new THREE.Mesh(new THREE.BufferGeometry(), this.predMat); this.pred.frustumCulled = false; this.pred.renderOrder = 21; this.group.add(this.pred); this.predVer = -1;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this.showPred = true; this.group.visible = false;
  }
  update(dt, sim) {
    const V = sim.vent; const on = V && V.mode !== 'off'; this.group.visible = on; if (!on) return; this.t += dt; const sdt = sim.playing ? dt * sim.speed : 0;
    for (const id in VENTS) {
      const q = V.q[id], st = q > 0.3 ? 'supply' : q < -0.3 ? 'exhaust' : 'off', c = COL[st], k = Math.min(1, Math.abs(q) / 9);
      const fan = this.fans[id]; fan.material.color.copy(c); if (st !== 'off') fan.rotation.z += sdt * (q >= 0 ? 1 : -1) * (2 + 14 * k);
      this.rings[id].material.color.copy(c).multiplyScalar(0.55 + 0.45 * k * (0.75 + 0.25 * Math.sin(this.t * 5)));
      this.rips[id].forEach((r, i) => { r.visible = !this.low; let ph = (this.t * 0.55 + i * 0.5) % 1; if (st === 'exhaust') ph = 1 - ph; const s = 0.7 + ph * 2.3; r.scale.set(s, s, 1); r.material.color.copy(c).multiplyScalar(st === 'off' ? 0 : (1 - Math.abs(ph - 0.5) * 2) * 0.7 * k); });
      const sp = this.labels[id]; sp.visible = st !== 'off'; this.rings[id].visible = st !== 'off'; if (sp.material.map !== this.tex[st]) { sp.material.map = this.tex[st]; sp.material.needsUpdate = true; }
    }
    for (const id in JETS) { const J = this.jets[id], [vx, vy] = V.jv[id], v = Math.hypot(vx, vy); if (v > 0.02) J.yaw = Math.atan2(vy, vx); J.g.rotation.y = J.yaw; J.fan.rotation.x += sdt * v * 40; J.arrow.visible = v > 0.05; J.arrow.material.opacity = Math.min(0.9, v * 1.6); }
    // streaks follow the ceiling airflow (base draft + vents + jet fans + the fires' ceiling jets)
    const F = sim.field; let n = 0; const K = 1.6;
    const NP = this.low ? this.N >> 1 : this.N; for (let q = 0; q < NP; q++) { const p = this.P[q];
      p.life += sdt; if (p.life >= p.max) { p.x = -13.5 + Math.random() * 27; p.y = -9.6 + Math.random() * 19.3; p.life = 0; p.max = 2.2 + Math.random() * 2.5; }
      const k = F.idx(p.x, p.y); if (k < 0 || !F.air[k]) { p.life = p.max; continue; }
      const [ux, uy] = F.ventAt(p.x, p.y), sp = Math.hypot(ux, uy); // only the air the fans move: no fan running, no streaks
      p.x += ux * sdt * K; p.y += uy * sdt * K; if (p.y > 10.2) p.life = p.max;
      if (sp < 0.06) continue; const f = Math.min(1, p.life / 0.4, (p.max - p.life) / 0.6) * Math.min(1, sp * 2.2);
      this._e.set(0, Math.atan2(uy, ux), 0); this._q.setFromEuler(this._e); this._v.set(p.x, CEIL - 0.55, -p.y); this._s.set(Math.max(0.05, f) * (0.6 + sp), 1, Math.max(0.05, f)); this._m.compose(this._v, this._q, this._s); this.streak.setMatrixAt(n++, this._m);
    }
    this.streak.count = n; this.streak.instanceMatrix.needsUpdate = true;
    // predicted smoke paths, once the system knows the fire
    const fp = sim.flowPred, known = Object.keys(sim.nodes.M.knownFires).length > 0;
    if (fp && fp.ver !== this.predVer) { this.predVer = fp.ver; this.buildPred(fp); }
    this.predMat.uniforms.uT.value = this.t; const a = this.predMat.uniforms.uA; a.value += ((known && this.showPred && fp ? 1 : 0) - a.value) * Math.min(1, dt * 3); this.pred.visible = a.value > 0.02;
  }
  buildPred(fp) {
    const pos = [], uv = [], idx = []; const W = 0.09, Y = CEIL - 0.62; let base = 0;
    for (const pts of fp.paths) { const n = pts.length / 2; if (n < 2) continue; let acc = 0;
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); let dx = pts[2 * b] - pts[2 * a], dy = pts[2 * b + 1] - pts[2 * a + 1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; if (i) acc += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]); const x = pts[2 * i], y = pts[2 * i + 1];
        pos.push(x - dy * W, Y, -(y + dx * W), x + dy * W, Y, -(y - dx * W)); uv.push(acc, -1, acc, 1); if (i) { const k = base + 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
      base += 2 * n; }
    // outline of where the twin says the smoke will be 30 s from now (marching squares on the twin's snapshot)
    if (fp.snap) { const th = 4, J = Math.floor((10 - FY0) / FCS), v = (i, j) => fp.snap[j * FW + i], P = (i, j) => [FX0 + (i + 0.5) * FCS, FY0 + (j + 0.5) * FCS]; const lerp = (a, b, va, vb) => { const t = (th - va) / ((vb - va) || 1e-6); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      const seg = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * 0.07, ny = dx / L * 0.07, Yc = CEIL - 0.6, k = pos.length / 3; pos.push(p[0] + nx, Yc, -(p[1] + ny), p[0] - nx, Yc, -(p[1] - ny), q[0] + nx, Yc, -(q[1] + ny), q[0] - nx, Yc, -(q[1] - ny)); uv.push(5, 0, 5, 0, 5, 0, 5, 0); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); };
      for (let j = 0; j < J - 1; j++) for (let i = 0; i < FW - 1; i++) { const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1); const m = (a >= th ? 1 : 0) | (b >= th ? 2 : 0) | (c >= th ? 4 : 0) | (d >= th ? 8 : 0); if (!m || m === 15) continue;
        const pa = P(i, j), pb = P(i + 1, j), pc = P(i + 1, j + 1), pd = P(i, j + 1); const e0 = () => lerp(pa, pb, a, b), e1 = () => lerp(pb, pc, b, c), e2 = () => lerp(pd, pc, d, c), e3 = () => lerp(pa, pd, a, d);
        const L = { 1: [[e3, e0]], 2: [[e0, e1]], 3: [[e3, e1]], 4: [[e1, e2]], 5: [[e3, e0], [e1, e2]], 6: [[e0, e2]], 7: [[e3, e2]], 8: [[e2, e3]], 9: [[e0, e2]], 10: [[e0, e1], [e2, e3]], 11: [[e1, e2]], 12: [[e1, e3]], 13: [[e0, e1]], 14: [[e0, e3]] }[m];
        for (const [f, g] of L) seg(f(), g()); } }
    const g = this.pred.geometry; g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
  }
}

// ---------------------------------------------------------------- rescue: route, control room uplink, truck
const STREET = 9.6;
export class RescueFX {
  constructor(scene) {
    this.scene = scene; this.t = 0;
    // rescue route ribbon on the floor (red, chevrons toward where the team is going)
    this.routeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true }, uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: 'attribute vec2 aUv; varying vec2 vUv; void main(){ vUv=aUv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uT,uA; varying vec2 vUv;
        void main(){ float y=abs(vUv.y); float aa=fwidth(y)*1.5; float edge=1.-smoothstep(.78-aa,.78+aa,y); float core=1.-smoothstep(.16-aa,.16+aa,y);
          float k=fract(vUv.x/1.6-uT*.6); float ch=1.-smoothstep(.0,.12,abs(k-.5+y*.35)); ch*=step(y,.7);
          float a=(edge*.38+core*.5+ch*.9)*uA*smoothstep(0.,.8,vUv.x); if(a<.02) discard;
          gl_FragColor=vec4(mix(vec3(1.,.2,.16),vec3(1.),ch*.75+core*.2),min(a,1.)); }` });
    this.route = new THREE.Mesh(new THREE.BufferGeometry(), this.routeMat); this.route.frustumCulled = false; this.route.renderOrder = 9; scene.add(this.route); this.routeKey = '';
    // control room on the street above, with the antenna that sends to 119
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
    const KX = -17.6, KZ = -9.5;
    this.kiosk = new THREE.Mesh(mergeGeometries([box(3.6, 2.6, 2.8, KX, STREET + 1.3, KZ, '#d9d3c4'), box(3.8, 0.18, 3.0, KX, STREET + 2.69, KZ, '#8b8f93'), box(0.9, 1.9, 0.05, KX + 0.6, STREET + 0.95, KZ + 1.42, '#3a4550'), box(1.2, 0.8, 0.05, KX - 0.9, STREET + 1.5, KZ + 1.42, '#9fc2d8'), cyl(0.05, 0.07, 3.2, KX + 1.2, STREET + 4.2, KZ - 0.6, '#c8ccd0'), cyl(0.2, 0.2, 0.05, KX + 1.2, STREET + 5.4, KZ - 0.6, '#c8ccd0', Math.PI / 2)]), solid);
    scene.add(this.kiosk);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: label('관리실', 'rgba(24,28,32,.92)'), transparent: true, toneMapped: false })); sign.position.set(KX, STREET + 2.25, KZ + 1.43); scene.add(sign);
    this.ant = new THREE.Vector3(KX + 1.2, STREET + 5.8, KZ - 0.6);
    this.waves = []; for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), new THREE.MeshBasicMaterial({ color: 0xff4436, transparent: true, depthWrite: false, toneMapped: false })); w.position.copy(this.ant); w.visible = false; scene.add(w); this.waves.push(w); }
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: label('119 전송', 'rgba(205,40,30,.95)'), transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); this.tag.scale.set(2.6, 0.98, 1); this.tag.position.copy(this.ant).add(new THREE.Vector3(0, 1.1, 0)); this.tag.renderOrder = 22; this.tag.visible = false; scene.add(this.tag);
    // wired link from the car park's mesh hub up to the control room (dashes running up)
    const lp = [new THREE.Vector3(-13.9, CEIL - 0.1, -9.5), new THREE.Vector3(-14.6, CEIL - 0.1, -9.5), new THREE.Vector3(-14.6, STREET + 0.05, -9.5), new THREE.Vector3(KX + 1.8, STREET + 0.05, KZ)];
    const pos = [], dd = []; let acc = 0; for (let i = 1; i < lp.length; i++) { const L = lp[i].distanceTo(lp[i - 1]); pos.push(...lp[i - 1].toArray(), ...lp[i].toArray()); dd.push(acc, acc + L); acc += L; }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
    this.linkMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, uniforms: { uT: { value: 0 }, uA: { value: 0 } }, vertexShader: 'attribute float aD; varying float vD; void main(){ vD=aD; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform float uT,uA; varying float vD; void main(){ float k=fract(vD*.7-uT*1.4); float a=(.25+.75*smoothstep(.6,1.,k))*uA; gl_FragColor=vec4(1.,.35,.25,a); }' });
    this.link = new THREE.LineSegments(lg, this.linkMat); this.link.renderOrder = 22; this.link.frustumCulled = false; scene.add(this.link);
    // rescue truck, parked on the street next to the stair exits once it arrives
    this.truck = this.buildTruck(solid); this.truck.visible = false; scene.add(this.truck); this.truckZ = -3; this.arrT = -1;
  }
  buildTruck(solid) {
    const g = new THREE.Group(); const parts = [];
    parts.push(box(2.4, 2.1, 5.3, 0, 1.6, 1.15, '#c41f1a'), box(2.4, 2.25, 1.9, 0, 1.68, -2.5, '#d22a20'), box(2.3, 0.9, 0.06, 0, 2.15, -3.47, '#20282f'), box(2.42, 0.2, 7.3, 0, 1.15, -0.2, '#f2f2ee'), box(2.5, 0.35, 0.3, 0, 0.7, -3.55, '#8d9296'), box(2.2, 0.35, 7.2, 0, 0.55, -0.2, '#2a2c2e'));
    for (const z of [-2.5, 1.0, 2.6]) for (const x of [-1.12, 1.12]) parts.push(cyl(0.48, 0.48, 0.32, x, 0.48, z, '#151617', 0, Math.PI / 2, 18));
    parts.push(box(0.12, 0.12, 4.8, -0.55, 2.78, 1.1, '#b9bec2'), box(0.12, 0.12, 4.8, 0.55, 2.78, 1.1, '#b9bec2')); for (let z = -1.1; z <= 3.4; z += 0.55) parts.push(box(1.1, 0.07, 0.07, 0, 2.78, z, '#b9bec2'));
    g.add(new THREE.Mesh(mergeGeometries(parts), solid));
    this.lightR = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }); this.lightB = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.3), this.lightR); lr.position.set(-0.42, 2.9, -2.6); const lb = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.16, 0.3), this.lightB); lb.position.set(0.42, 2.9, -2.6); g.add(lr, lb);
    const side = canvasTex(512, 128, (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = `800 74px ${FONT}`; c.textBaseline = 'middle'; c.fillText('119 구조대', 24, h / 2 + 4); });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: side, transparent: true, toneMapped: false })); m.position.set(s * 1.215, 1.9, 1.0); m.rotation.y = s * Math.PI / 2; g.add(m); }
    g.position.set(-17.6, STREET, -3); return g;
  }
  setRoute(r) {
    const key = r ? r.team + r.kind + r.pts.length + ':' + r.pts.slice(0, 2).map((v) => Math.round(v * 4)).join(',') : ''; if (key === this.routeKey) return; this.routeKey = key;
    const g = this.route.geometry; if (!r || r.pts.length < 4) { g.setDrawRange(0, 0); return; }
    const p = []; for (let i = 0; i < r.pts.length; i += 2) p.push([r.pts[i], r.pts[i + 1]]);
    const pos = [], uv = [], idx = []; let acc = 0; const W = 0.32;
    for (let i = 0; i < p.length; i++) { const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; if (i) acc += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); const [x, y] = p[i], z = rampZ(y) + 0.045;
      pos.push(x - dy * W, z, -(y + dx * W), x + dy * W, z, -(y - dx * W)); uv.push(acc, -1, acc, 1); if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.setDrawRange(0, idx.length); g.computeBoundingSphere();
  }
  update(dt, sim) {
    this.t += dt; const R = sim.rescue; const sending = R.rxAt != null && R.doneAt == null && R.clearAt == null;
    this.setRoute(R.route); const ra = this.routeMat.uniforms.uA; ra.value += ((R.route ? 1 : 0) - ra.value) * Math.min(1, dt * 4); this.routeMat.uniforms.uT.value = this.t;
    // uplink: rings leave the antenna every second while the control room keeps 119 updated
    this.tag.visible = sending; this.linkMat.uniforms.uT.value = this.t; const la = this.linkMat.uniforms.uA; la.value += ((sending ? 1 : 0) - la.value) * Math.min(1, dt * 3); this.link.visible = la.value > 0.02;
    this.waves.forEach((w, i) => { const ph = (this.t * 0.8 + i / 3) % 1; w.visible = sending; const s = 0.4 + ph * 3.2; w.scale.set(s, s, s); w.rotation.x = Math.PI / 2; w.material.opacity = (1 - ph) * 0.8; w.position.y = this.ant.y + ph * 1.2; });
    // truck: drives in along the street when the team arrives, lights flashing
    const arr = R.arrivedAt; this.truck.visible = arr != null && sim.t >= arr - 2.5;
    if (this.truck.visible) { const k = Math.min(1, (sim.t - (arr - 2.5)) / 2.5), e = 1 - (1 - k) ** 3; this.truck.position.z = 22 + (this.truckZ - 22) * e; const f = Math.floor(this.t * 6) % 2; this.lightR.color.setHex(f ? 0xff2a1a : 0x40100c); this.lightB.color.setHex(f ? 0x10183a : 0x2a6bff); }
  }
}

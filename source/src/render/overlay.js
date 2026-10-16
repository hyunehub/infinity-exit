// Floor guidance arrows (instanced, flowing) and mesh network overlay (links, node markers, travelling packets).
import * as THREE from 'three';
import { NODE_DEFS, NODE_IDS, MESH_EDGES, HOP, rampZ } from '../sim/world.js';

const MCOL = { stairs: [0.17, 1, 0.5], ramp: [0.17, 1, 0.5], caution: [1, 0.6, 0.12], isolation: [0.3, 0.55, 1], refuge: [0.3, 0.55, 1], stay: [0.3, 0.55, 1], alert: [1, 0.6, 0.12] };
// Guidance paths: one smooth floor ribbon per guide node (A-D, M) along the route it shows on its display,
// with chevrons flowing toward the exit. Colour = guidance mode.
const smooth = (pts, it = 3) => { // Chaikin corner cutting, keeps both ends
  for (let k = 0; k < it; k++) { if (pts.length < 3) return pts; const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; o.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]); } o.push(pts[pts.length - 1]); pts = o; }
  return pts;
};
const resample = (pts, step = 0.5) => { const o = [pts[0]]; for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)); for (let k = 1; k <= n; k++) o.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); } return o; };
export class FloorArrows {
  constructor(scene, maxV = 6000) {
    this.sig = ''; this.maxV = maxV; const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxV * 3); this.uv = new Float32Array(maxV * 2); this.col = new Float32Array(maxV * 3); this.len = new Float32Array(maxV);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2)); g.setAttribute('aC', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('aL', new THREE.BufferAttribute(this.len, 1));
    this.idx = new Uint32Array(maxV * 3); g.setIndex(new THREE.BufferAttribute(this.idx, 1)); g.setDrawRange(0, 0);
    // floor guidance as an LED strip: a thin crisp core line with a soft glow, light pulses running toward the exit,
    // and small arrowheads every 2.4 m. Widths are in metres across the ribbon (v = -1..1 over W).
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true }, uniforms: { uTime: { value: 0 }, uBoost: { value: 1 } },
      vertexShader: 'attribute vec2 aUv; attribute vec3 aC; attribute float aL; varying vec2 vUv; varying vec3 vC; varying float vL; void main(){ vUv=aUv; vC=aC; vL=aL; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uTime,uBoost; varying vec2 vUv; varying vec3 vC; varying float vL;
        float line(float d,float w){ float aa=fwidth(d)*1.2; return 1.-smoothstep(w-aa,w+aa,d); }
        void main(){ float d=vUv.x; float y=abs(vUv.y)*0.48;                 // y: metres from the centre line
          float ends=smoothstep(0.,.9,d)*(vL<0.?1.:smoothstep(0.,.5,vL-d));
          float core=line(y,.06), glow=exp(-y*y/.03)*.4;
          float pulse=pow(.5+.5*sin((d-uTime*2.6)*2.2),6.);                  // light running toward the exit
          float k=fract(d/2.4-uTime*.35); float ax=(k-.5)*2.4;                 // arrowhead: a chevron 0.5 m long, 0.28 m wide
          float chev=line(abs(ax+y*1.2-.15),.07)*step(y,.4)*step(-.6,ax)*step(ax,.45);
          float a=(core*(.55+.45*pulse)+glow*(.6+.8*pulse)+chev*.95)*ends*min(1.,uBoost);
          if(a<.01) discard; vec3 c=mix(vC,vec3(1.),core*.35+chev*.25); gl_FragColor=vec4(c*uBoost*(1.+.4*pulse),min(a,1.)); }` });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.renderOrder = 8; this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  sync(sim) {
    let sig = ''; const ids = ['A', 'B', 'C', 'D', 'M'];
    for (const id of ids) { const d = sim.nodes[id].dec; sig += d ? d.mode + d.target + (d.path ? d.path.length + ':' + Math.round(d.path[0] * 2) + ',' + Math.round(d.path[1] * 2) : 0) + ',' : 'x,'; }
    if (sig === this.sig) return; this.sig = sig;
    let nv = 0, ni = 0; const P = this.pos, U = this.uv, C = this.col, L = this.len, I = this.idx; const W = 0.48; const drawn = {};
    // longest route per exit first, so the others can join it
    const order = ids.map((id) => sim.nodes[id].dec).filter((d) => d && d.path && d.path.length >= 4 && MCOL[d.mode]).sort((a, b) => (a.target === b.target ? b.dist - a.dist : 0));
    for (const d of order) { 
      const c = MCOL[d.mode]; let raw = []; for (let i = 0; i + 1 < d.path.length; i += 2) raw.push([d.path[i], d.path[i + 1]]);
      if (d.target === 'V') { const k = raw.findIndex((q) => q[1] >= 10.5); if (k > 0) { const a = raw[k - 1], b = raw[k], u = (10.5 - a[1]) / ((b[1] - a[1]) || 1); raw = raw.slice(0, k).concat([[a[0] + (b[0] - a[0]) * u, 10.5], [0, 13], [0, 41.3]]); } } // one lane up the middle of the ramp
      let pts = smooth(resample(raw, 0.5), 2);
      // a route to an exit that already has a ribbon joins it where they meet instead of running beside it
      const prev = drawn[d.target] || (drawn[d.target] = []);
      if (prev.length) { let cut = -1, jq = null; for (let i = 0; i < pts.length && cut < 0; i++) for (const q of prev) if (Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) < 1.8) { cut = i; jq = q; break; } if (cut === 0) continue; if (cut > 0) { pts = pts.slice(0, cut); pts.push(jq); } }
      for (const q of pts) prev.push(q); if (pts.length < 2) continue;
      let acc = 0; const n = pts.length; const joined = drawn[d.target].length > pts.length; const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
      if (nv + n * 2 > this.maxV) break; const base = nv;
      for (let i = 0; i < n; i++) {
        const [x, y] = pts[i]; if (i) acc += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; const nx = -ty, ny = tx;
        for (const side of [-1, 1]) { const px = x + nx * W * side, py = y + ny * W * side; P[nv * 3] = px; P[nv * 3 + 1] = (py > 10.5 ? rampZ(py) : 0) + 0.045; P[nv * 3 + 2] = -py; U[nv * 2] = acc; U[nv * 2 + 1] = side; C[nv * 3] = c[0]; C[nv * 3 + 1] = c[1]; C[nv * 3 + 2] = c[2]; L[nv] = joined ? -1 : total; nv++; }
      }
      for (let i = 0; i < n - 1; i++) { const q = base + i * 2; I[ni++] = q; I[ni++] = q + 1; I[ni++] = q + 2; I[ni++] = q + 1; I[ni++] = q + 3; I[ni++] = q + 2; }
    }
    const g = this.geo; for (const k of ['position', 'aUv', 'aC', 'aL']) g.attributes[k].needsUpdate = true; g.index.needsUpdate = true; g.setDrawRange(0, ni);
  }
  update(dt, power) { this.mat.uniforms.uTime.value += dt; this.mat.uniforms.uBoost.value = power ? 1 : 1.6; }
}

const nodeH = { pillar: 2.75, hub: 2.8, door: 2.95, sos: 2.5, refuge: 1.4, ramp: 2.3 };
export const nodePos = (id, out) => { const d = NODE_DEFS[id]; return out.set(d.t === 'ramp' ? d.x : d.x, (d.z || 0) + (nodeH[d.t] || 2.5), -d.y); };

// Mesh network shown on the floor: a small dot per sensor node, lit orange once it knows about the fire. When a node
// receives the message, a ripple spreads from it and the link it came over glows briefly. Animated in real time so the
// hand-over stays readable even while the simulation runs slowed down.
const FLOOR = (id, out) => { const d = NODE_DEFS[id]; const o = d.t === 'pillar' ? 1.1 : d.t === 'door' || d.t === 'sos' ? 0.9 : 0; const nx = d.t === 'pillar' ? d.nrm[0] : d.x < 0 ? 1 : d.x > 0 ? -1 : 0; const ny = d.t === 'refuge' ? 0.6 : 0;
  return out.set(d.x + nx * o, (d.t === 'ramp' ? rampZ(Math.max(d.y, 11)) : 0) + 0.06, -(d.y + ny)); };
export class MeshOverlay {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group); this.slow = 1; this.active = []; this.clock = 0; this.seen = {}; this.links = []; this.rip = []; this.sig = '';
    this.P = {}; for (const id of NODE_IDS) this.P[id] = FLOOR(id, new THREE.Vector3());
    const N = NODE_IDS.length; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._up = new THREE.Euler(-Math.PI / 2, 0, 0);
    // node dots
    const dg = new THREE.CircleGeometry(0.32, 24); dg.rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }), N); this.dots.renderOrder = 9; this.dots.frustumCulled = false; this.group.add(this.dots);
    NODE_IDS.forEach((id, i) => { this._m.makeTranslation(this.P[id].x, this.P[id].y + 0.01, this.P[id].z); this.dots.setMatrixAt(i, this._m); this.dots.setColorAt(i, this._c.set(0x5f7f95)); });
    // ripples (one per node) and link trails (one per mesh edge)
    const ring = new THREE.RingGeometry(0.85, 1, 48); ring.rotateX(-Math.PI / 2); this.aR = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); ring.setAttribute('aT', this.aR);
    this.rings = new THREE.InstancedMesh(ring, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: 'attribute float aT; varying float vT; void main(){ vT=aT; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }',
      fragmentShader: 'varying float vT; void main(){ float a=(1.-vT)*.85; if(a<.01) discard; gl_FragColor=vec4(1.,.62,.22,a); }' }), N); this.rings.renderOrder = 9; this.rings.frustumCulled = false; this.group.add(this.rings);
    const E = MESH_EDGES.length; const lg = new THREE.PlaneGeometry(1, 0.22); lg.translate(0.5, 0, 0); lg.rotateX(-Math.PI / 2); this.aL = new THREE.InstancedBufferAttribute(new Float32Array(E), 1); lg.setAttribute('aT', this.aL);
    this.trails = new THREE.InstancedMesh(lg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexShader: 'attribute float aT; varying float vT; varying float vU; void main(){ vT=aT; vU=position.x; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }',
      fragmentShader: 'varying float vT; varying float vU; void main(){ float head=clamp(vT,0.,1.); if(vU>head) discard; float fade=vT<1.?1.:max(0.,1.-(vT-1.)*.65); float a=fade*(.25+.75*smoothstep(head-.35,head,vU)); if(a<.01) discard; gl_FragColor=vec4(1.,.7,.3,a*.9); }' }), E); this.trails.renderOrder = 9; this.trails.frustumCulled = false; this.group.add(this.trails);
    this.edgeIdx = {}; MESH_EDGES.forEach(([a, b], k) => { this.edgeIdx[a + '|' + b] = k; this.edgeIdx[b + '|' + a] = k; });
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) this.rings.setMatrixAt(i, this.zero); for (let k = 0; k < E; k++) this.trails.setMatrixAt(k, this.zero);
  }
  setVisible(v) {
    // shown again (story chapter 3): replay the hand-over seen so far, one hop after another, from now on
    if (v && !this.group.visible) { const ord = this.rip.slice().sort((a, b) => a.t0 - b.t0); ord.forEach((r, i) => { r.t0 = this.clock + 0.3 + i * 0.35; const L = this.links.find((l) => l.b === r.id); if (L) L.t0 = r.t0 - 0.5; }); }
    this.group.visible = v; }
  update(sim, dt = 0.016) {
    // reset when the simulation restarts
    const sig = sim.cond ? sim.cond.fire + ':' + (sim.t < this.lastT ? ++this.gen : this.gen || 0) : ''; this.lastT = sim.t; if (sig !== this.sig) { this.sig = sig; this.seen = {}; this.links = []; this.rip = []; }
    // first time each node learns about a fire (in sim time); which neighbour it came from
    const src = []; for (const id of NODE_IDS) if (sim.nodes[id].fires && sim.nodes[id].fires.length) src.push(id);
    for (const id of NODE_IDS) {
      if (this.seen[id] != null) continue; const n = sim.nodes[id]; if (!n.ok || !Object.keys(n.knownFires).length) continue;
      this.seen[id] = this.clock; const lvl = this.rip.length; this.rip.push({ id, t0: this.clock + Math.min(lvl, 6) * 0.12 });
      let from = null, best = 99; for (const s of src) { const h = sim.hops[s] && sim.hops[s][id]; if (h != null && h > 0 && h < best) { best = h; from = sim.parent[s][id]; } }
      if (from && this.edgeIdx[from + '|' + id] != null) this.links.push({ a: from, b: id, t0: this.clock + Math.min(lvl, 6) * 0.12 - 0.5 });
    }
    this.clock += dt; if (!this.group.visible) return;
    const N = NODE_IDS.length;
    NODE_IDS.forEach((id, i) => { const n = sim.nodes[id]; let c = 0x5f7f95; if (!n.ok) c = 0x3a3d42; else if (n.fires && n.fires.length) c = 0xff4a3a; else if (this.seen[id] != null && this.clock >= (this.rip.find((r) => r.id === id) || { t0: 0 }).t0) c = 0xffa040; this.dots.setColorAt(i, this._c.set(c)); });
    this.dots.instanceColor.needsUpdate = true;
    const idx = Object.fromEntries(NODE_IDS.map((id, i) => [id, i]));
    for (let i = 0; i < N; i++) this.rings.setMatrixAt(i, this.zero);
    for (const r of this.rip) { const u = (this.clock - r.t0) / 1.4; if (u < 0 || u > 1) continue; const i = idx[r.id], p = this.P[r.id], sc = 0.4 + 2.6 * u; this._m.makeScale(sc, 1, sc).setPosition(p.x, p.y + 0.02, p.z); this.rings.setMatrixAt(i, this._m); this.aR.setX(i, u); }
    this.rings.instanceMatrix.needsUpdate = true; this.aR.needsUpdate = true;
    this.active.length = 0;
    for (const L of this.links) { const k = this.edgeIdx[L.a + '|' + L.b]; const u = (this.clock - L.t0) / 0.5; if (u < 0 || u > 2.6) { this.trails.setMatrixAt(k, this.zero); continue; }
      const A = this.P[L.a], B = this.P[L.b]; const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, B.y - A.y, dz); this._q.setFromUnitVectors(this._v.set(1, 0, 0), this._s.set(dx, B.y - A.y, dz).normalize());
      this._m.compose(this._v.set(A.x, A.y + 0.015, A.z), this._q, this._s.set(len, 1, 1)); this.trails.setMatrixAt(k, this._m); this.aL.setX(k, u); if (u < 1.2) this.active.push(L.a + '|' + L.b); }
    this.trails.instanceMatrix.needsUpdate = true; this.aL.needsUpdate = true;
  }
}

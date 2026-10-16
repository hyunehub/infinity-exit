// Scene, renderer, camera presets, quality control and the per-frame glue between sim and visuals.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CARS, NODE_DEFS, DEFAULT_SPAWNS } from '../sim/world.js';
import { buildPlaceholderLot, makeCarTemplates, makePlaceholderPerson, FILL_CARS } from './placeholders.js';
import { People } from './people.js';
import { optimizeLot, mergePerson, buildCarKit, CarSet } from './optimize.js';
import { FX } from './fx.js';
import { Display } from './display.js';
import { FloorArrows, MeshOverlay } from './overlay.js';
import { Ground } from './ground.js';

const Q_LEVELS = [
  { pr: 2, layers: 1, particles: 1 }, { pr: 1.5, layers: 1, particles: 1 }, { pr: 1.25, layers: 0.7, particles: 0.6 }, { pr: 1, layers: 0.5, particles: 0.4 }, { pr: 0.75, layers: 0.34, particles: 0.2 },
];
// Reflection environment that looks like an underground car park: dark concrete box, rows of fluorescent tubes on the
// ceiling, a brighter ramp opening at one end. Cars, glass and wet-looking floor pick up believable highlights from it.
function garageEnvScene() {
  const sc = new THREE.Scene(); const box = new THREE.BoxGeometry(1, 1, 1);
  const wall = new THREE.MeshBasicMaterial({ color: 0x2a2e33, side: THREE.BackSide }); const room = new THREE.Mesh(box, wall); room.scale.set(40, 6, 40); room.position.y = 2; sc.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x1a1d21 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.9; sc.add(floor);
  const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(5.5) });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x4a5058 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.95; sc.add(ceil);
  for (let x = -16; x <= 16; x += 4) for (let z = -16; z <= 16; z += 4) { const m = new THREE.Mesh(box, tube); m.scale.set(0.3, 0.06, 2.8); m.position.set(x, 4.9, z); sc.add(m); }
  const sky = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.85, 1).multiplyScalar(2.2) })); sky.scale.set(8, 3.5, 0.2); sky.position.set(0, 1.6, -19.8); sc.add(sky);
  const warm = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.45).multiplyScalar(0.8) })); warm.scale.set(0.2, 2.5, 14); warm.position.set(19.8, 1.5, 4); sc.add(warm);
  return sc;
}
function backdropTexture() { // soft vertical gradient with a lighter centre so the cut-away model does not float in a flat void
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#1d2632'); gr.addColorStop(0.55, '#121820'); gr.addColorStop(1, '#090c11'); g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class View {
  constructor(canvas, wrap, sim, opts = {}) {
    this.canvas = canvas; this.wrap = wrap; this.sim = sim; this.opts = opts; this.ready = false; this.frames = 0; this.t0 = performance.now();
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.small, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.shadowMap.enabled = false;
    // integrated graphics (e.g. Intel Iris Xe laptops): start one step lower and cap the pixel ratio; the FPS monitor raises it again if there is headroom
    this.gpu = (() => { try { const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return ''; } })();
    this.igpu = /intel|iris|uhd graphics|hd graphics|mali|adreno|powervr|apple gpu/i.test(this.gpu) && !/swiftshader/i.test(this.gpu);
    this.maxPR = Math.min(window.devicePixelRatio || 1, opts.small ? 1.5 : this.igpu ? 1.5 : 2); this.level = opts.qlevel != null ? opts.qlevel : (opts.small ? 1 : this.igpu ? 2 : 0); this.fixedQ = opts.qfixed || false;
    const sc = this.scene = new THREE.Scene(); this.bgOn = backdropTexture(); this.bgOff = new THREE.Color(0x05070a); sc.background = this.bgOn;
    this.camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 400);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = 0.09; this.controls.maxPolarAngle = Math.PI * 0.49; this.controls.minDistance = 2.5; this.controls.maxDistance = 90; this.controls.screenSpacePanning = true;
    this.controls.addEventListener('start', () => { this.tween = null; if (this.onUserMove) this.onUserMove(); });
    const pm = new THREE.PMREMGenerator(r); this.envTex = pm.fromScene(garageEnvScene(), 0.03).texture; sc.environment = this.envTex; pm.dispose();
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2c3038, 0.7); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2e2, 1.15); this.sun.position.set(6, 22, 12); sc.add(this.sun);
    this.fill = new THREE.DirectionalLight(0x9fc0ff, 0.35); this.fill.position.set(-14, 9, -18); sc.add(this.fill);
    this.power = true; this.clock = new THREE.Clock(); this.camState = { view: 'over', door: 0, sos: 0 }; this.tween = null;
    this.cars = {}; this.mats = [];
    this.resize(); this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(wrap);
    this.setView('over', true);
    // loop control
    this.running = true; this.vis = true; document.addEventListener('visibilitychange', () => { this.vis = !document.hidden; if (this.vis) this.clock.getDelta(); });
    this.io = new IntersectionObserver((e) => { this.onscreen = e[0].isIntersecting; }); this.io.observe(canvas); this.onscreen = true;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0; this.lowT = 0; this.highT = 0;
    requestAnimationFrame((t) => this.loop(t));
  }
  // ---------------------------------------------------------------- world construction
  init(assets) {
    const sc = this.scene, sim = this.sim; this.assets = assets || {};
    const templates = makeCarTemplates();
    if (this.assets.lot) optimizeLot(this.assets.lot.scene); if (this.assets.person) mergePerson(this.assets.person);
    this.lot = this.assets.lot ? this.assets.lot.scene : buildPlaceholderLot(templates); sc.add(this.lot); this.realLot = !!this.assets.lot; this.ground = new Ground(sc);
    // the street-level sky panel of the lot model floats above the ground section: hide it
    this.lot.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; if (ms.some((m) => m && /SkyGlow|Daylight/i.test(m.name || '')) || /SkyGlow|Daylight/i.test(o.name)) o.visible = false; } });
    // daylight apron and sky glow beyond the ramp exit are baked into the merged emissive mesh: drop those triangles (the ground section is the street now)
    this.lot.updateMatrixWorld(true); this.lot.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const g = o.geometry, P = g.attributes.position, v = new THREE.Vector3(); let cut = false; const keep = [];
      const I = g.index ? g.index.array : Array.from({ length: P.count }, (_, k) => k);
      const c = new THREE.Vector3(); const far = (a, b, d) => { c.set(0, 0, 0); for (const k of [a, b, d]) c.add(v.fromBufferAttribute(P, k).applyMatrix4(o.matrixWorld)); c.multiplyScalar(1 / 3); return c.z < -42.9 || c.y > 11.6; };
      for (let t = 0; t < I.length; t += 3) { if (far(I[t], I[t + 1], I[t + 2])) { cut = true; continue; } keep.push(I[t], I[t + 1], I[t + 2]); }
      if (cut) g.setIndex(keep);
    });
    this.lot.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m && m.map) m.map.anisotropy = 8; this.mats.push(m); } } });
    // anchors -> spawns
    if (this.realLot) {
      const sp = []; for (let i = 1; i <= 12; i++) { const a = this.lot.getObjectByName('ANCHOR_spawn_' + i); if (a) { a.updateWorldMatrix(true, false); const v = a.getWorldPosition(new THREE.Vector3()); sp.push([v.x, -v.z]); } }
      if (sp.length >= 12) sim.setSpawns(sp);
    }
    // cars
    const carSrc = this.assets.cars ? this.assets.cars.scene : null;
    if (carSrc && carSrc.getObjectByName('CAR_SEDAN')) {
      const kit = buildCarKit(carSrc); const ids = Object.keys(CARS); const slots = ids.map((id) => ({ type: kit[CARS[id].type] ? CARS[id].type : 'CAR_SEDAN', x: CARS[id].x, z: -CARS[id].y, yaw: id === 'carR' ? 0 : (CARS[id].x < 0 ? -Math.PI / 2 : Math.PI / 2), color: CARS[id].color }));
      if (this.realLot) {
        const pal = [0xd6d9de, 0x2e3440, 0x8c2f2f, 0x6f7a86, 0xc9c0a8, 0x305f8f, 0x4a4f57, 0xb8bcc4]; const types = ['CAR_SEDAN', 'CAR_SUV', 'CAR_EV_HATCH'];
        for (let i = 1; i <= 8; i++) { const a = this.lot.getObjectByName('ANCHOR_park_' + i); if (!a) continue; const v = a.getWorldPosition(new THREE.Vector3()); if (Math.abs(v.z) < 2.2) continue; /* keep the SOS waiting zone free */ slots.push({ type: types[(i * 5 + (v.x > 0 ? 1 : 0)) % 3], x: v.x, z: v.z, yaw: v.x < 0 ? -Math.PI / 2 : Math.PI / 2, color: pal[i % pal.length], filler: true }); }
      }
      this.carSet = new CarSet(sc, kit, slots); this.carKit = kit; ids.forEach((id, i) => { this.cars[id] = this.carSet.handle(i, CARS[id].color, 0x14120f); });
    } else for (const id in CARS) {
      const c = CARS[id]; const src = null; const o = templates[c.type].clone(true);
      const g = new THREE.Group(); g.name = 'CAR_' + id; g.add(o); g.position.set(c.x, 0, -c.y); g.rotation.y = id === 'carR' ? 0 : (c.x < 0 ? -Math.PI / 2 : Math.PI / 2);
      let paint = null; g.traverse((m) => { if (m.isMesh) { const ms = Array.isArray(m.material) ? m.material : [m.material]; const out = ms.map((mt) => { if (mt.name === 'Paint') { const p = mt.clone(); p.color.set(c.color); paint = p; return p; } return mt; }); m.material = Array.isArray(m.material) ? out : out[0]; } });
      sc.add(g); this.cars[id] = { group: g, paint, base: new THREE.Color(c.color), char: new THREE.Color(0x14120f) };
    }
    // static obstacles for the agents (parked cars) + SOS waiting-zone floor markings
    { const obs = []; const add = (id, x, y, yaw) => { const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw)); obs.push({ id, x, y, hx: c * 0.95 + sn * 2.35, hy: c * 2.35 + sn * 0.95 }); };
      for (const id in CARS) add(id, CARS[id].x, CARS[id].y, id === 'carR' ? 0 : Math.PI / 2);
      if (this.carSet) this.carSet.slots.filter((q) => q.filler).forEach((q) => add('fill', q.x, -q.z, q.yaw)); else if (!this.realLot) FILL_CARS.forEach(([x, y]) => add('fill', x, y, Math.PI / 2));
      sim.setObstacles(obs); this.addSosZones(); }
    // people
    const tpl = this.assets.person || makePlaceholderPerson();
    this.people = new People(sc, tpl, sim.agents.length, { frontOffset: this.opts.pfront === 'pz' ? Math.PI : 0 }); this.personReal = !!this.assets.person;
    this.fx = new FX(sc, sim.field); this.fx.setQuality(Q_LEVELS[this.level]);
    this.display = new Display(sc, sim, { oledFlip: this.opts.oledflip, glbUV: this.realLot });
    this.arrows = new FloorArrows(sc); this.meshov = new MeshOverlay(sc);
    this.applyQuality(); this.applyPower(true, true); this.syncSim(); this.ready = true;
  }
  addSosZones() {
    const c = document.createElement('canvas'); c.width = 384; c.height = 352; const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,200,40,0.16)'; g.fillRect(0, 0, 384, 352);
    g.save(); g.beginPath(); g.rect(8, 8, 368, 336); g.clip(); g.strokeStyle = 'rgba(255,205,50,0.55)'; g.lineWidth = 9; for (let k = -352; k < 384 + 352; k += 40) { g.beginPath(); g.moveTo(k, 352); g.lineTo(k + 352, 0); g.stroke(); } g.restore();
    g.strokeStyle = 'rgba(255,214,60,0.95)'; g.lineWidth = 10; g.strokeRect(5, 5, 374, 342);
    g.fillStyle = 'rgba(20,16,4,0.62)'; g.fillRect(52, 138, 280, 76); g.fillStyle = '#ffd43a'; g.font = '700 46px "Noto Sans KR","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SOS 대기 구역', 192, 176);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.zoneMats = []; this.zones = [];
    for (const id of ['S1', 'S2']) {
      const d = NODE_DEFS[id]; const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); const m = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.4), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(d.x - d.side * 2.0, 0.025, 0); m.renderOrder = 3; m.name = 'SOS_ZONE_' + id; this.scene.add(m); this.zoneMats.push(mat); this.zones.push(m);
    }
  }
  syncSim() { // after sim.reset()
    this.fx.syncFires(this.sim); this.fx.resetSmoke(); this.arrows.sig = ''; this.sync = true; this.display && (this.display.t = 0);
    for (const id in this.cars) { this.cars[id].group.visible = id !== 'carR' || this.sim.fires.some((f) => f.id === 'carR') || this.sim.cond.ramp === 'blocked'; { const c = this.cars[id]; if (c.reset) c.reset(); else if (c.paint) c.paint.color.copy(c.base), c.paint.emissive.setRGB(0, 0, 0); } }
    for (let i = 0; i < this.people.n; i++) this.people.cur[i] = null;
  }
  applyPower(on, force) {
    if (!force && on === this.power) return; this.power = on; const r = this.renderer;
    this.hemi.intensity = on ? 0.7 : 0.1; if (this.ground) this.ground.setPower(on); this.fill.intensity = on ? 0.35 : 0.03; if (this.zoneMats) for (const m of this.zoneMats) m.color.setScalar(on ? 1 : 0.4); this.sun.intensity = on ? 1.15 : 0.08; r.toneMappingExposure = on ? 1.05 : 1.15; this.scene.background = on ? this.bgOn : this.bgOff;
    for (const m of this.mats) if (m && 'envMapIntensity' in m) m.envMapIntensity = on ? 0.55 : 0.08;
    if (this.carKit) { this.carKit.glassMat.envMapIntensity = on ? 1.3 : 0.25; this.carKit.restMat.envMapIntensity = this.carKit.CAR_SEDAN && this.carKit.CAR_SEDAN.pm.envMapIntensity ? 1 : (on ? 0.7 : 0.1); for (const k of ['CAR_EV_HATCH', 'CAR_SEDAN', 'CAR_SUV']) if (this.carKit[k]) this.carKit[k].pm.envMapIntensity = on ? 1.1 : 0.1; if (this.carSet) this.carSet.shadowMat.opacity = on ? 1 : 0.6; }
    this.matsSet = true;
  }
  // ---------------------------------------------------------------- camera
  presetPose(name) {
    const a = this.camera.aspect, k = Math.max(1, 1.5 / a); const T = (x, y, z) => new THREE.Vector3(x, y, z);
    switch (name) {
      case 'top': return { p: T(0, 44 * Math.min(1.5, k), 6), t: T(0, 0, -3.5), fov: 40 };
      case 'ramp': return { p: T(30 * Math.min(1.5, k), 11 * Math.min(1.3, k), -26), t: T(0, 4.2, -26), fov: 40 };
      case 'stairs': { const id = ['E1', 'E2', 'E3', 'E4'][this.camState.door % 4]; const d = NODE_DEFS[id]; const dz = -d.y; const sx = d.x < 0 ? 1 : -1; return { p: T(d.x + sx * 8.2 * Math.min(1.25, k), 2.1, dz + Math.sign(dz) * 0.4), t: T(d.x, 1.35, dz - Math.sign(dz) * 0.3), fov: 56 }; }
      case 'sos': { const s = this.sim.sos; let id = ['S1', 'S2'][this.camState.sos % 2]; if (this.camState.sos === 0 && s.S2.n > s.S1.n) id = 'S2'; if (this.camState.sosFix) id = this.camState.sosFix; const d = NODE_DEFS[id]; const sx = d.x < 0 ? 1 : -1; return { p: T(d.x + sx * 7.2 * Math.min(1.3, k), 2.3, 1.3), t: T(d.x + sx * 1.3, 1.0, 0), fov: 48 }; }
      default: return { p: T(0, 19.7 * Math.min(2.6, k * (a < 1 ? 1.2 : 1)), 8.6 * Math.min(2.6, k * (a < 1 ? 1.2 : 1))), t: T(0, 0.3, -2.2), fov: 42 };
    }
  }
  setView(name, instant) {
    if (name === 'stairs' && this.camState.view === 'stairs') this.camState.door++;
    if (name === 'sos' && this.camState.view === 'sos') this.camState.sos++;
    this.camState.view = name; const p = this.presetPose(name);
    if (instant) { this.camera.position.copy(p.p); this.controls.target.copy(p.t); this.camera.fov = p.fov; this.camera.updateProjectionMatrix(); this.controls.update(); return; }
    this.tween = { t: 0, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: p.p, t1: p.t, f0: this.camera.fov, f1: p.fov };
  }
  flyTo(p, dur = 1.8) { this.camState.view = 'story'; this.tween = { t: 0, d: dur, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: p.p, t1: p.t, f0: this.camera.fov, f1: p.fov || 42 }; }
  project(v, out) { // world point -> px inside the canvas wrapper
    out.copy(v).project(this.camera); const w = this.wrap.clientWidth, h = this.wrap.clientHeight; out.px = (out.x * 0.5 + 0.5) * w; out.py = (-out.y * 0.5 + 0.5) * h; out.vis = out.z < 1 && out.z > -1; return out;
  }
  setInset(px, py = 0) { this.inset = px; this.insetY = py; this.resize(); }
  resize() {
    const w = Math.max(10, this.wrap.clientWidth), h = Math.max(10, this.wrap.clientHeight); this.renderer.setPixelRatio(Math.min(this.maxPR, Q_LEVELS[this.level].pr)); this.renderer.setSize(w, h, false); const ins = this.inset || 0, insY = this.insetY || 0; this.camera.aspect = (w + ins) / (h + insY); if (ins > 0 || insY > 0) this.camera.setViewOffset(w + ins, h + insY, 0, insY, w, h); else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix();
    if (this.camState && this.camState.view && !this._userMoved) { /* keep preset framing for new aspect */ const p = this.presetPose(this.camState.view); if (!this.tween && this.frames < 3) { this.camera.position.copy(p.p); this.controls.target.copy(p.t); } }
  }
  applyQuality() { const q = Q_LEVELS[this.level]; this.renderer.setPixelRatio(Math.min(this.maxPR, q.pr)); if (this.fx) this.fx.setQuality(q); this.renderer.setSize(this.wrap.clientWidth, this.wrap.clientHeight, false); }
  // ---------------------------------------------------------------- frame
  loop(ts) {
    requestAnimationFrame((t) => this.loop(t));
    if (!this.vis || !this.onscreen || !this.running) return;
    let dt = this.clock.getDelta(); dt = Math.min(dt, 0.1); this.frame(dt);
  }
  frame(dt) {
    if (!this.ready) { this.renderer.render(this.scene, this.camera); return; }
    if (this.onBefore) this.onBefore(dt);
    const sim = this.sim; const alpha = sim.frame(dt); sim.tVis = sim.t + (sim.playing ? alpha * 0.05 : 0);
    if (sim.power !== this.power) this.applyPower(sim.power);
    this.people.update(sim, alpha, dt); this.display.update(dt); this.fx.update(dt, sim, this.camera, sim.power);
    if (sim.fires.length !== this._nf || this.sync) { this.fx.syncFires(sim); this._nf = sim.fires.length; this.sync = false; for (const id in this.cars) if (id === 'carR') this.cars[id].group.visible = sim.fires.some((f) => f.id === 'carR') || sim.cond.ramp === 'blocked'; }
    this.fx.paintBurn(sim, this.cars);
    const dec = sim.nodes.M.dec; this.fx.setSpread(dec && dec.F, dec && dec.spread);
    this.arrows.sync(sim); this.arrows.update(dt, sim.power); this.meshov.update(sim, dt);
    if (this.tween) { const tw = this.tween; tw.t += dt / (tw.d || 0.9); const e = ease(Math.min(1, tw.t)); this.camera.position.lerpVectors(tw.p0, tw.p1, e); this.controls.target.lerpVectors(tw.t0, tw.t1, e); this.camera.fov = tw.f0 + (tw.f1 - tw.f0) * e; this.camera.updateProjectionMatrix(); if (tw.t >= 1) this.tween = null; }
    this.controls.update();
    if (!this.noRender) this.renderer.render(this.scene, this.camera);
    if (this.onAfter) this.onAfter(dt);
    this.frames++; this.trackFps(dt);
  }
  trackFps(dt) {
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc >= 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
      if (!this.fixedQ && this.frames > 60) { if (this.fps < 40) { this.lowT++; this.highT = 0; if ((this.lowT >= 2 || this.fps < 24) && this.level < 4) { this.level++; this.lowT = 0; this.applyQuality(); } } else if (this.fps > 57) { this.highT++; this.lowT = 0; if (this.highT >= 8 && this.level > 0) { this.level--; this.highT = 0; this.applyQuality(); } } else { this.lowT = 0; this.highT = 0; } }
    }
  }
  info() { const i = this.renderer.info; return { gpu: this.gpu, igpu: this.igpu, calls: i.render.calls, tris: i.render.triangles, geoms: i.memory.geometries, tex: i.memory.textures, fps: this.fps, level: this.level, pr: this.renderer.getPixelRatio() }; }
}

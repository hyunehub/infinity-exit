// Agent visuals: SkeletonUtils clones + AnimationMixer, crossfaded animations, heading from velocity, blob shadows.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rampZ } from '../sim/world.js';
import { measure, recolorCrew, crewGear, rescueMask, attach, Poser, beamMaterial } from './rig.js';

const NAMES = ['Run', 'CrouchWalk', 'Idle', 'PressButton', 'WaitCrouch'];
const SHIRTS = [0x2f7ad0, 0xd0452f, 0x2fa05a, 0xe0b030, 0x8a4fc0, 0x25a3a8, 0xd06fa0, 0xf0f0f0, 0xe07a30, 0x4f5fd0, 0x7a9a30, 0xb03030];
const RAMP_ANG = Math.atan(0.32);
const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

export class People {
  constructor(scene, template, n, opts = {}) {
    this.scene = scene; this.n = n; this.groups = []; this.models = []; this.mixers = []; this.actions = []; this.cur = []; this.skinned = []; this.frontOffset = opts.frontOffset || 0;
    this.crew = !!opts.crew; this.posers = []; this.masks = []; this.beams = []; this.tics = []; const info = this.info = measure(template);
    let gear = null, maskGeo = null; const gearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.08 }); this.gearMat = gearMat;
    if (info) { if (this.crew) { gear = crewGear(info); this.beamMat = beamMaterial(); } else maskGeo = rescueMask(info); }
    // normalise template height / ground
    template.scene.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(template.scene, true); const h = box.max.y - box.min.y; this.scale = (h > 0.2 && Math.abs(h - 1.7) / 1.7 > 0.06) ? 1.7 / h : 1; this.yOff = -box.min.y * this.scale;
    this.clips = {}; const anims = template.animations || []; this.single = !NAMES.every((nm) => anims.some((c) => c.name === nm));
    for (const nm of NAMES) { const c = anims.find((a) => a.name === nm) || anims.find((a) => a.name.toLowerCase().includes(nm.toLowerCase())); this.clips[nm] = c || anims[0] || null; }
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); g.name = 'AGENT_' + i; const m = skClone(template.scene); m.scale.setScalar(this.scale); m.position.y = this.yOff; g.add(m);
      m.traverse((o) => {
        if (o.isSkinnedMesh && o.name === 'P_Merged') { // merged template: per-clone vertex colours for the shirt tint (or the turnout gear)
          o.geometry = o.geometry.clone(); const ca = o.geometry.attributes.color, [s0, s1] = o.geometry.userData.shirt || [0, 0]; const tc = new THREE.Color(SHIRTS[i % SHIRTS.length]);
          if (this.crew && info) recolorCrew(o.geometry, info); else for (let k = s0; k < s1; k++) ca.setXYZ(k, tc.r, tc.g, tc.b);
          o.frustumCulled = false; o.castShadow = false; o.renderOrder = 9; o.material.transparent = true; this.skinned.push(o); return;
        }
        if (o.isSkinnedMesh || o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.renderOrder = 9; if (o.isSkinnedMesh) this.skinned.push(o); }
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]; const out = mats.map((mt) => {
            if (mt.name && /shirt/i.test(mt.name)) { const c = mt.clone(); c.color.set(SHIRTS[i % SHIRTS.length]); c.transparent = true; return c; }
            if (!mt.userData._tp) { mt.transparent = true; mt.userData._tp = true; } return mt;
          }); o.material = Array.isArray(o.material) ? out : out[0];
        }
      });
      if (info) {
        if (gear) { attach(m, info, 'Head', gear.head, gearMat); attach(m, info, 'Chest', gear.back, gearMat); const bm = attach(m, info, 'Chest', gear.beam, this.beamMat); if (bm) bm.renderOrder = 12; this.beams.push(bm); this.tics.push(attach(m, info, 'Hand_R', gear.tic, gearMat)); }
        else if (maskGeo) { const mk = attach(m, info, 'Head', maskGeo, gearMat); if (mk) mk.visible = false; this.masks.push(mk); }
        this.posers.push(new Poser(m, info));
      }
      scene.add(g); this.groups.push(g); this.models.push(m);
      const mx = new THREE.AnimationMixer(m); this.mixers.push(mx); const acts = {};
      for (const nm of NAMES) if (this.clips[nm]) acts[nm] = mx.clipAction(this.clips[nm]);
      this.actions.push(acts); this.cur.push(null);
    }
    // blob shadows
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), n); this.blob.renderOrder = 2; this.blob.frustumCulled = false; scene.add(this.blob);
    this._q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); this._q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + RAMP_ANG, 0, 0));
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.lastAnim = new Array(n).fill('');
  }
  play(i, name, ts) {
    if (name === 'Walk') name = 'Run'; // no walk clip: the run cycle slowed down to walking pace
    const acts = this.actions[i]; const a = this.single ? acts[name] : acts[name]; if (!a) return;
    if (this.cur[i] !== name) {
      const prev = this.cur[i] ? this.actions[i][this.cur[i]] : null;
      for (const k in this.actions[i]) { const o = this.actions[i][k]; if (o !== a && o !== prev) o.stop(); }   // no stale actions after reset / fast state changes
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(THREE.LoopRepeat, Infinity); a.time = (i * 0.37) % (a.getClip().duration || 1); a.play();
      if (prev && prev !== a) { a.crossFadeFrom(prev, 0.25, false); }
      this.cur[i] = name;
    }
    const ts0 = this.single ? ({ Run: 1.6, CrouchWalk: 1.0, Idle: 0.0, PressButton: 0.6, WaitCrouch: 0.0 }[name]) : 1; a.setEffectiveTimeScale((this.single ? ts0 : 1) * ts);
  }
  update(sim, alpha, dt) {
    const A = this.crew ? sim.crew : sim.agents; const step = sim.playing ? dt * sim.speed : 0;
    for (let i = 0; i < this.n; i++) {
      const a = A[i], g = this.groups[i];
      g.visible = a.visible; if (!a.visible) { this.blob.setMatrixAt(i, this._z); continue; }
      const x = a.px + (a.x - a.px) * alpha, y = a.py + (a.y - a.py) * alpha; const z = rampZ(y);
      g.position.set(x, z, -y); const th = lerpAng(a.pyaw, a.yaw, alpha); g.rotation.y = Math.atan2(-Math.cos(th), Math.sin(th)) + this.frontOffset;
      let ts = 1; if (a.anim === 'Walk') ts = Math.max(0.35, Math.min(0.7, a.sp / 2.3)); else if (a.anim === 'Run') ts = Math.max(0.6, Math.min(1.5, a.sp / 2.0)); else if (a.anim === 'CrouchWalk') ts = Math.max(0.5, Math.min(1.4, a.sp / 1.0));
      this.play(i, a.anim, ts); this.mixers[i].update(step);
      const ps = this.posers[i]; if (ps && (a.pose || ps.w.L > 0.01 || ps.w.R > 0.01)) { g.updateMatrixWorld(true); ps.apply(a.pose, step); }
      if (this.masks[i]) this.masks[i].visible = !!a.mask;
      if (this.crew && this.tics[i]) this.tics[i].visible = a.role === 'lead';
      this._v.set(x, z + 0.03, -y); this._m.compose(this._v, y > 11 ? this._q1 : this._q0, this._s); this.blob.setMatrixAt(i, this._m);
    }
    this.blob.instanceMatrix.needsUpdate = true;
  }
}

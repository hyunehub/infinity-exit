// Rig helpers for the shared person skeleton (Hips, Spine, Chest, Neck, Head, UpperArm/Forearm/Hand, Thigh/Shin/Foot):
// measuring the body in bind pose, a firefighter variant (turnout colours, reflective bands, helmet, face piece, air cylinder,
// shoulder lamp, thermal camera) built as rigid attachments on bones, and two-bone arm IK for the rescue actions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const CHILD = { UpperArm_L: 'Forearm_L', Forearm_L: 'Hand_L', UpperArm_R: 'Forearm_R', Forearm_R: 'Hand_R', Thigh_L: 'Shin_L', Shin_L: 'Foot_L', Thigh_R: 'Shin_R', Shin_R: 'Foot_R', Spine: 'Chest', Chest: 'Neck', Neck: 'Head', Hips: 'Spine' };

// geometry-space measurements of the merged person mesh (positions are in the mesh's bind space)
export function measure(template) {
  let mesh = null; template.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; }); if (!mesh) return null;
  const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, sk = mesh.skeleton;
  const invBind = mesh.bindMatrix.clone().invert(); const bone = {}; const idx = {};
  sk.bones.forEach((b, i) => { idx[b.name] = i; bone[b.name] = new THREE.Vector3().setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert()).applyMatrix4(invBind); });
  if (!bone.Head || !bone.Chest || !bone.Hips || !bone.Hand_L) return null;
  const up = _v.subVectors(bone.Head, bone.Hips).normalize().clone();
  const ranges = g.userData.ranges || {}; const cen = (name) => { const c = new THREE.Vector3(); let n = 0; for (const [a, b] of ranges[name] || []) for (let k = a; k < b; k++) { c.x += P.getX(k); c.y += P.getY(k); c.z += P.getZ(k); n++; } return n ? c.multiplyScalar(1 / n) : null; };
  // head: skin + hair vertices bound to the head bone
  const hb = idx.Head; const hmin = new THREE.Vector3(1e9, 1e9, 1e9), hmax = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let k = 0; k < P.count; k++) { let best = 0, bi = -1; for (let j = 0; j < 4; j++) { const w = SW.getComponent(k, j); if (w > best) { best = w; bi = SI.getComponent(k, j); } } if (bi !== hb || best < 0.6) continue; _a.fromBufferAttribute(P, k); hmin.min(_a); hmax.max(_a); }
  const headC = hmin.clone().add(hmax).multiplyScalar(0.5); const headSize = hmax.clone().sub(hmin);
  const eye = cen('EyeWhite') || cen('Iris'); let fwd = eye ? eye.clone().sub(headC) : new THREE.Vector3(0, 0, 1); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  let left = new THREE.Vector3().subVectors(bone.Hand_L, bone.Hand_R); left.addScaledVector(up, -left.dot(up)).addScaledVector(fwd, -left.dot(fwd)).normalize();
  if (new THREE.Vector3().crossVectors(up, fwd).dot(left) < 0) { /* keep a right-handed frame; trust the hands */ }
  const box = new THREE.Box3().setFromBufferAttribute(P); const H = box.max.clone().sub(box.min).dot(up) || 1; const k = H / 1.7; // geometry units per metre
  // chest depth: how far the torso surface sits behind the chest bone
  let back = 0; const cb = idx.Chest; for (let q = 0; q < P.count; q++) { let best = 0, bi = -1; for (let j = 0; j < 4; j++) { const w = SW.getComponent(q, j); if (w > best) { best = w; bi = SI.getComponent(q, j); } } if (bi !== cb) continue; _a.fromBufferAttribute(P, q).sub(bone.Chest); back = Math.max(back, -_a.dot(fwd)); }
  const headR = Math.max(headSize.x, headSize.z, headSize.y * 0.8) * 0.5;
  return { mesh, idx, bone, up, fwd, left, k, headC, headR, back: back || 0.12 * k, bindMatrix: mesh.bindMatrix.clone(), boneInverses: sk.boneInverses.map((m) => m.clone()) };
}

// ---------------------------------------------------------------- firefighter colours on the merged mesh (vertex colours)
const COAT = new THREE.Color('#9a7434'), BAND = new THREE.Color('#e4f05a'), BAND2 = new THREE.Color('#c8ccc8'), GLOVE = new THREE.Color('#3a2a1e'), BOOT = new THREE.Color('#121314'), HOOD = new THREE.Color('#23262b');
export function recolorCrew(geo, info) {
  const P = geo.attributes.position, C = geo.attributes.color, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, R = geo.userData.ranges || {}; const { idx, bone, up, k } = info; const name = {}; for (const n in idx) name[idx[n]] = n;
  const domBone = (q) => { let best = 0, bi = -1; for (let j = 0; j < 4; j++) { const w = SW.getComponent(q, j); if (w > best) { best = w; bi = SI.getComponent(q, j); } } return name[bi]; };
  const along = (q, b) => { const c = CHILD[b]; if (!c) return 0; _a.fromBufferAttribute(P, q).sub(bone[b]); _b.subVectors(bone[c], bone[b]); return _a.dot(_b) / _b.lengthSq(); };
  const hgt = (q, b) => { _a.fromBufferAttribute(P, q).sub(bone[b]); return _a.dot(up) / k; };
  const set = (q, col) => C.setXYZ(q, col.r, col.g, col.b);
  const each = (nm, fn) => { for (const [a, b] of R[nm] || []) for (let q = a; q < b; q++) fn(q); };
  const garment = (q) => {
    const b = domBone(q); const t = along(q, b); let col = COAT;
    if (/^Forearm/.test(b) && t > 0.42 && t < 0.6) col = BAND; else if (/^UpperArm/.test(b) && t > 0.55 && t < 0.7) col = BAND2;
    else if (/^Shin/.test(b) && ((t > 0.3 && t < 0.42) || (t > 0.5 && t < 0.62))) col = BAND; else if (b === 'Chest' && Math.abs(hgt(q, 'Chest') - 0.02) < 0.035) col = BAND;
    else if ((b === 'Spine' || b === 'Hips') && Math.abs(hgt(q, 'Hips') - 0.06) < 0.03) col = BAND;
    else if (/^Hand/.test(b)) col = GLOVE; else if (/^Foot/.test(b)) col = BOOT;
    set(q, col);
  };
  each('Shirt', garment); each('Pants', garment); each('Shoes', (q) => set(q, BOOT)); each('Sole', (q) => set(q, BOOT)); each('Hair', (q) => set(q, HOOD));
  each('Skin', (q) => { const b = domBone(q); if (/^(UpperArm|Forearm|Thigh|Shin|Spine|Chest|Hips)/.test(b)) garment(q); else if (/^Hand/.test(b)) set(q, GLOVE); else if (/^Foot/.test(b)) set(q, BOOT); else if (b === 'Neck') set(q, HOOD); });
  C.needsUpdate = true;
}

// ---------------------------------------------------------------- rigid gear, built in a body frame (x left, y up, z forward, metres)
const colored = (g, hex) => { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))); return g; };
// body frame (metres) -> geometry space at origin o
function toGeo(geo, info, o) { const { up, fwd, k } = info; const X = new THREE.Vector3().crossVectors(up, fwd).normalize(); const M = new THREE.Matrix4().makeBasis(X.multiplyScalar(k), up.clone().multiplyScalar(k), fwd.clone().multiplyScalar(k)); /* right-handed, so faces keep their winding */ M.setPosition(o); geo.applyMatrix4(M); geo.computeVertexNormals(); return geo; }
export function crewGear(info) {
  const r = info.headR / info.k; // head radius in metres
  const head = mergeGeometries([
    colored(at(new THREE.SphereGeometry(r * 1.2, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56), 0, 0.02, -0.01, 0, 0, 0, 1, 1.02, 1.08), '#c9361b'),            // helmet shell
    colored(at(new THREE.CylinderGeometry(r * 1.215, r * 1.215, 0.028, 24, 1, true), 0, 0.035, -0.01, 0, 0, 0, 1, 1, 1.08), '#e6ef62'),                     // reflective band
    colored(at(new THREE.CylinderGeometry(r * 1.34, r * 1.42, 0.022, 24), 0, -0.012, -0.035, 0.08, 0, 0, 1, 1, 1.18), '#a92c16'),                          // brim, longer at the back
    colored(at(new THREE.SphereGeometry(r * 0.86, 18, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.2, Math.PI * 0.62), 0, -0.035, r * 0.18, 0, 0, 0, 1, 1.12, 0.92), '#141b21'), // face piece visor
    colored(at(new THREE.TorusGeometry(r * 0.72, 0.012, 6, 20), 0, -0.035, r * 0.78, 0, 0, 0, 0.98, 1.2, 1), '#3c4045'),                                    // visor frame
    colored(at(new THREE.CylinderGeometry(0.03, 0.036, 0.06, 12), 0, -r * 0.62, r * 0.98, Math.PI / 2, 0, 0), '#2b2e31'),                                    // regulator
  ].map((g) => g), false);
  toGeo(head, info, info.headC);
  const bk = info.back / info.k;
  const back = mergeGeometries([
    colored(at(new THREE.CylinderGeometry(0.088, 0.088, 0.56, 16), 0, -0.17, -(bk + 0.11)), '#30363c'),                // air cylinder
    colored(at(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), 0, -0.02, -(bk + 0.11)), '#e3c33a'),                   // cylinder band
    colored(at(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), 0, -0.48, -(bk + 0.11)), '#b9bec2'),                    // valve
    colored(at(new THREE.BoxGeometry(0.3, 0.52, 0.03), 0, -0.16, -(bk + 0.015)), '#17181a'),                            // back plate
    colored(at(new THREE.BoxGeometry(0.055, 0.03, bk * 2 + 0.06), 0.1, 0.1, 0), '#1b1c1e'), colored(at(new THREE.BoxGeometry(0.055, 0.03, bk * 2 + 0.06), -0.1, 0.1, 0), '#1b1c1e'), // shoulder straps
    colored(at(new THREE.BoxGeometry(0.05, 0.3, 0.025), 0.1, -0.05, bk * 0.85), '#1b1c1e'), colored(at(new THREE.BoxGeometry(0.05, 0.3, 0.025), -0.1, -0.05, bk * 0.85), '#1b1c1e'),
    colored(at(new THREE.BoxGeometry(0.07, 0.055, 0.045), 0.1, 0.02, bk * 0.95 + 0.02), '#2a2a2a'),                    // shoulder lamp
    colored(at(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 10), 0.1, 0.02, bk * 0.95 + 0.047, Math.PI / 2, 0, 0), '#fff2c8'),
  ], false);
  toGeo(back, info, info.bone.Chest);
  // shoulder lamp beam: a soft additive cone, pointing forward and a little down
  const L = 3.2, beam = at(new THREE.CylinderGeometry(0.03, 0.62, L, 18, 1, true), 0, 0, 0, 0, 0, 0); beam.translate(0, -L / 2, 0); at(beam, 0.1, 0.02, bk * 0.95 + 0.05, -Math.PI / 2 + 0.32, 0, 0);
  toGeo(beam, info, info.bone.Chest);
  const tic = mergeGeometries([colored(at(new THREE.BoxGeometry(0.1, 0.12, 0.15), 0, 0, 0.06), '#e7c12b'), colored(at(new THREE.BoxGeometry(0.08, 0.07, 0.02), 0, 0.01, 0.14), '#101214')], false); // thermal camera
  toGeo(tic, info, info.bone.Hand_R);
  return { head, back, beam, tic };
}
export const beamMaterial = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uK: { value: 1 } },
  vertexShader: 'varying float vV; void main(){ vV=uv.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform float uK; varying float vV; void main(){ float a=pow(vV,1.6)*.16*uK; gl_FragColor=vec4(vec3(1.,.93,.76)*a,a); }' });
export function rescueMask(info) { // the yellow rescue hood / mask fitted to the people being led out
  const r = info.headR / info.k;
  const g = mergeGeometries([
    colored(at(new THREE.SphereGeometry(r * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), 0, 0.0, -0.005, 0, 0, 0, 1, 1.05, 1.06), '#f2b51f'),
    colored(at(new THREE.SphereGeometry(r * 0.8, 14, 8, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.55), 0, -0.02, r * 0.34, 0, 0, 0, 1, 1.05, 0.85), '#9fc6d8'),
    colored(at(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 10), 0, -r * 0.62, r * 1.0, Math.PI / 2, 0, 0), '#2b2e31'),
  ], false);
  return toGeo(g, info, info.headC);
}
// rigid attachment: vertex world = boneWorld * boneInverse * bindMatrix * v (same as skinning with weight 1)
export function attach(model, info, boneName, geo, mat) {
  const b = model.getObjectByName(boneName); if (!b) return null; const m = new THREE.Mesh(geo, mat); m.matrixAutoUpdate = false;
  m.matrix.copy(info.boneInverses[info.idx[boneName]]).multiply(info.bindMatrix); b.add(m); m.frustumCulled = false; return m;
}

// ---------------------------------------------------------------- arm poses by two-bone IK (world space, after the animation mixer)
export class Poser {
  constructor(model, info) {
    this.info = info; this.b = {}; for (const n of ['Chest', 'Head', 'UpperArm_L', 'Forearm_L', 'Hand_L', 'UpperArm_R', 'Forearm_R', 'Hand_R']) this.b[n] = model.getObjectByName(n);
    this.w = { L: 0, R: 0 }; this.pose = null; this.F = new THREE.Vector3(); this.U = new THREE.Vector3(); this.Lf = new THREE.Vector3(); this.ok = Object.values(this.b).every(Boolean);
    this.skin = (n) => _m.copy(this.b[n].matrixWorld).multiply(info.boneInverses[info.idx[n]]).multiply(info.bindMatrix);
  }
  // hand targets for each pose, in the body frame of the chest (metres): [left hand, right hand] or null
  targets(pose) {
    switch (pose) {
      case 'mask': return [[0.07, 0.3, 0.13], [-0.07, 0.3, 0.13]];              // fitting the face piece
      case 'force': return [[0.16, 0.0, 0.55], [-0.16, 0.02, 0.55]];             // pushing / prying the locked door
      case 'radio': return [[0.13, 0.08, 0.13], null];                           // left hand on the radio at the shoulder
      case 'fit': return [[0.12, 0.08, 0.45], [-0.12, 0.08, 0.45]];              // putting a mask on the person in front
      case 'search': return [[0.5, -0.05, 0.28], [-0.08, 0.05, 0.3]];             // left hand sweeping the wall, thermal camera in front
      case 'lead': return [null, [-0.1, 0.06, 0.34]];                            // thermal camera forward
      case 'hold': return [null, [-0.04, 0.0, 0.52]];                            // hand on the shoulder of the person in front
      default: return null;
    }
  }
  apply(pose, dt) {
    if (!this.ok) return; const T = this.targets(pose); if (pose) this.pose = pose;
    const tg = this.targets(this.pose); const k = Math.min(1, dt * 6);
    for (const [s, i] of [['L', 0], ['R', 1]]) { const on = T && T[i] ? 1 : 0; this.w[s] += (on - this.w[s]) * k; }
    if (this.w.L < 0.01 && this.w.R < 0.01) { this.pose = null; return; }
    // body frame from the chest's current skinning matrix
    const M = this.skin('Chest'); const info = this.info; this.F.copy(info.fwd).transformDirection(M); this.U.copy(info.up).transformDirection(M); this.Lf.copy(info.left).transformDirection(M);
    const C = _c.copy(info.bone.Chest).applyMatrix4(M);
    for (const [s, i] of [['L', 0], ['R', 1]]) {
      if (this.w[s] < 0.01 || !tg || !tg[i]) continue; const [x, y, z] = tg[i];
      const P = new THREE.Vector3().copy(C).addScaledVector(this.Lf, x).addScaledVector(this.U, y).addScaledVector(this.F, z);
      const pole = new THREE.Vector3().copy(this.U).multiplyScalar(-1).addScaledVector(this.Lf, s === 'L' ? 0.6 : -0.6).addScaledVector(this.F, -0.2);
      this.ik(this.b['UpperArm_' + s], this.b['Forearm_' + s], this.b['Hand_' + s], P, pole, this.w[s]);
    }
  }
  ik(A, B, Cc, P, pole, w) {
    const S = new THREE.Vector3().setFromMatrixPosition(A.matrixWorld), E = new THREE.Vector3().setFromMatrixPosition(B.matrixWorld), H = new THREE.Vector3().setFromMatrixPosition(Cc.matrixWorld);
    const l1 = S.distanceTo(E), l2 = E.distanceTo(H); const dir = new THREE.Vector3().subVectors(P, S); let d = dir.length(); dir.normalize(); d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)); const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const Et = S.clone().addScaledVector(dir, a).addScaledVector(pp, h); const Pt = S.clone().addScaledVector(dir, d);
    this.aim(A, E, Et, w); B.updateMatrixWorld(true); E.setFromMatrixPosition(B.matrixWorld); H.setFromMatrixPosition(Cc.matrixWorld); this.aim(B, H, Pt, w);
  }
  aim(bone, child, target, w) {
    const o = _a.setFromMatrixPosition(bone.matrixWorld); const d0 = _b.subVectors(child, o).normalize(), d1 = new THREE.Vector3().subVectors(target, o).normalize();
    _q.setFromUnitVectors(d0, d1); bone.getWorldQuaternion(_q2); _q.multiply(_q2); const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); _q.premultiply(pq);
    bone.quaternion.slerp(_q, w); bone.updateMatrixWorld(true);
  }
}

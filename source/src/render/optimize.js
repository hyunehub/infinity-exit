// Load-time draw-call reduction for the Blender glTF assets: bake material colours into vertex colours and merge.
// (The Blender files keep their authoring structure; this runs once at load.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _n3 = new THREE.Matrix3(), _v = new THREE.Vector3();
function f32(attr, n, s) { const a = new Float32Array(n * s); if (!attr) return a; for (let i = 0; i < n; i++) { a[i * s] = attr.getX(i); if (s > 1) a[i * s + 1] = attr.getY(i); if (s > 2) a[i * s + 2] = attr.getZ(i); if (s > 3) a[i * s + 3] = attr.getW(i); } return a; }

// all (mesh, group) parts below root, with the transform relative to root
export function collectParts(root, pred = () => true) {
  root.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !pred(o)) return; const g = o.geometry; const multi = Array.isArray(o.material); const mats = multi ? o.material : [o.material];
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const groups = multi && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) out.push({ mesh: o, geo: g, group: gr, mat: mats[gr.materialIndex] || mats[0], rel });
  });
  return out;
}
export function partColor(mat) {
  const c = new THREE.Color(1, 1, 1); if (mat.color) c.copy(mat.color);
  if (mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.02) { const k = mat.emissiveIntensity || 1; c.copy(mat.emissive).multiplyScalar(k); }
  return c;
}
// one part -> compact geometry (position, normal, uv, color [, skin])
function extract(p, colorOf, skinned) {
  const g = p.geo, pos = g.attributes.position, idx = g.index; const lut = new Int32Array(pos.count).fill(-1); const verts = []; const ind = [];
  for (let i = p.group.start; i < p.group.start + p.group.count; i++) { const v = idx ? idx.getX(i) : i; let m = lut[v]; if (m < 0) { m = verts.length; lut[v] = m; verts.push(v); } ind.push(m); }
  const n = verts.length; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
  _n3.getNormalMatrix(p.rel); const na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color; const col = colorOf(p.mat, p); const hasVC = ca && p.mat.vertexColors;
  for (let k = 0; k < n; k++) {
    const v = verts[k]; _v.set(pos.getX(v), pos.getY(v), pos.getZ(v)); if (!skinned) _v.applyMatrix4(p.rel); P[k * 3] = _v.x; P[k * 3 + 1] = _v.y; P[k * 3 + 2] = _v.z;
    if (na) { _v.set(na.getX(v), na.getY(v), na.getZ(v)); if (!skinned) _v.applyMatrix3(_n3).normalize(); N[k * 3] = _v.x; N[k * 3 + 1] = _v.y; N[k * 3 + 2] = _v.z; } else N[k * 3 + 1] = 1;
    if (ua) { U[k * 2] = ua.getX(v); U[k * 2 + 1] = ua.getY(v); }
    let r = col.r, gg = col.g, b = col.b; if (hasVC) { r *= ca.getX(v); gg *= ca.getY(v); b *= ca.getZ(v); } C[k * 3] = r; C[k * 3 + 1] = gg; C[k * 3 + 2] = b;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (skinned) {
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight; const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) { const v = verts[k]; SI[k * 4] = si.getX(v); SI[k * 4 + 1] = si.getY(v); SI[k * 4 + 2] = si.getZ(v); SI[k * 4 + 3] = si.getW(v); SW[k * 4] = sw.getX(v); SW[k * 4 + 1] = sw.getY(v); SW[k * 4 + 2] = sw.getZ(v); SW[k * 4 + 3] = sw.getW(v); }
    out.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); out.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  }
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(ind), 1)); return out;
}
export function mergeParts(parts, colorOf = partColor, skinned = false) { if (!parts.length) return null; const g = mergeGeometries(parts.map((p) => extract(p, colorOf, skinned)), false); return g; }
const detach = (o) => { if (o.parent) o.parent.remove(o); };
const vcMat = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.1 }, o));

// ------------------------------------------------------------------ lot
export function optimizeLot(lot) {
  const DIEL = ['OLEDHousing', 'ExtRed', 'BlackPlastic', 'RedPipe', 'LightHousing', 'DoorFrame', 'EVBody', 'YellowPaint', 'RefugeFloor'];
  const METAL = ['Galv', 'Brass']; const EMIS = ['LightPanel', 'ChargerGlow', 'SignWhite', 'Daylight', 'SkyGlow'];
  const stat = []; lot.traverse((o) => { if (o.isMesh && /^S_/.test(o.name) && !Array.isArray(o.material) && !o.material.map && !o.material.transparent) stat.push(o); });
  const groups = [['diel', DIEL, vcMat({ roughness: 0.6, metalness: 0.05 })], ['metal', METAL, vcMat({ roughness: 0.38, metalness: 0.8 })], ['emis', EMIS, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })]];
  let before = stat.length;
  for (const [nm, list, mat] of groups) {
    const ms = stat.filter((o) => list.includes(o.material.name)); if (!ms.length) continue;
    const parts = []; for (const m of ms) parts.push(...collectParts(lot, (o) => o === m));
    const g = mergeParts(parts); const mesh = new THREE.Mesh(g, mat); mesh.name = 'MERGED_' + nm; mesh.frustumCulled = false; for (const m of ms) detach(m); lot.add(mesh);
  }
  // doors / SOS housings: merge children into one vertex-coloured mesh per group (the pivot nodes stay)
  const prop = vcMat({ roughness: 0.5, metalness: 0.35 });
  for (const nm of ['DOOR_E1', 'DOOR_E2', 'DOOR_E3', 'DOOR_E4', 'DOOR_Q', 'SOS_S1', 'SOS_S2']) {
    const grp = lot.getObjectByName(nm); if (!grp || grp.isMesh) continue; const kids = []; grp.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && !o.material.map) kids.push(o); }); if (kids.length < 2) continue;
    const parts = []; for (const k of kids) parts.push(...collectParts(grp, (o) => o === k));
    const mesh = new THREE.Mesh(mergeParts(parts), prop); mesh.name = nm + '_merged'; for (const k of kids) detach(k); grp.add(mesh);
  }
  return before;
}

// ------------------------------------------------------------------ cars (instanced: paint / body trim / glass / lights, 4 draw calls per car type)
export function buildCarKit(carsScene) {
  const kit = {}; const isGlass = (m) => /glass/i.test(m.name), isLamp = (m) => /(head|tail)light/i.test(m.name);
  const gm = new THREE.MeshStandardMaterial({ color: 0x7d8c99, metalness: 0.8, roughness: 0.1, envMapIntensity: 1.3 }); // tinted mirror: reflects the ceiling tubes instead of reading as a black hole
  const lm = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const rm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
  for (const type of ['CAR_EV_HATCH', 'CAR_SEDAN', 'CAR_SUV']) {
    const root = carsScene.getObjectByName(type); if (!root) continue;
    const parts = collectParts(root); const paint = parts.filter((p) => p.mat.name === 'Paint'), rest = parts.filter((p) => p.mat.name !== 'Paint' && !isGlass(p.mat) && !isLamp(p.mat)), glass = parts.filter((p) => isGlass(p.mat)), lamps = parts.filter((p) => isLamp(p.mat));
    const pg = mergeParts(paint, () => new THREE.Color(1, 1, 1)), rg = mergeParts(rest, partColor), gg = mergeParts(glass, () => new THREE.Color(1, 1, 1)), lg = mergeParts(lamps, (m) => { const c = partColor(m); const k = Math.max(c.r, c.g, c.b, 1e-3); return c.multiplyScalar(Math.min(1.6, 1.0 / k)); });
    const pm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.45, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.1 }); // car paint: base coat + clear coat
    kit[type] = { pg, rg, gg, lg, pm };
  }
  kit.restMat = rm; kit.glassMat = gm; kit.lampMat = lm; return kit;
}
export class CarSet {
  // slots: [{type, x, z, yaw, color}]
  constructor(scene, kit, slots) {
    this.scene = scene; this.kit = kit; this.slots = slots.map((s, i) => Object.assign({ i, vis: true, col: new THREE.Color(s.color) }, s)); this.meshes = [];
    const types = [...new Set(slots.map((s) => s.type))];
    for (const t of types) {
      const mine = this.slots.filter((s) => s.type === t); const k = kit[t]; if (!k) continue;
      const mk = (geo, mat, nm) => { if (!geo) return null; const m = new THREE.InstancedMesh(geo, mat, mine.length); m.frustumCulled = false; m.name = 'CARS_' + nm + '_' + t; this.meshes.push(m); scene.add(m); return m; };
      const pm = mk(k.pg, k.pm, 'paint'), rest = [mk(k.rg, kit.restMat, 'rest'), mk(k.gg, kit.glassMat, 'glass'), mk(k.lg, kit.lampMat, 'lamp')].filter(Boolean);
      mine.forEach((s, j) => { s.j = j; s.pm = pm; s.rest = rest; });
    }
    // soft contact shadow under every car (one instanced quad)
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 64, 4, 32, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace; this.shadowMat = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const sg = new THREE.PlaneGeometry(2.6, 5.4); sg.rotateX(-Math.PI / 2); this.shadow = new THREE.InstancedMesh(sg, this.shadowMat, this.slots.length); this.shadow.renderOrder = 1; this.shadow.frustumCulled = false; scene.add(this.shadow);
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.z = new THREE.Matrix4().makeScale(0, 0, 0); this.up = new THREE.Vector3(0, 1, 0);
    for (const s of this.slots) this.write(s);
  }
  write(s) {
    if (!s.pm) return; if (s.vis) { this.q.setFromAxisAngle(this.up, s.yaw); this.m.compose(new THREE.Vector3(s.x, 0, s.z), this.q, new THREE.Vector3(1, 1, 1)); } else this.m.copy(this.z);
    s.pm.setMatrixAt(s.j, this.m); s.pm.setColorAt(s.j, s.col); s.pm.instanceMatrix.needsUpdate = true; if (s.pm.instanceColor) s.pm.instanceColor.needsUpdate = true;
    for (const r of s.rest) { r.setMatrixAt(s.j, this.m); r.instanceMatrix.needsUpdate = true; }
    if (this.shadow) { if (s.vis) this.m.elements[13] = 0.03; this.shadow.setMatrixAt(s.i, this.m); this.shadow.instanceMatrix.needsUpdate = true; }
    if (s.ov) { s.ov.visible = s.vis && s.ovOn; s.ov.position.set(s.x, 0, s.z); s.ov.rotation.y = s.yaw; }
  }
  overlay(s) { // charred skin over a burning car's paint (own material, so it can glow and fade in)
    if (s.ov) return s.ov; const k = this.kit[s.type]; const mat = new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.92, metalness: 0.05, emissive: 0xff4a08, emissiveIntensity: 0, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(k.pg, mat); m.scale.setScalar(1.012); m.renderOrder = 5; m.frustumCulled = false; m.visible = false; this.scene.add(m); s.ov = m; s.ovOn = false; return m;
  }
  handle(i, base, char) { // adapter with the interface View/FX expect
    const s = this.slots[i], me = this; const b = new THREE.Color(base), c = new THREE.Color(char);
    return { group: { get visible() { return s.vis; }, set visible(v) { if (s.vis !== v) { s.vis = v; me.write(s); } } }, base: b, char: c, paint: null,
      burn(a, t) { const ov = me.overlay(s); const on = a > 0.001; if (s.ovOn !== on) { s.ovOn = on; me.write(s); } const mt = ov.material; mt.opacity = Math.min(0.93, a * 1.5); mt.emissiveIntensity = a * (0.12 + 0.08 * Math.sin(t * 9) * Math.sin(t * 5.3)); const q = Math.round(a * 40); if (this._bq !== q) { this._bq = q; s.col.copy(b).lerp(c, a * 0.9); me.write(s); } },
      reset() { this._bq = -1; s.col.copy(b); s.ovOn = false; me.write(s); } };
  }
}

// ------------------------------------------------------------------ people: all skinned prims -> ONE skinned mesh with baked vertex colours
export function mergePerson(gltf) {
  const scene = gltf.scene; const sk = []; scene.traverse((o) => { if (o.isSkinnedMesh) sk.push(o); }); if (sk.length < 2) return false;
  scene.updateMatrixWorld(true);
  const parts = []; const shirt = [0, 0]; let vcount = 0; const first = sk[0];
  for (const o of sk) {
    const g = o.geometry; const multi = Array.isArray(o.material); const mats = multi ? o.material : [o.material];
    const groups = multi && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) { const mat = mats[gr.materialIndex] || mats[0]; const p = { mesh: o, geo: g, group: gr, mat, rel: new THREE.Matrix4() }; parts.push(p); }
  }
  // build, remembering the vertex range of the shirt
  const geos = []; for (const p of parts) { const gg = extract(p, (m) => (/shirt/i.test(m.name) ? new THREE.Color(1, 1, 1) : partColor(m)), true); if (/shirt/i.test(p.mat.name)) { shirt[0] = vcount; shirt[1] = vcount + gg.attributes.position.count; } vcount += gg.attributes.position.count; geos.push(gg); }
  const merged = mergeGeometries(geos, false); merged.userData.shirt = shirt;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0, transparent: true });
  const mesh = new THREE.SkinnedMesh(merged, mat); mesh.name = 'P_Merged'; mesh.bind(first.skeleton, first.bindMatrix); mesh.frustumCulled = false;
  const par = first.parent; for (const o of sk) o.parent.remove(o); par.add(mesh); return true;
}

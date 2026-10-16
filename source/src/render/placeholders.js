// Placeholder geometry used until the Blender glTF assets exist. Same node names / anchors as SPEC.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NODE_DEFS, CARS, DEFAULT_SPAWNS, rampZ } from '../sim/world.js';

const W3 = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
const col = (g, hex) => { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };

class Merger {
  constructor() { this.l = {}; }
  push(key, g, hex) { col(g, hex); (this.l[key] = this.l[key] || []).push(g); }
  box(key, w, h, d, x, y, z, hex, ry = 0, rx = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); this.push(key, g, hex); }
  cyl(key, r, len, axis, x, y, z, hex, seg = 10) { const g = new THREE.CylinderGeometry(r, r, len, seg); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2); g.translate(x, y, z); this.push(key, g, hex); }
  build(mats) { const out = []; for (const k in this.l) { const m = new THREE.Mesh(mergeGeometries(this.l[k], false), mats[k]); m.name = 'static_' + k; out.push(m); } return out; }
}

function floorTexture() {
  const S = 64, cw = 28 * S, ch = 20 * S; const c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
  const X = (x) => (x + 14) * S, Y = (y) => (10 - y) * S;
  g.fillStyle = '#585c64'; g.fillRect(0, 0, cw, ch);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${(Math.random() * 0.05).toFixed(3)})`; const r = 6 + Math.random() * 60; g.beginPath(); g.arc(Math.random() * cw, Math.random() * ch, r, 0, 7); g.fill(); }
  // stalls (parking rows)
  g.fillStyle = '#4a4e56'; g.fillRect(X(-13.5), Y(10), 9 * S, 20 * S); g.fillRect(X(4.5), Y(10), 9 * S, 20 * S);
  // EV stalls (blue)
  g.fillStyle = 'rgba(40,110,210,0.55)'; for (const [x0, y0] of [[-13.5, 5], [-13.5, -7.5], [4.5, 5], [4.5, -7.5]]) g.fillRect(X(x0), Y(y0 + 2.5), 9 * S, 2.5 * S);
  g.strokeStyle = '#d9dde3'; g.lineWidth = 5;
  for (let k = 0; k <= 8; k++) { const y = -10 + 2.5 * k; for (const [a, b] of [[-13.5, -4.5], [4.5, 13.5]]) { g.beginPath(); g.moveTo(X(a), Y(y)); g.lineTo(X(b), Y(y)); g.stroke(); } }
  // walking lanes (doors / SOS) marked green-hatched
  g.fillStyle = 'rgba(70,170,110,0.28)'; for (const y of [8, -8, 0]) { g.fillRect(X(-13.9), Y(y + 0.7), 9.9 * S, 1.4 * S); g.fillRect(X(4), Y(y + 0.7), 9.9 * S, 1.4 * S); }
  g.fillStyle = 'rgba(240,200,40,0.3)'; for (const sx of [-13.9, 10.8]) g.fillRect(X(sx), Y(2.2), 3.1 * S, 4.4 * S);
  // aisle: yellow edge lines + arrows
  g.strokeStyle = '#e6c23a'; g.lineWidth = 6; g.setLineDash([40, 28]); for (const x of [-4, 4]) { g.beginPath(); g.moveTo(X(x), Y(-9.6)); g.lineTo(X(x), Y(10)); g.stroke(); } g.setLineDash([]);
  g.fillStyle = '#e9edf2'; for (const x of [-2, 2]) for (const y of [-7, -1, 5]) { g.beginPath(); g.moveTo(X(x), Y(y + 1.2)); g.lineTo(X(x + 0.5), Y(y + 0.3)); g.lineTo(X(x + 0.18), Y(y + 0.3)); g.lineTo(X(x + 0.18), Y(y - 1)); g.lineTo(X(x - 0.18), Y(y - 1)); g.lineTo(X(x - 0.18), Y(y + 0.3)); g.lineTo(X(x - 0.5), Y(y + 0.3)); g.closePath(); g.fill(); }
  g.font = '700 150px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.14)'; g.textAlign = 'center'; g.fillText('B3', X(0), Y(-3));
  // refuge room floor
  g.fillStyle = '#3f6f55'; g.fillRect(X(-1.6), Y(-10), 3.2 * S, 2.6 * S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function rampTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = '#3d4047'; g.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,255,255,${(Math.random() * 0.04).toFixed(3)})`; g.fillRect(Math.random() * 256, Math.random() * 1024, 12, 12); }
  g.strokeStyle = '#e6c23a'; g.lineWidth = 6; g.setLineDash([46, 30]); g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 1024); g.stroke(); g.setLineDash([]);
  g.strokeStyle = '#d6dae0'; g.lineWidth = 5; for (const x of [10, 246]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------- cars
const PROF = {
  CAR_EV_HATCH: { L: 4.3, Wd: 1.85, pts: [[-2.15, 0.3], [-2.15, 0.95], [-1.95, 1.12], [-1.2, 1.52], [0.45, 1.52], [1.25, 1.12], [2.0, 0.9], [2.15, 0.62], [2.15, 0.3]], win: [-1.05, 1.4, 0.7, 1.4] },
  CAR_SEDAN: { L: 4.7, Wd: 1.85, pts: [[-2.35, 0.3], [-2.35, 0.9], [-2.1, 1.0], [-1.0, 1.45], [0.6, 1.45], [1.15, 1.05], [2.1, 0.92], [2.35, 0.6], [2.35, 0.3]], win: [-0.9, 1.3, 0.55, 1.3] },
  CAR_SUV: { L: 4.8, Wd: 1.95, pts: [[-2.4, 0.38], [-2.4, 1.3], [-2.2, 1.7], [0.9, 1.78], [1.45, 1.4], [2.25, 1.1], [2.4, 0.75], [2.4, 0.38]], win: [-1.9, 1.55, 1.0, 1.65] },
};
export const FILL_CARS = [[-6.8, 3.5, 'CAR_SEDAN'], [-11.5, 3.5, 'CAR_SUV'], [-6.8, -3.5, 'CAR_SUV'], [-11.5, -3.5, 'CAR_SEDAN'], [6.8, 3.5, 'CAR_EV_HATCH'], [11.5, 3.5, 'CAR_SEDAN'], [6.8, -3.5, 'CAR_SEDAN'], [11.5, -3.5, 'CAR_EV_HATCH'], [-6.8, -6.5, 'CAR_EV_HATCH'], [6.8, 6.5, 'CAR_SUV']];
export function makeCarTemplate(type) {
  const P = PROF[type]; const grp = new THREE.Group(); grp.name = type;
  const shp = new THREE.Shape(); P.pts.forEach(([x, y], i) => (i ? shp.lineTo(x, y) : shp.moveTo(x, y))); shp.closePath();
  const dep = P.Wd - 0.2; let body = new THREE.ExtrudeGeometry(shp, { depth: dep, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2, steps: 1 });
  body.translate(0, 0, -dep / 2); body.rotateY(Math.PI / 2);   // length axis X -> -Z (front at -Z)
  const paint = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.55, roughness: 0.32 })); paint.material.name = 'Paint'; paint.name = type + '_body'; grp.add(paint);
  const gl = []; const [wz0, wz1, wy0, wy1] = P.win;
  const side = (s) => { const g = new THREE.BoxGeometry(0.03, wy1 - wy0 - 0.12, (wz1 - wz0) * 0.95); g.translate(s * (P.Wd / 2 + 0.01), (wy0 + wy1) / 2 - 0.03, -(wz0 + wz1) / 2); return g; };
  gl.push(side(1), side(-1));
  const ws = new THREE.BoxGeometry(P.Wd - 0.3, 0.03, 0.8); ws.rotateX(0.62); ws.translate(0, (wy0 + wy1) / 2 + 0.05, -(wz1 + 0.06)); gl.push(ws);
  const glass = new THREE.Mesh(mergeGeometries(gl), new THREE.MeshStandardMaterial({ color: 0x0b1118, metalness: 0.9, roughness: 0.08 })); glass.material.name = 'Glass'; grp.add(glass);
  const tr = []; for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14); g.rotateZ(Math.PI / 2); g.translate(sx * (P.Wd / 2 - 0.08), 0.34, sz * (P.L / 2 - 0.85)); tr.push(g); }
  const ll = new THREE.BoxGeometry(P.Wd - 0.4, 0.1, 0.05); ll.translate(0, 0.62, P.L / 2 - 0.02); tr.push(ll);
  const trim = new THREE.Mesh(mergeGeometries(tr), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.8 })); trim.material.name = 'Trim'; grp.add(trim);
  return grp;
}

// ---------- the lot
export function buildPlaceholderLot(carTemplates) {
  const root = new THREE.Group(); root.name = 'LOT_PLACEHOLDER'; const M = new Merger();
  const mats = { std: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }), lamp: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 20), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.82, metalness: 0.05 })); floor.rotation.x = -Math.PI / 2; floor.name = 'floor'; root.add(floor);
  const rt = rampTexture(); const rmat = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.85 });
  const ang = Math.atan(0.32), len = Math.hypot(30, 9.6);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, len), rmat); ramp.position.set(0, 4.8 - 0.15, -26); ramp.rotation.x = ang; ramp.name = 'ramp_floor'; root.add(ramp);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 1.0), rmat); apron.position.set(0, -0.15, -10.5); root.add(apron);
  const WALL = 0xaeb3ba, DARK = 0x30343b;
  // walls
  M.box('std', 0.3, 3.2, 20.6, -14.15, 1.6, 0, WALL); M.box('std', 0.3, 3.2, 20.6, 14.15, 1.6, 0, WALL);
  M.box('std', 10.5, 3.2, 0.3, -8.75, 1.6, -10.15, WALL); M.box('std', 10.5, 3.2, 0.3, 8.75, 1.6, -10.15, WALL); // back wall (y=10) with 7 m opening
  M.box('std', 9.2, 1.0, 0.3, -9.4, 0.5, 10.15, WALL); M.box('std', 9.2, 1.0, 0.3, 9.4, 0.5, 10.15, WALL);          // low front wall (y=-10)
  M.box('std', 1.2, 0.4, 0.3, 0, 0.8, 10.15, WALL);
  // ramp walls
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.3, 1.8, len); g.rotateX(ang); g.translate(s * 3.65, 4.8 + 0.75, -26); M.push('std', g, WALL); }
  // Q room (behind low front wall; camera side)
  for (const s of [-1, 1]) M.box('std', 0.2, 1.0, 2.7, s * 1.7, 0.5, 11.35, WALL); M.box('std', 3.6, 1.0, 0.2, 0, 0.5, 12.7, WALL);
  // pillars with safety bands
  for (const id of ['A', 'B', 'C', 'D']) { const d = NODE_DEFS[id]; M.box('std', 0.8, 3.2, 0.8, d.x, 1.6, -d.y, 0x9aa0a8); M.box('std', 0.84, 0.5, 0.84, d.x, 0.25, -d.y, 0xe6c23a); M.box('std', 0.5, 0.06, 0.84, d.x, 0.25, -d.y, 0x181818); }
  // ceiling beams / pipes / lamps (kept off the centre so the top view stays clear)
  for (const y of [9.2, -9.2]) M.box('std', 28, 0.3, 0.3, 0, 3.05, -y, DARK);
  for (const x of [-13, 13]) M.cyl('std', 0.13, 20, 'z', x, 2.85, 0, 0x2a6fb0); for (const x of [-12.4, 12.4]) M.cyl('std', 0.09, 20, 'z', x, 2.95, 0, 0xb04a2a);
  for (const x of [-9, 9]) for (const y of [-8, -2.7, 2.7, 8]) M.box('lamp', 0.18, 0.05, 1.6, x, 3.1, -y, 0xfff2d0);
  for (const x of [-2.5, 2.5]) for (const y of [-7, 0, 7]) M.box('lamp', 0.16, 0.05, 1.8, x, 3.1, -y, 0xfff2d0);
  // doors / signs / sos (dynamic named meshes)
  const dyn = (name, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); root.add(m); return m; };
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3f7f5a, roughness: 0.6 });
  for (const id of ['E1', 'E2', 'E3', 'E4']) {
    const d = NODE_DEFS[id], sx = d.x < 0 ? 1 : -1;
    dyn('DOOR_' + id, new THREE.BoxGeometry(0.1, 2.1, 1.1), doorMat, d.x - sx * 0.02, 1.05, -d.y);
    dyn('SIGN_' + id, new THREE.BoxGeometry(0.06, 0.3, 0.72), new THREE.MeshBasicMaterial({ color: 0x20d060 }), d.x + sx * 0.05, 2.5, -d.y);
    M.box('std', 0.12, 2.3, 1.4, d.x - sx * 0.1, 1.15, -d.y, 0x70757d);
  }
  for (const id of ['S1', 'S2']) {
    const d = NODE_DEFS[id], sx = d.x < 0 ? 1 : -1;
    dyn('SOS_' + id, new THREE.BoxGeometry(0.22, 0.62, 0.42), new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 }), d.x + sx * 0.14, 1.4, -d.y);
    M.cyl('std', 0.09, 0.08, 'x', d.x + sx * 0.28, 1.45, -d.y, 0xf5f5f5);
    dyn('BEACON_' + id, new THREE.CylinderGeometry(0.1, 0.12, 0.18, 12), new THREE.MeshBasicMaterial({ color: 0x223355 }), d.x + sx * 0.14, 1.95, -d.y);
  }
  dyn('DOOR_Q', new THREE.BoxGeometry(1.1, 0.95, 0.1), doorMat, 0, 0.5, 10.05);
  // ramp sensor nodes
  for (const id of ['R0', 'R1', 'R2', 'R3']) { const d = NODE_DEFS[id]; dyn('RS_' + id, new THREE.BoxGeometry(0.18, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x20d060 }), -3.45, d.z + 1.6, -d.y); }
  // ramp exit light (daylight)
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.6), new THREE.MeshBasicMaterial({ color: 0xcfe6ff })); sky.position.set(0, 9.6 + 1.7, -41.4); sky.name = 'ExitLight'; root.add(sky);
  // pillar OLED + LED
  for (const id of ['A', 'B', 'C', 'D']) {
    const d = NODE_DEFS[id], nx = d.nrm[0]; const ox = d.x + nx * 0.405;
    const o = dyn('OLED_' + id, new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshBasicMaterial({ color: 0x050a10 }), ox, 2.1, -d.y); o.rotation.y = nx > 0 ? Math.PI / 2 : -Math.PI / 2;
    M.box('std', 0.03, 0.42, 0.7, d.x + nx * 0.4, 2.1, -d.y, 0x111317);
    const l = dyn('LED_' + id, new THREE.PlaneGeometry(0.12, 1.5), new THREE.MeshBasicMaterial({ color: 0x103018 }), ox, 1.05, -d.y); l.rotation.y = nx > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // parked filler cars (merged static)
  const rnd = [0xd6d9de, 0x2e3440, 0x8c2f2f, 0x6f7a86, 0xc9c0a8, 0x305f8f];
  const fill = FILL_CARS;
  const _unused = [[-6.8, 3.5, 'CAR_SEDAN'], [-11.5, 3.5, 'CAR_SUV'], [-6.8, -3.5, 'CAR_SUV'], [-11.5, -3.5, 'CAR_SEDAN'], [6.8, 3.5, 'CAR_EV_HATCH'], [11.5, 3.5, 'CAR_SEDAN'], [6.8, -3.5, 'CAR_SEDAN'], [11.5, -3.5, 'CAR_EV_HATCH'], [-6.8, -6.5, 'CAR_EV_HATCH'], [6.8, 6.5, 'CAR_SUV']];
  const fillG = { paint: [], glass: [], trim: [] };
  fill.forEach(([x, y, type], i) => {
    const t = carTemplates[type]; const yaw = x < 0 ? -Math.PI / 2 : Math.PI / 2; const m4 = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, -y);
    t.children.forEach((ch, k) => { const g = ch.geometry.clone().applyMatrix4(m4); const key = ['paint', 'glass', 'trim'][k]; col(g, key === 'paint' ? rnd[i % rnd.length] : 0xffffff); fillG[key].push(g); });
  });
  const fp = new THREE.Mesh(mergeGeometries(fillG.paint), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.35 })); fp.name = 'static_cars_paint'; root.add(fp);
  const fg = new THREE.Mesh(mergeGeometries(fillG.glass), new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x0b1118, metalness: 0.9, roughness: 0.1 })); root.add(fg);
  const ft = new THREE.Mesh(mergeGeometries(fillG.trim), new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x16181c, roughness: 0.8 })); root.add(ft);
  for (const m of M.build(mats)) root.add(m);
  // anchors
  const anc = (n, x, y, z = 0) => { const o = new THREE.Object3D(); o.name = 'ANCHOR_' + n; o.position.copy(W3(x, y, z)); root.add(o); };
  for (const id in NODE_DEFS) { const d = NODE_DEFS[id]; anc(id, d.x, d.y, d.z || 0); }
  for (const id in CARS) anc(id, CARS[id].x, CARS[id].y);
  DEFAULT_SPAWNS.forEach((p, i) => anc('spawn_' + (i + 1), p[0], p[1]));
  return root;
}

// ---------- skinned placeholder person (same animation names as SPEC)
export function makePlaceholderPerson() {
  const bones = {}; const mk = (name, x, y, z, parent) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); bones[name] = b; return b; };
  const hips = mk('Hips', 0, 0.95, 0), spine = mk('Spine', 0, 0.2, 0, hips), head = mk('Head', 0, 0.4, 0, spine);
  const armL = mk('ArmL', -0.23, 0.33, 0, spine), armR = mk('ArmR', 0.23, 0.33, 0, spine), legL = mk('LegL', -0.1, 0, 0, hips), legR = mk('LegR', 0.1, 0, 0, hips);
  const order = [hips, spine, head, armL, armR, legL, legR]; const idx = Object.fromEntries(order.map((b, i) => [b.name, i]));
  const shirt = [], body = [];
  const part = (arr, g, bone, hex) => { col(g, hex); const n = g.attributes.position.count; const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = idx[bone]; sw[i * 4] = 1; } g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); arr.push(g); };
  const bx = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const cap = (r, l, x, y, z) => { const g = new THREE.CapsuleGeometry(r, l, 3, 8); g.translate(x, y, z); return g; };
  part(shirt, cap(0.17, 0.3, 0, 1.3, 0), 'Spine', 0xffffff);
  part(shirt, cap(0.052, 0.25, -0.23, 1.2, 0), 'ArmL', 0xffffff); part(shirt, cap(0.052, 0.25, 0.23, 1.2, 0), 'ArmR', 0xffffff);
  part(body, cap(0.15, 0.05, 0, 1.02, 0), 'Hips', 0x2b3342);
  const hg = new THREE.SphereGeometry(0.115, 12, 10); hg.translate(0, 1.62, 0); part(body, hg, 'Head', 0xe0b48f);
  part(body, bx(0.05, 0.05, 0.07, 0, 1.6, -0.12), 'Head', 0xd09a76);   // nose: marks front (-Z)
  part(body, bx(0.2, 0.06, 0.2, 0, 1.73, 0.01), 'Head', 0x2a2018);        // hair
  part(body, cap(0.065, 0.55, -0.1, 0.45, 0), 'LegL', 0x2b3342); part(body, cap(0.065, 0.55, 0.1, 0.45, 0), 'LegR', 0x2b3342);
  part(body, bx(0.1, 0.07, 0.24, -0.1, 0.05, -0.04), 'LegL', 0x1a1a1a); part(body, bx(0.1, 0.07, 0.24, 0.1, 0.05, -0.04), 'LegR', 0x1a1a1a);
  const g1 = mergeGeometries(shirt), g2 = mergeGeometries(body); const geo = mergeGeometries([g1, g2], true);
  const m1 = new THREE.MeshStandardMaterial({ color: 0x2f7ad0, roughness: 0.8 }); m1.name = 'Shirt'; const m2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const mesh = new THREE.SkinnedMesh(geo, [m1, m2]); mesh.name = 'PersonMesh'; mesh.frustumCulled = false;
  const grp = new THREE.Group(); grp.name = 'person'; grp.add(hips); grp.add(mesh); grp.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(order));
  // clips
  const D = Math.PI / 180; const q = (ax, ang) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang * D);
  const qt = (name, times, angs) => { const v = []; angs.forEach((a) => { const Q = q(0, a); v.push(Q.x, Q.y, Q.z, Q.w); }); return new THREE.QuaternionKeyframeTrack(name + '.quaternion', times, v); };
  const vt = (name, times, ys) => new THREE.VectorKeyframeTrack(name + '.position', times, ys.flat());
  const cycle = (dur, n) => Array.from({ length: n + 1 }, (_, i) => (dur * i) / n);
  const sw = (amp, off, phase, n) => Array.from({ length: n + 1 }, (_, i) => off + amp * Math.sin((2 * Math.PI * i) / n + phase));
  const clips = [];
  { const n = 8, T = cycle(0.62, n); clips.push(new THREE.AnimationClip('Run', 0.62, [qt('LegL', T, sw(55, 0, 0, n)), qt('LegR', T, sw(55, 0, Math.PI, n)), qt('ArmL', T, sw(60, 15, Math.PI, n)), qt('ArmR', T, sw(60, 15, 0, n)), qt('Spine', T, sw(2, -14, 0, n)), vt('Hips', T, Array.from({ length: n + 1 }, (_, i) => [0, 0.95 + 0.035 * Math.cos((4 * Math.PI * i) / n), 0]))])); }
  { const n = 8, T = cycle(1.0, n); clips.push(new THREE.AnimationClip('CrouchWalk', 1.0, [qt('LegL', T, sw(26, 46, 0, n)), qt('LegR', T, sw(26, 46, Math.PI, n)), qt('ArmL', T, sw(25, 35, Math.PI, n)), qt('ArmR', T, sw(25, 35, 0, n)), qt('Spine', T, sw(2, -42, 0, n)), qt('Head', T, sw(1, 30, 0, n)), vt('Hips', T, Array.from({ length: n + 1 }, (_, i) => [0, 0.66 + 0.02 * Math.cos((4 * Math.PI * i) / n), 0.34]))])); }
  { const n = 6, T = cycle(3.2, n); clips.push(new THREE.AnimationClip('Idle', 3.2, [qt('Spine', T, sw(1.5, 0, 0, n)), qt('ArmL', T, sw(2, 4, 0, n)), qt('ArmR', T, sw(2, 4, 1, n)), qt('LegL', T, sw(0, 0, 0, n)), qt('LegR', T, sw(0, 0, 0, n)), qt('Head', T, sw(2, 0, 0, n)), vt('Hips', T, Array.from({ length: n + 1 }, () => [0, 0.95, 0]))])); }
  { const n = 8, T = cycle(1.6, n); const pr = Array.from({ length: n + 1 }, (_, i) => (i % 4 < 2 ? 88 : 70)); clips.push(new THREE.AnimationClip('PressButton', 1.6, [qt('ArmR', T, pr), qt('ArmL', T, sw(2, 6, 0, n)), qt('Spine', T, sw(1, -8, 0, n)), qt('LegL', T, sw(0, 0, 0, n)), qt('LegR', T, sw(0, 0, 0, n)), qt('Head', T, sw(1, 0, 0, n)), vt('Hips', T, Array.from({ length: n + 1 }, () => [0, 0.95, 0]))])); }
  { const n = 6, T = cycle(2.6, n); clips.push(new THREE.AnimationClip('WaitCrouch', 2.6, [qt('LegL', T, sw(1, 74, 0, n)), qt('LegR', T, sw(1, 74, 1, n)), qt('ArmL', T, sw(3, 55, 0, n)), qt('ArmR', T, sw(3, 55, 2, n)), qt('Spine', T, sw(3, -48, 0, n)), qt('Head', T, sw(2, 40, 0, n)), vt('Hips', T, Array.from({ length: n + 1 }, () => [0, 0.5, 0.42]))])); }
  return { scene: grp, animations: clips, placeholder: true };
}

export function makeCarTemplates() { const o = {}; for (const k of Object.keys(PROF)) o[k] = makeCarTemplate(k); return o; }

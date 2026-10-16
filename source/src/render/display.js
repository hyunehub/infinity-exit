// Dynamic displays driven by sim state: OLED canvases, LED bars, exit signs, beacons, ramp sensor meshes, doors.
import * as THREE from 'three';
import { NODE_DEFS, NODE_NAME } from '../sim/world.js';

const COL = { green: 0x2cff80, orange: 0xff9a1f, red: 0xff3030, blue: 0x3a7bff, off: 0x16261c };
const TXT = { stairs: '#5dffa8', ramp: '#5dffa8', caution: '#ffb347', alert: '#ffb347', isolation: '#7fb0ff', refuge: '#7fb0ff', stay: '#7fb0ff', none: '#8ea0b2' };

function fitText(g, s, maxW, size, weight = 700) { let f = size; g.font = `${weight} ${f}px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif`; while (g.measureText(s).width > maxW && f > 12) { f -= 2; g.font = `${weight} ${f}px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif`; } }
function arrow(g, cx, cy, r, ang, color) {
  g.save(); g.translate(cx, cy); g.rotate(ang); g.fillStyle = color; g.beginPath();
  g.moveTo(0, -r); g.lineTo(r * 0.75, -r * 0.05); g.lineTo(r * 0.3, -r * 0.05); g.lineTo(r * 0.3, r * 0.9); g.lineTo(-r * 0.3, r * 0.9); g.lineTo(-r * 0.3, -r * 0.05); g.lineTo(-r * 0.75, -r * 0.05); g.closePath(); g.fill(); g.restore();
}
export function drawOLED(g, W, H, d) {
  g.fillStyle = '#02060a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#13202c'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
  g.textBaseline = 'middle'; g.textAlign = 'left';
  const col = d.color;
  if (d.power) {
    g.fillStyle = '#ffd24a'; fitText(g, '배터리 모드', W - 20, 20); g.fillText('배터리 모드', 12, 20);
    if (d.arrow != null) arrow(g, W * 0.5, H * 0.58, H * 0.36, d.arrow, col); else { g.fillStyle = col; fitText(g, d.l0, W - 24, 34); g.fillText(d.l0, 12, H * 0.6); }
    return;
  }
  if (d.arrow != null) { arrow(g, W * 0.2, H * 0.5, H * 0.3, d.arrow, col); }
  const x0 = d.arrow != null ? W * 0.38 : 14, mw = W - x0 - 10;
  g.fillStyle = col; fitText(g, d.l0, mw, 30); g.fillText(d.l0, x0, H * 0.28);
  g.fillStyle = '#d6e6f2'; fitText(g, d.l1, mw, 22, 500); g.fillText(d.l1, x0, H * 0.54);
  if (d.l2) { g.fillStyle = d.l2c || '#ff8a7a'; fitText(g, d.l2, mw, 19, 500); g.fillText(d.l2, x0, H * 0.8); }
}

export class Display {
  constructor(scene, sim, opts = {}) {
    this.sim = sim; this.scene = scene; this.t = 0; this.opts = opts;
    this.oled = {}; this.led = {}; this.sign = {}; this.beacon = {}; this.rs = {}; this.doors = {};
    const find = (n) => scene.getObjectByName(n);
    for (const id of ['A', 'B', 'C', 'D']) {
      const m = find('OLED_' + id); if (m) { const c = document.createElement('canvas'); c.width = 320; c.height = 176; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; if (opts.glbUV) tex.flipY = false; if (opts.oledFlip) { tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; } m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); m.renderOrder = 10; this.oled[id] = { m, c, g: c.getContext('2d'), tex, key: '' }; }
      const l = find('LED_' + id); if (l) { const st = this.stripe(); const mat = new THREE.MeshBasicMaterial({ color: COL.off, map: st, toneMapped: false }); l.material = mat; l.renderOrder = 10; this.led[id] = { m: l, mat, tex: st }; }
    }
    for (const id of ['E1', 'E2', 'E3', 'E4']) {
      const s = find('SIGN_' + id); if (s) { s.material = new THREE.MeshBasicMaterial({ color: 0x20d060, toneMapped: false, map: s.material && s.material.map ? s.material.map : null }); s.renderOrder = 10; this.sign[id] = s; }
      const d = find('DOOR_' + id); if (d) this.doors[id] = this.mkDoor(d, NODE_DEFS[id].x < 0 ? 1 : -1, 'x');
    }
    const q = find('DOOR_Q'); if (q) this.doors.Q = this.mkDoor(q, 1, 'z');
    for (const id of ['S1', 'S2']) { const b = find('BEACON_' + id); if (b) { b.material = new THREE.MeshBasicMaterial({ color: 0x223355, toneMapped: false }); b.renderOrder = 10; this.beacon[id] = b; } }
    for (const id of ['R0', 'R1', 'R2', 'R3']) { const r = find('RS_' + id); if (r) { r.material = new THREE.MeshBasicMaterial({ color: COL.green, toneMapped: false }); r.renderOrder = 10; this.rs[id] = r; } }
    // red X over closed exit signs
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.strokeStyle = '#ff2a2a'; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.moveTo(18, 18); g.lineTo(110, 110); g.moveTo(110, 18); g.lineTo(18, 110); g.stroke();
    const xt = new THREE.CanvasTexture(c); xt.colorSpace = THREE.SRGBColorSpace;
    this.xm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: xt, transparent: true, toneMapped: false, depthWrite: false }), 4); this.xm.frustumCulled = false; this.xm.renderOrder = 11; scene.add(this.xm);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._z = new THREE.Matrix4().makeScale(0, 0, 0);
  }
  stripe() { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 4); t.colorSpace = THREE.SRGBColorSpace; return t; }
  mkDoor(mesh, interior, axis) {
    try {
      mesh.updateWorldMatrix(true, false); const box = new THREE.Box3().setFromObject(mesh); const par = mesh.parent; const hinge = new THREE.Vector3(); const ctr = box.getCenter(new THREE.Vector3());
      if (axis === 'x') hinge.set(ctr.x, box.min.y, box.min.z); else hinge.set(box.min.x, box.min.y, ctr.z);
      const piv = new THREE.Group(); piv.name = 'PIV_' + mesh.name; par.worldToLocal(hinge); piv.position.copy(hinge); par.add(piv); piv.attach(mesh);
      const rel = axis === 'x' ? (ctr.z - (hinge.z)) : (ctr.x - hinge.x);
      const ang = axis === 'x' ? interior * Math.sign(rel || 1) * 1.45 : Math.sign(rel || 1) * 1.45;
      return { piv, ang, v: 0 };
    } catch (e) { return null; }
  }
  setLED(id, color, flow, blink) { const l = this.led[id]; if (!l) return; l.mat.color.setHex(color); l.flow = flow; l.blink = blink; }
  update(dt) {
    this.t += dt; const sim = this.sim, now = sim.t;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    // OLEDs + LEDs
    let sosLine = '';
    const sn = ['S1', 'S2'].filter((s) => sim.sos[s].n > 0).map((s) => `${s}(${sim.sos[s].n}명)`); const qn = sim.sos.Q.n;
    if (sn.length || qn) sosLine = 'SOS 대기 ' + (sim.sos.S1.n + sim.sos.S2.n + qn) + '명';
    for (const id in this.oled) {
      const o = this.oled[id], n = sim.nodes[id], dec = n.dec; const power = !sim.power;
      let d;
      if (!n.alive) d = { l0: '신호 없음', l1: '노드 소실', l2: '', color: '#667', arrow: null, power: false };
      else if (!dec) d = { l0: '정상', l1: '', l2: '', color: TXT.none, arrow: null, power };
      else {
        let ang = null;
        if (dec.dir != null && ['stairs', 'ramp', 'caution', 'isolation', 'refuge'].includes(dec.mode)) { const nr = n.def.nrm; const fx = -nr[0], fy = -nr[1]; const dx = Math.cos(dec.dir), dy = Math.sin(dec.dir); ang = Math.atan2(dx * fy - dy * fx, dx * fx + dy * fy); }
        d = { l0: dec.text[0], l1: dec.text[1], l2: dec.text[2], color: TXT[dec.mode] || TXT.none, arrow: ang, power };
        if (sosLine && ['isolation', 'refuge', 'stay'].includes(dec.mode)) { d.l2 = sosLine; d.l2c = '#8fb8ff'; }
      }
      const key = d.l0 + '|' + d.l1 + '|' + d.l2 + '|' + d.color + '|' + (d.arrow == null ? 'n' : Math.round(d.arrow * 12 / Math.PI)) + '|' + d.power;
      if (key !== o.key) { o.key = key; drawOLED(o.g, 320, 176, d); o.tex.needsUpdate = true; }
      const l = this.led[id];
      if (l) {
        let c = COL[dec ? dec.led : 'off'], flow = dec && ['green', 'orange'].includes(dec.led), bl = dec && dec.led === 'blue';
        if (n.fires && n.fires.length) { c = COL.red; flow = false; bl = true; }
        if (!n.alive) { c = 0x222222; flow = false; bl = false; }
        const on = !bl || blink; l.mat.color.setHex(on ? c : COL.off); l.tex.offset.y = flow ? -((this.t * 1.2) % 1) : 0; l.mat.opacity = 1;
      }
    }
    // exit signs
    let xi = 0;
    for (const id of ['E1', 'E2', 'E3', 'E4']) {
      const st = sim.exitDisplay()[id].s; const s = this.sign[id]; const col = st === 'closed' ? 0xff3030 : st === 'caution' ? 0xffb020 : 0x20d060;
      if (s) { s.material.color.setHex(col); s.visible = true; }
      const d = NODE_DEFS[id]; const sx = d.x < 0 ? 1 : -1;
      if (st === 'closed') { this._v.set(d.x + sx * 0.1, 2.5, -d.y); this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sx > 0 ? Math.PI / 2 : -Math.PI / 2); this._s.set(1, 1, 1); this._m.compose(this._v, this._q, this._s); this.xm.setMatrixAt(xi, this._m); } else this.xm.setMatrixAt(xi, this._z);
      xi++;
    }
    this.xm.instanceMatrix.needsUpdate = true;
    // beacons
    for (const id in this.beacon) { const b = this.beacon[id]; const act = sim.sos[id].n > 0; const on = Math.floor(this.t * 5) % 2 === 0; b.material.color.setHex(act ? (on ? 0x4aa0ff : 0xffffff) : 0x1c2a46); }
    // ramp sensors
    for (const id in this.rs) {
      const n = sim.nodes[id]; let c = COL.green; const stg = n.dec ? 0 : 0; const st = Math.max(n.stage, 0);
      if (!n.ok) c = 0x555a60; else if (st >= 2) c = COL.red; else if (st === 1) c = COL.orange; else c = COL.green;
      this.rs[id].material.color.setHex(c);
    }
    // doors
    for (const id in this.doors) {
      const d = this.doors[id]; if (!d) continue; let target = 0;
      if (id === 'Q') target = sim.qDoorClosed ? 0 : 1; else target = (now - sim.doorFlash[id] < 2.2 && sim.doorFlash[id] >= 0) ? 0.85 : 0;
      d.v += (target - d.v) * Math.min(1, dt * 5); d.piv.rotation.y = d.ang * d.v;
    }
  }
}
export { COL };

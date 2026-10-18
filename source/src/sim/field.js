// Two-layer smoke field over lot + ramp. c = ceiling-layer attenuation (%/m), th = layer thickness from ceiling (m).
import { FIRE_R } from './world.js';
export const FCS = 0.5, FX0 = -14, FY0 = -10, FW = 56, FH = 103; // y up to 41.5
const N = FW * FH;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Field {
  constructor() {
    this.c = new Float32Array(N); this.th = new Float32Array(N);
    this.c2 = new Float32Array(N); this.th2 = new Float32Array(N);
    this.ux = new Float32Array(N); this.uy = new Float32Array(N);       // ceiling-layer base airflow (m/s)
    this.jx = new Float32Array(N); this.jy = new Float32Array(N);       // ceiling-jet from fires (scaled by growth)
    this.air = new Uint8Array(N);
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const x = FX0 + (i + 0.5) * FCS, y = FY0 + (j + 0.5) * FCS; this.air[j * FW + i] = (y <= 10 || Math.abs(x) <= 3.5) ? 1 : 0; }
    this.version = 0; this.wind = [0, 0]; this.fires = []; this.forces = []; this.srcScale = 1; this.jetK = 0;
    this.vents = []; this.jets = [];   // ceiling vents {x,y,q} (q>0 supply, q<0 exhaust, m3/s-ish) and jet fans {x,y,dx,dy,v}
    this.S = 6.0;  // source strength
    this.D = 0.3; this.lambda = 0.0015; this.g = 0.016;
    this.rebuildFlow();
  }
  clear() { this.c.fill(0); this.th.fill(0); this.version++; }
  idx(x, y) { const i = Math.floor((x - FX0) / FCS), j = Math.floor((y - FY0) / FCS); return (i < 0 || j < 0 || i >= FW || j >= FH) ? -1 : j * FW + i; }
  setWind(w) { this.wind = w; this.rebuildFlow(); }
  setFires(f) { this.fires = f; this.rebuildFlow(); }
  // ventilation: vents push air away (supply) or draw it in (exhaust); jet fans blow a band of air along the aisle
  setVent(vents, jets) { this.vents = vents; this.jets = jets; this.rebuildFlow(); }
  ventAt(x, y, vents = this.vents, jets = this.jets) { // airflow added by vents and jet fans at (x,y), on the lot floor only
    let ux = 0, uy = 0; if (y > 10) return [0, 0];
    for (const v of vents) { if (!v.q) continue; const dx = x - v.x, dy = y - v.y, d = Math.hypot(dx, dy) + 1e-3; const m = v.q / (2 * Math.PI * Math.max(d, 1.2)) * Math.exp(-d / 16); ux += dx / d * m; uy += dy / d * m; }
    for (const j of jets) { if (!j.v) continue; const ax = x - j.x, ay = y - j.y, along = ax * j.dx + ay * j.dy, side = Math.abs(-ax * j.dy + ay * j.dx); if (along < -1.5 || along > 22 || side > 6) continue; const m = j.v * Math.exp(-Math.max(0, along) / 14) * (1 - side / 6) * (along < 0 ? (along + 1.5) / 1.5 : 1); ux += j.dx * m; uy += j.dy * m; }
    return [ux, uy];
  }
  baseAt(x, y) {
    const [wx, wy] = this.wind;
    if (y > 10) return [0, 0.9 + wy * 0.6];                         // ramp: exhaust draft (chimney)
    const dx = 0 - x, dy = 10 - y, d = Math.hypot(dx, dy) + 1e-3, m = 0.45 / (1 + d / 14);
    let ux = dx / d * m + wx, uy = dy / d * m + wy;
    if (y > 7 && Math.abs(x) < 4) uy += 0.4;                        // converge into the mouth
    return [ux, uy];
  }
  rebuildFlow() {
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const k = j * FW + i; if (!this.air[k]) { this.ux[k] = this.uy[k] = this.jx[k] = this.jy[k] = 0; continue; }
      const x = FX0 + (i + 0.5) * FCS, y = FY0 + (j + 0.5) * FCS;
      let [ux, uy] = this.baseAt(x, y);
      if (this.vents.length || this.jets.length) { const [vx, vy] = this.ventAt(x, y); ux += vx; uy += vy; }
      this.ux[k] = ux; this.uy[k] = uy;
      let jx = 0, jy = 0;
      for (const f of this.fires) { const dx = x - f.x, dy = y - f.y, d = Math.hypot(dx, dy) + 1e-3, m = 1.1 * Math.exp(-d / 6); jx += dx / d * m; jy += dy / d * m; }
      this.jx[k] = jx; this.jy[k] = jy;
    }
  }
  seedBlob(cx, cy, c0, sigma, th0) {
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const k = j * FW + i; if (!this.air[k] || FY0 + (j + .5) * FCS > 10) continue; const x = FX0 + (i + .5) * FCS, y = FY0 + (j + .5) * FCS; const g = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma)); const v = c0 * g; if (v > this.c[k]) { this.c[k] = v; this.th[k] = Math.max(this.th[k], th0 * Math.min(1, g * 1.6)); } }
    this.version++;
  }
  seedZone(r, c0, th0) { for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const k = j * FW + i, x = FX0 + (i + .5) * FCS, y = FY0 + (j + .5) * FCS; if (!this.air[k] || x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue; this.c[k] = Math.max(this.c[k], c0); this.th[k] = Math.max(this.th[k], th0); } this.version++; }
  seedAll(c0, th0, ymax = 10) { for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) { const k = j * FW + i; if (!this.air[k] || FY0 + (j + .5) * FCS > ymax) continue; this.c[k] = Math.max(this.c[k], c0); this.th[k] = Math.max(this.th[k], th0); } this.version++; }
  // bilinear sample with wall fallback
  _s(a, fx, fy, k0) { // bilinear sample; cells outside the air (walls) take the value of the cell we sample for
    const x = fx - 0.5, y = fy - 0.5, i0 = Math.floor(x), j0 = Math.floor(y), tx = x - i0, ty = y - j0, air = this.air, d = a[k0];
    let v00 = d, v10 = d, v01 = d, v11 = d;
    if (j0 >= 0 && j0 < FH) { const r = j0 * FW; if (i0 >= 0 && i0 < FW && air[r + i0]) v00 = a[r + i0]; if (i0 + 1 >= 0 && i0 + 1 < FW && air[r + i0 + 1]) v10 = a[r + i0 + 1]; } else if (j0 >= FH) { v00 = 0; v10 = 0; }
    if (j0 + 1 >= 0 && j0 + 1 < FH) { const r = (j0 + 1) * FW; if (i0 >= 0 && i0 < FW && air[r + i0]) v01 = a[r + i0]; if (i0 + 1 >= 0 && i0 + 1 < FW && air[r + i0 + 1]) v11 = a[r + i0 + 1]; } else if (j0 + 1 >= FH) { v01 = 0; v11 = 0; }
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  }
  step(dt, t) {
    const { c, th, c2, th2, air } = this; const J = this.jetK;
    // sources
    for (const f of this.fires) {
      const age = t - f.t0; if (age < 0) continue; const gr = Math.min(1, (age / 40) ** 2 + 0.04);
      const R = 1.4, i0 = Math.floor((f.x - R - FX0) / FCS), i1 = Math.floor((f.x + R - FX0) / FCS), j0 = Math.floor((f.y - R - FY0) / FCS), j1 = Math.floor((f.y + R - FY0) / FCS);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (i < 0 || j < 0 || i >= FW || j >= FH) continue; const k = j * FW + i; if (!air[k]) continue; const d = Math.hypot(FX0 + (i + .5) * FCS - f.x, FY0 + (j + .5) * FCS - f.y); if (d > R) continue; const w = 1 - d / R; c[k] += this.S * this.srcScale * gr * w * dt; th[k] = Math.min(3.1, th[k] + 0.35 * this.srcScale * gr * w * dt); }
    }
    // advection (semi-Lagrangian) + diffusion + decay
    const Dk = this.D * dt / (FCS * FCS), Dt = Dk * 0.4, lam = Math.exp(-this.lambda * dt);
    for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
      const k = j * FW + i; if (!air[k]) { c2[k] = 0; th2[k] = 0; continue; }
      const vx = this.ux[k] + J * this.jx[k], vy = this.uy[k] + J * this.jy[k];
      const fx = i + 0.5 - vx * dt / FCS, fy = j + 0.5 - vy * dt / FCS;
      let cv = this._s(c, fx, fy, k), tv = this._s(th, fx, fy, k);
      // diffusion
      let sc = 0, st = 0, nn = 0;
      if (i > 0 && air[k - 1]) { sc += c[k - 1]; st += th[k - 1]; nn++; }
      if (i < FW - 1 && air[k + 1]) { sc += c[k + 1]; st += th[k + 1]; nn++; }
      if (j > 0 && air[k - FW]) { sc += c[k - FW]; st += th[k - FW]; nn++; }
      if (j < FH - 1 && air[k + FW]) { sc += c[k + FW]; st += th[k + FW]; nn++; }
      cv += Dk * (sc - nn * c[k]); tv += Dt * (st - nn * th[k]);
      cv *= lam;
      // layer descent
      if (cv > 1.0) tv += this.g * Math.min(1.5, cv / 3) * dt; else if (cv < 0.4) tv -= 0.03 * dt;
      c2[k] = cv < 0.01 ? 0 : cv; th2[k] = clamp(tv, 0, 3.15);
    }
    this.c.set(c2); this.th.set(th2);
    // forcing regions (manual condition overrides)
    const shield = this.vents.filter((v) => v.protect && v.q > 0.3).map((v) => v.protect); // fresh air pushes the drifting smoke back out of a sheltered area
    for (const r of this.forces) {
      const i0 = Math.max(0, Math.floor((r.x0 - FX0) / FCS)), i1 = Math.min(FW - 1, Math.floor((r.x1 - FX0) / FCS)), j0 = Math.max(0, Math.floor((r.y0 - FY0) / FCS)), j1 = Math.min(FH - 1, Math.floor((r.y1 - FY0) / FCS));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * FW + i; if (!air[k]) continue; if (shield.length && r.cMin !== undefined && shield.some((q) => { const x = FX0 + (i + .5) * FCS, y = FY0 + (j + .5) * FCS; return x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1; })) continue; if (r.cMax !== undefined) { if (c[k] > r.cMax) c[k] = r.cMax; if (r.cMax < 1) th[k] = Math.min(th[k], 0.5); } if (r.cMin !== undefined && c[k] < r.cMin) { c[k] += (r.cMin - c[k]) * 0.25; th[k] = Math.max(th[k], r.th || 0); } }
    }
    // exhaust vents take smoke out of the ceiling layer (and the layer lifts back up);
    // supply vents dilute it with fresh air (a little less near the grille than an exhaust takes out)
    for (const v of this.vents) { if (Math.abs(v.q) < 0.3) continue; const Q = v.q < 0 ? -v.q : v.q * 0.7, R = 3.6, k0 = Q * 0.035 * dt;
      if (v.zone) { const z = v.zone, kz = Math.exp(-Q * 0.003 * dt); // the zone's exhaust duct has grilles across the whole zone
        for (let j = Math.max(0, Math.floor((z.y0 - FY0) / FCS)); j <= Math.min(FH - 1, Math.floor((z.y1 - FY0) / FCS)); j++) for (let i = Math.max(0, Math.floor((z.x0 - FX0) / FCS)); i <= Math.min(FW - 1, Math.floor((z.x1 - FX0) / FCS)); i++) { const k = j * FW + i; if (air[k]) { c[k] *= kz; } } } const i0 = Math.max(0, Math.floor((v.x - R - FX0) / FCS)), i1 = Math.min(FW - 1, Math.floor((v.x + R - FX0) / FCS)), j0 = Math.max(0, Math.floor((v.y - R - FY0) / FCS)), j1 = Math.min(FH - 1, Math.floor((v.y + R - FY0) / FCS));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * FW + i; if (!air[k]) continue; const d = Math.hypot(FX0 + (i + .5) * FCS - v.x, FY0 + (j + .5) * FCS - v.y); if (d > R) continue; const w = 1 - d / R; c[k] *= Math.exp(-k0 * w); th[k] = Math.max(0, th[k] - 0.05 * k0 * w); } }
    this.version++;
  }
  // derived sensor readings at (x,y)
  read(x, y, out) {
    x = Math.max(FX0 + 0.26, Math.min(FX0 + FW * FCS - 0.26, x)); // wall-mounted sensors (x = +-14) read the cell just inside the wall
    const k = this.idx(x, y); if (k < 0 || !this.air[k]) { out.ceil = 0; out.low = 0; out.th = 0; out.c = 0; return out; }
    const fx = (x - FX0) / FCS, fy = (y - FY0) / FCS; const c = this._s(this.c, fx, fy, k), th = this._s(this.th, fx, fy, k);
    out.c = c; out.th = th; out.ceil = c * sstep(0.15, 0.85, th); out.low = c * 0.92 * sstep(1.5, 2.3, th); return out;
  }
  temp(x, y, t, fires, out) {
    let T = 20;
    for (const f of fires) { const a = t - f.t0; if (a < 0) continue; const d = Math.hypot(x - f.x, y - f.y); T += 520 * Math.exp(-((d / 2.4) ** 2)) * Math.min(1, a / 25) + 30 * Math.exp(-d / 9) * Math.min(1, a / 40); }
    return T + 0.8 * out.ceil;
  }
}
export { sstep, clamp };

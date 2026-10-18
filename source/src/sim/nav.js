// Grid navigation (0.5 m cells) with Dijkstra, smoke-cost, hard hazard (danger circle) blocking and LOS path smoothing.
import { NODE_DEFS } from './world.js';

export const CS = 0.5, GX0 = -14, GY0 = -13, GW = 56, GH = 110;
const SQ2 = Math.SQRT2;

export class Nav {
  constructor() {
    const n = GW * GH;
    this.n = n; this.walk = new Uint8Array(n);
    this.dist = new Float32Array(n); this.prev = new Int32Array(n);
    this.heapK = new Float32Array(n * 6); this.heapV = new Int32Array(n * 6); this.hn = 0;
    const R = (x0, x1, y0, y1) => { for (let j = 0; j < GH; j++) { const y = GY0 + (j + 0.5) * CS; if (y < y0 || y > y1) continue; for (let i = 0; i < GW; i++) { const x = GX0 + (i + 0.5) * CS; if (x >= x0 && x <= x1) this.walk[j * GW + i] = 1; } } };
    R(-4, 4, -9.6, 10);                       // central aisle
    for (const s of [-1, 1]) {
      const a = s < 0 ? -13.9 : 4, b = s < 0 ? -4 : 13.9;
      R(a, b, 7.7, 8.7); R(a, b, -8.7, -7.7); R(a, b, -0.7, 0.7);       // door + SOS lanes
      const w0 = s < 0 ? -13.9 : 9.4, w1 = s < 0 ? -9.4 : 13.9; R(w0, w1, -2.0, 2.0); // SOS waiting areas
    }
    R(-1.6, 1.6, -12.6, -9.6);                // refuge room Q
    R(-3.3, 3.3, 10, 41.8);                   // ramp
    this.nearNode = null; this.baseWalk = this.walk.slice();
  }
  // parked cars: their footprint plus a body radius is not walkable, so routes go around them instead of grazing corners
  setBlocked(rects, pad = 0.33) {
    this.walk.set(this.baseWalk);
    for (const o of rects) for (let c = 0; c < this.n; c++) { if (!this.walk[c]) continue; if (Math.abs(this.cx(c) - o.x) < o.hx + pad && Math.abs(this.cy(c) - o.y) < o.hy + pad) this.walk[c] = 0; }
  }
  idx(x, y) { const i = Math.floor((x - GX0) / CS), j = Math.floor((y - GY0) / CS); return (i < 0 || j < 0 || i >= GW || j >= GH) ? -1 : j * GW + i; }
  cx(c) { return GX0 + ((c % GW) + 0.5) * CS; }
  cy(c) { return GY0 + (((c / GW) | 0) + 0.5) * CS; }
  snap(x, y) {
    let c = this.idx(x, y); if (c >= 0 && this.walk[c]) return c;
    let best = -1, bd = 1e9;
    for (let c2 = 0; c2 < this.n; c2++) { if (!this.walk[c2]) continue; const dx = this.cx(c2) - x, dy = this.cy(c2) - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c2; } }
    return best;
  }
  // hazard field: hz[c] = min over hazards of (dist-to-center - r). out: Float32Array(n)
  hazardField(list, out) {
    out.fill(1e3);
    for (let k = 0; k < list.length; k++) {
      const h = list[k];
      for (let c = 0; c < this.n; c++) { if (!this.walk[c]) continue; const dx = this.cx(c) - h.x, dy = this.cy(c) - h.y, v = Math.sqrt(dx * dx + dy * dy) - h.r; if (v < out[c]) out[c] = v; }
    }
    return out;
  }
  // nearest node per walkable cell (for smoke stage lookup)
  buildNearNode(nodeIds) {
    this.nearNode = new Int8Array(this.n).fill(-1);
    for (let c = 0; c < this.n; c++) {
      if (!this.walk[c]) continue; const x = this.cx(c), y = this.cy(c); let bd = 1e9, bi = -1;
      for (let k = 0; k < nodeIds.length; k++) { const d = NODE_DEFS[nodeIds[k]]; const dx = d.x - x, dy = d.y - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bi = k; } }
      this.nearNode[c] = bi;
    }
  }
  // ---- heap
  _push(k, v) { let i = this.hn++; const K = this.heapK, V = this.heapV; while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; }
  _pop() { const K = this.heapK, V = this.heapV; const rv = V[0]; this._pk = K[0]; const lk = K[--this.hn], lv = V[this.hn]; let i = 0; const n = this.hn; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; return rv; }
  // Dijkstra from (sx,sy). hz: hazard field or null. stage: Uint8Array per-cell smoke stage (0..3) or null.
  run(sx, sy, hz, stage, margin = 0.4) {
    const { dist, prev, walk } = this; dist.fill(Infinity); prev.fill(-1);
    const s = this.snap(sx, sy); this.start = s; this.hn = 0; dist[s] = 0; this._push(0, s);
    const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
    while (this.hn > 0) {
      const u = this._pop(), d = this._pk; if (d > dist[u]) continue;
      const ui = u % GW, uj = (u / GW) | 0; const ub = hz && hz[u] < margin;
      for (let k = 0; k < 8; k++) {
        const o = nb[k], ni = ui + o[0], nj = uj + o[1]; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const v = nj * GW + ni; if (!walk[v]) continue;
        if (o[0] !== 0 && o[1] !== 0 && (!walk[uj * GW + ni] || !walk[nj * GW + ui])) continue;
        let inside = false;
        if (hz && hz[v] < margin) { if (!(ub && (hz[v] > hz[u] || hz[v] > 0.05))) continue; inside = true; } // already in the margin band: may move along it, never into the danger circle
        const len = o[2] * CS; let w = len * (1 + (stage ? 1.5 * stage[v] : 0)); if (inside) w += len * 3;
        const nd = d + w; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; this._push(nd, v); }
      }
    }
  }
  los(ax, ay, bx, by, hz, margin = 0.4) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / 0.2));
    for (let i = 1; i <= n; i++) { const c = this.idx(ax + dx * i / n, ay + dy * i / n); if (c < 0 || !this.walk[c]) return false; if (hz && hz[c] < margin && i > 1) { /* allow leaving only */ if (hz[c] < margin - 0.05) return false; } }
    return true;
  }
  // extract simplified polyline [x,y,...] to goal cell
  path(goal, hz, margin = 0.4) {
    if (!isFinite(this.dist[goal])) return null;
    const cells = []; for (let c = goal; c >= 0; c = this.prev[c]) cells.push(c); cells.reverse();
    const pts = []; let i = 0; pts.push(this.cx(cells[0]), this.cy(cells[0]));
    while (i < cells.length - 1) {
      let j = cells.length - 1; const ax = this.cx(cells[i]), ay = this.cy(cells[i]);
      while (j > i + 1 && !this.los(ax, ay, this.cx(cells[j]), this.cy(cells[j]), hz, margin)) j--;
      pts.push(this.cx(cells[j]), this.cy(cells[j])); i = j;
    }
    return pts;
  }
  cellForPoint(p) { return this.snap(p[0], p[1]); }
}

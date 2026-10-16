// World definition (SPEC coordinates: x right, y toward ramp, z up). Pure data, no DOM/three.
export const FIRE_R = 5;            // danger circle radius (m)
export const V_WALK = 1.4;          // nominal walking speed used for predictions (m/s)
export const HOP = 0.1;             // mesh hop delay (s)
export const DT = 0.05;             // fixed sim step (20 Hz)
export const DOOR_CAP = 1.2;        // stair fire-door throughput (persons/s, ~0.9 m leaf)
export const SWITCH_M = 3;          // an agent changes stair only if the new one is at least this much cheaper (m)

export const LOT = { x0: -14, x1: 14, y0: -10, y1: 10, h: 3.2 };
export const RAMP = { x0: -3.5, x1: 3.5, y0: 10, y1: 41.5, w: 7 };
export function rampZ(y) { return y <= 11 ? 0 : Math.min(9.6, (y - 11) * 0.32); }

// Sensor / guidance nodes -------------------------------------------------------
// t: pillar|hub|door|sos|refuge|ramp
export const NODE_DEFS = {
  A: { t: 'pillar', x: -7, y: 5, car: 'carA', zone: 'A', nrm: [1, 0], label: 'A' },
  B: { t: 'pillar', x: 7, y: 5, car: 'carB', zone: 'B', nrm: [-1, 0], label: 'B' },
  C: { t: 'pillar', x: -7, y: -5, car: 'carC', zone: 'C', nrm: [1, 0], label: 'C' },
  D: { t: 'pillar', x: 7, y: -5, car: 'carD', zone: 'D', nrm: [-1, 0], label: 'D' },
  M: { t: 'hub', x: 0, y: 0, nrm: [0, -1], label: 'M' },
  E1: { t: 'door', x: -14, y: 8, pillar: 'A', appr: [-13.5, 8], label: 'E1', n: 1 },
  E2: { t: 'door', x: 14, y: 8, pillar: 'B', appr: [13.5, 8], label: 'E2', n: 2 },
  E3: { t: 'door', x: -14, y: -8, pillar: 'C', appr: [-13.5, -8], label: 'E3', n: 3 },
  E4: { t: 'door', x: 14, y: -8, pillar: 'D', appr: [13.5, -8], label: 'E4', n: 4 },
  S1: { t: 'sos', x: -14, y: 0, appr: [-13.2, 0], label: 'S1', side: -1 },
  S2: { t: 'sos', x: 14, y: 0, appr: [13.2, 0], label: 'S2', side: 1 },
  Q: { t: 'refuge', x: 0, y: -10, appr: [0, -11.2], label: 'Q' },
  R0: { t: 'ramp', x: 0, y: 11, z: 0, label: 'R0' },
  R1: { t: 'ramp', x: 0, y: 21, z: 3.2, label: 'R1' },
  R2: { t: 'ramp', x: 0, y: 31, z: 6.4, label: 'R2' },
  R3: { t: 'ramp', x: 0, y: 41, z: 9.6, label: 'R3' },
};
export const NODE_IDS = Object.keys(NODE_DEFS);
export const PILLARS = ['A', 'B', 'C', 'D'];
export const DOORS = ['E1', 'E2', 'E3', 'E4'];
export const SOSS = ['S1', 'S2'];
export const RAMPN = ['R0', 'R1', 'R2', 'R3'];
export const GUIDE_NODES = ['A', 'B', 'C', 'D', 'M']; // nodes that compute full routes
export const MESH_EDGES = [
  ['M', 'A'], ['M', 'B'], ['M', 'C'], ['M', 'D'], ['A', 'B'], ['C', 'D'], ['A', 'C'], ['B', 'D'],
  ['A', 'E1'], ['B', 'E2'], ['C', 'E3'], ['D', 'E4'], ['A', 'S1'], ['C', 'S1'], ['B', 'S2'], ['D', 'S2'],
  ['M', 'R0'], ['A', 'R0'], ['B', 'R0'], ['R0', 'R1'], ['R1', 'R2'], ['R2', 'R3'],
  ['M', 'Q'], ['C', 'Q'], ['D', 'Q'],
];

export const CARS = {
  carA: { x: -10, y: 6.5, zone: 'A', type: 'CAR_EV_HATCH', color: 0x2c6fd6 },
  carB: { x: 10, y: 6.5, zone: 'B', type: 'CAR_EV_HATCH', color: 0xd8dde3 },
  carC: { x: -10, y: -6.5, zone: 'C', type: 'CAR_EV_HATCH', color: 0xe9e9e4 },
  carD: { x: 10, y: -6.5, zone: 'D', type: 'CAR_EV_HATCH', color: 0x3a3f48 },
  carR: { x: 2, y: 8.5, zone: 'R', type: 'CAR_EV_HATCH', color: 0xc9d3dc },
};
export const FIRE_KEYS = { A: 'carA', B: 'carB', C: 'carC', D: 'carD', R: 'carR' };
export const CAR_YAW = { carA: 0, carB: 0, carC: 0, carD: 0, carR: 0 }; // cosmetic only

export const DEFAULT_SPAWNS = [
  [-3, 7.5], [3, 6], [-3.2, 2.5], [0.5, 3.5], [3, -1], [-2.5, -3], [1, -6], [-3, -8], [3.2, -8.2],
  [-1, 8.2], [0, -1.5], [-2, 5.5],
];

// stair doors carry the letter of their zone (E1 in zone A ... E4 in zone D), as on the poster and the physical model
export const STAIR_ZONE = { E1: 'A', E2: 'B', E3: 'C', E4: 'D' };
export const NODE_NAME = (id) => (id === 'V' ? '경사로' : STAIR_ZONE[id] ? STAIR_ZONE[id] + ' 비상계단' : id);
export const rnd32 = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

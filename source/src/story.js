// Story mode: 6 curated scenarios, each played as 6 narrated chapters on top of the unchanged simulation.
import { Sim, modeText, whyText } from './sim/sim.js';
import { NODE_DEFS, NODE_NAME, CARS, STAIR_ZONE } from './sim/world.js';
import { TIME_K } from './sim/rescue.js';

export const CHAPTERS = ['화재 발생', '센서 감지', '정보 공유', '판단', '대피 행동', '결과'];
export const STORIES = [
  { preset: 0, title: '불이 막 났을 때', sub: '가까운 계단으로 바로 대피', tone: 'green',
    lesson: '출구가 열려 있으면 망설이지 말고, 불에서 먼 쪽의 가장 가까운 비상계단으로 바로 나갑니다.' },
  { preset: 1, title: '연기가 한쪽으로 퍼질 때', sub: '연기 쪽 출구는 미리 닫기', tone: 'amber',
    lesson: '연기가 퍼질 방향을 미리 계산해서, 연기가 닿기 전에 그쪽 출구를 닫고 반대편으로 안내합니다.' },
  { preset: 2, title: '계단이 모두 막혔을 때', sub: '경사로로 걸어서 대피', tone: 'green',
    lesson: '계단이 모두 막혀도 연기 없는 경사로가 있으면 걸어서 지상으로 나갑니다.' },
  { preset: 3, title: '경사로에도 연기가 있을 때', sub: 'SOS 누르고 구조 대기', tone: 'blue',
    lesson: '나갈 길이 없으면 연기 속으로 들어가지 말고, SOS를 누른 뒤 낮은 자세로 구조를 기다립니다.' },
  { preset: 4, title: '불난 차가 경사로를 막았을 때', sub: '불 옆으로 지나가지 않기', tone: 'blue',
    lesson: '불난 차에서 5 m 안으로는 지나가지 않습니다. 길이 막히면 SOS로 위치를 알리고 기다립니다.' },
  { preset: 8, title: '정전이 됐을 때', sub: '유도등 따라 낮은 자세로', tone: 'amber',
    lesson: '정전이 되어도 기둥 화면과 바닥 유도등이 배터리로 길을 안내합니다. 낮은 자세로 따라가세요.' },
];

const MODES_OK = ['stairs', 'ramp', 'caution', 'isolation', 'refuge', 'stay'];
const zl = (c) => [...c.fire].join(', ');
export const fireName = (c) => (c.fire === 'R' ? '경사로 앞 전기차 화재' : zl(c) + '구역 전기차 화재');
const fireCar = (c) => (c.fire === 'R' ? '경사로 앞 전기차' : zl(c) + '구역 전기차');

// run the same simulation headless once to find when things happen, so chapters follow real events
export function computeTimeline(preset, seed) {
  const s = new Sim(seed); s.preset(preset); const ev = {};
  for (let k = 0; k < 20 * 60; k++) {
    s.step(); const t = s.t;
    if (ev.det == null && Object.values(s.nodes).some((n) => Object.keys(n.knownFires).length)) ev.det = t;
    if (ev.M == null && Object.keys(s.nodes.M.knownFires).length) ev.M = t;
    if (ev.allP == null && ['A', 'B', 'C', 'D'].every((id) => Object.keys(s.nodes[id].knownFires).length)) ev.allP = t;
    if (ev.dec == null && ['A', 'B', 'C', 'D', 'M'].some((id) => s.nodes[id].dec && MODES_OK.includes(s.nodes[id].dec.mode))) ev.dec = t;
    if (ev.go == null && s.agents.some((a) => a.state === 'go')) ev.go = t;
    if (ev.settle == null && s.agents.every((a) => a.state === 'done' || a.state === 'wait')) { ev.settle = t; break; }
  }
  const det = ev.det != null ? ev.det : 0.6, M = ev.M != null ? ev.M : det + 0.1, all = Math.max(ev.allP != null ? ev.allP : M + 0.1, ev.dec || 0), go = ev.go != null ? ev.go : 2;
  const b = [0]; b.push(Math.max(0.25, det - 0.05)); b.push(Math.max(b[1] + 0.12, M + 0.02)); b.push(Math.max(b[2] + 0.12, all + 0.05)); b.push(Math.max(b[3] + 0.4, go - 0.1));
  const end = Math.min(ev.settle != null ? ev.settle : 40, 45); b.push(Math.max(b[4] + 3, end + 0.5));
  // real-time length of every chapter (s) – the simulation is slowed down so each chapter can be read
  const dur = [5, 5, 5, 6.5, Math.max(10, Math.min(24, (b[5] - b[4]) / 1.6))];
  return { b, dur, ev };
}

// ---------------------------------------------------------------- captions
const exName = (x) => NODE_NAME(x);
export function closedList(rec) { return Object.entries(rec.closed || {}).filter(([k]) => k !== 'V').map(([k, why]) => ({ id: k, why })); }
export function toneOf(k, rec) {
  if (k <= 2) return 'red';
  const m = rec.mode; if (m === 'stairs' || m === 'ramp') return 'green'; if (m === 'caution') return 'amber'; if (m === 'isolation' || m === 'refuge' || m === 'stay') return 'blue'; return 'amber';
}
const stairNums = (sim) => { const tg = new Set(); for (const id of ['A', 'B', 'C', 'D']) { const d = sim.nodes[id].dec; if (d && d.active && d.target) tg.add(d.target); } return [...tg].filter((x) => STAIR_ZONE[x]).map((x) => STAIR_ZONE[x]).sort(); };
const numList = (ns) => ns.join(', ');
// one plain sentence: what people are told to do
export function actionText(sim, rec) {
  const ns = stairNums(sim);
  switch (rec.mode) {
    case 'stairs': return ns.length ? numList(ns) + ' 비상계단으로 대피하라고 안내합니다.' : '경사로로 걸어서 나가라고 안내합니다.';
    case 'caution': return ns.length ? numList(ns) + ' 비상계단으로 자세를 낮추고 가라고 안내합니다.' : '자세를 낮추고 이동하라고 안내합니다.';
    case 'ramp': return '경사로로 걸어서 지상까지 나가라고 안내합니다.';
    case 'isolation': return '나갈 길이 없어서 SOS 버튼 앞에서 구조를 기다리라고 안내합니다.';
    case 'refuge': return '연기 차단 공간에 들어가 문을 닫고 기다리라고 안내합니다.';
    case 'stay': return '자리에서 자세를 낮추고 구조를 기다리라고 안내합니다.';
    default: return '센서 정보를 모으는 중입니다.';
  }
}

export function captionFor(sim, story, k) {
  const S = STORIES[story]; const rec = sim.recommend(); const tone = toneOf(k, rec); const n = sim.agents.length;
  const sos = ['isolation', 'refuge', 'stay'].includes(rec.mode); let text;
  switch (k) {
    case 0: text = fireCar(sim.cond) + '에서 불이 났습니다.'; break;
    case 1: text = '가장 가까운 기둥 센서가 연기와 열을 감지했습니다.'; break;
    case 2: text = '센서끼리 차례로 알려서 모두 같은 정보를 갖게 됩니다.'; break;
    case 3: text = actionText(sim, rec); break;
    case 4: { const wait = sim.agents.filter((a) => a.state === 'wait' || a.state === 'press').length;
      if (sos) text = wait ? n + '명 중 ' + wait + '명이 구조를 기다리는 자리에 도착했습니다.' : (rec.mode === 'refuge' ? '사람들이 연기 차단 공간으로 이동합니다.' : '사람들이 SOS 버튼 쪽으로 이동합니다.');
      else text = sim.stats.evac ? n + '명 중 ' + sim.stats.evac + '명이 밖으로 나갔습니다.' : (rec.mode === 'ramp' ? '사람들이 경사로로 걸어 올라갑니다.' : '사람들이 안내받은 비상계단으로 이동합니다.'); break; }
    default: { const R = sim.rescue, T = R.teams.find((t) => t.state !== 'standby'), wait = sim.agents.filter((a) => ['wait', 'press', 'rescued', 'follow'].includes(a.state)).length;
      if (R.doneAt != null) text = '119 구조대가 ' + R.rescued + '명을 모두 구조했습니다. ' + S.lesson;
      else if (T) text = { force: '구조대가 잠긴 비상계단 문을 열고 있습니다.', mask: '구조대가 면체를 쓰고 진입합니다. 관리실이 보낸 위치로 바로 갑니다.', approach: '구조대가 연기 속을 낮은 자세로 지나 요구조자에게 갑니다.', search: '위치 정보가 없어 벽을 따라 찾고 있습니다.', contact: '구조대가 도착해 보조 마스크를 씌우고 있습니다.', escort: '앞 사람 어깨를 잡고 한 줄로, 구조대가 들어온 길로 나갑니다.' }[T.state] || S.lesson;
      else if (wait && R.eta != null) text = '관리실이 위치와 연기 정보를 119에 보냈습니다. 구조대 도착까지 실제 약 ' + Math.max(1, Math.round((R.eta - sim.t) * TIME_K / 60)) + '분.';
      else text = S.lesson; }
  }
  return { text, tone, rec };
}

// ---------------------------------------------------------------- player
export class Story {
  constructor(sim, hooks) { this.sim = sim; this.h = hooks; this.active = false; this.k = 0; this.playing = true; this.story = 0; this.tl = null; this.seed = 7; }
  start(i) {
    this.story = i; this.active = true; this.tl = computeTimeline(STORIES[i].preset, this.seed); this.reset(); this.setChapter(0, true);
  }
  reset() { const sim = this.sim; sim.preset(STORIES[this.story].preset); this.h.afterReset(); }
  stop() { this.active = false; }
  segSim(k) { return [this.tl.b[k], k < 5 ? this.tl.b[k + 1] : this.tl.b[5]]; }
  setChapter(k, forceReset) {
    k = Math.max(0, Math.min(5, k)); const sim = this.sim; const t0 = this.tl.b[k];
    if (forceReset || sim.t > t0 + 1e-6) { this.reset(); }
    if (t0 > sim.t) sim.advance(t0 - sim.t);
    this.k = k; this.applySpeed(); sim.playing = this.playing; this.h.onChapter(k);
  }
  applySpeed() {
    const sim = this.sim, k = this.k; if (k >= 5) { sim.speed = ['isolation', 'refuge', 'stay'].includes(sim.recommend().mode) ? 2 : 1; return; } // waiting for the rescue team: play it at 2x
    const [a, b] = this.segSim(k); sim.speed = Math.max(0.02, (b - a) / this.tl.dur[k]);
  }
  next() { if (this.k < 5) this.setChapter(this.k + 1); }
  prev() { this.setChapter(this.k > 0 ? this.k - 1 : 0, this.k === 0); }
  toggle() { this.playing = !this.playing; this.sim.playing = this.playing; this.h.onPlay(this.playing); }
  home() { this.stop(); }
  // called every frame before the simulation advances
  update() {
    if (!this.active) return;
    const sim = this.sim; if (this.k >= 5) return;
    const [, b] = this.segSim(this.k); if (this.playing && sim.t >= b - 1e-6) { this.setChapter(this.k + 1); }
    this.sim.playing = this.playing;
  }
  progress() { if (this.k >= 5) return 1; const [a, b] = this.segSim(this.k); return Math.max(0, Math.min(1, (this.sim.t - a) / (b - a))); }
}

export { NODE_DEFS, CARS };

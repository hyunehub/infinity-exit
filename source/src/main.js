import { Sim, PRESETS, DEFAULT_COND, stText, whyText, modeText, ZONE_RECT } from './sim/sim.js';
import { NODE_DEFS, NODE_IDS, MESH_EDGES, NODE_NAME, DOORS, CARS, FIRE_KEYS, STAIR_ZONE, rampZ } from './sim/world.js';
import { TIME_K } from './sim/rescue.js';
import { FW, FH, FCS, FX0, FY0 } from './sim/field.js';
import { View } from './render/view.js';
import { loadAssets, embeddedNames, loadTimes } from './render/assets.js';

const $ = (id) => document.getElementById(id);
const P = new URLSearchParams(location.search);
const small = Math.min(innerWidth, innerHeight) < 700 || /Mobi|Android|iPhone/i.test(navigator.userAgent);
const qp = P.get('q'); const qlevel = qp === 'high' ? 0 : qp === 'mid' ? 2 : qp === 'low' ? 4 : null;
const sim = new Sim(+(P.get('seed') || 7));
const view = new View($('cv'), $('wrap'), sim, { small, qlevel: qlevel == null ? undefined : qlevel, qfixed: qlevel != null, pfront: P.get('pfront'), oledflip: P.get('oledflip') === '1' });
import { Box3, Vector3 } from 'three';
let mode = 'raw';
import { Story, STORIES, CHAPTERS, captionFor, fireName, toneOf, actionText } from './story.js';
import CASES from './cases.json';
import { nodePos } from './render/overlay.js';
window.__v4 = { sim, view, PRESETS, THREE: { Box3, Vector3 }, version: 4, boot: performance.now() };

// ------------------------------------------------------------------ UI: presets & conditions
const presetSel = $('preset'); presetSel.innerHTML = '<option value="-1">수동 (조건 직접 설정)</option>' + PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
const GROUPS = [
  { k: 'fire', label: '발화 위치', opts: [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'], ['R', '경사로 앞']] },
  { k: 'smoke', label: '주차장 연기', opts: [['auto', '자동'], ['none', '거의 없음'], ['ceil', '천장 축적'], ['dense', '짙음']] },
  { k: 'stairs', label: '비상계단', opts: [['auto', '자동'], ['ok', '가능'], ['partial', '일부 차단'], ['none', '전부 불가']], doors: true },
  { k: 'ramp', label: '차량 경사로', opts: [['auto', '자동'], ['ok', '통행 가능'], ['smoke', '연기 또는 확인 불가'], ['dense', '짙은 연기'], ['blocked', '화재차량으로 막힘']] },
  { k: 'refuge', label: '연기 차단 공간', opts: [['yes', '있음'], ['no', '없음'], ['unknown', '모름']] },
  { k: 'power', label: '전원', opts: [[true, '정상'], [false, '정전']] },
  { k: 'wind', label: '바람과 환기 방향', opts: [['auto', '자동(경사로 배기)'], ['right', '오른쪽 →'], ['left', '← 왼쪽'], ['up', '경사로 ↑'], ['down', '앞쪽 ↓']] },
  { k: 'lost', label: '기둥 노드 소실', opts: [[null, '없음'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']] },
  { k: 'car', label: '차 안 탑승자', opts: [[true, '있음'], [false, '없음']] },
];
const DOOR_ST = [null, 'ok', 'caution', 'locked', 'smoky']; const DOOR_LB = { null: '자동', ok: '정상', caution: '주의', locked: '잠김', smoky: '연기' };
const cond = $('cond'); let h = '<h2><span>조건 (직접 덮어쓰기)</span><button class="cx" id="condx" aria-label="조건 패널 닫기">✕</button></h2>';
for (const g of GROUPS) {
  h += `<div class="cg"><span class="lbl">${g.label}</span><div class="seg" data-k="${g.k}">` + g.opts.map(([v, t]) => `<button data-v="${String(v)}">${t}</button>`).join('') + '</div>';
  if (g.doors) h += '<div class="doors" id="doorsRow">' + DOORS.map((d) => `<button data-d="${d}" title="${d} 문 상태 (누르면 변경)"></button>`).join('') + '</div>';
  h += '</div>';
}
h += '<div class="rec" id="recBox"><b>권장 행동</b><span id="recTxt">-</span></div>';
cond.innerHTML = h;
const parseV = (s) => (s === 'true' ? true : s === 'false' ? false : s === 'null' ? null : s);
function refreshCond() {
  const c = sim.cond;
  cond.querySelectorAll('.seg').forEach((seg) => { const k = seg.dataset.k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(c[k]) === b.dataset.v)); });
  cond.querySelectorAll('#doorsRow button').forEach((b) => { const s = c.doors[b.dataset.d] || null; b.dataset.s = s || 'auto'; b.textContent = b.dataset.d + ' ' + DOOR_LB[s]; });
}
function afterReset() { view.syncSim(); refreshCond(); lastAlert = ''; $('alert').style.display = 'none'; if (view.ready) updateInfo(); }
cond.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.d) { const c = sim.cond.doors; const cur = c[b.dataset.d] || null; const nx = DOOR_ST[(DOOR_ST.indexOf(cur) + 1) % DOOR_ST.length]; sim.setCond({ doors: Object.assign({}, c, { [b.dataset.d]: nx }) }); presetSel.value = '-1'; refreshCond(); return; }
  const seg = b.closest('.seg'); if (!seg) return; const k = seg.dataset.k; const v = parseV(b.dataset.v);
  const patch = { [k]: v }; if (k === 'stairs') patch.doors = { E1: null, E2: null, E3: null, E4: null };
  presetSel.value = '-1'; sim.setCond(patch); afterReset(); if (!sim.playing) setPlaying(true);
});
presetSel.addEventListener('change', () => { const i = +presetSel.value; if (i >= 0) { sim.preset(i); afterReset(); setPlaying(true); } });
const playBtn = $('play');
function setPlaying(p) { sim.playing = p; playBtn.textContent = p ? '⏸ 일시정지' : '▶ 시작'; playBtn.classList.toggle('run', p); }
playBtn.onclick = () => setPlaying(!sim.playing);
$('reset').onclick = () => { const i = +presetSel.value; if (i >= 0) sim.preset(i); else sim.reset(Object.assign({}, sim.cond)); afterReset(); setPlaying(true); };
$('speed').onclick = () => { sim.speed = sim.speed === 1 ? 2 : 1; $('speed').textContent = 'x' + sim.speed; };
$('views').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; view.setView(b.dataset.v); $('views').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
$('views').querySelector('[data-v="over"]').classList.add('on');
const condbtn = $('condbtn'); const slot = $('condslot'); const wrap = $('wrap');
function inset() { applyInset(); }
condbtn.onclick = () => { cond.hidden = !cond.hidden; condbtn.setAttribute('aria-expanded', String(!cond.hidden)); inset(); };
const mq = matchMedia('(max-width:900px)');
function place() { if (mode === 'raw') { wrap.appendChild(cond); condbtn.style.display = ''; } }
// phones: the cases panels go below the 3D view instead of covering it
function placeCases() { const slot = $('casesSlot'), a = $('cases'); if (mq.matches) slot.append(a); else if (a.parentNode === slot) wrap.append(a); }
mq.addEventListener('change', () => { place(); placeCases(); inset(); }); place(); placeCases();
const cx = $('condx'); if (cx) cx.onclick = () => { cond.hidden = true; condbtn.setAttribute('aria-expanded', 'false'); inset(); };
view.inset = 0; setTimeout(inset, 0); addEventListener('resize', () => setTimeout(inset, 50));
$('smokeOp').oninput = (e) => { view.fx && (view.fx.opacity = e.target.value / 100); };
$('xray').onchange = (e) => { view.fx.xray = e.target.checked; };
$('flowOn').onchange = (e) => { view.fx.showFlow = e.target.checked; };
$('ringOn').onchange = (e) => { view.fx.showRing = e.target.checked; view.fx.syncFires(sim); };
$('meshOn').onchange = (e) => { view.meshov.setVisible(e.target.checked); };
$('slowMesh').onchange = (e) => { view.meshov.slow = e.target.checked ? 6 : 1; };

// ------------------------------------------------------------------ info strip
const exitsEl = $('exits'), stagesEl = $('stages'), progEl = $('prog'), soslEl = $('sosl'), loglEl = $('logl'), svg = $('meshsvg'); let lastAlert = '';
const SVGP = { A: [75, 52], B: [165, 52], C: [75, 125], D: [165, 125], M: [120, 88], E1: [22, 30], E2: [218, 30], E3: [22, 148], E4: [218, 148], S1: [22, 89], S2: [218, 89], Q: [120, 168], R0: [270, 24], R1: [270, 68], R2: [270, 112], R3: [270, 156] };
let sv = ''; for (const [a, b] of MESH_EDGES) sv += `<line data-e="${a}|${b}" x1="${SVGP[a][0]}" y1="${SVGP[a][1]}" x2="${SVGP[b][0]}" y2="${SVGP[b][1]}"/>`;
for (const id of NODE_IDS) sv += `<circle data-n="${id}" cx="${SVGP[id][0]}" cy="${SVGP[id][1]}" r="${/^(A|B|C|D|M)$/.test(id) ? 12 : 10}"/><text x="${SVGP[id][0]}" y="${SVGP[id][1]}">${id}</text>`;
sv += '<text class="sm" x="270" y="8">경사로</text><text class="sm" x="120" y="184">차단 공간</text>'; svg.innerHTML = sv;
const lines = {}; svg.querySelectorAll('line').forEach((l) => { lines[l.dataset.e] = l; }); const circs = {}; svg.querySelectorAll('circle').forEach((c) => { circs[c.dataset.n] = c; });
exitsEl.innerHTML = [...DOORS, 'V'].map((x) => `<div class="ex open" data-x="${x}"><b>${x === 'V' ? '경사로' : STAIR_ZONE[x] + ' 계단'}</b><span>개방</span><small></small></div>`).join('');
stagesEl.innerHTML = ['A', 'B', 'C', 'D', 'E1', 'E2', 'E3', 'E4', 'R0', 'R1', 'R2', 'R3'].map((id) => `<div class="sc s0" data-s="${id}">${id}<i>0</i></div>`).join('');
const oledEl = $('oleds'); const oledCv = {}; for (const id of ['A', 'B', 'C', 'D']) { const d = document.createElement('div'); const c = document.createElement('canvas'); c.width = 320; c.height = 176; d.appendChild(c); d.insertAdjacentHTML('beforeend', `<small>${id}</small>`); oledEl.appendChild(d); oledCv[id] = c.getContext('2d'); }
const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const stepEls = $('steps').children; let uiT = 0;
function updateInfo() {
  const rec = sim.recommend(); const hd = $('recHead'); hd.textContent = rec.head;
  hd.className = 'head ' + ({ stairs: 'go', ramp: 'go', caution: 'warn', isolation: 'sos', refuge: 'sos', stay: 'sos' }[rec.mode] || 'idle');
  $('recLines').innerHTML = rec.lines.map((l) => `<li>${l}</li>`).join('');
  $('recTxt').innerHTML = `<span style="color:var(--text)">${rec.head}</span>` + rec.lines.slice(0, 5).map((l) => `<br>${l}`).join('');
  exitsEl.querySelectorAll('.ex').forEach((el) => { const e = rec.exits[el.dataset.x]; el.className = 'ex ' + e.s; el.querySelector('span').textContent = stText(e.s); el.querySelector('small').textContent = e.s === 'open' ? '' : whyText(e.why); });
  for (const id in oledCv) { const o = view.display.oled[id]; if (o) oledCv[id].drawImage(o.c, 0, 0); }
  stagesEl.querySelectorAll('.sc').forEach((el) => { const n = sim.nodes[el.dataset.s]; const lost = !n.ok; el.className = 'sc s' + (lost ? 0 : n.stage) + (lost ? ' lost' : ''); el.querySelector('i').textContent = lost ? '×' : n.stage; });
  const st = sim.stats; const wait = sim.agents.filter((a) => a.state === 'wait' || a.state === 'press').length, alive = sim.agents.filter((a) => a.state !== 'done').length;
  progEl.innerHTML = `<span>대피 완료 <b>${st.evac}</b>/${sim.agents.length}</span><span>구조 대기 <b>${wait}</b></span><span>이동 중 <b>${sim.agents.filter((a) => a.state === 'go').length}</b></span><span>${modeText(rec.mode)}</span>`;
  soslEl.innerHTML = ['S1', 'S2', 'Q'].map((id) => `<div class="${sim.sos[id].n ? 'act' : ''}">${sim.sosLine(id)}</div>`).join('');
  loglEl.innerHTML = sim.log.slice(0, 9).map((l) => `<div><time>${fmt(l.t)}</time><span>${l.text}</span></div>`).join('');
  // steps overlay
  let anyFire = false, M = false; for (const id of NODE_IDS) if (Object.keys(sim.nodes[id].knownFires).length) { anyFire = true; if (id === 'M') M = true; }
  const guided = ['A', 'B', 'C', 'D', 'M'].some((id) => { const d = sim.nodes[id].dec; return d && ['stairs', 'ramp', 'caution', 'isolation', 'refuge', 'stay'].includes(d.mode); });
  const moving = sim.agents.some((a) => a.state === 'go' || a.state === 'press' || a.state === 'wait');
  [anyFire, M, guided, moving].forEach((v, i) => stepEls[i].classList.toggle('on', v));
  const al = $('alert'); const ss = ['S1', 'S2', 'Q'].map((id) => sim.sos[id].status); let msg = '';
  if (!sim.power) msg = '정전: 배터리 모드 안내'; else if (sim.rescue.teams.some((T) => T.state === 'escort')) msg = '구조대가 요구조자를 이송 중'; else if (sim.rescue.teams.some((T) => T.state !== 'standby')) msg = '구조대 진입, 요구조자에게 이동 중'; else if (ss.includes('rescue') || (sim.rescue.eta != null && ss.includes('acked'))) msg = '119 출동 중: 구조대가 오고 있습니다'; else if (ss.includes('acked')) msg = '관리실 → 119 구조 요청 접수'; else if (ss.includes('requested')) msg = 'SOS 요청을 보내는 중';
  else if (anyFire && ['stairs', 'ramp', 'caution', 'isolation', 'refuge', 'stay'].includes(rec.mode)) msg = modeText(rec.mode);
  if (msg !== lastAlert) { lastAlert = msg; al.textContent = msg; al.style.display = msg ? 'block' : 'none'; }
  $('clock').textContent = fmt(sim.t) + (sim.playing ? '' : '  일시정지');
  $('credit').dataset.k = '';
}
function updateMesh() {
  svg.querySelectorAll('line.on').forEach((l) => l.classList.remove('on'));
  for (const k of view.meshov.active || []) { const l = lines[k] || lines[k.split('|').reverse().join('|')]; if (l) l.classList.add('on'); }
  for (const [a, b] of MESH_EDGES) { const l = lines[a + '|' + b]; const dead = !(sim.nodes[a].ok && sim.nodes[b].ok); l.classList.toggle('dead', dead); }
  for (const id of NODE_IDS) { const n = sim.nodes[id]; const c = circs[id]; c.setAttribute('class', !n.ok ? 'lost' : (n.fires && n.fires.length) ? 'fire' : 's' + n.stage); }
}
setInterval(() => { if (!view.ready) return; updateInfo(); }, 250);
setInterval(() => { if (!view.ready) return; updateMesh(); }, 100);

// ------------------------------------------------------------------ v4 UX: landing / story / experiment
const app = $('app'), toolsEl = $('tools'), infoEl = $('info'), viewsEl = $('views'), slotTools = $('slotTools'), slotInfo = $('slotInfo'), setBody = $('setBody'), moreBody = $('moreBody');
const setCam = document.createElement('div'); setCam.innerHTML = '<div class="pr"><b>카메라</b></div>';
const speedRow = document.createElement('div'); speedRow.id = 'speed2'; speedRow.className = 'pr'; speedRow.innerHTML = '<b>속도</b>' + [0.5, 1, 2].map((v) => `<button data-sp="${v}">${v}×</button>`).join('');
setBody.append(setCam, speedRow);
speedRow.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sim.speed = +b.dataset.sp; speedRow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
const settingsEl = $('settings');
function openSettings(on) { settingsEl.classList.toggle('open', on); $('setBtn').setAttribute('aria-expanded', String(on)); }
$('setBtn').onclick = () => openSettings(!settingsEl.classList.contains('open'));
$('setX').onclick = () => openSettings(false);

let lastIns = '';
function applyInset() {
  const wr = wrap.getBoundingClientRect(); let px = 0, py = 0, L = 0;
  if (mode === 'raw') px = (!cond.hidden && !mq.matches) ? 270 : 0;
  else if (mode === 'story') {
    const r = $('cap').getBoundingClientRect();
    if (mq.matches) py = Math.max(0, wr.bottom - r.top - 8); else { L = r.right - wr.left + 8; px = Math.max(0, L - 234); py = 70; }
  } else if (mode === 'cases') {
    // desktop: the bar covers the top of the view, so shift the scene down by its height; phones: the bar sits below the view
    if (!mq.matches) { const r = $('cases').getBoundingClientRect(); py = Math.max(0, r.bottom - wr.top - 30); }
  } else if (mode === 'exp') {
    if (mq.matches) { const r = $('exp').getBoundingClientRect(); py = Math.max(0, wr.bottom - r.top - 8); } else { L = 316; px = L; }
  }
  wrap.style.setProperty('--inl', Math.round(L) + 'px');
  px = Math.round(px); py = Math.round(py); const key = px + ',' + py + ',' + wrap.clientWidth + ',' + wrap.clientHeight; if (key === lastIns) return; lastIns = key; view.setInset(px, py);
}

function mountDom(raw) {
  if (raw) { slotTools.after(toolsEl); slotInfo.after(infoEl); wrap.appendChild(viewsEl); place(); }
  else { setCam.appendChild(viewsEl); setBody.insertBefore(toolsEl, speedRow); moreBody.append(cond, infoEl); condbtn.style.display = 'none'; }
}
function setMode(m) {
  mode = m; for (const x of ['raw', 'landing', 'story', 'exp', 'cases', 'hl']) app.classList.toggle('mode-' + x, x === m || (x === 'exp' && m === 'cases'));
  app.classList.remove('show-result'); if (m !== 'story') app.classList.remove('cam-free');
  mountDom(m === 'raw'); $('modeStory').classList.toggle('on', m === 'landing' || m === 'story'); $('modeExp').classList.toggle('on', m === 'exp'); $('modeCases').classList.toggle('on', m === 'cases'); $('modeHl').classList.toggle('on', m === 'hl'); openSettings(false); if (m !== 'hl') hl.on = false;
  if (m !== 'raw') { sim.speed = 1; speedRow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', +x.dataset.sp === 1)); }
  lastIns = ''; applyInset();
}
function setLayers(o) {
  view.fx.showFlow = o.flow; view.fx.showRing = o.ring; view.fx.syncFires(sim); view.meshov.setVisible(o.mesh); view.arrows.mesh.visible = o.guide !== false;
  $('flowOn').checked = o.flow; $('ringOn').checked = o.ring; $('meshOn').checked = o.mesh; $('xray').checked = false; view.fx.xray = false; $('slowMesh').checked = false; view.meshov.slow = 1;
}

// ---- landing
$('cards').innerHTML = STORIES.map((s, i) => `<button class="card-b ${s.tone}" data-i="${i}" aria-label="${s.title}, ${s.sub}"><span class="ct">${s.title}</span><span class="cs">${s.sub}</span></button>`).join('');
$('cards').addEventListener('click', (e) => { const b = e.target.closest('.card-b'); if (b) startStory(+b.dataset.i); });
$('toExp').onclick = () => enterExp();
$('modeStory').onclick = () => enterLanding(); $('modeExp').onclick = () => enterExp(); $('modeCases').onclick = () => enterCases(); $('modeHl').onclick = () => startHl();
function enterLanding() {
  if (!view.ready) return; story.stop(); setMode('landing'); sim.preset(0); sim.advance(3.5); afterReset(); setPlaying(false);
  setLayers({ mesh: false, ring: false, flow: false }); showCallouts([]); view.tween = null; view.camState.view = 'over'; view.setView('over', true);
}

// ---- story
let camAuto = true, poseInstant = false;
const story = new Story(sim, { afterReset, onChapter: (k) => onChapter(k), onPlay: () => syncPlayBtn() });
const chs = $('chs'); chs.innerHTML = CHAPTERS.map((n, i) => `<div class="ch" data-k="${i}" role="button" tabindex="0"><i>0${i + 1}</i><span>${n}</span><u></u></div>`).join('');
chs.addEventListener('click', (e) => { const c = e.target.closest('.ch'); if (c && story.active) story.setChapter(+c.dataset.k, +c.dataset.k === story.k); });
function syncPlayBtn() { $('cPlay').textContent = story.playing ? '⏸ 일시정지' : '▶ 재생'; setPlaying(story.playing); }
$('cPrev').onclick = () => story.prev(); $('cNext').onclick = () => story.next(); $('cPlay').onclick = () => story.toggle();
$('rOther').onclick = () => enterLanding(); $('rAgain').onclick = () => startStory(story.story);
$('camAuto').onclick = () => { camAuto = true; app.classList.remove('cam-free'); poseTo(story.k, false); };
view.onUserMove = () => { if (mode === 'story' && camAuto) { camAuto = false; app.classList.add('cam-free'); } };
addEventListener('keydown', (e) => { if (mode !== 'story' || e.target.closest('button,select,input')) return; if (e.key === 'ArrowRight') story.next(); else if (e.key === 'ArrowLeft') story.prev(); else if (e.key === ' ') { e.preventDefault(); story.toggle(); } });

function startStory(i) {
  if (!view.ready) return; setMode('story'); camAuto = true; app.classList.remove('cam-free'); story.playing = true; showCallouts([]); poseInstant = true; story.start(i); syncPlayBtn();
}

const V3 = Vector3, tmpV = new V3();
const targetsOf = () => { const tg = []; for (const id of ['A', 'B', 'C', 'D']) { const d = sim.nodes[id].dec; if (d && d.active && d.target && !tg.includes(d.target)) tg.push(d.target); } return tg; };
function fireInfo() { const c = sim.cond, car = CARS[FIRE_KEYS[c.fire === 'R' ? 'R' : [...c.fire][0]]]; return { c, car, F: new V3(car.x, 0, -car.y), name: fireName(c) }; }
function overviewPose() {
  const a = view.camera.aspect, k = Math.max(1, Math.min(2.4, 1.55 / a));
  // portrait phones: keep the car park centred, the ramp may run off the top
  const t = a < 1 ? new V3(-1, 1, -6) : new V3(1, 1.5, -13), dir = new V3(0.4, 0.74, 0.58).normalize(); return { p: t.clone().addScaledVector(dir, 76 * k), t, fov: 38, full: false };
}
// every chapter uses the same three-quarter overview, so the whole car park and the ramp stay in view
function chapterPose() { return overviewPose(); }
function poseTo(k, instant) {
  const p = chapterPose(k); if (instant) { view.tween = null; view.camState.view = 'story'; view.camera.position.copy(p.p); view.controls.target.copy(p.t); view.camera.fov = p.fov || 42; view.camera.updateProjectionMatrix(); view.controls.update(); }
  else view.flyTo(p, 2.2);
}
const WHYS = { fire: '화재 5m 이내', predict: '연기 확산 방향', smoke: '연기 감지', door: '막힘', doorsmoke: '문 너머 연기', blocked: '차량이 막음', dense: '짙은 연기', smoke1: '옅은 연기' };
const why = (w) => WHYS[w] || whyText(w);
function layersFor(k) { const s = story.story; return { mesh: k === 2, guide: k >= 3, ring: k >= 1, flow: s === 1 && (k === 3 || k === 4) }; }
// where the smoke is on the floor plan: an in-zone cell near the middle of each zone (stage 1 = ceiling smoke, stage 2 = down to head height)
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function smokeSpots() {
  const F = sim.field, out = {}; const acc = [[0, 0, 0, []], [0, 0, 0, []]];
  for (let j = 0; j < FH; j += 2) for (let i = 0; i < FW; i += 2) { const k = j * FW + i; if (!F.air[k]) continue; const y = FY0 + (j + 0.5) * FCS; if (y > 10) continue; const x = FX0 + (i + 0.5) * FCS;
    const ce = F.c[k] * sst(0.15, 0.85, F.th[k]), lo = F.c[k] * 0.92 * sst(1.5, 2.3, F.th[k]); const st = lo >= 8 || ce >= 15 ? 2 : ce >= 3 ? 1 : 0; if (!st) continue;
    const a = acc[st - 1]; a[0] += x; a[1] += y; a[2]++; a[3].push([x, y]); }
  acc.forEach((a, q) => { if (a[2] < 10) return; const cx = a[0] / a[2], cy = a[1] / a[2]; let best = null, bd = 1e9; for (const p of a[3]) { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d < bd) { bd = d; best = p; } } out['s' + (q + 1)] = best; });
  return out;
}

function calloutSpecs(k) {
  const { c, car, name } = fireInfo(), rec = sim.recommend(), out = []; const tg = targetsOf();
  const fire = { key: 'fire', text: name, tone: 'red', v: new V3(car.x, 2.5, -car.y) };
  const at = (id) => nodePos(id, new V3());
  if (k === 0) out.push(fire);
  else if (k === 1) { const id = c.fire === 'R' ? 'R0' : c.fire; out.push(fire, { key: 'sensor', text: '센서가 화재 감지', tone: 'amber', v: at(id) }); }
  else if (k === 2) out.push(fire, { key: 'mesh', text: '센서끼리 정보 전달', tone: 'amber', v: at('M') });
  else if (k === 3) {
    out.push(fire); const sosish = ['isolation', 'stay', 'refuge'].includes(rec.mode);
    if (rec.closed && rec.closed.V) out.push({ key: 'xV', text: /smoke|dense/.test(rec.closed.V) ? '경사로 연기, 진입 금지' : '경사로 폐쇄 (' + why(rec.closed.V) + ')', tone: 'red', v: at('R1') });
    else if (rec.caution.includes('V') && sosish) out.push({ key: 'xV', text: '경사로 연기, 진입 금지', tone: 'red', v: at('R1') });
    for (const [id, w] of Object.entries(rec.closed || {}).filter(([x]) => x !== 'V').slice(0, 4 - out.length - ((rec.open[0] || (!sosish && rec.caution.length)) ? 1 : 0))) out.push({ key: 'x' + id, text: NODE_NAME(id) + ' 폐쇄 (' + why(w) + ')', tone: 'red', v: at(id) });
    const ok = rec.open[0]; if (ok && out.length < 4) out.push({ key: 'o' + ok, text: NODE_NAME(ok) + ' 열림', tone: 'green', v: at(ok === 'V' ? 'R1' : ok) });
    else if (!ok && !sosish && rec.caution.length && out.length < 4) { const x = rec.caution[0]; out.push({ key: 'c' + x, text: NODE_NAME(x) + ' 주의 (자세 낮춤)', tone: 'amber', v: at(x === 'V' ? 'R1' : x) }); }
  } else {
    for (const t of tg.slice(0, 3)) {
      if (/^E/.test(t)) out.push({ key: 't' + t, text: NODE_NAME(t) + (rec.mode === 'caution' ? ' (낮은 자세)' : '로 대피'), tone: rec.mode === 'caution' ? 'amber' : 'green', v: at(t) });
      else if (t === 'V') out.push({ key: 'tV', text: '경사로로 걸어서 대피', tone: 'green', v: at('R1') });
      else if (t === 'S1' || t === 'S2') out.push({ key: 't' + t, text: 'SOS 대기 구역', tone: 'blue', v: at(t) });
      else if (t === 'Q') out.push({ key: 'tQ', text: '연기 차단 공간', tone: 'blue', v: at('Q') });
    }
    if (rec.closed && rec.closed.V && (rec.mode === 'isolation' || rec.mode === 'stay')) out.push({ key: 'xV', text: '경사로 진입 금지', tone: 'red', v: at('R1') });
  }
  // danger zones first: the fire's no-go disc and the smoke zones painted on the floor
  const dz = []; if (k >= 1) { fire.text = name + (k >= 3 ? ' (5 m 출입 금지)' : ''); dz.push(fire); } else dz.push(fire);
  if (k >= 2) { const sp = smokeSpots(); if (sp.s2) dz.push({ key: 'sm2', text: '짙은 연기 구역', tone: 'red', v: new V3(sp.s2[0], 2.4, -sp.s2[1]) }); if (sp.s1 && (!sp.s2 || Math.hypot(sp.s1[0] - sp.s2[0], sp.s1[1] - sp.s2[1]) > 5)) dz.push({ key: 'sm1', text: '연기 퍼진 구역', tone: 'amber', v: new V3(sp.s1[0], 2.9, -sp.s1[1]) }); }
  return dz.concat(out.filter((o) => o.key !== 'fire')).slice(0, 5).concat(rescueCallouts());
}
let cos = []; const coLayer = $('callouts');
function showCallouts(specs) {
  const keep = new Set(specs.map((s) => s.key));
  for (const c of cos) if (!keep.has(c.key)) { c.el.classList.remove('on'); const el = c.el; setTimeout(() => el.remove(), 520); c.dead = true; }
  cos = cos.filter((c) => !c.dead);
  for (const s of specs) {
    let c = cos.find((x) => x.key === s.key);
    if (!c) { const el = document.createElement('div'); el.className = 'co ' + s.tone; el.textContent = s.text; coLayer.appendChild(el); c = { el, key: s.key, v: s.v.clone() }; cos.push(c); setTimeout(() => el.classList.add('on'), 30); }
    else { if (c.el.textContent !== s.text) c.el.textContent = s.text; c.v.copy(s.v); }
  }
}
function updateCalloutPos() {
  const placed = [], W = wrap.clientWidth; let topY = 36 + 50; if (mode === 'cases' && !mq.matches) { const r = $('cases').getBoundingClientRect(); topY = r.bottom - wrap.getBoundingClientRect().top + 48; /* keep labels below the cases bar */ } let cr = null; if ((mode === 'story' || mode === 'hl') && !mq.matches) { const r = (mode === 'hl' ? document.querySelector('.hl-cap') : $('cap')).getBoundingClientRect(), o = wrap.getBoundingClientRect(); cr = { r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top }; }
  for (const c of cos) {
    view.project(c.v, tmpV); if (!tmpV.vis) { c.el.style.visibility = 'hidden'; continue; } c.el.style.visibility = '';
    const w = c.el.offsetWidth || 160, hh = 36; let x = Math.max(w / 2 + 6, Math.min(W - w / 2 - 6, tmpV.px)), y = Math.max(topY, tmpV.py - 6);
    for (let it = 0; it < 6; it++) { const hit = placed.find((p) => Math.abs(p.x - x) < (p.w + w) / 2 + 6 && Math.abs(p.y - y) < hh + 4); if (!hit) break; y = hit.y - hh - 8 < topY ? hit.y + hh + 8 : hit.y - hh - 8; }
    if (cr && x - w / 2 < cr.r && y - hh < cr.b && y > cr.t) x = cr.r + w / 2 + 6;
    placed.push({ x, y, w }); c.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }
}

// ---- caption / flowchart / result
function refreshCaption() {
  if (mode !== 'story' || !story.active) return; const k = story.k, c = captionFor(sim, story.story, k);
  $('capN').textContent = k + 1; $('capT').textContent = CHAPTERS[k]; if ($('capS').textContent !== c.text) $('capS').textContent = c.text; $('cap').dataset.tone = c.tone;
  updateFlow(); if (k === 5) refreshResult();
}
function updateFlow() {
  const k = story.k, fl = $('flow'); fl.classList.toggle('on', story.active && k === 3);
  const L = ({ stairs: 1, caution: 1, ramp: 2, refuge: 3, isolation: 4, stay: 4 })[sim.recommend().mode] || 0; let shown = L;
  if (k === 3 && L) shown = Math.min(L, 1 + Math.floor(story.progress() * L)); else if (k < 3) shown = 0;
  fl.querySelectorAll('.fq').forEach((q, i) => { let cls = 'fq' + (i === 3 ? ' fe' : ''); if (i < shown - 1) cls += ' no'; else if (i === shown - 1) cls += shown === L ? (i === 3 ? ' sos' : ' yes') : ' on'; q.className = cls; });
  fl.querySelectorAll('.fd').forEach((d, i) => { d.className = 'fd' + (i < shown - 1 ? ' on' : ''); });
}
function refreshResult() {
  const n = sim.agents.length, st = sim.stats, wait = sim.agents.filter((a) => ['wait', 'press', 'rescued', 'follow'].includes(a.state)).length; const S = STORIES[story.story];
  const R = sim.rescue, last = Math.max(0, ...sim.agents.filter((a) => a.state === 'done').map((a) => a.doneAt));
  const secs = Math.round(st.rescued ? last : story.tl.ev.settle != null ? story.tl.ev.settle : sim.t);
  $('resN').innerHTML = `<span><i>스스로 대피</i><b>${st.evac - st.rescued}명</b></span>` + (st.rescued ? `<span><i>119 구조</i><b>${st.rescued}명</b></span>` : '') + (wait ? `<span><i>구조 대기</i><b>${wait}명</b></span>` : '') + `<span><i>${R.doneAt != null || !wait ? '걸린 시간' : '지난 시간'}</i><b>${secs}초</b></span>`;
  $('result').style.borderColor = { green: '#2fe083', amber: '#ffb02e', blue: '#5aa0ff' }[S.tone] || '#2fe083';
}
function updateChBar() {
  chs.querySelectorAll('.ch').forEach((el, i) => { el.classList.toggle('cur', i === story.k); el.classList.toggle('done', i < story.k); if (i !== story.k) el.querySelector('u').style.width = i < story.k ? '100%' : '0'; });
}
function onChapter(k) {
  app.classList.toggle('show-result', k === 5); updateChBar(); refreshCaption(); applyInset(); setLayers(layersFor(k));
  if (camAuto || poseInstant) { poseTo(k, poseInstant); } poseInstant = false;
  showCallouts(calloutSpecs(k)); syncPlayBtn();
}

// ---- experiment mode
const EQ = [
  { k: 'smoke', q: '1. 주차장 연기', opts: [['none', '거의 없음'], ['ceil', '천장에 모임'], ['dense', '짙음']] },
  { k: 'stairs', q: '2. 비상계단', opts: [['ok', '모두 가능'], ['partial', '일부 막힘'], ['none', '모두 막힘']] },
  { k: 'ramp', q: '3. 차량 경사로', opts: [['ok', '통행 가능'], ['smoke', '연기'], ['blocked', '차량이 막음']] },
  { k: 'refuge', q: '4. 연기 차단 공간', opts: [['yes', '있음'], ['no', '없음']] },
];
$('expQ').innerHTML = EQ.map((g) => `<div class="eq"><b>${g.q}</b><div class="seg" data-k="${g.k}">` + g.opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('') + '</div></div>').join('');
const picksEl = document.createElement('div'); picksEl.className = 'layer picks'; wrap.appendChild(picksEl);
const PICKS = ['A', 'B', 'C', 'D', 'R'].map((f) => { const b = document.createElement('button'); b.className = 'pick'; b.dataset.f = f; b.setAttribute('aria-label', f + ' 차량에 불 붙이기'); picksEl.appendChild(b); return b; });
function restartExp(patch) {
  const p = Object.assign({}, patch); if ('stairs' in p) p.doors = { E1: null, E2: null, E3: null, E4: null };
  sim.reset(Object.assign({}, sim.cond, p)); afterReset(); setPlaying(true); sim.speed = +(speedRow.querySelector('.on') || { dataset: { sp: 1 } }).dataset.sp; refreshExp();
}
$('expQ').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; restartExp({ [b.closest('.seg').dataset.k]: b.dataset.v }); });
picksEl.addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) restartExp({ fire: b.dataset.f }); });
$('expRestart').onclick = () => restartExp({});
function refreshExp() {
  if (mode !== 'exp') return; const c = sim.cond, rec = sim.recommend();
  $('expQ').querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (c[seg.dataset.k] === 'auto' ? { smoke: 'none', stairs: 'ok', ramp: 'ok' }[seg.dataset.k] : String(c[seg.dataset.k])) === b.dataset.v)));
  const det = rec.mode !== 'none';
  $('eA').textContent = det ? actionText(sim, rec) : '센서가 불과 연기를 찾는 중입니다.';
  $('expRec').dataset.tone = det ? toneOf(4, rec) : 'amber';
  PICKS.forEach((b) => { const sel = c.fire.includes(b.dataset.f); b.classList.toggle('sel', sel); const t = sel ? '불난 차' : '여기에 불'; if (b.textContent !== t) b.textContent = t; });
}
function updatePicks() {
  for (const b of PICKS) { const car = CARS[FIRE_KEYS[b.dataset.f]]; tmpV.set(car.x, 1.9, -car.y); view.project(tmpV, tmpV); b.style.visibility = tmpV.vis ? '' : 'hidden'; b.style.transform = `translate(${tmpV.px.toFixed(1)}px,${tmpV.py.toFixed(1)}px) translate(-50%,-100%)`; }
}
function enterExp() {
  if (!view.ready) return; story.stop(); setMode('exp'); sim.preset(0); afterReset(); setPlaying(true); setLayers({ mesh: false, ring: true, flow: true }); showCallouts([]);
  applyInset(); view.tween = null; view.camState.view = 'story'; const p = overviewPose(); view.camera.position.copy(p.p); view.controls.target.copy(p.t); view.camera.fov = p.fov; view.camera.updateProjectionMatrix(); view.controls.update(); refreshExp();
}

// ---- every combination: fire in any set of zones A-D, smoke drifted into any of the other zones (results precomputed by tests/cases.mjs)
const ZN = ['A', 'B', 'C', 'D'], MODE_LAMP = { stairs: 'green', ramp: 'green', caution: 'amber', isolation: 'blue', refuge: 'blue', stay: 'blue' };
const exitNm = (x) => (x === 'V' ? '경사로' : STAIR_ZONE[x] ? STAIR_ZONE[x] + ' 비상계단' : x === 'Q' ? '차단 공간' : 'SOS');
// floor plan of the lot (top = ramp side): zones A-D, which stairs are blocked, and where each zone is sent
const PX = (x) => 22 + (x + 14) / 28 * 256, PY = (y) => 26 + (10 - y) / 20 * 176;
const TGT_XY = { E1: [-14, 8], E2: [14, 8], E3: [-14, -8], E4: [14, -8], V: [0, 10.6], S1: [-14, 0], S2: [14, 0], Q: [0, -10] };
const ZONE_C = { A: [-7, 5], B: [7, 5], C: [-7, -5], D: [7, -5] };
function planSVG(st) {
  const q = (z) => { const r = ZONE_RECT[z]; return [PX(r.x0), PY(r.y1), PX(r.x1) - PX(r.x0), PY(r.y0) - PY(r.y1)]; };
  let g = `<rect class="pl-lot" x="${PX(-14)}" y="${PY(10)}" width="${PX(14) - PX(-14)}" height="${PY(-10) - PY(10)}"/>`;
  g += `<rect class="pl-ramp${st.exits.V === 'closed' ? ' x' : ''}" x="${PX(-3.5)}" y="4" width="${PX(3.5) - PX(-3.5)}" height="${PY(10) - 4}"/><text class="pl-s" x="${PX(0)}" y="15">경사로</text>`;
  for (const z of ZN) { const [x, y, w, h] = q(z); const fire = st.fire.includes(z), sm = st.smoke[z] || 0;
    g += `<rect class="pl-z${fire ? ' fire' : sm >= 2 ? ' sm2' : sm >= 1 ? ' sm1' : ''}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    const [cx, cy] = ZONE_C[z]; g += `<text class="pl-l" x="${PX(cx)}" y="${PY(cy) + 6}">${z}</text>`;
    if (fire) g += `<text class="pl-t fire" x="${PX(cx)}" y="${PY(cy) + 24}">화재</text>`; else if (sm >= 1) g += `<text class="pl-t sm" x="${PX(cx)}" y="${PY(cy) + 24}">연기</text>`; }
  for (const X of DOORS) { const [x, y] = TGT_XY[X], cl = st.exits[X] === 'closed'; const px = PX(x), py = PY(y), dx = x < 0 ? -1 : 1;
    g += `<rect class="pl-door${cl ? ' x' : ''}" x="${px - (dx < 0 ? 9 : 0)}" y="${py - 9}" width="9" height="18"/><text class="pl-dl${cl ? ' x' : ''}" x="${px + dx * 16}" y="${py + 4}">${STAIR_ZONE[X]}</text>`;
    if (cl) g += `<path class="pl-xx" d="M${px - 7} ${py - 7}L${px + 7} ${py + 7}M${px + 7} ${py - 7}L${px - 7} ${py + 7}"/>`; }
  for (const z of ZN) { const t = st.tg[z]; if (!t || !TGT_XY[t]) continue; const [x0, y0] = ZONE_C[z], [x1, y1] = TGT_XY[t]; const tone = st.mode === 'caution' && /^E/.test(t) ? 'amber' : /^S|^Q/.test(t) ? 'blue' : 'green';
    const ax = PX(x0) + (x0 < 0 ? 14 : -14), ay = PY(y0), bx = PX(x1) + (/^E|^S/.test(t) ? (x1 < 0 ? 12 : -12) : 0), by = PY(y1) + (t === 'V' ? 8 : 0); const mx = (ax + bx) / 2, my = (ay + by) / 2 + (Math.abs(ay - by) < 20 ? -22 : 0);
    g += `<path class="pl-a ${tone}" d="M${ax} ${ay}Q${mx} ${my} ${bx} ${by}" marker-end="url(#ah-${tone})"/>`; }
  const defs = ['green', 'amber', 'blue'].map((t) => `<marker id="ah-${t}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path class="pl-ah ${t}" d="M0 0L10 5L0 10z"/></marker>`).join('');
  return `<svg viewBox="0 0 300 214" role="img" aria-label="구역별 대피 평면도"><defs>${defs}</defs>${g}</svg>`;
}
function zoneLines(st) {
  const blocked = DOORS.filter((X) => st.exits[X] === 'closed').map((X) => STAIR_ZONE[X]);
  const rows = ZN.map((z) => { const t = st.tg[z]; return `<li><b>${z}</b><span>${t ? '→ ' + exitNm(t) : '안내 없음'}</span></li>`; }).join('');
  return `<p class="pl-b">막힌 비상계단: <b>${blocked.length ? blocked.join(', ') : '없음'}</b>${st.exits.V === 'closed' ? ', 경사로도 막힘' : ''}</p><ul class="pl-r">${rows}</ul>`;
}
const liveZoneState = () => { const ex = sim.exitDisplay(); const tg = {}; for (const z of ZN) { const d = sim.nodes[z].dec; tg[z] = d && d.active ? d.target : null; } return { fire: sim.fires.map((f) => CARS[f.id].zone).join(''), smoke: Object.fromEntries(ZN.map((z) => [z, sim.nodes[z].stage])), exits: Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, v.s])), tg, mode: sim.recommend().mode }; };
const caseKey = (f, sm) => f + '|' + sm; const CASE_SET = Array.isArray(CASES) ? { off: CASES } : CASES; let CASE_BY = {}; let CUR = [];
let cSel = { fire: 'A', smokeZ: '', vent: 'smart' };
$('cFire').innerHTML = ZN.map((z) => `<button data-z="${z}">${z}</button>`).join(''); $('cSmoke').innerHTML = ZN.map((z) => `<button data-z="${z}">${z}</button>`).join('') + '<button data-z="R" class="rp">경사로</button>';
const sortZ = (s) => ZN.filter((z) => s.includes(z)).join('') + (s.includes('R') ? 'R' : ''); // R: smoke on the ramp too
$('cFire').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const z = b.dataset.z; let f = cSel.fire.includes(z) ? cSel.fire.replace(z, '') : cSel.fire + z; f = sortZ(f); /* may be empty: nothing burning yet */ loadCase(f, sortZ([...cSel.smokeZ].filter((x) => !f.includes(x)).join(''))); });
$('cSmoke').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; const z = b.dataset.z; loadCase(cSel.fire, sortZ(cSel.smokeZ.includes(z) ? cSel.smokeZ.replace(z, '') : cSel.smokeZ + z)); });
$('cRestart').onclick = () => loadCase(cSel.fire, cSel.smokeZ);
$('cVent').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cSel.vent = b.dataset.v; renderTable(); loadCase(cSel.fire, cSel.smokeZ); });
const resText = (r) => (r.rescued ? `${r.evac - r.rescued}명 대피, ${r.rescued}명 구조대가 구조` : `${r.evac}명 대피`) + (r.wait ? `, ${r.wait}명 구조 대기` : '');
function caseRow(r) {
  const blocked = DOORS.filter((X) => r.exits[X] === 'closed').map((X) => STAIR_ZONE[X]).join(' ') + (r.exits.V === 'closed' ? ' 경사로' : '');
  const zc = ZN.map((z) => { const t = r.targets[z]; return `<td class="zt${t && /^E/.test(t) ? '' : t === 'V' ? ' rp' : ' sos'}">${t ? exitNm(t) : '-'}</td>`; }).join('');
  return `<tr data-k="${caseKey(r.fire, r.smokeZ)}"><td class="z">${[...r.fire].join(' ')}</td><td class="z dim">${r.smokeZ ? [...r.smokeZ].map((z) => (z === 'R' ? '경사로' : z)).join(' ') : '없음'}</td><td class="z bad">${blocked.trim() || '없음'}</td>${zc}<td><i class="lamp ${MODE_LAMP[r.mode] || 'amber'}"></i>${modeText(r.mode)}</td><td class="n">${resText(r)}</td><td class="n">${r.time}초</td></tr>`;
}
const VENT_NM = { off: '환기 꺼짐', normal: '평상시 환기 그대로', smart: '구조 대기 때만 팬 가동' };
function renderTable() {
  const rampOn = cSel.smokeZ.includes('R'); CUR = (CASE_SET[cSel.vent] || CASE_SET.off || []).filter((r) => r.smokeZ.includes('R') === rampOn); CASE_BY = Object.fromEntries(CUR.map((r) => [caseKey(r.fire, r.smokeZ), r]));
  $('ctBody').innerHTML = CUR.map(caseRow).join(''); const cnt = (m) => CUR.filter((r) => r.mode === m).length; const sum = (k) => CUR.reduce((a, r) => a + (r[k] || 0), 0);
  let t = `${VENT_NM[cSel.vent] || ''}, 경사로 연기 ${rampOn ? '있음' : '없음'}: ${CUR.length}가지 경우 중 계단 대피 ${cnt('stairs') + cnt('caution')}, 경사로 대피 ${cnt('ramp')}, 고립(SOS) ${cnt('isolation') + cnt('stay') + cnt('refuge')}`;
  { const iso = CUR.filter((r) => ['isolation', 'stay', 'refuge'].includes(r.mode)), self = iso.filter((r) => !r.rescued && !r.wait).length; if (iso.length) t += ` (고립 중 ${self}가지는 나중에 열린 출구로 스스로 대피, ${iso.length - self}가지는 구조대가 구조)`; }
  if (CUR.length && 'expo2' in CUR[0]) { const off = (CASE_SET.off || []).filter((r) => r.smokeZ.includes('R') === rampOn); const e = sum('expo2'), e0 = off.reduce((a, r) => a + (r.expo2 || 0), 0); t += `. 짙은 연기 속에 있던 시간 합계 ${e}초` + (cSel.vent !== 'off' && e0 ? ` (환기 꺼짐 ${e0}초 대비 ${Math.round((e - e0) / e0 * 100)}%)` : ''); }
  $('ctSum').textContent = t; $('cVent').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cSel.vent));
}
renderTable();
$('ctBody').addEventListener('click', (e) => { const tr = e.target.closest('tr'); if (!tr) return; const [f, sm] = tr.dataset.k.split('|'); loadCase(f, sm); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
function loadCase(f, sm) {
  const rampWas = cSel.smokeZ.includes('R'); cSel.fire = f; cSel.smokeZ = sm; if (rampWas !== sm.includes('R')) renderTable(); sim.reset({ fire: f, smokeZ: sm.replace('R', ''), vent: cSel.vent, smoke: 'ceil', stairs: 'ok', ramp: sm.includes('R') ? 'dense' : 'ok', refuge: 'no', wind: 'auto', car: true, power: true, lost: null, doors: { E1: null, E2: null, E3: null, E4: null } });
  afterReset(); setPlaying(true); sim.speed = 1; refreshCases();
}
function refreshCases() {
  if (mode !== 'cases') return; const c = sim.cond, rec = sim.recommend(), r = CASE_BY[caseKey(cSel.fire, cSel.smokeZ)];
  $('cFire').querySelectorAll('button').forEach((b) => b.classList.toggle('on', c.fire.includes(b.dataset.z)));
  $('cSmoke').querySelectorAll('button').forEach((b) => { const burning = c.fire.includes(b.dataset.z); b.disabled = burning; b.classList.toggle('on', !burning && cSel.smokeZ.includes(b.dataset.z)); });
  const det = rec.mode !== 'none'; const zs = liveZoneState(); $('cPlan').innerHTML = planSVG(zs); $('cZones').innerHTML = det ? zoneLines(zs) : `<p class="pl-b">${c.fire || c.smokeZ ? '센서가 불과 연기를 찾는 중입니다.' : '불난 구역을 고르면 구역별 대피 계단이 나옵니다.'}</p>`; $('cNow').textContent = det ? actionText(sim, rec) : ''; $('cRec').dataset.tone = det ? toneOf(4, rec) : 'amber';
  $('cRes').innerHTML = r ? `<span><i>계산 결과</i><b>${resText(r)}</b></span><span><i>걸린 시간</i><b>${r.time}초</b></span>` : '';
  const k = caseKey(cSel.fire, cSel.smokeZ); $('ctBody').querySelectorAll('tr').forEach((tr) => tr.classList.toggle('cur', tr.dataset.k === k));
  showCallouts(caseCallouts());
}
function caseCallouts() {
  const out = [], rec = sim.recommend(), at = (id) => nodePos(id, new V3());
  for (const f of sim.fires) out.push({ key: 'f' + f.id, text: CARS[f.id].zone + '구역 화재', tone: 'red', v: new V3(f.x, 2.5, -f.y) });
  for (const z of ZN) { const d = sim.nodes[z].dec; if (!d || !d.active || !d.target) continue; const t = d.target; const tone = /^E/.test(t) ? (d.mode === 'caution' ? 'amber' : 'green') : t === 'V' ? 'green' : 'blue';
    out.push({ key: 'z' + z, text: z + '구역 → ' + exitNm(t), tone, v: at(z) }); }
  for (const X of DOORS) if (sim.exitDisplay()[X].s === 'closed') out.push({ key: 'x' + X, text: STAIR_ZONE[X] + ' 비상계단 막힘', tone: 'red', v: at(X) });
  return out.concat(rescueCallouts());
}
const TEAM_ST = { force: '문 강제 개방', mask: '면체 착용', approach: '요구조자에게 이동', search: '벽 따라 검색', contact: '보조 마스크 씌우는 중', escort: '한 줄로 이송 중' };
function rescueCallouts() {
  const out = [], V = sim.vent; if (V.mode === 'smart' && V.phase === 'hold') for (const sid of V.sos) out.push({ key: 'shelter' + sid, text: sid + ' 대기 구역: 맑은 공기 급기 중', tone: 'blue', v: nodePos(sid, new V3()).setY(2.6) });
  for (const T of sim.rescue.teams) { if (!TEAM_ST[T.state]) continue; const c = T.members.find((m) => m.visible); if (!c) continue; out.push({ key: 'team' + T.id, text: '119 구조대 ' + (T.id + 1) + '조: ' + TEAM_ST[T.state], tone: 'red', v: new V3(c.x, rampZ(c.y) + 2.3, -c.y) }); }
  return out;
}
// ---- 119 link panel
const R_STEPS = [['report', '구조 요청'], ['dispatch', '출동 지령'], ['arrive', '현장 도착'], ['entry', '진입'], ['contact', '요구조자 접촉'], ['escort', '이송 시작'], ['done', '구조 완료']];
const mmss = (s) => Math.floor(s / 60) + '분 ' + String(Math.floor(s % 60)).padStart(2, '0') + '초';
function r119Html() {
  const R = sim.rescue, P = R.packet; if (R.rxAt == null || !P) return '';
  const tm = R.teams.find((T) => TEAM_ST[T.state]); let st = '119 전송 중';
  if (R.doneAt != null) st = '구조 완료 ' + R.rescued + '명'; else if (R.clearAt != null) st = '남은 사람 0명, 검색 생략'; else if (tm) st = (tm.id + 1) + '조 ' + TEAM_ST[tm.state]; else if (R.arrivedAt != null) st = '현장 도착'; else if (R.eta != null) st = '출동 중';
  const sm = ZN.map((z) => `${z} <b class="${P.smoke[z] >= 2 ? 'bad' : P.smoke[z] ? '' : 'ok'}">${P.smoke[z] == null ? '?' : P.smoke[z]}</b>`).join('&nbsp; ');
  const wait = P.wait.length ? P.wait.map((w) => `<b>${w.id === 'Q' ? '차단 공간' : w.id} ${w.n}명</b>`).join(', ') : '없음';
  const e = P.entry; const ent = e ? `${e.name}${e.id === 'V' ? '' : `, 연기 ${e.stage}단계`}${e.locked ? ', 문 잠김(강제 개방)' : ''}${sim.cond.loc119 === false ? '' : `, 요구조자까지 ${e.dist} m`}` : '-';
  const vent = P.ventText;
  let h = `<h4>119 연동 <span class="st">${st}</span></h4><dl class="pk"><dt>위치</dt><dd>지하 3층 주차장, ${P.fire} 화재</dd><dt>연기</dt><dd>${sm}</dd><dt>사람</dt><dd>대피 완료 ${P.done}명, 이동 ${P.moving}명, 구조 대기 ${wait}</dd><dt>진입로</dt><dd>${ent}</dd><dt>환기</dt><dd>${vent}</dd></dl>`;
  if (R.eta != null && R.arrivedAt == null) { const left = Math.max(0, R.eta - sim.t); h += `<div class="eta">도착까지 실제 약 <b>${mmss(left * TIME_K)}</b> (화면은 ${Math.round(TIME_K)}배 빠르게)</div>`; }
  const cur = [...R_STEPS].reverse().find(([k]) => R.steps[k] != null);
  h += '<ol>' + R_STEPS.filter(([k]) => !(R.clearAt != null && ['entry', 'contact', 'escort', 'done'].includes(k))).map(([k, nm]) => `<li class="${R.steps[k] != null ? 'on' : ''}${cur && cur[0] === k ? ' now' : ''}"><time>${R.steps[k] != null ? fmt(R.steps[k]) : '--:--'}</time>${nm}</li>`).join('') + '</ol>';
  return h;
}
let r119Min = false, r119Last = '';
function refresh119() { const el = $('r119'); const h = mode === 'landing' ? '' : r119Html(); el.hidden = !h; if (h !== r119Last) { r119Last = h; el.innerHTML = h; } el.classList.toggle('min', r119Min); el.classList.toggle('done', sim.rescue.doneAt != null || sim.rescue.clearAt != null); }
$('r119').addEventListener('click', (e) => { if (e.target.closest('h4')) { r119Min = !r119Min; refresh119(); } });
function enterCases() {
  if (!view.ready) return; story.stop(); setMode('cases'); setLayers({ mesh: false, ring: true, flow: false }); showCallouts([]); loadCase(cSel.fire, cSel.smokeZ);
  applyInset(); view.tween = null; view.camState.view = 'story'; const p = overviewPose(); view.camera.position.copy(p.p); view.controls.target.copy(p.t); view.camera.fov = p.fov; view.camera.updateProjectionMatrix(); view.controls.update();
}

// ---- 119 rescue highlight: one key (R) replays the rescue of story 4 in about 20 s and stops on an end card
const HL_PRESET = STORIES[4].preset;
const HL_STEPS = [['call', '구조 요청'], ['go', '출동'], ['in', '진입'], ['mask', '마스크 착용'], ['out', '함께 탈출']];
const hl = { on: false, ph: null };
const hlSteps = $('hlSteps'); hlSteps.innerHTML = HL_STEPS.map(([k, n]) => `<span data-k="${k}">${n}</span>`).join('');
function hlPhase() {
  const R = sim.rescue; if (R.doneAt != null) return 'end';
  if (R.arrivedAt == null) return R.eta == null || sim.t < R.dispatchAt + 0.6 ? 'call' : 'go';
  if (R.steps.escort != null) return 'out';
  return R.teams.some((T) => T.state === 'contact') ? 'mask' : 'in';
}
// fast where nothing changes (driving there), close to real time for the call, the truck pulling in and the masks
function hlSpeed(ph) { const R = sim.rescue; return { call: 1, go: sim.t < R.eta - 3 ? 22 : 1.5, in: 6, mask: 4, out: 12 }[ph] || 1; }
function startHl() {
  if (!view.ready) return; story.stop(); setMode('hl'); setLayers({ mesh: false, ring: true, flow: false }); showCallouts([]);
  sim.preset(HL_PRESET); afterReset(); const R = sim.rescue; for (let k = 0; R.detectAt == null && k < 900; k++) sim.step(); // skip ahead to people waiting at the SOS posts
  hl.on = true; hl.ph = null; $('hlEnd').classList.remove('on'); view.tween = null; view.camState.view = 'story';
  const p = overviewPose(); view.camera.position.copy(p.p); view.controls.target.copy(p.t); view.camera.fov = p.fov; view.camera.updateProjectionMatrix(); view.controls.update();
  setPlaying(true); hlUpdate(0); refreshHl();
}
function hlUpdate(dt) {
  if (!hl.on) return; const ph = hlPhase();
  if (ph !== hl.ph) { hl.ph = ph; if (ph === 'end') { setPlaying(false); showCallouts([]); refreshHl(); $('hlEnd').classList.add('on'); } }
  if (ph !== 'end') sim.speed = hlSpeed(ph);
  hlCam(dt);
}
// camera: whole car park while the call goes out and the truck drives up, then it follows the crew and the people with them
const HL_DIR = new V3(0.35, 0.78, 0.52).normalize();
function hlCam(dt) {
  let want; const ph = hl.ph;
  if (ph === 'call' || ph === 'go' || ph === 'end') want = overviewPose();
  else {
    const pts = []; for (const c of sim.crew) if (c.visible) pts.push(c); for (const a of sim.agents) if (a.visible && (a.state === 'rescued' || a.state === 'follow')) pts.push(a);
    if (!pts.length) return; let x = 0, y = 0; for (const q of pts) { x += q.x; y += q.y; } x /= pts.length; y /= pts.length; let r = 0; for (const q of pts) r = Math.max(r, Math.hypot(q.x - x, q.y - y));
    const t = new V3(x, rampZ(y) + 0.8, -y); want = { p: t.clone().addScaledVector(HL_DIR, Math.max(17, Math.min(46, 14 + r * 1.6))), t, fov: 40 };
  }
  const k = 1 - Math.exp(-Math.min(dt, 0.1) * 1.5); view.camera.position.lerp(want.p, k); view.controls.target.lerp(want.t, k); view.camera.fov += ((want.fov || 40) - view.camera.fov) * k; view.camera.updateProjectionMatrix();
}
function refreshHl() {
  if (mode !== 'hl') return; const R = sim.rescue, n = sim.agents.length, ph = hl.ph || 'call';
  const T = { call: ['SOS 위치를 119로 보냅니다', `나갈 길이 모두 막혀 ${sim.agents.filter((a) => a.state !== 'done').length}명이 SOS 구역에서 구조를 기다립니다. 관리실이 위치와 인원을 119에 자동으로 보냅니다.`],
    go: ['119 출동', R.eta != null && sim.t < R.eta - 3 ? `구조대가 오는 중입니다. 도착까지 실제 약 ${Math.max(1, Math.round((R.eta - sim.t) * TIME_K / 60))}분` : '구조대가 도착했습니다.'],
    in: ['구조대 진입', '전송된 위치로 바로 찾아갑니다.'], mask: ['보조 마스크 착용', '구조대가 한 사람씩 마스크를 씌워 줍니다.'],
    out: ['구조대와 함께 탈출', `구조대를 따라 한 줄로 나갑니다. 구조 ${R.rescued} / ${n}명`], end: ['전원 구조 완료', `${n}명 모두 밖으로 나왔습니다.`] }[ph];
  $('hlT').textContent = T[0]; $('hlS').textContent = T[1];
  const sp = ph === 'end' ? 1 : hlSpeed(ph); $('hlFF').textContent = sp > 1 ? '▶▶ ' + sp + '배 빠르게' : ''; $('hlFF').hidden = sp <= 1;
  const i = HL_STEPS.findIndex(([k]) => k === ph); hlSteps.querySelectorAll('span').forEach((el, j) => { el.className = ph === 'end' || j < i ? 'done' : j === i ? 'cur' : ''; });
  if (ph === 'end') { const secs = Math.round(R.doneAt - R.arrivedAt); $('hlEndN').textContent = `119 구조대와 함께 ${R.rescued}명 모두 밖으로 나왔습니다`; $('hlEndT').textContent = `구조대 도착 후 ${secs >= 60 ? Math.floor(secs / 60) + '분 ' : ''}${secs % 60}초 만에 탈출`; }
  else showCallouts(ph === 'call' ? hlCallCallouts() : rescueCallouts());
}
function hlCallCallouts() {
  const out = []; for (const id of ['S1', 'S2']) { const k = sim.agents.filter((a) => a.target === id && ['wait', 'press', 'go'].includes(a.state)).length; if (k) out.push({ key: 'hl' + id, text: id + ' SOS 대기 ' + k + '명', tone: 'blue', v: nodePos(id, new V3()).setY(2.6) }); }
  out.push({ key: 'hlK', text: '관리실 → 119 위치 전송', tone: 'red', v: new V3(-17.6, 13.4, -9.5) }); return out;
}
$('hlAgain').onclick = () => startHl(); $('hlClose').onclick = () => enterCases();
addEventListener('keydown', (e) => {
  if (e.target.closest('button,select,input') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyR') { e.preventDefault(); startHl(); }
  else if (mode === 'hl' && e.key === ' ') { e.preventDefault(); if (hl.ph !== 'end') setPlaying(!sim.playing); }
  else if (mode === 'hl' && e.key === 'Escape') enterCases();
});

view.onBefore = (dt) => { if (mode === 'story') story.update(); else if (mode === 'hl') hlUpdate(dt); };
view.onAfter = () => {
  if (mode === 'raw') return; updateCalloutPos();
  if (mode === 'exp') updatePicks(); else if (mode === 'story' && story.active) { const el = chs.children[story.k]; if (el) el.querySelector('u').style.width = (story.progress() * 100).toFixed(1) + '%'; }
};
setInterval(() => { if (!view.ready) return; refresh119(); if (mode === 'story' && story.active && story.k >= 5) refreshResult(); if (mode === 'story' && story.active) { refreshCaption(); showCallouts(calloutSpecs(story.k)); } else if (mode === 'exp') refreshExp(); else if (mode === 'cases') refreshCases(); else if (mode === 'hl') refreshHl(); }, 250);
addEventListener('resize', () => setTimeout(applyInset, 60));

// ------------------------------------------------------------------ boot
async function boot() {
  const T = (window.__v4.timing = { boot0: performance.now() });
  const names = embeddedNames(); let assets = {};
  if (names.length) { try { assets = await loadAssets(); if (assets.errors.length) console.info('asset load issues:', assets.errors.join('; ')); } catch (e) { console.info('asset load failed', e && e.message); assets = {}; } }
  T.loaded = performance.now(); T.parse = loadTimes; view.init(assets); T.inited = performance.now();
  const real = !!(assets.lot || assets.cars || assets.person);
  $('credit').textContent = real ? '모든 3D 모델(주차장, 차량, 인물, 경사로, 기둥, 표지)은 이 프로젝트를 위해 Blender로 직접 제작했습니다. 렌더링: three.js (MIT).' : '현재 임시(절차 생성) 모델을 표시 중입니다. Blender로 제작한 프로젝트 전용 모델이 빌드에 포함되면 자동으로 교체됩니다. 렌더링: three.js (MIT).';
  const start = P.get('preset') != null ? +P.get('preset') : 0;
  const sp = P.get('story'), md = P.get('mode');
  if (P.get('preset') != null) { setMode('raw'); if (start >= 0) { presetSel.value = String(start); sim.preset(start); } else sim.reset({}); afterReset(); setPlaying(P.get('autoplay') !== '0'); }
  else if (sp != null) { startStory(Math.max(0, Math.min(5, +sp - 1))); const ch = P.get('chapter'); if (ch != null) story.setChapter(Math.max(0, Math.min(5, +ch - 1))); if (P.get('autoplay') === '0') { story.playing = false; sim.playing = false; syncPlayBtn(); } }
  else if (md === 'exp') enterExp();
  else if (md === 'rescue') startHl();
  else if (md === 'story') enterLanding();
  else enterCases();
  $('speed').textContent = 'x' + sim.speed;
  window.__v4.ready = true; window.__v4.firstFrame = performance.now(); window.__v4.assets = { lot: !!assets.lot, cars: !!assets.cars, person: !!assets.person };
}
window.__v4.setPreset = (i) => { presetSel.value = String(i); if (i >= 0) sim.preset(i); afterReset(); };
window.__v4.afterReset = afterReset; window.__v4.setPlaying = setPlaying; window.__v4.story = story; window.__v4.ui = { snapCam: () => { if (view.tween) view.tween.t = 1; view.frame(0.0001); view.frame(0.0001); }, startStory, enterLanding, enterExp, enterCases, loadCase, setMode, startHl, hl: () => ({ ph: hl.ph, cap: $('hlT').textContent, sub: $('hlS').textContent, ff: $('hlFF').textContent, end: $('hlEnd').classList.contains('on') ? $('hlEnd').innerText : '' }), cap: () => ({ n: $('capN').textContent, t: $('capT').textContent, s: $('capS').textContent, tone: $('cap').dataset.tone }), result: () => $('result').innerText, mode: () => mode, callouts: () => [...$('callouts').querySelectorAll('.co.on')].map((e) => e.textContent) };
// deterministic stepping for tests / screenshots
window.__v4.advance = (sec, render = true) => { sim.advance(sec); updateInfo(); if (render) { view.frame(0.0001); view.frame(0.0001); view.people.mixers.forEach((m) => m.update(0.6)); view.frame(0.0001); } };
window.__v4.step = (n = 1) => { for (let i = 0; i < n; i++) view.frame(0.05); };
boot();

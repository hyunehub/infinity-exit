import { launch, openPage } from './lib.mjs';
const FILE = process.env.FILE || '/home/user/v4/web/site/index.html';
const b = await launch(); let fails = 0; const res = {};
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } };
const p = await openPage(b, 1600, 1000, '?q=high&autoplay=0&preset=1', FILE);
res.firstFrameMs = await p.evaluate(() => Math.round(__v4.firstFrame));
res.assets = await p.evaluate(() => __v4.assets);
// ---- front axis (empirical)
res.front = await p.evaluate(() => {
  const v = __v4.view, T = __v4.THREE; const g = v.people.models[0]; g.updateMatrixWorld(true); let sk = null; g.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
  const pos = sk.geometry.attributes.position; const n = pos.count; let minY = 1e9, maxY = -1e9; const vv = new T.Vector3(); const pts = [];
  for (let i = 0; i < n; i++) { vv.fromBufferAttribute(pos, i); pts.push([vv.x, vv.y, vv.z]); minY = Math.min(minY, vv.y); maxY = Math.max(maxY, vv.y); }
  const h = maxY - minY; let fz = 0, fn = 0, bz = 0, bn = 0; for (const [x, y, z] of pts) { if (y < minY + h * 0.06) { fz += z; fn++; } if (y > minY + h * 0.1) { bz += z; bn++; } }
  const d = fz / fn - bz / bn; return { feetMinusBodyZ: +d.toFixed(3), front: d < 0 ? '-Z' : '+Z', real: v.personReal, height: +h.toFixed(2) };
});
// ---- heading + mesh-follow
await p.evaluate(() => { __v4.view.running = false; __v4.view.noRender = true; });
const hd = { n: 0, bad20: 0, max: 0, angs: [] }; let maxOff = 0, maxBone = 0;
for (const preset of [1, 3, 4, 7]) {
  await p.evaluate((pr) => { __v4.setPreset(pr); __v4.setPlaying(true); }, preset);
  const r = await p.evaluate(() => {
    const v = __v4.view, s = __v4.sim, T = __v4.THREE; const out = { angs: [], off: 0, bone: 0 }; const hist = []; const box = new T.Box3(), c = new T.Vector3(), q = new T.Vector3(), f = new T.Vector3(), bp = new T.Vector3();
    for (let k = 0; k < 700; k++) {
      v.frame(0.05);
      const pos = v.people.groups.map((g) => { g.updateMatrixWorld(true); return [g.position.x, g.position.z, g.visible]; });
      const fr = v.people.groups.map((g) => { f.set(0, 0, -1).applyQuaternion(g.quaternion); return [f.x, f.z]; });
      hist.push({ pos, fr });
      v.people.groups.forEach((g, i) => {
        if (!g.visible) return; box.setFromObject(g, true); box.getCenter(c); const a = s.agents[i];
        out.off = Math.max(out.off, Math.hypot(c.x - g.position.x, c.z - g.position.z));
        let sk = null; g.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; }); if (sk) { sk.skeleton.bones[0].getWorldPosition(bp); out.bone = Math.max(out.bone, Math.hypot(bp.x - g.position.x, bp.z - g.position.z)); }
      });
      if (k >= 5) { const a = hist[k - 1], b = hist[k]; for (let i = 0; i < a.pos.length; i++) { if (!a.pos[i][2] || !b.pos[i][2]) continue; const vx = (b.pos[i][0] - a.pos[i][0]) / 0.05, vz = (b.pos[i][1] - a.pos[i][1]) / 0.05, sp = Math.hypot(vx, vz); if (sp < 0.8) continue; const fx = (a.fr[i][0] + b.fr[i][0]) / 2, fz = (a.fr[i][1] + b.fr[i][1]) / 2; const ang = Math.acos(Math.max(-1, Math.min(1, (vx * fx + vz * fz) / (sp * Math.hypot(fx, fz))))) * 180 / Math.PI; out.angs.push(ang); } }
    }
    return out;
  });
  hd.angs.push(...r.angs); maxOff = Math.max(maxOff, r.off); maxBone = Math.max(maxBone, r.bone);
}
hd.angs.sort((a, b) => a - b); hd.n = hd.angs.length; hd.p95 = hd.angs[Math.floor(hd.n * 0.95)]; hd.p99 = hd.angs[Math.floor(hd.n * 0.99)]; hd.f20 = hd.angs.filter((a) => a > 20).length / hd.n; hd.max = hd.angs[hd.n - 1]; hd.mean = hd.angs.reduce((a, b) => a + b, 0) / hd.n;
res.heading = { samples: hd.n, mean: +hd.mean.toFixed(2), p95: +hd.p95.toFixed(2), p99: +hd.p99.toFixed(2), fracOver20: +hd.f20.toFixed(4), max: +hd.max.toFixed(2) }; res.meshFollow = { maxBboxCenterOffset: +maxOff.toFixed(3), maxHipsOffset: +maxBone.toFixed(3) };
ok(hd.n > 200, 'heading samples ' + hd.n); ok(hd.p95 < 20, 'heading p95 ' + hd.p95); ok(hd.p99 < 20, 'heading p99 ' + hd.p99);
ok(maxOff < 0.6, 'mesh bbox center follows agent (max offset ' + maxOff + ')'); ok(maxBone < 0.5, 'hips bone follows agent ' + maxBone);
// ---- renderer info under load
await p.evaluate(() => { __v4.view.noRender = false; });
const infos = [];
for (const [preset, t, view] of [[5, 30, 'over'], [1, 25, 'top'], [8, 12, 'over'], [3, 20, 'ramp']]) {
  await p.evaluate(([pr, t, vw]) => { __v4.view.noRender = false; __v4.setPreset(pr); __v4.setPlaying(false); __v4.advance(t); __v4.view.setView(vw, true); __v4.advance(0.1); }, [preset, t, view]);
  infos.push(await p.evaluate(() => __v4.view.info()));
}
res.render = { maxCalls: Math.max(...infos.map((i) => i.calls)), maxTris: Math.max(...infos.map((i) => i.tris)), geoms: infos[0].geoms, tex: infos[0].tex };
ok(res.render.maxCalls < 120, 'draw calls ' + res.render.maxCalls); ok(res.render.maxTris < 300000, 'tris ' + res.render.maxTris);
res.layout = await p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, canvasH: document.getElementById('cv').clientHeight }));
// ---- screenshots 1600x1000
const shots = [['s1_stairs_ev_fire', 0, 6, 'over'], ['s1b_fire_charred', 0, 34, 'over'], ['s2_spread_closure', 1, 24, 'over'], ['s4_isolation_sos', 3, 26, 'sos'], ['s6_refuge_dense', 5, 34, 'over'], ['s9_power_outage', 8, 9, 'top'], ['s3_ramp_walk', 2, 12, 'ramp'], ['s8_caution_stairs', 7, 12, 'stairs']];
for (const [name, pr, t, vw] of shots) {
  await p.evaluate(([pr, t, vw]) => { __v4.view.noRender = false; __v4.setPreset(pr); __v4.setPlaying(false); __v4.advance(t); __v4.view.setView(vw, true); __v4.advance(0.1); }, [pr, t, vw]);
  await p.screenshot({ path: `shots/${name}.png` });
}
res.errors = p.errors; ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
await p.close();
// ---- mobile 390
const m = await openPage(b, 390, 844, '?q=mid&autoplay=0&preset=5', FILE);
await m.evaluate(() => { __v4.setPlaying(false); __v4.advance(30); });
await m.screenshot({ path: 'shots/s_mobile_390.png', fullPage: true });
await m.evaluate(() => { window.scrollTo(0, 0); document.getElementById('condbtn').click(); });
await m.screenshot({ path: 'shots/s_mobile_sheet.png' });
res.mobile = await m.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, canvasH: document.getElementById('cv').clientHeight, vh: innerHeight }));
ok(res.mobile.scrollW <= res.mobile.innerW, 'mobile horizontal scroll ' + res.mobile.scrollW); ok(m.errors.length === 0, 'mobile errors ' + m.errors.join('|'));
await m.close();
// ---- v4 UX: landing, 6 stories x 6 chapters, experiment mode, screenshots
const u = await openPage(b, 1600, 1000, '?q=high', FILE);
res.ux = {};
res.ux.start = await u.evaluate(() => __v4.ui.mode()); ok(res.ux.start === 'cases', 'opens on the cases screen: ' + res.ux.start);
res.ux.landing = await u.evaluate(() => { __v4.ui.enterLanding(); return ({ mode: __v4.ui.mode(), cards: document.querySelectorAll('#cards .card-b').length, titles: [...document.querySelectorAll('#cards .card-b')].map((c) => c.innerText.replace(/\n+/g, ' / ')) }); });
ok(res.ux.landing.mode === 'landing' && res.ux.landing.cards === 6, 'landing shows 6 cards');
const shot = async (name, fn, arg) => { await u.evaluate(fn, arg); await u.waitForTimeout(1500); await u.screenshot({ path: `shots/${name}.png`, animations: 'disabled', timeout: 90000 }); };
await u.evaluate(() => { __v4.view.running = false; __v4.view.noRender = false; });
await shot('ux1_landing', () => { __v4.advance(0.1); });
// cards start the story
await u.evaluate(() => { __v4.view.noRender = true; document.querySelector('#cards .card-b[data-i="2"]').click(); });
res.ux.afterClick = await u.evaluate(() => ({ mode: __v4.ui.mode(), story: __v4.story.story, ch: __v4.story.k }));
ok(res.ux.afterClick.mode === 'story' && res.ux.afterClick.story === 2, 'card click starts story');
res.ux.controls = await u.evaluate(() => [...document.querySelectorAll('#chbar button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()));
ok(res.ux.controls.length === 3, 'story shows only 3 controls: ' + res.ux.controls.join(','));
// play every story through all 6 chapters on its own (auto-advance)
res.ux.stories = [];
for (let s = 0; s < 6; s++) {
  const r = await u.evaluate((s) => {
    const U = __v4.ui, st = __v4.story, v = __v4.view; v.noRender = true; U.startStory(s); const seen = []; const caps = []; let frames = 0;
    const take = () => { const c = U.cap(); seen.push(st.k); caps.push({ k: st.k, ok: !!(c.s && c.t), dot: /·/.test(c.s), co: document.querySelectorAll('#callouts .co').length, flow: document.getElementById('flow').classList.contains('on') }); };
    take(); let last = st.k;
    while (frames < 2400 && !(st.k === 5 && frames > 0 && __v4.sim.t > st.tl.b[5] + 1.0)) { v.frame(0.05); frames++; if (st.k !== last) { last = st.k; take(); } }
    const res = U.result(); return { seen, caps, frames, simT: +__v4.sim.t.toFixed(1), result: res, evac: __v4.sim.stats.evac };
  }, s);
  r.s = s + 1; res.ux.stories.push({ s: r.s, seen: r.seen.join(''), frames: r.frames, simT: r.simT, evac: r.evac, result: r.result.replace(/\n+/g, ' | ').slice(0, 120) });
  ok(r.seen.join('') === '012345', `story ${s + 1} plays chapters in order: ${r.seen.join('')}`);
  ok(r.caps.every((c) => c.ok), `story ${s + 1} every chapter has non-empty caption`);
  ok(r.caps.every((c) => !c.dot), `story ${s + 1} captions have no middle dot`);
  ok(r.caps.every((c) => c.co >= 1), `story ${s + 1} every chapter has a callout (${r.caps.map((c) => c.co).join(',')})`);
  ok(/대피 완료/.test(r.result) && /초/.test(r.result) && !/·/.test(r.result), `story ${s + 1} result card`);
}
// prev / next / pause / home
res.ux.nav = await u.evaluate(() => { const st = __v4.story, U = __v4.ui; U.startStory(0); st.setChapter(3); st.prev(); const a = st.k; st.next(); st.next(); const b = st.k; st.toggle(); const c = st.playing; st.toggle(); document.getElementById('modeStory').click(); return { a, b, c, mode: U.mode() }; });
ok(res.ux.nav.a === 2 && res.ux.nav.b === 4 && res.ux.nav.c === false && res.ux.nav.mode === 'landing', 'prev/next/pause/home work ' + JSON.stringify(res.ux.nav));
// screenshots
const storyShot = (name, s, k, adv) => shot(name, ([s, k, adv]) => { const v = __v4.view; v.noRender = false; __v4.ui.startStory(s); __v4.story.setChapter(k); __v4.story.playing = false; __v4.sim.playing = false; __v4.advance(adv); __v4.ui.snapCam(); __v4.ui.snapCam(); }, [s, k, adv]);
await storyShot('ux2_story3_ch4', 2, 3, 3); await storyShot('ux3_story3_ch5', 2, 4, 3); await storyShot('ux4_story4_ch5', 3, 4, 3); await storyShot('ux4b_story4_ch4', 3, 3, 3); await storyShot('ux4c_story4_ch6', 3, 5, 0.2); await storyShot('ux4d_story1_ch3', 0, 2, 1);
// experiment mode
await shot('ux5_experiment', () => { __v4.view.noRender = false; __v4.ui.enterExp(); __v4.advance(8); });
res.ux.exp = await u.evaluate(() => { const U = __v4.ui; document.querySelector('#expQ .seg[data-k="stairs"] button[data-v="none"]').click(); const a = __v4.sim.cond.stairs; document.querySelector('.pick[data-f="D"]').click(); const f = __v4.sim.cond.fire; __v4.advance(5); return { stairs: a, fire: f, rec: document.getElementById('eA').textContent, mode: U.mode(), settings: !!document.getElementById('setBtn') }; });
ok(res.ux.exp.stairs === 'none' && res.ux.exp.fire === 'D' && res.ux.exp.rec.length > 3, 'experiment controls work ' + JSON.stringify(res.ux.exp));
await u.evaluate(() => { document.getElementById('setBtn').click(); }); res.ux.pop = await u.evaluate(() => ({ open: document.getElementById('settings').classList.contains('open'), items: document.querySelectorAll('#settings input,#settings button').length }));
ok(res.ux.pop.open && res.ux.pop.items >= 10, 'settings popover holds the technical toggles ' + JSON.stringify(res.ux.pop));
await shot('ux5b_settings', () => { __v4.view.noRender = false; __v4.advance(0.1); });
res.ux.cases = await u.evaluate(() => { __v4.ui.enterCases(); __v4.ui.loadCase('BC', 'A'); __v4.advance(12); return { mode: __v4.ui.mode(), fire: __v4.sim.fire ? '' : __v4.sim.cond.fire, smoke: __v4.sim.cond.smokeZ, fires: __v4.sim.fires.length, rows: document.querySelectorAll('#ctBody tr').length, cur: document.querySelector('#ctBody tr.cur') && document.querySelector('#ctBody tr.cur').dataset.k, rec: document.getElementById('cNow').textContent }; });
ok(res.ux.cases.mode === 'cases' && res.ux.cases.fires === 2 && res.ux.cases.smoke === 'A' && res.ux.cases.rows === 65 && res.ux.cases.cur === 'BC|A' && res.ux.cases.rec.length > 3, 'cases mode: multi-zone fire, drifted smoke, 65-row table ' + JSON.stringify(res.ux.cases));
res.ux.errors = u.errors; ok(u.errors.length === 0, 'ux console errors: ' + u.errors.join(' | '));
await u.close();
const ms = await openPage(b, 390, 844, '?q=mid&story=3&chapter=5&autoplay=0', FILE);
await ms.evaluate(() => { __v4.view.running = false; __v4.advance(3); __v4.ui.snapCam(); __v4.ui.snapCam(); }); await ms.waitForTimeout(400);
await ms.screenshot({ path: 'shots/ux6_mobile_story.png', animations: 'disabled', timeout: 90000 });
res.ux.mobile = await ms.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth }));
ok(res.ux.mobile.scrollW <= res.ux.mobile.innerW, 'mobile story horizontal scroll'); ok(ms.errors.length === 0, 'mobile story errors ' + ms.errors.join('|'));
await ms.close(); await b.close();
console.log(JSON.stringify(res, null, 1)); console.log(fails ? `BROWSER: ${fails} FAILED` : 'BROWSER: all passed'); process.exit(fails ? 1 : 0);

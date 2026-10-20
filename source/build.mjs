// Build: bundles src/main.js (+ three) into one inline HTML. Embeds /home/claude/v4/assets/*.glb as base64 when present, and fonts/*.ttf as subset woff2.
import esbuild from 'esbuild'; import fs from 'fs'; import path from 'path';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const ASSET_DIR = process.env.ASSETS_DIR || '/home/claude/v4/assets';
const names = ['lot', 'cars', 'person'];
const embedded = {}; const sizes = {};
for (const n of names) { const f = path.join(ASSET_DIR, n + '.glb'); if (fs.existsSync(f)) { const b = fs.readFileSync(f); embedded[n] = b.toString('base64'); sizes[n] = b.length; } else embedded[n] = null; }
const assetPlugin = { name: 'assets', setup(b) {
  b.onResolve({ filter: /^virtual:assets$/ }, () => ({ path: 'virtual:assets', namespace: 'assets' }));
  b.onLoad({ filter: /.*/, namespace: 'assets' }, () => ({ contents: 'export default ' + JSON.stringify(embedded) + ';', loader: 'js' }));
} };
const three = path.join(ROOT, 'three_pkg');
const r = await esbuild.build({ entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, minify: !process.env.NOMIN, format: 'iife', write: false, target: 'es2020', legalComments: 'none', plugins: [assetPlugin],
  alias: { three: path.join(three, 'build/three.module.js'), 'three/examples/jsm': path.join(three, 'examples/jsm') }, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const t0 = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
// fonts: IBM Plex Sans KR / Mono embedded as woff2, cut down to the characters the page can show, so it looks the same offline
const FONTS = [['IBM Plex Sans KR', 400, 'IBMPlexSansKR-Regular'], ['IBM Plex Sans KR', 500, 'IBMPlexSansKR-Medium'], ['IBM Plex Sans KR', 600, 'IBMPlexSansKR-SemiBold'], ['IBM Plex Sans KR', 700, 'IBMPlexSansKR-Bold'], ['IBM Plex Mono', 500, 'IBMPlexMono-Medium'], ['IBM Plex Mono', 600, 'IBMPlexMono-SemiBold']];
const FONT_LINK = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
let fontCss = ''; const fontSize = {};
if (fs.existsSync(path.join(ROOT, 'fonts'))) {
  const chars = new Set(); for (let c = 32; c < 127; c++) chars.add(String.fromCharCode(c)); for (const ch of js + t0) if (ch.codePointAt(0) > 127) chars.add(ch);
  const subsetFont = (await import('subset-font')).default; const text = [...chars].join('');
  for (const [fam, w, file] of FONTS) { const src = path.join(ROOT, 'fonts', file + '.ttf'); if (!fs.existsSync(src)) continue; const out = await subsetFont(fs.readFileSync(src), text, { targetFormat: 'woff2' }); fontSize[file] = out.length;
    fontCss += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${out.toString('base64')}) format('woff2')}\n`; }
}
const t = fontCss ? t0.replace(FONT_LINK, () => '<style>\n' + fontCss + '</style>') : t0;
const frag = t.replace('/*BUNDLE*/', () => js);
fs.writeFileSync(path.join(ROOT, 'sim.html'), frag);
const k = frag.indexOf('<style>'); const title = '<title>스마트 대피 시뮬레이션</title>';
const body = frag.replace(title, '');
const SITE = process.env.SITE_URL || 'https://hyunehub.github.io/infinity-exit/';
const DESC = '지하주차장 전기차 화재 때 센서끼리 정보를 나눠 구역별로 안전한 비상계단을 안내하는 3D 시뮬레이터. 화재와 연기 확산 65가지 경우의 수.';
const og = [['og:type', 'website'], ['og:site_name', '∞번 출구'], ['og:title', '∞번 출구: 메시 네트워크 기반 스마트 대피 시스템'], ['og:description', DESC], ['og:url', SITE], ['og:image', SITE + 'og.png'], ['og:image:width', '1200'], ['og:image:height', '630'], ['og:locale', 'ko_KR']]
  .map(([k, v]) => `<meta property="${k}" content="${v}">`).join('\n') + `\n<meta name="description" content="${DESC}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${SITE}og.png">\n<meta name="theme-color" content="#0a0d10">\n`;
const doc = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' + '<title>∞번 출구 스마트 대피 시뮬레이션</title>' + '\n' + og + body.slice(body.indexOf('<style>'), body.indexOf('<div class="app"')) + '</head><body>\n' + body.slice(body.indexOf('<div class="app"')) + '</body></html>';
fs.mkdirSync(path.join(ROOT, 'site'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'site/index.html'), doc);
console.log('sim.html', (frag.length / 1024).toFixed(0) + ' KB', 'site/index.html', (doc.length / 1024).toFixed(0) + ' KB', 'assets:', JSON.stringify(sizes), 'fonts KB:', Object.values(fontSize).map((v) => (v / 1024).toFixed(0)).join('/'));

// Build: bundles src/main.js (+ three) into one inline HTML. Embeds /home/claude/v4/assets/*.glb as base64 when present.
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
const t = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8');
const frag = t.replace('/*BUNDLE*/', () => js);
fs.writeFileSync(path.join(ROOT, 'sim.html'), frag);
const k = frag.indexOf('<style>'); const title = '<title>스마트 대피 시뮬레이션</title>';
const body = frag.replace(title, '');
const doc = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' + title + '\n' + body.slice(body.indexOf('<style>'), body.indexOf('<div class="app"')) + '</head><body>\n' + body.slice(body.indexOf('<div class="app"')) + '</body></html>';
fs.mkdirSync(path.join(ROOT, 'site'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'site/index.html'), doc);
console.log('sim.html', (frag.length / 1024).toFixed(0) + ' KB', 'site/index.html', (doc.length / 1024).toFixed(0) + ' KB', 'assets:', JSON.stringify(sizes));

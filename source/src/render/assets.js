// Loads build-time embedded GLBs (virtual:assets). Missing assets resolve to null (placeholders are used).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import ASSETS from 'virtual:assets';

function b64ToBuf(b64) {
  const bin = atob(b64); const n = bin.length; const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}
export const loadTimes = {};
export const embeddedNames = () => Object.keys(ASSETS).filter((k) => ASSETS[k]);

export async function loadAssets() {
  const out = { lot: null, cars: null, person: null, errors: [] };
  const names = embeddedNames(); if (!names.length) return out;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  { const t0 = performance.now(); try { await MeshoptDecoder.ready; } catch (e) {} loadTimes.meshoptReady = Math.round(performance.now() - t0); }
  await Promise.all(names.map((k) => new Promise((res) => {
    try {
      const t0 = performance.now(); loader.parse(b64ToBuf(ASSETS[k]), '', (g) => { loadTimes[k] = Math.round(performance.now() - t0); out[k] = { scene: g.scene, animations: g.animations || [], gltf: g }; res(); }, (e) => { out.errors.push(k + ': ' + (e && e.message || e)); res(); });
    } catch (e) { out.errors.push(k + ': ' + e.message); res(); }
  })));
  return out;
}
export { THREE };

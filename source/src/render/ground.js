// Cut-away ground section around the car park: the lot sits three storeys underground (floor = B3, -9.6 m).
// Earth fills the sides away from the camera up to street level; the sides facing the camera are cut open so
// the lot and the ramp stay visible. Section faces show soil layers and storey levels.
import * as THREE from 'three';
import { rampZ } from '../sim/world.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const G = 9.6; // street level above the B3 floor (m)
const vs = 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }';
const fs = `uniform float uDark; varying vec3 vW; varying vec3 vN;
  float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
  void main(){
    vec3 n=normalize(vN); float y=vW.y; vec2 q=abs(n.x)>.5?vW.zy:vW.xy; if(n.y>.5) q=vW.xz;
    float nz=vn(q*1.7)*.6+vn(q*5.3)*.4; vec3 col;
    if(n.y>.5 && y>${(G - 0.2).toFixed(2)}){                 // street level: paving
      col=mix(vec3(.23,.24,.25),vec3(.29,.3,.31),nz); float j=step(.96,fract(vW.x*.5))+step(.96,fract(vW.z*.5)); col*=1.-.18*min(j,1.);
    } else {
      // soil layers by height (topsoil, clay, sand and gravel, weathered rock, bedrock)
      float w=y+(nz-.5)*.35+sin(vW.x*.35+vW.z*.2)*.12;
      vec3 c0=vec3(.24,.19,.14), c1=vec3(.40,.30,.21), c2=vec3(.47,.40,.30), c3=vec3(.36,.34,.31), c4=vec3(.26,.26,.27);
      col= w>8.4?c0: w>5.?c1: w>1.6?c2: w>-1.8?c3: c4;
      col*= .82+.36*nz; if(w>1.6&&w<5.) col*= .9+.25*step(.82,vn(q*9.)); if(w<1.6) col*= .9+.2*step(.75,vn(q*3.));
      if(n.y>.5) col*=.78;                                   // cut top surface reads as section
      // storey levels: dashed lines at the slab heights
      for(int k=0;k<4;k++){ float L=float(k)*3.2; float d=abs(y-L); float dash=step(.45,fract((n.y>.5?0.:(abs(n.x)>.5?vW.z:vW.x))*.8));
        col=mix(col,vec3(.92,.9,.82),(1.-smoothstep(.02,.05,d))*dash*step(n.y,.5)*.85); }
    }
    float l=.62+.38*max(0.,dot(n,normalize(vec3(.45,.8,.4)))); col*=l*mix(1.,.35,uDark);
    gl_FragColor=vec4(col,1.); }`;

function box(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
// earth to the right of the ramp, its top following the ramp floor (sim y from 10.3 to 43 -> three z = -y)
function wedge(x0, x1, ya, yb, bottom) {
  const n = 24, pos = [], idx = []; const zt = (y) => Math.max(0, rampZ(y)) - 0.02;
  for (let i = 0; i <= n; i++) { const y = ya + (yb - ya) * i / n, t = zt(y); pos.push(x0, bottom, -y, x1, bottom, -y, x1, t, -y, x0, t, -y); }
  for (let i = 0; i < n; i++) { const a = i * 4, b = a + 4; idx.push(a + 3, a + 2, b + 2, a + 3, b + 2, b + 3, a + 1, b + 1, b + 2, a + 1, b + 2, a + 2, a, a + 3, b + 3, a, b + 3, b, a, b, b + 1, a, b + 1, a + 1); }
  idx.push(0, 1, 2, 0, 2, 3); const e = n * 4; idx.push(e, e + 2, e + 1, e, e + 3, e + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g.toNonIndexed();
}
function levelLabels() { // storey labels on the cut face at the front-left corner
  const W = 512, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const px = (m) => H - 40 - m / 10.4 * (H - 80);
  g.font = '600 46px "IBM Plex Sans KR","Noto Sans KR","Malgun Gothic",sans-serif'; g.textBaseline = 'middle';
  [['지상', '0 m', G], ['B1', '-3.2 m', 6.4], ['B2', '-6.4 m', 3.2], ['B3', '-9.6 m', 0]].forEach(([a, b, h]) => { const y = px(h) - 34; g.fillStyle = 'rgba(16,18,20,.72)'; g.fillRect(14, y - 32, 330, 62); g.fillStyle = '#f2efe6'; g.fillText(a, 30, y); g.fillStyle = '#c9c3b2'; g.font = '500 40px "IBM Plex Mono",monospace'; g.fillText(b, 150, y); g.font = '600 46px "IBM Plex Sans KR","Noto Sans KR","Malgun Gothic",sans-serif'; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Ground {
  constructor(scene) {
    this.mat = new THREE.ShaderMaterial({ uniforms: { uDark: { value: 0 } }, vertexShader: vs, fragmentShader: fs });
    const B = -0.31, D = -3.6, Z1 = 13.6, Z0 = -50, XL = -21, XR = 15.0;
    const parts = [
      box(XL, XR, D, B, Z0, Z1),                // ground under the lot and the ramp
      box(XL, -14.35, B, G, Z0, Z1),             // left side, full height
      box(-14.35, -3.85, B, G, Z0, -10.35),      // behind the lot, left of the ramp
      box(3.85, XR, B, G, Z0, -43.2),            // right of the ramp exit
      box(-3.85, 3.85, B, G - 0.02, Z0, -43.2),  // beyond the ramp exit (street)
      wedge(3.85, XR, 10.35, 43.2, B),           // right of the ramp, cut along the ramp floor
    ];
    this.group = new THREE.Group(); this.group.name = 'GROUND';
    // one mesh for all pieces (one draw call)
    const geo = mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); n.computeVertexNormals(); return n; })); const m = new THREE.Mesh(geo, this.mat); m.frustumCulled = false; this.group.add(m);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 10.4), new THREE.MeshBasicMaterial({ map: levelLabels(), transparent: true, depthWrite: false, toneMapped: false }));
    lab.position.set(XL + 3.2, B + 5.2, Z1 + 0.02); this.group.add(lab); this.label = lab;
    scene.add(this.group);
  }
  setPower(on) { this.mat.uniforms.uDark.value = on ? 0 : 1; this.label.material.opacity = on ? 1 : 0.5; }
}

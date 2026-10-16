// Visual effects: smoke (cloud puffs, contour view, rising particles), fire (shader flames, embers, glow, light), danger rings, flow arrows.
import * as THREE from 'three';
import { FW, FH, FCS, FX0, FY0 } from '../sim/field.js';
import { FIRE_R, rampZ } from '../sim/world.js';

const RAMP_ANG = Math.atan(0.32), RAMP_LEN = Math.hypot(30, 9.6);
const vsPlain = `varying vec3 vW; varying vec2 vUv; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const COMMON = `uniform sampler2D uData; uniform sampler2D uNoise; uniform float uTime; vec2 fuv(vec3 w){ return vec2((w.x-(${FX0.toFixed(1)}))/${(FW * FCS).toFixed(1)}, (-w.z-(${FY0.toFixed(1)}))/${(FH * FCS).toFixed(1)}); }`;

export function makeNoiseTexture() {
  const N = 128, d = new Uint8Array(N * N * 4); const rnd = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  const lat = (k) => { const g = new Float32Array(k * k); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const octs = [[8, 0.5], [16, 0.3], [32, 0.2]].map(([k, w]) => ({ k, w, g: lat(k) }));
  const val = (o, x, y, off) => { const fx = x * o.k, fy = y * o.k; const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); const g = (i, j) => o.g[(((j + off) % o.k + o.k) % o.k) * o.k + ((i % o.k) + o.k) % o.k]; return (g(i0, j0) * (1 - sx) + g(i0 + 1, j0) * sx) * (1 - sy) + (g(i0, j0 + 1) * (1 - sx) + g(i0 + 1, j0 + 1) * sx) * sy; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let a = 0, b = 0; for (const o of octs) { a += o.w * val(o, i / N, j / N, 0); b += o.w * val(o, i / N + 0.37, j / N + 0.11, 3); }
    const p = (j * N + i) * 4; d[p] = Math.min(255, a * 255 * 1.35); d[p + 1] = Math.min(255, b * 255 * 1.35); d[p + 2] = 128; d[p + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

export class FX {
  constructor(scene, field) {
    this.scene = scene; this.field = field; this.noise = makeNoiseTexture(); this.t = 0; this.opacity = 0.7; this.xray = false; this.showFlow = true; this.showRing = true; this.partScale = 1; this.layers = 1;
    this.data = new Uint8Array(FW * FH * 4); for (let i = 3; i < this.data.length; i += 4) this.data[i] = 255;
    this.dataTex = new THREE.DataTexture(this.data, FW, FH, THREE.RGBAFormat); this.dataTex.magFilter = this.dataTex.minFilter = THREE.LinearFilter; this.dataTex.wrapS = this.dataTex.wrapT = THREE.ClampToEdgeWrapping; this.dataTex.needsUpdate = true; this.dataVer = -1;
    this.U = { uData: { value: this.dataTex }, uNoise: { value: this.noise }, uTime: { value: 0 }, uOpacity: { value: this.opacity }, uFires: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -50, 0, 0)) }, uMode: { value: 0 }, uDark: { value: 0 } };
    this.fires = []; this._buildSmoke(); this._buildFire(); this._buildRings(); this._buildDanger(); this._buildFlow(); this._buildSpread();
  }
  // ---------------------------------------------------------------- smoke
  _hazeMat() {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, this.U), vertexShader: vsPlain, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: {},
      fragmentShader: `${COMMON} uniform float uOpacity, uMode; varying vec3 vW; varying vec2 vUv;
      void main(){ vec2 uv=fuv(vW); if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) discard; vec4 d=texture2D(uData,uv); float c=d.r*40.; float th=d.g*3.2;
        float low=c*0.92*smoothstep(1.5,2.3,th);
        if(uMode<0.5){ float a=clamp(low/22.,0.,1.)*0.30*uOpacity; if(a<0.004) discard; gl_FragColor=vec4(vec3(.42,.38,.33),a); }
        else { float lv=c<3.?0.:(c<8.?1.:(c<15.?2.:3.)); if(lv<0.5) discard; vec3 col=lv<1.5?vec3(1.,.85,.1):(lv<2.5?vec3(1.,.5,.05):vec3(.95,.1,.1));
          float e=min(min(abs(c-3.),abs(c-8.)),abs(c-15.)); float line=1.-smoothstep(0.,fwidth(c)*1.6+0.05,e); gl_FragColor=vec4(mix(col,vec3(1.),line*0.6),0.34+0.4*line); } }`,
    });
  }
  _buildSmoke() {
    this._buildPuffs();
    this.hazeMat = this._hazeMat();
    this.hazeLot = new THREE.Mesh(new THREE.PlaneGeometry(28, 20), this.hazeMat); this.hazeLot.rotation.x = -Math.PI / 2; this.hazeLot.position.y = 0.04; this.hazeLot.renderOrder = 3; this.hazeLot.frustumCulled = false; this.scene.add(this.hazeLot);
    this.hazeRamp = new THREE.Mesh(new THREE.PlaneGeometry(7, RAMP_LEN), this.hazeMat); this.hazeRamp.rotation.x = -Math.PI / 2 + RAMP_ANG; this.hazeRamp.position.set(0, 4.8 + 0.06, -26); this.hazeRamp.renderOrder = 3; this.hazeRamp.frustumCulled = false; this.scene.add(this.hazeRamp);
    // particles
    const N = 300; this.PN = N; this.pp = new Float32Array(N * 3); this.pv = new Float32Array(N * 3); this.pa = new Float32Array(N); this.ps = new Float32Array(N); this.page = new Float32Array(N).fill(99); this.plife = new Float32Array(N).fill(1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pp, 3)); g.setAttribute('aA', new THREE.BufferAttribute(this.pa, 1)); g.setAttribute('aS', new THREE.BufferAttribute(this.ps, 1)); this.pk = new Float32Array(N); g.setAttribute('aK', new THREE.BufferAttribute(this.pk, 1));
    this.partMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 }, uOpacity: this.U.uOpacity, uDark: this.U.uDark, uNoise: { value: this.noise }, uTime: this.U.uTime }, vertexShader: `attribute float aA; attribute float aS; attribute float aK; uniform float uScale; varying float vA; varying float vK; varying float vR; void main(){ vA=aA; vK=aK; vR=fract(position.x*3.1+position.z*1.7); vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aS*uScale/max(0.5,-mv.z); gl_Position=projectionMatrix*mv; }`, fragmentShader: `uniform float uOpacity, uDark, uTime; uniform sampler2D uNoise; varying float vA; varying float vK; varying float vR; void main(){ vec2 q=gl_PointCoord-.5; float d=length(q); float n=texture2D(uNoise,q*.45+vec2(vR,vR*1.7)+uTime*.01).r; float a=smoothstep(.5,.0,d+(n-.5)*.35)*vA*uOpacity; if(a<.003) discard; vec3 col=mix(vec3(.3,.27,.25),vec3(.62,.6,.58),vK)*(.8+.4*n); col+=vec3(.3,.1,.0)*pow(max(0.,1.-vK*2.),2.); gl_FragColor=vec4(col*mix(1.,.5,uDark),a); }` });
    this.points = new THREE.Points(g, this.partMat); this.points.frustumCulled = false; this.points.renderOrder = 6; this.scene.add(this.points); this.pcur = 0;
  }
  // Smoke as soft cloud puffs on a 1.25 m grid (lot) / 1.4 x 1.6 m (ramp). Each spot has an upper puff under the ceiling and a
  // lower one that sinks as the smoke layer thickens. Opacity follows the smoke field and eases in, so the cloud visibly spreads.
  _cloudAtlas() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2; const g = c.getContext('2d'); let sd = 7; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let v = 0; v < 4; v++) { const ox = (v % 2) * S, oy = (v >> 1) * S;
      for (let k = 0; k < 16; k++) { const ang = r() * 6.283, rad = r() * S * 0.22, x = ox + S / 2 + Math.cos(ang) * rad, y = oy + S / 2 + Math.sin(ang) * rad * 0.8, R0 = S * (0.14 + r() * 0.16);
        const gr = g.createRadialGradient(x, y, 0, x, y, R0); gr.addColorStop(0, `rgba(255,255,255,${0.32 + r() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(ox, oy, S, S); } }
    const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
  }
  _buildPuffs() {
    const spots = []; for (let x = -13.1; x <= 13.2; x += 1.25) for (let y = -9.4; y <= 9.5; y += 1.25) spots.push([x, y]); for (let x = -2.8; x <= 2.81; x += 1.4) for (let y = 10.8; y <= 41; y += 1.6) spots.push([x, y]);
    const N = spots.length * 2; this.puffN = N; this.puffSpots = spots; this.puffT = new Float32Array(N); this.puffA = new Float32Array(N); this.puffY = new Float32Array(N);
    const geo = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1); geo.index = q.index; geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv);
    this.pP = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.pA = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); this.pS = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
    let sd = 11; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < N; i++) { const [x, y] = spots[i >> 1]; this.pP.setXYZ(i, x + (rnd() - 0.5) * 0.7, 0, -(y + (rnd() - 0.5) * 0.7)); this.pS.setX(i, rnd()); }
    geo.setAttribute('aP', this.pP); geo.setAttribute('aA', this.pA); geo.setAttribute('aS', this.pS); geo.instanceCount = N;
    this.puffMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: Object.assign({ uCloud: { value: this._cloudAtlas() } }, this.U),
      vertexShader: `attribute vec3 aP; attribute float aA; attribute float aS; uniform float uTime; varying vec2 vUv; varying float vA; varying float vS; varying vec3 vW;
        void main(){ vA=aA; vS=aS; float t=uTime*(.05+.05*aS)+aS*6.28; vec3 c=aP+vec3(sin(t)*.35,sin(t*1.3)*.08,cos(t*.8)*.35); vW=c;
          float sz=(2.4+aS*1.1)*(.75+.25*min(1.,aA*2.5)); float ang=t*.6; vec2 p=position.xy*sz; p=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*p; vUv=uv;
          vec4 mv=viewMatrix*vec4(c,1.); mv.xy+=p; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uCloud; uniform float uOpacity,uDark; uniform vec4 uFires[4]; varying vec2 vUv; varying float vA; varying float vS; varying vec3 vW;
        void main(){ float v=floor(vS*4.); vec2 o=vec2(mod(v,2.),floor(v/2.))*.5; float a=texture2D(uCloud,o+vUv*.5).a*vA*uOpacity*1.15; if(a<.004) discard;
          float sh=texture2D(uCloud,o+vUv*.5+vec2(.0,.03)).a;                      // cheap self-shadow: darker underside
          vec3 col=mix(vec3(.42,.41,.39),vec3(.2,.19,.18),clamp(sh*1.2,0.,1.)*.6+clamp(vA*.7,0.,.4));
          float g=0.; for(int i=0;i<4;i++) g+=exp(-distance(vW.xz,vec2(uFires[i].x,uFires[i].z))/5.)*step(.001,uFires[i].w);
          col+=vec3(.55,.22,.05)*g*.7; col*=mix(1.,.45,uDark); gl_FragColor=vec4(col,min(a,.5)); }` });
    this.puffs = new THREE.Mesh(geo, this.puffMat); this.puffs.frustumCulled = false; this.puffs.renderOrder = 5; this.scene.add(this.puffs); this.puffClock = 0;
  }
  resetSmoke() { this.puffSimT = null; this.pA.array.fill(0); const P = this.pP.array; for (let i = 1; i < P.length; i += 3) P[i] = 0; this.pA.needsUpdate = this.pP.needsUpdate = true; this.puffDirty = true; }
  _updatePuffs(dt, simT) {
    const F = this.field, sp = this.puffSpots, N = this.puffN; this.puffClock += dt; const jump = this.puffSimT == null || Math.abs(simT - this.puffSimT) > 0.6; this.puffSimT = simT; if (jump) this.puffDirty = true;
    if (this.puffClock > 0.2 || this.puffDirty) { this.puffClock = 0; this.puffDirty = false; // targets from the field (5 Hz)
      for (let i = 0; i < sp.length; i++) { const [x, y] = sp[i]; const k = F.idx(x, y); let c = 0, th = 0; if (k >= 0 && F.air[k]) { c = F.c[k]; th = F.th[k]; }
        const ceil = y > 10.5 ? rampZ(y) + 2.9 : 3.15; const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const top = ss(0.5, 6, c), low = this.layers < 0.7 ? 0 : ss(1.5, 12, c) * ss(0.9, 2.3, th);
        const keep = this.layers >= 0.7 || (i & 1) === 0 ? 1 : 0; // low quality: every other spot, slightly larger
        this.puffT[i * 2] = top * 0.85 * keep * (this.layers < 0.7 ? 1.25 : 1); this.puffY[i * 2] = ceil - 0.35 - 0.25 * Math.min(1, th); this.puffT[i * 2 + 1] = low * 0.8 * keep; this.puffY[i * 2 + 1] = ceil - Math.max(0.9, th * 0.78); }
    }
    const A = this.pA.array, P = this.pP.array, rate = jump ? 1 : Math.min(1, dt * 1.6), yr = jump ? 1 : Math.min(1, dt * 0.8);
    for (let i = 0; i < N; i++) { A[i] += (this.puffT[i] - A[i]) * rate; P[i * 3 + 1] = P[i * 3 + 1] === 0 ? this.puffY[i] : P[i * 3 + 1] + (this.puffY[i] - P[i * 3 + 1]) * yr; }
    this.pA.needsUpdate = true; this.pP.needsUpdate = true;
  }
  // ---------------------------------------------------------------- fire
  _buildFire() {
    const quad = (ang) => { const g = new THREE.PlaneGeometry(1.7, 2.7); g.translate(0, 1.35, 0); g.rotateY(ang); return g; };
    const geo = new THREE.BufferGeometry(); const gs = [quad(0)];  // single quad: billboarded to the camera each frame (keeps the flame tall from the overview angle)
    // merge manually (pos/uv/index)
    const pos = [], uv = [], idx = []; let off = 0; for (const g of gs) { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); } for (const i of g.index.array) idx.push(i + off); off += p.count; }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mkFlame = (seed) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uNoise: { value: this.noise }, uTime: this.U.uTime, uInt: { value: 0 }, uSeed: { value: seed } }, vertexShader: vsPlain,
      fragmentShader: `uniform sampler2D uNoise; uniform float uTime,uInt,uSeed; varying vec2 vUv;
      void main(){ float h=vUv.y; float x=(vUv.x-.5)*2.;
        float t=uTime*(1.+fract(uSeed*.37)*.4);
        float n=texture2D(uNoise,vec2(vUv.x*.7+uSeed,h*.55-t*.75)).r; float n2=texture2D(uNoise,vec2(vUv.x*1.6-uSeed,h*1.3-t*1.25)).g;
        float sway=(n-.5)*.55*h*h;                                    // tips wander more than the base
        float width=mix(.95,.05,pow(h,.7)); float d=abs(x+sway)+(n2-.5)*.35*h;
        float body=1.-smoothstep(width*.35,width,d);
        float top=1.-smoothstep(.45,.98,h+(n2-.5)*.55);
        float base=smoothstep(0.,.22,h);                               // no hard cut at the bottom
        float f=body*top*base; if(f<.004) discard;
        float core=smoothstep(.45,1.,f*(1.25-h));
        vec3 c=mix(vec3(.9,.12,.02),vec3(1.,.55,.1),smoothstep(.1,.6,f)); c=mix(c,vec3(1.,.9,.6),core);
        gl_FragColor=vec4(c*f*uInt,1.); }` });
    const glowMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uInt: { value: 0 }, uTime: this.U.uTime }, vertexShader: vsPlain,
      fragmentShader: `uniform float uInt,uTime; varying vec2 vUv; void main(){ float d=length(vUv-.5)*2.; float a=smoothstep(1.,0.,d); a*=a; float fl=.85+.15*sin(uTime*13.)*sin(uTime*7.3); gl_FragColor=vec4(vec3(1.,.42,.1)*a*uInt*fl*.8,a*uInt*.7); }` });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); g.visible = false;
      // each tongue is drawn twice: depth-tested (correct in front of / behind things) and a faint copy that shows through beams
      const tongues = [], ghosts = []; for (let k = 0; k < 6; k++) { const mt = mkFlame(k * 1.913 + i * 5.1); const m = new THREE.Mesh(geo, mt); m.renderOrder = 7; m.frustumCulled = false; g.add(m); tongues.push(m);
        const gm = mt.clone(); gm.depthTest = false; gm.uniforms = Object.assign({}, mt.uniforms, { uInt: { value: 0 } }); const gh = new THREE.Mesh(geo, gm); gh.renderOrder = 6; gh.frustumCulled = false; m.add(gh); ghosts.push(gh); }
      const flame = tongues[0];
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), glowMat()); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.07; glow.renderOrder = 4; glow.frustumCulled = false; g.add(glow);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: { uInt: { value: 0 }, uTime: this.U.uTime }, vertexShader: vsPlain,
        fragmentShader: `uniform float uInt,uTime; varying vec2 vUv; void main(){ float d=length(vUv-vec2(.5,.45))*2.; float a=smoothstep(1.,0.,d); a=a*a; float fl=.85+.15*sin(uTime*11.)*sin(uTime*6.1); gl_FragColor=vec4(vec3(1.,.5,.12)*a*uInt*fl,1.); }` })); halo.position.y = 1.8; halo.renderOrder = 6; halo.frustumCulled = false; g.add(halo);
      // embers
      const N = 70, ep = new Float32Array(N * 3), ev = new Float32Array(N * 3), el = new Float32Array(N); for (let k = 0; k < N; k++) el[k] = Math.random() * 2;
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
      const em = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uInt: { value: 0 }, uScale: this.partMat.uniforms.uScale }, vertexShader: `uniform float uScale; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=0.1*uScale/max(.5,-mv.z); gl_Position=projectionMatrix*mv; }`, fragmentShader: `uniform float uInt; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d)*uInt; gl_FragColor=vec4(1.,.55,.15,1.)*a; }` });
      const pts = new THREE.Points(eg, em); pts.frustumCulled = false; pts.renderOrder = 7; g.add(pts);
      const light = new THREE.PointLight(0xff7a2a, 0, 12, 1.6); light.position.set(0, 1.6, 0); g.add(light);
      this.scene.add(g); this.fires.push({ g, flame, tongues, ghosts, glow, halo, pts, ep, ev, el, light, active: false, id: null, t0: 0, size: 0 });
    }
  }
  _buildRings() {
    const mk = () => new THREE.Mesh(new THREE.RingGeometry(FIRE_R - 0.09, FIRE_R, 128, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: this.U.uTime }, vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`, fragmentShader: `uniform float uTime; varying vec2 vP; void main(){ float a=atan(vP.y,vP.x); float d=step(.5,fract(a*9./3.14159+uTime*.3)); gl_FragColor=vec4(1.,.25,.2,.85*d); }` }));
    this.rings = [mk(), mk(), mk(), mk()]; for (const r of this.rings) { r.rotation.x = -Math.PI / 2; r.position.y = 0.07; r.visible = false; r.renderOrder = 4; r.frustumCulled = false; this.scene.add(r); }
  }
  // Danger map painted on the floor: the 5 m no-go disc around a burning car.
  _buildDanger() {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
      uniforms: Object.assign({ uR: { value: FIRE_R } }, this.U), vertexShader: vsPlain,
      fragmentShader: `${COMMON} uniform vec4 uFires[4]; uniform float uR, uDark; varying vec3 vW;
        float sst(float a,float b,float x){ return smoothstep(a,b,x); }
        void main(){ vec2 uv=fuv(vW); vec4 col=vec4(0.);
          // burning cars: filled no-go disc, stronger toward the car
          for(int i=0;i<4;i++){ vec4 F=uFires[i]; if(F.w<=0.) continue; float r=distance(vW.xz,vec2(F.x,F.z));
            float inside=1.-sst(uR-.15,uR,r); float a=inside*(.26+.34*pow(1.-r/uR,1.2))*(.85+.15*sin(uTime*4.));
            col=vec4(vec3(1.,.16,.1),max(col.a,a)); }
          if(col.a<.01) discard; gl_FragColor=vec4(col.rgb*mix(1.,.8,uDark),col.a); }` });
    this.dangerMat = mat;
    this.dangerLot = new THREE.Mesh(new THREE.PlaneGeometry(28, 20), mat); this.dangerLot.rotation.x = -Math.PI / 2; this.dangerLot.position.y = 0.035; this.dangerLot.renderOrder = 2; this.dangerLot.frustumCulled = false; this.scene.add(this.dangerLot);
    this.dangerRamp = new THREE.Mesh(new THREE.PlaneGeometry(7, RAMP_LEN), mat); this.dangerRamp.rotation.x = -Math.PI / 2 + RAMP_ANG; this.dangerRamp.position.set(0, 4.8 + 0.05, -26); this.dangerRamp.renderOrder = 2; this.dangerRamp.frustumCulled = false; this.scene.add(this.dangerRamp);
  }
  _buildFlow() {
    const sh = new THREE.Shape(); sh.moveTo(0.6, 0); sh.lineTo(0.15, 0.22); sh.lineTo(0.15, 0.08); sh.lineTo(-0.6, 0.08); sh.lineTo(-0.6, -0.08); sh.lineTo(0.15, -0.08); sh.lineTo(0.15, -0.22); sh.closePath();
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
    this.flowPts = []; for (let x = -12; x <= 12; x += 4) for (let y = -8; y <= 8; y += 4) this.flowPts.push([x, y]); for (let y = 14; y <= 38; y += 6) this.flowPts.push([0, y]);
    this.flow = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xe8eef5, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), this.flowPts.length); this.flow.renderOrder = 6; this.flow.frustumCulled = false; this.flow.count = 0; this.scene.add(this.flow);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this.flowT = 0;
  }
  _buildSpread() {
    const g = new THREE.Group(); const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), new THREE.MeshBasicMaterial({ color: 0xff9a2a })); cyl.rotation.z = Math.PI / 2; cyl.position.x = 0.5; g.add(cyl);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 12), new THREE.MeshBasicMaterial({ color: 0xff9a2a })); cone.rotation.z = -Math.PI / 2; cone.position.x = 1.35; g.add(cone); this.spread = g; g.visible = false; g.position.y = 2.2; this.scene.add(g); g.traverse((o) => { o.renderOrder = 9; });
  }
  setSpread(F, sp) { if (!F || !sp || !sp.valid) { this.spread.visible = false; return; } this.spread.visible = this.showFlow; this.spread.position.set(F.x, 2.2, -F.y); this.spread.rotation.y = Math.atan2(sp.vy, sp.vx); const L = 3 + sp.v * 5; this.spread.scale.set(L / 1.75, 1, 1); }

  // ---------------------------------------------------------------- update
  syncFires(sim) {
    const now = sim.t;
    for (let i = 0; i < 4; i++) {
      const f = this.fires[i], s = sim.fires[i];
      if (s) { f.active = true; f.id = s.id; f.x = s.x; f.y = s.y; f.t0 = s.t0; f.alongZ = s.id === 'carR'; f.g.visible = true; f.g.position.set(s.x, 0, -s.y); this.rings[i].visible = this.showRing; this.rings[i].position.set(s.x, 0.07, -s.y); }
      else { f.active = false; f.g.visible = false; this.rings[i].visible = false; f.light.intensity = 0; }
    }
    this.fires.forEach((f, i) => this.U.uFires.value[i].set(f.active ? f.x : 0, -50, f.active ? -f.y : 0, f.active ? Math.max(0.05, f.size) : 0));
  }
  update(dt, sim, camera, power) {
    this.t += dt; this.U.uTime.value = this.t; this.U.uOpacity.value = this.opacity; this.U.uMode.value = this.xray ? 1 : 0; this.U.uDark.value = power ? 0 : 1;
    // data texture
    const F = this.field; if (F.version !== this.dataVer) {
      this.dataVer = F.version; const d = this.data, c = F.c, th = F.th; for (let i = 0, n = FW * FH; i < n; i++) { const v = c[i] * 6.375; d[i * 4] = v > 255 ? 255 : v; d[i * 4 + 1] = th[i] * 79.6; }
      this.dataTex.needsUpdate = true;
    }
    this.puffs.visible = !this.xray; this.points.visible = !this.xray; this._updatePuffs(dt, sim.t); this.dangerLot.visible = this.dangerRamp.visible = this.showRing && !this.xray;
    this.hazeMat.uniforms.uMode.value = 1; this.hazeLot.visible = this.hazeRamp.visible = this.xray;
    // fire
    for (let i = 0; i < 4; i++) {
      const f = this.fires[i]; if (!f.active) continue; const age = sim.t - f.t0; f.size = Math.max(0, Math.min(1, age / 25)); const sz = f.size; const vis = 0.62 + 0.38 * Math.min(1, age / 10);   // flames are clearly visible right after ignition
      const fl = 0.85 + 0.15 * Math.sin(this.t * 17 + i) * Math.sin(this.t * 9.3) + 0.08 * Math.sin(this.t * 31);
      // tongues spread along the car body; the middle ones are tallest, each flickers on its own phase
      const cdx = camera.position.x - f.g.position.x, cdz = camera.position.z - f.g.position.z, elv = Math.atan2(camera.position.y - 1.5, Math.hypot(cdx, cdz));
      this._e.set(Math.min(0.55, Math.max(0, elv) * 0.5), Math.atan2(cdx, cdz), 0, 'YXZ'); const fq = this._q2 || (this._q2 = new THREE.Quaternion()); fq.setFromEuler(this._e); this._e.order = 'XYZ';
      const OFF = [-1.55, -0.95, -0.3, 0.3, 0.95, 1.55], HGT = [0.62, 0.86, 1.0, 0.95, 0.8, 0.58];
      f.tongues.forEach((m, k) => { const ph = Math.sin(this.t * (7 + k * 1.3) + k * 2.1) * 0.5 + Math.sin(this.t * (13 + k) + k) * 0.5; const sp = 0.55 + 0.45 * vis; const o = OFF[k] * sp;
        m.material.uniforms.uInt.value = vis * 2.0 * (power ? 1 : 1.2); f.ghosts[k].material.uniforms.uInt.value = vis * 0.6 * Math.max(0, Math.min(1, (elv - 0.55) / 0.35)); const hs = (0.5 + 0.55 * vis) * HGT[k] * (1 + 0.07 * ph); m.scale.set(0.7 + 0.25 * vis, hs, 1);
        if (f.alongZ) m.position.set(0.15 * Math.sin(k * 2.3), 0.95, o); else m.position.set(o, 0.95, 0.15 * Math.sin(k * 2.3)); m.quaternion.copy(fq); });
      f.glow.material.uniforms.uInt.value = vis * 2.4; f.light.intensity = vis * (70 + 30 * fl) * (power ? 1 : 1.5); f.light.position.y = 1.9 + 0.25 * fl; f.light.distance = 14;
      f.pts.material.uniforms.uInt.value = vis * 1.6; f.halo.material.uniforms.uInt.value = vis * 0.5; f.halo.quaternion.copy(camera.quaternion);
      // embers
      const N = f.el.length, ep = f.ep, ev = f.ev, el = f.el;
      for (let k = 0; k < N; k++) {
        el[k] -= dt; if (el[k] <= 0) { el[k] = 0.8 + Math.random() * 1.6; ep[k * 3] = (Math.random() - 0.5) * 1.8; ep[k * 3 + 1] = 0.7 + Math.random() * 0.4; ep[k * 3 + 2] = (Math.random() - 0.5) * 1.2; ev[k * 3] = (Math.random() - 0.5) * 0.9; ev[k * 3 + 1] = 1.3 + Math.random() * 1.6; ev[k * 3 + 2] = (Math.random() - 0.5) * 0.9; }
        ep[k * 3] += ev[k * 3] * dt; ep[k * 3 + 1] += ev[k * 3 + 1] * dt; ep[k * 3 + 2] += ev[k * 3 + 2] * dt; ev[k * 3] += (Math.random() - 0.5) * dt * 3; ev[k * 3 + 2] += (Math.random() - 0.5) * dt * 3;
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
      // smoke particles spawn
      const rate = (0.25 + sz) * 34 * this.partScale; let spawn = rate * dt + (f.carry || 0); f.carry = spawn % 1; spawn = Math.floor(spawn);
      for (; spawn > 0; spawn--) this._spawn(f);
    }
    // particles
    const N = this.PN, pp = this.pp, pv = this.pv, pa = this.pa, ps = this.ps, age = this.page, life = this.plife; const Fd = this.field;
    for (let k = 0; k < N; k++) {
      if (age[k] >= life[k]) { pa[k] = 0; continue; } age[k] += dt; const x = pp[k * 3], z = pp[k * 3 + 2], y = pp[k * 3 + 1];
      const fi = Fd.idx(x, -z);
      if (y < 2.75) { pv[k * 3 + 1] += (0.32 - pv[k * 3 + 1]) * dt * 0.8; } else { pv[k * 3 + 1] *= 0.9; const ux = fi >= 0 ? Fd.ux[fi] + Fd.jetK * Fd.jx[fi] : 0, uy = fi >= 0 ? Fd.uy[fi] + Fd.jetK * Fd.jy[fi] : 0; pv[k * 3] += (ux * 1.2 - pv[k * 3]) * dt * 1.2; pv[k * 3 + 2] += (-uy * 1.2 - pv[k * 3 + 2]) * dt * 1.2; }
      pp[k * 3] += pv[k * 3] * dt; pp[k * 3 + 1] = Math.min(3.05, y + pv[k * 3 + 1] * dt); pp[k * 3 + 2] += pv[k * 3 + 2] * dt;
      const u = age[k] / life[k]; pa[k] = Math.min(1, u * 4) * (1 - u) * (1.3 - 0.5 * u); ps[k] = 1.1 + u * 3.8; this.pk[k] = Math.min(1, u * 1.4);
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aA.needsUpdate = true; this.points.geometry.attributes.aS.needsUpdate = true; this.points.geometry.attributes.aK.needsUpdate = true;
    // flow arrows (5 Hz)
    this.flowT += dt; if (this.flowT > 0.2) { this.flowT = 0; this._updateFlow(); }
  }
  _spawn(f) {
    const k = this.pcur; this.pcur = (this.pcur + 1) % this.PN; const p = this.pp, v = this.pv;
    const ax = f.alongZ ? 0.8 : 3.0, az = f.alongZ ? 3.0 : 0.8; p[k * 3] = f.x + (Math.random() - 0.5) * ax; p[k * 3 + 1] = 1.2 + Math.random() * 0.5; p[k * 3 + 2] = -f.y + (Math.random() - 0.5) * az;
    v[k * 3] = (Math.random() - 0.5) * 0.3; v[k * 3 + 1] = 0.2 + Math.random() * 0.25; v[k * 3 + 2] = (Math.random() - 0.5) * 0.3; this.page[k] = 0; this.plife[k] = 5 + Math.random() * 5;
  }
  _updateFlow() {
    const F = this.field; let n = 0; const on = this.showFlow;
    for (let i = 0; i < this.flowPts.length; i++) {
      const [x, y] = this.flowPts[i]; const k = F.idx(x, y); if (k < 0 || !F.air[k] || !on) continue; const c = F.c[k]; if (c < 2.0) continue;
      const vx = F.ux[k] + F.jetK * F.jx[k], vy = F.uy[k] + F.jetK * F.jy[k], sp = Math.hypot(vx, vy); if (sp < 0.05) continue;
      const s = Math.min(1.5, 0.5 + sp * 1.2) * Math.min(1, 0.4 + c / 12);
      this._e.set(0, Math.atan2(vy, vx), 0); this._q.setFromEuler(this._e); this._v.set(x, (y > 11 ? rampZ(y) : 0) + 2.75, -y); this._s.set(s, 1, s); this._m.compose(this._v, this._q, this._s); this.flow.setMatrixAt(n++, this._m);
    }
    this.flow.count = n; this.flow.instanceMatrix.needsUpdate = true;
  }
  paintBurn(sim, carObjs) {
    for (const f of sim.fires) { const o = carObjs[f.id]; if (!o || !(o.paint || o.burn)) continue; const a = Math.min(1, Math.max(0, (sim.t - f.t0) / 22)); if (o.burn) { o.burn(a, this.t); continue; } o.paint.color.copy(o.base).lerp(o.char, a * 0.92); o.paint.emissive.setRGB(0.5 * a * (0.8 + 0.2 * Math.sin(this.t * 9)), 0.12 * a, 0); }
  }
  setQuality(q) { this.layers = q.layers; this.partScale = q.particles; this.puffDirty = true; }
}

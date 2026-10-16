import { Sim, PRESETS } from '../src/sim/sim.js';
const s = new Sim(); const id = +process.argv[2]||1; const T=+process.argv[3]||60;
s.preset(id-1);
const t0=Date.now();
for (let t of [5,10,15,20,30,45,60,90,120].filter(x=>x<=T)) {
  s.advance(t - s.t);
  const sn = s.snapshot();
  console.log('t='+s.t.toFixed(0), JSON.stringify(sn.exits), 'mode', sn.rec.mode, '| M:', sn.guide.M && sn.guide.M.target, 'A:',sn.guide.A&&sn.guide.A.target,'B:',sn.guide.B&&sn.guide.B.target,'C:',sn.guide.C&&sn.guide.C.target,'D:',sn.guide.D&&sn.guide.D.target);
  console.log('   why', JSON.stringify(sn.why), 'stats', JSON.stringify(sn.stats));
}
console.log('ms', Date.now()-t0);
const n=s.nodes; console.log(['A','B','C','D','M','E1','E2','E3','E4','R0','R1','R2','R3','S1','S2'].map(k=>k+':'+n[k].ceil.toFixed(1)+'/'+n[k].stage+(n[k].t1!=null?'@'+n[k].t1.toFixed(0):'')).join(' '));
const sp=n.M.dec.spread; console.log('spread', JSON.stringify(sp));
console.log(s.agents.map(a=>a.state+':'+(a.target||'')).join(' '));
console.log(s.log.slice(0,12).map(l=>l.t.toFixed(1)+' '+l.text).reverse().join('\n'));

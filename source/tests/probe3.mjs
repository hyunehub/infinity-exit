import { Sim } from '../src/sim/sim.js';
const s = new Sim(); s.preset(+process.argv[2]-1);
for (let t=1;t<=40;t+=1){ s.advance(1); const d=s.nodes.E4.dec, m=s.nodes.M.dec; const a=(x)=>x.valid?(Math.atan2(x.vy,x.vx)*180/Math.PI).toFixed(0)+'/'+x.v.toFixed(2)+'n'+x.n:'inv'; console.log(t,'E4',a(d.spread),d.exits.E4.s,d.exits.E4.cand,'M',a(m.spread),m.exits.E4.cand,'D',a(s.nodes.D.dec.spread), s.nodes.D.dec.exits.E4.cand); }

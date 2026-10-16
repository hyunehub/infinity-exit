import { Sim } from '../src/sim/sim.js';
const s = new Sim(); s.preset(+process.argv[2]-1);
for (let t=5;t<=90;t+=5){ s.advance(5); const sp=s.nodes.M.dec.spread; const ang=sp.valid?Math.atan2(sp.vy,sp.vx)*180/Math.PI:null;
 const n=s.nodes; console.log(t, sp.valid?('ang '+ang.toFixed(0)+' v '+sp.v.toFixed(2)+' n'+sp.n):'inv', ['A','B','M','D','R0','R1','E2','E4','S2'].map(k=>k+':'+n[k].ceil.toFixed(1)+(n[k].t1!=null?'@'+n[k].t1.toFixed(0)+'r'+n[k].rise.toFixed(2):'')).join(' ')); }

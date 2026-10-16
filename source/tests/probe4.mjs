import { Sim } from '../src/sim/sim.js';
const s = new Sim(); s.preset(4); s.advance(10);
const d=s.nodes.B.dec; console.log(d.mode,d.target,d.kind, JSON.stringify(d.exits), s.nav.snap(7,5), s.nav.cx(s.nav.snap(7,5)),s.nav.cy(s.nav.snap(7,5)));
const hz=s.nodes.B.hzBuf; const c=s.nav.snap(7,5); console.log('hz',hz[c], s.nav.dist[c]);

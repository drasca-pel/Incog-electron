const I = require('./load.js');
let fail = 0;
const ok = (name, cond, extra='') => { console.log((cond?'PASS ':'FAIL ')+name+' '+extra); if(!cond) fail++; };
const near = (a,b,t=1e-4)=>Math.abs(a-b)<=t*Math.max(1,Math.abs(b));
const run = (id)=>{ const ex=I.examples.list.find(e=>e.id===id); const c=I.examples.build(ex); return {c, nl:I.buildNetlist(c), ex}; };

// divider
{ const {nl}=run('divider'); const s=I.solve(nl,{mode:'dc'}); ok('divider V(B)=8', near(s.nodeV('B').re,8), s.nodeV('B').re); ok('no warnings', nl.warnings.length===0, JSON.stringify(nl.warnings)); }
// superposition circuit
{ const {nl}=run('superposition'); const r=I.theorems.get('superposition').run(nl,{mode:'dc'}); ok('superposition holds', r.ok);
  const s=I.solve(nl,{mode:'dc'}); const tb=I.analysis.kclTable(nl,s); ok('KCL', tb.every(r=>I.Cx.abs(r.sum)<1e-9)); }
// thevenin: V1=24,R1=6,R2=12 ; Vth = 24*12/18=16 ; Rth=6||12 + 4 = 8 ; IL = 16/16=1A
{ const {c,nl}=run('thevenin'); const rl=nl.elementByLabel('RL'); const r=I.theorems.get('thevenin').run(nl,{mode:'dc',loadId:rl.comp.id});
  ok('thevenin verdict', r.ok); const kv=r.blocks.find(b=>b.type==='kv'); console.log(kv.rows.map(x=>x.join(': ')).join(' | ')); }
{ const {nl}=run('thevenin'); const rl=nl.elementByLabel('RL'); const th=I.analysis.thevenin(nl,rl.nodes[0],rl.nodes[1],{mode:'dc',remove:[rl.comp.id]}); ok('Vth=16',near(th.Vth.re,16),th.Vth.re); ok('Rth=8',near(th.Zth.re,8),th.Zth.re); ok('Isc=2',near(th.Isc.re,2)||near(-th.Isc.re,2),th.Isc.re); }
// max power Vs=12 Rs=4: Rth=4 Pmax=9
{ const {nl}=run('maxpower'); const rl=nl.elementByLabel('RL'); const r=I.theorems.get('maxpower').run(nl,{mode:'dc',loadId:rl.comp.id}); const kv=r.blocks.find(b=>b.title==='Result'); console.log(kv.rows.map(x=>x.join(': ')).join(' | ')); ok('Pmax 9W', /9 W/.test(kv.rows[3][1]), kv.rows[3][1]); }
// RC lowpass AC at corner
{ const {nl,ex}=run('rclowpass'); const s=I.solve(nl,{mode:'ac',freq:ex.freq}); const c1=nl.elementByLabel('C1'); const v=s.get(c1.comp.id).v; ok('RC |Vout|=7.07', near(I.Cx.abs(v),7.0711,1e-3), I.Cx.abs(v)); ok('RC phase -45', near(I.Cx.arg(v)*180/Math.PI,-45,1e-3), I.Cx.arg(v)*180/Math.PI);
  for (const id of ['tellegen']) { const r=I.theorems.get(id).run(nl,{mode:'ac',freq:ex.freq}); ok('tellegen AC', r.ok); } }
// RLC resonance
{ const {nl,ex}=run('rlc'); const s=I.solve(nl,{mode:'ac',freq:ex.freq}); const i=s.get(nl.elementByLabel('R1').comp.id).i; ok('RLC I=1A at resonance', near(I.Cx.abs(i),1,2e-3), I.Cx.abs(i)); }
// transient RC
{ const {nl}=run('rcstep'); const sim=new I.TransientSim(nl,{dt:1e-5}); let last; for(let k=0;k<100;k++) last=sim.step(); const v=last.get(nl.elementByLabel('C1').comp.id).v.re; const exp=5*(1-Math.exp(-1)); ok('RC v(1ms)=3.161', near(v,exp,5e-3), v+' vs '+exp); }
// transient RL
{ const {nl}=run('rlstep'); const sim=new I.TransientSim(nl,{dt:1e-5}); let last; for(let k=0;k<100;k++) last=sim.step(); const i=last.get(nl.elementByLabel('L1').comp.id).i.re; const exp=0.01*(1-Math.exp(-1)); ok('RL i(1ms)', near(i,exp,5e-3), i+' vs '+exp); }
// substitution & reciprocity
{ const {nl}=run('divider'); const r=I.theorems.get('substitution').run(nl,{mode:'dc',loadId:nl.elementByLabel('R2').comp.id}); ok('substitution', r.ok); }
{ const {nl}=run('thevenin'); const src=nl.elementByLabel('V1'); const r=I.theorems.get('reciprocity').run(nl,{mode:'dc',sourceId:src.comp.id,loadId:nl.elementByLabel('RL').comp.id}); ok('reciprocity', r.ok); }
// expressions
{ const {nl}=run('divider'); const s=I.solve(nl,{mode:'dc'}); const v=I.analysis.evaluate('V(A)-V(B)',nl,s); ok('expr V(A)-V(B)=4', near(v.re,4)); const w=I.analysis.evaluate('I(R1)*2k',nl,s); ok('expr I(R1)*2k=8',near(w.re,8),w.re); }
// singular detection
{ const c=new I.Circuit(); c.addComponent('Vdc',4,4,1,{value:5}); c.addComponent('Vdc',8,4,1,{value:3}); c.addComponent('GND',6,8,0); [[4,6,4,8],[4,8,8,8],[8,6,8,8],[4,2,8,2],[4,2,4,2]].forEach(w=>c.addWire(...w)); c.addWire(4,2,4,2);
  const nl=I.buildNetlist(c); let threw=false; try{ I.solve(nl,{mode:'dc'}); }catch(e){ threw=true; console.log('  msg:',e.name); } ok('parallel V sources flagged', threw); }
console.log(fail? ('FAILED '+fail):'ALL OK');

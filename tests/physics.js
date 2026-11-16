require('../src/js/core/util.js'); require('../src/js/fields/physics.js');
const P = globalThis.Incog.physics; let fail=0;
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+' '+x); if(!c) fail++;};
const near=(a,b,t=1e-6)=>Math.abs(a-b)<=t*Math.max(1e-30,Math.abs(b));
// point charge 1 nC at 10 cm: E = 898.755 V/m, V = 89.8755 V
let e=P.electric([{type:'charge',q:1e-9,x:0,y:0}],0.1,0); ok('E point', near(e.Ex,898.755,1e-4)&&Math.abs(e.Ey)<1e-9, e.Ex); ok('V point', near(e.V,89.8755,1e-4), e.V);
// dipole: midpoint V=0, E doubles
e=P.electric([{type:'charge',q:1e-9,x:-0.1,y:0},{type:'charge',q:-1e-9,x:0.1,y:0}],0,0); ok('dipole V=0 at mid', Math.abs(e.V)<1e-9); ok('dipole E mid = 2x', near(e.Ex,2*898.755,1e-4), e.Ex);
// Coulomb force between 1 nC charges 10 cm: 8.98755e-7 N repulsive
let f=P.forceOnCharge([{type:'charge',q:1e-9,x:0,y:0},{type:'charge',q:1e-9,x:0.1,y:0}],1); ok('Coulomb force', near(f.Fx,8.98755e-7,1e-4)&&Math.abs(f.Fy)<1e-15, f.Fx);
// wire 1A at 5 cm: B = 4e-6 T
let b=P.magnetic([{type:'wire',I:1,x:0,y:0}],0.05,0); ok('wire B=4uT', near(Math.hypot(b.Bx,b.By),4e-6,1e-6), Math.hypot(b.Bx,b.By)); ok('wire B direction +y at +x (out of page)', b.By>0&&Math.abs(b.Bx)<1e-15);
// parallel wires same direction attract
let fw=P.forceOnWire([{type:'wire',I:1,x:0,y:0},{type:'wire',I:1,x:0.05,y:0}],1); ok('parallel currents attract (Fx<0)', fw.Fx<0, fw.Fx); ok('F/L = mu0 I1 I2/(2 pi d)=4e-6', near(Math.abs(fw.Fx),4e-6,1e-6), fw.Fx);
fw=P.forceOnWire([{type:'wire',I:1,x:0,y:0},{type:'wire',I:-1,x:0.05,y:0}],1); ok('opposite currents repel (Fx>0)', fw.Fx>0);
// Boris: electron in B=1mT, v=1e6 -> r = mv/(qB)=5.686mm ; speed conserved; period 3.57e-8 s
const el=P.PARTICLES.electron; const B=1e-3, v0=1e6; const r=el.m*v0/(Math.abs(el.q)*B); const T=2*Math.PI*el.m/(Math.abs(el.q)*B);
const s={x:0,y:0,vx:v0,vy:0}; const n=2000, dt=T/n; let maxr=0, minx=0;
for(let i=0;i<n;i++){ P.boris(s,()=>[0,0],B,el.q,el.m,dt); }
ok('Boris: back to start after one period', Math.hypot(s.x,s.y)<r*1e-3, Math.hypot(s.x,s.y)); ok('Boris: speed conserved', near(Math.hypot(s.vx,s.vy),v0,1e-9));
// E x B drift: E=1000 V/m (y), B=1mT (z) -> drift vx = Ey/Bz*... v = E x B /B^2 = (Ey*Bz, -Ex*Bz)/Bz^2 = (E/B)=1e6 in +x
const p=P.PARTICLES.proton; const s2={x:0,y:0,vx:0,vy:0}; const Tp=2*Math.PI*p.m/(p.q*B); const dt2=Tp/400; const N=400*10; for(let i=0;i<N;i++) P.boris(s2,()=>[0,1000],B,p.q,p.m,dt2);
ok('ExB drift speed = E/B (1e6 m/s)', near(s2.x/(N*dt2),1e6,2e-2), s2.x/(N*dt2));
// field line trace from + charge ends near - charge
const it=[{type:'charge',q:1e-9,x:-0.1,y:0},{type:'charge',q:-1e-9,x:0.1,y:0}];
const line=P.trace((x,y)=>{const e=P.electric(it,x,y);return [e.Ex,e.Ey];},-0.1+0.005,0,1,0.004,2000,(x,y)=>Math.hypot(x-0.1,y)<0.006);
const last=line[line.length-1]; ok('field line reaches the negative charge', Math.hypot(last[0]-0.1,last[1])<0.007, JSON.stringify(last));
console.log(fail?'FAILED '+fail:'ALL OK');

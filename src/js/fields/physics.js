/* ============================================================================
 * Incog Electric Lab - fields/physics.js
 * Pure physics for the Field Lab (no drawing, no DOM).  SI units, 2-D plane (x right, y up).
 *   electric(items, x, y)   ->  { Ex, Ey, V }       from point charges (+ optional uniform field)
 *   magnetic(items, x, y)   ->  { Bx, By }          from straight wires (⊙ / ⊗) and magnet poles
 *   trace(fn, x, y, dir ...) -> polyline following a field line
 *   forceOnCharge / forceOnWire / boris  (motion of a charged particle)
 * To add a new source type (for example a charged ring), add a case in electric() or magnetic().
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  const K = 8.9875517923e9;        // 1 / (4 π ε0)
  const MU0 = 4 * Math.PI * 1e-7;  // vacuum permeability
  const SOFT = 1.5e-3;             // softening length (m) so fields stay finite at a source

  /** electric field and potential at (x, y).  items: {type:'charge', q (C), x, y (m)} ; opt.uniform = {Ex,Ey} */
  function electric(items, x, y, opt) {
    let Ex = 0, Ey = 0, V = 0;
    for (const it of items) {
      if (it.type !== 'charge') continue;
      const dx = x - it.x, dy = y - it.y;
      const r2 = Math.max(dx * dx + dy * dy, SOFT * SOFT), r = Math.sqrt(r2);
      const k = (K * it.q) / (r2 * r);
      Ex += k * dx; Ey += k * dy; V += (K * it.q) / r;
    }
    if (opt && opt.uniform) { Ex += opt.uniform.Ex; Ey += opt.uniform.Ey; V -= opt.uniform.Ex * x + opt.uniform.Ey * y; }
    return { Ex, Ey, V };
  }

  /** poles of a magnet item: [{x, y, qm}] (qm in A·m) */
  function poles(it) {
    if (it.pole === 'north') return [{ x: it.x, y: it.y, qm: it.m }];          // one isolated north pole
    if (it.pole === 'south') return [{ x: it.x, y: it.y, qm: -it.m }];         // one isolated south pole
    const a = ((it.angle || 0) * Math.PI) / 180, h = (it.len || 0.1) / 2;
    return [{ x: it.x + h * Math.cos(a), y: it.y + h * Math.sin(a), qm: it.m }, { x: it.x - h * Math.cos(a), y: it.y - h * Math.sin(a), qm: -it.m }];
  }

  /** magnetic flux density (in-plane part) at (x, y).  wire: I (A) positive = out of the screen */
  function magnetic(items, x, y) {
    let Bx = 0, By = 0;
    for (const it of items) {
      if (it.type === 'wire') {
        const dx = x - it.x, dy = y - it.y, r2 = Math.max(dx * dx + dy * dy, SOFT * SOFT);
        const k = (MU0 * it.I) / (2 * Math.PI * r2);
        Bx += -k * dy; By += k * dx; // counter-clockwise for current out of the page
      } else if (it.type === 'magnet') {
        for (const p of poles(it)) {
          const dx = x - p.x, dy = y - p.y, r2 = Math.max(dx * dx + dy * dy, SOFT * SOFT), r = Math.sqrt(r2);
          const k = (MU0 / (4 * Math.PI)) * p.qm / (r2 * r);
          Bx += k * dx; By += k * dy;
        }
      }
    }
    return { Bx, By };
  }

  /** follow a field line.  fn(x,y)->[fx,fy].  Stops at max steps, when stop(x,y) is true or when the field vanishes. */
  function trace(fn, x, y, dir, ds, maxSteps, stop) {
    const pts = [[x, y]];
    for (let i = 0; i < maxSteps; i++) {
      let [fx, fy] = fn(x, y); let m = Math.hypot(fx, fy); if (!(m > 1e-30)) break;
      const mx = x + (dir * ds * 0.5 * fx) / m, my = y + (dir * ds * 0.5 * fy) / m;
      [fx, fy] = fn(mx, my); m = Math.hypot(fx, fy); if (!(m > 1e-30)) break;
      x += (dir * ds * fx) / m; y += (dir * ds * fy) / m;
      pts.push([x, y]);
      if (stop && stop(x, y, i)) break;
    }
    return pts;
  }

  /** net force (N) on charge number idx from all the OTHER charges (+ uniform field) */
  function forceOnCharge(items, idx, opt) {
    const me = items[idx];
    const others = items.filter((_, i) => i !== idx);
    const e = electric(others, me.x, me.y, opt);
    return { Fx: me.q * e.Ex, Fy: me.q * e.Ey, Ex: e.Ex, Ey: e.Ey };
  }

  /** force per metre of a wire in the field of the other sources: F/L = I (ẑ × B) */
  function forceOnWire(items, idx) {
    const me = items[idx];
    const others = items.filter((_, i) => i !== idx);
    const b = magnetic(others, me.x, me.y);
    return { Fx: -me.I * b.By, Fy: me.I * b.Bx, Bx: b.Bx, By: b.By };
  }

  /** force (N) on a magnet from all the OTHER sources: each pole feels F = qm * B */
  function forceOnMagnet(items, idx) {
    const me = items[idx], others = items.filter((_, i) => i !== idx);
    let Fx = 0, Fy = 0;
    for (const p of poles(me)) { const b = magnetic(others, p.x, p.y); Fx += p.qm * b.Bx; Fy += p.qm * b.By; }
    return { Fx, Fy };
  }

  /** Boris pusher in 2-D with B along z.  s = {x,y,vx,vy}.  Efn(x,y)->[Ex,Ey].  Conserves |v| in a pure B field. */
  function boris(s, Efn, Bz, q, m, dt) {
    const [Ex, Ey] = Efn(s.x, s.y);
    const a = (q / m) * dt * 0.5;
    let vx = s.vx + a * Ex, vy = s.vy + a * Ey;
    const t = a * Bz, sf = (2 * t) / (1 + t * t);
    const px = vx + vy * t, py = vy - vx * t;
    vx += py * sf; vy -= px * sf;
    s.vx = vx + a * Ex; s.vy = vy + a * Ey;
    s.x += s.vx * dt; s.y += s.vy * dt;
    return s;
  }

  const PARTICLES = {
    electron: { name: 'Electron', q: -1.602176634e-19, m: 9.1093837e-31 },
    positron: { name: 'Positron', q: 1.602176634e-19, m: 9.1093837e-31 },
    proton: { name: 'Proton', q: 1.602176634e-19, m: 1.67262192e-27 },
    alpha: { name: 'Alpha particle', q: 3.204353268e-19, m: 6.6446573e-27 },
  };

  Incog.physics = { K, MU0, SOFT, electric, magnetic, poles, trace, forceOnCharge, forceOnWire, forceOnMagnet, boris, PARTICLES };
})(typeof window !== 'undefined' ? window : globalThis);
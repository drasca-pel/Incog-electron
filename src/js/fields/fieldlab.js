/* ============================================================================
 * Incog Electric Lab - fields/fieldlab.js
 * FIELD LAB: electric field (point charges), magnetic field (wires and magnets) and a
 * charged-particle simulator, all drawn live.  The physics is in fields/physics.js;
 * this file is the interface only.
 * Add a preset: push into PRESETS below.  Add a source type: extend physics.js + drawItem().
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = root.Incog;
  const { h } = Incog;
  const P = Incog.physics;
  const { fmtSI, parseSI, fmtPlain } = Incog.util;

  const ELEC = '#ff5d6c', NEG = '#4cc2ff', MAG = '#ffb454';

  const PRESETS = {
    electric: {
      'Dipole (+ and −)': () => [{ type: 'charge', q: 2e-9, x: -0.12, y: 0 }, { type: 'charge', q: -2e-9, x: 0.12, y: 0 }],
      'Two like charges': () => [{ type: 'charge', q: 2e-9, x: -0.12, y: 0 }, { type: 'charge', q: 2e-9, x: 0.12, y: 0 }],
      'Three charges': () => [{ type: 'charge', q: 2e-9, x: 0, y: 0.12 }, { type: 'charge', q: -2e-9, x: -0.14, y: -0.1 }, { type: 'charge', q: 1e-9, x: 0.14, y: -0.1 }],
      'Parallel plates': () => {
        const o = []; for (let i = -4; i <= 4; i++) { o.push({ type: 'charge', q: 1e-9, x: i * 0.05, y: 0.1 }); o.push({ type: 'charge', q: -1e-9, x: i * 0.05, y: -0.1 }); } return o;
      },
      'Single charge': () => [{ type: 'charge', q: 2e-9, x: 0, y: 0 }],
    },
    magnetic: {
      'Single wire (current out of page)': () => [{ type: 'wire', I: 10, x: 0, y: 0 }],
      'Two parallel wires, same direction': () => [{ type: 'wire', I: 10, x: -0.1, y: 0 }, { type: 'wire', I: 10, x: 0.1, y: 0 }],
      'Two wires, opposite directions': () => [{ type: 'wire', I: 10, x: -0.1, y: 0 }, { type: 'wire', I: -10, x: 0.1, y: 0 }],
      'Solenoid (cross-section)': () => {
        const o = []; for (let i = -3; i <= 3; i++) { o.push({ type: 'wire', I: 5, x: i * 0.05, y: 0.08 }); o.push({ type: 'wire', I: -5, x: i * 0.05, y: -0.08 }); } return o;
      },
      'Bar magnet': () => [{ type: 'magnet', m: 400, x: 0, y: 0, len: 0.2, angle: 0 }],
    },
    particle: {
      'Electron circling in B = 1 mT': { p: 'electron', v: 1e6, ang: 90, Ex: 0, Ey: 0, Bz: 1e-3 },
      'Proton: E × B drift (cycloid)': { p: 'proton', v: 0, ang: 0, Ex: 0, Ey: 2000, Bz: 1e-3 },
      'Velocity selector (goes straight)': { p: 'proton', v: 2e6, ang: 0, Ex: 0, Ey: 2000, Bz: 1e-3 },
      'Electron in a uniform E field': { p: 'electron', v: 3e6, ang: 0, Ex: 0, Ey: 500, Bz: 0 },
      'Alpha particle in B = 10 mT': { p: 'alpha', v: 1e6, ang: 90, Ex: 0, Ey: 0, Bz: 1e-2 },
    },
  };

  const F = {
    mode: 'electric',
    items: { electric: PRESETS.electric['Dipole (+ and −)'](), magnetic: PRESETS.magnetic['Single wire (current out of page)']() },
    view: { electric: { ox: 0, oy: 0, s: 900 }, magnetic: { ox: 0, oy: 0, s: 900 }, particle: { ox: 0, oy: 0, s: 1000 } },
    opts: { lines: true, equip: true, heat: false, vectors: false, force: true },
    sel: -1, mouse: null, drag: null, bgDirty: true, visible: false, centered: false,
    pt: null, // particle state
  };

  let el, cv, g, bg, bgG, W = 0, H = 0, dpr = 1, ui = {};
  const dark = () => !document.body.classList.contains('theme-light');
  const V = () => F.view[F.mode];
  const toS = (x, y) => { const v = V(); return [W / 2 + v.ox + x * v.s, H / 2 + v.oy - y * v.s]; };
  const toW = (sx, sy) => { const v = V(); return [(sx - W / 2 - v.ox) / v.s, -(sy - H / 2 - v.oy) / v.s]; };
  const items = () => F.items[F.mode] || [];

  // ================================================================ physics glue
  const uniformE = () => (F.pt ? { Ex: F.pt.Ex, Ey: F.pt.Ey } : null);
  const fieldFn = () => {
    const it = items();
    if (F.mode === 'electric') return (x, y) => { const e = P.electric(it, x, y); return [e.Ex, e.Ey]; };
    return (x, y) => { const b = P.magnetic(it, x, y); return [b.Bx, b.By]; };
  };
  const mag = (v) => Math.hypot(v[0], v[1]);

  // ================================================================ background layer
  function drawBackground() {
    const c = bgG, it = items(), v = V();
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = dark() ? '#0e131a' : '#f7f9fb'; c.fillRect(0, 0, W, H);
    // grid
    c.strokeStyle = dark() ? '#1a2430' : '#e3e9ef'; c.lineWidth = 1;
    const gridM = niceGrid(60 / v.s);
    const x0 = toW(0, 0)[0], x1 = toW(W, 0)[0], y0 = toW(0, H)[1], y1 = toW(0, 0)[1];
    c.beginPath();
    for (let x = Math.ceil(x0 / gridM) * gridM; x < x1; x += gridM) { const s = toS(x, 0)[0]; c.moveTo(s, 0); c.lineTo(s, H); }
    for (let y = Math.ceil(y0 / gridM) * gridM; y < y1; y += gridM) { const s = toS(0, y)[1]; c.moveTo(0, s); c.lineTo(W, s); }
    c.stroke();
    c.fillStyle = dark() ? '#5b6d82' : '#7d8da0'; c.font = '10.5px "Cascadia Mono",Consolas,monospace'; c.textAlign = 'left'; c.textBaseline = 'bottom';
    c.fillText('grid ' + fmtSI(gridM, 'm', 2), 8, H - 6);
    if (!it.length && F.mode !== 'particle') return;
    const fn = fieldFn();
    if (F.opts.heat) drawHeat(c, fn);
    if (F.opts.equip && F.mode === 'electric') drawEquip(c, it);
    if (F.opts.lines) drawLines(c, it, fn);
    if (F.opts.vectors) drawVectors(c, fn);
  }
  function niceGrid(m) { const p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; }

  function sampleGrid(step, fnVal) {
    const nx = Math.ceil(W / step) + 1, ny = Math.ceil(H / step) + 1, a = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const w = toW(i * step, j * step); a[j * nx + i] = fnVal(w[0], w[1]); }
    return { a, nx, ny, step };
  }
  const percentile = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  function drawHeat(c, fn) {
    const it = items(), step = 6;
    const grid = sampleGrid(step, F.mode === 'electric' ? (x, y) => P.electric(it, x, y).V : (x, y) => { const f = fn(x, y); return Math.log10(Math.hypot(f[0], f[1]) + 1e-30); });
    let s = 1, lo = 0, hi = 1;
    if (F.mode === 'electric') { const ab = Array.from(grid.a, Math.abs).filter((x) => x > 0); s = ab.length ? percentile(ab, 0.35) : 1; }
    else { lo = percentile(grid.a, 0.08); hi = percentile(grid.a, 0.985); if (hi - lo < 1e-6) hi = lo + 1; }
    for (let j = 0; j < grid.ny - 1; j++) for (let i = 0; i < grid.nx - 1; i++) {
      const val = grid.a[j * grid.nx + i];
      if (F.mode === 'electric') {
        const u = Math.max(-1, Math.min(1, Math.asinh(val / s) / 4));
        c.fillStyle = u >= 0 ? `rgba(255,93,108,${Math.pow(Math.abs(u), 0.8) * 0.55})` : `rgba(76,194,255,${Math.pow(Math.abs(u), 0.8) * 0.55})`;
      } else {
        const u = Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
        c.fillStyle = `rgba(255,${Math.round(180 - 90 * u)},${Math.round(84 - 40 * u)},${0.08 + u * 0.5})`;
      }
      c.fillRect(i * step, j * step, step + 0.5, step + 0.5);
    }
  }

  function drawEquip(c, it) {
    const step = 8, grid = sampleGrid(step, (x, y) => P.electric(it, x, y).V);
    const ab = Array.from(grid.a, Math.abs).filter((x) => x > 0); if (!ab.length) return;
    const s = percentile(ab, 0.3);
    c.lineWidth = 1.1;
    for (let k = -9; k <= 9; k++) {
      const level = s * Math.sinh(0.62 * k);
      c.strokeStyle = k === 0 ? (dark() ? 'rgba(220,230,240,.55)' : 'rgba(30,50,70,.5)') : k > 0 ? 'rgba(255,120,130,.38)' : 'rgba(90,190,255,.38)';
      c.beginPath(); marching(grid, level, c); c.stroke();
    }
  }
  function marching(gr, L, c) {
    const { a, nx, ny, step } = gr;
    const lerp = (v1, v2) => (L - v1) / (v2 - v1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const v0 = a[j * nx + i], v1 = a[j * nx + i + 1], v2 = a[(j + 1) * nx + i + 1], v3 = a[(j + 1) * nx + i];
      let idx = 0; if (v0 > L) idx |= 1; if (v1 > L) idx |= 2; if (v2 > L) idx |= 4; if (v3 > L) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const x = i * step, y = j * step;
      const E = [[x + lerp(v0, v1) * step, y], [x + step, y + lerp(v1, v2) * step], [x + lerp(v3, v2) * step, y + step], [x, y + lerp(v0, v3) * step]];
      const seg = (p, q) => { c.moveTo(E[p][0], E[p][1]); c.lineTo(E[q][0], E[q][1]); };
      switch (idx) {
        case 1: case 14: seg(3, 0); break; case 2: case 13: seg(0, 1); break; case 3: case 12: seg(3, 1); break;
        case 4: case 11: seg(1, 2); break; case 5: seg(3, 0); seg(1, 2); break; case 6: case 9: seg(0, 2); break;
        case 7: case 8: seg(3, 2); break; case 10: seg(0, 1); seg(2, 3); break;
        default: break;
      }
    }
  }

  function arrowHead(c, x, y, ang, size) {
    c.beginPath(); c.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
    c.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size); c.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size); c.closePath(); c.fill();
  }

  function drawPolyline(c, pts, color) {
    if (pts.length < 2) return;
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 1.4; c.beginPath();
    pts.forEach((p, i) => { const s = toS(p[0], p[1]); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); c.stroke();
    // direction arrows every ~140 px
    let acc = 70, prev = toS(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const s = toS(pts[i][0], pts[i][1]); acc += Math.hypot(s[0] - prev[0], s[1] - prev[1]);
      if (acc > 140) { acc = 0; arrowHead(c, s[0], s[1], Math.atan2(s[1] - prev[1], s[0] - prev[0]), 5.5); }
      prev = s;
    }
  }

  function drawLines(c, it, fn) {
    const v = V(), ds = 4 / v.s, margin = 60;
    const inView = (x, y) => { const s = toS(x, y); return s[0] > -margin && s[0] < W + margin && s[1] > -margin && s[1] < H + margin; };
    const lineColor = F.mode === 'electric' ? (dark() ? 'rgba(235,240,246,.78)' : 'rgba(30,45,60,.75)') : (dark() ? 'rgba(255,190,110,.85)' : 'rgba(170,90,0,.8)');
    if (F.mode === 'electric') {
      const ch = it.filter((o) => o.type === 'charge'); if (!ch.length) return;
      const qmax = Math.max(...ch.map((o) => Math.abs(o.q))), net = ch.reduce((a, o) => a + o.q, 0);
      const hitCharge = (x, y, self, i) => ch.some((o) => o !== self && (!i || true) && Math.hypot(x - o.x, y - o.y) < 6 / v.s);
      for (const o of ch) {
        let sign = 0, frac = 1;
        if (o.q > 0) sign = 1; else if (net < 0) { sign = -1; frac = Math.abs(net) / ch.filter((z) => z.q < 0).reduce((a, z) => a - z.q, 0); }
        if (!sign) continue;
        const n = Math.max(4, Math.round(18 * (Math.abs(o.q) / qmax) * frac));
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * (k + 0.5)) / n;
          const x0 = o.x + (7 / v.s) * Math.cos(a), y0 = o.y + (7 / v.s) * Math.sin(a);
          const pts = P.trace(fn, x0, y0, sign, ds, 1600, (x, y) => !inView(x, y) || hitCharge(x, y, o));
          drawPolyline(c, sign > 0 ? pts : pts.slice().reverse(), lineColor);
        }
      }
    } else {
      const seeds = [];
      for (const o of it) {
        if (o.type === 'wire') for (let k = 0; k < 7; k++) { const r = (22 * Math.pow(1.75, k)) / v.s; seeds.push({ x: o.x + r, y: o.y, both: true }); }
        else if (o.type === 'magnet') { const [N] = P.poles(o); for (let k = 0; k < 14; k++) { const a = (2 * Math.PI * (k + 0.5)) / 14; seeds.push({ x: N.x + (7 / v.s) * Math.cos(a), y: N.y + (7 / v.s) * Math.sin(a), both: false }); } }
      }
      const poleHit = (x, y) => it.some((o) => o.type === 'magnet' && P.poles(o).some((p) => Math.hypot(x - p.x, y - p.y) < 6 / v.s));
      for (const sd of seeds) {
        const start = [sd.x, sd.y];
        const stop = (x, y, i) => !inView(x, y) || poleHit(x, y) || (i > 40 && Math.hypot(x - start[0], y - start[1]) < ds * 1.5);
        const fwd = P.trace(fn, sd.x, sd.y, 1, ds, 1400, stop);
        drawPolyline(c, fwd, lineColor);
        if (!sd.both && false) continue;
        if (!sd.both) continue;
      }
    }
  }

  function drawVectors(c, fn) {
    const step = 38;
    for (let sy = step / 2; sy < H; sy += step) for (let sx = step / 2; sx < W; sx += step) {
      const w = toW(sx, sy), f = fn(w[0], w[1]), m = mag(f); if (!(m > 0)) continue;
      const lg = Math.log10(m), alpha = Math.max(0.2, Math.min(0.95, 0.5 + (lg - (F.mode === 'electric' ? 2 : -5)) * 0.16));
      const a = Math.atan2(-f[1], f[0]); const L = 15;
      c.strokeStyle = c.fillStyle = (F.mode === 'electric' ? `rgba(255,200,61,${alpha})` : `rgba(120,230,170,${alpha})`);
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx - Math.cos(a) * L / 2, sy - Math.sin(a) * L / 2); c.lineTo(sx + Math.cos(a) * L / 2, sy + Math.sin(a) * L / 2); c.stroke();
      arrowHead(c, sx + Math.cos(a) * L / 2, sy + Math.sin(a) * L / 2, a, 4.5);
    }
  }

  // ================================================================== items
  function drawItem(c, o, i) {
    const s = toS(o.x, o.y), sel = i === F.sel, v = V();
    c.save(); c.translate(s[0], s[1]);
    if (o.type === 'charge') {
      const qmax = Math.max(...items().filter((z) => z.type === 'charge').map((z) => Math.abs(z.q)), 1e-12);
      const r = 8 + 8 * Math.sqrt(Math.abs(o.q) / qmax);
      c.fillStyle = o.q >= 0 ? ELEC : NEG; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.strokeStyle = sel ? '#ffc83d' : 'rgba(255,255,255,.85)'; c.lineWidth = sel ? 3 : 1.5; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r / 2.2, 0); c.lineTo(r / 2.2, 0); if (o.q > 0) { c.moveTo(0, -r / 2.2); c.lineTo(0, r / 2.2); } c.stroke();
      label(c, fmtSI(o.q, 'C', 3), 0, r + 11);
    } else if (o.type === 'wire') {
      c.fillStyle = dark() ? '#1d2733' : '#fff'; c.strokeStyle = sel ? '#ffc83d' : MAG; c.lineWidth = sel ? 3 : 2; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke();
      c.fillStyle = c.strokeStyle;
      if (o.I >= 0) { c.beginPath(); c.arc(0, 0, 3.4, 0, 7); c.fill(); } else { c.beginPath(); c.moveTo(-5, -5); c.lineTo(5, 5); c.moveTo(5, -5); c.lineTo(-5, 5); c.stroke(); }
      label(c, fmtSI(Math.abs(o.I), 'A', 3) + (o.I >= 0 ? ' ⊙' : ' ⊗'), 0, 25);
    } else if (o.type === 'magnet') {
      c.rotate((-o.angle * Math.PI) / 180); const L = o.len * v.s, hgt = 20;
      c.fillStyle = '#ff5d6c'; c.fillRect(0, -hgt / 2, L / 2, hgt); c.fillStyle = '#4cc2ff'; c.fillRect(-L / 2, -hgt / 2, L / 2, hgt);
      c.strokeStyle = sel ? '#ffc83d' : 'rgba(255,255,255,.8)'; c.lineWidth = sel ? 3 : 1.5; c.strokeRect(-L / 2, -hgt / 2, L, hgt);
      c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', L / 4, 1); c.fillText('S', -L / 4, 1);
    }
    c.restore();
  }
  function label(c, text, x, y) {
    c.font = '600 11px "Segoe UI",system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = dark() ? 'rgba(14,19,26,.9)' : 'rgba(247,249,251,.92)'; c.strokeText(text, x, y); c.fillStyle = dark() ? '#e8eef5' : '#1c2733'; c.fillText(text, x, y);
  }
  function arrow(c, x0, y0, x1, y1, color, w) {
    c.strokeStyle = c.fillStyle = color; c.lineWidth = w || 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    arrowHead(c, x1, y1, Math.atan2(y1 - y0, x1 - x0), 8);
  }

  // ================================================================ readouts
  function forceInfo(o, i) {
    const it = items();
    if (o.type === 'charge') { const f = P.forceOnCharge(it, i); return { F: [f.Fx, f.Fy], text: [`Force on it: ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N', 4)}`, `Field there (others): ${fmtSI(Math.hypot(f.Ex, f.Ey), 'V/m', 4)}`] }; }
    if (o.type === 'wire') { const f = P.forceOnWire(it, i); return { F: [f.Fx, f.Fy], text: [`Force per metre: ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N/m', 4)}`, `B there (others): ${fmtSI(Math.hypot(f.Bx, f.By), 'T', 4)}`] }; }
    return null;
  }

  function hoverText() {
    if (!F.mouse) return [];
    const w = toW(F.mouse[0], F.mouse[1]), it = items();
    const pos = `x = ${fmtSI(w[0], 'm', 3)},  y = ${fmtSI(w[1], 'm', 3)}`;
    if (F.mode === 'electric') { const e = P.electric(it, w[0], w[1]); return [pos, `V = ${fmtSI(e.V, 'V', 4)}`, `|E| = ${fmtSI(Math.hypot(e.Ex, e.Ey), 'V/m', 4)}  ∠ ${(Math.atan2(e.Ey, e.Ex) * 180 / Math.PI).toFixed(1)}°`]; }
    const b = P.magnetic(it, w[0], w[1]);
    return [pos, `|B| = ${fmtSI(Math.hypot(b.Bx, b.By), 'T', 4)}  ∠ ${(Math.atan2(b.By, b.Bx) * 180 / Math.PI).toFixed(1)}°`];
  }

  // ================================================================== render
  function render() {
    if (!cv || !W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (F.mode === 'particle') { renderParticle(); return; }
    if (F.bgDirty) { drawBackground(); F.bgDirty = false; }
    g.drawImage(bg, 0, 0, W, H);
    const it = items();
    it.forEach((o, i) => drawItem(g, o, i));
    if (F.opts.force) it.forEach((o, i) => {
      const fi = forceInfo(o, i); if (!fi) return; const m = Math.hypot(fi.F[0], fi.F[1]); if (!(m > 0)) return;
      const s = toS(o.x, o.y), len = 60, ux = fi.F[0] / m, uy = fi.F[1] / m;
      arrow(g, s[0], s[1], s[0] + ux * len, s[1] - uy * len, '#ffc83d', 3);
    });
    if (F.mouse) {
      const w = toW(F.mouse[0], F.mouse[1]), f = fieldFn()(w[0], w[1]), m = mag(f);
      if (m > 0) arrow(g, F.mouse[0], F.mouse[1], F.mouse[0] + (f[0] / m) * 34, F.mouse[1] - (f[1] / m) * 34, F.mode === 'electric' ? '#ffc83d' : '#78e6aa', 2.4);
      g.fillStyle = dark() ? '#e8eef5' : '#1c2733'; g.beginPath(); g.arc(F.mouse[0], F.mouse[1], 3, 0, 7); g.fill();
    }
    updateReadout(hoverText());
    updateSelPanel(false);
  }
  function updateReadout(lines) { ui.read.innerHTML = ''; lines.forEach((t, i) => ui.read.appendChild(h('div', { class: i === 0 ? 'muted mono' : 'mono' }, t))); ui.read.style.display = lines.length ? '' : 'none'; }
  const invalidate = () => { F.bgDirty = true; render(); };

  // ================================================================ particle
  function particleParams() {
    const pr = P.PARTICLES[ui.pSel.value] || { q: 0, m: 1 };
    const custom = ui.pSel.value === 'custom';
    const q = custom ? parseSI(ui.pq.value) * P.PARTICLES.proton.q : pr.q, m = custom ? parseSI(ui.pm.value) : pr.m;
    return { q, m, v: parseSI(ui.pv.value), ang: parseSI(ui.pa.value), Ex: parseSI(ui.pEx.value) || 0, Ey: parseSI(ui.pEy.value) || 0, Bz: parseSI(ui.pBz.value) || 0 };
  }
  function resetParticle() {
    const p = particleParams();
    if (!(isFinite(p.q) && isFinite(p.m) && p.m > 0 && isFinite(p.v))) { ui.pinfo.textContent = 'Check the numbers: mass must be positive.'; return; }
    const a = (p.ang * Math.PI) / 180, v0 = p.v;
    const omega = (p.q * p.Bz) / p.m, acc = Math.hypot(p.q * p.Ex / p.m, p.q * p.Ey / p.m);
    const drift = p.Bz !== 0 ? Math.hypot(p.Ey, -p.Ex) / Math.abs(p.Bz) : 0;
    let Lc, tau;
    if (omega !== 0) { tau = (2 * Math.PI) / Math.abs(omega); Lc = Math.max(Math.abs(v0) / Math.abs(omega), drift / Math.abs(omega) * 2, 1e-12); if (Lc < 1e-9) Lc = 1e-3; }
    else { Lc = 0.15; tau = v0 > 0 ? Lc / v0 : acc > 0 ? Math.sqrt((2 * Lc) / acc) : 1; }
    F.pt = { ...p, x: 0, y: 0, vx: v0 * Math.cos(a), vy: v0 * Math.sin(a), t: 0, trail: [[0, 0]], tau, Lc, omega, running: F.pt ? F.pt.running : false, drift, steps: 0, e0: 0.5 * p.m * v0 * v0 };
    const v = F.view.particle; v.s = 110 / Lc; v.ox = 0; v.oy = 0;
    F.pt.dt = tau / 400;
    updateParticleInfo(); render();
  }
  function stepParticle(frameDt) {
    const s = F.pt; if (!s || !s.running) return;
    const simPerReal = (s.tau / 3) * Math.pow(10, Number(ui.pSpeed.value));
    const n = Math.min(3000, Math.max(1, Math.round((simPerReal * frameDt) / s.dt)));
    const it = F.items.electric, useScene = ui.pScene.checked;
    const Efn = (x, y) => { let Ex = s.Ex, Ey = s.Ey; if (useScene) { const e = P.electric(it, x, y); Ex += e.Ex; Ey += e.Ey; } return [Ex, Ey]; };
    for (let k = 0; k < n; k++) {
      P.boris(s, Efn, s.Bz, s.q, s.m, s.dt); s.t += s.dt; s.steps++;
      if (s.steps % 4 === 0) { s.trail.push([s.x, s.y]); if (s.trail.length > 6000) s.trail.shift(); }
    }
    const sp = toS(s.x, s.y), v = F.view.particle;
    if (sp[0] < 30 || sp[0] > W - 30 || sp[1] < 30 || sp[1] > H - 30) { v.s *= 0.6; v.ox *= 0.6; v.oy *= 0.6; }
  }
  function updateParticleInfo() {
    const s = F.pt; if (!s) return;
    const sp = Math.hypot(s.vx, s.vy), ke = 0.5 * s.m * sp * sp;
    const lines = [];
    lines.push(`t = ${fmtSI(s.t, 's', 4)}    speed = ${fmtSI(sp, 'm/s', 4)}`);
    lines.push(`Kinetic energy = ${fmtSI(ke, 'J', 4)}  (${fmtSI(ke / 1.602176634e-19, 'eV', 4)})`);
    if (s.Bz !== 0) {
      const w = Math.abs(s.omega);
      lines.push(`Cyclotron frequency  f = qB/(2πm) = ${fmtSI(w / (2 * Math.PI), 'Hz', 4)}   period = ${fmtSI((2 * Math.PI) / w, 's', 4)}`);
      lines.push(`Radius  r = m·v/(|q|·B) = ${fmtSI((s.m * Math.hypot(s.vx, s.vy)) / (Math.abs(s.q) * Math.abs(s.Bz)), 'm', 4)}`);
      if (s.Ex || s.Ey) lines.push(`E×B drift speed = E/B = ${fmtSI(s.drift, 'm/s', 4)}`);
    } else if (s.Ex || s.Ey) lines.push(`Acceleration a = qE/m = ${fmtSI(Math.hypot(s.q * s.Ex / s.m, s.q * s.Ey / s.m), 'm/s²', 4)}`);
    ui.pinfo.innerHTML = ''; lines.forEach((l) => ui.pinfo.appendChild(h('div', { class: 'mono small' }, l)));
  }
  function renderParticle() {
    const s = F.pt, v = F.view.particle;
    g.fillStyle = dark() ? '#0e131a' : '#f7f9fb'; g.fillRect(0, 0, W, H);
    const gridM = niceGrid(70 / v.s);
    g.strokeStyle = dark() ? '#1a2430' : '#e3e9ef'; g.lineWidth = 1; g.beginPath();
    const x0 = toW(0, 0)[0], x1 = toW(W, 0)[0], y0 = toW(0, H)[1], y1 = toW(0, 0)[1];
    for (let x = Math.ceil(x0 / gridM) * gridM; x < x1; x += gridM) { const sx = toS(x, 0)[0]; g.moveTo(sx, 0); g.lineTo(sx, H); }
    for (let y = Math.ceil(y0 / gridM) * gridM; y < y1; y += gridM) { const sy = toS(0, y)[1]; g.moveTo(0, sy); g.lineTo(W, sy); }
    g.stroke();
    g.fillStyle = dark() ? '#5b6d82' : '#7d8da0'; g.font = '10.5px "Cascadia Mono",Consolas,monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('grid ' + fmtSI(gridM, 'm', 2), 8, H - 6);
    if (!s) { g.fillStyle = dark() ? '#8fa3b8' : '#5d7085'; g.textAlign = 'center'; g.font = '14px "Segoe UI",sans-serif'; g.fillText('Set the particle and fields, then press Start', W / 2, H / 2); return; }
    // B symbols
    if (s.Bz !== 0) {
      g.strokeStyle = g.fillStyle = dark() ? 'rgba(120,200,255,.35)' : 'rgba(20,110,200,.35)'; g.lineWidth = 1.4;
      for (let sy = 24; sy < H; sy += 48) for (let sx = 24; sx < W; sx += 48) {
        g.beginPath(); g.arc(sx, sy, 6.5, 0, 7); g.stroke();
        if (s.Bz > 0) { g.beginPath(); g.arc(sx, sy, 1.8, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(sx - 3.4, sy - 3.4); g.lineTo(sx + 3.4, sy + 3.4); g.moveTo(sx + 3.4, sy - 3.4); g.lineTo(sx - 3.4, sy + 3.4); g.stroke(); }
      }
    }
    // E arrows
    if (s.Ex || s.Ey) { const m = Math.hypot(s.Ex, s.Ey), ux = s.Ex / m, uy = s.Ey / m; for (let sy = 70; sy < H; sy += 110) for (let sx = 70; sx < W; sx += 150) arrow(g, sx - ux * 18, sy + uy * 18, sx + ux * 18, sy - uy * 18, 'rgba(255,200,61,.5)', 2); }
    if (ui.pScene.checked) F.items.electric.forEach((o) => drawItem(g, o, -1));
    // ideal circle
    if (s.omega !== 0 && !s.Ex && !s.Ey && !ui.pScene.checked) {
      const r0 = Math.hypot(s.vx, s.vy) / Math.abs(s.omega); const cx = s.x + s.vy / s.omega, cy = s.y - s.vx / s.omega; const c = toS(cx, cy);
      g.strokeStyle = 'rgba(255,255,255,.2)'; g.setLineDash([5, 5]); g.beginPath(); g.arc(c[0], c[1], r0 * v.s, 0, 7); g.stroke(); g.setLineDash([]);
    }
    // trail
    g.lineWidth = 2; g.lineJoin = 'round';
    const tl = s.trail, n = tl.length;
    for (let i = 1; i < n; i++) { const a = toS(tl[i - 1][0], tl[i - 1][1]), b = toS(tl[i][0], tl[i][1]); g.strokeStyle = `rgba(${s.q >= 0 ? '255,93,108' : '76,194,255'},${0.15 + 0.85 * (i / n)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const p = toS(s.x, s.y);
    g.fillStyle = s.q >= 0 ? ELEC : NEG; g.beginPath(); g.arc(p[0], p[1], 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    const sp = Math.hypot(s.vx, s.vy); if (sp > 0) arrow(g, p[0], p[1], p[0] + (s.vx / sp) * 40, p[1] - (s.vy / sp) * 40, '#78e6aa', 2.4);
    updateReadout([]);
    updateParticleInfo();
  }

  // ================================================================ interaction
  function hit(sx, sy) {
    const it = items();
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i], s = toS(o.x, o.y);
      if (o.type === 'magnet') { const a = (o.angle * Math.PI) / 180, dx = sx - s[0], dy = sy - s[1], lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); if (Math.abs(lx) < (o.len * V().s) / 2 + 4 && Math.abs(ly) < 14) return i; }
      else if (Math.hypot(sx - s[0], sy - s[1]) < 18) return i;
    }
    return -1;
  }
  function bind() {
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('mousedown', (e) => {
      const p = pos(e); const i = F.mode === 'particle' ? -1 : hit(p[0], p[1]);
      if (i >= 0 && e.button === 0) { F.sel = i; const o = items()[i], w = toW(p[0], p[1]); F.drag = { type: 'item', dx: o.x - w[0], dy: o.y - w[1] }; updateSelPanel(true); }
      else { if (e.button === 0 && F.mode !== 'particle') { F.sel = -1; updateSelPanel(true); } F.drag = { type: 'pan', sx: p[0], sy: p[1], ox: V().ox, oy: V().oy }; }
      render();
    });
    window.addEventListener('mousemove', (e) => {
      if (!F.visible) return; const p = pos(e); const inside = p[0] >= 0 && p[1] >= 0 && p[0] <= W && p[1] <= H;
      F.mouse = inside || F.drag ? p : null;
      if (F.drag) {
        if (F.drag.type === 'pan') { V().ox = F.drag.ox + p[0] - F.drag.sx; V().oy = F.drag.oy + p[1] - F.drag.sy; F.bgDirty = true; }
        else { const w = toW(p[0], p[1]), o = items()[F.sel]; if (o) { o.x = w[0] + F.drag.dx; o.y = w[1] + F.drag.dy; F.bgDirty = true; } }
      }
      render();
    });
    window.addEventListener('mouseup', () => { F.drag = null; });
    cv.addEventListener('mouseleave', () => { if (!F.drag) { F.mouse = null; render(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const p = pos(e), v = V(), w = toW(p[0], p[1]), f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.s = Math.min(1e9, Math.max(1e-3, v.s * f)); v.ox = p[0] - W / 2 - w[0] * v.s; v.oy = p[1] - H / 2 + w[1] * v.s; F.bgDirty = true; render();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!F.visible || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && F.sel >= 0 && F.mode !== 'particle') { items().splice(F.sel, 1); F.sel = -1; updateSelPanel(true); invalidate(); }
    });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv.parentElement);
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (!cv) return; const r = cv.parentElement.getBoundingClientRect(); if (r.width < 10) return;
    dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); bg.width = cv.width; bg.height = cv.height; F.bgDirty = true; render();
  }

  // ====================================================================== UI
  function numField(label, value, unit, onchange) {
    const inp = h('input', { type: 'text', value, spellcheck: 'false' });
    inp.addEventListener('change', () => { onchange(inp.value, inp); });
    return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'unitwrap' }, inp, h('em', {}, unit)));
  }
  function updateSelPanel(rebuild) {
    const box = ui.sel; const o = items()[F.sel];
    if (!rebuild) { if (ui.selForce && o) { const fi = forceInfo(o, F.sel); ui.selForce.innerHTML = ''; if (fi) fi.text.forEach((t) => ui.selForce.appendChild(h('div', { class: 'mono small' }, t))); } return; }
    box.innerHTML = ''; ui.selForce = null;
    if (!o || F.mode === 'particle') { box.appendChild(h('div', { class: 'muted small' }, F.mode === 'particle' ? '' : 'Click an item to edit it. Drag items to move them. Drag the background to pan, scroll to zoom.')); return; }
    const apply = (fn) => (val, inp) => { const v = parseSI(val); if (Number.isNaN(v)) { inp.classList.add('bad'); return; } inp.classList.remove('bad'); fn(v); invalidate(); };
    box.appendChild(h('div', { class: 'sect' }, o.type === 'charge' ? 'Selected charge' : o.type === 'wire' ? 'Selected wire' : 'Selected magnet'));
    if (o.type === 'charge') box.appendChild(numField('Charge', fmtPlain(o.q), 'C', apply((v) => { o.q = v; })));
    if (o.type === 'wire') box.appendChild(numField('Current (+ = out of screen ⊙, − = into ⊗)', fmtPlain(o.I), 'A', apply((v) => { o.I = v; })));
    if (o.type === 'magnet') { box.appendChild(numField('Pole strength', fmtPlain(o.m), 'A·m', apply((v) => { o.m = v; }))); box.appendChild(numField('Length', fmtPlain(o.len * 100), 'cm', apply((v) => { o.len = Math.max(0.01, v / 100); }))); box.appendChild(numField('Angle', fmtPlain(o.angle), '°', apply((v) => { o.angle = v; }))); }
    box.appendChild(h('div', { class: 'two' }, numField('x', fmtPlain(Number((o.x * 100).toFixed(3))), 'cm', apply((v) => { o.x = v / 100; })), numField('y', fmtPlain(Number((o.y * 100).toFixed(3))), 'cm', apply((v) => { o.y = v / 100; }))));
    ui.selForce = h('div', {}); box.appendChild(ui.selForce);
    box.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => { items().splice(F.sel, 1); F.sel = -1; updateSelPanel(true); invalidate(); } }, 'Delete')));
    updateSelPanel(false);
  }

  function addItem(kind) {
    const v = V(), c = toW(W / 2, H / 2), j = () => (Math.random() - 0.5) * 0.06;
    const o = kind === 'pos' ? { type: 'charge', q: 1e-9, x: c[0] + j(), y: c[1] + j() }
      : kind === 'neg' ? { type: 'charge', q: -1e-9, x: c[0] + j(), y: c[1] + j() }
      : kind === 'out' ? { type: 'wire', I: 10, x: c[0] + j(), y: c[1] + j() }
      : kind === 'in' ? { type: 'wire', I: -10, x: c[0] + j(), y: c[1] + j() }
      : { type: 'magnet', m: 400, x: c[0] + j(), y: c[1] + j(), len: 0.15, angle: 0 };
    void v; items().push(o); F.sel = items().length - 1; updateSelPanel(true); invalidate();
  }

  function setMode(m) {
    F.mode = m; F.sel = -1;
    ui.seg.forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    ui.pElectric.hidden = m !== 'electric'; ui.pMagnetic.hidden = m !== 'magnetic'; ui.pParticle.hidden = m !== 'particle';
    ui.optsBox.hidden = m === 'particle';
    ui.heatLbl.textContent = m === 'electric' ? 'Potential colour map' : 'Field-strength colour map';
    ui.equipLbl.parentElement.hidden = m !== 'electric';
    ui.presetSel.innerHTML = '';
    ui.presetSel.appendChild(h('option', { value: '' }, 'Presets ▾'));
    Object.keys(PRESETS[m]).forEach((k) => ui.presetSel.appendChild(h('option', { value: k }, k)));
    if (m === 'particle' && !F.pt) resetParticle();
    updateSelPanel(true); F.bgDirty = true; render();
  }

  function mount(root_, app) {
    el = root_;
    ui.seg = ['electric', 'magnetic', 'particle'].map((m) => h('button', { 'data-m': m, class: m === 'electric' ? 'active' : '', onclick: () => setMode(m) }, m === 'electric' ? 'Electric field' : m === 'magnetic' ? 'Magnetic field' : 'Particle'));
    ui.presetSel = h('select', {}); ui.presetSel.addEventListener('change', () => {
      const k = ui.presetSel.value; if (!k) return; const pr = PRESETS[F.mode][k];
      if (F.mode === 'particle') loadParticlePreset(pr); else { F.items[F.mode] = pr(); F.sel = -1; updateSelPanel(true); invalidate(); }
      ui.presetSel.value = '';
    });
    ui.pElectric = h('div', { class: 'btnrow' }, h('button', { onclick: () => addItem('pos') }, '＋ Positive charge'), h('button', { onclick: () => addItem('neg') }, '＋ Negative charge'));
    ui.pMagnetic = h('div', { class: 'btnrow' }, h('button', { onclick: () => addItem('out') }, '＋ Wire ⊙ (out)'), h('button', { onclick: () => addItem('in') }, '＋ Wire ⊗ (in)'), h('button', { onclick: () => addItem('magnet') }, '＋ Magnet'));
    const opt = (key, text) => { const cb = h('input', { type: 'checkbox' }); cb.checked = F.opts[key]; cb.addEventListener('change', () => { F.opts[key] = cb.checked; invalidate(); }); const sp = h('span', {}, text); return h('label', { class: 'field inline' }, cb, sp); };
    const oLines = opt('lines', 'Field lines'), oEq = opt('equip', 'Equipotential lines'), oHeat = opt('heat', 'Colour map'), oVec = opt('vectors', 'Field arrows'), oF = opt('force', 'Force arrows on items');
    ui.heatLbl = oHeat.querySelector('span'); ui.equipLbl = oEq.querySelector('span');
    ui.optsBox = h('div', {}, h('div', { class: 'sect' }, 'Show'), oLines, oEq, oHeat, oVec, oF);
    ui.sel = h('div', {});

    // particle controls
    const tf = (key, label, val, unit, w) => { ui[key] = h('input', { type: 'text', value: val, spellcheck: 'false', size: w || 8 }); return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'unitwrap' }, ui[key], h('em', {}, unit))); };
    ui.pSel = h('select', {}, [...Object.entries(P.PARTICLES).map(([k, v]) => h('option', { value: k }, v.name)), h('option', { value: 'custom' }, 'Custom…')]);
    ui.pScene = h('input', { type: 'checkbox' });
    ui.pSpeed = h('input', { type: 'range', min: '-2', max: '1', step: '0.1', value: '0' });
    ui.pinfo = h('div', { class: 'live' });
    ui.pParticle = h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Particle'), ui.pSel),
      h('div', { class: 'two' }, tf('pq', 'Charge (× e)', '1', '', 6), tf('pm', 'Mass', '1.67e-27', 'kg', 8)),
      h('div', { class: 'two' }, tf('pv', 'Speed', '1e6', 'm/s', 8), tf('pa', 'Direction', '90', '°', 6)),
      h('div', { class: 'sect' }, 'Uniform fields'),
      h('div', { class: 'two' }, tf('pEx', 'E x', '0', 'V/m', 6), tf('pEy', 'E y', '0', 'V/m', 6)),
      tf('pBz', 'B (+ = out of screen ⊙, − = into ⊗)', '1m', 'T', 8),
      h('label', { class: 'field inline' }, ui.pScene, h('span', {}, 'Also feel the charges from the Electric field scene')),
      h('label', { class: 'field' }, h('span', {}, 'Simulation speed'), ui.pSpeed),
      h('div', { class: 'btnrow' }, (ui.pRun = h('button', { class: 'primary', onclick: toggleParticle }, '▶ Start')), h('button', { onclick: () => { resetParticle(); } }, '⟲ Reset')),
      h('div', { class: 'sect' }, 'Live values'), ui.pinfo);
    ui.pParticle.hidden = true;
    ['pq', 'pm', 'pv', 'pa', 'pEx', 'pEy', 'pBz'].forEach((k) => ui[k].addEventListener('change', () => { resetParticle(); }));
    ui.pSel.addEventListener('change', () => { const pr = P.PARTICLES[ui.pSel.value]; if (pr) { ui.pq.value = fmtPlain(pr.q / P.PARTICLES.proton.q); ui.pm.value = String(pr.m); } resetParticle(); });
    ui.pScene.addEventListener('change', () => { resetParticle(); });
    ui.pq.value = '1'; ui.pSel.value = 'proton'; ui.pm.value = String(P.PARTICLES.proton.m);

    ui.read = h('div', { class: 'fl-read', style: { display: 'none' } });
    const side = h('div', { class: 'fl-side' },
      h('div', { class: 'seg wide' }, ui.seg), h('label', { class: 'field' }, h('span', {}, 'Presets'), ui.presetSel),
      ui.pElectric, ui.pMagnetic, ui.pParticle, ui.optsBox, ui.sel,
      h('div', { class: 'sect' }, 'Notes'),
      h('div', { class: 'muted small' }, 'Electric: E = kq/r², V = kq/r, superposition of every charge. Magnetic: B = μ₀I/(2πr) around each wire, poles for magnets. Hover over the canvas to read the field at any point; the little arrow shows its direction.'));
    cv = h('canvas', {}); bg = document.createElement('canvas'); bgG = bg.getContext('2d'); g = cv.getContext('2d');
    const main = h('div', { class: 'fl-main' },
      h('div', { class: 'fl-bar' },
        h('button', { onclick: () => zoom(1.25) }, '＋'), h('button', { onclick: () => zoom(0.8) }, '−'), h('button', { onclick: () => { const v = V(); v.ox = 0; v.oy = 0; F.bgDirty = true; render(); } }, 'Centre'),
        h('span', { class: 'muted small' }, 'Scroll to zoom · drag the background to pan · drag items to move them · Delete removes the selected item')),
      h('div', { class: 'fl-wrap' }, cv, ui.read));
    el.appendChild(side); el.appendChild(main);
    bind(); setMode('electric'); resize();
    requestAnimationFrame(loop);
  }

  function zoom(f) { const v = V(); v.s = Math.min(1e9, Math.max(1e-3, v.s * f)); v.ox *= f; v.oy *= f; F.bgDirty = true; render(); }
  function toggleParticle() {
    if (!F.pt) resetParticle(); if (!F.pt) return;
    F.pt.running = !F.pt.running; ui.pRun.textContent = F.pt.running ? '❚❚ Pause' : '▶ Start';
  }
  function loadParticlePreset(p) {
    ui.pSel.value = p.p; const pr = P.PARTICLES[p.p]; ui.pq.value = fmtPlain(pr.q / P.PARTICLES.proton.q); ui.pm.value = String(pr.m);
    ui.pv.value = fmtPlain(p.v); ui.pa.value = String(p.ang); ui.pEx.value = fmtPlain(p.Ex); ui.pEy.value = fmtPlain(p.Ey); ui.pBz.value = fmtPlain(p.Bz);
    ui.pScene.checked = false; if (F.pt) F.pt.running = false; ui.pRun.textContent = '▶ Start'; resetParticle();
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!F.visible || F.mode !== 'particle' || !F.pt || !F.pt.running) return;
    stepParticle(dt); render();
  }

  Incog.FieldLab = {
    mount,
    onShow() { F.visible = true; resize(); if (!F.centered) { F.centered = true; } F.bgDirty = true; render(); },
    onHide() { F.visible = false; },
    redraw() { F.bgDirty = true; if (F.visible) render(); },
    state: F,
  };
})(typeof window !== 'undefined' ? window : globalThis);

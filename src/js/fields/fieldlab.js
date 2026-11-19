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
      'Two bar magnets: N facing S (attract)': () => [{ type: 'magnet', m: 400, x: -0.15, y: 0, len: 0.2, angle: 0 }, { type: 'magnet', m: 400, x: 0.15, y: 0, len: 0.2, angle: 0 }],
      'Two bar magnets: N facing N (repel)': () => [{ type: 'magnet', m: 400, x: -0.15, y: 0, len: 0.2, angle: 0 }, { type: 'magnet', m: 400, x: 0.15, y: 0, len: 0.2, angle: 180 }],
      'One north pole and one south pole': () => [{ type: 'magnet', pole: 'north', m: 400, x: -0.1, y: 0, len: 0.2, angle: 0 }, { type: 'magnet', pole: 'south', m: 400, x: 0.1, y: 0, len: 0.2, angle: 0 }],
      'Two north poles (repel)': () => [{ type: 'magnet', pole: 'north', m: 400, x: -0.1, y: 0, len: 0.2, angle: 0 }, { type: 'magnet', pole: 'north', m: 400, x: 0.1, y: 0, len: 0.2, angle: 0 }],
    },
    particle: {
      'Electron circling in B = 1 mT': { p: 'electron', v: 1e6, ang: 90, Ex: 0, Ey: 0, Bz: 1e-3 },
      'Proton: E × B drift (cycloid)': { p: 'proton', v: 0, ang: 0, Ex: 0, Ey: 2000, Bz: 1e-3 },
      'Velocity selector (goes straight)': { p: 'proton', v: 2e6, ang: 0, Ex: 0, Ey: 2000, Bz: 1e-3 },
      'Electron in a uniform E field': { p: 'electron', v: 3e6, ang: 0, Ex: 0, Ey: 500, Bz: 0 },
      'Alpha particle in B = 10 mT': { p: 'alpha', v: 1e6, ang: 90, Ex: 0, Ey: 0, Bz: 1e-2 },
      'Electron + positron: opposite circles': { Ex: 0, Ey: 0, Bz: 1e-3, list: [{ p: 'electron', v: 1e6, ang: 90 }, { p: 'positron', v: 1e6, ang: 90 }] },
      'Proton vs alpha, same speed (compare radius)': { Ex: 0, Ey: 0, Bz: 0.1, list: [{ p: 'proton', v: 1e6, ang: 90 }, { p: 'alpha', v: 1e6, ang: 90 }] },
      'Electron + positron in E × B (same drift direction)': { Ex: 0, Ey: 2000, Bz: 1e-3, list: [{ p: 'electron', v: 0, ang: 0 }, { p: 'positron', v: 0, ang: 0 }] },
    },
  };

  const F = {
    mode: 'electric',
    items: { electric: [], magnetic: [] },
    view: { electric: { ox: 0, oy: 0, s: 900 }, magnetic: { ox: 0, oy: 0, s: 900 }, particle: { ox: 0, oy: 0, s: 1000 } },
    opts: { lines: true, equip: true, heat: false, vectors: false, force: true, anim: true },
    flow: [], vecs: [], animT: 0,
    sel: -1, mouse: null, drag: null, bgDirty: true, visible: false, centered: false,
    pts: [], ptSel: 0, running: false, real: false, uni: { Ex: 0, Ey: 0, Bz: 0 }, pid: 0, dtCommon: 1, // particles (any number)
    sumKey: '',
  };

  let el, cv, g, bg, bgG, W = 0, H = 0, dpr = 1, ui = {};
  const dark = () => !document.body.classList.contains('theme-light');
  const V = () => F.view[F.mode];
  const toS = (x, y) => { const v = V(); return [W / 2 + v.ox + x * v.s, H / 2 + v.oy - y * v.s]; };
  const toW = (sx, sy) => { const v = V(); return [(sx - W / 2 - v.ox) / v.s, -(sy - H / 2 - v.oy) / v.s]; };
  const items = () => F.items[F.mode] || [];

  // ================================================================ physics glue
  const fieldFn = () => {
    const it = items();
    if (F.mode === 'electric') return (x, y) => { const e = P.electric(it, x, y); return [e.Ex, e.Ey]; };
    return (x, y) => { const b = P.magnetic(it, x, y); return [b.Bx, b.By]; };
  };
  const mag = (v) => Math.hypot(v[0], v[1]);

  // ================================================================ background layer
  function drawBackground() {
    const c = bgG, it = items(), v = V();
    F.flow = []; F.vecs = [];
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
    const sp = [], cum = [0];                                   // remember the line (screen pixels) for the moving-flow layer
    pts.forEach((p, i) => { const s = toS(p[0], p[1]); sp.push(s); if (i) cum.push(cum[i - 1] + Math.hypot(s[0] - sp[i - 1][0], s[1] - sp[i - 1][1])); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); c.stroke();
    F.flow.push({ pts: sp, cum, len: cum[cum.length - 1] });
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
        else if (o.type === 'magnet') {
          for (const pl of P.poles(o)) {
            if (pl.qm < 0 && o.pole !== 'south') continue;                    // a bar: lines start at its north end only
            for (let k = 0; k < 14; k++) { const a = (2 * Math.PI * (k + 0.5)) / 14; seeds.push({ x: pl.x + (7 / v.s) * Math.cos(a), y: pl.y + (7 / v.s) * Math.sin(a), both: false, dir: pl.qm < 0 ? -1 : 1 }); }
          }
        }
      }
      const poleHit = (x, y) => it.some((o) => o.type === 'magnet' && P.poles(o).some((p) => Math.hypot(x - p.x, y - p.y) < 6 / v.s));
      for (const sd of seeds) {
        const start = [sd.x, sd.y];
        const stop = (x, y, i) => !inView(x, y) || poleHit(x, y) || (i > 40 && Math.hypot(x - start[0], y - start[1]) < ds * 1.5);
        const fwd = P.trace(fn, sd.x, sd.y, sd.dir || 1, ds, 1400, stop);
        drawPolyline(c, (sd.dir || 1) < 0 ? fwd.slice().reverse() : fwd, lineColor);
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
      F.vecs.push({ x: sx, y: sy, a, L });
      c.strokeStyle = c.fillStyle = (F.mode === 'electric' ? `rgba(255,200,61,${alpha})` : `rgba(120,230,170,${alpha})`);
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx - Math.cos(a) * L / 2, sy - Math.sin(a) * L / 2); c.lineTo(sx + Math.cos(a) * L / 2, sy + Math.sin(a) * L / 2); c.stroke();
      arrowHead(c, sx + Math.cos(a) * L / 2, sy + Math.sin(a) * L / 2, a, 4.5);
    }
  }

  // ============================================== moving flow layer (animated field lines and arrows)
  function pointAt(L, d) {
    const cum = L.cum; let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1, f = (d - cum[lo]) / seg, a = L.pts[lo], b = L.pts[hi];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  function drawFlow(c) {
    const t = F.animT, elec = F.mode === 'electric';
    const col = elec ? (dark() ? '255,214,90' : '214,120,0') : (dark() ? '120,240,175' : '0,140,80');
    c.lineCap = 'round';
    // pulses travelling along each field line, in the direction of the field
    const gap = 44, speed = 70, tail = 14;
    for (const L of F.flow) {
      if (L.len < 24) continue;
      const off = (t * speed) % gap;
      for (let d = off; d < L.len; d += gap) {
        const p1 = pointAt(L, d), p0 = pointAt(L, Math.max(0, d - tail));
        const grad = c.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
        grad.addColorStop(0, 'rgba(' + col + ',0)'); grad.addColorStop(1, 'rgba(' + col + ',0.95)');
        c.strokeStyle = grad; c.lineWidth = 3; c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke();
        c.fillStyle = 'rgba(' + col + ',1)'; c.beginPath(); c.arc(p1[0], p1[1], 2.6, 0, 7); c.fill();
      }
    }
    // each field arrow gets a bright pulse that runs from its tail to its head
    for (const v of F.vecs) {
      const ph = (t * 0.9 + v.x * 0.013 + v.y * 0.017) % 1;
      const x = v.x + Math.cos(v.a) * v.L * (ph - 0.5), y = v.y + Math.sin(v.a) * v.L * (ph - 0.5);
      c.fillStyle = 'rgba(' + col + ',' + (0.35 + 0.65 * Math.sin(ph * Math.PI)).toFixed(2) + ')'; c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill();
    }
    c.lineCap = 'butt';
  }

  // ================================================================== items
  const isPole = (o) => o.type === 'magnet' && (o.pole === 'north' || o.pole === 'south');
  const handleScreen = (o) => { const sc = toS(o.x, o.y), a = (o.angle * Math.PI) / 180, d = (o.len * V().s) / 2 + 22; return [sc[0] + d * Math.cos(a), sc[1] - d * Math.sin(a)]; };
  function drawItem(c, o, i) {
    const s = toS(o.x, o.y), sel = i === F.sel, v = V();
    c.save(); c.translate(s[0], s[1]);
    if (o.type === 'charge') {
      const qmax = Math.max(...items().filter((z) => z.type === 'charge').map((z) => Math.abs(z.q)), 1e-12);
      const r = 8 + 8 * Math.sqrt(Math.abs(o.q) / qmax);
      c.fillStyle = o.q >= 0 ? ELEC : NEG; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
      c.strokeStyle = sel ? '#ffc83d' : 'rgba(255,255,255,.85)'; c.lineWidth = sel ? 3 : 1.5; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r / 2.2, 0); c.lineTo(r / 2.2, 0); if (o.q > 0) { c.moveTo(0, -r / 2.2); c.lineTo(0, r / 2.2); } c.stroke();
      label(c, (i >= 0 && items().length <= 8 ? 'q' + (i + 1) + '  ' : '') + fmtSI(o.q, 'C', 3), 0, r + 11);
    } else if (o.type === 'wire') {
      c.fillStyle = dark() ? '#1d2733' : '#fff'; c.strokeStyle = sel ? '#ffc83d' : MAG; c.lineWidth = sel ? 3 : 2; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill(); c.stroke();
      c.fillStyle = c.strokeStyle;
      if (o.I >= 0) { c.beginPath(); c.arc(0, 0, 3.4, 0, 7); c.fill(); } else { c.beginPath(); c.moveTo(-5, -5); c.lineTo(5, 5); c.moveTo(5, -5); c.lineTo(-5, 5); c.stroke(); }
      label(c, (i >= 0 && items().length <= 8 ? 'w' + (i + 1) + '  ' : '') + fmtSI(Math.abs(o.I), 'A', 3) + (o.I >= 0 ? ' ⊙' : ' ⊗'), 0, 25);
    } else if (o.type === 'magnet' && isPole(o)) {                              // an isolated pole
      const N = o.pole === 'north';
      c.fillStyle = N ? '#ff5d6c' : '#4cc2ff'; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
      c.strokeStyle = sel ? '#ffc83d' : 'rgba(255,255,255,.85)'; c.lineWidth = sel ? 3 : 1.5; c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(N ? 'N' : 'S', 0, 1);
      label(c, (i >= 0 && items().length <= 8 ? 'M' + (i + 1) + '  ' : '') + (N ? 'N pole ' : 'S pole ') + fmtSI(o.m, 'A·m', 2), 0, 28);
    } else if (o.type === 'magnet') {
      c.rotate((-o.angle * Math.PI) / 180); const L = o.len * v.s, hgt = 20;
      c.fillStyle = '#ff5d6c'; c.fillRect(0, -hgt / 2, L / 2, hgt); c.fillStyle = '#4cc2ff'; c.fillRect(-L / 2, -hgt / 2, L / 2, hgt);
      c.strokeStyle = sel ? '#ffc83d' : 'rgba(255,255,255,.8)'; c.lineWidth = sel ? 3 : 1.5; c.strokeRect(-L / 2, -hgt / 2, L, hgt);
      c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', L / 4, 1); c.fillText('S', -L / 4, 1);
      if (sel) {                                                                // rotation handle: drag it to turn the bar
        c.strokeStyle = '#ffc83d'; c.lineWidth = 2; c.beginPath(); c.moveTo(L / 2, 0); c.lineTo(L / 2 + 22, 0); c.stroke();
        c.fillStyle = '#ffc83d'; c.beginPath(); c.arc(L / 2 + 22, 0, 6.5, 0, 7); c.fill();
      }
      c.rotate((o.angle * Math.PI) / 180);
      if (i >= 0 && items().length <= 8) label(c, 'M' + (i + 1), 0, -(hgt / 2 + (L / 2) * Math.abs(Math.sin((o.angle * Math.PI) / 180)) + 10));
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
    if (o.type === 'charge') {
      const f = P.forceOnCharge(it, i), text = [`Net force on it: ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N', 4)}  ∠ ${(Math.atan2(f.Fy, f.Fx) * 180 / Math.PI).toFixed(1)}°`, `Field there (from the others): ${fmtSI(Math.hypot(f.Ex, f.Ey), 'V/m', 4)}`];
      it.forEach((z, j) => { if (j === i || z.type !== 'charge') return; const r = Math.hypot(z.x - o.x, z.y - o.y); if (r > 0) text.push(`from q${j + 1}: ${fmtSI(P.K * Math.abs(o.q * z.q) / (r * r), 'N', 4)}  (${o.q * z.q < 0 ? 'attracts' : 'repels'}),  r = ${fmtSI(r, 'm', 4)}`); });
      return { F: [f.Fx, f.Fy], text };
    }
    if (o.type === 'wire') { const f = P.forceOnWire(it, i); return { F: [f.Fx, f.Fy], text: [`Force per metre: ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N/m', 4)}`, `B there (others): ${fmtSI(Math.hypot(f.Bx, f.By), 'T', 4)}`] }; }
    if (o.type === 'magnet') { const f = P.forceOnMagnet(it, i); return { F: [f.Fx, f.Fy], text: [`Net force on it: ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N', 4)}  ∠ ${(Math.atan2(f.Fy, f.Fx) * 180 / Math.PI).toFixed(1)}°`, 'Each pole feels F = (pole strength) × B.'] }; }
    return null;
  }

  function hoverText() {
    if (!F.mouse || !items().length) return [];
    const w = toW(F.mouse[0], F.mouse[1]), it = items();
    const pos = `x = ${fmtSI(w[0], 'm', 3)},  y = ${fmtSI(w[1], 'm', 3)}`;
    if (F.mode === 'electric') { const e = P.electric(it, w[0], w[1]); return [pos, `V = ${fmtSI(e.V, 'V', 4)}`, `|E| = ${fmtSI(Math.hypot(e.Ex, e.Ey), 'V/m', 4)}  ∠ ${(Math.atan2(e.Ey, e.Ex) * 180 / Math.PI).toFixed(1)}°`]; }
    const b = P.magnetic(it, w[0], w[1]);
    return [pos, `|B| = ${fmtSI(Math.hypot(b.Bx, b.By), 'T', 4)}  ∠ ${(Math.atan2(b.By, b.Bx) * 180 / Math.PI).toFixed(1)}°`];
  }

  // ================================================================== overview (what the items share, no click needed)
  const ang = (fx, fy) => (Math.atan2(fy, fx) * 180 / Math.PI).toFixed(1) + '°';
  function updateSummary() {
    if (!ui.sum) return;
    const it = items(), key = F.mode + JSON.stringify(it);
    if (key === F.sumKey) return; F.sumKey = key;
    const box = ui.sum; box.innerHTML = '';
    const line = (t, cls) => box.appendChild(h('div', { class: 'mono small' + (cls ? ' ' + cls : '') }, t));
    const head = (t) => box.appendChild(h('div', { class: 'sect' }, t));
    if (F.mode === 'electric') {
      const ch = it.map((o, i) => ({ o, i })).filter((z) => z.o.type === 'charge');
      head('Overview: all charges together');
      if (!ch.length) { line('Add charges to see the forces between them.', 'muted'); return; }
      const Q = ch.reduce((a, z) => a + z.o.q, 0);
      let U = 0; for (let a = 0; a < ch.length; a++) for (let b = a + 1; b < ch.length; b++) { const r = Math.hypot(ch[a].o.x - ch[b].o.x, ch[a].o.y - ch[b].o.y); if (r > 0) U += P.K * ch[a].o.q * ch[b].o.q / r; }
      line(`Charges: ${ch.length}    Total charge  Q = Σq = ${fmtSI(Q, 'C', 4)}`);
      if (ch.length > 1) line(`Energy stored in the arrangement  U = Σ kq₁q₂/r = ${fmtSI(U, 'J', 4)}`);
      if (ch.length >= 2 && ch.length <= 6) {
        head('Between each pair: the force is shared');
        for (let a = 0; a < ch.length; a++) for (let b = a + 1; b < ch.length; b++) {
          const A = ch[a].o, B = ch[b].o, r = Math.hypot(A.x - B.x, A.y - B.y); if (!(r > 0)) continue;
          line(`q${ch[a].i + 1} ↔ q${ch[b].i + 1}:  r = ${fmtSI(r, 'm', 4)},  F = k|q₁q₂|/r² = ${fmtSI(P.K * Math.abs(A.q * B.q) / (r * r), 'N', 4)}  ${A.q * B.q < 0 ? 'attract' : 'repel'}`);
        }
        line('Each charge of a pair feels the same size of force (opposite directions). What differs is the field E at each place.', 'muted');
      } else if (ch.length > 6) line('Many charges: pair list hidden. Click a charge to see its own forces.', 'muted');
      head('Net force on each charge');
      let sx = 0, sy = 0, big = 0;
      ch.slice(0, 12).forEach((z) => { const f = P.forceOnCharge(it, z.i); sx += f.Fx; sy += f.Fy; big = Math.max(big, Math.hypot(f.Fx, f.Fy)); line(`q${z.i + 1}:  F = ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N', 4)}  ∠ ${ang(f.Fx, f.Fy)}     E there = ${fmtSI(Math.hypot(f.Ex, f.Ey), 'V/m', 4)}`); });
      if (ch.length <= 12 && ch.length > 1) line(`Sum of all the forces = ${fmtSI(Math.hypot(sx, sy), 'N', 3)}  ${Math.hypot(sx, sy) <= 1e-9 * Math.max(big, 1e-30) + 1e-30 ? '✓ the forces inside the system cancel (Newton 3)' : ''}`);
    } else {
      head('Overview: all items together');
      const wires = it.map((o, i) => ({ o, i })).filter((z) => z.o.type === 'wire');
      if (!it.length) { line('Add wires or magnets to see the forces between them.', 'muted'); return; }
      if (wires.length >= 2 && wires.length <= 6) {
        head('Between each pair of wires');
        for (let a = 0; a < wires.length; a++) for (let b = a + 1; b < wires.length; b++) {
          const A = wires[a].o, B = wires[b].o, d = Math.hypot(A.x - B.x, A.y - B.y); if (!(d > 0)) continue;
          line(`w${wires[a].i + 1} ↔ w${wires[b].i + 1}:  d = ${fmtSI(d, 'm', 4)},  F/L = μ₀I₁I₂/(2πd) = ${fmtSI(P.MU0 * Math.abs(A.I * B.I) / (2 * Math.PI * d), 'N/m', 4)}  ${A.I * B.I > 0 ? 'attract (same direction)' : 'repel (opposite)'}`);
        }
        line('Both wires of a pair feel the same size of force per metre, in opposite directions.', 'muted');
      }
      head('Net force on each item');
      it.slice(0, 12).forEach((o, i) => {
        if (o.type === 'wire') { const f = P.forceOnWire(it, i); line(`w${i + 1}:  F/L = ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N/m', 4)}  ∠ ${ang(f.Fx, f.Fy)}     B there = ${fmtSI(Math.hypot(f.Bx, f.By), 'T', 4)}`); }
        else if (o.type === 'magnet') { const f = P.forceOnMagnet(it, i); line(`M${i + 1} (${isPole(o) ? (o.pole === 'north' ? 'N pole' : 'S pole') : 'bar'}):  F = ${fmtSI(Math.hypot(f.Fx, f.Fy), 'N', 4)}  ∠ ${ang(f.Fx, f.Fy)}`); }
      });
    }
  }

  // ================================================================== render
  function render(skipUI) {
    if (!cv || !W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (F.mode === 'particle') { renderParticle(); return; }
    if (F.bgDirty) { drawBackground(); F.bgDirty = false; }
    g.drawImage(bg, 0, 0, W, H);
    const it = items();
    if (F.opts.anim && it.length && (F.opts.lines || F.opts.vectors)) drawFlow(g);
    if (!it.length) {
      g.fillStyle = dark() ? '#8fa3b8' : '#5d7085'; g.font = '14px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Empty. Add ' + (F.mode === 'electric' ? 'a charge' : 'a wire or a magnet') + ' on the left, or pick a preset.', W / 2, H / 2);
    }
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
    if (skipUI) return;                                   // animation frames only repaint the picture
    updateSummary();
    updateReadout(hoverText());
    updateSelPanel(false);
  }
  function updateReadout(lines) { ui.read.innerHTML = ''; lines.forEach((t, i) => ui.read.appendChild(h('div', { class: i === 0 ? 'muted mono' : 'mono' }, t))); ui.read.style.display = lines.length ? '' : 'none'; }
  const invalidate = () => { F.bgDirty = true; render(); };

  // ================================================================ particles (any number, all in the same uniform fields)
  const PCOL = ['#ff5d6c', '#4cc2ff', '#78e6aa', '#ffc83d', '#c792ea', '#ff9f5a', '#5eead4', '#f472b6'];
  const SYM = { electron: 'e⁻', positron: 'e⁺', proton: 'p⁺', alpha: 'α', custom: '?' };
  const E_CH = 1.602176634e-19;
  const kg = (m) => m.toExponential(3).replace('e-', '×10⁻').replace(/⁻(\d+)/, (a, d) => '⁻' + d.replace(/\d/g, (x) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[x])) + ' kg';
  function readUni() { F.uni = { Ex: parseSI(ui.pEx.value) || 0, Ey: parseSI(ui.pEy.value) || 0, Bz: parseSI(ui.pBz.value) || 0 }; return F.uni; }
  function makePart(key, o) {
    o = o || {}; const pr = P.PARTICLES[key];
    const idx = F.pid++;
    return { id: idx, key, name: pr ? pr.name : 'Custom', q: pr ? pr.q : (o.q != null ? o.q : E_CH), m: pr ? pr.m : (o.m != null ? o.m : 1.67262192e-27),
      v: o.v != null ? o.v : 1e6, ang: o.ang != null ? o.ang : 90, x0: o.x0 || 0, y0: o.y0 || 0, col: PCOL[idx % PCOL.length] };
  }
  function initRuntime(s) {
    const u = F.uni, a = (s.ang * Math.PI) / 180, v0 = s.v;
    const omega = (s.q * u.Bz) / s.m, acc = Math.hypot((s.q * u.Ex) / s.m, (s.q * u.Ey) / s.m);
    const drift = u.Bz !== 0 ? Math.hypot(u.Ey, u.Ex) / Math.abs(u.Bz) : 0;
    let Lc, tau;
    if (omega !== 0) { tau = (2 * Math.PI) / Math.abs(omega); Lc = Math.max(Math.abs(v0) / Math.abs(omega), (drift / Math.abs(omega)) * 2, 1e-12); if (Lc < 1e-9) Lc = 1e-3; }
    else { Lc = 0.15; tau = v0 > 0 ? Lc / v0 : acc > 0 ? Math.sqrt((2 * Lc) / acc) : 1; }
    Object.assign(s, { x: s.x0, y: s.y0, vx: v0 * Math.cos(a), vy: v0 * Math.sin(a), t: 0, trail: [[s.x0, s.y0]], tau, Lc, omega, drift, steps: 0, dt: tau / 400 });
  }
  function resetParticles() {
    readUni();
    const bad = F.pts.find((s) => !(isFinite(s.q) && isFinite(s.m) && s.m > 0 && isFinite(s.v)));
    if (bad) { ui.pinfo.textContent = 'Check the numbers: mass must be positive.'; return; }
    F.pts.forEach(initRuntime);
    const v = F.view.particle;
    if (F.pts.length) {
      const Lc = Math.max(...F.pts.map((s) => s.Lc)); v.s = 110 / Lc;
      const cx = F.pts.reduce((a, s) => a + s.x0, 0) / F.pts.length, cy = F.pts.reduce((a, s) => a + s.y0, 0) / F.pts.length;
      v.ox = -cx * v.s; v.oy = cy * v.s;
    } else { v.s = 1000; v.ox = 0; v.oy = 0; }
    F.lastInfo = 0; updateParticleInfo(true); render();
  }
  function stepParticles(frameDt) {
    if (!F.pts.length) return;
    const speed = Math.pow(10, Number(ui.pSpeed.value)), u = F.uni, it = F.items.electric, useScene = ui.pScene.checked;
    const tauRef = Math.max(...F.pts.map((s) => s.tau));
    for (const s of F.pts) {
      const simT = (F.real ? tauRef : s.tau) / 3 * speed * frameDt;           // real-time: every particle gets the same slice of time
      const dt = F.real ? Math.min(s.dt, simT) : s.dt;
      const n = Math.min(3000, Math.max(1, Math.round(simT / dt)));
      const Efn = (x, y) => { let Ex = u.Ex, Ey = u.Ey; if (useScene) { const e = P.electric(it, x, y); Ex += e.Ex; Ey += e.Ey; } return [Ex, Ey]; };
      for (let k = 0; k < n; k++) {
        P.boris(s, Efn, u.Bz, s.q, s.m, dt); s.t += dt; s.steps++;
        if (s.steps % 4 === 0) { s.trail.push([s.x, s.y]); if (s.trail.length > 6000) s.trail.shift(); }
      }
    }
    const v = F.view.particle;
    if (F.pts.some((s) => { const sp = toS(s.x, s.y); return sp[0] < 30 || sp[0] > W - 30 || sp[1] < 30 || sp[1] > H - 30; })) { v.s *= 0.6; v.ox *= 0.6; v.oy *= 0.6; }
  }
  const rotText = (s) => (s.omega === 0 ? 'no magnetic turning' : s.omega > 0 ? 'clockwise ↻' : 'anticlockwise ↺');
  function partOverview(s, i) {
    const u = F.uni, sp = Math.hypot(s.vx, s.vy), n = s.q / E_CH;
    let t = `${i + 1}. ${s.name}  q=${fmtPlain(+n.toPrecision(3))}e  m=${kg(s.m)}  v=${fmtSI(sp, 'm/s', 3)}`;
    if (u.Bz !== 0) t += `  r=${fmtSI((s.m * sp) / (Math.abs(s.q) * Math.abs(u.Bz)), 'm', 3)}  T=${fmtSI((2 * Math.PI) / Math.abs(s.omega), 's', 3)}  ${rotText(s)}`;
    else if (u.Ex || u.Ey) t += `  a=${fmtSI(Math.hypot((s.q * u.Ex) / s.m, (s.q * u.Ey) / s.m), 'm/s²', 3)}`;
    return t;
  }
  function partDetail(s) {
    const u = F.uni, sp = Math.hypot(s.vx, s.vy), ke = 0.5 * s.m * sp * sp, L = [];
    const Fx = s.q * (u.Ex + s.vy * u.Bz), Fy = s.q * (u.Ey - s.vx * u.Bz), Fe = Math.abs(s.q) * Math.hypot(u.Ex, u.Ey), Fm = Math.abs(s.q) * sp * Math.abs(u.Bz);
    L.push(`${s.name}:  charge q = ${fmtPlain(+(s.q / E_CH).toPrecision(4))} e = ${fmtSI(s.q, 'C', 4)},  mass m = ${kg(s.m)}`);
    L.push(`Time t = ${fmtSI(s.t, 's', 4)}    speed v = ${fmtSI(sp, 'm/s', 4)}`);
    L.push(`Kinetic energy = ½mv² = ${fmtSI(ke, 'J', 4)}  (${fmtSI(ke / E_CH, 'eV', 4)})`);
    L.push(`Force now F = q(E + v×B) = ${fmtSI(Math.hypot(Fx, Fy), 'N', 4)}  ∠ ${ang(Fx, Fy)}`);
    if (u.Ex || u.Ey) L.push(`   electric part  |q|E = ${fmtSI(Fe, 'N', 4)}`);
    if (u.Bz !== 0) {
      const w = Math.abs(s.omega);
      L.push(`   magnetic part  |q|vB = ${fmtSI(Fm, 'N', 4)}  (always sideways to the motion)`);
      L.push(`Turns ${rotText(s)}  because q·B ${s.q * u.Bz > 0 ? '> 0' : '< 0'}`);
      L.push(`Radius  r = mv/(|q|B) = ${fmtSI((s.m * sp) / (Math.abs(s.q) * Math.abs(u.Bz)), 'm', 4)}`);
      L.push(`Period  T = 2πm/(|q|B) = ${fmtSI((2 * Math.PI) / w, 's', 4)},   f = ${fmtSI(w / (2 * Math.PI), 'Hz', 4)}`);
      if (u.Ex || u.Ey) L.push(`E×B drift speed = E/B = ${fmtSI(s.drift, 'm/s', 4)}  (same for every charge)`);
    } else if (u.Ex || u.Ey) L.push(`Acceleration  a = qE/m = ${fmtSI(Math.hypot((s.q * u.Ex) / s.m, (s.q * u.Ey) / s.m), 'm/s²', 4)}`);
    else L.push('No field: it moves in a straight line at constant speed.');
    return L;
  }
  function updateParticleInfo(force) {
    const now = performance.now(); if (!force && now - (F.lastInfo || 0) < 120) return; F.lastInfo = now;
    if (!ui.pOver) return;
    ui.pOver.innerHTML = ''; ui.pinfo.innerHTML = '';
    const line = (box, t, cls) => box.appendChild(h('div', { class: 'mono small' + (cls ? ' ' + cls : '') }, t));
    if (!F.pts.length) { line(ui.pOver, 'No particles yet. Use the ＋ buttons above.', 'muted'); return; }
    F.pts.forEach((s, i) => { const d = h('div', { class: 'mono small', style: { color: s.col } }, partOverview(s, i)); ui.pOver.appendChild(d); });
    if (F.pts.length === 2 && F.uni.Bz !== 0) {
      const [a, b] = F.pts, ra = (a.m * Math.hypot(a.vx, a.vy)) / Math.abs(a.q), rb = (b.m * Math.hypot(b.vx, b.vy)) / Math.abs(b.q);
      if (ra > 0 && rb > 0) line(ui.pOver, `Compare: r₂/r₁ = ${(rb / ra).toPrecision(3)},   T₂/T₁ = ${((b.m / Math.abs(b.q)) / (a.m / Math.abs(a.q))).toPrecision(3)}   (r ∝ mv/|q|, T ∝ m/|q|)`, 'muted');
    }
    if (F.real) line(ui.pOver, 'Real time: every particle runs on the same clock.', 'muted');
    const s = F.pts[F.ptSel]; if (s) partDetail(s).forEach((t, k) => line(ui.pinfo, t, k === 0 ? 'bold' : ''));
  }
  function hitParticle(sx, sy) { for (let i = F.pts.length - 1; i >= 0; i--) { const p = toS(F.pts[i].x, F.pts[i].y); if (Math.hypot(sx - p[0], sy - p[1]) < 13) return i; } return -1; }
  function selectParticle(j) { F.ptSel = j; buildPartList(); loadSelectedIntoFields(); updateParticleInfo(true); }
  function renderParticle() {
    const v = F.view.particle, u = F.uni;
    g.fillStyle = dark() ? '#0e131a' : '#f7f9fb'; g.fillRect(0, 0, W, H);
    const gridM = niceGrid(70 / v.s);
    g.strokeStyle = dark() ? '#1a2430' : '#e3e9ef'; g.lineWidth = 1; g.beginPath();
    const x0 = toW(0, 0)[0], x1 = toW(W, 0)[0], y0 = toW(0, H)[1], y1 = toW(0, 0)[1];
    for (let x = Math.ceil(x0 / gridM) * gridM; x < x1; x += gridM) { const sx = toS(x, 0)[0]; g.moveTo(sx, 0); g.lineTo(sx, H); }
    for (let y = Math.ceil(y0 / gridM) * gridM; y < y1; y += gridM) { const sy = toS(0, y)[1]; g.moveTo(0, sy); g.lineTo(W, sy); }
    g.stroke();
    g.fillStyle = dark() ? '#5b6d82' : '#7d8da0'; g.font = '10.5px "Cascadia Mono",Consolas,monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('grid ' + fmtSI(gridM, 'm', 2), 8, H - 6);
    if (!F.pts.length) { g.fillStyle = dark() ? '#8fa3b8' : '#5d7085'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '14px "Segoe UI",sans-serif'; g.fillText('Add one or more particles on the left, then press Start', W / 2, H / 2); updateReadout([]); updateParticleInfo(); return; }
    if (u.Bz !== 0) {
      g.strokeStyle = g.fillStyle = dark() ? 'rgba(120,200,255,.35)' : 'rgba(20,110,200,.35)'; g.lineWidth = 1.4;
      for (let sy = 24; sy < H; sy += 48) for (let sx = 24; sx < W; sx += 48) {
        g.beginPath(); g.arc(sx, sy, 6.5, 0, 7); g.stroke();
        if (u.Bz > 0) { g.beginPath(); g.arc(sx, sy, 1.8, 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(sx - 3.4, sy - 3.4); g.lineTo(sx + 3.4, sy + 3.4); g.moveTo(sx + 3.4, sy - 3.4); g.lineTo(sx - 3.4, sy + 3.4); g.stroke(); }
      }
    }
    if (u.Ex || u.Ey) { const m = Math.hypot(u.Ex, u.Ey), ux = u.Ex / m, uy = u.Ey / m; for (let sy = 70; sy < H; sy += 110) for (let sx = 70; sx < W; sx += 150) arrow(g, sx - ux * 18, sy + uy * 18, sx + ux * 18, sy - uy * 18, 'rgba(255,200,61,.5)', 2); }
    if (ui.pScene.checked) F.items.electric.forEach((o) => drawItem(g, o, -1));
    g.lineJoin = 'round';
    F.pts.forEach((s, k) => {
      const rgb = hexRgb(s.col);
      if (s.omega !== 0 && !u.Ex && !u.Ey && !ui.pScene.checked) {            // the ideal circle
        const r0 = Math.hypot(s.vx, s.vy) / Math.abs(s.omega), c = toS(s.x + s.vy / s.omega, s.y - s.vx / s.omega);
        g.strokeStyle = `rgba(${rgb},.28)`; g.lineWidth = 1; g.setLineDash([5, 5]); g.beginPath(); g.arc(c[0], c[1], r0 * v.s, 0, 7); g.stroke(); g.setLineDash([]);
      }
      g.lineWidth = k === F.ptSel ? 2.6 : 1.8;
      const tl = s.trail, n = tl.length;
      for (let i = 1; i < n; i++) { const a = toS(tl[i - 1][0], tl[i - 1][1]), b = toS(tl[i][0], tl[i][1]); g.strokeStyle = `rgba(${rgb},${0.15 + 0.85 * (i / n)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    });
    F.pts.forEach((s, k) => {
      const p = toS(s.x, s.y), sp = Math.hypot(s.vx, s.vy);
      if (sp > 0) arrow(g, p[0], p[1], p[0] + (s.vx / sp) * 40, p[1] - (s.vy / sp) * 40, '#78e6aa', 2.2);
      g.fillStyle = s.col; g.beginPath(); g.arc(p[0], p[1], 7.5, 0, 7); g.fill();
      g.strokeStyle = k === F.ptSel ? '#ffc83d' : '#fff'; g.lineWidth = k === F.ptSel ? 3 : 1.5; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.q >= 0 ? '+' : '−', p[0], p[1] + 0.5);
      g.fillStyle = dark() ? '#e8eef5' : '#1c2733'; g.font = '11px "Segoe UI",sans-serif'; g.textBaseline = 'bottom'; g.fillText(`${k + 1} ${SYM[s.key] || '?'}`, p[0], p[1] - 11);
    });
    updateReadout([]);
    updateParticleInfo();
  }
  function hexRgb(hx) { return parseInt(hx.slice(1, 3), 16) + ',' + parseInt(hx.slice(3, 5), 16) + ',' + parseInt(hx.slice(5, 7), 16); }
  function buildPartList() {
    if (!ui.pList) return; ui.pList.innerHTML = '';
    F.pts.forEach((s, i) => {
      const row = h('div', { class: 'plrow' + (i === F.ptSel ? ' sel' : ''), style: { borderLeft: '4px solid ' + s.col, padding: '3px 6px', margin: '2px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i === F.ptSel ? 'rgba(255,200,61,.15)' : 'transparent' } },
        h('span', {}, `${i + 1}. ${s.name}`), h('button', { title: 'Remove', onclick: (e) => { e.stopPropagation(); removeParticle(i); } }, '✕'));
      row.addEventListener('click', () => selectParticle(i));
      ui.pList.appendChild(row);
    });
    if (ui.pEdit) ui.pEdit.style.display = F.pts.length ? '' : 'none';
  }
  function loadSelectedIntoFields() {
    const s = F.pts[F.ptSel]; if (!s) return;
    ui.pSel.value = s.key; ui.pq.value = fmtPlain(+(s.q / E_CH).toPrecision(6)); ui.pm.value = String(s.m);
    ui.pv.value = fmtPlain(s.v); ui.pa.value = String(s.ang); ui.px.value = fmtPlain(s.x0); ui.py.value = fmtPlain(s.y0);
    const custom = s.key === 'custom'; ui.pq.disabled = ui.pm.disabled = !custom;
  }
  function applyFields() {
    const s = F.pts[F.ptSel]; if (!s) return;
    const pr = P.PARTICLES[ui.pSel.value];
    if (pr) { s.key = ui.pSel.value; s.name = pr.name; s.q = pr.q; s.m = pr.m; }
    else { s.key = 'custom'; s.name = 'Custom'; s.q = parseSI(ui.pq.value) * E_CH; s.m = parseSI(ui.pm.value); }
    s.v = parseSI(ui.pv.value); s.ang = parseSI(ui.pa.value) || 0; s.x0 = parseSI(ui.px.value) || 0; s.y0 = parseSI(ui.py.value) || 0;
    buildPartList(); loadSelectedIntoFields(); resetParticles();
  }
  function addParticle(key) {
    if (F.pts.length >= 8) return;
    const ref = F.pts[F.ptSel]; F.pts.push(makePart(key, { v: ref ? ref.v : 1e6, ang: ref ? ref.ang : 90 }));
    F.ptSel = F.pts.length - 1; buildPartList(); loadSelectedIntoFields(); resetParticles();
  }
  function removeParticle(i) { F.pts.splice(i, 1); F.ptSel = Math.min(F.ptSel, F.pts.length - 1); buildPartList(); loadSelectedIntoFields(); resetParticles(); }

  // ================================================================ interaction
  function hit(sx, sy) {
    const it = items();
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i], s = toS(o.x, o.y);
      if (o.type === 'magnet' && !isPole(o)) { const a = (o.angle * Math.PI) / 180, dx = sx - s[0], dy = sy - s[1], lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); if (Math.abs(lx) < (o.len * V().s) / 2 + 4 && Math.abs(ly) < 14) return i; }
      else if (Math.hypot(sx - s[0], sy - s[1]) < 18) return i;
    }
    return -1;
  }
  function bind() {
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const p = pos(e);
      if (F.mode === 'particle') { const j = hitParticle(p[0], p[1]); if (j >= 0 && e.button === 0) { selectParticle(j); render(); return; } }
      const so = items()[F.sel];
      if (F.mode === 'magnetic' && e.button === 0 && so && so.type === 'magnet' && !isPole(so)) { const hp = handleScreen(so); if (Math.hypot(p[0] - hp[0], p[1] - hp[1]) < 11) { F.drag = { type: 'rot' }; render(); return; } }
      const i = F.mode === 'particle' ? -1 : hit(p[0], p[1]);
      if (i >= 0 && e.button === 0) { F.sel = i; const o = items()[i], w = toW(p[0], p[1]); F.drag = { type: 'item', dx: o.x - w[0], dy: o.y - w[1] }; updateSelPanel(true); }
      else { if (e.button === 0 && F.mode !== 'particle') { F.sel = -1; updateSelPanel(true); } F.drag = { type: 'pan', sx: p[0], sy: p[1], ox: V().ox, oy: V().oy }; }
      render();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!F.visible) return; const p = pos(e); const inside = p[0] >= 0 && p[1] >= 0 && p[0] <= W && p[1] <= H;
      F.mouse = inside || F.drag ? p : null;
      if (F.drag) {
        if (F.drag.type === 'rot') { const o = items()[F.sel], sc = toS(o.x, o.y); let a = Math.atan2(-(p[1] - sc[1]), p[0] - sc[0]) * 180 / Math.PI; if (e.shiftKey) a = Math.round(a / 15) * 15; o.angle = Math.round(a * 10) / 10; F.bgDirty = true; }
        else if (F.drag.type === 'pan') { V().ox = F.drag.ox + p[0] - F.drag.sx; V().oy = F.drag.oy + p[1] - F.drag.sy; F.bgDirty = true; }
        else { const w = toW(p[0], p[1]), o = items()[F.sel]; if (o) { o.x = w[0] + F.drag.dx; o.y = w[1] + F.drag.dy; F.bgDirty = true; } }
      }
      render();
    });
    cv.addEventListener('pointerup', () => { const was = F.drag && F.drag.type; F.drag = null; if (was === 'rot') updateSelPanel(true); });
    cv.addEventListener('pointercancel', () => { F.drag = null; render(); });
    cv.addEventListener('mouseleave', () => { if (!F.drag) { F.mouse = null; render(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); const p = pos(e), v = V(), w = toW(p[0], p[1]), f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.s = Math.min(1e9, Math.max(1e-3, v.s * f)); v.ox = p[0] - W / 2 - w[0] * v.s; v.oy = p[1] - H / 2 + w[1] * v.s; F.bgDirty = true; render();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!F.visible || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
      if ((e.key === 'r' || e.key === 'R') && F.mode === 'magnetic' && items()[F.sel] && items()[F.sel].type === 'magnet' && !isPole(items()[F.sel])) { const o = items()[F.sel]; o.angle = ((o.angle || 0) + 15) % 360; updateSelPanel(true); invalidate(); return; }
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
    if (o.type === 'magnet') {
      const ps = h('select', {}, [['both', 'Bar magnet (north + south)'], ['north', 'North pole only'], ['south', 'South pole only']].map(([v, t]) => h('option', { value: v }, t)));
      ps.value = isPole(o) ? o.pole : 'both'; ps.addEventListener('change', () => { o.pole = ps.value; updateSelPanel(true); invalidate(); });
      box.appendChild(h('label', { class: 'field' }, h('span', {}, 'Poles'), ps));
      box.appendChild(numField('Pole strength', fmtPlain(o.m), 'A·m', apply((v) => { o.m = v; })));
      if (!isPole(o)) {
        box.appendChild(numField('Length', fmtPlain(o.len * 100), 'cm', apply((v) => { o.len = Math.max(0.01, v / 100); })));
        box.appendChild(numField('Angle (or drag the yellow handle, press R for +15°)', fmtPlain(o.angle), '°', apply((v) => { o.angle = v; })));
      } else box.appendChild(h('div', { class: 'muted small' }, 'An isolated pole is an idealisation (like a point charge). Real magnets always come with both poles.'));
    }
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
      : kind === 'north' || kind === 'south' ? { type: 'magnet', pole: kind, m: 400, x: c[0] + j(), y: c[1] + j(), len: 0.15, angle: 0 }
      : { type: 'magnet', m: 400, x: c[0] + j(), y: c[1] + j(), len: 0.15, angle: 0 };
    void v; items().push(o); F.sel = items().length - 1; updateSelPanel(true); invalidate();
  }

  function setMode(m) {
    F.mode = m; F.sel = -1;
    ui.seg.forEach((b) => b.classList.toggle('active', b.dataset.m === m));
    ui.pElectric.hidden = m !== 'electric'; ui.pMagnetic.hidden = m !== 'magnetic'; ui.pParticle.hidden = m !== 'particle';
    ui.optsBox.hidden = m === 'particle'; ui.sum.hidden = m === 'particle'; F.sumKey = '';
    ui.heatLbl.textContent = m === 'electric' ? 'Potential colour map' : 'Field-strength colour map';
    ui.equipLbl.parentElement.hidden = m !== 'electric';
    ui.presetSel.innerHTML = '';
    ui.presetSel.appendChild(h('option', { value: '' }, 'Presets ▾'));
    Object.keys(PRESETS[m]).forEach((k) => ui.presetSel.appendChild(h('option', { value: k }, k)));
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
    ui.pMagnetic = h('div', { class: 'btnrow' }, h('button', { onclick: () => addItem('out') }, '＋ Wire ⊙ (out)'), h('button', { onclick: () => addItem('in') }, '＋ Wire ⊗ (in)'), h('button', { onclick: () => addItem('magnet') }, '＋ Bar magnet'), h('button', { onclick: () => addItem('north') }, '＋ N pole only'), h('button', { onclick: () => addItem('south') }, '＋ S pole only'));
    const opt = (key, text) => { const cb = h('input', { type: 'checkbox' }); cb.checked = F.opts[key]; cb.addEventListener('change', () => { F.opts[key] = cb.checked; invalidate(); }); const sp = h('span', {}, text); return h('label', { class: 'field inline' }, cb, sp); };
    const oLines = opt('lines', 'Field lines'), oEq = opt('equip', 'Equipotential lines'), oHeat = opt('heat', 'Colour map'), oVec = opt('vectors', 'Field arrows'), oF = opt('force', 'Force arrows on items'), oAnim = opt('anim', 'Moving field (animated)');
    ui.heatLbl = oHeat.querySelector('span'); ui.equipLbl = oEq.querySelector('span');
    ui.optsBox = h('div', {}, h('div', { class: 'sect' }, 'Show'), oAnim, oLines, oEq, oHeat, oVec, oF);
    ui.sel = h('div', {});
    ui.sum = h('div', {});

    // particle controls
    const tf = (key, label, val, unit, w) => { ui[key] = h('input', { type: 'text', value: val, spellcheck: 'false', size: w || 8 }); return h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'unitwrap' }, ui[key], h('em', {}, unit))); };
    ui.pSel = h('select', {}, [...Object.entries(P.PARTICLES).map(([k, v]) => h('option', { value: k }, v.name)), h('option', { value: 'custom' }, 'Custom…')]);
    ui.pScene = h('input', { type: 'checkbox' });
    ui.pReal = h('input', { type: 'checkbox' });
    ui.pSpeed = h('input', { type: 'range', min: '-2', max: '1', step: '0.1', value: '0' });
    ui.pList = h('div', {}); ui.pOver = h('div', { class: 'live' }); ui.pinfo = h('div', { class: 'live' });
    ui.pEdit = h('div', {},
      h('label', { class: 'field' }, h('span', {}, 'Type of the selected particle'), ui.pSel),
      h('div', { class: 'two' }, tf('pq', 'Charge (× e)', '1', '', 6), tf('pm', 'Mass', '1.67e-27', 'kg', 8)),
      h('div', { class: 'two' }, tf('pv', 'Speed', '1e6', 'm/s', 8), tf('pa', 'Direction', '90', '°', 6)),
      h('div', { class: 'two' }, tf('px', 'Start x', '0', 'm', 6), tf('py', 'Start y', '0', 'm', 6)));
    ui.pParticle = h('div', {},
      h('div', { class: 'sect' }, 'Add particles (they all share the same fields)'),
      h('div', { class: 'btnrow' },
        h('button', { onclick: () => addParticle('electron') }, '＋ Electron'), h('button', { onclick: () => addParticle('positron') }, '＋ Positron'),
        h('button', { onclick: () => addParticle('proton') }, '＋ Proton'), h('button', { onclick: () => addParticle('alpha') }, '＋ Alpha'), h('button', { onclick: () => addParticle('custom') }, '＋ Custom')),
      h('div', { class: 'muted small' }, 'Click a particle here or on the canvas to edit it.'),
      ui.pList, ui.pEdit,
      h('div', { class: 'sect' }, 'Uniform fields'),
      h('div', { class: 'two' }, tf('pEx', 'E x', '0', 'V/m', 6), tf('pEy', 'E y', '0', 'V/m', 6)),
      tf('pBz', 'B (+ = out of screen ⊙, − = into ⊗)', '1m', 'T', 8),
      h('label', { class: 'field inline' }, ui.pScene, h('span', {}, 'Also feel the charges from the Electric field scene')),
      h('label', { class: 'field inline' }, ui.pReal, h('span', {}, 'Real time: all particles share one clock')),
      h('label', { class: 'field' }, h('span', {}, 'Simulation speed'), ui.pSpeed),
      h('div', { class: 'btnrow' }, (ui.pRun = h('button', { class: 'primary', onclick: toggleParticle }, '▶ Start')), h('button', { onclick: () => resetParticles() }, '⟲ Reset')),
      h('div', { class: 'sect' }, 'All particles at a glance'), ui.pOver,
      h('div', { class: 'sect' }, 'Selected particle: its own properties'), ui.pinfo);
    ui.pParticle.hidden = true;
    ['pq', 'pm', 'pv', 'pa', 'px', 'py'].forEach((k) => ui[k].addEventListener('change', applyFields));
    ui.pSel.addEventListener('change', () => { const pr = P.PARTICLES[ui.pSel.value]; if (pr) { ui.pq.value = fmtPlain(pr.q / E_CH); ui.pm.value = String(pr.m); } applyFields(); });
    ['pEx', 'pEy', 'pBz'].forEach((k) => ui[k].addEventListener('change', () => resetParticles()));
    ui.pScene.addEventListener('change', () => resetParticles());
    ui.pReal.addEventListener('change', () => { F.real = ui.pReal.checked; updateParticleInfo(true); });
    F.pts = [makePart('proton')]; F.ptSel = 0; buildPartList(); loadSelectedIntoFields();

    ui.read = h('div', { class: 'fl-read', style: { display: 'none' } });
    const togglePanel = () => { el.classList.toggle('hide-side'); el.classList.toggle('fl-open'); setTimeout(resize, 30); };
    const side = h('div', { class: 'fl-side' },
      h('button', { class: 'grabber mobonly fl-grab', 'aria-label': 'Close panel', onclick: togglePanel }),
      h('button', { class: 'sheet-x mobonly fl-x', 'aria-label': 'Close', onclick: togglePanel }, '✕'),
      h('div', { class: 'seg wide' }, ui.seg), h('label', { class: 'field' }, h('span', {}, 'Presets'), ui.presetSel),
      ui.pElectric, ui.pMagnetic, ui.pParticle, ui.optsBox, ui.sel, ui.sum,
      h('div', { class: 'sect' }, 'Notes'),
      h('div', { class: 'muted small' }, 'Electric: E = kq/r², V = kq/r, superposition of every charge. Magnetic: B = μ₀I/(2πr) around each wire, poles for magnets. Hover over the canvas to read the field at any point; the little arrow shows its direction.'));
    cv = h('canvas', {}); bg = document.createElement('canvas'); bgG = bg.getContext('2d'); g = cv.getContext('2d');
    const main = h('div', { class: 'fl-main' },
      h('div', { class: 'fl-bar' },
        h('button', { title: 'Hide / show the side panel', onclick: togglePanel }, h('span', { class: 'deskonly' }, '◧ Panel'), h('span', { class: 'mobonly' }, '☰ Controls')), h('button', { onclick: () => zoom(1.25) }, '＋'), h('button', { onclick: () => zoom(0.8) }, '−'), h('button', { onclick: () => { const v = V(); v.ox = 0; v.oy = 0; F.bgDirty = true; render(); } }, 'Centre'),
        h('span', { class: 'muted small' }, 'Scroll to zoom · drag the background to pan · drag items to move them · Delete removes the selected item')),
      h('div', { class: 'fl-wrap' }, cv, ui.read));
    el.appendChild(side); el.appendChild(main);
    bind(); setMode('electric'); resetParticles(); resize();
    requestAnimationFrame(loop);
  }

  function zoom(f) { const v = V(); v.s = Math.min(1e9, Math.max(1e-3, v.s * f)); v.ox *= f; v.oy *= f; F.bgDirty = true; render(); }
  function toggleParticle() {
    if (!F.pts.length) return;
    F.running = !F.running; ui.pRun.textContent = F.running ? '❚❚ Pause' : '▶ Start';
  }
  function loadParticlePreset(p) {
    ui.pEx.value = fmtPlain(p.Ex); ui.pEy.value = fmtPlain(p.Ey); ui.pBz.value = fmtPlain(p.Bz); ui.pScene.checked = false;
    const list = p.list || [{ p: p.p, v: p.v, ang: p.ang }];
    F.pid = 0; F.pts = list.map((z) => makePart(z.p, { v: z.v, ang: z.ang })); F.ptSel = 0;
    F.running = false; ui.pRun.textContent = '▶ Start';
    buildPartList(); loadSelectedIntoFields(); resetParticles();
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (F.visible && F.mode !== 'particle' && F.opts.anim) { F.animT += dt; render(true); return; }   // moving field lines / arrows
    if (!F.visible || F.mode !== 'particle' || !F.pts.length || !F.running) return;
    stepParticles(dt); render();
  }

  Incog.FieldLab = {
    mount,
    onShow() { F.visible = true; resize(); if (!F.centered) { F.centered = true; } F.bgDirty = true; render(); },
    onHide() { F.visible = false; },
    redraw() { F.bgDirty = true; if (F.visible) render(); },
    state: F,
  };
})(typeof window !== 'undefined' ? window : globalThis);
/* ============================================================================
 * Incog Electric Lab - ui/plot.js
 * A small, dependency-free line plotter with axes, SI tick labels, log-x, legend
 * and a hover read-out.  Used by the Scope tab, Theorems tab and Field Lab.
 *
 *   Incog.plot.draw(canvas, { title, xlabel, ylabel, xlog, series:[{name,color,pts:[[x,y],..]}],
 *                             mark:{x,y,label}, xunit, yunit })
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { fmtSI } = Incog.util;

  const PALETTE = ['#4cc2ff', '#ff7a90', '#7be495', '#ffc857', '#c792ea', '#ff9f68'];

  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  function colors() {
    const dark = !document.body.classList.contains('theme-light');
    return dark
      ? { bg: '#111821', grid: '#232f3d', axis: '#6d8197', text: '#a9bdd2', tip: '#1b2531', tipText: '#e8eef5' }
      : { bg: '#ffffff', grid: '#e1e7ee', axis: '#7b8a99', text: '#4a5d70', tip: '#ffffff', tipText: '#1c2733' };
  }

  function draw(cv, spec) {
    cv._spec = spec;
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(120, r.width), H = Math.max(100, r.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const C = colors();
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const series = (spec.series || []).filter((s) => s.pts && s.pts.length);
    const m = { l: 62, r: 14, t: spec.title ? 26 : 12, b: 38 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    if (spec.title) { g.fillStyle = C.text; g.font = '600 12px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(spec.title, m.l, 12); }
    if (!series.length) {
      g.fillStyle = C.text; g.font = '12px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(spec.empty || 'No data yet', W / 2, H / 2); cv._map = null; return;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (const [x, y] of s.pts) { if (!isFinite(x) || !isFinite(y)) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (spec.xmin !== undefined) x0 = spec.xmin; if (spec.xmax !== undefined) x1 = spec.xmax;
    if (spec.mark) { y1 = Math.max(y1, spec.mark.y); y0 = Math.min(y0, spec.mark.y); }
    if (x1 - x0 < 1e-30) { x1 = x0 + 1; }
    if (y1 - y0 < 1e-30) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
    const pad = (y1 - y0) * 0.08; y1 += pad; if (!(spec.ymin0 && y0 >= 0)) y0 -= pad; else y0 = 0;
    const xlog = !!spec.xlog && x0 > 0;
    const fx = xlog ? (x) => (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (x) => (x - x0) / (x1 - x0);
    const px = (x) => m.l + fx(x) * pw, py = (y) => m.t + (1 - (y - y0) / (y1 - y0)) * ph;
    g.font = '10.5px "Cascadia Mono",Consolas,monospace'; g.lineWidth = 1;
    // y grid
    const ys = niceStep(y1 - y0, Math.max(3, ph / 44));
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = Math.ceil(y0 / ys) * ys; y <= y1; y += ys) {
      g.strokeStyle = Math.abs(y) < ys * 1e-6 ? C.axis : C.grid; g.beginPath(); g.moveTo(m.l, py(y)); g.lineTo(m.l + pw, py(y)); g.stroke();
      g.fillStyle = C.text; g.fillText(fmtSI(Math.abs(y) < ys * 1e-6 ? 0 : y, '', 3), m.l - 6, py(y));
    }
    // x grid
    g.textAlign = 'center'; g.textBaseline = 'top';
    if (xlog) {
      for (let e = Math.floor(Math.log10(x0)); e <= Math.ceil(Math.log10(x1)); e++) for (const k of [1, 2, 5]) {
        const x = k * Math.pow(10, e); if (x < x0 || x > x1) continue;
        g.strokeStyle = C.grid; g.beginPath(); g.moveTo(px(x), m.t); g.lineTo(px(x), m.t + ph); g.stroke();
        if (k === 1 || ph > 0) { g.fillStyle = C.text; if (k !== 5) g.fillText(fmtSI(x, '', 2), px(x), m.t + ph + 5); }
      }
    } else {
      const xs = niceStep(x1 - x0, Math.max(3, pw / 80));
      for (let x = Math.ceil(x0 / xs) * xs; x <= x1 + xs * 1e-9; x += xs) {
        g.strokeStyle = C.grid; g.beginPath(); g.moveTo(px(x), m.t); g.lineTo(px(x), m.t + ph); g.stroke();
        g.fillStyle = C.text; g.fillText(fmtSI(Math.abs(x) < xs * 1e-6 ? 0 : x, '', 3), px(x), m.t + ph + 5);
      }
    }
    g.strokeStyle = C.axis; g.strokeRect(m.l, m.t, pw, ph);
    g.fillStyle = C.text; g.font = '11px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    if (spec.xlabel) g.fillText(spec.xlabel, m.l + pw / 2, H - 3);
    if (spec.ylabel) { g.save(); g.translate(12, m.t + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'top'; g.fillText(spec.ylabel, 0, -4); g.restore(); }
    // lines
    g.save(); g.beginPath(); g.rect(m.l, m.t, pw, ph); g.clip();
    series.forEach((s, i) => {
      g.strokeStyle = s.color || PALETTE[i % PALETTE.length]; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
      let pen = false;
      for (const [x, y] of s.pts) { if (!isFinite(x) || !isFinite(y)) { pen = false; continue; } const X = px(x), Y = py(y); if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y); }
      g.stroke();
    });
    g.restore();
    if (spec.mark) {
      g.fillStyle = '#ffc83d'; g.beginPath(); g.arc(px(spec.mark.x), py(spec.mark.y), 4.5, 0, 7); g.fill();
      g.font = '600 11px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = C.text;
      g.fillText((spec.mark.label || '') + ' (' + fmtSI(spec.mark.x, '', 3) + ', ' + fmtSI(spec.mark.y, '', 3) + ')', Math.min(px(spec.mark.x) + 8, W - 150), py(spec.mark.y) - 6);
    }
    // legend
    if (series.some((s) => s.name)) {
      g.font = '600 11px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      let lx = m.l + 8;
      series.forEach((s, i) => {
        if (!s.name) return; g.fillStyle = s.color || PALETTE[i % PALETTE.length]; g.fillRect(lx, m.t + 8, 12, 3);
        g.fillStyle = C.text; g.fillText(s.name, lx + 17, m.t + 10); lx += g.measureText(s.name).width + 34;
      });
    }
    cv._map = { m, pw, ph, x0, x1, y0, y1, xlog, px, py, series };
    if (cv._hover != null) hoverDraw(cv, g, W, H, C);
  }

  function hoverDraw(cv, g, W, H, C) {
    const mp = cv._map; if (!mp) return;
    const { m, pw, ph } = mp;
    const hx = cv._hover; if (hx < m.l || hx > m.l + pw) return;
    const frac = (hx - m.l) / pw;
    const xv = mp.xlog ? Math.pow(10, Math.log10(mp.x0) + frac * (Math.log10(mp.x1) - Math.log10(mp.x0))) : mp.x0 + frac * (mp.x1 - mp.x0);
    g.strokeStyle = C.axis; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(hx, m.t); g.lineTo(hx, m.t + ph); g.stroke(); g.setLineDash([]);
    const rows = [];
    mp.series.forEach((s, i) => {
      let best = null, bd = Infinity;
      for (const p of s.pts) { const d = Math.abs(p[0] - xv); if (d < bd) { bd = d; best = p; } }
      if (best) { rows.push({ c: s.color || PALETTE[i % PALETTE.length], t: (s.name ? s.name + ' = ' : '') + fmtSI(best[1], '', 4), x: best[0], y: best[1] }); g.fillStyle = rows[rows.length - 1].c; g.beginPath(); g.arc(mp.px(best[0]), mp.py(best[1]), 3.5, 0, 7); g.fill(); }
    });
    if (!rows.length) return;
    g.font = '600 11px "Cascadia Mono",Consolas,monospace';
    const head = (cv._spec.xlabel ? cv._spec.xlabel.split(' ')[0] : 'x') + ' = ' + fmtSI(rows[0].x, '', 4);
    const lines = [head, ...rows.map((r) => r.t)];
    const w = Math.max(...lines.map((s) => g.measureText(s).width)) + 14, h = lines.length * 15 + 6;
    let bx = hx + 12; if (bx + w > W - 4) bx = hx - w - 12;
    g.fillStyle = C.tip; g.strokeStyle = C.axis; g.fillRect(bx, m.t + 4, w, h); g.strokeRect(bx, m.t + 4, w, h);
    g.textAlign = 'left'; g.textBaseline = 'middle';
    lines.forEach((s, i) => { g.fillStyle = i === 0 ? C.text : rows[i - 1].c; g.fillText(s, bx + 7, m.t + 15 + i * 15); });
  }

  function attachHover(cv) {
    if (cv._hoverBound) return; cv._hoverBound = true;
    cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); cv._hover = e.clientX - r.left; if (cv._spec) draw(cv, cv._spec); });
    cv.addEventListener('mouseleave', () => { cv._hover = null; if (cv._spec) draw(cv, cv._spec); });
  }

  Incog.plot = { draw, attachHover, PALETTE };
})(typeof window !== 'undefined' ? window : globalThis);

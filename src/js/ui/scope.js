/* ============================================================================
 * Incog Electric Lab - ui/scope.js   (tab: Scope)
 *   Transient : live oscilloscope fed by the running simulation
 *   AC sweep  : frequency response (magnitude in dB + phase)  - Bode plot
 *   DC sweep  : any answer vs the value of a DC source
 * Signals are the same expressions the Answers tab understands: V(A), I(R1), V(A)-V(B) ...
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = root.Incog;
  const { h } = Incog;
  const { fmtSI, parseSI, fmtPlain } = Incog.util;
  const { Cx } = Incog;

  let sub = 'tran';
  let pane, body, app0;
  const S = { sig: '', fmin: '1', fmax: '100k', ppd: 30, dbMode: true, src: '', from: '0', to: '10', pts: 60, sweepOut: null, dcOut: null };

  function autoSignals(app) {
    const nl = app.live && app.live.nl; if (!nl) return [];
    const out = [];
    for (const p of app.circuit.probes) {
      if (p.kind === 'node') { const ni = p.wire ? nl.wireNode.get(p.wire) : nl.nodeAt(p.x, p.y); if (ni > 0) out.push(`V(${nl.nodes[ni].name})`); }
      else { const e = nl.element(p.comp); if (e) out.push(e.def.isSource || e.comp.type === 'R' || e.comp.type === 'L' ? `I(${e.comp.label})` : `V(${e.comp.label})`); }
    }
    if (!out.length) {
      for (const e of nl.elements) if (e.comp.type === 'C') { out.push(`V(${e.comp.label})`); break; }
      if (!out.length) for (const n of nl.nodes) if (!n.isGround) { out.push(`V(${n.name})`); if (out.length >= 2) break; }
    }
    return [...new Set(out)];
  }
  const signalList = (app) => (S.sig.trim() ? S.sig.split(',').map((s) => s.trim()).filter(Boolean) : autoSignals(app));

  // ------------------------------------------------------------------ transient
  function drawTran(app) {
    const cv = body.querySelector('canvas.scope'); if (!cv) return;
    const hist = app.hist;
    const pts = hist && hist.t.length ? hist.names.map((n, k) => ({ name: n, pts: hist.t.map((t, i) => [t, hist.vals[k][i]]) })) : [];
    Incog.plot.draw(cv, { xlabel: 't (s)', series: pts, empty: app.mode !== 'tran' ? 'Switch the analysis to Transient and press Run' : 'Press ▶ Run to start the simulation' });
    const info = body.querySelector('.scopeinfo');
    if (info) info.textContent = app.sim ? `t = ${fmtSI(app.sim.t, 's')}   ·   step ${fmtSI(app.sim.dt, 's')}   ·   ${app.sim.steps} steps` : '';
  }

  function tranView(app) {
    const inp = h('input', { type: 'text', value: S.sig, placeholder: 'auto (probes). Or e.g.  V(C1), I(R1)', spellcheck: 'false' });
    inp.addEventListener('change', () => { S.sig = inp.value; app.resetHistory(); drawTran(app); });
    body.appendChild(h('label', { class: 'field' }, h('span', {}, 'Signals to plot (comma separated)'), inp));
    const cv = h('canvas', { class: 'plotcv scope tall' }); Incog.plot.attachHover(cv);
    body.appendChild(cv);
    body.appendChild(h('div', { class: 'muted small scopeinfo' }));
    body.appendChild(h('div', { class: 'muted small' }, app.mode === 'tran' ? 'Press ▶ Run in the bar above the canvas. Stamp probes with the Probe tool to choose signals by clicking.' : 'The scope needs Transient analysis. Switch the Analysis selector above the canvas to Transient.'));
    requestAnimationFrame(() => drawTran(app));
  }

  // ---------------------------------------------------------------- AC sweep
  function doAcSweep(app) {
    S.sweepOut = null;
    try {
      const nl = Incog.buildNetlist(app.circuit);
      const f0 = parseSI(S.fmin), f1 = parseSI(S.fmax);
      if (!(f0 > 0) || !(f1 > f0)) throw new Error('Start must be above 0 and the stop frequency larger than the start.');
      const sigs = signalList(app); if (!sigs.length) throw new Error('Type a signal such as V(C1).');
      const dec = Math.log10(f1 / f0), n = Math.min(2000, Math.max(10, Math.round(dec * S.ppd)));
      const mags = sigs.map(() => []), phs = sigs.map(() => []);
      for (let i = 0; i <= n; i++) {
        const f = f0 * Math.pow(f1 / f0, i / n);
        const sol = Incog.solve(nl, { mode: 'ac', freq: f, sweep: true });
        sigs.forEach((s, k) => {
          const z = Incog.analysis.evaluate(s, nl, sol), m = Cx.abs(z);
          mags[k].push([f, S.dbMode ? 20 * Math.log10(Math.max(m, 1e-18)) : m]);
          phs[k].push([f, (Cx.arg(z) * 180) / Math.PI]);
        });
      }
      S.sweepOut = { sigs, mags, phs };
    } catch (err) { S.sweepOut = { error: err.message }; }
    render(app);
  }

  function acView(app) {
    const f = (key, label, w) => { const i = h('input', { type: 'text', value: S[key], size: w || 7, spellcheck: 'false' }); i.addEventListener('change', () => { S[key] = i.value; }); return h('label', { class: 'field' }, h('span', {}, label), i); };
    const sig = h('input', { type: 'text', value: S.sig, placeholder: 'auto (probes) or e.g. V(C1)', spellcheck: 'false' });
    sig.addEventListener('change', () => { S.sig = sig.value; });
    body.appendChild(h('label', { class: 'field' }, h('span', {}, 'Signal(s)'), sig));
    body.appendChild(h('div', { class: 'two' }, f('fmin', 'Start (Hz)'), f('fmax', 'Stop (Hz)')));
    const db = h('input', { type: 'checkbox' }); db.checked = S.dbMode; db.addEventListener('change', () => { S.dbMode = db.checked; });
    body.appendChild(h('label', { class: 'field inline' }, db, h('span', {}, 'Magnitude in dB')));
    body.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'primary', onclick: () => doAcSweep(app) }, '▶ Run AC sweep')));
    body.appendChild(h('div', { class: 'muted small' }, 'Every AC source in the circuit acts at the swept frequency (amplitude and phase as set). To see a transfer function, set the source amplitude to 1.'));
    const o = S.sweepOut; if (!o) return;
    if (o.error) { body.appendChild(h('div', { class: 'err' }, '✖ ' + o.error)); return; }
    const c1 = h('canvas', { class: 'plotcv' }), c2 = h('canvas', { class: 'plotcv' });
    Incog.plot.attachHover(c1); Incog.plot.attachHover(c2);
    body.appendChild(h('div', { class: 'sect' }, S.dbMode ? 'Magnitude (dB)' : 'Magnitude')); body.appendChild(c1);
    body.appendChild(h('div', { class: 'sect' }, 'Phase (degrees)')); body.appendChild(c2);
    // peak / -3 dB info for the first signal
    const m0 = o.mags[0], lin = m0.map(([f, v]) => [f, S.dbMode ? Math.pow(10, v / 20) : v]);
    let pk = lin[0]; for (const p of lin) if (p[1] > pk[1]) pk = p;
    const info = [`Peak of ${o.sigs[0]}: ${fmtSI(pk[1], '')} at ${fmtSI(pk[0], 'Hz')}`];
    const lvl = pk[1] / Math.SQRT2, cross = [];
    for (let i = 1; i < lin.length; i++) if ((lin[i - 1][1] - lvl) * (lin[i][1] - lvl) < 0) { const t = (lvl - lin[i - 1][1]) / (lin[i][1] - lin[i - 1][1]); cross.push(lin[i - 1][0] * Math.pow(lin[i][0] / lin[i - 1][0], t)); }
    if (cross.length) info.push('−3 dB (half-power) points: ' + cross.map((x) => fmtSI(x, 'Hz')).join(' and ') + (cross.length === 2 ? `   ·   bandwidth ${fmtSI(cross[1] - cross[0], 'Hz')}   ·   Q ≈ ${(pk[0] / (cross[1] - cross[0])).toFixed(2)}` : ''));
    body.appendChild(h('div', { class: 'info' }, info.map((t) => h('div', {}, t))));
    requestAnimationFrame(() => {
      Incog.plot.draw(c1, { xlog: true, xlabel: 'Frequency (Hz)', series: o.sigs.map((s, k) => ({ name: s, pts: o.mags[k] })), mark: { x: pk[0], y: S.dbMode ? 20 * Math.log10(pk[1]) : pk[1], label: 'peak' } });
      Incog.plot.draw(c2, { xlog: true, xlabel: 'Frequency (Hz)', series: o.sigs.map((s, k) => ({ name: s, pts: o.phs[k] })) });
    });
  }

  // ---------------------------------------------------------------- DC sweep
  function doDcSweep(app) {
    S.dcOut = null;
    try {
      const nl = Incog.buildNetlist(app.circuit);
      const src = nl.element(Number(S.src)); if (!src || !(src.comp.type === 'Vdc' || src.comp.type === 'Idc')) throw new Error('Choose a DC source to sweep.');
      const a = parseSI(S.from), b = parseSI(S.to); if (Number.isNaN(a) || Number.isNaN(b) || a === b) throw new Error('Enter a different start and stop value.');
      const sigs = signalList(app); if (!sigs.length) throw new Error('Type a signal such as I(R1).');
      const n = Math.min(1000, Math.max(5, Number(S.pts) || 60)), series = sigs.map(() => []);
      for (let i = 0; i <= n; i++) {
        const x = a + ((b - a) * i) / n;
        const els = nl.elements.map((e) => (e === src ? { ...e, p: { ...e.p, value: x } } : e));
        const sol = Incog.solve({ ...nl, elements: els }, { mode: 'dc' });
        sigs.forEach((s, k) => series[k].push([x, Incog.analysis.evaluate(s, { ...nl, elements: els, element: (id) => els.find((e) => e.comp.id === id), elementByLabel: (l) => els.find((e) => e.comp.label.toLowerCase() === String(l).toLowerCase()) }, sol).re]));
      }
      S.dcOut = { sigs, series, label: src.comp.label };
    } catch (err) { S.dcOut = { error: err.message }; }
    render(app);
  }
  function dcView(app) {
    const nl = app.live && app.live.nl;
    const srcs = nl ? nl.elements.filter((e) => e.comp.type === 'Vdc' || e.comp.type === 'Idc') : [];
    if (!srcs.some((e) => String(e.comp.id) === String(S.src))) S.src = srcs.length ? String(srcs[0].comp.id) : '';
    const sel = h('select', {}, srcs.map((e) => h('option', { value: String(e.comp.id) }, e.comp.label))); sel.value = S.src; sel.addEventListener('change', () => { S.src = sel.value; });
    body.appendChild(h('label', { class: 'field' }, h('span', {}, 'Source to sweep'), sel));
    const f = (key, label) => { const i = h('input', { type: 'text', value: S[key], size: 6 }); i.addEventListener('change', () => { S[key] = i.value; }); return h('label', { class: 'field' }, h('span', {}, label), i); };
    body.appendChild(h('div', { class: 'two' }, f('from', 'From'), f('to', 'To')));
    const sig = h('input', { type: 'text', value: S.sig, placeholder: 'auto (probes) or e.g. I(R1)', spellcheck: 'false' }); sig.addEventListener('change', () => { S.sig = sig.value; });
    body.appendChild(h('label', { class: 'field' }, h('span', {}, 'Signal(s)'), sig));
    body.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'primary', onclick: () => doDcSweep(app) }, '▶ Run DC sweep')));
    const o = S.dcOut; if (!o) return;
    if (o.error) { body.appendChild(h('div', { class: 'err' }, '✖ ' + o.error)); return; }
    const cv = h('canvas', { class: 'plotcv tall' }); Incog.plot.attachHover(cv); body.appendChild(cv);
    requestAnimationFrame(() => Incog.plot.draw(cv, { xlabel: o.label + ' value', series: o.sigs.map((s, k) => ({ name: s, pts: o.series[k] })) }));
  }

  // ------------------------------------------------------------------- shell
  function render(app) {
    body.innerHTML = '';
    const seg = h('div', { class: 'seg wide' }, [['tran', 'Transient'], ['ac', 'AC sweep'], ['dc', 'DC sweep']].map(([id, t]) => h('button', { class: sub === id ? 'active' : '', onclick: () => { sub = id; render(app); } }, t)));
    body.appendChild(seg);
    if (sub === 'tran') tranView(app); else if (sub === 'ac') acView(app); else dcView(app);
  }

  Incog.tabs.register({
    id: 'scope', title: 'Scope', live: true,
    mount(rootEl, app) { app0 = app; pane = h('div', { class: 'pad' }); body = h('div', {}); pane.appendChild(body); rootEl.appendChild(pane); },
    refresh(app, reason) {
      if (reason === 'live') { if (sub === 'tran') drawTran(app); return; }
      if (reason === 'change' && document.activeElement && body.contains(document.activeElement)) return;
      if (reason === 'mode' && app.mode === 'tran') sub = 'tran';
      render(app);
    },
    signals: (app) => signalList(app),
    show(app, which) { sub = which; render(app); },
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* ============================================================================
 * Incog Electric Lab - ui/theorems-ui.js   (tab: Theorems)
 * Pick a theorem, pick the load / source / nodes it needs, press Solve.
 * The report is rendered from the plain-data blocks produced by core/theorems.js.
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = root.Incog;
  const { h } = Incog;
  const { fmtSI, fmtValue, fmtComplex } = Incog.util;
  const { Cx } = Incog;

  const USES_PORT = ['thevenin', 'norton', 'maxpower'];
  let st = { id: 'thevenin', loadId: '', nodeA: '', nodeB: '0', sourceId: '', byNodes: false, report: null, error: null };
  let pane, ctrl, out, appRef;

  function twoTerm(nl) { return nl.elements.filter((e) => e.nodes.length === 2 && !e.def.isGround); }

  function select(options, value, onchange) {
    const s = h('select', {}, options.map(([v, t]) => h('option', { value: v }, t)));
    s.value = value; s.addEventListener('change', () => onchange(s.value)); return s;
  }

  function buildControls(app) {
    ctrl.innerHTML = '';
    const nl = app.live && app.live.nl;
    const thm = Incog.theorems.get(st.id);
    const tsel = select(Incog.theorems.list.map((t) => [t.id, t.name]), st.id, (v) => { st.id = v; st.report = null; st.error = null; buildControls(app); renderReport(); });
    ctrl.appendChild(h('label', { class: 'field' }, h('span', {}, 'Theorem'), tsel));
    ctrl.appendChild(h('div', { class: 'statement' }, thm.statement));
    if (!nl) return;
    const parts = twoTerm(nl);
    const needsLoad = ['thevenin', 'norton', 'maxpower', 'substitution', 'reciprocity'].includes(st.id);
    if (needsLoad) {
      const opts = [['', '— choose —'], ...parts.filter((e) => st.id !== 'reciprocity' || !e.def.isSource).map((e) => [String(e.comp.id), e.comp.label + '  (' + e.def.name + ')'])];
      if (!opts.some((o) => o[0] === String(st.loadId))) st.loadId = '';
      const lbl = st.id === 'substitution' ? 'Branch to replace' : st.id === 'reciprocity' ? 'Response branch' : 'Load (removed from the circuit)';
      ctrl.appendChild(h('label', { class: 'field' }, h('span', {}, lbl), select(opts, String(st.loadId), (v) => { st.loadId = v; })));
    }
    if (st.id === 'reciprocity') {
      const srcs = nl.elements.filter((e) => e.comp.type === 'Vdc' || e.comp.type === 'Vac');
      if (!srcs.some((e) => String(e.comp.id) === String(st.sourceId))) st.sourceId = srcs.length ? String(srcs[0].comp.id) : '';
      ctrl.appendChild(h('label', { class: 'field' }, h('span', {}, 'Source'), select(srcs.map((e) => [String(e.comp.id), e.comp.label]), String(st.sourceId), (v) => { st.sourceId = v; })));
    }
    if (USES_PORT.includes(st.id)) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = st.byNodes;
      cb.addEventListener('change', () => { st.byNodes = cb.checked; buildControls(app); });
      ctrl.appendChild(h('label', { class: 'field inline' }, cb, h('span', {}, 'Use two nodes as the port instead of a load part')));
      if (st.byNodes) {
        const names = nl.nodes.map((n) => [n.name, n.isGround ? '0 (ground)' : n.name]);
        if (!names.some((n) => n[0] === st.nodeA) || st.nodeA === '0') st.nodeA = (names.find((n) => n[0] !== '0') || ['', ''])[0];
        ctrl.appendChild(h('div', { class: 'two' },
          h('label', { class: 'field' }, h('span', {}, 'Port +'), select(names, st.nodeA, (v) => { st.nodeA = v; })),
          h('label', { class: 'field' }, h('span', {}, 'Port −'), select(names, st.nodeB, (v) => { st.nodeB = v; }))));
      }
    }
    ctrl.appendChild(h('div', { class: 'muted small' }, thm.needs + (app.mode === 'tran' ? ' (Transient mode: the DC operating point is used.)' : '')));
    ctrl.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'primary', onclick: () => solve(app) }, '▶ Solve ' + thm.name)));
  }

  function solve(app, silent) {
    out.innerHTML = '';
    try {
      const nl = Incog.buildNetlist(app.circuit);
      if (!nl.elements.length) throw new Error('The circuit is empty.');
      const mode = app.mode === 'ac' ? 'ac' : 'dc';
      const opts = { mode, freq: app.freq, loadId: st.loadId, nodeA: st.byNodes ? st.nodeA : undefined, nodeB: st.nodeB, sourceId: st.sourceId };
      if (st.byNodes) opts.loadId = '';
      st.report = Incog.theorems.get(st.id).run(nl, opts); st.error = null;
    } catch (err) { st.report = null; st.error = err.message; }
    renderReport();
  }

  function table(b) {
    const t = h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, b.cols.map((c) => h('th', {}, c)))),
      h('tbody', {}, b.rows.map((r) => h('tr', {}, r.map((c, i) => h('td', { class: (i === r.length - 1 && (c === '✓' || c === '✗')) ? (c === '✓' ? 'okc' : 'badc') : (i === 0 ? 'first' : 'mono') }, String(c)))))));
    return h('div', {}, b.title ? h('div', { class: 'sect' }, b.title) : null, h('div', { class: 'tscroll' }, t));
  }

  function equivSvg(b) {
    const ac = b.ac, nort = b.mode === 'norton';
    const zt = isFinite(b.Zth.re) ? (ac ? fmtComplex(b.Zth, 'Ω', { form: 'rect' }) : fmtSI(b.Zth.re, 'Ω')) : '∞';
    const main = nort ? (b.Isc ? fmtValue(b.Isc, 'A', ac) : '—') : fmtValue(b.Vth, 'V', ac);
    const s = (cls, a) => `<text class="${cls}" ${a}`;
    const svg = nort
      ? `<svg viewBox="0 0 260 130" class="equiv"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="50" cy="65" r="22"/><path d="M50 78 V52 M44 58 L50 51 L56 58"/><path d="M50 43 V22 H120 V43 M50 87 V108 H120 V87"/><rect x="104" y="43" width="32" height="44" /><path d="M120 22 H200 M120 108 H200"/></g><circle cx="200" cy="22" r="4" fill="currentColor"/><circle cx="200" cy="108" r="4" fill="currentColor"/><text x="86" y="70" text-anchor="end" fill="currentColor" font-size="11" font-weight="700">${main}</text><text x="148" y="70" fill="currentColor" font-size="11" font-weight="700">${zt}</text><text x="208" y="26" fill="currentColor" font-size="11">a</text><text x="208" y="112" fill="currentColor" font-size="11">b</text><text x="130" y="12" fill="currentColor" font-size="10" text-anchor="middle">Norton equivalent</text></svg>`
      : `<svg viewBox="0 0 260 130" class="equiv"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="40" cy="65" r="22"/><path d="M40 22 V43 M40 87 V108"/><path d="M40 22 H80 M40 108 H200"/><rect x="80" y="12" width="56" height="20"/><path d="M136 22 H200"/></g><text x="40" y="62" text-anchor="middle" fill="currentColor" font-size="14" font-weight="700">+</text><text x="40" y="78" text-anchor="middle" fill="currentColor" font-size="14" font-weight="700">−</text><circle cx="200" cy="22" r="4" fill="currentColor"/><circle cx="200" cy="108" r="4" fill="currentColor"/><text x="68" y="70" text-anchor="end" fill="currentColor" font-size="11" font-weight="700">${main}</text><text x="108" y="52" text-anchor="middle" fill="currentColor" font-size="11" font-weight="700">${zt}</text><text x="208" y="26" fill="currentColor" font-size="11">a</text><text x="208" y="112" fill="currentColor" font-size="11">b</text><text x="130" y="124" fill="currentColor" font-size="10" text-anchor="middle">Thevenin equivalent</text></svg>`;
    return h('div', { class: 'equivwrap', html: svg });
  }

  function renderReport() {
    out.innerHTML = '';
    if (st.error) { out.appendChild(h('div', { class: 'err' }, '✖ ' + st.error)); return; }
    const r = st.report; if (!r) return;
    for (const b of r.blocks) {
      if (b.type === 'text') out.appendChild(h('p', { class: 'rtext' }, b.text));
      else if (b.type === 'steps') out.appendChild(h('div', {}, h('div', { class: 'sect' }, b.title || 'Steps'), h('ol', { class: 'rsteps' }, b.items.map((i) => h('li', {}, i)))));
      else if (b.type === 'table') out.appendChild(table(b));
      else if (b.type === 'kv') out.appendChild(h('div', {}, h('div', { class: 'sect' }, b.title), b.rows.map((rw) => h('div', { class: 'kvrow' }, h('span', { class: 'k' }, rw[0]), h('span', { class: 'v mono' }, rw[1])))));
      else if (b.type === 'verdict') out.appendChild(h('div', { class: 'verdict ' + (b.ok ? 'ok' : 'bad') }, (b.ok ? '✓ ' : '✗ ') + b.text));
      else if (b.type === 'equiv') out.appendChild(equivSvg(b));
      else if (b.type === 'plot') {
        const cv = h('canvas', { class: 'plotcv' });
        out.appendChild(h('div', { class: 'sect' }, b.title)); out.appendChild(cv);
        requestAnimationFrame(() => { Incog.plot.attachHover(cv); Incog.plot.draw(cv, { xlabel: b.xlabel, ylabel: b.ylabel, series: [{ name: 'P', pts: b.points }], mark: b.mark, ymin0: true }); });
      }
    }
  }

  Incog.tabs.register({
    id: 'theorems', title: 'Theorems',
    mount(rootEl, app) {
      appRef = app; pane = h('div', { class: 'pad' }); ctrl = h('div', {}); out = h('div', { class: 'report' });
      pane.appendChild(ctrl); pane.appendChild(out); rootEl.appendChild(pane);
    },
    refresh(app, reason) {
      if (reason === 'show' || reason === 'mode' || !ctrl.children.length) buildControls(app);
      else if (reason === 'change') {
        const a = document.activeElement; if (!(a && ctrl.contains(a))) buildControls(app);
        if (st.report || st.error) solve(app, true); // keep the answer live as the circuit changes
      }
    },
    /** called by the app so examples can jump straight to a theorem */
    open(app, id, loadLabel) {
      st.id = id; st.report = null; st.error = null;
      const nl = app.live && app.live.nl; const e = nl && loadLabel ? nl.elementByLabel(loadLabel) : null;
      st.loadId = e ? String(e.comp.id) : '';
      buildControls(app); renderReport();
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);

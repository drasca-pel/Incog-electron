/* ============================================================================
 * Incog Electric Lab - ui/answers.js   (tab: Answers)
 * Searchable list of every voltage / current / power in the circuit, a
 * formula box (V(A)-V(B), I(R1)+I(R2) ...), and the working behind the numbers.
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = root.Incog;
  const { h } = Incog;
  const { fmtSI, fmtValue, fmtComplex } = Incog.util;
  const { Cx } = Incog;

  let listEl, resultEl, workEl, input, lastRows = [];
  const KIND_WORDS = { V: 'voltage volts potential', I: 'current amps amperes', P: 'power watts', Q: 'reactive vars' };

  function valueText(app, q, sol) {
    const z = q.eval(sol);
    const ac = app.live.mode === 'ac' && (q.kind === 'V' || q.kind === 'I');
    return ac ? fmtComplex(z, q.unit, { rms: app.rms }) : fmtSI(z.re, q.unit);
  }

  function render(app) {
    if (!listEl) return;
    const live = app.live;
    listEl.innerHTML = ''; resultEl.innerHTML = '';
    if (!live || !live.sol) {
      listEl.appendChild(h('div', { class: app.error ? 'err' : 'muted' }, app.error ? '✖ ' + app.error : 'Build a circuit with at least one source and a ground. The answers appear here automatically.'));
      workEl.innerHTML = ''; return;
    }
    const nl = live.nl, sol = live.sol;
    const text = input.value.trim();
    const order = ['Node voltages', 'Component voltages', 'Component currents', 'Power'];
    const qs = Incog.analysis.listQuantities(nl, live.mode).map((q, i) => [q, i]).sort((a, b) => order.indexOf(a[0].group) - order.indexOf(b[0].group) || a[1] - b[1]).map((x) => x[0]);

    // formula?
    if (text && Incog.analysis.looksLikeExpression(text)) {
      try {
        const z = Incog.analysis.evaluate(text, nl, sol);
        const ac = live.mode === 'ac';
        resultEl.appendChild(h('div', { class: 'resultcard' },
          h('div', { class: 'k' }, text), h('div', { class: 'big mono' }, ac ? fmtComplex(z, '', { rms: app.rms }) : fmtSI(z.re, '')),
          ac ? h('div', { class: 'muted small mono' }, fmtComplex(z, '', { form: 'rect', rms: app.rms })) : null,
          h('div', { class: 'muted small' }, 'Units follow your formula: V(..) in volts, I(..) in amps, P(..) in watts.')));
      } catch (err) { resultEl.appendChild(h('div', { class: 'err small' }, '✖ ' + err.message)); }
    }

    const toks = text.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = qs.filter((q) => {
      if (!toks.length || Incog.analysis.looksLikeExpression(text)) return true;
      const hay = (q.key + ' ' + q.desc + ' ' + q.group + ' ' + KIND_WORDS[q.kind]).toLowerCase();
      // a single letter v / i / p / q means "that kind of answer" (so "i R1" = the current in R1)
      return toks.every((t) => (t.length === 1 && 'vipq'.includes(t) ? q.kind.toLowerCase() === t : hay.includes(t)));
    });
    lastRows = [];
    let group = null, shown = 0;
    for (const q of filtered) {
      if (q.group !== group) { group = q.group; listEl.appendChild(h('div', { class: 'grp' }, group)); }
      const val = valueText(app, q, sol);
      lastRows.push([q.key, val, q.desc]);
      shown++;
      listEl.appendChild(h('div', { class: 'ans', title: q.desc, onclick: () => {
        if (q.comp !== undefined) app.editor.selectComp(q.comp);
        else { const w = [...nl.wireNode.entries()].find(([, n]) => n === q.node); if (w) app.editor.select([{ kind: 'wire', id: w[0] }]); }
      } }, h('span', { class: 'k' }, q.key), h('span', { class: 'v mono' }, val)));
    }
    if (!shown) listEl.appendChild(h('div', { class: 'muted' }, 'No answer matches “' + text + '”. Try V, I, P, a part label such as R1, or a node name.'));
    renderWorking(app);
  }

  function renderWorking(app) {
    workEl.innerHTML = '';
    const live = app.live; if (!live || !live.sol) return;
    const nl = live.nl, sol = live.sol, ac = live.mode === 'ac';
    const det = h('details', {}, h('summary', {}, 'Show the working (equations and checks)'));
    const body = h('div', { class: 'working' });
    try {
      const eq = Incog.analysis.nodalEquations(nl, sol, live.mode);
      body.appendChild(h('div', { class: 'sect' }, 'KCL at each node (currents leaving = 0)'));
      for (const e of eq.nodeEquations) body.appendChild(h('div', { class: 'eqline mono' }, h('b', {}, 'Node ' + e.node.name + ':  '), e.text));
      if (eq.constraints.length) {
        body.appendChild(h('div', { class: 'sect' }, 'Voltage constraints'));
        for (const c of eq.constraints) body.appendChild(h('div', { class: 'eqline mono' }, c));
      }
      body.appendChild(h('div', { class: 'sect' }, 'Check: current leaving each node'));
      for (const r of Incog.analysis.kclTable(nl, sol)) {
        const ok = Cx.abs(r.sum) < 1e-7 * Math.max(1e-12, ...r.terms.map((t) => Cx.abs(t.z))) + 1e-12;
        body.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'Node ' + r.node.name), h('span', { class: 'v mono' }, (ok ? '✓ ' : '✗ ') + 'Σ = ' + fmtValue(r.sum, 'A', ac))));
      }
      const pb = Incog.analysis.powerBalance(nl, sol);
      body.appendChild(h('div', { class: 'sect' }, 'Power balance'));
      body.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'Delivered'), h('span', { class: 'v mono' }, fmtSI(pb.delivered, 'W'))));
      body.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'Absorbed'), h('span', { class: 'v mono' }, fmtSI(pb.absorbed, 'W'))));
    } catch (err) { body.appendChild(h('div', { class: 'err' }, err.message)); }
    det.appendChild(body); workEl.appendChild(det);
  }

  function toCsv() {
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    return 'Quantity,Value,Meaning\n' + lastRows.map((r) => r.map(q).join(',')).join('\n');
  }

  Incog.tabs.register({
    id: 'answers', title: 'Answers', live: true,
    mount(rootEl, app) {
      input = h('input', { type: 'search', placeholder: 'Search…  e.g.  I R1,  voltage,  V(A)-V(B),  I(R1)+I(R2)', spellcheck: 'false' });
      input.addEventListener('input', () => render(app));
      resultEl = h('div', {}); listEl = h('div', { class: 'anslist' }); workEl = h('div', {});
      const copy = h('button', { onclick: () => { navigator.clipboard && navigator.clipboard.writeText(lastRows.map((r) => r[0] + ' = ' + r[1]).join('\n')); app.toast('Answers copied'); } }, 'Copy');
      const csv = h('button', { onclick: () => app.download((app.circuit.title || 'circuit') + '-answers.csv', toCsv(), 'text/csv') }, 'Save CSV');
      rootEl.appendChild(h('div', { class: 'pad' },
        h('div', { class: 'searchrow' }, input, copy, csv), resultEl, listEl, workEl));
    },
    refresh(app) { render(app); },
  });
})(typeof window !== 'undefined' ? window : globalThis);

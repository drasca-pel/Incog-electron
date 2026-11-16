/* ============================================================================
 * Incog Electric Lab - ui/properties.js   (tab: Properties)
 * Edit the selected part (label, values, node names) and watch its live
 * voltage / current / power.  With nothing selected it shows the whole circuit.
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = root.Incog;
  const { h } = Incog;
  const { fmtSI, fmtValue, fmtComplex, parseSI, fmtPlain } = Incog.util;
  const { Cx } = Incog;

  let box, liveBox, builtFor = null;

  function readoutRows(app, e) {
    const sol = app.live && app.live.sol;
    if (!sol) return [['—', 'No solution yet. Fix the warning above.']];
    const r = sol.get(e.comp.id); if (!r) return [];
    const ac = app.live.mode === 'ac', o = { rms: app.rms };
    const rows = [
      ['Voltage  V(' + e.comp.label + ')', fmtValue(r.v, 'V', ac, o)],
      ['Current  I(' + e.comp.label + ')', fmtValue(r.i, 'A', ac, o)],
      ['Power absorbed', fmtSI(r.p, 'W')],
    ];
    if (ac) {
      rows.push(['Reactive power', fmtSI(r.q, 'VAR')]);
      const mi = Cx.abs(r.i), mv = Cx.abs(r.v);
      if (mi > 1e-15) { const z = Cx.div(r.v, r.i); rows.push(['Impedance  V / I', fmtComplex(z, 'Ω', { form: 'rect' }) + '  =  ' + fmtComplex(z, 'Ω')]); }
      if (mi > 1e-15 && mv > 1e-15) rows.push(['Power factor', String(Number(Math.cos(Cx.arg(r.v) - Cx.arg(r.i)).toFixed(4)))]);
    } else if (Math.abs(r.i.re) > 1e-15 && Math.abs(r.v.re) > 1e-15 && !e.def.isSource) {
      rows.push(['Resistance  V / I', fmtSI(r.v.re / r.i.re, 'Ω')]);
    }
    return rows;
  }

  function renderLive(app) {
    if (!liveBox) return;
    const sel = app.editor.sel;
    liveBox.innerHTML = '';
    if (sel.length === 1 && sel[0].kind === 'comp' && app.live && app.live.nl) {
      const e = app.live.nl.element(sel[0].id);
      if (e) for (const [k, v] of readoutRows(app, e)) liveBox.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, k), h('span', { class: 'v mono' }, v)));
    } else if (sel.length === 1 && sel[0].kind === 'wire' && app.live && app.live.nl) {
      const ni = app.live.nl.wireNode.get(sel[0].id);
      if (ni !== undefined && ni >= 0 && app.live.sol) liveBox.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'Voltage at node ' + app.live.nl.nodes[ni].name), h('span', { class: 'v mono' }, fmtValue(app.live.sol.v(ni), 'V', app.live.mode === 'ac', { rms: app.rms }))));
    }
  }

  function compForm(app, comp) {
    const def = Incog.registry.get(comp.type);
    const ed = app.editor;
    const wrap = h('div', {});
    wrap.appendChild(h('div', { class: 'ptitle' }, def.name));
    if (def.description) wrap.appendChild(h('div', { class: 'muted small' }, def.description));

    // label
    const lab = h('input', { type: 'text', value: comp.label, spellcheck: 'false' });
    lab.addEventListener('change', () => {
      comp.label = app.circuit.uniqueLabel(comp, lab.value || comp.label); lab.value = comp.label; ed.commit();
    });
    wrap.appendChild(h('label', { class: 'field' }, h('span', {}, 'Label'), lab));

    // parameters
    for (const key of Object.keys(def.params)) {
      const spec = def.params[key];
      if (spec.kind === 'bool') {
        const cb = h('input', { type: 'checkbox' }); cb.checked = !!comp.params[key];
        cb.addEventListener('change', () => { comp.params[key] = cb.checked ? 1 : 0; ed.commit(); });
        wrap.appendChild(h('label', { class: 'field inline' }, cb, h('span', {}, spec.label)));
        continue;
      }
      const cur = typeof comp.params[key] === 'number' ? fmtPlain(comp.params[key]) : String(comp.params[key]);
      const inp = h('input', { type: 'text', value: cur, spellcheck: 'false' });
      const apply = () => {
        const v = parseSI(inp.value);
        if (Number.isNaN(v)) { inp.classList.add('bad'); return; }
        inp.classList.remove('bad'); comp.params[key] = v; ed.commit();
      };
      inp.addEventListener('change', apply);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); inp.blur(); } });
      wrap.appendChild(h('label', { class: 'field' }, h('span', {}, spec.label), h('div', { class: 'unitwrap' }, inp, h('em', {}, spec.unit))));
    }

    // node names for each pin
    if (!def.isGround && app.live && app.live.nl) {
      const e = app.live.nl.element(comp.id);
      if (e) {
        wrap.appendChild(h('div', { class: 'sect' }, 'Nodes (click a name to rename)'));
        e.nodes.forEach((ni, pin) => {
          const n = app.live.nl.nodes[ni];
          const inp = h('input', { type: 'text', value: n.name, size: 6, spellcheck: 'false', disabled: n.isGround });
          inp.addEventListener('change', () => {
            const v = inp.value.trim().replace(/[^\w]/g, '');
            const k = comp.id + ':' + pin;
            if (!v || v === n.name) { delete app.circuit.nodeNames[k]; } else { for (const key of Object.keys(app.circuit.nodeNames)) if (app.circuit.nodeNames[key] === v) delete app.circuit.nodeNames[key]; app.circuit.nodeNames[k] = v; }
            ed.commit();
          });
          wrap.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'pin ' + (def.pinNames ? def.pinNames[pin] : pin + 1)), inp));
        });
      }
    }
    return wrap;
  }

  function wireForm(app, id) {
    const wrap = h('div', {});
    const nl = app.live && app.live.nl;
    const ni = nl ? nl.wireNode.get(id) : undefined;
    wrap.appendChild(h('div', { class: 'ptitle' }, 'Wire'));
    if (ni === undefined || ni < 0) { wrap.appendChild(h('div', { class: 'muted' }, 'This wire is not connected to any part yet.')); return wrap; }
    const n = nl.nodes[ni];
    wrap.appendChild(h('div', { class: 'muted small' }, 'Every wire joined to this one is the same electrical node.'));
    const inp = h('input', { type: 'text', value: n.name, spellcheck: 'false', disabled: n.isGround });
    inp.addEventListener('change', () => {
      const v = inp.value.trim().replace(/[^\w]/g, ''); const pin = n.pins[0]; if (!pin) return;
      const k = pin.comp.id + ':' + pin.pin;
      if (!v) delete app.circuit.nodeNames[k]; else { for (const key of Object.keys(app.circuit.nodeNames)) if (app.circuit.nodeNames[key] === v) delete app.circuit.nodeNames[key]; app.circuit.nodeNames[k] = v; }
      app.editor.commit();
    });
    wrap.appendChild(h('label', { class: 'field' }, h('span', {}, 'Node name'), inp));
    wrap.appendChild(h('div', { class: 'sect' }, 'Parts touching this node'));
    wrap.appendChild(h('div', { class: 'muted' }, n.pins.map((p) => p.comp.label).join(', ') || '—'));
    return wrap;
  }

  function overview(app) {
    const wrap = h('div', {});
    const nl = app.live && app.live.nl;
    wrap.appendChild(h('div', { class: 'ptitle' }, app.circuit.title || 'Circuit'));
    const title = h('input', { type: 'text', value: app.circuit.title || '', spellcheck: 'false' });
    title.addEventListener('change', () => { app.circuit.title = title.value; app.editor.commit(); });
    wrap.appendChild(h('label', { class: 'field' }, h('span', {}, 'Circuit name'), title));
    if (!nl) return wrap;
    const parts = nl.elements.length;
    wrap.appendChild(h('div', { class: 'muted' }, `${parts} part${parts === 1 ? '' : 's'}, ${nl.nodes.length - 1} node${nl.nodes.length === 2 ? '' : 's'} (plus ground)`));
    for (const w of nl.warnings) wrap.appendChild(h('div', { class: 'warn' }, '⚠ ' + w.text));
    if (app.error) wrap.appendChild(h('div', { class: 'err' }, '✖ ' + app.error));
    if (app.live && app.live.sol) {
      wrap.appendChild(h('div', { class: 'sect' }, 'Node voltages'));
      for (const n of nl.nodes) {
        if (n.isGround) continue;
        wrap.appendChild(h('div', { class: 'kvrow' }, h('span', { class: 'k' }, 'V(' + n.name + ')'), h('span', { class: 'v mono' }, fmtValue(app.live.sol.v(n.index), 'V', app.live.mode === 'ac', { rms: app.rms }))));
      }
    }
    wrap.appendChild(h('div', { class: 'sect' }, 'Tip'));
    wrap.appendChild(h('div', { class: 'muted small' }, 'Click a part or a wire to edit it. The Answers tab lists every voltage and current, and Theorems solves the classic network theorems.'));
    return wrap;
  }

  Incog.tabs.register({
    id: 'props', title: 'Properties', live: true,
    mount(rootEl) { box = h('div', { class: 'pad' }); rootEl.appendChild(box); },
    refresh(app, reason) {
      const sel = app.editor.sel;
      const sig = JSON.stringify(sel) + (sel.length === 1 && sel[0].kind === 'comp' ? ':' + (app.circuit.getComp(sel[0].id) || {}).label : '');
      const structural = reason !== 'live' || builtFor !== sig;
      if (structural && !(reason === 'live')) {
        // do not rebuild while the user is typing in one of our fields
        if (document.activeElement && box.contains(document.activeElement) && reason === 'change' && builtFor === sig) { renderLive(app); return; }
        builtFor = sig; box.innerHTML = ''; liveBox = null;
        if (sel.length === 1 && sel[0].kind === 'comp') {
          const c = app.circuit.getComp(sel[0].id);
          if (c) {
            box.appendChild(compForm(app, c));
            const def = Incog.registry.get(c.type);
            if (!def.isGround) {
              box.appendChild(h('div', { class: 'sect' }, 'Live values'));
              liveBox = h('div', { class: 'live' }); box.appendChild(liveBox);
              box.appendChild(h('div', { class: 'btnrow' },
                h('button', { onclick: () => { app.circuit.addCompProbe(c.id); app.editor.commit(); } }, '⌖ Stamp probe'),
                h('button', { onclick: () => { app.editor.rotateSelection(); } }, '⟳ Rotate'),
                h('button', { class: 'danger', onclick: () => app.editor.deleteSelection() }, 'Delete')));
            } else box.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.editor.deleteSelection() }, 'Delete')));
          }
        } else if (sel.length === 1 && sel[0].kind === 'wire') {
          box.appendChild(wireForm(app, sel[0].id));
          liveBox = h('div', { class: 'live' }); box.appendChild(h('div', { class: 'sect' }, 'Live values')); box.appendChild(liveBox);
          box.appendChild(h('div', { class: 'btnrow' }, h('button', { class: 'danger', onclick: () => app.editor.deleteSelection() }, 'Delete wire')));
        } else if (sel.length > 1) {
          box.appendChild(h('div', { class: 'ptitle' }, sel.length + ' items selected'));
          box.appendChild(h('div', { class: 'muted' }, 'Drag to move them together, R to rotate parts, Del to delete, Ctrl+D to duplicate.'));
        } else box.appendChild(overview(app));
      }
      renderLive(app);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);

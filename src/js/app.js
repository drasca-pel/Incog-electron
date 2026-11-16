/* ============================================================================
 * Incog Electric Lab - app.js
 * The controller: wires the canvas editor, the solver, the right-hand tabs and the
 * toolbar together.  Live results are recomputed after every edit (DC / AC) or
 * stepped continuously (Transient).  Open this file first when you want to change
 * how the app behaves; the physics lives in js/core and each panel in js/ui.
 * ========================================================================== */
(function () {
  'use strict';
  const Incog = window.Incog;
  const { h } = Incog;
  const { fmtSI, parseSI, fmtPlain } = Incog.util;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  const app = {
    circuit: new Incog.Circuit(),
    editor: null,
    live: null,
    error: null,
    mode: 'dc',
    freq: 50,
    rms: false,
    sim: null,
    running: false,
    hist: { t: [], vals: [], names: [] },
    timingManual: false,
  };
  window.IncogApp = app;

  // ================================================================= helpers
  app.toast = (msg, ms = 2600) => {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(app._toastT); app._toastT = setTimeout(() => t.classList.add('hidden'), ms);
  };
  app.download = (name, text, mime) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name.replace(/[\\/:*?"<>|]+/g, '_'); document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ============================================================ recompute
  function colourRange(nl, sol, mode) {
    let lo = 0, hi = 0;
    for (const n of nl.nodes) { const v = sol.v(n.index); const x = mode === 'ac' ? Incog.Cx.abs(v) : v.re; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return { lo, hi };
  }

  app.recompute = function () {
    const nl = Incog.buildNetlist(app.circuit);
    app.error = null;
    if (!nl.elements.length) { app.live = null; app.sim = null; setStatus(nl); return; }
    try {
      if (app.mode === 'tran') {
        if (!app.sim) app.sim = new Incog.TransientSim(nl, { dt: dtValue() });
        else app.sim.setNetlist(nl);
        app.sim.dt = dtValue();
        if (app.running && app.live && app.live.sol) { app.live.nl = nl; setStatus(nl); return; }
        const sol = Incog.solve(nl, { mode: 'dc' });
        app.live = { nl, sol, mode: 'dc', range: colourRange(nl, sol, 'dc') };
      } else {
        const sol = Incog.solve(nl, { mode: app.mode, freq: app.freq });
        app.live = { nl, sol, mode: app.mode, range: colourRange(nl, sol, app.mode) };
      }
    } catch (err) {
      app.error = err.message; app.live = { nl, sol: null, mode: app.mode, range: { lo: 0, hi: 0 } };
    }
    setStatus(nl);
  };

  function setStatus(nl) {
    const el = $('statusMsg');
    el.className = 'status';
    if (app.error) { el.textContent = '✖ ' + app.error; el.classList.add('err'); }
    else if (nl.warnings.length) { el.textContent = '⚠ ' + nl.warnings[0].text; el.classList.add('warn'); }
    else if (nl.elements.length && !nl.hasSources) { el.textContent = 'No source in the circuit yet. Add a voltage or current source.'; el.classList.add('warn'); }
    else el.textContent = nl.elements.length ? `${nl.nodes.length - 1} node${nl.nodes.length === 2 ? '' : 's'} · ${nl.elements.length} parts` : '';
    $('emptyHint').classList.toggle('hidden', app.circuit.comps.length > 0 || app.circuit.wires.length > 0);
  }

  // ======================================================== editor wiring
  function onChange(light) {
    app.recompute();
    app.editor.invalidate();
    if (light) { Incog.tabs.notify('live'); return; }
    if (app.mode === 'tran' && !app.timingManual) suggestTiming();
    Incog.tabs.notify('change'); markDirty();
    clearTimeout(app._saveT); app._saveT = setTimeout(autosave, 600);
  }
  function autosave() { store.set('incog.autosave', JSON.stringify({ circuit: exportObj() })); }
  function exportObj() { const o = app.circuit.toJSON(); o.analysis = { mode: app.mode, freq: app.freq, rms: app.rms }; return o; }

  function onSelect() { Incog.tabs.notify('select'); }
  function onTool(tool) {
    document.querySelectorAll('#toolGroup .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  }

  // ============================================================== palette
  const iconDraw = [];
  function buildPalette() {
    const list = $('paletteList'); list.innerHTML = ''; iconDraw.length = 0;
    for (const cat of Incog.registry.categories()) {
      list.appendChild(h('div', { class: 'cat' }, cat.name));
      const grid = h('div', { class: 'palgrid' });
      for (const def of cat.defs) {
        const cv = h('canvas', { width: 112, height: 68 });
        const btn = h('button', { class: 'pal', title: def.name + (def.description ? '\n' + def.description : ''), onclick: () => { app.editor.startPlace(def.type); } }, cv, h('span', {}, def.name.replace(/ \(.\)$/, '')));
        grid.appendChild(btn);
        iconDraw.push(() => drawIcon(cv, def));
        for (const v of def.variants || []) {   // extra palette entries that reuse the same part with preset values
          const vc = h('canvas', { width: 112, height: 68 });
          grid.appendChild(h('button', { class: 'pal', title: v.name, onclick: () => { app.editor.startPlace(def.type, v.params); } }, vc, h('span', {}, v.name)));
          iconDraw.push(() => drawIcon(vc, def, v.params));
        }
      }
      list.appendChild(grid);
    }
    drawIcons();
  }
  function drawIcon(cv, def, extra) {
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    const col = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e8eef5';
    const four = def.pins.length > 2, gnd = def.isGround;
    const s = four ? 0.62 : gnd ? 1.05 : 0.95;
    g.translate(cv.width / 2, cv.height / 2 + (gnd ? -6 : 0)); g.scale(s, s);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.2 / s; g.lineCap = 'round'; g.lineJoin = 'round';
    const dummy = { params: Object.assign(Incog.registry.defaultParams(def), extra || {}), rot: 0, label: '' };
    if (four) g.rotate(0); def.draw(g, dummy, { stroke: col });
  }
  function drawIcons() { iconDraw.forEach((f) => f()); }

  // ========================================================== analysis bar
  const dtValue = () => { const v = parseSI($('inDt').value); return v > 0 ? v : 1e-5; };
  const spanValue = () => { const v = parseSI($('inSpan').value); return v > 0 ? v : 1e-2; };

  function suggestTiming() {
    if (!app.live || !app.live.nl) return;
    const t = Incog.suggestTiming(app.live.nl);
    $('inDt').value = fmtPlain(Number(t.dt.toPrecision(2))); $('inSpan').value = fmtPlain(Number(t.span.toPrecision(2)));
    if (app.sim) app.sim.dt = dtValue();
  }

  app.setMode = function (m, quiet) {
    if (m === 'tran' && false) return;
    app.mode = m; app.running = false; app.sim = null; app.resetHistory();
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $('acControls').hidden = m !== 'ac'; $('tranControls').hidden = m !== 'tran';
    $('btnRun').textContent = '▶ Run';
    if (m === 'ac') {
      const srcs = app.circuit.comps.filter((c) => c.type === 'Vac' || c.type === 'Iac');
      if (srcs.length && !srcs.some((c) => Math.abs(c.params.freq - app.freq) < 1e-9)) { app.freq = srcs[0].params.freq; $('inFreq').value = fmtPlain(Number(app.freq.toPrecision(8))); }
    }
    app.recompute();
    if (m === 'tran' && !app.timingManual) suggestTiming();
    app.editor.invalidate();
    if (!quiet) Incog.tabs.notify('mode');
  };

  app.resetHistory = function () { app.hist = { t: [], vals: [], names: [] }; };

  function startStop(force) {
    if (app.mode !== 'tran') { app.toast('Switch the analysis to Transient first.'); return; }
    app.running = force !== undefined ? force : !app.running;
    $('btnRun').textContent = app.running ? '❚❚ Pause' : '▶ Run';
    if (app.running) {
      if (!app.sim) app.sim = new Incog.TransientSim(app.live.nl, { dt: dtValue() });
      app.sim.dt = dtValue();
      if (!app.live) app.recompute();
      Incog.tabs.show('scope');
    }
  }
  function resetSim() {
    app.sim = null; app.resetHistory(); app.recompute();
    $('simClock').textContent = 't = 0 s'; Incog.tabs.notify('live'); app.editor.invalidate();
  }

  // ---------------------------------------------------------- transient loop
  let lastFrame = performance.now(), lastTabTick = 0;
  function tranLoop(now) {
    requestAnimationFrame(tranLoop);
    const dtReal = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
    if (!app.running || app.mode !== 'tran' || !app.sim || !app.live || !app.live.nl) return;
    try {
      const span = spanValue(), dt = dtValue();
      app.sim.dt = dt;
      const speed = Math.pow(10, Number($('inSpeed').value));
      const adv = (span / 8) * speed * dtReal;
      const steps = Math.max(1, Math.min(4000, Math.round(adv / dt)));
      const rec = Math.max(1, Math.round(span / dt / 700));
      const sigs = Incog.tabs.get('scope').signals(app);
      if (app.hist.names.join('|') !== sigs.join('|')) { app.hist = { t: [], vals: sigs.map(() => []), names: sigs.slice() }; }
      let sol = null;
      for (let i = 0; i < steps; i++) {
        sol = app.sim.step();
        if (app.sim.steps % rec === 0) {
          app.hist.t.push(app.sim.t);
          sigs.forEach((s, k) => { let v = NaN; try { v = Incog.analysis.evaluate(s, app.sim.nl, sol).re; } catch (e) { /* bad signal text */ } app.hist.vals[k].push(v); });
        }
      }
      while (app.hist.t.length && app.hist.t[0] < app.sim.t - span) { app.hist.t.shift(); app.hist.vals.forEach((a) => a.shift()); }
      app.live = { nl: app.sim.nl, sol, mode: 'dc', range: colourRange(app.sim.nl, sol, 'dc'), animT: app.live.animT };
      $('simClock').textContent = 't = ' + fmtSI(app.sim.t, 's');
      app.editor.invalidate();
      if (now - lastTabTick > 110) { lastTabTick = now; Incog.tabs.notify('live'); }
    } catch (err) {
      app.running = false; $('btnRun').textContent = '▶ Run'; app.error = err.message; setStatus(app.live.nl); app.toast('Simulation stopped: ' + err.message, 5000);
    }
  }

  // ===================================================== file operations
  function loadObject(obj, quiet) {
    app.file.path = null; app.file.handle = null;
    const skipped = app.circuit.loadJSON(obj.circuit || obj);
    const an = obj.analysis || (obj.circuit && obj.circuit.analysis);
    if (an) { app.freq = an.freq || app.freq; app.rms = !!an.rms; $('chkRms').checked = app.rms; $('inFreq').value = fmtPlain(Number(app.freq.toPrecision(8))); }
    app.timingManual = false; app.hist = { t: [], vals: [], names: [] }; app.running = false; app.sim = null;
    app.editor.setCircuit(app.circuit);
    app.setMode(an && an.mode ? an.mode : 'dc', true);
    app.recompute(); Incog.tabs.notify('change'); Incog.tabs.notify('select'); setDirty(false);
    if (skipped.length && !quiet) app.toast('Some parts are unknown to this version and were skipped: ' + [...new Set(skipped)].join(', '), 5000);
  }
  function newCircuit() {
    if (app.circuit.comps.length && !confirm('Start a new circuit? Unsaved changes will be lost.')) return;
    app.circuit.reset(); loadObject(exportObj(), true); app.setMode('dc');
  }
  // ---- real files on disk: Save, Save As, Open (desktop app uses native dialogs; Chrome/Edge use the file picker)
  app.file = { path: null, handle: null, dirty: false };
  const PICK = { types: [{ description: 'Incog circuit', accept: { 'application/json': ['.incog'] } }] };
  function baseName() { const p = app.file.path || (app.file.handle && app.file.handle.name) || ''; return p.split(/[\\/]/).pop(); }
  function updateTitle() {
    const n = baseName() || 'Untitled';
    document.title = (app.file.dirty ? '• ' : '') + n + ' - Incog Electric Lab';
    if (window.incogFile && window.incogFile.setDirty) window.incogFile.setDirty(app.file.dirty);
  }
  function setDirty(d) { app.file.dirty = d; updateTitle(); }
  function markDirty() { if (!app.file.dirty) setDirty(true); }
  async function saveFile(saveAs) {
    const text = JSON.stringify(exportObj(), null, 1), name = (app.circuit.title || 'circuit') + '.incog';
    try {
      if (window.incogFile) {
        const r = await window.incogFile.save({ text, name, path: saveAs ? null : app.file.path });
        if (!r || r.canceled) return;
        app.file.path = r.path;
      } else if (window.showSaveFilePicker) {
        if (saveAs || !app.file.handle) app.file.handle = await window.showSaveFilePicker(Object.assign({ suggestedName: name }, PICK));
        const w = await app.file.handle.createWritable(); await w.write(text); await w.close();
      } else { app.download(name, text, 'application/json'); app.toast('Saved to your downloads folder'); setDirty(false); return; }
      setDirty(false); app.toast('Saved ' + baseName());
    } catch (e) { if (e.name !== 'AbortError') app.toast('Could not save: ' + e.message, 5000); }
  }
  function openText(text, name, path, handle) {
    try {
      loadObject(JSON.parse(text)); app.file.path = path || null; app.file.handle = handle || null; setDirty(false);
      app.toast('Opened ' + (name || baseName()));
    } catch (e) { app.toast('That file could not be opened: ' + e.message, 5000); }
  }
  async function openDialog() {
    if (app.file.dirty && !confirm('Open another file? Unsaved changes will be lost.')) return;
    try {
      if (window.incogFile) { const r = await window.incogFile.open(); if (r && !r.canceled) openText(r.text, r.path.split(/[\\/]/).pop(), r.path); }
      else if (window.showOpenFilePicker) { const [h] = await window.showOpenFilePicker(PICK); openText(await (await h.getFile()).text(), h.name, null, h); }
      else $('fileInput').click();
    } catch (e) { if (e.name !== 'AbortError') app.toast('Could not open: ' + e.message, 5000); }
  }
  function openFile(file) { const r = new FileReader(); r.onload = () => openText(r.result, file.name); r.readAsText(file); }
  function loadExample(id) {
    const ex = Incog.examples.list.find((e) => e.id === id); if (!ex) return;
    const c = Incog.examples.build(ex);
    loadObject({ circuit: c.toJSON(), analysis: { mode: ex.mode, freq: ex.freq || 50 } }, true);
    app.toast(ex.about, 6500);
    if (id === 'thevenin') Incog.tabs.get('theorems').open(app, 'thevenin', 'RL');
    else if (id === 'maxpower') Incog.tabs.get('theorems').open(app, 'maxpower', 'RL');
    else if (id === 'superposition') Incog.tabs.get('theorems').open(app, 'superposition');
  }

  // ================================================================== boot
  function boot() {
    const canvas = $('cv');
    app.editor = new Incog.Editor(canvas, app.circuit, {
      onChange, onSelect, onTool,
      getLive: () => app.live,
      onEdit: () => { Incog.tabs.show('props'); setTimeout(() => { const i = document.querySelector('#tabBody .tabpane:not(.hidden) input'); if (i) { i.focus(); i.select(); } }, 30); },
    });
    buildPalette();
    Incog.tabs.build(app, $('tabs'), $('tabBody'));

    // examples menu
    const sel = $('selExamples');
    sel.hidden = sel.options.length <= 1;
    sel.addEventListener('change', () => { if (sel.value) loadExample(sel.value); sel.value = ''; });

    // toolbar
    document.querySelectorAll('#toolGroup .tool').forEach((b) => b.addEventListener('click', () => app.editor.setTool(b.dataset.tool)));
    $('btnZoomIn').onclick = () => app.editor.zoom(1.25); $('btnZoomOut').onclick = () => app.editor.zoom(0.8); $('btnFit').onclick = () => app.editor.fit();
    $('btnRotate').onclick = () => app.editor.rotateSelection(); $('btnDelete').onclick = () => app.editor.deleteSelection();
    $('btnUndo').onclick = () => app.editor.undo(); $('btnRedo').onclick = () => app.editor.redo();
    $('btnNew').onclick = newCircuit; $('btnSave').onclick = () => saveFile(false); $('btnSaveAs').onclick = () => saveFile(true); $('btnOpen').onclick = openDialog;
    $('fileInput').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; });
    const bind = (id, key) => $(id).addEventListener('change', (e) => { app.editor[key] = e.target.checked; app.editor.invalidate(); });
    bind('chkNodes', 'showNodes'); bind('chkValues', 'showValues'); bind('chkColors', 'showColors'); bind('chkFlow', 'showFlow');
    $('chkRms').addEventListener('change', (e) => { app.rms = e.target.checked; Incog.tabs.notify('change'); });

    // analysis bar
    document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => app.setMode(b.dataset.mode)));
    $('inFreq').addEventListener('change', () => { const v = parseSI($('inFreq').value); if (v > 0) { app.freq = v; app.recompute(); Incog.tabs.notify('change'); app.editor.invalidate(); } else $('inFreq').value = fmtPlain(app.freq); });
    $('btnRun').onclick = () => startStop(); $('btnReset').onclick = resetSim;
    $('inDt').addEventListener('change', () => { app.timingManual = true; if (app.sim) app.sim.dt = dtValue(); });
    $('inSpan').addEventListener('change', () => { app.timingManual = true; app.resetHistory(); });

    // header
    $('btnTheme').onclick = () => setTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
    $('btnHelp').onclick = () => $('helpDlg').classList.remove('hidden');
    $('helpClose').onclick = () => $('helpDlg').classList.add('hidden');
    $('helpDlg').addEventListener('mousedown', (e) => { if (e.target === $('helpDlg')) $('helpDlg').classList.add('hidden'); });
    document.querySelectorAll('.labtab').forEach((b) => b.addEventListener('click', () => switchLab(b.dataset.lab)));
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!$('lab-circuit').classList.contains('hidden')) saveFile(e.shiftKey); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); openDialog(); }
      else if (e.key === 'Escape') $('helpDlg').classList.add('hidden');
    });

    if (window.incogFile) window.incogFile.onOpen((f) => openText(f.text, f.path.split(/[\\/]/).pop(), f.path));   // double-clicked .incog file
    window.addEventListener('beforeunload', (e) => { if (app.file.dirty && !window.incogFile) { e.preventDefault(); e.returnValue = ''; } });
    setTheme(store.get('incog.theme') || 'dark');

    // always start with an empty canvas
    loadObject({ circuit: new Incog.Circuit().toJSON(), analysis: { mode: 'dc', freq: 50 } }, true);
    app.toast('Empty canvas. Click a part on the left to begin.', 5000);
    requestAnimationFrame(tranLoop);
    setTimeout(() => app.editor.fit(), 60);
  }

  function setTheme(name) {
    document.body.classList.toggle('theme-dark', name === 'dark'); document.body.classList.toggle('theme-light', name === 'light');
    app.editor.setTheme(name); store.set('incog.theme', name); drawIcons();
    Incog.tabs.notify('show');
    if (Incog.FieldLab && Incog.FieldLab.redraw) Incog.FieldLab.redraw();
  }

  let fieldMounted = false;
  function switchLab(which) {
    document.querySelectorAll('.labtab').forEach((b) => b.classList.toggle('active', b.dataset.lab === which));
    $('lab-circuit').classList.toggle('hidden', which !== 'circuit'); $('lab-field').classList.toggle('hidden', which !== 'field');
    $('fileBtns').classList.toggle('fieldmode', which === 'field');
    if (which === 'field') {
      if (!fieldMounted) { Incog.FieldLab.mount($('lab-field'), app); fieldMounted = true; }
      Incog.FieldLab.onShow();
    } else { app.editor.resize(); app.editor.invalidate(); if (Incog.FieldLab && Incog.FieldLab.onHide) Incog.FieldLab.onHide(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

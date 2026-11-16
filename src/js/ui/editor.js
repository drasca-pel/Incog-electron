/* ============================================================================
 * Incog Electric Lab - ui/editor.js
 * The circuit canvas: zoom / pan, grid, wires, parts, probes, live colours,
 * current-flow animation, undo / redo.  It only edits the Circuit model and asks
 * the app (through `hooks`) for live results, so it has no solver code of its own.
 *
 * hooks: { onChange(), onSelect(sel), onEdit(comp), getLive() -> {nl, sol, mode} | null,
 *          onTool(tool), onMessage(text) }
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { fmtSI, fmtValue } = Incog.util;
  const { Cx } = Incog;
  const GRID = 20;

  const THEMES = {
    dark: {
      bg: '#0e131a', dot: '#26323f', dotMajor: '#33435a', wire: '#7fb0e0', wireNoSol: '#6d8aa8', stroke: '#e8eef5', sel: '#ffc83d',
      label: '#a9bdd2', value: '#6ee7b7', node: '#ffb454', nodeBg: 'rgba(14,19,26,.88)', probe: '#ff6b9a', tipBg: '#1b2531', tipFg: '#e8eef5',
      box: 'rgba(255,200,61,.12)', ghost: 'rgba(232,238,245,.6)', flow: '#ffe28a',
    },
    light: {
      bg: '#f7f9fb', dot: '#d7dee6', dotMajor: '#bfc9d4', wire: '#2a6db0', wireNoSol: '#5d7a96', stroke: '#1c2733', sel: '#e08a00',
      label: '#4a5d70', value: '#0a8a5f', node: '#b45f06', nodeBg: 'rgba(247,249,251,.92)', probe: '#d6246e', tipBg: '#ffffff', tipFg: '#1c2733',
      box: 'rgba(224,138,0,.12)', ghost: 'rgba(28,39,51,.55)', flow: '#c27a00',
    },
  };

  class Editor {
    constructor(canvas, circuit, hooks) {
      this.cv = canvas;
      this.g = canvas.getContext('2d');
      this.circuit = circuit;
      this.hooks = hooks || {};
      this.theme = THEMES.dark;
      this.view = { x: 60, y: 60, s: 1 };
      this.tool = 'select';
      this.placing = null;       // { type, rot }
      this.sel = [];             // [{kind:'comp'|'wire'|'probe', id}]
      this.mouse = { x: 0, y: 0, gx: 0, gy: 0, inside: false };
      this.drag = null;
      this.wireDraft = null;     // { pts:[{x,y}], flip }
      this.undoStack = []; this.redoStack = [];
      this.showNodes = true; this.showValues = true; this.showFlow = true; this.showColors = true;
      this.spaceDown = false;
      this.flow = new Map();     // comp id -> accumulated dot offset
      this.lastT = performance.now();
      this.dirty = true;
      this._bind();
      this.resize();
      this.snapshot(true);
      const loop = (t) => { this._frame(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    // ================================================================ setup
    setCircuit(c) { this.circuit = c; this.sel = []; this.wireDraft = null; this.placing = null; this.undoStack = []; this.redoStack = []; this.snapshot(true); this.fit(); this.emitSelect(); }
    setTheme(name) { this.theme = THEMES[name] || THEMES.dark; this.invalidate(); }
    invalidate() { this.dirty = true; }
    setTool(t) {
      this.tool = t; this.wireDraft = null; if (t !== 'select') this.placing = this.placing && t === 'place' ? this.placing : null;
      this.cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
      if (this.hooks.onTool) this.hooks.onTool(t);
      this.invalidate();
    }
    startPlace(type, params) {
      this.placing = { type, rot: 0, params: params || null }; this.tool = 'select'; this.wireDraft = null;
      this.cv.style.cursor = 'copy'; if (this.hooks.onTool) this.hooks.onTool('place', type); this.invalidate();
    }
    cancel() {
      this.placing = null; this.wireDraft = null; this.drag = null;
      this.setTool(this.tool === 'place' ? 'select' : this.tool);
      this.cv.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair';
      if (this.hooks.onTool) this.hooks.onTool(this.tool);
      this.invalidate();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
      this.dpr = dpr; this.invalidate();
    }

    // ============================================================ undo/redo
    snapshot(initial) {
      const s = this.circuit.serialize();
      if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === s) return;
      this.undoStack.push(s); if (this.undoStack.length > 200) this.undoStack.shift();
      if (!initial) this.redoStack = [];
    }
    commit() { this.snapshot(); this.invalidate(); if (this.hooks.onChange) this.hooks.onChange(); }
    undo() {
      if (this.undoStack.length < 2) return;
      this.redoStack.push(this.undoStack.pop());
      this._restore(this.undoStack[this.undoStack.length - 1]);
    }
    redo() { if (!this.redoStack.length) return; const s = this.redoStack.pop(); this.undoStack.push(s); this._restore(s); }
    _restore(s) {
      this.circuit.loadJSON(s); this.sel = []; this.wireDraft = null; this.emitSelect();
      this.invalidate(); if (this.hooks.onChange) this.hooks.onChange();
    }

    // ================================================================== view
    toWorld(px, py) { return { x: (px - this.view.x) / this.view.s, y: (py - this.view.y) / this.view.s }; }
    toScreen(wx, wy) { return { x: wx * this.view.s + this.view.x, y: wy * this.view.s + this.view.y }; }
    zoomAt(px, py, f) {
      const s0 = this.view.s, s1 = Math.min(5, Math.max(0.15, s0 * f));
      const w = this.toWorld(px, py);
      this.view.s = s1; this.view.x = px - w.x * s1; this.view.y = py - w.y * s1; this.invalidate();
    }
    zoom(f) { this.zoomAt(this.w / 2, this.h / 2, f); }
    fit() {
      const c = this.circuit;
      const xs = [], ys = [];
      for (const k of c.comps) for (const p of c.pinPoints(k)) { xs.push(p.x); ys.push(p.y); xs.push(k.x); ys.push(k.y); }
      for (const w of c.wires) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
      if (!xs.length) { this.view = { x: 60, y: 60, s: 1 }; this.invalidate(); return; }
      const x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 3, y1 = Math.max(...ys) + 4;
      const s = Math.min(2, Math.max(0.2, Math.min(this.w / ((x1 - x0) * GRID), this.h / ((y1 - y0) * GRID))));
      this.view.s = s; this.view.x = (this.w - (x1 - x0) * GRID * s) / 2 - x0 * GRID * s; this.view.y = (this.h - (y1 - y0) * GRID * s) / 2 - y0 * GRID * s;
      this.invalidate();
    }

    // ============================================================= selection
    isSel(kind, id) { return this.sel.some((s) => s.kind === kind && s.id === id); }
    select(list) { this.sel = list; this.emitSelect(); this.invalidate(); }
    emitSelect() { if (this.hooks.onSelect) this.hooks.onSelect(this.sel); }
    selectComp(id) { this.select([{ kind: 'comp', id }]); }

    deleteSelection() {
      if (!this.sel.length) return;
      for (const s of this.sel) {
        if (s.kind === 'comp') this.circuit.removeComp(s.id);
        else if (s.kind === 'wire') this.circuit.removeWire(s.id);
        else if (s.kind === 'probe') this.circuit.removeProbe(s.id);
      }
      this.sel = []; this.emitSelect(); this.commit();
    }
    rotateSelection() {
      if (this.placing) { this.placing.rot = (this.placing.rot + 1) % 4; this.invalidate(); return; }
      let any = false;
      for (const s of this.sel) if (s.kind === 'comp') { const c = this.circuit.getComp(s.id); this._rotateComp(c); any = true; }
      if (any) this.commit();
    }
    _rotateComp(c) {
      // wire ends sitting on this part's pins follow the pins
      const before = this.circuit.pinPoints(c);
      c.rot = (c.rot + 1) % 4;
      const after = this.circuit.pinPoints(c);
      for (const w of this.circuit.wires) {
        before.forEach((b, i) => {
          if (w.x1 === b.x && w.y1 === b.y) { w.x1 = after[i].x; w.y1 = after[i].y; }
          else if (w.x2 === b.x && w.y2 === b.y) { w.x2 = after[i].x; w.y2 = after[i].y; }
        });
      }
    }
    duplicateSelection() {
      const out = [];
      for (const s of this.sel) if (s.kind === 'comp') {
        const c = this.circuit.getComp(s.id);
        if (!c) continue;
        const n = this.circuit.addComponent(c.type, c.x + 2, c.y + 2, c.rot, { ...c.params });
        out.push({ kind: 'comp', id: n.id });
      }
      if (out.length) { this.select(out); this.commit(); }
    }

    // ============================================================== hit tests
    hitPin(wx, wy) {
      const gx = wx / GRID, gy = wy / GRID;
      let best = null, bd = 0.4;
      for (const c of this.circuit.comps) {
        const pts = this.circuit.pinPoints(c);
        pts.forEach((p, i) => { const d = Math.hypot(p.x - gx, p.y - gy); if (d < bd) { bd = d; best = { comp: c, pin: i, x: p.x, y: p.y }; } });
      }
      return best;
    }
    hitComp(wx, wy) {
      const gx = wx / GRID, gy = wy / GRID;
      for (let i = this.circuit.comps.length - 1; i >= 0; i--) {
        const c = this.circuit.comps[i];
        const def = Incog.registry.get(c.type);
        const dx = gx - c.x, dy = gy - c.y;
        if (def.isGround) { if (Math.abs(dx) < 0.9 && dy > -0.3 && dy < 1.2) return c; continue; }
        if (Math.abs(dx) <= 1.3 && Math.abs(dy) <= 1.3) return c;
      }
      return null;
    }
    hitWire(wx, wy) {
      const gx = wx / GRID, gy = wy / GRID, tol = Math.max(0.25, 5 / (GRID * this.view.s));
      let best = null, bd = tol;
      for (const w of this.circuit.wires) {
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy;
        let t = L2 ? ((gx - w.x1) * dx + (gy - w.y1) * dy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(gx - (w.x1 + t * dx), gy - (w.y1 + t * dy));
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    }
    hitProbe(wx, wy) {
      const gx = wx / GRID, gy = wy / GRID;
      for (const p of this.circuit.probes) {
        const pos = this._probePos(p);
        if (pos && Math.hypot(pos.x - gx, pos.y - gy) < 0.5) return p;
      }
      return null;
    }
    _probePos(p) {
      if (p.kind === 'node') return { x: p.x, y: p.y };
      const c = this.circuit.getComp(p.comp); return c ? { x: c.x, y: c.y - 1.6 } : null;
    }
    pointOnConnection(gx, gy) {
      for (const c of this.circuit.comps) for (const p of this.circuit.pinPoints(c)) if (p.x === gx && p.y === gy) return true;
      for (const w of this.circuit.wires) {
        if ((w.x1 === gx && w.y1 === gy) || (w.x2 === gx && w.y2 === gy)) return true;
        if (Incog.onInterior(gx, gy, w)) return true;
      }
      return false;
    }

    // ================================================================= input
    _bind() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('wheel', (e) => {
        e.preventDefault(); const p = pos(e);
        this.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      }, { passive: false });
      cv.addEventListener('mousedown', (e) => this._down(e, pos(e)));
      window.addEventListener('mousemove', (e) => this._move(e, pos(e)));
      window.addEventListener('mouseup', (e) => this._up(e, pos(e)));
      cv.addEventListener('mouseleave', () => { this.mouse.inside = false; this.invalidate(); });
      cv.addEventListener('dblclick', (e) => this._dbl(e, pos(e)));
      window.addEventListener('keydown', (e) => this._key(e));
      window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; if (!this.drag) this.cv.style.cursor = this.tool === 'pan' ? 'grab' : 'default'; } });
      window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(cv);
    }

    _setMouse(p) {
      const w = this.toWorld(p.x, p.y);
      this.mouse = { x: w.x, y: w.y, gx: Math.round(w.x / GRID), gy: Math.round(w.y / GRID), sx: p.x, sy: p.y, inside: true };
    }

    _down(e, p) {
      this._setMouse(p);
      const m = this.mouse;
      if (e.button === 1 || (e.button === 0 && (this.tool === 'pan' || this.spaceDown))) {
        this.drag = { type: 'pan', sx: p.x, sy: p.y, vx: this.view.x, vy: this.view.y }; this.cv.style.cursor = 'grabbing'; e.preventDefault(); return;
      }
      if (e.button === 2) { if (this.wireDraft || this.placing) this.cancel(); else this.drag = { type: 'pan', sx: p.x, sy: p.y, vx: this.view.x, vy: this.view.y, right: true }; return; }
      if (e.button !== 0) return;

      if (this.placing) {
        const c = this.circuit.addComponent(this.placing.type, m.gx, m.gy, this.placing.rot, this.placing.params);
        this.select([{ kind: 'comp', id: c.id }]); this.commit(); return;
      }
      if (this.tool === 'wire') { this._wireClick(); return; }
      if (this.tool === 'probe') { this._probeClick(); return; }

      // select tool
      const pin = this.hitPin(m.x, m.y);
      if (pin && !e.shiftKey) { this.tool = 'wire'; this._startWire(pin.x, pin.y); if (this.hooks.onTool) this.hooks.onTool('wire'); return; }
      const pr = this.hitProbe(m.x, m.y);
      const comp = pr ? null : this.hitComp(m.x, m.y);
      const wire = pr || comp ? null : this.hitWire(m.x, m.y);
      const item = pr ? { kind: 'probe', id: pr.id } : comp ? { kind: 'comp', id: comp.id } : wire ? { kind: 'wire', id: wire.id } : null;
      if (item) {
        if (e.shiftKey) { this.isSel(item.kind, item.id) ? this.select(this.sel.filter((s) => !(s.kind === item.kind && s.id === item.id))) : this.select([...this.sel, item]); }
        else if (!this.isSel(item.kind, item.id)) this.select([item]);
        this.drag = { type: 'move', gx: m.gx, gy: m.gy, moved: false, orig: null };
      } else {
        if (!e.shiftKey) this.select([]);
        this.drag = { type: 'box', x0: m.x, y0: m.y, x1: m.x, y1: m.y, add: e.shiftKey };
      }
    }

    _move(e, p) {
      this._setMouse(p);
      const m = this.mouse;
      const d = this.drag;
      if (d) {
        if (d.type === 'pan') { this.view.x = d.vx + (p.x - d.sx); this.view.y = d.vy + (p.y - d.sy); }
        else if (d.type === 'box') { d.x1 = m.x; d.y1 = m.y; }
        else if (d.type === 'move') {
          const dx = m.gx - d.gx, dy = m.gy - d.gy;
          if (dx || dy) {
            if (!d.moved) { d.moved = true; this._beginMove(d); }
            this._applyMove(d, dx, dy);
          }
        }
      }
      this.invalidate();
    }

    _beginMove(d) {
      const c = this.circuit;
      const comps = this.sel.filter((s) => s.kind === 'comp').map((s) => c.getComp(s.id)).filter(Boolean);
      const wires = this.sel.filter((s) => s.kind === 'wire').map((s) => c.wires.find((w) => w.id === s.id)).filter(Boolean);
      const probes = this.sel.filter((s) => s.kind === 'probe').map((s) => c.probes.find((p) => p.id === s.id)).filter(Boolean);
      // wire ends that sit on the pins of moving parts (or on the ends of moving wires) follow along
      const anchorKeys = new Set();
      for (const k of comps) for (const pt of c.pinPoints(k)) anchorKeys.add(pt.x + ',' + pt.y);
      for (const w of wires) { anchorKeys.add(w.x1 + ',' + w.y1); anchorKeys.add(w.x2 + ',' + w.y2); }
      const follow = [];
      for (const w of c.wires) {
        if (wires.includes(w)) continue;
        if (anchorKeys.has(w.x1 + ',' + w.y1)) follow.push({ w, end: 1 });
        if (anchorKeys.has(w.x2 + ',' + w.y2)) follow.push({ w, end: 2 });
      }
      d.orig = {
        comps: comps.map((k) => ({ k, x: k.x, y: k.y })),
        wires: wires.map((w) => ({ w, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })),
        probes: probes.map((p) => ({ p, x: p.x, y: p.y })),
        follow: follow.map((f) => ({ ...f, x: f.end === 1 ? f.w.x1 : f.w.x2, y: f.end === 1 ? f.w.y1 : f.w.y2 })),
      };
    }
    _applyMove(d, dx, dy) {
      const o = d.orig; if (!o) return;
      for (const r of o.comps) { r.k.x = r.x + dx; r.k.y = r.y + dy; }
      for (const r of o.wires) { r.w.x1 = r.x1 + dx; r.w.y1 = r.y1 + dy; r.w.x2 = r.x2 + dx; r.w.y2 = r.y2 + dy; }
      for (const r of o.probes) if (r.p.kind === 'node' && !r.p.wire) { r.p.x = r.x + dx; r.p.y = r.y + dy; }
      for (const r of o.follow) { if (r.end === 1) { r.w.x1 = r.x + dx; r.w.y1 = r.y + dy; } else { r.w.x2 = r.x + dx; r.w.y2 = r.y + dy; } }
      if (this.hooks.onChange) this.hooks.onChange(true);
    }

    _up(e, p) {
      const d = this.drag; if (!d) return;
      this.drag = null;
      this.cv.style.cursor = this.tool === 'pan' ? 'grab' : this.placing ? 'copy' : this.tool === 'select' ? 'default' : 'crosshair';
      if (d.type === 'box') {
        const x0 = Math.min(d.x0, d.x1) / GRID, x1 = Math.max(d.x0, d.x1) / GRID, y0 = Math.min(d.y0, d.y1) / GRID, y1 = Math.max(d.y0, d.y1) / GRID;
        if (x1 - x0 > 0.2 || y1 - y0 > 0.2) {
          const out = d.add ? [...this.sel] : [];
          for (const c of this.circuit.comps) if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) out.push({ kind: 'comp', id: c.id });
          for (const w of this.circuit.wires) if (w.x1 >= x0 && w.x1 <= x1 && w.x2 >= x0 && w.x2 <= x1 && w.y1 >= y0 && w.y1 <= y1 && w.y2 >= y0 && w.y2 <= y1) out.push({ kind: 'wire', id: w.id });
          this.select(out);
        }
      } else if (d.type === 'move' && d.moved) { this.commit(); }
      this.invalidate();
    }

    _dbl(e, p) {
      this._setMouse(p); const m = this.mouse;
      if (this.wireDraft) { this._finishWire(); return; }
      if (this.tool !== 'select') return;
      const c = this.hitComp(m.x, m.y);
      if (c) {
        if (c.type === 'SW') { c.params.closed = c.params.closed ? 0 : 1; this.commit(); this.emitSelect(); }
        else if (this.hooks.onEdit) this.hooks.onEdit(c);
      }
    }

    _key(e) {
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { this.spaceDown = true; if (this.wireDraft) { this.wireDraft.flip = !this.wireDraft.flip; this.invalidate(); } e.preventDefault(); return; }
      if (ctrl && k === 'z') { e.shiftKey ? this.redo() : this.undo(); e.preventDefault(); return; }
      if (ctrl && k === 'y') { this.redo(); e.preventDefault(); return; }
      if (ctrl && k === 'd') { this.duplicateSelection(); e.preventDefault(); return; }
      if (ctrl && k === 'a') { this.select([...this.circuit.comps.map((c) => ({ kind: 'comp', id: c.id })), ...this.circuit.wires.map((w) => ({ kind: 'wire', id: w.id }))]); e.preventDefault(); return; }
      if (ctrl) return;
      if (k === 'escape') { this.cancel(); this.select([]); return; }
      if (k === 'enter') {
        // back to the default arrow: stop placing / wiring / probing / panning
        e.preventDefault(); if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
        this.cancel(); this.setTool('select'); return;
      }
      if (k === 'delete' || k === 'backspace') { this.deleteSelection(); e.preventDefault(); return; }
      if (k === 'r') { this.rotateSelection(); return; }
      if (k === 'v') this.setTool('select');
      else if (k === 'w') this.setTool('wire');
      else if (k === 'p') this.setTool('probe');
      else if (k === 'h') this.setTool('pan');
      else if (k === '+' || k === '=') this.zoom(1.2);
      else if (k === '-' || k === '_') this.zoom(1 / 1.2);
      else if (k === 'f') this.fit();
      else {
        // quick part keys: the part's palette hotkey
        for (const d of Incog.registry.list()) if (d.hotkey && d.hotkey === k) { this.startPlace(d.type); return; }
      }
    }

    // ================================================================== wires
    _pinDir(x, y) {
      for (const c of this.circuit.comps) {
        const pts = this.circuit.pinPoints(c);
        for (let i = 0; i < pts.length; i++) if (pts[i].x === x && pts[i].y === y) { return Math.abs(pts[i].y - c.y) > Math.abs(pts[i].x - c.x); }
      }
      return false;
    }
    _startWire(x, y) { this.wireDraft = { pts: [{ x, y }], flip: this._pinDir(x, y) }; this.invalidate(); }
    _wireClick() {
      const m = this.mouse;
      if (!this.wireDraft) { this._startWire(m.gx, m.gy); return; }
      const last = this.wireDraft.pts[this.wireDraft.pts.length - 1];
      if (m.gx === last.x && m.gy === last.y) { this._finishWire(); return; }
      const segs = this._route(last, { x: m.gx, y: m.gy }, this.wireDraft.flip);
      for (const s of segs) this.circuit.addWire(s[0], s[1], s[2], s[3]);
      this.wireDraft.pts.push({ x: m.gx, y: m.gy });
      this.commit();
      const joined = this.pointOnConnectionExcludingNew(m.gx, m.gy);
      if (joined) this._finishWire(); else { this.wireDraft = { pts: [{ x: m.gx, y: m.gy }], flip: !this.wireDraft.flip }; }
      this.invalidate();
    }
    pointOnConnectionExcludingNew(gx, gy) {
      // true when the point touches a pin, another wire's end, or the middle of another wire (not just the one just drawn)
      let count = 0;
      for (const c of this.circuit.comps) for (const p of this.circuit.pinPoints(c)) if (p.x === gx && p.y === gy) count++;
      for (const w of this.circuit.wires) {
        if ((w.x1 === gx && w.y1 === gy) || (w.x2 === gx && w.y2 === gy)) count++;
        else if (Incog.onInterior(gx, gy, w)) count += 2;
      }
      return count >= 2;
    }
    _finishWire() { this.wireDraft = null; this.invalidate(); }
    _route(a, b, vertFirst) {
      if (a.x === b.x || a.y === b.y) return [[a.x, a.y, b.x, b.y]];
      const c = vertFirst ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
      return [[a.x, a.y, c.x, c.y], [c.x, c.y, b.x, b.y]];
    }

    _probeClick() {
      const m = this.mouse;
      const pin = this.hitPin(m.x, m.y);
      if (pin) { this.circuit.addNodeProbe(pin.x, pin.y); this.commit(); return; }
      const comp = this.hitComp(m.x, m.y);
      if (comp) { const def = Incog.registry.get(comp.type); if (!def.isGround) { this.circuit.addCompProbe(comp.id); this.commit(); return; } }
      const w = this.hitWire(m.x, m.y);
      if (w) {
        // put the flag exactly on the wire
        const gx = m.x / GRID, gy = m.y / GRID, dx = w.x2 - w.x1, dy = w.y2 - w.y1, L2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((gx - w.x1) * dx + (gy - w.y1) * dy) / L2));
        this.circuit.addNodeProbe(Math.round((w.x1 + t * dx) * 2) / 2, Math.round((w.y1 + t * dy) * 2) / 2, w.id); this.commit();
      }
    }

    // ================================================================ drawing
    _frame(t) {
      const dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
      const live = this.hooks.getLive ? this.hooks.getLive() : null;
      const animating = this.showFlow && live && live.sol;
      if (animating) this._advanceFlow(dt, live);
      if (this.dirty || animating) { this.dirty = false; this.render(live); }
    }

    _advanceFlow(dt, live) {
      const { nl, sol, mode } = live;
      let imax = 1e-12;
      const inst = new Map();
      const th = (live.animT || 0) * Math.PI * 2 * 0.6;
      for (const e of nl.elements) {
        if (e.nodes.length !== 2) continue;
        const r = sol.get(e.comp.id); if (!r) continue;
        const i = mode === 'ac' ? Cx.inst(r.i, -th) : r.i.re;
        inst.set(e.comp.id, i); imax = Math.max(imax, mode === 'ac' ? Cx.abs(r.i) : Math.abs(r.i.re));
      }
      live.animT = (live.animT || 0) + dt;
      this._imax = imax;
      for (const [id, i] of inst) {
        const v = (i / imax) * 60; // px / s at full scale
        this.flow.set(id, ((this.flow.get(id) || 0) + v * dt) % 960);
      }
      this._inst = inst;
    }

    _colorFor(nodeIndex, live) {
      if (!live || !live.sol || !this.showColors || nodeIndex < 0) return this.theme.wire;
      const v = live.sol.v(nodeIndex);
      const x = live.mode === 'ac' ? Cx.abs(v) : v.re;
      const { lo, hi } = live.range || { lo: 0, hi: 0 };
      if (hi - lo < 1e-12) return this.theme.wire;
      const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
      return `hsl(${Math.round(215 * (1 - t))},82%,${this.theme === THEMES.dark ? 62 : 46}%)`;
    }

    render(live) {
      const g = this.g, th = this.theme, c = this.circuit, v = this.view;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = th.bg; g.fillRect(0, 0, this.w, this.h);
      this._grid(g);
      g.save(); g.translate(v.x, v.y); g.scale(v.s, v.s);
      g.lineCap = 'round'; g.lineJoin = 'round';
      const nl = live && live.nl;

      // wires
      for (const w of c.wires) {
        const ni = nl ? nl.wireNode.get(w.id) : -1;
        const sel = this.isSel('wire', w.id);
        g.strokeStyle = sel ? th.sel : this._colorFor(ni === undefined ? -1 : ni, live);
        g.lineWidth = sel ? 3.4 : 2.4;
        g.beginPath(); g.moveTo(w.x1 * GRID, w.y1 * GRID); g.lineTo(w.x2 * GRID, w.y2 * GRID); g.stroke();
      }
      // junction dots
      const cnt = new Map();
      const bump = (x, y, n) => { const k = x + ',' + y; cnt.set(k, (cnt.get(k) || 0) + n); };
      for (const w of c.wires) { bump(w.x1, w.y1, 1); bump(w.x2, w.y2, 1); }
      for (const k of c.comps) for (const p of c.pinPoints(k)) bump(p.x, p.y, 1);
      for (const w of c.wires) for (const [k, n] of cnt) { const [x, y] = k.split(',').map(Number); if (Incog.onInterior(x, y, w)) cnt.set(k, n + 2); }
      g.fillStyle = th.wire;
      for (const [k, n] of cnt) if (n >= 3) { const [x, y] = k.split(',').map(Number); g.beginPath(); g.arc(x * GRID, y * GRID, 4, 0, 7); g.fill(); }
      // pins (hollow if unconnected)
      for (const k of c.comps) {
        const pts = c.pinPoints(k);
        pts.forEach((p) => {
          const n = cnt.get(p.x + ',' + p.y) || 0;
          g.beginPath(); g.arc(p.x * GRID, p.y * GRID, n > 1 ? 0.1 : 3.2, 0, 7);
          g.strokeStyle = th.label; g.lineWidth = 1.4; g.stroke();
        });
      }
      // parts
      for (const k of c.comps) this._drawComp(g, k, live);
      // node badges
      if (nl && this.showNodes) this._drawNodeBadges(g, live);
      // probes
      this._drawProbes(g, live);
      // draft wire
      if (this.wireDraft && this.mouse.inside) {
        const last = this.wireDraft.pts[this.wireDraft.pts.length - 1];
        const segs = this._route(last, { x: this.mouse.gx, y: this.mouse.gy }, this.wireDraft.flip);
        g.strokeStyle = th.sel; g.lineWidth = 2.2; g.setLineDash([6, 4]);
        for (const s of segs) { g.beginPath(); g.moveTo(s[0] * GRID, s[1] * GRID); g.lineTo(s[2] * GRID, s[3] * GRID); g.stroke(); }
        g.setLineDash([]);
        g.fillStyle = th.sel; g.beginPath(); g.arc(this.mouse.gx * GRID, this.mouse.gy * GRID, 3.5, 0, 7); g.fill();
      }
      // placing ghost
      if (this.placing && this.mouse.inside) {
        const def = Incog.registry.get(this.placing.type);
        g.save(); g.globalAlpha = 0.7; g.translate(this.mouse.gx * GRID, this.mouse.gy * GRID); g.rotate((this.placing.rot * Math.PI) / 2);
        g.strokeStyle = th.ghost; g.fillStyle = th.ghost; g.lineWidth = 2;
        def.draw(g, { params: Object.assign(Incog.registry.defaultParams(def), this.placing.params || {}), rot: this.placing.rot }, { stroke: th.ghost }); g.restore();
      }
      // box select
      const d = this.drag;
      if (d && d.type === 'box') {
        g.fillStyle = th.box; g.strokeStyle = th.sel; g.lineWidth = 1; g.setLineDash([4, 3]);
        g.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); g.strokeRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0); g.setLineDash([]);
      }
      // hover marker on the grid
      if (this.mouse.inside && (this.tool === 'wire' || this.placing)) {
        g.strokeStyle = th.sel; g.lineWidth = 1.2; g.beginPath(); g.arc(this.mouse.gx * GRID, this.mouse.gy * GRID, 5, 0, 7); g.stroke();
      }
      g.restore();
      this._tooltip(g, live);
      this._status(g);
    }

    _grid(g) {
      const th = this.theme, v = this.view, step = GRID * v.s;
      if (step < 6) return;
      const x0 = ((v.x % step) + step) % step, y0 = ((v.y % step) + step) % step;
      const gx0 = Math.round((x0 - v.x) / step), gy0 = Math.round((y0 - v.y) / step);
      g.fillStyle = th.dot;
      let ix = 0;
      for (let x = x0; x < this.w; x += step, ix++) {
        let iy = 0;
        for (let y = y0; y < this.h; y += step, iy++) {
          const major = ((gx0 + ix) % 5 === 0) && ((gy0 + iy) % 5 === 0);
          if (major) { g.fillStyle = th.dotMajor; g.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); g.fillStyle = th.dot; } else g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
        }
      }
    }

    _drawComp(g, k, live) {
      const th = this.theme, def = Incog.registry.get(k.type);
      const sel = this.isSel('comp', k.id);
      const col = { stroke: sel ? th.sel : th.stroke };
      g.save();
      g.translate(k.x * GRID, k.y * GRID); g.rotate((k.rot * Math.PI) / 2);
      g.strokeStyle = col.stroke; g.fillStyle = col.stroke; g.lineWidth = sel ? 2.8 : 2.2;
      if (sel) { g.shadowColor = th.sel; g.shadowBlur = 8; }
      if (def.glow && live && live.sol) {                       // a bulb lights up with its power
        const r = live.sol.get(k.id), lv = r ? def.glow(k, r) : 0;
        if (lv > 0.01) {
          const a = Math.min(1, lv), hot = lv > 1.25, rad = 20 + 34 * Math.min(lv, 1.6);
          const gr = g.createRadialGradient(0, 0, 4, 0, 0, rad);
          const c0 = hot ? '255,255,235' : '255,214,90';
          gr.addColorStop(0, 'rgba(' + c0 + ',' + (0.85 * a).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,190,60,0)');
          g.save(); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rad, 0, 7); g.fill();
          g.fillStyle = 'rgba(' + c0 + ',' + (0.25 + 0.65 * a).toFixed(2) + ')'; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill(); g.restore();
        }
      }
      def.draw(g, k, col);
      g.restore();

      // current flow dots on the 2-pin body
      if (live && live.sol && this.showFlow && !def.isGround && def.pins.length === 2) {
        const r = live.sol.get(k.id);
        if (r) {
          const mag = live.mode === 'ac' ? Cx.abs(r.i) : Math.abs(r.i.re);
          if (mag > 1e-12 && this._imax) {
            const a = Math.min(1, 0.25 + 0.75 * Math.sqrt(mag / this._imax));
            g.save(); g.translate(k.x * GRID, k.y * GRID); g.rotate((k.rot * Math.PI) / 2);
            g.fillStyle = th.flow; g.globalAlpha = a;
            const off = this.flow.get(k.id) || 0, spacing = 16, span = 80;
            for (let s = (off % spacing) - spacing; s < span; s += spacing) {   // dots move from pin a to pin b when I is positive
              let x = -40 + ((s % span) + span) % span;
              g.beginPath(); g.arc(x, 0, 2.4, 0, 7); g.fill();
            }
            g.restore();
          }
        }
      }

      // label + value (kept upright)
      if (def.isGround) return;
      const vertical = k.rot % 2 === 1;
      const lx = vertical ? k.x * GRID + 30 : k.x * GRID;
      const ly = vertical ? k.y * GRID - 6 : k.y * GRID - 26;
      g.save();
      g.font = '600 12px "Segoe UI",system-ui,sans-serif'; g.textBaseline = 'middle';
      g.textAlign = vertical ? 'left' : 'center';
      g.fillStyle = sel ? th.sel : th.label; g.fillText(k.label, lx, ly);
      if (this.showValues) {
        g.font = '11px "Segoe UI",system-ui,sans-serif'; g.fillStyle = th.value;
        g.fillText(def.text(k), lx, vertical ? ly + 14 : k.y * GRID + 24);
      }
      g.restore();
      if (k.off) void 0;
    }

    _drawNodeBadges(g, live) {
      const th = this.theme, nl = live.nl;
      g.save(); g.font = '700 11px "Segoe UI",system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const n of nl.nodes) {
        if (!n.anchor) continue;
        const x = n.anchor.x * GRID, y = n.anchor.y * GRID - (n.isGround ? -22 : 13);
        const w = Math.max(18, g.measureText(n.name).width + 10);
        g.fillStyle = th.nodeBg; g.strokeStyle = th.node; g.lineWidth = 1.2;
        this._round(g, x - w / 2, y - 9, w, 18, 9); g.fill(); g.stroke();
        g.fillStyle = th.node; g.fillText(n.name, x, y + 0.5);
      }
      g.restore();
    }
    _round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    _probeInfo(p, live) {
      if (!live || !live.sol) return null;
      const ac = live.mode === 'ac';
      if (p.kind === 'node') {
        const ni = p.wire ? live.nl.wireNode.get(p.wire) : live.nl.nodeAt(p.x, p.y);
        if (ni === undefined || ni < 0) return null;
        const n = live.nl.nodes[ni];
        return { title: 'Node ' + n.name, lines: ['V = ' + fmtValue(live.sol.v(ni), 'V', ac)] };
      }
      const e = live.nl.element(p.comp); if (!e) return null;
      const r = live.sol.get(e.comp.id);
      return { title: e.comp.label, lines: ['V = ' + fmtValue(r.v, 'V', ac), 'I = ' + fmtValue(r.i, 'A', ac), 'P = ' + fmtSI(r.p, 'W')] };
    }

    _drawProbes(g, live) {
      const th = this.theme;
      for (const p of this.circuit.probes) {
        const pos = this._probePos(p); if (!pos) continue;
        const x = pos.x * GRID, y = pos.y * GRID;
        const sel = this.isSel('probe', p.id);
        const info = this._probeInfo(p, live);
        // pin + flag
        g.strokeStyle = sel ? th.sel : th.probe; g.fillStyle = sel ? th.sel : th.probe; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y - 16); g.stroke();
        g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
        const lines = info ? [info.title, ...info.lines] : [p.kind === 'node' ? 'Probe' : 'Probe', 'press Run'];
        g.font = '600 11px "Cascadia Mono",Consolas,monospace';
        const w = Math.max(...lines.map((s) => g.measureText(s).width)) + 12, h = lines.length * 14 + 6;
        const bx = x + 10, by = y - 18 - h;
        g.fillStyle = th.tipBg; g.strokeStyle = sel ? th.sel : th.probe; g.lineWidth = 1.2;
        this._round(g, bx, by, w, h, 5); g.fill(); g.stroke();
        g.textAlign = 'left'; g.textBaseline = 'middle';
        lines.forEach((s, i) => { g.fillStyle = i === 0 ? th.probe : th.tipFg; g.fillText(s, bx + 6, by + 10 + i * 14); });
      }
    }

    _tooltip(g, live) {
      if (!this.mouse.inside || this.drag || this.placing || this.wireDraft || !live || !live.sol) return;
      const th = this.theme, m = this.mouse;
      let info = null;
      const comp = this.hitComp(m.x, m.y);
      if (comp) {
        const e = live.nl.element(comp.id);
        if (e) { const r = live.sol.get(comp.id), ac = live.mode === 'ac'; info = { title: comp.label + '  (' + Incog.registry.get(comp.type).name + ')', lines: ['V = ' + fmtValue(r.v, 'V', ac), 'I = ' + fmtValue(r.i, 'A', ac), 'P = ' + fmtSI(r.p, 'W')] }; }
      } else {
        const w = this.hitWire(m.x, m.y);
        if (w) { const ni = live.nl.wireNode.get(w.id); if (ni !== undefined && ni >= 0) info = { title: 'Node ' + live.nl.nodes[ni].name, lines: ['V = ' + fmtValue(live.sol.v(ni), 'V', live.mode === 'ac')] }; }
      }
      if (!info) return;
      g.save(); g.font = '600 11px "Cascadia Mono",Consolas,monospace';
      const lines = [info.title, ...info.lines];
      const w = Math.max(...lines.map((s) => g.measureText(s).width)) + 16, h = lines.length * 15 + 8;
      let x = m.sx + 16, y = m.sy + 16; if (x + w > this.w) x = m.sx - w - 10; if (y + h > this.h) y = m.sy - h - 10;
      g.fillStyle = th.tipBg; g.strokeStyle = th.label; g.lineWidth = 1; this._round(g, x, y, w, h, 6); g.fill(); g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'middle';
      lines.forEach((s, i) => { g.fillStyle = i === 0 ? th.node : th.tipFg; g.fillText(s, x + 8, y + 12 + i * 15); });
      g.restore();
    }

    _status(g) {
      g.save(); g.font = '11px "Segoe UI",system-ui,sans-serif'; g.fillStyle = this.theme.label; g.textAlign = 'right'; g.textBaseline = 'bottom';
      g.fillText(Math.round(this.view.s * 100) + '%', this.w - 10, this.h - 8); g.restore();
    }
  }

  Incog.Editor = Editor;
  Incog.THEMES = THEMES;
  Incog.GRID = GRID;
})(typeof window !== 'undefined' ? window : globalThis);
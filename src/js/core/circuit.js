/* ============================================================================
 * Incog Electric Lab - core/circuit.js
 * The circuit MODEL: parts, wires, probes. No drawing and no DOM in here.
 * Positions are integers in GRID units (1 grid = 20 px on screen at zoom 1).
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  function rotatePin(px, py, rot) {
    switch (((rot % 4) + 4) % 4) {
      case 0: return [px | 0, py | 0];
      case 1: return [(-py) | 0, px | 0];
      case 2: return [(-px) | 0, (-py) | 0];
      default: return [py | 0, (-px) | 0];
    }
  }

  class Circuit {
    constructor() { this.reset(); }

    reset() {
      this.comps = [];
      this.wires = [];
      this.probes = [];
      this.nodeNames = {}; // "compId:pinIndex" -> user chosen node name
      this.nextId = 1;
      this.title = 'Untitled circuit';
    }

    uid() { return this.nextId++; }

    // ---------------------------------------------------------- components
    freeLabel(prefix) {
      const used = new Set(this.comps.map((c) => c.label.toLowerCase()));
      let n = 1;
      while (used.has((prefix + n).toLowerCase())) n++;
      return prefix + n;
    }

    addComponent(type, x, y, rot = 0, params = null, label = null) {
      const def = Incog.registry.get(type);
      if (!def) throw new Error('Unknown component type: ' + type);
      const comp = {
        id: this.uid(), type, x: x | 0, y: y | 0, rot: ((rot % 4) + 4) % 4,
        label: label || (def.isGround ? 'GND' : this.freeLabel(def.prefix)),
        params: Object.assign(Incog.registry.defaultParams(def), params || {}),
      };
      this.comps.push(comp);
      return comp;
    }

    getComp(id) { return this.comps.find((c) => c.id === id) || null; }
    compByLabel(label) {
      const l = String(label).toLowerCase();
      return this.comps.find((c) => c.label.toLowerCase() === l) || null;
    }

    /** Make a label unique: "R1" taken -> "R1_2" */
    uniqueLabel(comp, wanted) {
      let base = String(wanted).trim().replace(/[^\w.\-]/g, '') || comp.label;
      let cand = base, n = 2;
      while (this.comps.some((c) => c !== comp && c.label.toLowerCase() === cand.toLowerCase())) cand = base + '_' + n++;
      return cand;
    }

    pinPoint(comp, i) {
      const def = Incog.registry.get(comp.type);
      const [dx, dy] = rotatePin(def.pins[i][0], def.pins[i][1], comp.rot);
      return { x: comp.x + dx, y: comp.y + dy };
    }
    pinPoints(comp) {
      const def = Incog.registry.get(comp.type);
      return def.pins.map((_, i) => this.pinPoint(comp, i));
    }

    removeComp(id) {
      this.comps = this.comps.filter((c) => c.id !== id);
      this.probes = this.probes.filter((p) => !(p.kind === 'comp' && p.comp === id));
      for (const k of Object.keys(this.nodeNames)) if (k.split(':')[0] === String(id)) delete this.nodeNames[k];
    }

    // --------------------------------------------------------------- wires
    addWire(x1, y1, x2, y2) {
      x1 |= 0; y1 |= 0; x2 |= 0; y2 |= 0;
      if (x1 === x2 && y1 === y2) return null;
      const dup = this.wires.find((w) =>
        (w.x1 === x1 && w.y1 === y1 && w.x2 === x2 && w.y2 === y2) ||
        (w.x1 === x2 && w.y1 === y2 && w.x2 === x1 && w.y2 === y1));
      if (dup) return dup;
      const w = { id: this.uid(), x1, y1, x2, y2 };
      this.wires.push(w);
      return w;
    }
    removeWire(id) {
      this.wires = this.wires.filter((w) => w.id !== id);
      this.probes = this.probes.filter((p) => p.wire !== id);
    }

    // -------------------------------------------------------------- probes
    addNodeProbe(x, y, wire = null) {
      const ex = this.probes.find((p) => p.kind === 'node' && p.x === x && p.y === y && (p.wire || null) === wire);
      if (ex) return ex;
      const p = { id: this.uid(), kind: 'node', x: x | 0, y: y | 0, wire };
      this.probes.push(p); return p;
    }
    addCompProbe(compId) {
      const ex = this.probes.find((p) => p.kind === 'comp' && p.comp === compId);
      if (ex) return ex;
      const p = { id: this.uid(), kind: 'comp', comp: compId };
      this.probes.push(p); return p;
    }
    removeProbe(id) { this.probes = this.probes.filter((p) => p.id !== id); }

    // ------------------------------------------------------------ save/load
    toJSON() {
      return {
        app: 'incog-electric-lab', version: 1, title: this.title, nextId: this.nextId,
        comps: this.comps.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y, rot: c.rot, label: c.label, params: { ...c.params } })),
        wires: this.wires.map((w) => ({ ...w })),
        probes: this.probes.map((p) => ({ ...p })),
        nodeNames: { ...this.nodeNames },
      };
    }
    serialize() { return JSON.stringify(this.toJSON()); }

    loadJSON(obj) {
      if (typeof obj === 'string') obj = JSON.parse(obj);
      this.reset();
      this.title = obj.title || 'Untitled circuit';
      const skipped = [];
      for (const c of obj.comps || []) {
        const def = Incog.registry.get(c.type);
        if (!def) { skipped.push(c.type); continue; }
        this.comps.push({
          id: c.id, type: c.type, x: c.x | 0, y: c.y | 0, rot: c.rot | 0, label: c.label || def.prefix,
          params: Object.assign(Incog.registry.defaultParams(def), c.params || {}),
        });
      }
      this.wires = (obj.wires || []).map((w) => ({ id: w.id, x1: w.x1 | 0, y1: w.y1 | 0, x2: w.x2 | 0, y2: w.y2 | 0 }));
      this.probes = (obj.probes || []).map((p) => ({ ...p }));
      this.nodeNames = { ...(obj.nodeNames || {}) };
      let maxId = 0;
      for (const l of [this.comps, this.wires, this.probes]) for (const o of l) maxId = Math.max(maxId, o.id || 0);
      this.nextId = Math.max(obj.nextId || 1, maxId + 1);
      return skipped;
    }

    /** Convenience used by examples and tests. */
    static fromJSON(obj) { const c = new Circuit(); c.loadJSON(obj); return c; }
  }

  Incog.Circuit = Circuit;
  Incog.rotatePin = rotatePin;
})(typeof window !== 'undefined' ? window : globalThis);

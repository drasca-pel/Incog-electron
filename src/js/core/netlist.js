/* ============================================================================
 * Incog Electric Lab - core/netlist.js
 * Turns the drawn circuit (parts + wire segments) into electrical NODES.
 *
 * Connection rules (what "joined" means):
 *   - the two ends of one wire segment are the same node
 *   - a wire end or a part pin sitting on the same grid point as another end/pin is joined
 *   - a wire end or a pin that lies on the middle of another wire is joined (T-junction)
 *   - two wires that merely cross are NOT joined
 *   - every GND symbol is the same node (node "0")
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  const key = (x, y) => x + ',' + y;

  function onInterior(px, py, w) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    if ((px === w.x1 && py === w.y1) || (px === w.x2 && py === w.y2)) return false;
    if (dx * (py - w.y1) - dy * (px - w.x1) !== 0) return false;
    return px >= Math.min(w.x1, w.x2) && px <= Math.max(w.x1, w.x2) &&
           py >= Math.min(w.y1, w.y2) && py <= Math.max(w.y1, w.y2);
  }

  function* nameGenerator() {
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; ; r++) for (const c of L) yield r === 0 ? c : c + r;
  }

  /** numeric parameter values for a component (falls back to the default when blank/invalid) */
  function numericParams(comp, def) {
    const p = {};
    for (const k of Object.keys(def.params)) {
      let v = comp.params[k];
      if (typeof v === 'string') v = Incog.util.parseSI(v);
      if (typeof v !== 'number' || Number.isNaN(v)) v = def.params[k].default;
      p[k] = v;
    }
    return p;
  }

  function buildNetlist(circuit) {
    const reg = Incog.registry;
    const parent = new Map();
    const add = (k) => { if (!parent.has(k)) parent.set(k, k); return k; };
    const find = (k) => {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      let c = k;
      while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
      return r;
    };
    const union = (a, b) => { a = find(add(a)); b = find(add(b)); if (a !== b) parent.set(a, b); };

    const wires = circuit.wires;
    const wireEnds = new Map(); // key -> count of wire ends
    for (const w of wires) {
      const a = key(w.x1, w.y1), b = key(w.x2, w.y2);
      union(a, b);
      wireEnds.set(a, (wireEnds.get(a) || 0) + 1);
      wireEnds.set(b, (wireEnds.get(b) || 0) + 1);
    }
    for (const w of wires) {
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        for (const o of wires) if (o !== w && onInterior(x, y, o)) union(key(x, y), key(o.x1, o.y1));
      }
    }

    const pinKeys = new Map(); // comp.id -> [key per pin]
    const gndKeys = [];
    for (const c of circuit.comps) {
      const def = reg.get(c.type);
      const ks = circuit.pinPoints(c).map((pt) => {
        const k = add(key(pt.x, pt.y));
        for (const o of wires) if (onInterior(pt.x, pt.y, o)) union(k, key(o.x1, o.y1));
        return k;
      });
      pinKeys.set(c.id, ks);
      if (def.isGround) gndKeys.push(...ks);
    }
    for (let i = 1; i < gndKeys.length; i++) union(gndKeys[0], gndKeys[i]);

    const warnings = [];
    const parts = circuit.comps.filter((c) => !reg.get(c.type).isGround);

    // choose the ground root
    let groundRoot = gndKeys.length ? find(gndKeys[0]) : null;
    let autoGround = false;
    if (groundRoot === null && parts.length) {
      const vs = parts.find((c) => reg.get(c.type).srcKind === 'V' && !reg.get(c.type).dependent);
      const refComp = vs || parts[0];
      const refPin = vs ? 1 : 0;
      groundRoot = find(pinKeys.get(refComp.id)[refPin]);
      autoGround = true;
      warnings.push({ type: 'noground', text: 'No ground symbol placed. Using the − terminal of ' + refComp.label + ' as 0 V. Add a GND part to choose the reference yourself.' });
    }

    // nodes
    const nodes = [{ index: 0, name: '0', isGround: true, pins: [], anchor: null }];
    const rootIndex = new Map();
    if (groundRoot !== null) rootIndex.set(groundRoot, 0);
    const pinCount = new Map();
    for (const c of parts) for (const k of pinKeys.get(c.id)) pinCount.set(find(k), (pinCount.get(find(k)) || 0) + 1);

    const elements = [];
    for (const c of parts) {
      const def = reg.get(c.type);
      const idxs = pinKeys.get(c.id).map((k, pin) => {
        const r = find(k);
        if (!rootIndex.has(r)) {
          rootIndex.set(r, nodes.length);
          nodes.push({ index: nodes.length, name: null, isGround: false, pins: [], anchor: null });
        }
        const n = nodes[rootIndex.get(r)];
        n.pins.push({ comp: c, pin });
        if (!n.anchor) n.anchor = circuit.pinPoint(c, pin);
        return rootIndex.get(r);
      });
      elements.push({ comp: c, def, nodes: idxs, p: numericParams(c, def) });
      // dangling pins
      pinKeys.get(c.id).forEach((k, pin) => {
        const r = find(k);
        if (pinCount.get(r) === 1 && !(wireEnds.get(k) > 0) && r !== groundRoot && !hasWireInRoot(r)) {
          warnings.push({ type: 'dangling', text: c.label + ' pin ' + (def.pinNames ? def.pinNames[pin] : pin + 1) + ' is not connected to anything.', comp: c.id });
        }
      });
    }
    function hasWireInRoot(r) {
      for (const w of wires) if (find(key(w.x1, w.y1)) === r) return true;
      return false;
    }

    // names: user aliases first, then A, B, C ...
    const used = new Set(['0']);
    for (const n of nodes) {
      if (n.isGround) continue;
      for (const p of n.pins) {
        const a = circuit.nodeNames[p.comp.id + ':' + p.pin];
        if (a && !used.has(a)) { n.name = a; used.add(a); break; }
      }
    }
    const gen = nameGenerator();
    for (const n of nodes) {
      if (n.isGround || n.name) continue;
      let nm;
      do { nm = gen.next().value; } while (used.has(nm));
      n.name = nm; used.add(nm);
    }

    // anchors: middle of the longest wire in the node, else a pin
    const pointNode = new Map();
    for (const k of parent.keys()) { const r = find(k); if (rootIndex.has(r)) pointNode.set(k, rootIndex.get(r)); }
    const wireNode = new Map();
    const best = new Map();
    for (const w of wires) {
      const ni = pointNode.get(key(w.x1, w.y1));
      wireNode.set(w.id, ni === undefined ? -1 : ni);
      if (ni === undefined) continue;
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (!best.has(ni) || len > best.get(ni).len) best.set(ni, { len, x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
    }
    for (const n of nodes) {
      if (best.has(n.index) && !n.isGround) n.anchor = { x: best.get(n.index).x, y: best.get(n.index).y };
    }

    const byName = new Map(nodes.map((n) => [n.name.toLowerCase(), n]));
    return {
      nodes, elements, warnings, autoGround, pointNode, wireNode,
      hasSources: elements.some((e) => e.def.isSource),
      nodeAt: (x, y) => (pointNode.has(key(x, y)) ? pointNode.get(key(x, y)) : -1),
      nodeByName: (nm) => byName.get(String(nm).toLowerCase()) || null,
      element: (id) => elements.find((e) => e.comp.id === id) || null,
      elementByLabel: (l) => elements.find((e) => e.comp.label.toLowerCase() === String(l).toLowerCase()) || null,
    };
  }

  Incog.buildNetlist = buildNetlist;
  Incog.pointKey = key;
  Incog.onInterior = onInterior;
})(typeof window !== 'undefined' ? window : globalThis);

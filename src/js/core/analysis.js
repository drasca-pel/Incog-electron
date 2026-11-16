/* ============================================================================
 * Incog Electric Lab - core/analysis.js
 * Everything that turns a Solution into ANSWERS:
 *   listQuantities()  the searchable list  V(A)  V(R1)  I(R1)  P(R1) ...
 *   evaluate()        small expression language:  V(A)-V(B)   I(R1)+I(R2)   mag(V(C))/mag(I(R1))
 *   kclTable()        current balance at every node (proof the answers are right)
 *   powerBalance()    Tellegen's theorem: Σ power = 0
 *   nodalEquations()  the equations the solver actually solved, written out with your labels
 *   variant()/thevenin()  circuit surgery used by the network theorems
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { Cx } = Incog;
  const { fmtSI, fmtComplex } = Incog.util;

  // ============================================================ quantities
  function listQuantities(nl, mode) {
    const out = [];
    for (const n of nl.nodes) {
      if (n.isGround) continue;
      out.push({
        key: `V(${n.name})`, kind: 'V', group: 'Node voltages', unit: 'V', node: n.index,
        desc: `Voltage at node ${n.name} (measured from ground)`,
        eval: (sol) => sol.v(n.index),
      });
    }
    for (const e of nl.elements) {
      const id = e.comp.id, L = e.comp.label, pn = e.def.pinNames || ['a', 'b'];
      out.push({
        key: `V(${L})`, kind: 'V', group: 'Component voltages', unit: 'V', comp: id,
        desc: `Voltage across ${L}  (pin ${pn[0]} − pin ${pn[1]})`, eval: (sol) => sol.get(id).v,
      });
      out.push({
        key: `I(${L})`, kind: 'I', group: 'Component currents', unit: 'A', comp: id,
        desc: `Current through ${L}, flowing from pin ${pn[0]} to pin ${pn[1]}`, eval: (sol) => sol.get(id).i,
      });
      const src = e.def.isSource;
      out.push({
        key: `P(${L})`, kind: 'P', group: 'Power', unit: 'W', comp: id,
        desc: src ? `Power absorbed by ${L} (negative = it is delivering power)` : `Power absorbed (dissipated or stored) by ${L}`,
        eval: (sol) => ({ re: sol.get(id).p, im: 0 }),
      });
      if (mode === 'ac') {
        out.push({
          key: `Q(${L})`, kind: 'Q', group: 'Power', unit: 'VAR', comp: id,
          desc: `Reactive power of ${L} (positive = inductive, negative = capacitive)`, eval: (sol) => ({ re: sol.get(id).q, im: 0 }),
        });
      }
    }
    return out;
  }

  // ====================================================== expression engine
  function tokenize(src) {
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)(meg|[fpnumkKMGT](?![A-Za-z0-9_]))?|([A-Za-z_][\w.]*)|([-+*/^(),]))/y;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < src.length) {
      const before = re.lastIndex;
      m = re.exec(src);
      if (!m) {
        if (/^\s*$/.test(src.slice(before))) break;
        throw new Error('Unexpected character near “' + src.slice(before).trim().slice(0, 8) + '”');
      }
      if (m[1] !== undefined) {
        let v = parseFloat(m[1]);
        if (m[2]) v *= /^meg$/i.test(m[2]) ? 1e6 : { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2]];
        toks.push({ type: 'num', v, raw: m[0].trim() });
      } else if (m[3] !== undefined) toks.push({ type: 'id', v: m[3], raw: m[3] });
      else toks.push({ type: 'op', v: m[4], raw: m[4] });
    }
    return toks;
  }

  function cpow(a, b) {
    if (b.im === 0 && Number.isInteger(b.re) && Math.abs(b.re) <= 16) {
      let r = { re: 1, im: 0 };
      for (let i = 0; i < Math.abs(b.re); i++) r = Cx.mul(r, a);
      return b.re < 0 ? Cx.div({ re: 1, im: 0 }, r) : r;
    }
    const m = Cx.abs(a), th = Cx.arg(a);
    return Cx.fromPolar(Math.pow(m, b.re), th * b.re);
  }

  /** evaluate("V(A)-V(B)", nl, sol) -> complex.  Throws Error with a readable message. */
  function evaluate(expr, nl, sol) {
    const tok = tokenize(expr);
    if (!tok.length) throw new Error('Empty expression');
    let pos = 0;
    const peek = () => tok[pos];
    const next = () => tok[pos++];
    const isOp = (v) => peek() && peek().type === 'op' && peek().v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error('Expected “' + v + '”'); pos++; };

    const lookupComp = (name) => nl.elementByLabel(name);
    const quantity = (fn, name) => {
      const e = lookupComp(name);
      if (fn === 'v') {
        if (e) return sol.get(e.comp.id).v;
        const n = nl.nodeByName(name);
        if (n) return sol.v(n.index);
        throw new Error('Unknown node or part “' + name + '”');
      }
      if (!e) throw new Error(fn.toUpperCase() + '() needs a part label such as R1, not “' + name + '”');
      const r = sol.get(e.comp.id);
      if (fn === 'i') return r.i;
      if (fn === 'p') return { re: r.p, im: 0 };
      return { re: r.q, im: 0 };
    };
    const funcs = {
      mag: (a) => ({ re: Cx.abs(a), im: 0 }), abs: (a) => ({ re: Cx.abs(a), im: 0 }),
      phase: (a) => ({ re: (Cx.arg(a) * 180) / Math.PI, im: 0 }), arg: (a) => ({ re: (Cx.arg(a) * 180) / Math.PI, im: 0 }),
      re: (a) => ({ re: a.re, im: 0 }), im: (a) => ({ re: a.im, im: 0 }), conj: (a) => Cx.conj(a),
      db: (a) => ({ re: 20 * Math.log10(Cx.abs(a)), im: 0 }),
      sqrt: (a) => Cx.fromPolar(Math.sqrt(Cx.abs(a)), Cx.arg(a) / 2),
    };

    function parseExpr() {
      let a = parseTerm();
      while (isOp('+') || isOp('-')) { const op = next().v; const b = parseTerm(); a = op === '+' ? Cx.add(a, b) : Cx.sub(a, b); }
      return a;
    }
    function parseTerm() {
      let a = parseUnary();
      while (isOp('*') || isOp('/')) { const op = next().v; const b = parseUnary(); a = op === '*' ? Cx.mul(a, b) : Cx.div(a, b); }
      return a;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return Cx.neg(parseUnary()); }
      if (isOp('+')) { next(); return parseUnary(); }
      return parsePow();
    }
    function parsePow() {
      const base = parsePrimary();
      if (isOp('^')) { next(); return cpow(base, parseUnary()); }
      return base;
    }
    function parsePrimary() {
      const t = next();
      if (!t) throw new Error('The expression ends too early');
      if (t.type === 'num') return { re: t.v, im: 0 };
      if (t.type === 'op' && t.v === '(') { const v = parseExpr(); expect(')'); return v; }
      if (t.type === 'id') {
        const name = t.v.toLowerCase();
        if (name === 'j') return { re: 0, im: 1 };
        if (name === 'pi') return { re: Math.PI, im: 0 };
        if (!isOp('(')) throw new Error('Unknown word “' + t.v + '” (use V(..), I(..), P(..))');
        next();
        if (name === 'v' || name === 'i' || name === 'p' || name === 'q') {
          let arg = '';
          while (peek() && !isOp(')')) arg += next().raw;
          expect(')');
          return quantity(name, arg);
        }
        if (funcs[name]) { const a = parseExpr(); expect(')'); return funcs[name](a); }
        throw new Error('Unknown function “' + t.v + '”');
      }
      throw new Error('Unexpected “' + t.raw + '”');
    }
    const out = parseExpr();
    if (pos < tok.length) throw new Error('Unexpected “' + tok[pos].raw + '”');
    return out;
  }

  /** true if the search box text looks like a formula rather than a plain filter */
  function looksLikeExpression(s) {
    return /[+\-*/^]/.test(s.replace(/^\s*[-+]/, '')) || /^\s*(mag|abs|phase|arg|re|im|conj|db|sqrt)\s*\(/i.test(s) ||
      /^\s*[VIPQ]\s*\(([^)]*)\)\s*$/i.test(s) && false;
  }

  // ================================================================ checks
  /** Current balance at every non-ground node. Currents are "leaving the node". */
  function kclTable(nl, sol) {
    const rows = [];
    for (const n of nl.nodes) {
      if (n.isGround) continue;
      const terms = [];
      let sum = Cx.ZERO;
      for (const e of nl.elements) {
        const r = sol.get(e.comp.id);
        e.nodes.slice(0, 2).forEach((ni, pi) => {
          if (ni !== n.index) return;
          const leaving = pi === 0 ? r.i : Cx.neg(r.i);
          terms.push({ label: e.comp.label, z: leaving });
          sum = Cx.add(sum, leaving);
        });
      }
      rows.push({ node: n, terms, sum });
    }
    return rows;
  }

  function powerBalance(nl, sol) {
    const rows = [];
    let P = 0, Q = 0, delivered = 0, absorbed = 0;
    for (const e of nl.elements) {
      const r = sol.get(e.comp.id);
      rows.push({ label: e.comp.label, p: r.p, q: r.q, source: !!e.def.isSource });
      P += r.p; Q += r.q;
      if (r.p < 0) delivered -= r.p; else absorbed += r.p;
    }
    return { rows, P, Q, delivered, absorbed };
  }

  // ================================================== nodal equations text
  function nodalEquations(nl, sol, mode) {
    const ac = mode === 'ac';
    const vn = (i) => (i === 0 ? '0' : 'V' + nl.nodes[i].name);
    const diff = (a, b) => (b === 0 ? vn(a) : a === 0 ? '−' + vn(b) : `(${vn(a)} − ${vn(b)})`);
    const out = [];
    const branchSources = [];
    for (const n of nl.nodes) {
      if (n.isGround) continue;
      const terms = [];
      for (const e of nl.elements) {
        const L = e.comp.label, t = e.comp.type;
        e.nodes.slice(0, 2).forEach((ni, pi) => {
          if (ni !== n.index) return;
          const sign = pi === 0 ? '+' : '−';
          const other = e.nodes[pi === 0 ? 1 : 0];
          if (t === 'R') terms.push(`${diff(n.index, other)}/${L}`);
          else if (t === 'C') { if (ac) terms.push(`jω${L}·${diff(n.index, other)}`); }
          else if (t === 'L' && ac) terms.push(`${diff(n.index, other)}/(jω${L})`);
          else if (t === 'Idc' || t === 'Iac') terms.push(`${sign}${L}`);
          else if (t === 'VCCS' && pi < 2) terms.push(`${sign}${L}·(${vn(e.nodes[2])} − ${vn(e.nodes[3])})`);
          else if (t === 'SW' && !e.p.closed) { /* open switch: no current */ }
          else terms.push(`${sign}I(${L})`);
        });
      }
      const nums = nl.nodes.filter((x) => !x.isGround).map((x) => `V${x.name} = ${fmtVal(sol.v(x.index), 'V', ac)}`);
      out.push({ node: n, text: terms.length ? terms.join(' + ').replace(/\+ −/g, '− ').replace(/\+ \+/g, '+ ') + ' = 0' : '(nothing attached)' });
      void nums;
    }
    const cons = [];
    for (const e of nl.elements) {
      const L = e.comp.label, t = e.comp.type, r = sol.get(e.comp.id);
      const lhs = diff(e.nodes[0], e.nodes[1]);
      if (t === 'Vdc') cons.push(`${lhs} = ${ac ? '0  (DC source is off in AC)' : fmtSI(e.p.value, 'V')}   [${L}]`);
      else if (t === 'Vac') cons.push(`${lhs} = ${ac ? fmtComplex(Cx.fromPolar(e.p.amp, (e.p.phase * Math.PI) / 180), 'V') : fmtSI(e.p.offset, 'V')}   [${L}]`);
      else if (t === 'Vpulse') cons.push(`${lhs} = v(t)   [${L}]`);
      else if (t === 'L') cons.push(ac ? `${lhs} = jω${L}·I(${L})   [${L}]` : `${lhs} = 0   (inductor is a short in DC)   [${L}]`);
      else if (t === 'SW' && e.p.closed) cons.push(`${lhs} = 0   (switch closed)   [${L}]`);
      else if (t === 'VCVS') cons.push(`${lhs} = ${fmtSI(e.p.gain, '')}·(${vn(e.nodes[2])} − ${vn(e.nodes[3])})   [${L}]`);
      void r;
    }
    return { nodeEquations: out, constraints: cons };
  }
  function fmtVal(z, unit, ac) { return ac ? fmtComplex(z, unit) : fmtSI(z.re, unit); }

  // ======================================================== circuit surgery
  const isIndependent = (e) => e.def.isSource && !e.def.dependent;

  /** copy of the netlist with some parts removed / sources switched off / extra parts added.
   *  off: 'all' | 'none' | Set(ids of sources to switch OFF)  |  only: id of the ONE independent source to keep ON */
  function variant(nl, o = {}) {
    const remove = new Set(o.remove || []);
    const elements = [];
    for (const e of nl.elements) {
      if (remove.has(e.comp.id)) continue;
      let off = false;
      if (isIndependent(e)) {
        if (o.off === 'all') off = true;
        else if (o.off instanceof Set && o.off.has(e.comp.id)) off = true;
        else if (o.only !== undefined && o.only !== null && e.comp.id !== o.only) off = true;
      }
      elements.push(off ? { ...e, comp: { ...e.comp, off: true } } : e);
    }
    for (const a of o.add || []) elements.push(a);
    return { ...nl, elements };
  }

  const testCurrent = (mode, freq, a, b) => {
    const reg = Incog.registry;
    return mode === 'ac'
      ? { comp: { id: '__test', type: 'Iac', label: 'Itest', params: {} }, def: reg.get('Iac'), nodes: [b, a], p: { amp: 1, freq, phase: 0, offset: 0 } }
      : { comp: { id: '__test', type: 'Idc', label: 'Itest', params: {} }, def: reg.get('Idc'), nodes: [b, a], p: { value: 1 } };
  };
  const shortElement = (a, b) => ({ comp: { id: '__short', type: 'Vdc', label: 'short', params: {} }, def: Incog.registry.get('Vdc'), nodes: [a, b], p: { value: 0 } });

  /** Thevenin / Norton equivalent seen by port (a, b).  `remove` = ids of parts that form the load. */
  function thevenin(nl, a, b, o) {
    const { mode, freq } = o;
    const remove = o.remove || [];
    const res = { a, b, mode };
    const oc = Incog.solve(variant(nl, { remove }), { mode, freq });
    res.Vth = Cx.sub(oc.v(a), oc.v(b));
    try {
      const dead = Incog.solve(variant(nl, { remove, off: 'all', add: [testCurrent(mode, freq, a, b)] }), { mode, freq });
      res.Zth = Cx.sub(dead.v(a), dead.v(b));
    } catch (e) { res.Zth = { re: Infinity, im: 0 }; }
    try {
      const sh = Incog.solve(variant(nl, { remove, add: [shortElement(a, b)] }), { mode, freq });
      res.Isc = sh.get('__short').i;
    } catch (e) { res.Isc = null; }
    return res;
  }

  /** impedance of a simple R / C / L load at the analysis frequency (null if not a simple load) */
  function loadImpedance(e, mode, freq) {
    const w = 2 * Math.PI * freq;
    if (e.comp.type === 'R') return { re: e.p.value, im: 0 };
    if (mode === 'ac') {
      if (e.comp.type === 'C') return { re: 0, im: -1 / (w * e.p.value) };
      if (e.comp.type === 'L') return { re: 0, im: w * e.p.value };
    } else {
      if (e.comp.type === 'C') return { re: Infinity, im: 0 };
      if (e.comp.type === 'L') return { re: 0, im: 0 };
    }
    return null;
  }

  Incog.analysis = {
    listQuantities, evaluate, looksLikeExpression, kclTable, powerBalance, nodalEquations,
    variant, thevenin, loadImpedance, isIndependent, testCurrent, shortElement,
  };
})(typeof window !== 'undefined' ? window : globalThis);

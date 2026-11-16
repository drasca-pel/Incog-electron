/* ============================================================================
 * Incog Electric Lab - core/solver.js
 * Modified Nodal Analysis (MNA) for three analyses:
 *    'dc'   operating point   (C open, L short, AC sources off)
 *    'ac'   sinusoidal steady state at one frequency (complex phasors, peak values)
 *    'tran' time stepping (trapezoidal rule, backward-Euler on the first step)
 * All three share the same component stamps (see components.js).
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { Cx } = Incog;

  const GMIN = 1e-12; // tiny conductance from every node to ground keeps floating nodes solvable

  /** What a component's stamp() talks to. Collects matrix entries. */
  class Stamper {
    constructor(N, o) {
      this.N = N;
      this.mode = o.mode || 'dc';
      this.freq = o.freq || 0;
      this.omega = 2 * Math.PI * (o.freq || 0);
      this.t = o.t || 0;
      this.dt = o.dt || 0;
      this.method = o.method || 'tr';
      this.sweep = !!o.sweep; // AC sweep: every AC source acts at the swept frequency
      this.state = o.state || new Map();
      this.entries = []; // r, c, re, im ...
      this.rhsE = [];    // r, re, im ...
      this.K = 0;        // number of extra (branch-current) unknowns
    }
    /** matrix entry; r/c are unknown indices (node n -> n-1, ground -> -1 is ignored) */
    add(r, c, re, im = 0) { if (r < 0 || c < 0) return; this.entries.push(r, c, re, im); }
    rhs(r, re, im = 0) { if (r < 0) return; this.rhsE.push(r, re, im); }
    /** admittance Y between nodes n1 and n2 */
    Y(n1, n2, re, im = 0) {
      const a = n1 - 1, b = n2 - 1;
      this.add(a, a, re, im); this.add(b, b, re, im); this.add(a, b, -re, -im); this.add(b, a, -re, -im);
    }
    /** current source: i flows THROUGH the element from n1 to n2 */
    I(n1, n2, re, im = 0) { this.rhs(n1 - 1, -re, -im); this.rhs(n2 - 1, re, im); }
    /** branch with  V(n1) - V(n2) - Z*i = v .  Returns the unknown index of the branch current (n1 -> n2). */
    V(n1, n2, vr, vi = 0, zr = 0, zi = 0) {
      const k = this.N - 1 + this.K++;
      const a = n1 - 1, b = n2 - 1;
      this.add(a, k, 1); this.add(b, k, -1); this.add(k, a, 1); this.add(k, b, -1);
      if (zr || zi) this.add(k, k, -zr, -zi);
      this.rhs(k, vr, vi);
      return k;
    }
  }

  class Solution {
    constructor(nl, mode, opts, xr, xi, results, handles) {
      this.nl = nl; this.mode = mode; this.opts = opts;
      this.xr = xr; this.xi = xi; this.results = results; this.handles = handles;
      this.t = opts.t || 0; this.freq = opts.freq || 0; this.omega = 2 * Math.PI * (opts.freq || 0);
    }
    /** complex voltage of node index n (ground = 0) */
    v(n) { return n <= 0 ? Cx.ZERO : { re: this.xr[n - 1], im: this.xi[n - 1] }; }
    u(i) { return { re: this.xr[i], im: this.xi[i] }; }
    /** { v: voltage a→b, i: current a→b, s: complex power absorbed } for a component id */
    get(id) { return this.results.get(id) || null; }
    nodeV(name) { const n = this.nl.nodeByName(name); return n ? this.v(n.index) : null; }
  }

  function solve(nl, opts = {}) {
    const mode = opts.mode || 'dc';
    const N = nl.nodes.length;
    const st = new Stamper(N, { ...opts, mode });
    const handles = new Map();
    for (const e of nl.elements) {
      const h = e.def.stamp(st, e.comp, e.nodes, e.p, e);
      if (h) handles.set(e.comp.id, h);
    }
    for (let n = 1; n < N; n++) st.Y(n, 0, GMIN, 0);

    const M = N - 1 + st.K;
    let xr = new Float64Array(0), xi = new Float64Array(0);
    if (M > 0) {
      const Ar = new Float64Array(M * M), Ai = new Float64Array(M * M);
      const br = new Float64Array(M), bi = new Float64Array(M);
      const E = st.entries;
      for (let q = 0; q < E.length; q += 4) { Ar[E[q] * M + E[q + 1]] += E[q + 2]; Ai[E[q] * M + E[q + 1]] += E[q + 3]; }
      const R = st.rhsE;
      for (let q = 0; q < R.length; q += 3) { br[R[q]] += R[q + 1]; bi[R[q]] += R[q + 2]; }
      const sol = Incog.linalg.solveDense(M, Ar, Ai, br, bi);
      xr = sol.xr; xi = sol.xi;
      let big = 0;
      for (let i = 0; i < M; i++) {
        if (!Number.isFinite(xr[i]) || !Number.isFinite(xi[i])) throw new Incog.linalg.SingularError(i);
        big = Math.max(big, Math.abs(xr[i]), Math.abs(xi[i]));
      }
      if (big > 1e11) {
        const err = new Error('The circuit is ill-conditioned (values blow up). Check for a floating section, a current source with no path, or a source loop.');
        err.name = 'IllConditioned';
        throw err;
      }
    }

    const x = {
      v: (n) => (n <= 0 ? Cx.ZERO : { re: xr[n - 1], im: xi[n - 1] }),
      u: (i) => ({ re: xr[i], im: xi[i] }),
    };
    const results = new Map();
    const half = mode === 'ac' ? 0.5 : 1; // peak phasors: S = V·I*/2
    for (const e of nl.elements) {
      const h = handles.get(e.comp.id);
      const v = e.nodes.length >= 2 ? Cx.sub(x.v(e.nodes[0]), x.v(e.nodes[1])) : Cx.ZERO;
      const i = h && h.i ? h.i(x) : Cx.ZERO;
      const s = Cx.scale(Cx.mul(v, Cx.conj(i)), half);
      results.set(e.comp.id, { v, i, s, p: s.re, q: s.im });
    }
    if (mode === 'tran') for (const h of handles.values()) if (h.commit) h.commit(x);
    return new Solution(nl, mode, { ...opts, mode }, xr, xi, results, handles);
  }

  /** Time-stepping simulator that keeps capacitor / inductor state between steps. */
  class TransientSim {
    constructor(nl, o = {}) {
      this.nl = nl;
      this.dt = o.dt || 1e-5;
      this.method = o.method || 'tr';
      this.state = new Map();
      this.t = 0;
      this.steps = 0;
      this.forceEuler = 1;
      this.initState();
    }
    initState() {
      for (const e of this.nl.elements) {
        if (e.comp.type === 'C') this.state.set(e.comp.id, { v: e.p.ic || 0, i: 0 });
        else if (e.comp.type === 'L') this.state.set(e.comp.id, { v: 0, i: e.p.ic || 0 });
      }
    }
    /** the circuit was edited while running: keep state of parts that still exist */
    setNetlist(nl) {
      this.nl = nl;
      for (const e of nl.elements) {
        if (!this.state.has(e.comp.id)) {
          if (e.comp.type === 'C') this.state.set(e.comp.id, { v: e.p.ic || 0, i: 0 });
          else if (e.comp.type === 'L') this.state.set(e.comp.id, { v: 0, i: e.p.ic || 0 });
        }
      }
      this.forceEuler = 1;
    }
    step() {
      this.t += this.dt;
      const be = this.method === 'be' || this.forceEuler > 0;
      const sol = solve(this.nl, { mode: 'tran', t: this.t, dt: this.dt, method: be ? 'be' : 'tr', state: this.state });
      if (this.forceEuler > 0) this.forceEuler--;
      this.steps++;
      return sol;
    }
  }

  /** Suggest a sensible time step and window for a transient run. */
  function suggestTiming(nl) {
    let tauMin = Infinity, tauMax = 0, fMax = 0, fMin = Infinity;
    const R = [], C = [], L = [];
    for (const e of nl.elements) {
      if (e.comp.type === 'R') R.push(e.p.value);
      if (e.comp.type === 'C') C.push(e.p.value);
      if (e.comp.type === 'L') L.push(e.p.value);
      if ((e.comp.type === 'Vac' || e.comp.type === 'Iac') && e.p.freq > 0) { fMax = Math.max(fMax, e.p.freq); fMin = Math.min(fMin, e.p.freq); }
      if (e.comp.type === 'Vpulse') {
        const w = Math.min(e.p.width || Infinity, e.p.period > 0 ? e.p.period : Infinity);
        if (isFinite(w) && w > 0) { fMax = Math.max(fMax, 1 / w); fMin = Math.min(fMin, 1 / (e.p.period > 0 ? e.p.period : w * 2)); }
      }
    }
    if (R.length && C.length) { tauMin = Math.min(tauMin, Math.min(...C) * Math.min(...R)); tauMax = Math.max(tauMax, Math.max(...C) * Math.max(...R)); }
    if (R.length && L.length) { tauMin = Math.min(tauMin, Math.min(...L) / Math.max(...R)); tauMax = Math.max(tauMax, Math.max(...L) / Math.min(...R)); }
    if (L.length && C.length) { const w0 = Math.sqrt(Math.min(...L) * Math.min(...C)); tauMin = Math.min(tauMin, w0); tauMax = Math.max(tauMax, Math.sqrt(Math.max(...L) * Math.max(...C)) * 6); }
    let fast = isFinite(tauMin) ? tauMin : Infinity;
    if (fMax > 0) fast = Math.min(fast, 1 / (fMax * 40));
    else if (isFinite(fast)) fast = fast / 20;
    let span = Math.max(tauMax * 6, fMin < Infinity ? 4 / fMin : 0);
    if (!isFinite(fast) || fast <= 0) { fast = 1e-5; }
    if (!span) span = fast * 400;
    const dt = Math.min(fast, span / 400);
    return { dt, span: Math.max(span, dt * 200) };
  }

  Incog.solve = solve;
  Incog.Solution = Solution;
  Incog.TransientSim = TransientSim;
  Incog.suggestTiming = suggestTiming;
  Incog.GMIN = GMIN;
})(typeof window !== 'undefined' ? window : globalThis);

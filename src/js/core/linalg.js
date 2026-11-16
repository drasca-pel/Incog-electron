/* ============================================================================
 * Incog Electric Lab - core/linalg.js
 * Dense Gaussian elimination (real fast-path + complex) for the MNA solver.
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  class SingularError extends Error {
    constructor(row) {
      super('The circuit equations are singular. Look for: a loop made only of ideal voltage sources / inductors, ' +
        'two ideal voltage sources in parallel, or a current source with no return path.');
      this.name = 'SingularError';
      this.row = row;
    }
  }

  const PIVOT_MIN = 1e-14;

  function solveReal(n, A0, b0) {
    const A = Float64Array.from(A0);
    const b = Float64Array.from(b0);
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > max) { max = v; p = i; } }
      if (max < PIVOT_MIN) throw new SingularError(k);
      if (p !== k) {
        for (let j = k; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = b[k]; b[k] = b[p]; b[p] = t;
      }
      const piv = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = A[i * n + k] / piv;
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
        b[i] -= f * b[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
      x[i] = s / A[i * n + i];
    }
    return { xr: x, xi: new Float64Array(n) };
  }

  function solveComplex(n, Ar0, Ai0, br0, bi0) {
    const Ar = Float64Array.from(Ar0), Ai = Float64Array.from(Ai0);
    const br = Float64Array.from(br0), bi = Float64Array.from(bi0);
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.hypot(Ar[k * n + k], Ai[k * n + k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.hypot(Ar[i * n + k], Ai[i * n + k]);
        if (v > max) { max = v; p = i; }
      }
      if (max < PIVOT_MIN) throw new SingularError(k);
      if (p !== k) {
        for (let j = k; j < n; j++) {
          let t = Ar[k * n + j]; Ar[k * n + j] = Ar[p * n + j]; Ar[p * n + j] = t;
          t = Ai[k * n + j]; Ai[k * n + j] = Ai[p * n + j]; Ai[p * n + j] = t;
        }
        let t = br[k]; br[k] = br[p]; br[p] = t;
        t = bi[k]; bi[k] = bi[p]; bi[p] = t;
      }
      const pr = Ar[k * n + k], pi = Ai[k * n + k];
      const pd = pr * pr + pi * pi;
      for (let i = k + 1; i < n; i++) {
        const ar = Ar[i * n + k], ai = Ai[i * n + k];
        if (ar === 0 && ai === 0) continue;
        const fr = (ar * pr + ai * pi) / pd;
        const fi = (ai * pr - ar * pi) / pd;
        for (let j = k; j < n; j++) {
          const cr = Ar[k * n + j], ci = Ai[k * n + j];
          Ar[i * n + j] -= fr * cr - fi * ci;
          Ai[i * n + j] -= fr * ci + fi * cr;
        }
        br[i] -= fr * br[k] - fi * bi[k];
        bi[i] -= fr * bi[k] + fi * br[k];
      }
    }
    const xr = new Float64Array(n), xi = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sr = br[i], si = bi[i];
      for (let j = i + 1; j < n; j++) {
        sr -= Ar[i * n + j] * xr[j] - Ai[i * n + j] * xi[j];
        si -= Ar[i * n + j] * xi[j] + Ai[i * n + j] * xr[j];
      }
      const dr = Ar[i * n + i], di = Ai[i * n + i];
      const dd = dr * dr + di * di;
      xr[i] = (sr * dr + si * di) / dd;
      xi[i] = (si * dr - sr * di) / dd;
    }
    return { xr, xi };
  }

  /** Solve A x = b. Uses the faster real path when nothing is complex. */
  function solveDense(n, Ar, Ai, br, bi) {
    let real = true;
    for (let i = 0; i < n * n && real; i++) if (Ai[i] !== 0) real = false;
    for (let i = 0; i < n && real; i++) if (bi[i] !== 0) real = false;
    return real ? solveReal(n, Ar, br) : solveComplex(n, Ar, Ai, br, bi);
  }

  Incog.linalg = { solveDense, solveReal, solveComplex, SingularError };
})(typeof window !== 'undefined' ? window : globalThis);

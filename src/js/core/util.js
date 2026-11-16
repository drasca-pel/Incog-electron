/* ============================================================================
 * Incog Electric Lab - core/util.js
 * Complex numbers, engineering-unit parsing and formatting.
 * Everything in the lab hangs off one global namespace: window.Incog
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  // ---------------------------------------------------------------- complex
  // A complex number is a plain object { re, im }. Real quantities use im = 0.
  const ZERO = Object.freeze({ re: 0, im: 0 });
  const Cx = {
    ZERO,
    make: (re, im = 0) => ({ re, im }),
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div(a, b) {
      const d = b.re * b.re + b.im * b.im;
      if (d === 0) return { re: NaN, im: NaN };
      return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    },
    scale: (a, s) => ({ re: a.re * s, im: a.im * s }),
    neg: (a) => ({ re: -a.re, im: -a.im }),
    conj: (a) => ({ re: a.re, im: -a.im }),
    abs: (a) => Math.hypot(a.re, a.im),
    arg: (a) => Math.atan2(a.im, a.re),
    fromPolar: (m, rad) => ({ re: m * Math.cos(rad), im: m * Math.sin(rad) }),
    isNaN: (a) => Number.isNaN(a.re) || Number.isNaN(a.im),
    // real part of  z * e^{j*phi}  (instantaneous value of a phasor)
    inst: (a, phi) => a.re * Math.cos(phi) - a.im * Math.sin(phi),
  };

  // ------------------------------------------------------------ SI parsing
  const PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

  /** "4.7k" -> 4700, "10u" -> 1e-5, "2meg" -> 2e6, "5m" -> 0.005, "1e-3" -> 0.001 ; NaN if invalid.
   *  NOTE: lower-case m = milli, upper-case M or "meg" = mega. */
  function parseSI(text) {
    if (typeof text === 'number') return text;
    const s = String(text).trim().replace(/µ/g, 'u').replace(/\s+/g, '');
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/.exec(s);
    if (!m) return NaN;
    const num = parseFloat(m[1]);
    const rest = m[2];
    if (rest === '') return num;
    if (/^(farads?|henr|hz|hertz|volts?|amps?|ohms?|sec|deg)/i.test(rest)) return num;
    if (/^meg/i.test(rest)) return num * 1e6;
    if (PREFIX[rest[0]] !== undefined) return num * PREFIX[rest[0]];
    return num; // plain unit letters (V, A, F, H, Ω ...)
  }

  // ------------------------------------------------------------- formatting
  const SI_STEPS = [
    ['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1],
    ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15], ['a', 1e-18], ['z', 1e-21],
  ];

  /** 0.0047 -> "4.7 mA" (unit "A") */
  function fmtSI(x, unit = '', digits = 4) {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    if (!isFinite(x)) return (x < 0 ? '−' : '') + '∞' + (unit ? ' ' + unit : '');
    if (Math.abs(x) < 1e-22) return '0' + (unit ? ' ' + unit : '');
    const ax = Math.abs(x);
    let i = SI_STEPS.findIndex(([, m]) => ax >= m);
    if (i < 0) i = SI_STEPS.length - 1;
    let v = Number((x / SI_STEPS[i][1]).toPrecision(digits));
    if (Math.abs(v) >= 1000 && i > 0) { i -= 1; v = Number((x / SI_STEPS[i][1]).toPrecision(digits)); }
    const str = String(v).replace('-', '−');
    return str + ' ' + SI_STEPS[i][0] + unit;
  }

  function fmtAngle(rad) {
    let d = (rad * 180) / Math.PI;
    if (Math.abs(d) < 0.005) d = 0;
    return String(Number(d.toFixed(2))).replace('-', '−') + '°';
  }

  /** Complex -> "3.2 mV ∠ −45°" (polar) or "2.26 mV − j2.26 mV" (rect). opt.rms divides by √2. */
  function fmtComplex(z, unit = '', opt = {}) {
    if (Cx.isNaN(z)) return '—';
    const k = opt.rms ? Math.SQRT1_2 : 1;
    if ((opt.form || 'polar') === 'rect') {
      const re = fmtSI(z.re * k, unit);
      const im = fmtSI(Math.abs(z.im) * k, unit);
      if (Math.abs(z.im) < 1e-15 * Math.max(1, Math.abs(z.re))) return re;
      return re + (z.im < 0 ? ' − j' : ' + j') + im;
    }
    const mag = Cx.abs(z) * k;
    if (mag < 1e-18) return '0' + (unit ? ' ' + unit : '');
    return fmtSI(mag, unit) + ' ∠ ' + fmtAngle(Cx.arg(z));
  }

  /** Format a quantity for display. ac=true -> phasor form, otherwise the real part. */
  function fmtValue(z, unit, ac, opt) {
    return ac ? fmtComplex(z, unit, opt) : fmtSI(z.re, unit);
  }

  /** compact editable text for a value: 4700 -> "4.7k", 1e-6 -> "1u", 0.5 -> "500m" */
  function fmtPlain(x) {
    if (typeof x !== 'number' || !isFinite(x)) return String(x);
    if (x === 0) return '0';
    const ax = Math.abs(x);
    if (ax >= 1e15 || ax < 1e-15) return String(x);
    const steps = [['T', 1e12], ['G', 1e9], ['meg', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['u', 1e-6], ['n', 1e-9], ['p', 1e-12], ['f', 1e-15]];
    const st = steps.find(([, m]) => ax >= m * 0.9999999) || steps[steps.length - 1];
    const v = Number((x / st[1]).toPrecision(6));
    return String(v) + st[0];
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  Incog.Cx = Cx;
  Incog.util = { parseSI, fmtPlain, fmtSI, fmtAngle, fmtComplex, fmtValue, clamp, SI_STEPS };
})(typeof window !== 'undefined' ? window : globalThis);

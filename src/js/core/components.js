/* ============================================================================
 * Incog Electric Lab - core/components.js
 * THE COMPONENT REGISTRY.  To add a new part, add one Incog.registry.register({...})
 * block at the bottom of this file (or in a new file loaded after it).  Nothing else
 * needs to change: the palette, properties panel, answers list and solver pick it up.
 *
 * A component definition:
 *   type, name, prefix        identity + auto-label prefix (R -> R1, R2 ...)
 *   category                  palette group
 *   pins                      [[x,y],...] pin offsets in GRID units (rotated with the part)
 *   params                    { key: {label, unit, default, kind:'num'|'bool'} }  -> auto-built form
 *   stamp(s, comp, nodes, p)  puts the part into the matrix.  `s` = stamper (see solver.js)
 *                             must return { i(x) -> complex current a->b, commit?(x) }
 *   text(comp)                short value string drawn next to the part
 *   draw(g, comp, c)          draws the symbol in local px coords (grid = 20 px, pins at ±40)
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { Cx } = Incog;
  const { fmtSI } = Incog.util;

  const registry = {
    defs: new Map(),
    order: [],
    register(def) {
      if (!def || !def.type) throw new Error('component needs a type');
      def.pins = def.pins || [];
      def.params = def.params || {};
      def.category = def.category || 'Other';
      if (!this.defs.has(def.type)) this.order.push(def.type);
      this.defs.set(def.type, def);
      return def;
    },
    get(type) { return this.defs.get(type); },
    list() { return this.order.map((t) => this.defs.get(t)); },
    categories() {
      const out = [];
      for (const d of this.list()) {
        let cat = out.find((c) => c.name === d.category);
        if (!cat) out.push((cat = { name: d.category, defs: [] }));
        cat.defs.push(d);
      }
      return out;
    },
    defaultParams(def) {
      const o = {};
      for (const k of Object.keys(def.params)) o[k] = def.params[k].default;
      return o;
    },
  };

  // ------------------------------------------------------------ waveforms
  // Convention: v(t) = offset + amp * cos(2*pi*f*t + phase)   <- cosine reference
  // phasor = amp ∠ phase.  DC sources are 0 in AC analysis; AC sources use `offset` in DC analysis.
  function cosWave(p, s) {
    if (s.mode === 'dc') return { re: p.offset || 0, im: 0 };
    if (s.mode === 'ac') {
      const same = s.sweep || Math.abs(p.freq - s.freq) <= 1e-9 * Math.max(1, Math.abs(p.freq));
      return same ? Cx.fromPolar(p.amp, (p.phase * Math.PI) / 180) : Cx.ZERO;
    }
    return { re: (p.offset || 0) + p.amp * Math.cos(2 * Math.PI * p.freq * s.t + (p.phase * Math.PI) / 180), im: 0 };
  }
  function dcWave(p, s) { return s.mode === 'ac' ? Cx.ZERO : { re: p.value, im: 0 }; }
  function pulseWave(p, s) {
    if (s.mode === 'dc') return { re: p.v1, im: 0 };
    if (s.mode === 'ac') return Cx.ZERO;
    let t = s.t - p.delay;
    if (t < 0) return { re: p.v1, im: 0 };
    if (p.period > 0) t = t % p.period;
    return { re: t < p.width ? p.v2 : p.v1, im: 0 };
  }
  function vSource(wave) {
    return (s, c, n, p) => {
      const v = c.off ? Cx.ZERO : wave(p, s);
      const k = s.V(n[0], n[1], v.re, v.im);
      return { i: (x) => x.u(k) };
    };
  }
  function iSource(wave) {
    return (s, c, n, p) => {
      const v = c.off ? Cx.ZERO : wave(p, s);
      s.I(n[0], n[1], v.re, v.im);
      return { i: () => v };
    };
  }

  // -------------------------------------------------------------- drawing
  const line = (g, x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); };
  const txt = (g, s, x, y, size, color) => {
    g.save(); g.font = `bold ${size}px "Segoe UI",system-ui,sans-serif`; g.textAlign = 'center';
    g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(s, x, y); g.restore();
  };
  function arrow(g, x1, y1, x2, y2, head) {
    line(g, x1, y1, x2, y2);
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    g.moveTo(x2, y2);
    g.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
    g.stroke();
  }
  function sine(g, x0, x1, amp) {
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = x0 + ((x1 - x0) * i) / 24;
      const y = -amp * Math.sin((i / 24) * Math.PI * 2);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  const twoLead = (g, r) => { line(g, -40, 0, -r, 0); line(g, r, 0, 40, 0); };

  // ----------------------------------------------------------- definitions
  const NUM = (label, unit, def) => ({ label, unit, default: def, kind: 'num' });

  registry.register({
    type: 'R', name: 'Resistor', prefix: 'R', category: 'Passive', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Ideal resistor. V = I·R',
    params: { value: NUM('Resistance', 'Ω', 1000) },
    text: (c) => fmtSI(c.params.value, 'Ω'),
    stamp(s, c, n, p) {
      const R = Math.max(p.value, 1e-9);
      s.Y(n[0], n[1], 1 / R, 0);
      return { i: (x) => Cx.scale(Cx.sub(x.v(n[0]), x.v(n[1])), 1 / R) };
    },
    draw(g) {
      g.beginPath(); g.moveTo(-40, 0); g.lineTo(-20, 0);
      const N = 6, w = 40 / N;
      for (let i = 0; i < N; i++) g.lineTo(-20 + w * (i + 0.5), i % 2 ? 8 : -8);
      g.lineTo(20, 0); g.lineTo(40, 0); g.stroke();
    },
  });

  registry.register({
    type: 'C', name: 'Capacitor', prefix: 'C', category: 'Passive', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Ideal capacitor. i = C·dv/dt  (open circuit in DC, 1/jωC in AC)',
    params: {
      value: NUM('Capacitance', 'F', 1e-6), ic: NUM('Initial voltage', 'V', 0),
      polarized: { label: 'Polarized (electrolytic)', unit: '', default: 0, kind: 'bool' },
    },
    variants: [{ name: 'Capacitor (polarized)', params: { polarized: 1 } }],
    text: (c) => fmtSI(c.params.value, 'F'),
    stamp(s, c, n, p) {
      const C = Math.max(p.value, 1e-18);
      const vab = (x) => Cx.sub(x.v(n[0]), x.v(n[1]));
      if (s.mode === 'ac') {
        const y = { re: 0, im: s.omega * C };
        s.Y(n[0], n[1], y.re, y.im);
        return { i: (x) => Cx.mul(vab(x), y) };
      }
      if (s.mode === 'dc') return { i: () => Cx.ZERO };
      const st = s.state.get(c.id) || { v: p.ic || 0, i: 0 };
      const be = s.method === 'be';
      const G = ((be ? 1 : 2) * C) / s.dt;
      const Ieq = -(G * st.v + (be ? 0 : st.i));
      s.Y(n[0], n[1], G, 0);
      s.I(n[0], n[1], Ieq, 0);
      const cur = (x) => G * vab(x).re + Ieq;
      return {
        i: (x) => ({ re: cur(x), im: 0 }),
        commit: (x) => s.state.set(c.id, { v: vab(x).re, i: cur(x) }),
      };
    },
    draw(g, c, col) {
      if (!(c.params && c.params.polarized)) {          // ceramic / non-polarized: two straight plates
        twoLead(g, 5);
        line(g, -5, -14, -5, 14); line(g, 5, -14, 5, 14);
        return;
      }
      // polarized: straight plate on the + side (pin a, left), curved plate on the − side (pin b, right)
      line(g, -40, 0, -5, 0); line(g, 9, 0, 40, 0);
      line(g, -5, -14, -5, 14);
      g.beginPath(); g.moveTo(5, -14); g.quadraticCurveTo(13, 0, 5, 14); g.stroke();
      txt(g, '+', -15, -12, 13, col.stroke);
    },
  });

  registry.register({
    type: 'L', name: 'Inductor', prefix: 'L', category: 'Passive', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Ideal inductor. v = L·di/dt  (short circuit in DC, jωL in AC)',
    params: { value: NUM('Inductance', 'H', 1e-3), ic: NUM('Initial current', 'A', 0) },
    text: (c) => fmtSI(c.params.value, 'H'),
    stamp(s, c, n, p) {
      const L = Math.max(p.value, 1e-18);
      let k;
      if (s.mode === 'ac') k = s.V(n[0], n[1], 0, 0, 0, s.omega * L);
      else if (s.mode === 'dc') k = s.V(n[0], n[1], 0, 0, 0, 0);
      else {
        const st = s.state.get(c.id) || { v: 0, i: p.ic || 0 };
        const be = s.method === 'be';
        const Req = ((be ? 1 : 2) * L) / s.dt;
        k = s.V(n[0], n[1], -Req * st.i - (be ? 0 : st.v), 0, Req, 0);
      }
      return {
        i: (x) => x.u(k),
        commit: (x) => s.state.set(c.id, { v: Cx.sub(x.v(n[0]), x.v(n[1])).re, i: x.u(k).re }),
      };
    },
    draw(g) {
      line(g, -40, 0, -20, 0); line(g, 20, 0, 40, 0);
      g.beginPath(); g.moveTo(-20, 0);
      for (let i = 0; i < 4; i++) g.arc(-15 + 10 * i, 0, 5, Math.PI, Math.PI * 2);
      g.stroke();
    },
  });

  // ---- independent sources
  registry.register({
    type: 'Vdc', name: 'DC Voltage Source', prefix: 'V', category: 'Sources', pins: [[-2, 0], [2, 0]], pinNames: ['+', '−'],
    description: 'Ideal DC voltage source. Pin a (long plate) is +',
    isSource: true, srcKind: 'V',
    params: { value: NUM('Voltage', 'V', 10) },
    text: (c) => fmtSI(c.params.value, 'V'),
    stamp: vSource(dcWave),
    draw(g, c, col) {
      line(g, -40, 0, -4, 0); line(g, 4, 0, 40, 0);
      line(g, -4, -14, -4, 14);
      g.save(); g.lineWidth *= 1.8; line(g, 4, -7, 4, 7); g.restore();
      txt(g, '+', -15, -11, 12, col.stroke);
    },
  });

  registry.register({
    type: 'Vac', name: 'AC Voltage Source', prefix: 'V', category: 'Sources', pins: [[-2, 0], [2, 0]], pinNames: ['+', '−'],
    description: 'Sinusoidal source  v(t) = offset + A·cos(2πft + φ).  Phasor = A∠φ',
    isSource: true, srcKind: 'V',
    params: {
      amp: NUM('Amplitude (peak)', 'V', 10), freq: NUM('Frequency', 'Hz', 50),
      phase: NUM('Phase', '°', 0), offset: NUM('DC offset', 'V', 0),
    },
    text: (c) => fmtSI(c.params.amp, 'V') + ' @ ' + fmtSI(c.params.freq, 'Hz'),
    stamp: vSource(cosWave),
    draw(g, c, col) {
      twoLead(g, 16); circle(g, 0, 0, 16); sine(g, -9, 9, 5);
      txt(g, '+', -27, -9, 11, col.stroke);
    },
  });

  registry.register({
    type: 'Vpulse', name: 'Pulse / Step Source', prefix: 'V', category: 'Sources', pins: [[-2, 0], [2, 0]], pinNames: ['+', '−'],
    description: 'Square pulse train (period 0 = single step). Great for RC / RL transients',
    isSource: true, srcKind: 'V',
    params: {
      v1: NUM('Low level', 'V', 0), v2: NUM('High level', 'V', 5), delay: NUM('Delay', 's', 0),
      width: NUM('Pulse width', 's', 1e-3), period: NUM('Period (0 = once)', 's', 2e-3),
    },
    text: (c) => fmtSI(c.params.v2, 'V') + ' pulse',
    stamp: vSource(pulseWave),
    draw(g, c, col) {
      twoLead(g, 16); circle(g, 0, 0, 16);
      g.beginPath(); g.moveTo(-10, 5); g.lineTo(-10, -5); g.lineTo(0, -5); g.lineTo(0, 5); g.lineTo(10, 5); g.lineTo(10, -5); g.stroke();
      txt(g, '+', -27, -9, 11, col.stroke);
    },
  });

  registry.register({
    type: 'Idc', name: 'DC Current Source', prefix: 'I', category: 'Sources', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Ideal DC current source. Current flows through the source from pin a to pin b (arrow)',
    isSource: true, srcKind: 'I',
    params: { value: NUM('Current', 'A', 0.001) },
    text: (c) => fmtSI(c.params.value, 'A'),
    stamp: iSource(dcWave),
    draw(g) { twoLead(g, 16); circle(g, 0, 0, 16); arrow(g, -9, 0, 9, 0, 6); },
  });

  registry.register({
    type: 'Iac', name: 'AC Current Source', prefix: 'I', category: 'Sources', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Sinusoidal current source. Arrow = reference direction a → b',
    isSource: true, srcKind: 'I',
    params: {
      amp: NUM('Amplitude (peak)', 'A', 0.01), freq: NUM('Frequency', 'Hz', 50),
      phase: NUM('Phase', '°', 0), offset: NUM('DC offset', 'A', 0),
    },
    text: (c) => fmtSI(c.params.amp, 'A') + ' @ ' + fmtSI(c.params.freq, 'Hz'),
    stamp: iSource(cosWave),
    draw(g, c, col) {
      twoLead(g, 16); circle(g, 0, 0, 16); arrow(g, -9, 3, 9, 3, 5);
      g.save(); g.translate(0, -7); sine(g, -6, 6, 2.5); g.restore();
    },
  });

  // ---- dependent sources (4 pins: out a, out b, control c, control d)
  const BOX = (g, label, col) => {
    g.beginPath(); g.rect(-24, -28, 48, 56); g.stroke();
    line(g, 0, -40, 0, -28); line(g, 0, 28, 0, 40);
    line(g, -40, -20, -24, -20); line(g, -40, 20, -24, 20);
    txt(g, label, 0, 0, 12, col.stroke);
    txt(g, '+', 8, -20, 10, col.stroke); txt(g, '+', -16, -14, 10, col.stroke);
  };
  registry.register({
    type: 'VCVS', name: 'VCVS (E)', prefix: 'E', category: 'Dependent', pins: [[0, -2], [0, 2], [-2, -1], [-2, 1]],
    pinNames: ['out+', 'out−', 'ctrl+', 'ctrl−'], isSource: true, dependent: true,
    description: 'Voltage-controlled voltage source:  V(out) = μ · V(ctrl)',
    params: { gain: NUM('Gain μ', 'V/V', 2) },
    text: (c) => 'μ = ' + fmtSI(c.params.gain, ''),
    stamp(s, c, n, p) {
      const k = s.V(n[0], n[1], 0, 0);
      s.add(k, n[2] - 1, -p.gain); s.add(k, n[3] - 1, p.gain);
      return { i: (x) => x.u(k) };
    },
    draw(g, c, col) { BOX(g, 'μ·Vc', col); },
  });
  registry.register({
    type: 'VCCS', name: 'VCCS (G)', prefix: 'G', category: 'Dependent', pins: [[0, -2], [0, 2], [-2, -1], [-2, 1]],
    pinNames: ['out+', 'out−', 'ctrl+', 'ctrl−'], isSource: true, dependent: true,
    description: 'Voltage-controlled current source:  I(out, a→b) = gm · V(ctrl)',
    params: { gm: NUM('Transconductance gm', 'S', 0.01) },
    text: (c) => 'gm = ' + fmtSI(c.params.gm, 'S'),
    stamp(s, c, n, p) {
      const a = n[0] - 1, b = n[1] - 1, cc = n[2] - 1, d = n[3] - 1;
      s.add(a, cc, p.gm); s.add(a, d, -p.gm); s.add(b, cc, -p.gm); s.add(b, d, p.gm);
      return { i: (x) => Cx.scale(Cx.sub(x.v(n[2]), x.v(n[3])), p.gm) };
    },
    draw(g, c, col) { BOX(g, 'gm·Vc', col); },
  });

  // ---- other
  registry.register({
    type: 'SW', name: 'Switch', prefix: 'S', category: 'Other', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Ideal switch (click it on the canvas or use the properties panel to open / close)',
    params: { closed: { label: 'Closed', unit: '', default: 1, kind: 'bool' } },
    text: (c) => (c.params.closed ? 'closed' : 'open'),
    stamp(s, c, n, p) {
      if (!p.closed) return { i: () => Cx.ZERO };
      const k = s.V(n[0], n[1], 0, 0);
      return { i: (x) => x.u(k) };
    },
    draw(g, c) {
      line(g, -40, 0, -14, 0); line(g, 14, 0, 40, 0);
      g.beginPath(); g.arc(-14, 0, 2.5, 0, 7); g.arc(14, 0, 2.5, 0, 7); g.stroke();
      if (c.params.closed) line(g, -14, 0, 14, 0); else line(g, -14, 0, 11, -15);
    },
  });

  registry.register({
    type: 'GND', name: 'Ground (0 V)', prefix: 'GND', category: 'Other', pins: [[0, 0]], pinNames: ['gnd'],
    isGround: true, params: {}, description: 'Reference node, 0 V. Every circuit needs one',
    text: () => '',
    draw(g) {
      line(g, 0, 0, 0, 10); line(g, -13, 10, 13, 10); line(g, -8, 15, 8, 15); line(g, -3, 20, 3, 20);
    },
  });

  // ---- loads
  registry.register({
    type: 'LAMP', name: 'Light bulb', prefix: 'B', category: 'Loads', pins: [[-2, 0], [2, 0]], pinNames: ['a', 'b'],
    description: 'Bulb: R = V² / P from its rating. Glows brighter as its power rises. BLOWS if the voltage across it goes above the Maximum voltage (DC volts, or RMS in AC; in Transient the instantaneous voltage). Untick "Blown" to fit a new bulb',
    params: {
      ratedV: NUM('Maximum voltage', 'V', 5), ratedP: NUM('Power at maximum voltage', 'W', 1),
      blown: { label: 'Blown (untick to fit a new bulb)', unit: '', default: 0, kind: 'bool' },
    },
    text: (c) => (c.params.blown ? 'BLOWN' : fmtSI(c.params.ratedV, 'V') + ' max'),
    stamp(s, c, n, p) {
      if (p.blown) return { i: () => Cx.ZERO };                       // burnt out = open circuit
      const R = Math.max((p.ratedV * p.ratedV) / Math.max(p.ratedP, 1e-12), 1e-9);
      s.Y(n[0], n[1], 1 / R, 0);
      return { i: (x) => Cx.scale(Cx.sub(x.v(n[0]), x.v(n[1])), 1 / R) };
    },
    glow: (c, r) => (c.params.blown ? 0 : Math.max(0, r.p || 0) / Math.max(c.params.ratedP, 1e-12)),   // 1 = full brightness
    overload: (p, r, mode) => !p.blown && (mode === 'ac' ? Cx.abs(r.v) / Math.SQRT2 : Math.abs(r.v.re)) > p.ratedV * 1.001,
    draw(g, c) {
      twoLead(g, 15); circle(g, 0, 0, 15);
      if (c.params && c.params.blown) {                               // broken filament + crack
        line(g, -10.6, -10.6, -3.5, -3.5); line(g, 10.6, 10.6, 3.5, 3.5);
        line(g, -10.6, 10.6, -3, 3); line(g, 10.6, -10.6, 3, -3);
        line(g, -2, -9, 2, -3); line(g, 2, -3, -1, 1);
        return;
      }
      line(g, -10.6, -10.6, 10.6, 10.6); line(g, -10.6, 10.6, 10.6, -10.6);
    },
  });

  Incog.registry = registry;
})(typeof window !== 'undefined' ? window : globalThis);
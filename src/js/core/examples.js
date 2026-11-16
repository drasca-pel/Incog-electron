/* ============================================================================
 * Incog Electric Lab - core/examples.js
 * Ready-made circuits shown in the "Examples" menu. Add your own by pushing to the list.
 * w = wires [x1,y1,x2,y2]  c = components {t:type, x, y, r:rotation, p:params, l:label}
 * Rotation: 0 = horizontal (pin a left, pin b right)   1 = vertical (pin a on TOP, pin b at the bottom)
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  const list = [];
  function ex(def) { list.push(def); }

  // 1. Voltage divider
  ex({
    id: 'divider', title: 'Voltage divider', mode: 'dc',
    about: 'Two resistors in series across 12 V. Probe node B and check V(B) = 12·R2/(R1+R2).',
    c: [
      { t: 'Vdc', x: 6, y: 10, r: 1, p: { value: 12 }, l: 'V1' },
      { t: 'R', x: 10, y: 6, r: 0, p: { value: 1000 }, l: 'R1' },
      { t: 'R', x: 14, y: 10, r: 1, p: { value: 2000 }, l: 'R2' },
      { t: 'GND', x: 10, y: 14, r: 0 },
    ],
    w: [[6, 8, 6, 6], [6, 6, 8, 6], [12, 6, 14, 6], [14, 6, 14, 8], [6, 12, 6, 14], [6, 14, 14, 14], [14, 14, 14, 12]],
  });

  // 2. Two-source circuit for superposition
  ex({
    id: 'superposition', title: 'Two sources (Superposition)', mode: 'dc',
    about: 'Classic superposition problem: V1 = 12 V and I1 = 2 mA feed R1, R2, R3. Open Theorems → Superposition.',
    c: [
      { t: 'Vdc', x: 4, y: 10, r: 1, p: { value: 12 }, l: 'V1' },
      { t: 'R', x: 8, y: 6, r: 0, p: { value: 2000 }, l: 'R1' },
      { t: 'R', x: 14, y: 10, r: 1, p: { value: 3000 }, l: 'R2' },
      { t: 'R', x: 20, y: 6, r: 0, p: { value: 1000 }, l: 'R3' },
      { t: 'Idc', x: 24, y: 10, r: 1, p: { value: 0.002 }, l: 'I1' },
      { t: 'GND', x: 14, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 6, 6], [10, 6, 14, 6], [14, 6, 14, 8], [14, 6, 18, 6], [22, 6, 24, 6], [24, 6, 24, 8],
      [4, 12, 4, 14], [4, 14, 24, 14], [24, 14, 24, 12], [14, 12, 14, 14]],
  });

  // 3. Bridge-like network for Thevenin
  ex({
    id: 'thevenin', title: 'Thevenin practice', mode: 'dc',
    about: 'Find the Thevenin equivalent seen by the load RL. Open Theorems → Thevenin and pick RL.',
    c: [
      { t: 'Vdc', x: 4, y: 10, r: 1, p: { value: 24 }, l: 'V1' },
      { t: 'R', x: 8, y: 6, r: 0, p: { value: 6 }, l: 'R1' },
      { t: 'R', x: 14, y: 10, r: 1, p: { value: 12 }, l: 'R2' },
      { t: 'R', x: 18, y: 6, r: 0, p: { value: 4 }, l: 'R3' },
      { t: 'R', x: 22, y: 10, r: 1, p: { value: 8 }, l: 'RL' },
      { t: 'GND', x: 14, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 6, 6], [10, 6, 14, 6], [14, 6, 14, 8], [14, 6, 16, 6], [20, 6, 22, 6], [22, 6, 22, 8],
      [4, 12, 4, 14], [4, 14, 22, 14], [22, 14, 22, 12], [14, 12, 14, 14]],
  });

  // 4. RC low-pass AC
  ex({
    id: 'rclowpass', title: 'RC low-pass filter (AC)', mode: 'ac', freq: 159.155,
    about: 'Corner frequency 1/(2πRC) ≈ 159 Hz. At that frequency |Vout/Vin| = 0.707 and the phase is −45°.',
    c: [
      { t: 'Vac', x: 4, y: 10, r: 1, p: { amp: 10, freq: 159.155, phase: 0 }, l: 'V1' },
      { t: 'R', x: 10, y: 6, r: 0, p: { value: 1000 }, l: 'R1' },
      { t: 'C', x: 16, y: 10, r: 1, p: { value: 1e-6 }, l: 'C1' },
      { t: 'GND', x: 10, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 8, 6], [12, 6, 16, 6], [16, 6, 16, 8], [4, 12, 4, 14], [4, 14, 16, 14], [16, 14, 16, 12]],
  });

  // 5. Series RLC
  ex({
    id: 'rlc', title: 'Series RLC resonance (AC)', mode: 'ac', freq: 503.29,
    about: 'L = 10 mH, C = 10 µF resonate at 503 Hz. Run an AC sweep: the current peaks there.',
    c: [
      { t: 'Vac', x: 4, y: 10, r: 1, p: { amp: 10, freq: 503.29, phase: 0 }, l: 'V1' },
      { t: 'R', x: 8, y: 6, r: 0, p: { value: 10 }, l: 'R1' },
      { t: 'L', x: 14, y: 6, r: 0, p: { value: 0.01 }, l: 'L1' },
      { t: 'C', x: 20, y: 10, r: 1, p: { value: 1e-5 }, l: 'C1' },
      { t: 'GND', x: 12, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 6, 6], [10, 6, 12, 6], [16, 6, 20, 6], [20, 6, 20, 8], [4, 12, 4, 14], [4, 14, 20, 14], [20, 14, 20, 12], [12, 14, 12, 14]],
  });

  // 6. RC step response (transient)
  ex({
    id: 'rcstep', title: 'RC charging (transient)', mode: 'tran',
    about: 'A 5 V pulse charges C1 through R1 (τ = 1 ms). Press Run and watch V(C1) rise on the scope.',
    c: [
      { t: 'Vpulse', x: 4, y: 10, r: 1, p: { v1: 0, v2: 5, delay: 0, width: 5e-3, period: 10e-3 }, l: 'V1' },
      { t: 'R', x: 10, y: 6, r: 0, p: { value: 1000 }, l: 'R1' },
      { t: 'C', x: 16, y: 10, r: 1, p: { value: 1e-6 }, l: 'C1' },
      { t: 'GND', x: 10, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 8, 6], [12, 6, 16, 6], [16, 6, 16, 8], [4, 12, 4, 14], [4, 14, 16, 14], [16, 14, 16, 12]],
  });

  // 7. RL transient
  ex({
    id: 'rlstep', title: 'RL step response (transient)', mode: 'tran',
    about: 'τ = L/R = 1 ms. The current rises to 10 mA while the inductor voltage decays.',
    c: [
      { t: 'Vpulse', x: 4, y: 10, r: 1, p: { v1: 0, v2: 10, delay: 0, width: 5e-3, period: 10e-3 }, l: 'V1' },
      { t: 'R', x: 10, y: 6, r: 0, p: { value: 1000 }, l: 'R1' },
      { t: 'L', x: 16, y: 10, r: 1, p: { value: 1 }, l: 'L1' },
      { t: 'GND', x: 10, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 8, 6], [12, 6, 16, 6], [16, 6, 16, 8], [4, 12, 4, 14], [4, 14, 16, 14], [16, 14, 16, 12]],
  });

  // 8. AC network with dependent source
  ex({
    id: 'maxpower', title: 'Source with internal resistance (Max power)', mode: 'dc',
    about: 'Battery 12 V with 4 Ω internal resistance. Open Theorems → Maximum power transfer and pick RL.',
    c: [
      { t: 'Vdc', x: 4, y: 10, r: 1, p: { value: 12 }, l: 'V1' },
      { t: 'R', x: 10, y: 6, r: 0, p: { value: 4 }, l: 'Rs' },
      { t: 'R', x: 16, y: 10, r: 1, p: { value: 10 }, l: 'RL' },
      { t: 'GND', x: 10, y: 14, r: 0 },
    ],
    w: [[4, 8, 4, 6], [4, 6, 8, 6], [12, 6, 16, 6], [16, 6, 16, 8], [4, 12, 4, 14], [4, 14, 16, 14], [16, 14, 16, 12]],
  });

  function build(example) {
    const circ = new Incog.Circuit();
    circ.title = example.title;
    for (const c of example.c) circ.addComponent(c.t, c.x, c.y, c.r || 0, c.p || null, c.l || null);
    for (const w of example.w) circ.addWire(w[0], w[1], w[2], w[3]);
    return circ;
  }

  Incog.examples = { list: [], build };
})(typeof window !== 'undefined' ? window : globalThis);

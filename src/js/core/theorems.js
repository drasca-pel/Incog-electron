/* ============================================================================
 * Incog Electric Lab - core/theorems.js
 * Network theorems.  Every theorem is a function  (nl, opts) -> report
 * and is registered in Incog.theorems.  A report is plain data the UI renders:
 *   { id, title, statement, ok, blocks:[ {type:'text'|'table'|'kv'|'steps'|'verdict'|'plot', ...} ] }
 * To add a theorem: write one function and call  Incog.theorems.register({...}).
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});
  const { Cx } = Incog;
  const { fmtSI, fmtComplex, fmtValue } = Incog.util;
  const A = () => Incog.analysis;

  const theorems = {
    list: [],
    register(t) { this.list = this.list.filter((x) => x.id !== t.id); this.list.push(t); },
    get(id) { return this.list.find((t) => t.id === id); },
  };

  const fmtZ = (z, ac) => {
    if (!isFinite(z.re) || !isFinite(z.im)) return '∞ Ω';
    return ac ? fmtComplex(z, 'Ω', { form: 'rect' }) + '   (' + fmtComplex(z, 'Ω') + ')' : fmtSI(z.re, 'Ω');
  };
  const close = (a, b, tol = 1e-6) => Cx.abs(Cx.sub(a, b)) <= tol * Math.max(1e-9, Cx.abs(a), Cx.abs(b));
  const sourceLabelList = (nl) => nl.elements.filter(A().isIndependent).map((e) => e.comp.label);

  // =================================================================== helpers
  function portFrom(nl, o) {
    if (o.loadId !== undefined && o.loadId !== null && o.loadId !== '') {
      const e = nl.element(Number(o.loadId));
      if (!e) throw new Error('Choose the load component first.');
      if (e.nodes.length !== 2) throw new Error('The load must be a two-terminal part.');
      return { a: e.nodes[0], b: e.nodes[1], load: e, name: e.comp.label };
    }
    const na = nl.nodeByName(o.nodeA), nb = nl.nodeByName(o.nodeB || '0');
    if (!na || !nb) throw new Error('Pick the load part, or two nodes for the port.');
    return { a: na.index, b: nb.index, load: null, name: `${na.name}–${nb.name}` };
  }

  // =============================================================== superposition
  theorems.register({
    id: 'superposition', name: 'Superposition',
    needs: 'Nothing to choose. Every independent source is switched on alone.',
    statement: 'In a linear circuit the response (voltage or current) caused by several independent sources equals the sum of the responses caused by each source acting alone, with all the other independent sources switched off (voltage sources → short circuit, current sources → open circuit).',
    run(nl, o) {
      const { mode, freq } = o, ac = mode === 'ac';
      const sources = nl.elements.filter(A().isIndependent);
      if (sources.length < 2) throw new Error('Superposition needs at least two independent sources.');
      const full = Incog.solve(nl, { mode, freq });
      const parts = sources.map((s) => ({ s, sol: Incog.solve(A().variant(nl, { only: s.comp.id }), { mode, freq }) }));
      const qs = A().listQuantities(nl, mode).filter((q) => q.kind === 'V' || q.kind === 'I');
      let allOk = true;
      const rows = qs.map((q) => {
        const per = parts.map((p) => q.eval(p.sol));
        const sum = per.reduce((a, b) => Cx.add(a, b), Cx.ZERO);
        const act = q.eval(full);
        const ok = close(act, sum, 1e-6) || Cx.abs(Cx.sub(act, sum)) < 1e-9;
        if (!ok) allOk = false;
        return [q.key, ...per.map((z) => fmtValue(z, q.unit, ac)), fmtValue(sum, q.unit, ac), fmtValue(act, q.unit, ac), ok ? '✓' : '✗'];
      });
      const ignored = ac ? sources.filter((s) => (s.comp.type === 'Vdc' || s.comp.type === 'Idc' || Math.abs((s.p.freq || 0) - freq) > 1e-9)).map((s) => s.comp.label) : [];
      return {
        ok: allOk,
        blocks: [
          { type: 'steps', title: 'Method', items: [
            ...parts.map((p, k) => `Case ${k + 1}: keep only ${p.s.comp.label} (${p.s.comp.type === 'Vdc' || p.s.comp.type === 'Vac' || p.s.comp.type === 'Vpulse' ? 'voltage source' : 'current source'}) on. Every other independent source is switched off, then solve the circuit.`),
            'Add the case results with their signs (phasors are added as complex numbers).',
            'Compare with the circuit solved with every source on.',
          ] },
          ...(ignored.length ? [{ type: 'text', text: `At ${fmtSI(freq, 'Hz')} these sources contribute nothing (DC or a different frequency): ${ignored.join(', ')}. For mixed frequencies run superposition once per frequency.` }] : []),
          { type: 'table', title: 'Contribution of each source', cols: ['Quantity', ...parts.map((p) => 'only ' + p.s.comp.label), 'Sum', 'All on', '✓'], rows },
          { type: 'text', text: 'Power is not listed because power is not linear, so it does not superpose. Use the Answers tab for power.' },
          { type: 'verdict', ok: allOk, text: allOk ? 'The sum of the individual responses equals the response with everything on. Superposition holds.' : 'Mismatch found. The circuit contains something non-linear or the solution failed.' },
        ],
      };
    },
  });

  // ===================================================== Thevenin and Norton
  function theveninReport(nl, o, wantNorton) {
    const { mode, freq } = o, ac = mode === 'ac';
    const port = portFrom(nl, o);
    const remove = port.load ? [port.load.comp.id] : [];
    const th = A().thevenin(nl, port.a, port.b, { mode, freq, remove });
    const full = Incog.solve(nl, { mode, freq });
    const nName = (i) => (i === 0 ? '0 (ground)' : nl.nodes[i].name);
    const blocks = [];
    const steps = [
      `Remove the load${port.load ? ' ' + port.name : ''}. The open terminals are node ${nName(port.a)} (+) and node ${nName(port.b)} (−).`,
      `Open-circuit voltage: solve the circuit with the load removed.  V_th = V(${nName(port.a)}) − V(${nName(port.b)}) = ${fmtValue(th.Vth, 'V', ac)}.`,
      `Switch off every independent source (voltage sources → short, current sources → open)${nl.elements.some((e) => e.def.dependent) ? '; dependent sources stay' : ''}, drive the terminals with a 1 ${ac ? 'A∠0°' : 'A'} test current, and read the voltage:  Z_th = V_test / 1 = ${fmtZ(th.Zth, ac)}.`,
      th.Isc ? `Short-circuit current (terminals joined with a wire):  I_sc = ${fmtValue(th.Isc, 'A', ac)}.` : 'The short-circuit current could not be computed.',
    ];
    blocks.push({ type: 'steps', title: 'Steps', items: steps });

    const kv = [
      ['V_th (Thevenin voltage)', fmtValue(th.Vth, 'V', ac)],
      [ac ? 'Z_th (Thevenin impedance)' : 'R_th (Thevenin resistance)', fmtZ(th.Zth, ac)],
      ['I_N = I_sc (Norton current)', th.Isc ? fmtValue(th.Isc, 'A', ac) : '—'],
      [ac ? 'Z_N = Z_th (Norton impedance)' : 'R_N = R_th (Norton resistance)', fmtZ(th.Zth, ac)],
    ];
    const consistent = th.Isc && isFinite(th.Zth.re) ? close(th.Isc, Cx.div(th.Vth, th.Zth), 1e-5) : null;
    blocks.push({ type: 'kv', title: wantNorton ? 'Norton equivalent' : 'Thevenin equivalent', rows: kv });
    if (consistent !== null) kv.push(['Check: I_sc = V_th / Z_th', consistent ? '✓ agrees' : '✗ differs']);

    let ok = consistent !== false;
    if (port.load) {
      const ZL = A().loadImpedance(port.load, mode, freq);
      if (ZL && isFinite(ZL.re)) {
        const IL = Cx.div(th.Vth, Cx.add(th.Zth, ZL));
        const VL = Cx.mul(IL, ZL);
        const direct = full.get(port.load.comp.id);
        const mI = close(IL, direct.i, 1e-5), mV = close(VL, direct.v, 1e-5);
        ok = ok && mI && mV;
        blocks.push({ type: 'table', title: `Load ${port.name} using the equivalent  vs  the original circuit`, cols: ['Quantity', 'From equivalent', 'Original circuit', '✓'], rows: [
          [`I(${port.name})`, fmtValue(IL, 'A', ac), fmtValue(direct.i, 'A', ac), mI ? '✓' : '✗'],
          [`V(${port.name})`, fmtValue(VL, 'V', ac), fmtValue(direct.v, 'V', ac), mV ? '✓' : '✗'],
        ] });
        blocks.push({ type: 'text', text: `I_load = V_th / (Z_th + Z_load) = ${fmtValue(th.Vth, 'V', ac)} / (${fmtZ(th.Zth, false) === '∞ Ω' ? '∞' : ac ? fmtComplex(Cx.add(th.Zth, ZL), 'Ω', { form: 'rect' }) : fmtSI(th.Zth.re + ZL.re, 'Ω')})` });
      }
    }
    blocks.push({ type: 'equiv', ac, Vth: th.Vth, Zth: th.Zth, Isc: th.Isc, mode: wantNorton ? 'norton' : 'thevenin' });
    blocks.push({ type: 'verdict', ok, text: ok ? 'The equivalent reproduces the original circuit at the load.' : 'The equivalent does not match. Check the circuit for dependent sources or floating parts.' });
    return { ok, blocks, th };
  }

  theorems.register({
    id: 'thevenin', name: 'Thevenin',
    needs: 'Pick the load part (it is removed), or two nodes for the port.',
    statement: 'Any linear two-terminal network can be replaced by an ideal voltage source V_th in series with an impedance Z_th. V_th is the open-circuit voltage at the terminals and Z_th is the impedance seen from the terminals with all independent sources switched off.',
    run: (nl, o) => theveninReport(nl, o, false),
  });
  theorems.register({
    id: 'norton', name: 'Norton',
    needs: 'Pick the load part (it is removed), or two nodes for the port.',
    statement: 'Any linear two-terminal network can be replaced by an ideal current source I_N in parallel with an impedance Z_N. I_N is the short-circuit current at the terminals and Z_N = Z_th.',
    run: (nl, o) => theveninReport(nl, o, true),
  });

  // ======================================================= max power transfer
  theorems.register({
    id: 'maxpower', name: 'Maximum power transfer',
    needs: 'Pick the load part (it is removed and swept).',
    statement: 'A source with Thevenin impedance Z_th delivers maximum power to a load when Z_load = Z_th* (the complex conjugate). For a purely resistive load, R_load = |Z_th|. In DC this is simply R_load = R_th and P_max = V_th² / (4·R_th).',
    run(nl, o) {
      const { mode, freq } = o, ac = mode === 'ac';
      const port = portFrom(nl, o);
      const remove = port.load ? [port.load.comp.id] : [];
      const th = A().thevenin(nl, port.a, port.b, { mode, freq, remove });
      const Vm = ac ? Cx.abs(th.Vth) / Math.SQRT2 : Math.abs(th.Vth.re); // RMS for AC, plain for DC
      const k = ac ? 0.5 : 1;
      const Rth = th.Zth.re, Xth = th.Zth.im;
      if (!(Rth > 1e-12)) throw new Error('The Thevenin resistance is zero or negative, so there is no finite maximum.');
      const pOf = (RL, XL) => {
        const Z = Cx.add(th.Zth, { re: RL, im: XL });
        const I = Cx.div(th.Vth, Z);
        return k * Cx.abs(I) * Cx.abs(I) * RL;
      };
      const Pmax = (ac ? 0.5 : 1) * Cx.abs(th.Vth) * Cx.abs(th.Vth) / (4 * Rth);
      const RLopt = ac ? Cx.abs(th.Zth) : Rth;
      const Pres = pOf(RLopt, 0);
      const pts = [];
      const lo = Math.max(RLopt * 0.02, 1e-6), hi = RLopt * 6;
      for (let i = 0; i <= 120; i++) { const R = lo + ((hi - lo) * i) / 120; pts.push([R, pOf(R, 0)]); }
      const blocks = [];
      blocks.push({ type: 'steps', title: 'Method', items: [
        `Find the Thevenin equivalent of everything except the load:  V_th = ${fmtValue(th.Vth, 'V', ac)},  Z_th = ${fmtZ(th.Zth, ac)}.`,
        ac ? `Best complex load:  Z_L = Z_th* = ${fmtComplex(Cx.conj(th.Zth), 'Ω', { form: 'rect' })}, which gives P_max = |V_th|² / (8·R_th) = ${fmtSI(Pmax, 'W')}. (Peak phasors.)`
           : `Best load:  R_L = R_th = ${fmtSI(Rth, 'Ω')}, which gives P_max = V_th² / (4·R_th) = ${fmtSI(Pmax, 'W')}.`,
        ac ? `If the load can only be a resistor, the best value is R_L = |Z_th| = ${fmtSI(RLopt, 'Ω')}, giving ${fmtSI(Pres, 'W')}.` : 'The graph below sweeps R_L to show the peak is exactly there.',
      ] });
      blocks.push({ type: 'kv', title: 'Result', rows: [
        ['V_th', fmtValue(th.Vth, 'V', ac)], [ac ? 'Z_th' : 'R_th', fmtZ(th.Zth, ac)],
        [ac ? 'Best load Z_L = Z_th*' : 'Best load R_L', ac ? fmtComplex(Cx.conj(th.Zth), 'Ω', { form: 'rect' }) : fmtSI(Rth, 'Ω')],
        ['Maximum power P_max', fmtSI(Pmax, 'W')],
        ['Efficiency at maximum power', '50 %  (half the power is lost inside the source network)'],
      ] });
      if (port.load) {
        const ZL = A().loadImpedance(port.load, mode, freq);
        if (ZL && isFinite(ZL.re)) {
          const now = pOf(ZL.re, ZL.im);
          blocks.push({ type: 'text', text: `Your present load ${port.name} (${fmtZ(ZL, ac)}) receives ${fmtSI(now, 'W')}, which is ${(100 * now / Pmax).toFixed(1)} % of the maximum.` });
        }
      }
      blocks.push({ type: 'plot', title: 'Load power vs load resistance' + (ac ? ' (resistive load, reactance 0)' : ''), xlabel: 'R_load (Ω)', ylabel: 'P (W)', points: pts, mark: { x: RLopt, y: Pres, label: 'maximum' } });
      void Vm; void Xth;
      return { ok: true, blocks };
    },
  });

  // ==================================================================== Tellegen
  theorems.register({
    id: 'tellegen', name: 'KCL / Tellegen check',
    needs: 'Nothing to choose.',
    statement: "Kirchhoff's current law: the currents leaving any node add up to zero. Tellegen's theorem: the total power absorbed by every part of the circuit adds up to zero, so power delivered by the sources equals power absorbed by the rest.",
    run(nl, o) {
      const { mode, freq } = o, ac = mode === 'ac';
      const sol = Incog.solve(nl, { mode, freq });
      const kcl = A().kclTable(nl, sol);
      const pb = A().powerBalance(nl, sol);
      let ok = true;
      const rows = kcl.map((r) => {
        const scale = Math.max(1e-12, ...r.terms.map((t) => Cx.abs(t.z)));
        const good = Cx.abs(r.sum) < 1e-7 * scale + 1e-12;
        if (!good) ok = false;
        return [`Node ${r.node.name}`, r.terms.map((t) => `${fmtValue(t.z, 'A', ac)} (${t.label})`).join('  +  '), fmtValue(r.sum, 'A', ac), good ? '✓' : '✗'];
      });
      const pScale = Math.max(1e-12, pb.delivered, pb.absorbed);
      const pOk = Math.abs(pb.P) < 1e-7 * pScale + 1e-12 && (!ac || Math.abs(pb.Q) < 1e-7 * Math.max(1e-12, ...pb.rows.map((r) => Math.abs(r.q))) + 1e-12);
      ok = ok && pOk;
      return {
        ok,
        blocks: [
          { type: 'table', title: 'Current leaving each node (KCL)', cols: ['Node', 'Currents leaving the node', 'Sum', '✓'], rows },
          { type: 'table', title: 'Power absorbed by each part (negative = delivering)', cols: ['Part', 'P absorbed', ...(ac ? ['Q (VAR)'] : []), 'Role'],
            rows: [...pb.rows.map((r) => [r.label, fmtSI(r.p, 'W'), ...(ac ? [fmtSI(r.q, 'VAR')] : []), r.p < -1e-15 ? 'delivers' : r.p > 1e-15 ? 'absorbs' : '—']),
              ['TOTAL', fmtSI(pb.P, 'W'), ...(ac ? [fmtSI(pb.Q, 'VAR')] : []), pOk ? '✓ = 0' : '✗']] },
          { type: 'kv', title: 'Power summary', rows: [['Delivered by sources', fmtSI(pb.delivered, 'W')], ['Absorbed by the network', fmtSI(pb.absorbed, 'W')]] },
          { type: 'verdict', ok, text: ok ? 'KCL holds at every node and the powers balance to zero.' : 'KCL or the power balance fails. The solution may be unreliable.' },
        ],
      };
    },
  });

  // ================================================================ Substitution
  theorems.register({
    id: 'substitution', name: 'Substitution',
    needs: 'Pick the branch (two-terminal part) to replace.',
    statement: 'If the voltage across a branch (or current through it) in a circuit with a unique solution is known, that branch can be replaced by an ideal voltage source of that voltage (or a current source of that current) and every other voltage and current in the circuit stays the same.',
    run(nl, o) {
      const { mode, freq } = o, ac = mode === 'ac';
      const e = nl.element(Number(o.loadId));
      if (!e || e.nodes.length !== 2) throw new Error('Pick the two-terminal part to substitute.');
      const sol = Incog.solve(nl, { mode, freq });
      const r = sol.get(e.comp.id);
      const reg = Incog.registry;
      const vSub = ac
        ? { comp: { id: '__sub', type: 'Vac', label: 'Vsub', params: {} }, def: reg.get('Vac'), nodes: [e.nodes[0], e.nodes[1]], p: { amp: Cx.abs(r.v), freq, phase: (Cx.arg(r.v) * 180) / Math.PI, offset: 0 } }
        : { comp: { id: '__sub', type: 'Vdc', label: 'Vsub', params: {} }, def: reg.get('Vdc'), nodes: [e.nodes[0], e.nodes[1]], p: { value: r.v.re } };
      const sol2 = Incog.solve(A().variant(nl, { remove: [e.comp.id], add: [vSub] }), { mode, freq });
      let ok = true;
      const rows = nl.elements.filter((x) => x !== e).map((x) => {
        const a = sol.get(x.comp.id), b = sol2.get(x.comp.id);
        const g = close(a.i, b.i, 1e-5) || Cx.abs(Cx.sub(a.i, b.i)) < 1e-10;
        if (!g) ok = false;
        return [x.comp.label, fmtValue(a.i, 'A', ac), fmtValue(b.i, 'A', ac), g ? '✓' : '✗'];
      });
      return {
        ok,
        blocks: [
          { type: 'steps', title: 'Method', items: [
            `In the original circuit ${e.comp.label} has ${fmtValue(r.v, 'V', ac)} across it.`,
            `Replace ${e.comp.label} with an ideal voltage source of ${fmtValue(r.v, 'V', ac)} (same polarity) and solve again.`,
            'Every other current should be unchanged.',
          ] },
          { type: 'table', title: 'Current in every other part', cols: ['Part', 'Original', 'After substitution', '✓'], rows },
          { type: 'verdict', ok, text: ok ? 'Nothing else in the circuit changed. The substitution theorem holds.' : 'Something changed. The circuit may not have a unique solution.' },
        ],
      };
    },
  });

  // ================================================================ Reciprocity
  theorems.register({
    id: 'reciprocity', name: 'Reciprocity',
    needs: 'Pick the source, and the part whose current is the response. Needs one voltage source and a passive network.',
    statement: 'In a linear passive network with a single voltage source, the current response in branch B caused by the source in branch A equals the current in branch A when the same source is moved to branch B.',
    run(nl, o) {
      const { mode, freq } = o, ac = mode === 'ac';
      const src = nl.element(Number(o.sourceId)), br = nl.element(Number(o.loadId));
      if (!src || !(src.comp.type === 'Vdc' || src.comp.type === 'Vac')) throw new Error('Pick a DC or AC voltage source as the source.');
      if (!br || br === src || br.nodes.length !== 2) throw new Error('Pick the second branch (a two-terminal part).');
      if (nl.elements.some((e) => e.def.dependent)) throw new Error('Reciprocity does not hold with dependent sources.');
      const others = nl.elements.filter((e) => A().isIndependent(e) && e !== src);
      if (others.length) throw new Error('Reciprocity needs a single source. Remove or switch off ' + others.map((e) => e.comp.label).join(', ') + '.');
      const reg = Incog.registry;
      // Case 1: source in its own branch, the response branch is replaced by a short that carries the current
      const shortOf = (id, n) => ({ comp: { id, type: 'Vdc', label: 'short', params: {} }, def: reg.get('Vdc'), nodes: [n[0], n[1]], p: { value: 0 } });
      const Vs = ac ? Cx.fromPolar(src.p.amp, (src.p.phase * Math.PI) / 180) : { re: src.p.value, im: 0 };
      const solA = Incog.solve(A().variant(nl, { remove: [br.comp.id], add: [shortOf('__s1', br.nodes)] }), { mode, freq });
      const Ib = solA.get('__s1').i;
      // Case 2: source moved into the response branch, its old place is a short
      const srcTwin = { ...src, nodes: [br.nodes[0], br.nodes[1]] };
      const solB = Incog.solve(A().variant(nl, { remove: [src.comp.id, br.comp.id], add: [shortOf('__s2', src.nodes), srcTwin] }), { mode, freq });
      const Ia = solB.get('__s2').i;
      const ratioA = Cx.div(Ib, Vs), ratioB = Cx.div(Ia, Vs);
      // sign convention: both currents are measured "into the plus side of the element that carries them"
      const ok = close(Cx.neg(ratioA), ratioB, 1e-5) || close(ratioA, ratioB, 1e-5);
      return {
        ok,
        blocks: [
          { type: 'steps', title: 'Method', items: [
            `Case 1: ${src.comp.label} drives the circuit and ${br.comp.label} is replaced by a short circuit that carries the response current.`,
            `Case 2: ${src.comp.label} is moved into the place of ${br.comp.label}; its old place becomes the short circuit that carries the response current.`,
            'The two transfer ratios (current ÷ source voltage) have equal magnitude.' ] },
          { type: 'kv', title: 'Transfer ratios', rows: [
            [`Case 1:  current at ${br.comp.label}'s place ÷ V`, fmtValue(ratioA, 'S', ac)],
            ['Case 2:  current at the old source place ÷ V', fmtValue(ratioB, 'S', ac)],
          ] },
          { type: 'verdict', ok, text: ok ? 'The magnitudes agree. The network is reciprocal.' : 'The ratios differ. Reciprocity does not apply to this circuit (it must be linear, passive, single-source).' },
        ],
      };
    },
  });

  Incog.theorems = theorems;
})(typeof window !== 'undefined' ? window : globalThis);

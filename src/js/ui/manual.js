/* Incog Electric Lab - built-in user manual. Adds a "Manual" button to the top bar (or press F1).
 * To edit the text: change the SECTIONS list below. Each entry is { id, title, html }. */
(function () {
  const SECTIONS = [
    { id: 'start', title: 'Welcome', html: `
      <h2>Welcome to Incog Electric Lab</h2>
      <p>An offline electricity lab with two parts, chosen at the top left:</p>
      <ul>
        <li><b>Circuit Lab</b>: draw a circuit, and the app solves it live (DC, AC and transient). It also solves network theorems step by step.</li>
        <li><b>Field Lab</b>: see electric and magnetic fields, and watch a charged particle move through them in real time.</li>
      </ul>
      <p>Everything runs on your computer. No internet is needed to use it.</p>
      <h3>Your first circuit in 2 minutes</h3>
      <ol>
        <li>Click <b>DC Voltage Source</b> in the Parts list, then click the canvas to place it.</li>
        <li>Place a <b>Resistor</b> and a second <b>Resistor</b> the same way.</li>
        <li>Place a <b>Ground (GND)</b>.</li>
        <li>Press on a part's pin and drag to the next part's pin to wire them. Connect them into a loop.</li>
        <li>Click a part, then type its value in the <b>Properties</b> tab, for example <code>12</code> for the source and <code>1k</code> and <code>2k</code> for the resistors.</li>
        <li>Open the <b>Answers</b> tab. Every voltage, current and power is already there.</li>
      </ol>` },
    { id: 'parts', title: 'Parts', html: `
      <h2>Parts</h2>
      <p>Click a part in the <b>Parts</b> list on the left, then click the canvas to place it. Press <kbd>R</kbd> to rotate it before or after placing. Press <kbd>Enter</kbd> or <kbd>Esc</kbd> to stop placing and go back to the arrow.</p>
      <table class="mtab">
        <tr><td><b>Resistor (R)</b></td><td>Resists current. V = I·R.</td></tr>
        <tr><td><b>Capacitor (C)</b></td><td>Stores charge. Open circuit in DC steady state. Tick <i>Polarized</i> in Properties for an electrolytic capacitor.</td></tr>
        <tr><td><b>Inductor (L)</b></td><td>Stores energy in a magnetic field. Short circuit in DC steady state.</td></tr>
        <tr><td><b>DC / AC voltage source</b></td><td>Constant voltage, or a sine wave with amplitude, frequency and phase.</td></tr>
        <tr><td><b>Pulse / step source</b></td><td>A voltage that switches between two levels. Good for transient (charging) studies.</td></tr>
        <tr><td><b>DC / AC current source</b></td><td>Pushes a set current through whatever is connected.</td></tr>
        <tr><td><b>VCVS (E) and VCCS (G)</b></td><td>Controlled sources: an output voltage or current set by a voltage elsewhere. Handy for op-amp style models.</td></tr>
        <tr><td><b>Switch (S)</b></td><td>Double-click it to open or close it.</td></tr>
        <tr><td><b>Ground (GND)</b></td><td>The 0 V reference. Place one in every circuit.</td></tr>
      </table>` },
    { id: 'wiring', title: 'Wiring and labels', html: `
      <h2>Wiring and labels</h2>
      <ul>
        <li><b>Wire tool</b> (<kbd>W</kbd>): click a start point, click to bend, double-click or press <kbd>Esc</kbd> to finish.</li>
        <li><b>Quick wire:</b> in the arrow tool, press on any part's pin and drag to another pin.</li>
        <li><kbd>Space</kbd> flips the direction of a bend while drawing a wire.</li>
        <li>A wire ending on the middle of another wire makes a junction.</li>
        <li>Every part has a label (R1, V1, C1…). Click a part and change its <b>Label</b> in Properties.</li>
        <li><b>Nodes are named A, B, C…</b> automatically and ground is <code>0</code>. Rename a node in Properties if you want your own name.</li>
        <li>Without a ground the app picks a reference for you and shows a warning in the status bar. Add a GND to choose it yourself.</li>
      </ul>
      <h3>Moving around</h3>
      <ul>
        <li>Mouse wheel zooms. <kbd>+</kbd> <kbd>−</kbd> also zoom, and <b>Fit</b> (<kbd>F</kbd>) shows the whole circuit.</li>
        <li>Pan with the <b>Pan</b> tool (<kbd>H</kbd>), the middle mouse button, or hold <kbd>Space</kbd> and drag.</li>
        <li><kbd>Del</kbd> deletes the selection. <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd> undo and redo. <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicates.</li>
      </ul>` },
    { id: 'props', title: 'Properties and values', html: `
      <h2>Properties and values</h2>
      <p>Click any part, and the <b>Properties</b> tab shows its label, value and options. Changes update the whole circuit at once.</p>
      <p>Values accept engineering shorthand:</p>
      <table class="mtab">
        <tr><td><code>4.7k</code></td><td>4,700</td></tr>
        <tr><td><code>2meg</code></td><td>2,000,000</td></tr>
        <tr><td><code>10u</code></td><td>10 micro (0.00001)</td></tr>
        <tr><td><code>100n</code></td><td>100 nano</td></tr>
        <tr><td><code>22p</code></td><td>22 pico</td></tr>
        <tr><td><code>5m</code></td><td>5 milli</td></tr>
      </table>
      <h3>Sign convention (everywhere in the app)</h3>
      <p>For each part, <b>V = V(pin a) − V(pin b)</b>, and <b>I</b> flows from pin a to pin b <i>through</i> the part. Pin a is the left pin (the top pin after one rotation). A source with <b>negative power</b> is delivering power.</p>` },
    { id: 'analysis', title: 'DC, AC and Transient', html: `
      <h2>Analysis modes</h2>
      <p>Choose the mode in the analysis bar under the toolbar.</p>
      <ul>
        <li><b>DC:</b> steady state with constant sources. Capacitors act as open circuits, inductors as shorts.</li>
        <li><b>AC:</b> sinusoidal steady state at the frequency you type. Results are <b>peak</b> values (tick <i>RMS</i> to see RMS). An AC source only contributes when its frequency matches the analysis frequency.</li>
        <li><b>Transient:</b> how voltages and currents change over time, for example a capacitor charging. Press <b>▶ Run</b>, watch the circuit animate, and see the curves in the <b>Scope</b> tab. Use <b>Reset</b> to start again.</li>
      </ul>
      <h3>Scope tab</h3>
      <p>Plots signals over time in Transient mode. It also offers an <b>AC sweep</b> (a Bode plot with the peak, the −3 dB points, bandwidth and Q) and a <b>DC sweep</b>.</p>` },
    { id: 'answers', title: 'Answers and the probe', html: `
      <h2>Answers tab</h2>
      <p>Lists every voltage, current and power in the circuit. Type in the search box to filter, for example <code>I R1</code>, <code>voltage</code> or <code>B</code>.</p>
      <p>You can also type a formula:</p>
      <ul>
        <li><code>V(A)-V(B)</code>: the voltage between two nodes</li>
        <li><code>I(R1)+I(R2)</code>: add currents</li>
        <li><code>mag(V(C))/mag(I(R1))</code>, <code>phase(V(C))</code>, <code>db(V(C))</code> (AC mode)</li>
      </ul>
      <p>Open <b>Show the working</b> to see the equations at each node, the current check at each node, and the power balance.</p>
      <h3>Test probe</h3>
      <p>Choose the <b>Probe</b> tool (<kbd>P</kbd>) and click a wire, pin or part to place a live readout there. Hovering over anything shows a tooltip with its values.</p>` },
    { id: 'theorems', title: 'Network theorems', html: `
      <h2>Network theorems</h2>
      <p>Open the <b>Theorems</b> tab. Each theorem shows its statement, the working step by step, a table of numbers, and a ✓ or ✗ check against the full circuit. The results update live as you edit the circuit.</p>
      <ul>
        <li><b>Superposition:</b> turns sources on one at a time and adds the results.</li>
        <li><b>Thevenin and Norton:</b> replace the circuit seen from two terminals with a source and one resistance.</li>
        <li><b>Maximum power transfer:</b> finds the load that receives the most power.</li>
        <li><b>Substitution, Reciprocity and KCL / Tellegen:</b> checks that confirm the circuit obeys the theorem.</li>
      </ul>
      <p>These need a <b>linear</b> circuit (resistors, capacitors, inductors, sources and controlled sources).</p>` },
    { id: 'field', title: 'Field Lab', html: `
      <h2>Field Lab</h2>
      <p>Switch with the <b>Field Lab</b> tab at the top. It is a 2-D view and runs in real time.</p>
      <h3>Electric field</h3>
      <p>Add positive and negative charges, drag them around, and watch the field lines, equipotential lines, colour map and arrows change. Choose a preset (for example a dipole) to start quickly. The <b>Overview</b> box on the left shows, without clicking anything, the total charge, the energy, the force between every pair of charges (the two charges of a pair feel equal and opposite forces) and the net force on each charge. Click a charge to see its own forces one by one.</p>
      <h3>Magnetic field</h3>
      <p>Add wires carrying current out of or into the screen, and magnets. A magnet can be a <b>bar (N + S)</b>, or an isolated <b>N pole only</b> or <b>S pole only</b> (an idealisation, like a point charge). Select a bar and drag the yellow handle at its north end to rotate it, or press <b>R</b> for +15°. The <b>Overview</b> box shows the force between each pair of wires and the net force on every item.</p>
      <h3>Particle</h3>
      <p>Add as many particles as you like (electron, positron, proton, alpha, custom) with the ＋ buttons. They all move in the same uniform electric and magnetic fields. <b>All particles at a glance</b> compares them (charge, mass, speed, radius, period, turning direction); click a particle in the list or on the canvas to see its own force, energy, radius and period with the formulas. Set speed, direction and start position for each one. Tick <b>Real time</b> to put them on one shared clock. Press <b>▶ Start</b> to watch it move: it curves in a magnetic field, accelerates in an electric field, and drifts when both are present. Use the speed slider to slow it down.</p>
      <h3>Tips</h3>
      <ul>
        <li>Hover over the canvas to read the field at that point.</li>
        <li>Scroll to zoom, drag the background to pan, drag items to move them. <kbd>Del</kbd> removes the selected item.</li>
        <li><b>◧ Panel</b> hides or shows the side panel.</li>
      </ul>` },
    { id: 'files', title: 'Saving and opening', html: `
      <h2>Saving and opening</h2>
      <ul>
        <li><b>Save</b> (<kbd>Ctrl</kbd>+<kbd>S</kbd>) writes your circuit to a real <code>.incog</code> file on your computer. The first time you choose where. After that it overwrites the same file.</li>
        <li><b>Save As</b> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) saves a copy under a new name.</li>
        <li><b>Open</b> (<kbd>Ctrl</kbd>+<kbd>O</kbd>) loads a <code>.incog</code> file. In the installed app you can also double-click a <code>.incog</code> file.</li>
        <li>The window title shows the file name, with a • in front when there are unsaved changes.</li>
        <li><b>New</b> clears the canvas.</li>
      </ul>
      <p>You can send a <code>.incog</code> file to another person, and they can open it in their copy of the app.</p>` },
    { id: 'panels', title: 'Panels and layout', html: `
      <h2>Panels and layout</h2>
      <ul>
        <li><b>◧ Parts</b> (or <kbd>[</kbd>) slides the Parts list in or out.</li>
        <li><b>Panel ◨</b> (or <kbd>]</kbd>) slides the right-hand panel in or out.</li>
        <li>Hide both for a larger drawing area. The top bars always stay. Your choice is remembered.</li>
        <li><b>Theme</b> switches between dark and light.</li>
      </ul>` },
    { id: 'updates', title: 'Updates', html: `
      <h2>Updates</h2>
      <p>The installed app checks quietly for a newer version when it opens. If there is one, it <b>asks you first</b>: choose <i>Update now</i> or <i>Not now</i>. If you choose Not now, you can keep using your current version, and you will be asked again the next time you open the app.</p>
      <p>You can also click <b>Update</b> in the top bar at any time. Your saved circuit files are never touched by an update.</p>
      <p>Without an internet connection the app works exactly the same, and it just skips the check. The portable version does not update itself: download the newest version instead.</p>` },
    { id: 'keys', title: 'Shortcuts', html: `
      <h2>Keyboard shortcuts</h2>
      <table class="mtab">
        <tr><td><kbd>V</kbd> <kbd>W</kbd> <kbd>P</kbd> <kbd>H</kbd></td><td>Select, Wire, Probe, Pan</td></tr>
        <tr><td><kbd>R</kbd></td><td>Rotate</td></tr>
        <tr><td><kbd>Enter</kbd> / <kbd>Esc</kbd></td><td>Back to the arrow / cancel</td></tr>
        <tr><td><kbd>+</kbd> <kbd>−</kbd> <kbd>F</kbd></td><td>Zoom in, zoom out, fit</td></tr>
        <tr><td><kbd>Del</kbd></td><td>Delete selection</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></td><td>Undo / redo</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd></td><td>Duplicate</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select everything</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>O</kbd></td><td>Save / Save As / Open</td></tr>
        <tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Slide the Parts / right panel</td></tr>
        <tr><td><kbd>F1</kbd></td><td>Open this manual</td></tr>
      </table>` },
    { id: 'help', title: 'Troubleshooting', html: `
      <h2>Troubleshooting and limits</h2>
      <ul>
        <li><b>"No ground symbol placed":</b> add a Ground part. The app guessed a 0 V point meanwhile.</li>
        <li><b>"No source in the circuit":</b> add a voltage or current source.</li>
        <li><b>Two voltage sources in parallel, or a loop of only sources and inductors:</b> this has no single answer. Add a small resistor.</li>
        <li><b>AC source shows nothing:</b> its frequency must equal the analysis frequency.</li>
        <li><b>Linear parts only:</b> resistors, capacitors, inductors, sources, controlled sources and switches. There are no diodes or transistors yet.</li>
        <li><b>Field Lab is 2-D:</b> good for intuition, not a finite-element solver.</li>
      </ul>` },
  ];

  const css = document.createElement('style');
  css.textContent = `
    #manualDlg .mcard { position: relative; display: grid; grid-template-columns: 210px 1fr; width: min(1000px, 94vw); height: min(680px, 90vh); background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); overflow: hidden; }
    #manualDlg nav { background: var(--panel2); border-right: 1px solid var(--line); padding: 14px 10px; overflow-y: auto; }
    #manualDlg nav b { display: block; padding: 2px 10px 10px; font-size: 14px; }
    #manualDlg nav button { display: block; width: 100%; text-align: left; padding: 7px 10px; margin: 1px 0; background: transparent; border: 0; border-radius: 6px; color: var(--muted); cursor: pointer; }
    #manualDlg nav button:hover { color: var(--text); background: var(--line); }
    #manualDlg nav button.active { background: var(--accent); color: var(--accent-text); }
    #manualDlg .mbody { padding: 22px 30px 30px; overflow-y: auto; line-height: 1.55; font-size: 13.5px; }
    #manualDlg .mbody h2 { margin: 0 0 10px; } #manualDlg .mbody h3 { margin: 18px 0 6px; font-size: 13px; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
    #manualDlg .mbody li { margin: 5px 0; } #manualDlg .mbody ul, #manualDlg .mbody ol { padding-left: 22px; }
    #manualDlg .mtab { border-collapse: collapse; width: 100%; margin: 6px 0; } #manualDlg .mtab td { border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; } #manualDlg .mtab td:first-child { white-space: nowrap; width: 38%; }
    #manualDlg code { background: var(--input); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }
    #manualDlg .dlg-close { position: absolute; right: 12px; top: 10px; z-index: 2; }
    #manualDlg kbd { background: var(--input); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 5px; font-size: 12px; }`;
  document.head.appendChild(css);

  const dlg = document.createElement('div'); dlg.id = 'manualDlg'; dlg.className = 'dlg hidden';
  const card = document.createElement('div'); card.className = 'mcard';
  const nav = document.createElement('nav'); nav.innerHTML = '<b>User manual</b>';
  const body = document.createElement('div'); body.className = 'mbody';
  const close = document.createElement('button'); close.className = 'dlg-close'; close.textContent = '✕'; close.title = 'Close (Esc)';
  card.append(nav, body, close); dlg.appendChild(card); document.body.appendChild(dlg);

  const buttons = {};
  function show(id) {
    const s = SECTIONS.find((x) => x.id === id) || SECTIONS[0];
    body.innerHTML = s.html; body.scrollTop = 0;
    Object.keys(buttons).forEach((k) => buttons[k].classList.toggle('active', k === s.id));
  }
  SECTIONS.forEach((s) => { const b = document.createElement('button'); b.textContent = s.title; b.onclick = () => show(s.id); nav.appendChild(b); buttons[s.id] = b; });

  const open = (id) => { show(id || 'start'); dlg.classList.remove('hidden'); };
  const shut = () => dlg.classList.add('hidden');
  close.onclick = shut;
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) shut(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') { e.preventDefault(); dlg.classList.contains('hidden') ? open() : shut(); }
    else if (e.key === 'Escape' && !dlg.classList.contains('hidden')) shut();
  });

  const bar = document.getElementById('fileBtns'), help = document.getElementById('btnHelp');
  if (bar) { const b = document.createElement('button'); b.id = 'btnManual'; b.textContent = 'Manual'; b.title = 'User manual (F1)'; b.onclick = () => open(); bar.insertBefore(b, help || null); }
  window.Incog = window.Incog || {}; window.Incog.manual = { open, close: shut };
})();
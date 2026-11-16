# Incog Electric Lab

An offline desktop lab for electricity.

- **Circuit Lab:** draw circuits, simulate **DC**, **AC (phasors)** and **Transient** analysis live, with network theorems solved step by step.
- **Field Lab:** electric field, magnetic field and a charged-particle simulator.

It is a standard Node + Electron project. The app itself is plain HTML, CSS and JavaScript in `src/`:
**no framework, no bundler, no build step**, so you can paste, replace and delete code in any file and just reload.

---

## 1. Quick start (in VS Code)

1. `File → Open Folder…` and choose this folder.
2. Open the terminal (`Ctrl+\``). You are already inside the project folder. Then:

```
npm install        # once. Installs Electron (needs internet this one time only)
npm run dev        # opens the desktop window with developer tools
```

| Command | What it does |
|---|---|
| `npm run dev` | Desktop window + developer tools (F5 inside the window reloads after you edit) |
| `npm start` | Desktop window, no developer tools |
| `npm run web` | Serves `src/` at http://localhost:5173. Edit, then refresh the browser. No Electron needed |
| `npm test` | Self-checks of the solver and field physics (needs only Node.js) |
| `npm run build` | Builds an installer into `dist/` (`.exe` on Windows, `.dmg` on Mac, `.AppImage` on Linux) |

Prefer clicking? `Terminal → Run Task…` lists the same things, and **F5** in VS Code launches the app.
Without installing anything you can also just open `src/index.html` in Chrome or Edge. It works offline.

**Sending it to other people:** run `npm run build`, then send the installer from `dist/`
(about 80 to 120 MB because it contains the Electron runtime). Build on the system you are targeting, or use the
GitHub workflow in section 5, which builds all three for you. Or simply zip the folder and send it.

---

## 2. Project layout

```
package.json            scripts and installer settings
electron/main.js        the Electron wrapper (~25 lines: opens src/index.html in a window)
scripts/serve.js        tiny local web server for `npm run web`
tests/                  self-checks (`npm test`)
.vscode/                VS Code settings, F5 launch config, tasks
.github/workflows/      builds installers on GitHub

src/                    THE APP. Edit here
  index.html            window layout + the <script> list at the bottom
  css/style.css         ALL colours, sizes, fonts (theme variables at the top)
  js/app.js             wires everything together (modes, run loop, save / open)
  js/core/              the physics. No drawing, no HTML. Safe to test in Node
    util.js             complex numbers, "4.7k" parsing, unit formatting
    linalg.js           matrix solver
    components.js       THE PART LIBRARY: one register({...}) block per part
    circuit.js          circuit model (parts, wires, probes), save / load
    netlist.js          turns drawn wires into electrical nodes (A, B, C...)
    solver.js           DC / AC / transient solver (modified nodal analysis)
    analysis.js         answers list, formula engine, KCL and power checks
    theorems.js         the network theorems
    examples.js         the Examples menu
  js/ui/                the interface
    editor.js           the drawing canvas (zoom, wires, probes, undo)
    tabs.js             tab system + tiny HTML helper h()
    properties.js  answers.js  theorems-ui.js  scope.js     one file per right-hand tab
    plot.js             graph drawing
  js/fields/
    physics.js          electric / magnetic field maths, particle motion
    fieldlab.js         Field Lab screen
```

Script order matters: `src/index.html` loads files in dependency order (core first, then ui, then app.js).
When you add a new `.js` file, add its `<script>` line there.

### If you don't like how something looks
- **Colours / spacing / fonts:** `src/css/style.css` (`body.theme-dark` and `body.theme-light` hold every colour).
- **Canvas colours** (wires, parts, labels): the `THEMES` object at the top of `src/js/ui/editor.js`.
- **Where buttons sit:** `src/index.html`.
- **One tab looks wrong:** replace just that file in `src/js/ui/`.

### Add a new part (diode model, transformer...)
In `src/js/core/components.js`, copy the Resistor block at the bottom and change the type, name, pins, parameters,
`stamp()` (how it enters the equations) and `draw()` (its symbol). It appears in the Parts list, the Properties form,
the Answers list and every theorem automatically.

### Add a new theorem
In `src/js/core/theorems.js` call `theorems.register({ id, name, statement, needs, run(nl, opts) })` and return a list of
blocks (`text`, `steps`, `table`, `kv`, `verdict`, `plot`). The Theorems tab renders it.

### Add a right-hand tab
Create `src/js/ui/mytab.js` that calls `Incog.tabs.register({ id, title, mount, refresh })`, then add one
`<script src="js/ui/mytab.js"></script>` line in `src/index.html`.

### Add an example circuit / Field Lab preset
Push one entry into `src/js/core/examples.js` (circuits) or the `PRESETS` object in `src/js/fields/fieldlab.js`.

---

## 3. Using the Circuit Lab

| Do this | How |
|---|---|
| Place a part | Click it in **Parts** (left), then click the canvas. `R` rotates, `Esc` stops placing |
| Wire parts | **Wire** tool (`W`), or press on any part's pin and drag. Click to bend, double-click / `Esc` to finish. `Space` flips the bend direction |
| Ground | Place a **Ground** part. Without one the app picks a reference and warns you |
| Label / value | Click a part → **Properties** tab. Values accept `4.7k`, `10u`, `2meg`, `100n` |
| Zoom / pan | Mouse wheel zooms. Middle-mouse, `Space`+drag or the **Pan** tool pans. `F` fits the circuit |
| Test probe | **Probe** tool (`P`): click a wire, pin or part to stamp a live readout. Hover anything for a tooltip |
| Switch on/off | Double-click a switch |
| Save / open | **Save** writes a `.incog` file; **Open** loads it. The last circuit is also restored when you reopen the app |

**Nodes are named A, B, C… automatically**; ground is `0`. Rename a node in Properties.

**Sign convention (everywhere):** for each part, `V = V(pin a) − V(pin b)` and `I` flows from pin a to pin b *through* the part.
Pin a is the left pin (top pin after one rotation). A source with negative power is delivering power.

### Answers tab
Every voltage, current and power in the circuit. Type to search (`I R1`, `voltage`, `B`), or type a formula:
`V(A)-V(B)`, `I(R1)+I(R2)`, `mag(V(C))/mag(I(R1))`, `phase(V(C))`, `db(V(C))`.
Open **Show the working** for the KCL equations at each node, the current check at each node, and the power balance.

### Theorems tab
Superposition · Thevenin · Norton · Maximum power transfer · Substitution · Reciprocity · KCL / Tellegen check.
Each one shows the steps, a table of numbers, a ✓/✗ check against the full circuit, and stays live as you edit the circuit.

### Analysis modes
- **DC**: capacitors open, inductors short.
- **AC**: sinusoidal steady state at the frequency you type. Values are **peak** phasors (tick *RMS* to show RMS).
  AC sources contribute only if their frequency equals the analysis frequency.
- **Transient**: press **Run**. Trapezoidal integration. Plot signals on the **Scope** tab.
- **Scope tab** also has an **AC sweep** (Bode plot, peak, −3 dB points, bandwidth, Q) and a **DC sweep**.

---

## 4. Limits (so there are no surprises)

- **Linear circuits only:** R, L, C, independent sources, controlled sources (VCVS, VCCS), switches. No diodes or transistors yet.
  An ideal op-amp can be modelled with a VCVS of very large gain. Network theorems (superposition, Thevenin…) require linear circuits.
- AC analysis is single-frequency. For sources of different frequencies, run superposition once per frequency.
- Two ideal voltage sources in parallel, or a loop of only voltage sources / inductors, has no unique solution. The app tells you.
- Current-flow animation is drawn on parts (not along every wire).
- **Field Lab is 2-D.** Point charges use the 3-D law E = kq/r² on a plane; wires are infinitely long, perpendicular to the screen.
  Magnets are a two-pole model. It is for building intuition, not a finite-element solver.
- Not yet included: mutual inductance / transformers, 3-phase helpers, Fourier analysis. These are natural next additions
  (each fits in one new part or one new tab, as described above).

---

## 5. Electron and GitHub

**Electron:** `electron/main.js` is the whole wrapper. If you already have your own Electron wrapper in another project,
copy its `main.js` over this one; the only requirement is that it loads `src/index.html`. The app needs no Node features,
so the window stays locked down (`nodeIntegration: false`).

**Pushing to GitHub** (terminal inside the folder). Create an empty repository on github.com first, then:

```
git init
git add .
git commit -m "Incog Electric Lab first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

`.gitignore` already keeps `node_modules` and `dist` out of the repository.

**Installers built automatically:** `.github/workflows/build.yml` builds Windows, Mac and Linux installers on GitHub's
servers when you push a version tag:

```
git tag v1.0.0
git push origin v1.0.0
```

Then open the repository's **Actions** tab and download the installers from the finished run.

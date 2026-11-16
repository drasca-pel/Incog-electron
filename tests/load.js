// Loads the browser scripts (classic scripts that attach to globalThis.Incog) in the same order as index.html
const path = require('path');
const order = [
  'core/util.js', 'core/linalg.js', 'core/components.js', 'core/circuit.js', 'core/netlist.js', 'core/solver.js',
  'core/analysis.js', 'core/theorems.js', 'core/examples.js',
];
const fs = require('fs');
for (const f of order) {
  const p = path.join(__dirname, '..', 'src', 'js', f);
  if (fs.existsSync(p)) require(p);
}
module.exports = globalThis.Incog;

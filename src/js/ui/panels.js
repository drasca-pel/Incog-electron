/* Incog Electric Lab - slide-out side panels (Parts on the left, Properties on the right).
 * Self-contained: adds its own two buttons to the toolbar. Keys: [ hides/shows Parts, ] hides/shows Properties. */
(function () {
  const lab = document.getElementById('lab-circuit'), bar = document.getElementById('toolbar');
  if (!lab || !bar) return;
  let st = { left: false, right: false };                       // true = hidden
  try { Object.assign(st, JSON.parse(localStorage.getItem('incog.panels') || '{}')); } catch (e) { /* both visible */ }

  const mk = (id, text, tip) => { const b = document.createElement('button'); b.id = id; b.textContent = text; b.title = tip; return b; };
  const bL = mk('btnLeft', '◧ Parts', 'Slide the Parts list in / out  ( [ )');
  const bR = mk('btnRight', 'Panel ◨', 'Slide the Properties panel in / out  ( ] )');
  const gL = document.createElement('div'); gL.className = 'group'; gL.appendChild(bL);
  const gR = document.createElement('div'); gR.className = 'group'; gR.appendChild(bR);
  const sp = document.createElement('div'); sp.className = 'spacer';
  bar.insertBefore(gL, bar.firstChild); bar.appendChild(sp); bar.appendChild(gR);

  function apply() {
    lab.classList.toggle('hide-left', st.left); lab.classList.toggle('hide-right', st.right);
    bL.classList.toggle('active', !st.left); bR.classList.toggle('active', !st.right);
    try { localStorage.setItem('incog.panels', JSON.stringify(st)); } catch (e) { /* ignore */ }
  }
  bL.onclick = () => { st.left = !st.left; apply(); };
  bR.onclick = () => { st.right = !st.right; apply(); };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
    if (e.key === '[') { st.left = !st.left; apply(); } else if (e.key === ']') { st.right = !st.right; apply(); }
  });
  apply();
})();

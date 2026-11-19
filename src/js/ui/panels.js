/* ============================================================================
 * Incog Electric Lab - ui/panels.js
 * ONE controller for every panel, menu and sheet.
 *
 *  Desktop : Parts (left) and Properties (right) slide in/out with the toolbar
 *            buttons or the [ and ] keys.
 *  Phone   : Parts / Analysis / Panel are bottom sheets opened from the bottom tab bar.
 *            Only one is open at a time; each has a ✕; tapping the canvas or the same
 *            tab again closes it. Choosing a part closes the Parts sheet so you can place it.
 *  Menu    : the ☰ button (both layouts).
 * ========================================================================== */
(function () {
  const $ = (id) => document.getElementById(id);
  const lab = $('lab-circuit'), bar = $('toolbar');
  if (!lab || !bar) return;
  const isMobile = () => document.documentElement.classList.contains('mobile');
  const SHEETS = { parts: $('palette'), props: $('side'), analysis: $('analysisbar') };
  // a grab handle ON each sheet: tap (or swipe down on) it to close that sheet
  [$('palette'), $('side'), $('analysisbar')].forEach((sh) => {
    if (!sh) return;
    const g = document.createElement('button'); g.type = 'button'; g.className = 'grabber mobonly'; g.setAttribute('aria-label', 'Close panel'); g.setAttribute('data-close', 'x');
    (sh.querySelector('.sheet-head') || sh.querySelector('.tabrow')).appendChild(g);
  });
  const navBtns = Array.from(document.querySelectorAll('#bottomNav [data-sheet]'));

  /* ---------- desktop slide-out panels ---------- */
  let st = { left: false, right: false };                       // true = hidden
  try { Object.assign(st, JSON.parse(localStorage.getItem('incog.panels') || '{}')); } catch (e) { /* both visible */ }
  const mk = (id, text, tip) => { const b = document.createElement('button'); b.id = id; b.textContent = text; b.title = tip; return b; };
  const bL = mk('btnLeft', '◧ Parts', 'Slide the Parts list in / out  ( [ )');
  const bR = mk('btnRight', 'Panel ◨', 'Slide the Properties panel in / out  ( ] )');
  const holder = $('panelBtns'); if (holder) { holder.appendChild(bL); holder.appendChild(bR); }
  function applyDesktop() {
    lab.classList.toggle('hide-left', st.left); lab.classList.toggle('hide-right', st.right);
    bL.classList.toggle('active', !st.left); bR.classList.toggle('active', !st.right);
    try { localStorage.setItem('incog.panels', JSON.stringify(st)); } catch (e) { /* ignore */ }
  }
  bL.onclick = () => { st.left = !st.left; applyDesktop(); };
  bR.onclick = () => { st.right = !st.right; applyDesktop(); };

  /* ---------- phone bottom sheets ---------- */
  let current = null;
  function closeSheets() {
    current = null;
    Object.values(SHEETS).forEach((el) => el && el.classList.remove('open'));
    navBtns.forEach((b) => b.classList.remove('active'));
  }
  function openSheet(name) {
    if (!isMobile()) { // desktop: make sure the matching side panel is visible
      if (name === 'parts') st.left = false; else if (name === 'props') st.right = false; applyDesktop(); return;
    }
    closeSheets(); closeMenu();
    current = name; SHEETS[name].classList.add('open');
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
  }
  const toggleSheet = (name) => (current === name ? closeSheets() : openSheet(name));
  navBtns.forEach((b) => b.addEventListener('click', () => toggleSheet(b.dataset.sheet)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheets));
  const wrap = $('canvasWrap');
  if (wrap) wrap.addEventListener('pointerdown', () => { if (isMobile() && current) closeSheets(); closeMenu(); }, true);
  document.addEventListener('incog:part-picked', () => { if (isMobile()) closeSheets(); });
  document.addEventListener('incog:open-props', () => openSheet('props'));
  window.addEventListener('resize', () => { if (!isMobile()) closeSheets(); });

  /* ---------- ☰ menu ---------- */
  const menu = $('fileBtns'), scrim = $('menuScrim'), mbtn = $('btnMenu');
  function closeMenu() { if (!menu) return; menu.classList.add('hidden'); scrim.classList.add('hidden'); mbtn.setAttribute('aria-expanded', 'false'); }
  function openMenu() { closeSheets(); menu.classList.remove('hidden'); scrim.classList.remove('hidden'); mbtn.setAttribute('aria-expanded', 'true'); }
  mbtn.onclick = () => (menu.classList.contains('hidden') ? openMenu() : closeMenu());
  scrim.addEventListener('pointerdown', closeMenu);
  // picking an item closes the menu (not when just touching the Examples dropdown)
  menu.addEventListener('click', (e) => { if (e.target.closest('button')) setTimeout(closeMenu, 0); });
  menu.addEventListener('change', closeMenu);
  window.Incog = window.Incog || {};
  window.Incog.panels = { openSheet, closeSheets, closeMenu };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); closeSheets(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '')) return;
    if (isMobile()) return;
    if (e.key === '[') { st.left = !st.left; applyDesktop(); } else if (e.key === ']') { st.right = !st.right; applyDesktop(); }
  });
  applyDesktop();
})();

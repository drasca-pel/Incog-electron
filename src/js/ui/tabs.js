/* ============================================================================
 * Incog Electric Lab - ui/tabs.js
 * Tiny helpers + the TAB REGISTRY for the right-hand panel.
 * To add a new tab: create a file that calls Incog.tabs.register({ id, title, mount, refresh })
 * and add a <script> tag for it in index.html. Nothing else changes.
 *
 *   mount(root, app)            build the tab's DOM once
 *   refresh(app, reason)        reason: 'select' | 'change' | 'live' | 'mode' | 'show'
 *   live: true                  (optional) also refresh on every live tick while running
 * ========================================================================== */
(function (root) {
  'use strict';
  const Incog = (root.Incog = root.Incog || {});

  /** h('div', {class:'x', onclick:fn}, 'text', childEl, ...) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const tabs = {
    list: [],
    active: null,
    register(t) { this.list = this.list.filter((x) => x.id !== t.id); this.list.push(t); },
    get(id) { return this.list.find((t) => t.id === id); },
    build(app, navEl, bodyEl) {
      this.app = app; this.nav = navEl; this.body = bodyEl;
      navEl.innerHTML = ''; bodyEl.innerHTML = '';
      for (const t of this.list) {
        t.btn = h('button', { class: 'tabbtn', onclick: () => this.show(t.id) }, t.title);
        t.pane = h('div', { class: 'tabpane hidden' });
        navEl.appendChild(t.btn); bodyEl.appendChild(t.pane);
        t.mount(t.pane, app);
      }
      this.show(this.list[0].id);
    },
    show(id) {
      this.active = id;
      for (const t of this.list) { t.btn.classList.toggle('active', t.id === id); t.pane.classList.toggle('hidden', t.id !== id); }
      const t = this.get(id); if (t && t.refresh) t.refresh(this.app, 'show');
    },
    notify(reason) {
      const t = this.get(this.active);
      if (!t || !t.refresh) return;
      if (reason === 'live' && !t.live) return;
      t.refresh(this.app, reason);
    },
  };

  Incog.h = h; Incog.esc = esc; Incog.tabs = tabs;
})(typeof window !== 'undefined' ? window : globalThis);

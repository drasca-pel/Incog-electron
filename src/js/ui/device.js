/* Incog Electric Lab - ui/device.js
 * Decides "phone/tablet layout" vs "desktop layout" and puts class "mobile" on <html>.
 * Loaded in <head> (before the page paints) so there is no flash of the wrong layout.
 * To change when the phone layout kicks in, edit the query below (the CSS only looks at html.mobile). */
(function () {
  var q = window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1000px)');
  function set() {
    document.documentElement.classList.toggle('mobile', q.matches);
    window.dispatchEvent(new Event('resize'));
  }
  document.documentElement.classList.toggle('mobile', q.matches);
  if (q.addEventListener) q.addEventListener('change', set); else if (q.addListener) q.addListener(set);
  window.Incog = window.Incog || {};
  window.Incog.isMobile = function () { return document.documentElement.classList.contains('mobile'); };
})();

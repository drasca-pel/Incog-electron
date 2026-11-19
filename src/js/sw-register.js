/* Registers the offline service worker (kept in its own file because the page's security policy blocks inline scripts). */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
}

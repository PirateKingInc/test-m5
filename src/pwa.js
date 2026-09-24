// The installable-app layer: service worker registration, the update banner
// and the install banner. It is loaded as its own module, after the game, and
// touches nothing the game owns - if any of this is unsupported or fails, the
// game is still an ordinary web page and plays exactly the same.

export const SW_URL = './sw.js';
const HOUR = 60 * 60 * 1000;

const $ = (id) => document.getElementById(id);

/** Shows or hides a banner, and gives focus back to the page on hide. */
function setBanner(el, show) {
  if (!el) return;
  el.hidden = !show;
  if (!show && el.contains(document.activeElement)) document.activeElement.blur();
}

// --------------------------------------------------------------------------
// Updates. A new deploy installs a new worker next to the running one and it
// waits. The player is told, and chooses when to reload - a game in progress
// is never swapped out from under them, and never left on stale files either.
// --------------------------------------------------------------------------

let reloading = false;

function offerUpdate(worker) {
  const banner = $('pwa-update');
  if (!banner) return;
  setBanner(banner, true);
  banner.querySelector('[data-pwa="reload"]').onclick = () => {
    reloading = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
    // If the new worker has already taken over there is no controllerchange
    // coming; reload anyway rather than leave the button doing nothing.
    setTimeout(() => window.location.reload(), 3000);
  };
  banner.querySelector('[data-pwa="later"]').onclick = () => setBanner(banner, false);
}

function watchForUpdates(reg) {
  // A worker already waiting from an earlier visit counts, not just new ones.
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      // With no controller this is the first install, not an update.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });
  const check = () => reg.update().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, HOUR);
}

export async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only the reload the player asked for. The first install also changes
    // controller, and that must not restart a game someone just began.
    if (reloading) window.location.reload();
  });
  try {
    const reg = await navigator.serviceWorker.register(SW_URL);
    watchForUpdates(reg);
    return reg;
  } catch {
    return null;
  }
}

registerWorker();

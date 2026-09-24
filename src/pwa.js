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
  setBanner($('pwa-install'), false); // one banner at a time; the update matters more
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

// --------------------------------------------------------------------------
// Installing. Chromium browsers hand over a deferred native prompt, which the
// INSTALL button opens. iOS has no prompt at all, so there the banner says how
// to do it by hand instead of offering a button that cannot work. Anywhere
// else, nothing is shown - and nothing about playing ever depends on it.
// --------------------------------------------------------------------------

// Its own key: a dismissal is a preference, and must never touch the save.
export const DISMISS_KEY = 'brackenfall.pwa.install-dismissed';
const DISMISS_FOR = 14 * 24 * HOUR;

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

export function isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away (no Mac
  // has a touchscreen).
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0);
}

function recentlyDismissed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return at > 0 && Date.now() - at < DISMISS_FOR;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode: it will simply be offered again next time.
  }
}

let deferredPrompt = null;

function offerInstall(mode) {
  const banner = $('pwa-install');
  if (!banner || isStandalone() || recentlyDismissed()) return;
  if ($('pwa-update') && !$('pwa-update').hidden) return;
  const button = banner.querySelector('[data-pwa="install"]');
  const message = banner.querySelector('[data-pwa="message"]');
  if (mode === 'ios') {
    message.textContent = 'INSTALL: TAP SHARE \u2191 THEN "ADD TO HOME SCREEN".';
    button.hidden = true;
  } else {
    button.hidden = false;
    button.onclick = async () => {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      setBanner(banner, false);
      if (!prompt) return;
      prompt.prompt();
      // A refusal counts as a dismissal; an acceptance ends in appinstalled.
      const choice = await prompt.userChoice.catch(() => null);
      if (choice?.outcome !== 'accepted') rememberDismissal();
    };
  }
  banner.querySelector('[data-pwa="dismiss"]').onclick = () => {
    rememberDismissal();
    setBanner(banner, false);
  };
  setBanner(banner, true);
}

function askForDurableStorage() {
  // Installed apps are the case where losing a save would hurt most. Chrome
  // grants this to installed apps; elsewhere it is a polite request.
  navigator.storage?.persist?.().catch(() => {});
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  offerInstall('native');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  setBanner($('pwa-install'), false);
  askForDurableStorage();
});

if (isStandalone()) askForDurableStorage();
else if (isIos()) offerInstall('ios');

registerWorker();

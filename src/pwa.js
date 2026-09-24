// The installable-app layer: service worker registration, the update banner
// and the install banner. It is loaded as its own module, after the game, and
// touches nothing the game owns - if any of this is unsupported or fails, the
// game is still an ordinary web page and plays exactly the same.

export const SW_URL = './sw.js';

export function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  return navigator.serviceWorker.register(SW_URL).catch(() => null);
}

registerWorker();

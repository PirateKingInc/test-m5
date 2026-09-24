// The service worker registers, precaches everything, and the game then loads
// and plays with the server gone and the network switched off.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skip, launch, site, untilControlled, untilGame, hold, root } from './helpers.js';

const precacheList = () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  return [...sw.matchAll(/^ {2}'\.\/([^']*)',$/gm)].map((m) => m[1]);
};

test('the worker registers, activates and precaches every file', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const names = await caches.keys();
      const cache = await caches.open(names[0]);
      const keys = (await cache.keys()).map((r) => r.url);
      return { scope: reg.scope, active: reg.active?.state, names, keys };
    });
    assert.equal(state.scope, s.url);
    assert.equal(state.active, 'activated');
    assert.equal(state.names.length, 1);
    assert.match(state.names[0], /^brackenfall-[0-9a-f]{12}$/);
    const want = precacheList().map((f) => `${s.url}${f}`).sort();
    assert.deepEqual(state.keys.sort(), want);
  } finally {
    await browser.close();
    await s.stop();
  }
});

test('after one visit the game loads and plays with no network at all', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);

    // Pull the plug twice over: the server is gone and the browser is offline.
    await s.close();
    await context.setOffline(true);
    const seenByServer = s.requests.length;

    const failed = [];
    const fromNetwork = [];
    const watch = (p) => {
      p.on('requestfailed', (r) => failed.push(r.url()));
      p.on('response', (r) => { if (!r.fromServiceWorker()) fromNetwork.push(r.url()); });
    };

    // A fresh tab, as if the player came back tomorrow.
    const offline = await context.newPage();
    watch(offline);
    await offline.goto(s.url);
    await untilGame(offline);
    assert.equal(await offline.evaluate(() => navigator.onLine), false);

    // Start a new game and walk. It is a real, running game, not a cached shell.
    await hold(offline, 'Enter', 120);
    await offline.waitForFunction(() => window.brackenfall.game.scene === 'play');
    const x0 = await offline.evaluate(() => window.brackenfall.game.player.x);
    await hold(offline, 'ArrowRight', 600);
    const x1 = await offline.evaluate(() => window.brackenfall.game.player.x);
    assert.ok(x1 !== x0, 'Summer moved while offline');
    const lit = await offline.evaluate(() => {
      const c = document.getElementById('screen');
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const colours = new Set();
      for (let i = 0; i < px.length; i += 4) colours.add(`${px[i]},${px[i + 1]},${px[i + 2]}`);
      return colours.size;
    });
    assert.ok(lit >= 3, 'the screen is drawn');

    // A reload of the same tab works too.
    await offline.reload();
    await untilGame(offline);

    assert.deepEqual(failed, [], 'no request failed');
    assert.deepEqual(fromNetwork.filter((u) => u.startsWith(s.url)), [], 'every response came from the worker');
    assert.equal(s.requests.length, seenByServer, 'the server saw nothing');
  } finally {
    await browser.close();
    await s.stop().catch(() => {});
  }
});

test('with service workers unavailable the game is still an ordinary page', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(s.url);
    await untilGame(page);
    await hold(page, 'Enter', 120);
    await page.waitForFunction(() => window.brackenfall.game.scene === 'play');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await s.stop();
  }
});

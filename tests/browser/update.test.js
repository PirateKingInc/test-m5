// Deploying a changed file reaches the player: the running game keeps its
// files, a banner offers the new version, and RELOAD serves it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stampWorker } from '../../tools/lib/precache.js';
import { skip, launch, site, untilControlled, untilGame } from './helpers.js';

const MARK = '// deployed: a second version';

/** What `git push` and the Pages workflow would do: change a file, restamp. */
function deployChange(dir) {
  const file = join(dir, 'src/engine/storage.js');
  writeFileSync(file, `${readFileSync(file, 'utf8')}${MARK}\n`);
  const sw = join(dir, 'sw.js');
  writeFileSync(sw, stampWorker(readFileSync(sw, 'utf8'), dir));
}

const servedStorage = (page) => page.evaluate(() => fetch('./src/engine/storage.js').then((r) => r.text()));
const bannerShown = (page) => page.evaluate(() => !document.getElementById('pwa-update').hidden);

test('the first visit neither shows the update banner nor reloads', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const page = await (await browser.newContext()).newPage();
    let loads = 0;
    page.on('load', () => { loads += 1; });
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);
    await page.waitForTimeout(500);
    assert.equal(loads, 1);
    assert.equal(await bannerShown(page), false);
  } finally {
    await browser.close();
    await s.stop();
  }
});

test('a deploy with a changed file brings up the banner, and RELOAD serves it', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);
    const oldCaches = await page.evaluate(() => caches.keys());

    deployChange(s.dir);

    // The player comes back to the tab; the page checks for an update.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => !document.getElementById('pwa-update').hidden, null, { timeout: 15000 });

    // Until the player says so, the running game keeps the files it started with.
    assert.ok(!(await servedStorage(page)).includes(MARK), 'the old version is still served before RELOAD');
    assert.equal(await page.evaluate(() => window.brackenfall.game.scene), 'title', 'the game was not restarted');

    await Promise.all([page.waitForEvent('load'), page.click('#pwa-update [data-pwa="reload"]')]);
    await untilGame(page);
    assert.ok((await servedStorage(page)).includes(MARK), 'the new version is served after RELOAD');
    assert.equal(await bannerShown(page), false);

    const newCaches = await page.evaluate(() => caches.keys());
    assert.equal(newCaches.length, 1, 'the old cache was deleted');
    assert.notDeepEqual(newCaches, oldCaches);

    // And the new version is what a fresh visit gets, offline included.
    await s.close();
    await context.setOffline(true);
    const again = await context.newPage();
    await again.goto(s.url);
    await untilGame(again);
    assert.ok((await servedStorage(again)).includes(MARK));
  } finally {
    await browser.close();
    await s.stop().catch(() => {});
  }
});

test('an update found on an earlier visit is offered on the next one', { skip }, async () => {
  const browser = await launch();
  const s = await site();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);
    deployChange(s.dir);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(() => !document.getElementById('pwa-update').hidden);
    await page.click('#pwa-update [data-pwa="later"]');
    assert.equal(await bannerShown(page), false, 'LATER dismisses it');

    // Opening the game again while the new worker is still waiting.
    const next = await context.newPage();
    await next.goto(s.url);
    await untilGame(next);
    await next.waitForFunction(() => !document.getElementById('pwa-update').hidden, null, { timeout: 15000 });
  } finally {
    await browser.close();
    await s.stop();
  }
});

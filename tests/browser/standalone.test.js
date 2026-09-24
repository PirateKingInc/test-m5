// A save made in the browser is still there after installing. Chrome's
// installed app is a window on the same profile, so it opens here as a real
// `--app` window, which is display-mode: standalone for real, not emulated.
// That needs a headed Chrome, so CI runs these under xvfb.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skip as noBrowser, site, untilGame, untilControlled, pressUntil, root } from './helpers.js';

const { chromium } = noBrowser ? {} : await import('playwright-core');
const skip = noBrowser || (!process.env.DISPLAY && !process.env.CI && 'needs a display for a headed app window (run under xvfb-run)');

const launchProfile = (profile, args = []) => chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: process.env.CHROME_PATH || undefined,
  channel: process.env.CHROME_PATH ? undefined : (process.env.CHROME_CHANNEL || 'chrome'),
  args,
});

const SAVE_KEY = 'brackenfall.save.v1';
const log = (...a) => console.log('[standalone]', ...a);

/** Whether the game loop is actually stepping in this window. */
async function loopRuns(page) {
  const t0 = await page.evaluate(() => window.brackenfall.game.titleT);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => window.brackenfall.game.titleT);
  return `${t1 - t0} frames in 500 ms`;
}

/** The app window: whichever page of the context reaches the game's URL. */
async function findPage(context, url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const hit = context.pages().find((p) => p.url().startsWith(url));
    if (hit) return hit;
    await new Promise((ok) => setTimeout(ok, 200));
  }
  throw new Error(`no window reached ${url}; pages: ${context.pages().map((p) => p.url()).join(', ')}`);
}

test('a save made in the browser is continued in the installed app', { skip }, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'brackenfall-profile-'));
  const s = await site();
  const open = [];
  try {
    // 1. An ordinary browser tab: play until the game autosaves in a new room.
    log('launching browser tab');
    const tab = await launchProfile(profile);
    open.push(tab);
    const page = tab.pages()[0] ?? await tab.newPage();
    await page.goto(s.url);
    await untilGame(page);
    assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), false);
    log('loop running:', await loopRuns(page));
    await pressUntil(page, 'Enter', () => window.brackenfall.game.scene === 'play');
    await pressUntil(page, 'ArrowRight', () => window.brackenfall.game.room.id === 'ow_southmire', 30000);
    const saved = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    assert.ok(saved, 'the browser tab autosaved');
    const blob = JSON.parse(saved);
    assert.equal(blob.room, 'ow_southmire');
    await untilControlled(page);
    await tab.close();
    log('tab closed; save', saved.length, 'bytes; launching app window');

    // 2. The installed app: same profile, its own standalone window.
    const app = await launchProfile(profile, [`--app=${s.url}`]);
    open.push(app);
    const win = await findPage(app, s.url);
    log('app window open', win.url());
    await untilGame(win);
    assert.equal(await win.evaluate(() => matchMedia('(display-mode: standalone)').matches), true, 'really standalone');
    assert.equal(await win.evaluate((k) => localStorage.getItem(k), SAVE_KEY), saved, 'the save is byte-for-byte the same');
    assert.equal(await win.evaluate(() => document.getElementById('pwa-install').hidden), true, 'no install banner in the app');

    // 3. And the game reads it: Continue is offered, first, and lands on the save.
    const title = await win.evaluate(() => [window.brackenfall.game.hasSave, window.brackenfall.game.menuIndex]);
    assert.deepEqual(title, [true, 0], 'CONTINUE is offered and selected');
    await pressUntil(win, 'Enter', () => window.brackenfall.game.scene === 'play');
    const resumed = await win.evaluate(() => {
      const g = window.brackenfall.game;
      return { room: g.room.id, x: g.player.x, y: g.player.y, hp: g.player.hp };
    });
    assert.deepEqual(resumed, { room: blob.room, x: blob.x, y: blob.y, hp: blob.hp });
    await app.close();
  } finally {
    for (const c of open) await c.close().catch(() => {});
    await s.stop();
    rmSync(profile, { recursive: true, force: true });
  }
});

test('the installed app opens on the same origin and path the saves live under', () => {
  // localStorage is per origin. The app must start where the browser tab was,
  // or its saves would be somewhere else.
  const manifestUrl = 'https://piratekinginc.github.io/test-m5/manifest.json';
  const { start_url: start, scope } = JSON.parse(
    // eslint-disable-next-line no-undef
    process.getBuiltinModule('node:fs').readFileSync(join(root, 'manifest.json'), 'utf8'),
  );
  assert.equal(new URL(start, manifestUrl).href, 'https://piratekinginc.github.io/test-m5/');
  assert.equal(new URL(scope, manifestUrl).href, 'https://piratekinginc.github.io/test-m5/');
});

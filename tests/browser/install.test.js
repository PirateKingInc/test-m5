// The install banner: the native prompt where the browser offers one, written
// instructions on iOS, nothing anywhere else, and never in the way of playing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { skip, launch, site, untilGame } from './helpers.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

// What is actually on screen, not just the attribute: CSS can override
// `hidden`, and did once.
const banner = (page) => page.evaluate(() => {
  const b = document.getElementById('pwa-install');
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  return {
    shown: visible(b),
    button: visible(b.querySelector('[data-pwa="install"]')),
    text: b.querySelector('[data-pwa="message"]').textContent,
  };
});

/** Fires what Chromium fires once a site is installable. */
const offerPrompt = (page, outcome = 'accepted') => page.evaluate((o) => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.promptOpened = (window.promptOpened ?? 0) + 1; };
  e.userChoice = Promise.resolve({ outcome: o, platform: 'web' });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}, outcome);

async function withPage(opts, fn) {
  const browser = await launch();
  const s = await site();
  try {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    await page.goto(s.url);
    await untilGame(page);
    await fn(page, context, s);
  } finally {
    await browser.close();
    await s.stop();
  }
}

test('nothing is offered until the browser says the game is installable', { skip }, async () => {
  await withPage({}, async (page) => {
    await page.waitForTimeout(300);
    assert.equal((await banner(page)).shown, false);
  });
});

test('Chromium: INSTALL opens the native prompt, and installing hides the banner', { skip }, async () => {
  await withPage({}, async (page) => {
    assert.equal(await offerPrompt(page), true, 'the mini-infobar is suppressed in favour of our banner');
    const b = await banner(page);
    assert.ok(b.shown && b.button, 'banner with an INSTALL button');
    await page.click('#pwa-install [data-pwa="install"]');
    assert.equal(await page.evaluate(() => window.promptOpened), 1);
    assert.equal((await banner(page)).shown, false);

    await offerPrompt(page);
    assert.equal((await banner(page)).shown, true);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    assert.equal((await banner(page)).shown, false, 'appinstalled hides it');
  });
});

test('dismissing is remembered, under its own key, and leaves the save alone', { skip }, async () => {
  await withPage({}, async (page) => {
    // A real save: start a game, which autosaves on entering the first room.
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => localStorage.getItem('brackenfall.save.v1'));
    const save = await page.evaluate(() => localStorage.getItem('brackenfall.save.v1'));
    await offerPrompt(page);
    await page.click('#pwa-install [data-pwa="dismiss"]');
    assert.equal((await banner(page)).shown, false);

    await page.reload();
    await untilGame(page);
    await offerPrompt(page);
    assert.equal((await banner(page)).shown, false, 'not offered again straight after a dismissal');
    const store = await page.evaluate(() => ({ ...localStorage }));
    assert.equal(store['brackenfall.save.v1'], save);
    assert.ok(Number(store['brackenfall.pwa.install-dismissed']) > 0);
  });
});

test('declining the native prompt counts as a dismissal', { skip }, async () => {
  await withPage({}, async (page) => {
    await offerPrompt(page, 'dismissed');
    await page.click('#pwa-install [data-pwa="install"]');
    await page.waitForFunction(() => localStorage.getItem('brackenfall.pwa.install-dismissed'));
  });
});

test('iPhone Safari gets Add to Home Screen instructions, not a dead button', { skip }, async () => {
  await withPage({ userAgent: IPHONE, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } }, async (page) => {
    const b = await banner(page);
    assert.ok(b.shown);
    assert.equal(b.button, false, 'no INSTALL button on iOS');
    assert.match(b.text, /ADD TO HOME SCREEN/);
    await page.tap('#pwa-install [data-pwa="dismiss"]');
    assert.equal((await banner(page)).shown, false);
  });
});

test('iPadOS, which calls itself a Mac, is recognised too', { skip }, async () => {
  await withPage({ userAgent: IPAD, hasTouch: true, isMobile: true }, async (page) => {
    const b = await banner(page);
    assert.ok(b.shown && !b.button);
  });
});

test('a browser with no install support shows nothing', { skip }, async () => {
  await withPage({ userAgent: FIREFOX }, async (page) => {
    await page.waitForTimeout(300);
    assert.equal((await banner(page)).shown, false);
  });
});

test('the banner never feeds the game: a tap on it presses no game button', { skip }, async () => {
  await withPage({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } }, async (page) => {
    await offerPrompt(page);
    const menu = await page.evaluate(() => [window.brackenfall.game.scene, window.brackenfall.game.menuIndex]);
    await page.tap('#pwa-install [data-pwa="dismiss"]');
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => [window.brackenfall.game.scene, window.brackenfall.game.menuIndex]), menu);
    assert.equal(await page.evaluate(() => window.brackenfall.input.buttons), 0);
  });
});

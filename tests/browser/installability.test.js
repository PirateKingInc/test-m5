// Chrome's own verdict on whether the site can be installed - the same check
// that decides whether the install prompt is offered at all. It needs an
// ordinary (non-incognito) profile, because Chrome never installs from one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skip, site, untilGame, untilControlled } from './helpers.js';

test('Chrome reports no installability errors', { skip }, async () => {
  const { chromium } = await import('playwright-core');
  const profile = mkdtempSync(join(tmpdir(), 'brackenfall-profile-'));
  const s = await site();
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : (process.env.CHROME_CHANNEL || 'chrome'),
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(s.url);
    await untilGame(page);
    await untilControlled(page);
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installabilityErrors, []);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.deepEqual(manifest.errors, [], 'the manifest parses cleanly');
    assert.equal(manifest.url, `${s.url}manifest.json`);
  } finally {
    await context.close();
    await s.stop();
    rmSync(profile, { recursive: true, force: true });
  }
});

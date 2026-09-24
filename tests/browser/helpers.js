// Shared plumbing for the browser tests: a headless Chrome, and a scratch copy
// of the site served under /test-m5/ the way GitHub Pages serves it.
//
// These tests need a browser and `playwright-core`, which is not a dependency
// of the game. CI installs it with --no-save; locally:
//   npm i --no-save --no-package-lock playwright-core
//   CHROME_PATH=/path/to/chrome npm run test:browser

import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../../tools/serve.js';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE_FILES = ['index.html', 'manifest.json', 'sw.js', 'src', 'icons'];

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  chromium = null;
}
export const skip = chromium ? false : 'playwright-core is not installed (npm i --no-save playwright-core)';

export function launch() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : (process.env.CHROME_CHANNEL || 'chrome'),
  });
}

/** Copies the deployable site to a scratch directory, as pages.yml stages it. */
export function copySite() {
  const dir = mkdtempSync(join(tmpdir(), 'brackenfall-site-'));
  for (const f of SITE_FILES) cpSync(join(root, f), join(dir, f), { recursive: true });
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A served scratch copy of the site. */
export async function site() {
  const copy = copySite();
  const server = await serve({ root: copy.dir });
  return {
    ...server,
    dir: copy.dir,
    async stop() { await server.close(); copy.remove(); },
  };
}

/** Waits until this page is controlled by an activated worker. */
export async function untilControlled(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((ok) => navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }));
  });
}

/** Waits for the game to have booted. */
export function untilGame(page) {
  return page.waitForFunction(() => window.brackenfall?.game?.scene === 'title');
}

/** Holds a key for n animation frames' worth of real time. */
export async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

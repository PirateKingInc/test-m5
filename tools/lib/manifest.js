// Checks manifest.json against what Chrome needs to call a site installable,
// plus this project's own rules: palette colours only, and both the 192 and
// 512 icons in both the `any` and `maskable` purposes, each backed by a real
// PNG of the size it claims. Returns a list of problems; empty means valid.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from '../../src/data/palette.js';
import { pngSize } from './png.js';

const DISPLAY = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'];
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * @param {Record<string, any>} m the parsed manifest
 * @param {string} root the directory the manifest's relative URLs resolve from
 */
export function validateManifest(m, root) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(m && typeof m === 'object' && !Array.isArray(m), 'manifest must be a JSON object');
  if (errors.length) return errors;

  need(typeof m.name === 'string' && m.name.trim(), 'name is required');
  need(typeof m.short_name === 'string' && m.short_name.trim(), 'short_name is required');
  need(!m.short_name || m.short_name.length <= 12, 'short_name should be 12 characters or fewer, or launchers truncate it');
  need(typeof m.description === 'string' && m.description.trim(), 'description is required');
  need(typeof m.start_url === 'string' && m.start_url.length, 'start_url is required');
  need(DISPLAY.includes(m.display), `display must be one of ${DISPLAY.join(', ')}`);
  need(m.display === 'standalone', 'this game ships as display: "standalone"');
  need(m.prefer_related_applications !== true, 'prefer_related_applications must not be true');

  // start_url must sit inside scope, or the browser ignores the manifest's scope.
  if (typeof m.start_url === 'string' && typeof m.scope === 'string') {
    const base = 'https://example.invalid/app/';
    const start = new URL(m.start_url, base).href;
    const scope = new URL(m.scope, base).href;
    need(start.startsWith(scope), 'start_url must be within scope');
  }

  for (const key of ['background_color', 'theme_color']) {
    need(HEX.test(m[key] ?? ''), `${key} must be a #rrggbb colour`);
    need(PALETTE.includes(String(m[key]).toLowerCase()), `${key} must be one of the Brackenfall palette colours`);
  }

  need(Array.isArray(m.icons) && m.icons.length, 'icons are required');
  const icons = Array.isArray(m.icons) ? m.icons : [];
  for (const [i, icon] of icons.entries()) {
    const where = `icons[${i}] (${icon?.src})`;
    need(typeof icon?.src === 'string', `${where}: src is required`);
    need(icon?.type === 'image/png', `${where}: type must be image/png`);
    const match = /^(\d+)x(\d+)$/.exec(icon?.sizes ?? '');
    need(match && match[1] === match[2], `${where}: sizes must be a single square NxN`);
    const purposes = String(icon?.purpose ?? 'any').split(/\s+/);
    need(purposes.every((p) => ['any', 'maskable', 'monochrome'].includes(p)), `${where}: unknown purpose`);
    if (typeof icon?.src !== 'string' || !match) continue;
    const file = join(root, icon.src);
    if (!existsSync(file)) {
      errors.push(`${where}: file does not exist`);
      continue;
    }
    try {
      const { width, height } = pngSize(readFileSync(file));
      need(width === Number(match[1]) && height === Number(match[2]),
        `${where}: declares ${icon.sizes} but the file is ${width}x${height}`);
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
    }
  }

  const has = (size, purpose) => icons.some(
    (ic) => ic?.sizes === `${size}x${size}` && String(ic?.purpose ?? 'any').split(/\s+/).includes(purpose),
  );
  for (const size of [192, 512]) {
    need(has(size, 'any'), `a ${size}x${size} icon with purpose "any" is required`);
    need(has(size, 'maskable'), `a ${size}x${size} icon with purpose "maskable" is required`);
  }
  return errors;
}

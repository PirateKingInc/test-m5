import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PALETTE } from '../src/data/palette.js';
import { validateManifest } from '../tools/lib/manifest.js';
import { decodePng, encodePng } from '../tools/lib/png.js';
import { ICONS, renderIcon, logicalIcon } from '../tools/lib/icons.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('the manifest passes the installability validator', () => {
  assert.deepEqual(validateManifest(manifest, root), []);
});

test('the manifest opens standalone, at the site root, in the game\'s colours', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.ok(manifest.name.includes('Brackenfall'));
  assert.ok(manifest.short_name.length <= 12);
  // The page background and the browser chrome are the palette's ink.
  assert.equal(manifest.background_color, PALETTE[3]);
  assert.equal(manifest.theme_color, PALETTE[3]);
  assert.match(read('index.html'), new RegExp(`<meta name="theme-color" content="${PALETTE[3]}">`));
});

test('the validator catches what would stop a browser installing it', () => {
  const broken = (patch) => validateManifest({ ...manifest, ...patch }, root);
  assert.ok(broken({ display: 'browser' }).length);
  assert.ok(broken({ name: '' }).length);
  assert.ok(broken({ theme_color: '#ff0000' }).length, 'a fifth colour');
  assert.ok(broken({ icons: manifest.icons.filter((i) => i.purpose !== 'maskable') }).length);
  assert.ok(broken({ icons: manifest.icons.filter((i) => i.sizes !== '512x512') }).length);
  assert.ok(broken({ icons: [{ ...manifest.icons[0], sizes: '512x512' }] }).length, 'size lies about the file');
  assert.ok(broken({ icons: [{ ...manifest.icons[0], src: 'icons/nope.png' }] }).length);
  assert.ok(broken({ start_url: '/elsewhere/', scope: './' }).length);
  assert.ok(validateManifest([], root).length);
});

test('index.html links the manifest and the home-screen icon', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.json">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png">/);
});

test('every icon is the committed output of the generator, in four colours', () => {
  const declared = new Set(manifest.icons.map((i) => i.src));
  for (const icon of ICONS) {
    const png = decodePng(readFileSync(join(root, icon.file)));
    assert.equal(png.width, icon.size, icon.file);
    assert.equal(png.height, icon.size, icon.file);
    assert.deepEqual(png.palette, PALETTE, `${icon.file} uses exactly the Brackenfall palette`);
    assert.ok(png.pixels.every((v) => v < 4), `${icon.file} has an index outside the palette`);
    assert.ok(
      Buffer.from(png.pixels).equals(Buffer.from(renderIcon(icon.size, icon.purpose))),
      `${icon.file} is stale: run node tools/make-icons.js`,
    );
    if (!icon.apple) assert.ok(declared.has(icon.file), `${icon.file} is not in the manifest`);
  }
});

test('the maskable art stays inside the launcher safe zone', () => {
  // Every non-background cell must be within the central circle of radius 0.4.
  const { grid, cells } = logicalIcon('maskable');
  const bg = cells[0];
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      if (cells[y * grid + x] === bg) continue;
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const d = Math.hypot(cx / grid - 0.5, cy / grid - 0.5);
        assert.ok(d <= 0.4, `cell ${x},${y} pokes out of the safe zone (${d.toFixed(3)})`);
      }
    }
  }
});

test('the PNG encoder round-trips', () => {
  const px = Uint8Array.from({ length: 35 }, (_, i) => i % 4);
  const png = decodePng(encodePng(7, 5, px, PALETTE));
  assert.equal(png.width, 7);
  assert.equal(png.height, 5);
  assert.deepEqual([...png.pixels], [...px]);
});

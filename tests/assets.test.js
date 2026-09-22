import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/data/palette.js';
import { TILES, METATILES, TILE_ART } from '../src/data/tiles.js';
import {
  SUMMER, SWORD, SPIN, MONSTERS, BUCKLER, NPCS, BOSSES,
  SEED, NOTE, SHOCKWAVE, ROOT_SPIKE, HALF_HEART, KEY,
  CHEST, HEART_CONTAINER, UPGRADE_ICON, WICKSTONE,
} from '../src/data/sprites.js';
import { FONT, GLYPH_W, GLYPH_H, glyph } from '../src/data/font.js';

/** Asserts a pixel-string block is exactly w x h and uses only legal characters. */
function shape(label, rows, w, h, alphabet) {
  assert.equal(rows.length, h, `${label}: expected ${h} rows, got ${rows.length}`);
  rows.forEach((row, i) => {
    assert.equal(row.length, w, `${label} row ${i}: expected width ${w}, got ${row.length}`);
    assert.ok(
      [...row].every((c) => alphabet.includes(c)),
      `${label} row ${i}: illegal character in "${row}"`,
    );
  });
}

const OPAQUE = '0123';
const SPRITE = '0123.';

test('the palette is exactly four colours', () => {
  assert.equal(PALETTE.length, 4);
  for (const c of PALETTE) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.equal(new Set(PALETTE).size, 4, 'no duplicate colours');
});

test('every tile is 8x8 and every metatile is four tile ids', () => {
  TILES.forEach((tile, i) => shape(`tile ${i}`, tile, 8, 8, OPAQUE));
  for (const [name, ids] of Object.entries(METATILES)) {
    assert.equal(ids.length, 4, `metatile ${name} must be 2x2 tiles`);
    for (const id of ids) {
      assert.ok(Number.isInteger(id) && id >= 0 && id < TILES.length, `metatile ${name} has a bad tile id`);
    }
  }
});

test('every legend character in SPEC.md has art', () => {
  const legend = '.,#~PTxoCLBGSJVDW';
  for (const ch of legend) {
    assert.ok(TILE_ART[ch], `no art for legend character "${ch}"`);
    assert.ok(METATILES[TILE_ART[ch]], `no metatile "${TILE_ART[ch]}"`);
  }
  assert.equal(Object.keys(TILE_ART).length, legend.length);
});

test('tiles are deduplicated across metatiles', () => {
  const seen = new Set(TILES.map((t) => t.join('')));
  assert.equal(seen.size, TILES.length, 'the tile table contains a duplicate');
});

test('Summer has four-direction walk and attack art at 16x16', () => {
  assert.deepEqual(
    Object.keys(SUMMER).sort(),
    ['attackDown', 'attackSide', 'attackUp', 'down', 'side', 'up'],
  );
  for (const [pose, frames] of Object.entries(SUMMER)) {
    assert.ok(frames.length >= 1, `${pose} needs at least one frame`);
    frames.forEach((f, i) => shape(`SUMMER.${pose}[${i}]`, f, 16, 16, SPRITE));
  }
  for (const pose of ['down', 'up', 'side']) {
    assert.equal(SUMMER[pose].length, 2, `${pose} needs two walk frames`);
    assert.notDeepEqual(SUMMER[pose][0], SUMMER[pose][1], `${pose} walk frames must differ`);
  }
});

test('Summer reads as a figure, not a blob', () => {
  // A legible 16x16 character fills a good part of the cell but is not a solid
  // rectangle, and leaves the top row clear so she does not smear into the
  // metatile above her.
  for (const pose of ['down', 'up', 'side']) {
    const art = SUMMER[pose][0];
    const filled = art.join('').split('').filter((c) => c !== '.').length;
    assert.ok(filled > 90 && filled < 200, `${pose}: ${filled} lit pixels is not a readable figure`);
    assert.equal(art[0], '.'.repeat(16), `${pose}: top row should be clear`);
  }
});

test('the six monsters, both bosses and the villagers are all present', () => {
  assert.deepEqual(
    Object.keys(MONSTERS).sort(),
    ['brumbler', 'mothkin', 'palebuckler', 'snag', 'spitfen', 'thudder'],
  );
  for (const [name, frames] of Object.entries(MONSTERS)) {
    assert.equal(frames.length, 2, `${name} needs two frames`);
    frames.forEach((f, i) => shape(`MONSTERS.${name}[${i}]`, f, 16, 16, SPRITE));
    assert.notDeepEqual(frames[0], frames[1], `${name} frames must differ`);
  }
  assert.deepEqual(Object.keys(BOSSES).sort(), ['chorister', 'sapwarden']);
  for (const [name, frames] of Object.entries(BOSSES)) {
    frames.forEach((f, i) => shape(`BOSSES.${name}[${i}]`, f, 32, 32, SPRITE));
  }
  for (const [name, frames] of Object.entries(NPCS)) {
    frames.forEach((f, i) => shape(`NPCS.${name}[${i}]`, f, 16, 16, SPRITE));
  }
});

test('overlays, pickups and hazards are the right size', () => {
  for (const [k, v] of Object.entries(SWORD)) shape(`SWORD.${k}`, v, 16, 16, SPRITE);
  for (const [k, v] of Object.entries(BUCKLER)) shape(`BUCKLER.${k}`, v, 16, 16, SPRITE);
  SPIN.forEach((f, i) => shape(`SPIN[${i}]`, f, 16, 16, SPRITE));
  SHOCKWAVE.forEach((f, i) => shape(`SHOCKWAVE[${i}]`, f, 16, 16, SPRITE));
  shape('ROOT_SPIKE', ROOT_SPIKE, 16, 16, SPRITE);
  shape('HEART_CONTAINER', HEART_CONTAINER, 16, 16, SPRITE);
  shape('WICKSTONE', WICKSTONE, 16, 16, SPRITE);
  for (const [k, v] of Object.entries(CHEST)) shape(`CHEST.${k}`, v, 16, 16, SPRITE);
  for (const [k, v] of Object.entries(UPGRADE_ICON)) shape(`UPGRADE_ICON.${k}`, v, 16, 16, SPRITE);
  shape('SEED', SEED, 8, 8, SPRITE);
  shape('NOTE', NOTE, 8, 8, SPRITE);
  shape('HALF_HEART', HALF_HEART, 8, 8, SPRITE);
  shape('KEY', KEY, 8, 8, SPRITE);
});

test('the font covers everything the script needs', () => {
  for (const [name, rows] of Object.entries(FONT)) {
    shape(`FONT[${JSON.stringify(name)}]`, rows, GLYPH_W, GLYPH_H, '#.');
  }
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?'-:\"()/>*+%") {
    assert.ok(FONT[ch], `font is missing ${JSON.stringify(ch)}`);
  }
  assert.deepEqual(glyph('a'), FONT.A, 'lowercase falls back to uppercase');
  assert.deepEqual(glyph('§'), FONT[' '], 'unknown characters render as a space');
});

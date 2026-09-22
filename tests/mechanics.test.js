// The numbers in SPEC.md, asserted against the game that shipped - and against
// the rooms that shipped, not against fixtures invented to pass.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOMS, materialize } from '../src/game/world.js';
import { ROOM_W, ROOM_H, SUB, TILE, HB_W, AIR_SPEED, BASE_AIRTIME, SANDAL_AIRTIME, IFRAMES } from '../src/game/constants.js';
import { makePlayer, stepPlayer, tileUnder, isAirborne } from '../src/game/player.js';
import { swingBox, playerBox, overlaps, connects, swingZ, zOverlaps } from '../src/game/combat.js';
import { makeShockwave } from '../src/game/enemies.js';
import { sandbox, placeAt, run, BTN } from './helpers/sandbox.js';
import { Game } from '../src/game/game.js';

const PASSABLE = new Set(['.', ',', 'V', 'D', 'J', 'L', 'B', 'C', 'G']);

/**
 * Every straight run of pit tiles in the shipped rooms that has somewhere to
 * stand at both ends - i.e. every gap the game actually asks anyone to jump.
 */
function pitRuns() {
  const runs = [];
  for (const [room] of Object.entries(ROOMS)) {
    const grid = materialize(room, new Set());
    const scan = (dx, dy) => {
      for (let y = 0; y < ROOM_H; y += 1) {
        for (let x = 0; x < ROOM_W; x += 1) {
          if (grid[y][x] !== 'P') continue;
          const px = x - dx;
          const py = y - dy;
          if (px < 0 || py < 0 || px >= ROOM_W || py >= ROOM_H) continue;
          if (!PASSABLE.has(grid[py][px])) continue;      // must start on solid ground
          let n = 0;
          while (grid[y + dy * n]?.[x + dx * n] === 'P') n += 1;
          const lx = x + dx * n;
          const ly = y + dy * n;
          if (lx < 0 || ly < 0 || lx >= ROOM_W || ly >= ROOM_H) continue;
          if (!PASSABLE.has(grid[ly][lx])) continue;      // and land on some
          runs.push({ room, from: [px, py], dir: dx === 1 ? 'e' : dx === -1 ? 'w' : dy === 1 ? 's' : 'n', width: n });
        }
      }
    };
    scan(1, 0); scan(-1, 0); scan(0, 1); scan(0, -1);
  }
  return runs;
}

/**
 * Walks Summer at a gap in a real room and jumps when the tile ahead of her
 * centre is a pit - the same rule the playthrough bot uses.
 */
function attempt(room, from, dir, hasSandals) {
  const grid = materialize(room, new Set());
  const p = makePlayer(from[0], from[1]);
  const [dx, dy] = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] }[dir];
  let jumped = false;
  for (let i = 0; i < 400; i += 1) {
    const cx = (p.x + (HB_W * SUB) / 2) / SUB;
    const cy = (p.y + (HB_W * SUB) / 2) / SUB;
    const ahead = grid[Math.floor((dy ? cy + dy : cy) / TILE)]?.[Math.floor((dx ? cx + dx : cx) / TILE)];
    const want = !isAirborne(p) && !jumped && ahead === 'P';
    const r = stepPlayer(p, grid, { dx, dy, jump: want, hasSandals, frozen: false });
    if (want) jumped = true;
    if (r.fell) return 'fell';
    if (jumped && !isAirborne(p)) return 'crossed';
  }
  return 'stuck';
}

test('no gap in the game is wider than the Gale Sandals can clear', () => {
  const runs = pitRuns();
  assert.ok(runs.length > 0, 'the game should contain some pits');
  const tooWide = runs.filter((r) => r.width > 2);
  assert.deepEqual(tooWide, [], 'a three-tile pit would be uncrossable with either jump');
  const widths = new Set(runs.map((r) => r.width));
  assert.deepEqual([...widths].sort(), [1, 2], 'every gap is one or two tiles');
});

test('every one-tile gap in the shipped rooms clears on the base jump', () => {
  const failures = [];
  for (const r of pitRuns().filter((x) => x.width === 1)) {
    if (attempt(r.room, r.from, r.dir, false) !== 'crossed') {
      failures.push(`${r.room} ${r.from} ${r.dir}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('every two-tile gap in the shipped rooms needs the Gale Sandals, and yields to them', () => {
  const wrong = [];
  for (const r of pitRuns().filter((x) => x.width === 2)) {
    const bare = attempt(r.room, r.from, r.dir, false);
    const shod = attempt(r.room, r.from, r.dir, true);
    if (bare === 'crossed') wrong.push(`${r.room} ${r.from} ${r.dir}: crossable WITHOUT the sandals`);
    if (shod !== 'crossed') wrong.push(`${r.room} ${r.from} ${r.dir}: NOT crossable with them (${shod})`);
  }
  assert.deepEqual(wrong, []);
});

test('the two jumps travel exactly what SPEC.md says', () => {
  assert.equal((BASE_AIRTIME * AIR_SPEED) / SUB, 30);
  assert.equal((SANDAL_AIRTIME * AIR_SPEED) / SUB, 46.5);
  // Crossing a W-tile pit needs 16W + 1 px of centre travel.
  assert.ok(30 >= 17 && 30 < 33, 'the base jump clears one tile and not two');
  assert.ok(46.5 >= 33 && 46.5 < 49, 'the sandals clear two and not three');
});

test('no raised ledge in the game can be entered without the Gale Sandals', () => {
  // Offsets stay within the approach tile: her box is 10px wide in a 16px
  // tile, so 0..6 covers every place she could legitimately stand.
  const OFFSETS = [0, 2, 4, 6];
  let checked = 0;

  for (const [room] of Object.entries(ROOMS)) {
    const grid = materialize(room, new Set());
    for (let y = 0; y < ROOM_H; y += 1) {
      for (let x = 0; x < ROOM_W; x += 1) {
        if (grid[y][x] !== 'J') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const px = x - dx;
          const py = y - dy;
          if (px < 0 || py < 0 || px >= ROOM_W || py >= ROOM_H) continue;
          if (grid[py][px] !== '.') continue;
          checked += 1;
          for (const offset of OFFSETS) {
            const p = makePlayer(px, py);
            if (dx) p.x = px * TILE * SUB + offset * SUB;
            else p.y = py * TILE * SUB + offset * SUB;
            p.safeX = p.x;
            p.safeY = p.y;
            for (let i = 0; i < 60; i += 1) {
              stepPlayer(p, grid, { dx, dy, hasSandals: false, jump: i === 6, frozen: false });
            }
            const t = tileUnder(p);
            assert.notEqual(
              grid[t.ty]?.[t.tx], 'J',
              `${room}: ledge ${x},${y} entered from ${px},${py} (+${offset}) with no sandals`,
            );
          }
        }
      }
    }
  }
  assert.ok(checked > 0, 'the game should contain some ledges to check');
});

test('the Windcut Cliffs heart container needs the ledge, and the ledge yields', () => {
  // The one place in the game where a ledge has to be *landed on* rather than
  // cleared, so it is worth driving end to end rather than modelling.
  const collect = (hasSandals) => {
    const g = new Game();
    g.newGame();
    g.progress.upgrades.sandals = hasSandals;
    g.enterRoom('ow_cliffside');
    placeAt(g.player, 7, 3);
    const before = g.progress.maxHp;
    for (let i = 0; i < 40; i += 1) g.step(BTN.UP | (i === 2 ? BTN.B : 0));
    for (let i = 0; i < 40; i += 1) g.step(BTN.RIGHT);
    return g.progress.maxHp - before;
  };
  assert.equal(collect(false), 0, 'without the sandals the shelf is a wall');
  assert.equal(collect(true), 2, 'with them she gets up and takes the container');
});

test('the sword reaches 12px in front and nothing behind or beside', () => {
  const g = sandbox({ at: [5, 4] });
  const p = g.player;
  const sides = {
    right: (b) => b.x >= p.x + HB_W * SUB,
    left: (b) => b.x + b.w <= p.x,
    down: (b) => b.y >= p.y + HB_W * SUB,
    up: (b) => b.y + b.h <= p.y,
  };
  for (const [dir, check] of Object.entries(sides)) {
    p.swingDir = dir;
    const b = swingBox(p);
    assert.ok(check(b), `${dir}: the blade should sit entirely on the ${dir} side`);
    assert.equal(overlaps(b, playerBox(p)), false, `${dir}: the blade overlaps her own body`);
  }
});

test('the shield rule is a truth table, not a special case', () => {
  const dirs = ['up', 'down', 'left', 'right'];
  for (const facing of dirs) {
    for (const swing of dirs) {
      const expected = swing === facing;
      assert.equal(
        connects({ shielded: true, dir: facing }, swing), expected,
        `a ${facing}-facing Palebuckler hit by a ${swing} swing`,
      );
    }
    assert.equal(connects({ shielded: true, dir: facing }, null), true, 'a spin always connects');
  }
  for (const swing of dirs) {
    assert.equal(connects({ shielded: false, dir: 'up' }, swing), true, 'unshielded things take any hit');
  }
});

test('the blade sweeps low on the ground and high in the air', () => {
  const g = sandbox({ at: [4, 4] });
  const grounded = swingZ(g.player);
  g.player.aloft = true;
  const airborne = swingZ(g.player);
  assert.equal(zOverlaps(grounded, 8), false, 'a grounded swing cannot reach hover height');
  assert.equal(zOverlaps(airborne, 8), true, 'an airborne one can');
  assert.equal(zOverlaps(grounded, 0), true, 'and a grounded swing reaches the floor');
  assert.equal(zOverlaps(airborne, 0), false, 'while an airborne one passes over it');
});

test('a shockwave is avoidable by jumping and by nothing else', () => {
  const wave = () => makeShockwave(2 * TILE * SUB, 4 * TILE * SUB + 8 * SUB, 'right');

  // Standing still does not work.
  const still = sandbox({ at: [5, 4] });
  still.hazards.push(wave());
  run(still, 90, 0);
  assert.ok(still.player.hp < 6, 'standing in it should hurt');

  // Running away does not work either: the wave outruns her.
  const walking = sandbox({ at: [5, 4] });
  walking.hazards.push(wave());
  run(walking, 90, BTN.RIGHT);
  assert.ok(walking.player.hp < 6, 'running away should not save her');

  // Staying off the ground does. Airtime is 20 frames, so a jump every 20
  // keeps her feet up continuously.
  const jumping = sandbox({ at: [5, 4] });
  jumping.hazards.push(wave());
  for (let i = 0; i < 90; i += 1) jumping.step(i % BASE_AIRTIME === 0 ? BTN.B : 0);
  assert.equal(jumping.player.hp, 6, 'jumping should');
});

test('invincibility lasts exactly 60 frames and then stops', () => {
  const g = sandbox({ at: [4, 4] });
  g.damage(1, 0, 0, true);
  assert.equal(g.player.iframes, IFRAMES);
  const after = g.player.hp;
  for (let i = 0; i < IFRAMES - 1; i += 1) {
    g.step(0);
    assert.equal(g.damage(1, 0, 0, true), false, `frame ${i} should still be invincible`);
  }
  g.step(0);
  assert.equal(g.damage(1, 0, 0, true), true, 'and then she can be hurt again');
  assert.equal(g.player.hp, after - 1);
});

test('save and load round-trips an exact mid-game state', () => {
  const before = new Game();
  before.newGame();
  before.progress.upgrades.sandals = true;
  before.progress.keys.aerie = 2;
  before.enterRoom('d2_galehall');
  placeAt(before.player, 3, 3);
  before.player.hp = 5;
  run(before, 25, BTN.RIGHT);

  const after = new Game();
  assert.equal(after.loadSave(before.toSave()), true);
  assert.equal(after.player.x, before.player.x);
  assert.equal(after.player.y, before.player.y);
  assert.equal(after.player.hp, before.player.hp);
  assert.equal(after.room.id, before.room.id);
  assert.equal(after.rng.s, before.rng.s);
  assert.deepEqual(after.toSave(), before.toSave());
});

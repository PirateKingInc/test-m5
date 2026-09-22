import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makePlayer, stepPlayer, tileUnder, isAirborne, edgeCrossed, placeAfterExit,
  airtimeFor, facingTile,
} from '../src/game/player.js';
import { Game, BTN, SCENE } from '../src/game/game.js';
import { materialize } from '../src/game/world.js';
import {
  SUB, TILE, HB_W, AIR_SPEED, BASE_AIRTIME, SANDAL_AIRTIME, VIEW_W,
} from '../src/game/constants.js';

/** Builds a throwaway room from ASCII so a test can state its own geometry. */
function grid(rows) {
  return rows.map((r) => [...r]);
}

const hold = (over) => ({
  dx: 0, dy: 0, jump: false, hasSandals: false, frozen: false, ...over,
});

test('movement is subpixel-exact and never floating point', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#........#',
    '#........#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(4, 4);
  const startX = p.x;
  for (let i = 0; i < 16; i += 1) stepPlayer(p, room, hold({ dx: 1 }));
  assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y));
  assert.equal(p.x - startX, 16 * SUB, 'sixteen frames of walking is sixteen pixels');
});

test('she slides along a wall instead of sticking to it', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#...#....#',
    '#...#....#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(2, 3);
  const y0 = p.y;
  // Pushing into the wall diagonally: the blocked axis stops, the free one does not.
  for (let i = 0; i < 40; i += 1) stepPlayer(p, room, hold({ dx: 1, dy: 1 }));
  assert.ok(p.y > y0, 'the unblocked axis should still make progress');
  assert.ok(tileUnder(p).tx < 4, 'she should not be inside the wall');
});

test('a held diagonal resolves to one axis, not a diagonal walk', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#........#',
    '#........#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(4, 4);
  const { x, y } = p;
  stepPlayer(p, room, hold({ dx: 1 }));      // establishes the x axis
  for (let i = 0; i < 10; i += 1) stepPlayer(p, room, hold({ dx: 1, dy: 1 }));
  assert.ok(p.x > x, 'the most recent axis wins');
  assert.equal(p.y, y, 'the other axis must not move at all');
});

test('facing follows the last direction pressed', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#........#',
    '#........#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(4, 4);
  for (const [input, dir] of [
    [{ dx: -1 }, 'left'], [{ dx: 1 }, 'right'], [{ dy: -1 }, 'up'], [{ dy: 1 }, 'down'],
  ]) {
    stepPlayer(p, room, hold(input));
    assert.equal(p.dir, dir);
  }
  assert.deepEqual(facingTile(p), { tx: tileUnder(p).tx, ty: tileUnder(p).ty + 1 });
});

test('jump airtime and travel match the numbers in SPEC.md', () => {
  assert.equal(airtimeFor(false), BASE_AIRTIME);
  assert.equal(airtimeFor(true), SANDAL_AIRTIME);
  // She falls when the tile under her centre is a pit, so a W-tile pit needs
  // her centre to travel 16W + 1 pixels.
  const need = (tiles) => tiles * TILE + 1;
  const base = (BASE_AIRTIME * AIR_SPEED) / SUB;
  const sandals = (SANDAL_AIRTIME * AIR_SPEED) / SUB;
  assert.ok(base >= need(1), `base jump ${base}px must clear a 1-tile pit`);
  assert.ok(base < need(2), `base jump ${base}px must NOT clear a 2-tile pit`);
  assert.ok(sandals >= need(2), `sandals ${sandals}px must clear a 2-tile pit`);
  assert.ok(sandals < need(3), `sandals ${sandals}px must NOT clear a 3-tile pit`);
});

/** Walks right from x=1, jumping at the lip, and reports whether she fell. */
function attemptPit(pitWidth, hasSandals) {
  const row = `#.${'P'.repeat(pitWidth)}${'.'.repeat(7 - pitWidth)}#`.slice(0, 10);
  const room = grid([
    '##########', row, row, row, row, row, row, '##########',
  ]);
  const p = makePlayer(1, 4);
  let fell = false;
  // Walk to the lip of the pit, then jump and keep holding right.
  for (let i = 0; i < 400; i += 1) {
    const atLip = Math.floor((p.x + HB_W * SUB) / (TILE * SUB)) >= 2 && !isAirborne(p);
    const r = stepPlayer(p, room, hold({ dx: 1, jump: atLip, hasSandals }));
    if (r.fell) { fell = true; break; }
    if (tileUnder(p).tx > 1 + pitWidth && !isAirborne(p)) break;
  }
  return { fell, tx: tileUnder(p).tx };
}

test('the base jump clears exactly one tile of pit and no more', () => {
  assert.equal(attemptPit(1, false).fell, false, 'a 1-tile pit should be clearable');
  assert.equal(attemptPit(2, false).fell, true, 'a 2-tile pit must not be');
});

test('the Gale Sandals clear two tiles but never three', () => {
  assert.equal(attemptPit(2, true).fell, false, 'a 2-tile pit should be clearable with sandals');
  assert.equal(attemptPit(3, true).fell, true, 'a 3-tile pit must not be, even with sandals');
});

test('mashing B on the landing frame cannot hover her across a pit', () => {
  // Regression: if the pit check waited for a frame that is not "airborne",
  // a player re-pressing B the instant she touches down would never be
  // standing on anything, and every pit in the game would be free.
  const room = grid([
    '##########', '#........#', '#........#', '#.PPPPPP.#',
    '#.PPPPPP.#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(1, 3);
  let fell = false;
  for (let i = 0; i < 400 && !fell; i += 1) {
    fell = stepPlayer(p, room, hold({ dx: 1, jump: true })).fell;
  }
  assert.ok(fell, 'holding B every frame must not carry her over a six-tile pit');
  assert.ok(tileUnder(p).tx <= 4, 'and she should not have got far');
});

test('falling into a pit returns her to the last safe tile', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#..PPP...#',
    '#..PPP...#', '#........#', '#........#', '##########',
  ]);
  const p = makePlayer(1, 3);
  let fell = false;
  let lastSafe = null;
  for (let i = 0; i < 200 && !fell; i += 1) {
    lastSafe = { x: p.safeX, y: p.safeY };
    fell = stepPlayer(p, room, hold({ dx: 1 })).fell;
  }
  assert.ok(fell, 'walking into a pit should make her fall');
  assert.ok(p.falling > 0, 'she should be mid-fall');
  for (let i = 0; i < 40; i += 1) stepPlayer(p, room, hold({}));
  assert.equal(p.falling, 0);
  assert.deepEqual({ x: p.x, y: p.y }, lastSafe, 'she is back where she last stood safely');
  assert.equal(tileUnder(p).tx, 2, 'which is the tile at the lip of the pit');
  assert.notEqual(room[tileUnder(p).ty][tileUnder(p).tx], 'P');
});

test('a raised ledge needs both the sandals and being airborne', () => {
  const room = grid([
    '##########', '#........#', '#........#', '#....JJ..#',
    '#........#', '#........#', '#........#', '##########',
  ]);
  const walk = (hasSandals, jump) => {
    const p = makePlayer(2, 3);
    for (let i = 0; i < 80; i += 1) {
      stepPlayer(p, room, hold({ dx: 1, hasSandals, jump: jump && i === 24 }));
    }
    return tileUnder(p).tx;
  };
  assert.ok(walk(false, false) < 5, 'no sandals: the ledge is a wall');
  assert.ok(walk(false, true) < 5, 'jumping without sandals: still a wall');
  assert.ok(walk(true, false) < 5, 'sandals but grounded: still a wall');
  assert.ok(walk(true, true) >= 5, 'sandals and airborne: she vaults up');
});

test('crossing a room edge is detected and mirrored on the far side', () => {
  const p = makePlayer(4, 4);
  assert.equal(edgeCrossed(p), null);
  p.x = -HB_W * SUB;
  assert.equal(edgeCrossed(p), 'w');
  const spot = placeAfterExit(p, 'w');
  assert.equal(spot.x, (VIEW_W - HB_W) * SUB, 'entering from the west edge puts her at the east edge');
});

test('walking out of a room scrolls into the next one and keeps her y', () => {
  const game = new Game();
  game.newGame();
  const y0 = game.player.y;
  for (let i = 0; i < 400 && game.scene !== SCENE.TRANSITION; i += 1) game.step(BTN.RIGHT);
  assert.equal(game.scene, SCENE.TRANSITION);
  assert.equal(game.transition.from.id, 'ow_cinderhome');
  assert.equal(game.room.id, 'ow_southmire');
  assert.equal(game.player.y, y0, 'the exit and entrance line up, so y is unchanged');
  assert.equal(game.player.x, 0, 'she arrives at the west edge of the new room');
  for (let i = 0; i < 30; i += 1) game.step(0);
  assert.equal(game.scene, SCENE.PLAY, 'the scroll finishes on its own');
});

test('a closed door is not a room exit', () => {
  const game = new Game();
  game.newGame();
  // Cinderhome's north wall is cracked and stays shut until the Rootcarver Blade.
  for (let i = 0; i < 400; i += 1) {
    game.step(BTN.UP);
    if (game.scene === SCENE.TRANSITION) break;
  }
  assert.equal(game.scene, SCENE.PLAY, 'she should still be in Cinderhome');
  assert.equal(game.room.id, 'ow_cinderhome');
});

test('Start pauses and Start resumes', () => {
  const game = new Game();
  game.newGame();
  game.step(0);
  game.step(BTN.START);
  assert.equal(game.scene, SCENE.PAUSE);
  const where = { x: game.player.x, y: game.player.y };
  for (let i = 0; i < 60; i += 1) game.step(BTN.RIGHT);
  assert.deepEqual({ x: game.player.x, y: game.player.y }, where, 'paused means paused');
  game.step(0);
  game.step(BTN.START);
  assert.equal(game.scene, SCENE.PLAY);
});

test('the title screen offers New Game, and Continue only when there is a save', () => {
  const fresh = new Game();
  assert.deepEqual(fresh.titleOptions().map((o) => o.enabled), [false, true]);
  assert.equal(fresh.menuIndex, 1, 'the cursor starts on the only enabled option');
  fresh.step(0);
  fresh.step(BTN.UP);
  assert.equal(fresh.menuIndex, 1, 'a disabled option cannot be selected');

  const saved = new Game({ hasSave: true });
  assert.equal(saved.menuIndex, 0);
  saved.step(0);
  saved.step(BTN.DOWN);
  assert.equal(saved.menuIndex, 1);
});

test('the same seed and the same inputs produce the same run', () => {
  const run = () => {
    const g = new Game();
    g.step(0); g.step(BTN.A);
    for (let i = 0; i < 300; i += 1) g.step(i % 7 === 0 ? BTN.B : BTN.RIGHT | BTN.DOWN);
    return JSON.stringify(g.describe());
  };
  assert.equal(run(), run());
});

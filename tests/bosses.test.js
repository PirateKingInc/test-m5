import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BTN, SCENE, CREDITS } from '../src/game/game.js';
import { phaseFor, BOSS_STATS, bossHitResult } from '../src/game/bosses.js';
import { placeAt, run } from './helpers/sandbox.js';
import { TILE, SUB, HB_W } from '../src/game/constants.js';

/** Drops the player straight into a boss room at a chosen phase. */
function arena(kind, { hp, upgrades = {}, at } = {}) {
  const room = kind === 'sapwarden' ? 'd1_boss' : 'd2_boss';
  const g = new Game();
  g.newGame();
  Object.assign(g.progress.upgrades, upgrades);
  g.enterRoom(room);
  // Both arenas have holes in them, so a boss test must say where she stands.
  const [sx, sy] = at ?? (kind === 'sapwarden' ? [6, 3] : [7, 3]);
  placeAt(g.player, sx, sy);
  if (hp !== undefined) {
    g.boss.hp = hp;
    g.boss.phase = phaseFor(kind, hp);
  }
  g.boss.intro = 0;
  g.player.iframes = 0;
  return g;
}

/** Faces a direction and presses A, returning the boss's health lost. */
function swing(g, dir, frames = 6) {
  const bit = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT }[dir];
  const before = g.boss.hp;
  g.step(bit);
  for (let i = 0; i < frames; i += 1) g.step(bit | (i === 0 ? BTN.A : 0));
  return before - g.boss.hp;
}

test('both bosses exist, in the right rooms, with the phases SPEC.md gives them', () => {
  assert.deepEqual(Object.keys(BOSS_STATS).sort(), ['chorister', 'sapwarden']);
  assert.equal(phaseFor('sapwarden', 24), 1);
  assert.equal(phaseFor('sapwarden', 16), 2);
  assert.equal(phaseFor('sapwarden', 8), 3);
  assert.equal(phaseFor('sapwarden', 1), 3);
  assert.equal(phaseFor('chorister', 24), 1);
  assert.equal(phaseFor('chorister', 18), 2);
  assert.equal(phaseFor('chorister', 10), 3);

  assert.equal(arena('sapwarden').boss.type, 'sapwarden');
  assert.equal(arena('chorister').boss.type, 'chorister');
});

test('the Sap-Warden phase two shell is the Rootcarver Blade being asked for', () => {
  // The rule in isolation.
  const sealed = { shell: true, z: 0 };
  assert.equal(bossHitResult(sealed, { blade: false }, false), 'shell');
  assert.equal(bossHitResult(sealed, { blade: true }, false), 'hit');

  // And in the arena. Phase two seals on its first step.
  const blunt = arena('sapwarden', { hp: 14 });
  blunt.step(0);
  assert.equal(blunt.boss.phase, 2);
  assert.equal(blunt.boss.shell, true);
  placeAt(blunt.player, 3, 3);
  blunt.boss.x = 4 * TILE * SUB;
  blunt.boss.y = 3 * TILE * SUB - 8 * SUB;
  assert.equal(swing(blunt, 'right'), 0, 'a pre-upgrade swing rings off the bark');

  const armed = arena('sapwarden', { hp: 14, upgrades: { blade: true } });
  armed.step(0);
  placeAt(armed.player, 3, 3);
  armed.boss.x = 4 * TILE * SUB;
  armed.boss.y = 3 * TILE * SUB - 8 * SUB;
  assert.ok(swing(armed, 'right') > 0, 'the Rootcarver splits it');
});

test('the Sap-Warden phase three lays shockwaves along the floor', () => {
  const g = arena('sapwarden', { hp: 6, upgrades: { blade: true }, at: [6, 3] });
  g.player.iframes = 1e6;
  // Waves die against the walls, so watch the whole cycle rather than the end.
  const seen = [];
  for (let i = 0; i < 300; i += 1) {
    g.step(0);
    for (const h of g.hazards) if (h.kind === 'shockwave' && !seen.includes(h)) seen.push(h);
  }
  assert.equal(g.boss.phase, 3);
  assert.ok(seen.length > 0, 'phase three should have laid at least one wave');
  for (const h of seen) assert.equal(h.groundOnly, true, 'and every wave must be jumpable');
});

test('the Chorister phase two puts two tiles of nothing between you and it', () => {
  const g = arena('chorister', { hp: 14, at: [7, 5] });
  g.player.iframes = 1e6;
  run(g, 200, 0);
  assert.equal(g.boss.phase, 2);
  // It withdraws into the island corner: columns 1-3, rows 1-3.
  assert.equal(Math.floor(g.boss.x / SUB / TILE), 1, 'it withdraws to the island');
  assert.equal(Math.floor(g.boss.y / SUB / TILE), 1);
  // Two tiles of nothing to the east of the island, and two to the south.
  for (const col of [4, 5]) assert.equal(g.room.grid[1][col], 'P');
  for (const row of [4, 5]) assert.equal(g.room.grid[row][2], 'P');

  // Swinging from the near lip cannot possibly reach across either gap.
  placeAt(g.player, 6, 1);
  assert.equal(swing(g, 'left'), 0, 'no swing crosses the eastern gap');
  placeAt(g.player, 2, 6);
  assert.equal(swing(g, 'up'), 0, 'nor the southern one');
});

test('the Chorister phase two is reachable once the Gale Sandals are on', () => {
  const g = arena('chorister', { hp: 14, upgrades: { sandals: true }, at: [7, 5] });
  g.player.iframes = 1e6;
  run(g, 200, 0);
  assert.equal(g.boss.phase, 2);
  // Line up on the eastern lip of the island shelf and jump west.
  placeAt(g.player, 6, 1);
  assert.equal(g.room.grid[1][6], '.', 'the near lip should be solid ground');
  for (let i = 0; i < 60; i += 1) g.step(BTN.LEFT | (i === 0 ? BTN.B : 0));
  const tile = Math.floor((g.player.x + (HB_W * SUB) / 2) / SUB / TILE);
  assert.ok(tile <= 3, `she should be on the island, not column ${tile}`);
  assert.equal(g.player.falling, 0, 'and not in the chasm');
  // And from there the blade does reach it.
  assert.ok(swing(g, 'left') > 0, 'from the island the swing lands');
});

test('the Chorister phase three cannot be touched from the ground', () => {
  const g = arena('chorister', { hp: 8, upgrades: { sandals: true } });
  g.player.iframes = 1e6;
  g.step(0);
  assert.equal(g.boss.phase, 3);
  run(g, 10, 0);
  assert.ok(g.boss.z > 0, 'it should be hovering');

  // Park her right under it, on solid floor, and swing from the ground.
  placeAt(g.player, 7, 4);
  g.boss.x = g.player.x - 8 * SUB;
  g.boss.y = g.player.y - 20 * SUB;
  g.hazards = [];
  assert.equal(swing(g, 'up'), 0, 'a grounded swing passes under it');

  // Now the same swing, airborne.
  const before = g.boss.hp;
  g.step(BTN.B);
  for (let i = 0; i < 8; i += 1) g.step(i === 3 ? BTN.A : 0);
  assert.ok(g.boss.hp < before, 'an airborne swing connects');
});

test('a hovering Chorister cannot touch her on the ground either', () => {
  const g = arena('chorister', { hp: 8, upgrades: { sandals: true } });
  g.step(0);
  assert.ok(g.boss.z > 0, 'it should be hovering');
  // Column 7 is solid floor; the arena's chasm is columns 4 and 5.
  placeAt(g.player, 7, 3);
  g.boss.x = g.player.x - 8 * SUB;
  g.boss.y = g.player.y - 8 * SUB;
  g.hazards = [];
  const hp = g.player.hp;
  g.step(0);
  assert.equal(g.player.hp, hp, 'standing under it is safe');
});

test('beating the Sap-Warden lights a stone and sends her home', () => {
  const g = arena('sapwarden', { hp: 1, upgrades: { blade: true }, at: [4, 3] });
  g.boss.x = g.player.x + 12 * SUB;
  g.boss.y = g.player.y - 8 * SUB;
  // Watch for the autosave on the frame the win lands, not several frames later.
  let sawSave = false;
  g.step(BTN.RIGHT);
  for (let i = 0; i < 6; i += 1) {
    g.step(BTN.RIGHT | (i === 0 ? BTN.A : 0));
    if (g.saveRequested) sawSave = true;
  }
  assert.equal(g.boss.alive, false);
  assert.ok(g.progress.bossesBeaten.has('sapwarden'));
  assert.equal(g.scene, SCENE.DIALOGUE);
  assert.equal(sawSave, true, 'the win is saved immediately');

  // Close the box; she should be put back at the vault landing.
  for (let i = 0; i < 300 && g.scene === SCENE.DIALOGUE; i += 1) g.step(i % 8 === 0 ? BTN.A : 0);
  assert.equal(g.scene, SCENE.PLAY);
  assert.equal(g.room.id, 'd1_entry');

  // And it stays dead.
  g.enterRoom('d1_boss');
  assert.equal(g.boss, null);
});

test('beating the Chorister rolls the ending, then credits, then the title', () => {
  const g = arena('chorister', { hp: 1, upgrades: { sandals: true }, at: [7, 3] });
  g.boss.x = g.player.x + 12 * SUB;
  g.boss.y = g.player.y - 8 * SUB;
  g.boss.z = 0;
  g.boss.phase = 3;
  g.step(BTN.RIGHT);
  g.step(BTN.RIGHT | BTN.B);
  for (let i = 0; i < 8 && g.boss.alive; i += 1) g.step(BTN.RIGHT | (i === 2 ? BTN.A : 0));
  assert.equal(g.boss.alive, false);
  assert.ok(g.progress.bossesBeaten.has('chorister'));

  for (let i = 0; i < 400 && g.scene === SCENE.DIALOGUE; i += 1) g.step(i % 8 === 0 ? BTN.A : 0);
  assert.equal(g.scene, SCENE.ENDING);

  run(g, 220, 0);
  g.step(BTN.A);
  assert.equal(g.scene, SCENE.CREDITS);

  run(g, CREDITS.length * 30 + 260, 0);
  assert.equal(g.scene, SCENE.TITLE);
  assert.equal(g.hasSave, true, 'and Continue is offered afterwards');
});

test('a beaten boss stays beaten across a save', () => {
  const g = arena('sapwarden', { hp: 1, upgrades: { blade: true }, at: [4, 3] });
  g.boss.x = g.player.x + 12 * SUB;
  g.boss.y = g.player.y - 8 * SUB;
  swing(g, 'right');
  const blob = g.toSave();
  const back = new Game();
  back.loadSave(blob);
  back.enterRoom('d1_boss');
  assert.equal(back.boss, null);
});

test('a phase change buys the boss a moment where nothing lands', () => {
  const g = arena('sapwarden', { hp: 18, upgrades: { blade: true }, at: [4, 3] });
  g.boss.x = g.player.x + 12 * SUB;
  g.boss.y = g.player.y - 8 * SUB;
  swing(g, 'right');                       // 12 -> 10 -> crosses into phase 2
  assert.equal(g.boss.phase, 2);
  assert.ok(g.boss.intro > 0, 'it roars before the next phase starts');
  const hp = g.boss.hp;
  g.boss.x = g.player.x + 12 * SUB;
  swing(g, 'right');
  assert.equal(g.boss.hp, hp, 'and cannot be hit during it');
});

test('the credits are all original lines and end with THE END', () => {
  assert.ok(CREDITS.length > 8);
  assert.equal(CREDITS[CREDITS.length - 1], 'THE END');
  assert.ok(CREDITS.includes('BRACKENFALL'));
});

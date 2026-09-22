import test from 'node:test';
import assert from 'node:assert/strict';
import { sandbox, placeAt, run, BTN } from './helpers/sandbox.js';
import { Game, SCENE } from '../src/game/game.js';
import { openDialogue, tickDialogue, advanceDialogue, visibleLines, pageComplete, MAX_LINE } from '../src/game/dialogue.js';
import { ROOMS, edgeId } from '../src/game/world.js';

const BOX = [
  '##########', '#........#', '#........#', '#........#',
  '#........#', '#........#', '#........#', '##########',
];

/** Walks up to the tile in front, faces `dir`, and presses A once. */
function pressA(game, dir = 'right') {
  const bit = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT }[dir];
  game.step(bit);
  game.step(bit | BTN.A);
  game.step(bit);
  return game;
}

test('the typewriter reveals a glyph every other frame and pages on A', () => {
  const d = openDialogue(['ONE', 'TWO', 'THREE', 'FOUR']);
  assert.equal(d.pages.length, 2, 'three lines to a page');
  assert.deepEqual(visibleLines(d), ['', '', '']);
  for (let i = 0; i < 2; i += 1) tickDialogue(d);
  assert.deepEqual(visibleLines(d), ['O', '', '']);
  while (!pageComplete(d)) tickDialogue(d);
  assert.deepEqual(visibleLines(d), ['ONE', 'TWO', 'THREE']);
  assert.equal(advanceDialogue(d), 'next');
  assert.deepEqual(visibleLines(d), ['']);
  assert.equal(advanceDialogue(d), 'filled', 'A first fills the page');
  assert.equal(advanceDialogue(d), 'close', 'and then closes');
});

test('A on a part-drawn page fills it instead of skipping it', () => {
  const d = openDialogue(['A LONG LINE HERE']);
  tickDialogue(d); tickDialogue(d);
  assert.equal(advanceDialogue(d), 'filled');
  assert.ok(pageComplete(d));
});

test('no line can overflow the box', () => {
  const d = openDialogue(['X'.repeat(80)]);
  assert.equal(d.pages[0][0].length, MAX_LINE);
  for (const room of Object.values(ROOMS)) {
    for (const lines of Object.values(room.signs ?? {})) {
      for (const l of lines) assert.ok(l.length <= MAX_LINE, `sign line too long: ${l}`);
    }
    for (const e of room.entities ?? []) {
      for (const l of e.text ?? []) assert.ok(l.length <= MAX_LINE, `npc line too long: ${l}`);
    }
  }
});

test('reading a sign opens the box and does not swing', () => {
  const tiles = [...BOX];
  tiles[4] = '#....S...#';
  const g = sandbox({ tiles, at: [4, 4], signs: { '5,4': ['A SIGN.', 'IT SAYS THINGS.'] } });
  pressA(g, 'right');
  assert.equal(g.scene, SCENE.DIALOGUE);
  assert.equal(g.player.swing, 0, 'A read the sign instead of swinging');
});

test('A with nothing in front always swings', () => {
  const g = sandbox({ at: [4, 4] });
  pressA(g, 'right');
  assert.equal(g.scene, SCENE.PLAY);
  assert.ok(g.player.swing > 0);
});

test('dialogue freezes the room', () => {
  const tiles = [...BOX];
  tiles[4] = '#....S...#';
  const g = sandbox({
    tiles, at: [4, 4],
    signs: { '5,4': ['STOP.'] },
    entities: [{ type: 'snag', x: 2, y: 2 }],
  });
  pressA(g, 'right');
  const where = { x: g.entities[0].x, y: g.entities[0].y };
  run(g, 60, 0);
  assert.deepEqual({ x: g.entities[0].x, y: g.entities[0].y }, where, 'monsters wait their turn');
});

test('a chest opens once, hands over its contents, and stays open', () => {
  const g = sandbox({
    at: [4, 4],
    props: [{ type: 'chest', x: 5, y: 4, id: 'ch_test', gives: 'blade' }],
  });
  pressA(g, 'right');
  assert.equal(g.progress.upgrades.blade, true);
  assert.equal(g.scene, SCENE.DIALOGUE);
  assert.ok(g.progress.chests.has('ch_test'));
  // Close the box, press again: nothing further happens.
  run(g, 200, 0);
  g.step(BTN.A);
  run(g, 4, 0);
  const before = g.progress.chests.size;
  pressA(g, 'right');
  assert.equal(g.progress.chests.size, before);
});

test('a chest is an obstacle', () => {
  const g = sandbox({
    at: [4, 4],
    props: [{ type: 'chest', x: 5, y: 4, id: 'ch_block', gives: 'smallkey' }],
  });
  const x0 = g.player.x;
  run(g, 40, BTN.RIGHT);
  assert.ok(g.player.x < x0 + 16 * 16, 'she cannot walk through it');
});

test('a heart container adds a heart and never comes back', () => {
  const g = sandbox({
    at: [4, 4],
    props: [{ type: 'heart', x: 5, y: 4, id: 'hc_test' }],
  });
  const max0 = g.progress.maxHp;
  g.player.hp = 1;
  run(g, 30, BTN.RIGHT);
  assert.equal(g.progress.maxHp, max0 + 2);
  assert.equal(g.player.hp, g.progress.maxHp, 'and refills her');
  assert.ok(g.progress.heartsTaken.has('hc_test'));
  assert.equal(g.props.length, 0);
});

test('a loose rock is lifted away; a block pushes exactly one tile', () => {
  const rocks = [...BOX];
  rocks[4] = '#....x...#';
  const g = sandbox({ tiles: rocks, at: [4, 4] });
  pressA(g, 'right');
  assert.equal(g.room.grid[4][5], '.', 'the rock is gone');

  const blocks = [...BOX];
  blocks[4] = '#....o...#';
  const b = sandbox({ tiles: blocks, at: [4, 4] });
  pressA(b, 'right');
  assert.equal(b.room.grid[4][5], '.');
  assert.equal(b.room.grid[4][6], 'o', 'moved one tile, not two');

  const wedged = [...BOX];
  wedged[4] = '#.......o#';
  const w = sandbox({ tiles: wedged, at: [7, 4] });
  pressA(w, 'right');
  assert.equal(w.room.grid[4][8], 'o', 'a block against a wall does not move');
});

test('a cracked wall needs the Rootcarver Blade', () => {
  const g = new Game();
  g.newGame();
  // Cinderhome's north wall is the cracked one.
  g.player.x = 4 * 16 * 16 + 3 * 16;
  g.player.y = 1 * 16 * 16 + 3 * 16;
  pressA(g, 'up');
  assert.equal(g.scene, SCENE.DIALOGUE, 'she should be told it will not give');
  assert.equal(g.progress.openedDoors.size, 0);

  const armed = new Game();
  armed.newGame();
  armed.progress.upgrades.blade = true;
  armed.player.x = 4 * 16 * 16 + 3 * 16;
  armed.player.y = 1 * 16 * 16 + 3 * 16;
  pressA(armed, 'up');
  assert.ok(armed.progress.openedDoors.has(edgeId('ow_cinderhome', 'ow_whorlgrove')));
  assert.equal(armed.room.grid[0][4], '.', 'and the wall is gone from the live room');
});

test('a locked door spends exactly one key, and refuses without one', () => {
  const g = new Game();
  g.newGame();
  g.enterRoom('d1_guard');
  placeAt(g.player, 8, 3);
  pressA(g, 'right');
  assert.equal(g.scene, SCENE.DIALOGUE);
  assert.equal(g.progress.openedDoors.size, 0, 'no key, no door');

  g.dialogue = null;
  g.scene = SCENE.PLAY;
  g.progress.keys.mire = 2;
  pressA(g, 'right');
  assert.equal(g.progress.keys.mire, 1, 'exactly one key spent');
  assert.ok(g.progress.openedDoors.has(edgeId('d1_guard', 'd1_shortcut')));

  // And it stays open from the other side, and after leaving and returning.
  g.enterRoom('d1_shortcut');
  assert.equal(g.room.grid[3][0], '.');
  g.enterRoom('d1_guard');
  assert.equal(g.room.grid[3][9], '.');
});

test('key counts are per dungeon and never go below zero', () => {
  const g = new Game();
  g.newGame();
  g.progress.keys.aerie = 3;
  g.enterRoom('d1_guard');
  placeAt(g.player, 8, 3);
  pressA(g, 'right');
  assert.equal(g.progress.openedDoors.size, 0, 'Aerie keys do not open Mire doors');
  assert.equal(g.progress.keys.mire, 0);
});

test('a boss door needs that dungeon’s boss key and does not consume it', () => {
  const g = new Game();
  g.newGame();
  g.enterRoom('d1_prechamber');
  placeAt(g.player, 1, 3);
  pressA(g, 'left');
  assert.equal(g.progress.openedDoors.size, 0);

  g.dialogue = null; g.scene = SCENE.PLAY;
  g.progress.bossKeys.aerie = true;
  pressA(g, 'left');
  assert.equal(g.progress.openedDoors.size, 0, 'the wrong dungeon’s key is no key');

  g.dialogue = null; g.scene = SCENE.PLAY;
  g.progress.bossKeys.mire = true;
  pressA(g, 'left');
  assert.ok(g.progress.openedDoors.has(edgeId('d1_prechamber', 'd1_boss')));
  assert.equal(g.progress.bossKeys.mire, true, 'a boss key is not spent');
});

test('the guardroom gate opens itself once the room is clear', () => {
  const g = new Game();
  g.newGame();
  g.enterRoom('d1_guard');
  assert.equal(g.room.grid[0][4], 'G');
  for (const e of g.entities) e.alive = false;
  g.step(0);
  assert.ok(g.progress.openedDoors.has(edgeId('d1_guard', 'd1_keyroom')));
  assert.equal(g.room.grid[0][4], '.');
});

test('the Northgate gate needs a spin on the pillar, not a key', () => {
  const g = new Game();
  g.newGame();
  g.progress.upgrades.charm = true;
  g.enterRoom('ow_northgate');
  assert.equal(g.room.grid[3][9], 'G');
  placeAt(g.player, 4, 3);      // directly under the pillar at 4,2
  run(g, 40, BTN.A);            // wind up
  run(g, 10, 0);                // let go: the spin goes off
  assert.ok(g.progress.pillars.has('ow_northgate'), 'the spin should wake it');
  g.step(0);
  assert.ok(g.progress.openedDoors.has(edgeId('ow_northgate', 'ow_stormstair')));
  assert.equal(g.room.grid[3][9], '.');
});

test('an ordinary swing does not wake the pillar', () => {
  const g = new Game();
  g.newGame();
  g.enterRoom('ow_northgate');
  placeAt(g.player, 4, 3);
  run(g, 10, BTN.A);
  run(g, 10, 0);
  assert.equal(g.progress.pillars.has('ow_northgate'), false);
});

test('a stair carries her between the overworld and a dungeon, and back', () => {
  const g = new Game();
  g.newGame();
  g.enterRoom('ow_mirevault');
  placeAt(g.player, 2, 1);       // stand on the stair
  g.step(0);
  assert.equal(g.room.id, 'ow_mirevault', 'arriving on a stair does not bounce her');
  placeAt(g.player, 2, 3);
  g.step(0);                      // step off, clearing the lock
  placeAt(g.player, 2, 1);
  g.step(0);
  assert.equal(g.room.id, 'd1_entry');
  // And the way back.
  placeAt(g.player, 2, 4);
  g.step(0);
  placeAt(g.player, 2, 2);
  g.step(0);
  assert.equal(g.room.id, 'ow_mirevault');
});

test('a save point asks the host to save', () => {
  const g = new Game();
  g.newGame();
  placeAt(g.player, 6, 3);        // Cinderhome's save marker
  g.step(0);
  g.step(BTN.A);
  assert.equal(g.saveRequested, true);
  assert.equal(g.scene, SCENE.DIALOGUE);
});

test('talking to Mabel says something, and she is solid', () => {
  const g = new Game();
  g.newGame();
  placeAt(g.player, 6, 4);
  pressA(g, 'down');
  assert.equal(g.scene, SCENE.DIALOGUE);
  assert.ok(g.dialogue.pages[0][0].includes('SUMMER'));
});

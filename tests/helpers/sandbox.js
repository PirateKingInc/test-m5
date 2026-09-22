// A one-room laboratory. Tests state the geometry they care about instead of
// hunting for a shipped room that happens to have the right shape.

import { Game, BTN } from '../../src/game/game.js';
import { makeEnemy } from '../../src/game/enemies.js';
import { makeProp } from '../../src/game/props.js';
import { ROOMS } from '../../src/game/world.js';
import { TILE, SUB, HB_W, HB_H } from '../../src/game/constants.js';

let roomCounter = 0;

const EMPTY = [
  '##########',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '#........#',
  '##########',
];

/**
 * @param {object} [opts]
 * @param {string[]} [opts.tiles] room ASCII, defaults to a bare box
 * @param {Array<{type:string,x:number,y:number,face?:string}>} [opts.entities]
 * @param {[number, number]} [opts.at] where to stand Summer, in tiles
 */
export function sandbox(opts = {}) {
  const game = new Game();
  game.newGame();

  // Register the throwaway room in the world table, because the simulation is
  // entitled to assume every room it is standing in has data behind it.
  const id = `test_room_${roomCounter += 1}`;
  const tiles = opts.tiles ?? EMPTY;
  ROOMS[id] = {
    name: 'TEST',
    area: opts.area ?? 'overworld',
    grid: [0, 0],
    tiles,
    exits: opts.exits ?? {},
    doors: opts.doors,
    signs: opts.signs,
    entities: [],
  };
  game.room = {
    id,
    name: 'TEST',
    area: opts.area ?? 'overworld',
    grid: tiles.map((r) => [...r]),
  };
  game.props = (opts.props ?? []).map((spec) => makePropSpec(spec));
  game.entities = (opts.entities ?? []).map(makeEnemy);
  game.hazards = [];
  game.pickups = [];
  if (opts.at) placeAt(game.player, opts.at[0], opts.at[1]);
  if (opts.upgrades) Object.assign(game.progress.upgrades, opts.upgrades);
  // Room entry leaves her briefly invincible in some tests' way; clear it.
  game.player.iframes = 0;
  return game;
}

function makePropSpec(spec) {
  // Deferred import avoids a cycle between the helper and the game module graph.
  return makeProp(spec);
}

/** Teleports Summer onto a tile, ready to act: not mid-jump, not mid-fall. */
export function placeAt(p, tx, ty) {
  p.x = tx * TILE * SUB + ((TILE - HB_W) / 2) * SUB;
  p.y = ty * TILE * SUB + ((TILE - HB_H) / 2) * SUB;
  p.safeX = p.x;
  p.safeY = p.y;
  p.air = 0;
  p.aloft = false;
  p.falling = 0;
  p.knock = 0;
}

/** Runs n frames with the given buttons held. */
export function run(game, n, buttons = 0) {
  for (let i = 0; i < n; i += 1) game.step(buttons);
  return game;
}

/** Swings once, facing `dir`, and returns whether the first enemy took damage. */
export function swingAt(game, dir) {
  const bit = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT }[dir];
  game.step(bit);          // turn to face
  const before = game.entities.map((e) => e.hp);
  game.step(bit | BTN.A);  // press A
  game.step(bit);
  game.step(bit);
  return game.entities.some((e, i) => e.hp < before[i]) ||
    game.entities.length < before.length;
}

export { BTN };

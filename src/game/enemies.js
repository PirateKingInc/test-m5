// The six monsters, their projectiles and their hazards.
//
// Each type gets one update function. They share the same shape - read the
// player, move, maybe emit something - so a new monster is one entry in
// BEHAVIOUR and nothing else.

import { SUB, TILE, ROOM_W, ROOM_H, HOVER_Z, HB_W, HB_H } from './constants.js';
import { blocks } from './tilemap.js';
import { ENEMY_W, ENEMY_H, enemyBox, centreOf, playerBox } from './combat.js';
import { int, chance } from './rng.js';

/** Per-type stats. `shielded` drives the hit-from-behind rule in combat.js. */
export const STATS = {
  snag: { hp: 1, speed: 8, flying: false },
  brumbler: { hp: 2, speed: 10, flying: false },
  palebuckler: { hp: 2, speed: 6, flying: false, shielded: true },
  mothkin: { hp: 1, speed: 10, flying: true, z: HOVER_Z },
  thudder: { hp: 3, speed: 5, flying: false },
  spitfen: { hp: 2, speed: 0, flying: false },
};

/** Frames a Brumbler spends visibly winding up before it launches. */
export const BRUMBLER_WINDUP = 26;

export const DIRS = ['up', 'down', 'left', 'right'];
export const VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function makeEnemy(spec) {
  const stats = STATS[spec.type];
  return {
    kind: spec.type,
    x: spec.x * TILE * SUB + ((TILE - ENEMY_W) / 2) * SUB,
    y: spec.y * TILE * SUB + ((TILE - ENEMY_H) / 2) * SUB,
    dir: spec.face ?? 'down',
    hp: stats.hp,
    z: stats.z ?? 0,
    flying: stats.flying,
    shielded: stats.shielded === true,
    alive: true,
    hurt: 0,
    timer: 0,
    state: 'idle',
    anim: 0,
  };
}

/** Ground monsters treat pits as walls; only a Mothkin crosses one. */
function enemyBlocked(grid, x, y, flying) {
  const left = Math.floor(x / SUB);
  const top = Math.floor(y / SUB);
  const right = Math.floor((x + ENEMY_W * SUB - 1) / SUB);
  const bottom = Math.floor((y + ENEMY_H * SUB - 1) / SUB);
  for (let py = top; py <= bottom; py += 1) {
    for (let px = left; px <= right; px += 1) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return true;
      const ch = grid[ty][tx];
      if (blocks(ch, { airborne: flying, hasSandals: true, onLedge: true })) return true;
      if (!flying && ch === 'P') return true;
    }
  }
  return false;
}

/** Moves an enemy, one axis at a time. Returns true if it actually moved. */
function move(e, grid, dx, dy) {
  let moved = false;
  if (dx && !enemyBlocked(grid, e.x + dx, e.y, e.flying)) { e.x += dx; moved = true; }
  if (dy && !enemyBlocked(grid, e.x, e.y + dy, e.flying)) { e.y += dy; moved = true; }
  return moved;
}

function towards(e, p) {
  const a = centreOf(enemyBox(e));
  const b = centreOf(playerBox(p));
  return { dx: b.x - a.x, dy: b.y - a.y };
}

function faceTowards(e, p) {
  const { dx, dy } = towards(e, p);
  if (Math.abs(dx) > Math.abs(dy)) e.dir = dx < 0 ? 'left' : 'right';
  else e.dir = dy < 0 ? 'up' : 'down';
}

// --- behaviours -------------------------------------------------------------

const BEHAVIOUR = {
  /** Wanders. Picks a fresh direction on a seeded timer, or when it hits a wall. */
  snag(e, ctx) {
    e.timer -= 1;
    if (e.timer <= 0) {
      e.dir = DIRS[int(ctx.rng, 4)];
      e.timer = 30 + int(ctx.rng, 40);
    }
    const [vx, vy] = VEC[e.dir];
    if (!move(e, ctx.grid, vx * STATS.snag.speed, vy * STATS.snag.speed)) e.timer = 0;
  },

  /**
   * Waits until Summer shares its row or column, then charges in a straight
   * line until something stops it. The recovery afterwards is its weak spot.
   */
  brumbler(e, ctx) {
    if (e.state === 'stunned') {
      e.timer -= 1;
      if (e.timer <= 0) e.state = 'idle';
      return;
    }
    // Paws the ground before it goes. A charge at twice walking speed with no
    // tell is not a monster, it is a dice roll.
    if (e.state === 'winding') {
      e.timer -= 1;
      if (e.timer <= 0) e.state = 'charging';
      return;
    }
    if (e.state === 'charging') {
      const [vx, vy] = VEC[e.dir];
      if (!move(e, ctx.grid, vx * 34, vy * 34)) {
        e.state = 'stunned';
        e.timer = 40;
      }
      return;
    }
    const { dx, dy } = towards(e, ctx.player);
    const aligned = Math.abs(dy) < 8 * SUB ? 'x' : Math.abs(dx) < 8 * SUB ? 'y' : null;
    if (aligned === 'x') {
      e.dir = dx < 0 ? 'left' : 'right';
      e.state = 'winding';
      e.timer = BRUMBLER_WINDUP;
    } else if (aligned === 'y') {
      e.dir = dy < 0 ? 'up' : 'down';
      e.state = 'winding';
      e.timer = BRUMBLER_WINDUP;
    } else {
      e.timer -= 1;
      if (e.timer <= 0) {
        faceTowards(e, ctx.player);
        e.timer = 24;
      }
    }
  },

  /** Paces back and forth behind its shield. It never turns to face Summer. */
  palebuckler(e, ctx) {
    const [vx, vy] = VEC[e.dir];
    const s = STATS.palebuckler.speed;
    if (!move(e, ctx.grid, vx * s, vy * s)) {
      e.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[e.dir];
    }
  },

  /** Weaves toward Summer at hover height, straight over any pit. */
  mothkin(e, ctx) {
    e.timer += 1;
    const { dx, dy } = towards(e, ctx.player);
    const s = STATS.mothkin.speed;
    const weave = Math.sin(e.timer / 12) * 6;
    const mag = Math.hypot(dx, dy) || 1;
    move(
      e, ctx.grid,
      Math.round((dx / mag) * s + (Math.abs(dx) < Math.abs(dy) ? weave : 0)),
      Math.round((dy / mag) * s + (Math.abs(dx) >= Math.abs(dy) ? weave : 0)),
    );
    e.z = HOVER_Z;
  },

  /** Shuffles forward and stomps. The wave is the threat, not the body. */
  thudder(e, ctx) {
    e.timer += 1;
    if (e.timer % 120 === 0) {
      faceTowards(e, ctx.player);
      e.state = 'stomp';
      const c = centreOf(enemyBox(e));
      ctx.spawn(makeShockwave(c.x, c.y, e.dir));
    }
    if (e.timer % 120 > 20) {
      e.state = 'idle';
      const { dx, dy } = towards(e, ctx.player);
      const s = STATS.thudder.speed;
      const mag = Math.hypot(dx, dy) || 1;
      move(e, ctx.grid, Math.round((dx / mag) * s), Math.round((dy / mag) * s));
    }
  },

  /** Rooted. Turns to face Summer between shots, then spits along that line. */
  spitfen(e, ctx) {
    e.timer += 1;
    if (e.timer % 90 === 45) faceTowards(e, ctx.player);
    if (e.timer % 90 === 0) {
      const c = centreOf(enemyBox(e));
      ctx.spawn(makeSeed(c.x, c.y, e.dir));
      e.state = 'spit';
    } else if (e.timer % 90 > 12) {
      e.state = 'idle';
    }
  },
};

/**
 * Advances one monster.
 * @param {object} e
 * @param {{grid: string[][], player: object, rng: object, spawn: (x:object)=>void}} ctx
 */
export function stepEnemy(e, ctx) {
  if (!e.alive) return;
  if (e.hurt > 0) e.hurt -= 1;
  e.anim += 1;
  BEHAVIOUR[e.kind](e, ctx);
}

// --- projectiles and hazards ------------------------------------------------

export function makeSeed(x, y, dir) {
  const [vx, vy] = VEC[dir];
  return {
    kind: 'seed', x: x - 4 * SUB, y: y - 4 * SUB, vx: vx * 28, vy: vy * 28, z: 0, life: 180,
  };
}

export function makeNote(x, y, vx, vy) {
  return { kind: 'note', x: x - 4 * SUB, y: y - 4 * SUB, vx, vy, z: 0, life: 200 };
}

/**
 * A ground shockwave. It only exists at floor level, which is the whole point:
 * it passes harmlessly under an airborne Summer and there is no other answer.
 */
export function makeShockwave(x, y, dir) {
  const [vx, vy] = VEC[dir];
  return {
    kind: 'shockwave', x: x - 8 * SUB, y: y - 8 * SUB,
    vx: vx * 22, vy: vy * 22, z: 0, groundOnly: true, life: 150, anim: 0,
  };
}

/**
 * A telegraphed root spike.
 *
 * The warning is long on purpose. The Sap-Warden plants three of these across
 * the tile Summer is standing on and the two beside it, so escaping means
 * covering most of two tiles - about 30 pixels - and she walks at one pixel a
 * frame. A 30-frame tell made the attack unavoidable rather than hard.
 */
export const SPIKE_WARN = 45;

export function makeSpike(tx, ty) {
  return {
    kind: 'spike',
    x: tx * TILE * SUB, y: ty * TILE * SUB,
    vx: 0, vy: 0, z: 0, life: SPIKE_WARN + 40, warn: SPIKE_WARN, groundOnly: false, anim: 0,
  };
}

/** Advances a projectile or hazard. Returns false when it should be removed. */
export function stepHazard(h, grid) {
  h.life -= 1;
  h.anim = (h.anim ?? 0) + 1;
  if (h.warn > 0) h.warn -= 1;
  if (h.life <= 0) return false;
  if (h.vx === 0 && h.vy === 0) return true;
  h.x += h.vx;
  h.y += h.vy;
  const cx = Math.floor((h.x + 4 * SUB) / SUB / TILE);
  const cy = Math.floor((h.y + 4 * SUB) / SUB / TILE);
  if (cx < 0 || cy < 0 || cx >= ROOM_W || cy >= ROOM_H) return false;
  // Walls stop projectiles and shockwaves alike; pits do not stop a shockwave.
  if (blocks(grid[cy][cx], { hasSandals: true, onLedge: true })) return false;
  return true;
}

export function hazardBox(h) {
  const size = h.kind === 'seed' || h.kind === 'note' ? 8 : 16;
  return { x: h.x, y: h.y, w: size * SUB, h: size * SUB };
}

/** How often a kill gives a half-heart back. */
export const DROP_CHANCE = 0.45;

/**
 * Half-heart pickups. Enemies drop them through the seeded stream, never the
 * clock. The rate is deliberately generous: every room repopulates when it is
 * re-entered, so kills are the only renewable health in the game and a stingy
 * rate turns a three-heart start into a war of attrition.
 */
export function maybeDrop(e, rng) {
  if (!chance(rng, DROP_CHANCE)) return null;
  return {
    kind: 'halfheart',
    x: e.x, y: e.y, life: 420,
  };
}

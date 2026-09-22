// Summer's body: where she is, which way she faces, and how she gets through a
// room. Pure logic - nothing here knows a canvas exists.

import {
  SUB, TILE, ROOM_W, ROOM_H, VIEW_W, VIEW_H, HB_W, HB_H,
  WALK_SPEED, AIR_SPEED, BASE_AIRTIME, SANDAL_AIRTIME, JUMP_APEX,
  START_HEARTS, HEART,
} from './constants.js';
import { blocks, isPit, isLedge } from './tilemap.js';

export const DIR_VEC = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** A fresh Summer, standing on the given tile. */
export function makePlayer(tx, ty) {
  return {
    x: tx * TILE * SUB + ((TILE - HB_W) / 2) * SUB,
    y: ty * TILE * SUB + ((TILE - HB_H) / 2) * SUB,
    dir: 'down',
    /** 0 while grounded, otherwise counts down the remaining airtime. */
    air: 0,
    airTotal: 0,
    onLedge: false,
    /** Animation clock, in frames. */
    anim: 0,
    moving: false,
    hp: START_HEARTS * HEART,
    maxHp: START_HEARTS * HEART,
    iframes: 0,
    knockX: 0,
    knockY: 0,
    knock: 0,
    /** The last tile she stood on that was not a pit. Falling returns her here. */
    safeX: tx * TILE * SUB + ((TILE - HB_W) / 2) * SUB,
    safeY: ty * TILE * SUB + ((TILE - HB_H) / 2) * SUB,
    falling: 0,
    /** Which axis the player most recently asked for, so held diagonals resolve. */
    lastAxis: 'y',
    /** True for every frame she spent off the ground, landing frame included. */
    aloft: false,
    /** Sword state. A press swings; A held long enough arms the whorl spin. */
    swing: 0,
    swingDir: 'down',
    charge: 0,
    spin: 0,
  };
}

export function isAirborne(p) {
  return p.air > 0;
}

/**
 * Was she off the ground for the whole of the frame just simulated? This, not
 * `isAirborne`, is what shockwaves, Mothkins and the sword's reach should ask,
 * because it stays true across the landing frame.
 */
export function aloft(p) {
  return p.aloft === true;
}

/** Visual lift in pixels, an arc across the airtime. Rendering only. */
export function jumpHeight(p) {
  if (p.air <= 0) return 0;
  const t = 1 - p.air / p.airTotal;
  return Math.round(Math.sin(Math.PI * t) * JUMP_APEX);
}

/** The collision height Summer's sword and hurtbox sit at. */
export function zOf(p) {
  return jumpHeight(p);
}

export function airtimeFor(hasSandals) {
  return hasSandals ? SANDAL_AIRTIME : BASE_AIRTIME;
}

/** The tile under Summer's centre. */
export function tileUnder(p) {
  return {
    tx: Math.floor((p.x + (HB_W * SUB) / 2) / (TILE * SUB)),
    ty: Math.floor((p.y + (HB_H * SUB) / 2) / (TILE * SUB)),
  };
}

function tileAt(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= ROOM_W || ty >= ROOM_H) return null;
  return grid[ty][tx];
}

/**
 * Is the box at (x, y) subpixels overlapping anything solid?
 * Outside the room is deliberately NOT solid: the border walls already stop
 * her, so anything that gets outside came through an opening and is about to
 * trigger a room transition.
 */
export function boxBlocked(grid, x, y, ctx) {
  const extra = ctx.solid;
  const left = Math.floor(x / SUB);
  const top = Math.floor(y / SUB);
  const right = Math.floor((x + HB_W * SUB - 1) / SUB);
  const bottom = Math.floor((y + HB_H * SUB - 1) / SUB);
  for (let py = top; py <= bottom; py += 1) {
    for (let px = left; px <= right; px += 1) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      const ch = tileAt(grid, tx, ty);
      if (ch === null) continue;
      if (blocks(ch, ctx)) return true;
      // Chests and people stand on floor tiles but still stop her.
      if (extra && extra.has(`${tx},${ty}`)) return true;
    }
  }
  return false;
}

/**
 * Moves one axis and stops at the first solid tile. Axis-separated so Summer
 * slides along a wall instead of sticking to it.
 */
function slide(grid, p, dx, dy, ctx) {
  if (dx === 0 && dy === 0) return;
  const step = Math.sign(dx || dy);
  let remaining = Math.abs(dx || dy);
  while (remaining > 0) {
    const bite = Math.min(remaining, SUB); // never tunnel through a tile
    const nx = p.x + (dx ? step * bite : 0);
    const ny = p.y + (dy ? step * bite : 0);
    if (boxBlocked(grid, nx, ny, ctx)) return;
    p.x = nx;
    p.y = ny;
    remaining -= bite;
  }
}

/**
 * One frame of walking, jumping and falling.
 *
 * @param {object} p player
 * @param {string[][]} grid materialised room tiles
 * @param {{dx:number, dy:number, jump:boolean, hasSandals:boolean, frozen:boolean,
 *   solid?: Set<string>}} input `solid` holds "tx,ty" keys for props that block
 * @returns {{fell:boolean, landed:boolean, jumped:boolean}}
 */
export function stepPlayer(p, grid, input) {
  const out = { fell: false, landed: false, jumped: false };

  if (p.falling > 0) {
    // Down a hole is not in the air: leaving `aloft` set from the hop that
    // took her over the edge leaves it set for the whole drop and the whole
    // recovery, and anything reading it - the ground-attack immunity, a bot
    // waiting for her feet - believes it.
    p.aloft = false;
    p.falling -= 1;
    if (p.falling === 0) {
      p.x = p.safeX;
      p.y = p.safeY;
      p.air = 0;
    }
    return out;
  }

  if (p.iframes > 0) p.iframes -= 1;

  // A jump asked for this frame is airborne for the whole of this frame. The
  // countdown does not reach zero until the end, so `p.aloft` - not the
  // countdown - is what anything outside this function should read. Otherwise
  // the landing frame reads as grounded and "jump the shockwave" becomes luck.
  if (input.jump && !isAirborne(p) && p.knock === 0 && !input.frozen) {
    p.air = airtimeFor(input.hasSandals);
    p.airTotal = p.air;
    out.jumped = true;
  }
  const airborne = isAirborne(p);
  p.aloft = airborne;
  const ctx = {
    airborne, hasSandals: input.hasSandals, onLedge: p.onLedge, solid: input.solid,
  };

  // Knockback overrides steering entirely.
  if (p.knock > 0) {
    p.knock -= 1;
    slide(grid, p, p.knockX, 0, ctx);
    slide(grid, p, 0, p.knockY, ctx);
  } else if (!input.frozen) {
    let { dx, dy } = input;
    // Strict four-direction movement: a held diagonal resolves to whichever
    // axis was asked for most recently.
    if (dx !== 0 && dy !== 0) {
      if (p.lastAxis === 'x') dy = 0;
      else dx = 0;
    } else if (dx !== 0) {
      p.lastAxis = 'x';
    } else if (dy !== 0) {
      p.lastAxis = 'y';
    }

    if (dx !== 0) p.dir = dx < 0 ? 'left' : 'right';
    else if (dy !== 0) p.dir = dy < 0 ? 'up' : 'down';

    const speed = airborne ? AIR_SPEED : WALK_SPEED;
    p.moving = dx !== 0 || dy !== 0;
    if (p.moving) p.anim += 1;
    slide(grid, p, dx * speed, 0, ctx);
    slide(grid, p, 0, dy * speed, ctx);
  }

  // The tile she comes down on is checked on the frame she comes down, even
  // though that frame still counts as airborne for damage. Deferring it would
  // let a player who re-presses B on the landing frame hover across any pit.
  let grounded = !airborne;
  if (p.air > 0) {
    p.air -= 1;
    if (p.air === 0) {
      out.landed = true;
      grounded = true;
    }
  }

  // Touching down: fall into a pit, or bank a safe spot.
  if (grounded) {
    const { tx, ty } = tileUnder(p);
    const ch = tileAt(grid, tx, ty);
    p.onLedge = isLedge(ch);
    if (isPit(ch)) {
      p.falling = 24;
      out.fell = true;
    } else if (ch !== null && !blocks(ch, { hasSandals: true, onLedge: true })) {
      p.safeX = p.x;
      p.safeY = p.y;
    }
  }

  return out;
}

/** Which room edge, if any, Summer's centre has crossed. */
export function edgeCrossed(p) {
  const cx = (p.x + (HB_W * SUB) / 2) / SUB;
  const cy = (p.y + (HB_H * SUB) / 2) / SUB;
  if (cx < 0) return 'w';
  if (cx > VIEW_W) return 'e';
  if (cy < 0) return 'n';
  if (cy > VIEW_H) return 's';
  return null;
}

/** Where Summer lands after stepping through an edge into the next room. */
export function placeAfterExit(p, dir) {
  switch (dir) {
    case 'w': return { x: (VIEW_W - HB_W) * SUB, y: p.y };
    case 'e': return { x: 0, y: p.y };
    case 'n': return { x: p.x, y: (VIEW_H - HB_H) * SUB };
    case 's': return { x: p.x, y: 0 };
    default: return { x: p.x, y: p.y };
  }
}

/** The tile Summer is facing, for context-sensitive A. */
export function facingTile(p) {
  const { tx, ty } = tileUnder(p);
  const [dx, dy] = DIR_VEC[p.dir];
  return { tx: tx + dx, ty: ty + dy };
}

// Hitboxes and damage. Boxes are axis-aligned rectangles in subpixels.

import {
  SUB, HB_W, HB_H, SWING_REACH, SWING_SPAN, SPIN_RADIUS,
  GROUND_SWING_Z, AIR_SWING_Z,
} from './constants.js';
import { aloft, jumpHeight } from './player.js';

export const ENEMY_W = 12;
export const ENEMY_H = 12;

export const box = (x, y, w, h) => ({ x, y, w: w * SUB, h: h * SUB });

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function playerBox(p) {
  return box(p.x, p.y, HB_W, HB_H);
}

export function enemyBox(e) {
  return box(e.x, e.y, ENEMY_W, ENEMY_H);
}

export function centreOf(b) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/**
 * The rectangle the blade sweeps, in the direction Summer is facing.
 * Nothing behind or beside her is in it - a swing is directional, and the
 * Palebuckler rule depends on that being true.
 */
export function swingBox(p) {
  const reach = SWING_REACH * SUB;
  const span = SWING_SPAN * SUB;
  const w = HB_W * SUB;
  const h = HB_H * SUB;
  switch (p.swingDir) {
    case 'left': return { x: p.x - reach, y: p.y + (h - span) / 2, w: reach, h: span };
    case 'right': return { x: p.x + w, y: p.y + (h - span) / 2, w: reach, h: span };
    case 'up': return { x: p.x + (w - span) / 2, y: p.y - reach, w: span, h: reach };
    default: return { x: p.x + (w - span) / 2, y: p.y + h, w: span, h: reach };
  }
}

/** The whorl spin reaches every side at once. */
export function spinBox(p) {
  const r = SPIN_RADIUS * SUB;
  return {
    x: p.x + (HB_W * SUB) / 2 - r,
    y: p.y + (HB_H * SUB) / 2 - r,
    w: r * 2,
    h: r * 2,
  };
}

/**
 * How high off the ground the blade is this frame. A grounded swing sweeps low
 * and cannot touch a hovering Mothkin; an airborne one sweeps high and cannot
 * touch something standing on the floor.
 */
export function swingZ(p) {
  return aloft(p) ? AIR_SWING_Z : GROUND_SWING_Z;
}

export function zOverlaps([lo, hi], z) {
  return z >= lo && z <= hi;
}

/**
 * Does this swing hurt this enemy?
 *
 * A Palebuckler holds its shield in the direction it faces, so the only swing
 * that lands is one travelling the *same* way it is looking - which is to say,
 * one delivered from behind it. A spin ignores the shield entirely.
 *
 * @param {object} enemy
 * @param {'up'|'down'|'left'|'right'|null} swingDir null for a spin
 */
export function connects(enemy, swingDir) {
  if (enemy.shielded !== true) return true;
  if (swingDir === null) return true;      // the whorl spin comes from all sides
  return swingDir === enemy.dir;
}

/** Summer's own height, for shockwaves that pass under her. */
export function playerZ(p) {
  return jumpHeight(p);
}

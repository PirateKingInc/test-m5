// The two bosses. Each has three phases, and each phase-two is the upgrade
// found in that dungeon being asked for by name:
//
//   The Sap-Warden seals itself in cracked bark, and only the Rootcarver Blade
//   splits cracked stone.
//   The Hollow Chorister retreats across a two-tile chasm, and only the Gale
//   Sandals cross two tiles.
//
// Phase three of both is the jump: shockwaves along the floor, and in the
// Chorister's case a hover that a grounded swing cannot reach.

import { SUB, TILE, ROOM_W, ROOM_H, HOVER_Z } from './constants.js';
import { makeShockwave, makeSeed, makeSpike, makeNote, makeEnemy, VEC } from './enemies.js';
import { centreOf, playerBox } from './combat.js';

export const BOSS_W = 32;
export const BOSS_H = 32;

export const BOSS_STATS = {
  sapwarden: { hp: 12, phases: [12, 9, 5], name: 'THE SAP-WARDEN' },
  chorister: { hp: 16, phases: [16, 12, 6], name: 'THE HOLLOW CHORISTER' },
};

export function makeBoss(spec) {
  const stats = BOSS_STATS[spec.kind];
  return {
    kind: 'boss',
    type: spec.kind,
    name: stats.name,
    x: spec.x * TILE * SUB,
    y: spec.y * TILE * SUB,
    hp: stats.hp,
    maxHp: stats.hp,
    phase: 1,
    /** Counts down a roar between phases, during which nothing lands. */
    intro: 60,
    timer: 0,
    z: 0,
    shell: false,
    hurt: 0,
    alive: true,
    anim: 0,
    state: 'idle',
    dir: 'down',
  };
}

export function bossBox(b) {
  return { x: b.x + 2 * SUB, y: b.y + 2 * SUB, w: (BOSS_W - 4) * SUB, h: (BOSS_H - 4) * SUB };
}

/** Which phase a health total belongs to. */
export function phaseFor(type, hp) {
  const [, p2, p3] = BOSS_STATS[type].phases;
  if (hp > p2) return 1;
  if (hp > p3) return 2;
  return 3;
}

/**
 * Can this swing hurt this boss right now?
 *
 * @param {object} b
 * @param {{blade: boolean}} upgrades
 * @param {boolean} airborne
 * @returns {'hit'|'shell'|'too-low'}
 */
export function bossHitResult(b, upgrades, airborne) {
  if (b.shell && !upgrades.blade) return 'shell';
  if (b.z > 0 && !airborne) return 'too-low';
  return 'hit';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function keepInRoom(b, minTx = 1, maxTx = ROOM_W - 1) {
  b.x = clamp(b.x, minTx * TILE * SUB, (maxTx * TILE - BOSS_W) * SUB);
  b.y = clamp(b.y, 1 * TILE * SUB, ((ROOM_H - 1) * TILE - BOSS_H) * SUB);
}

function drift(b, player, speed, minTx, maxTx) {
  const me = centreOf(bossBox(b));
  const you = centreOf(playerBox(player));
  const dx = you.x - me.x;
  const dy = you.y - me.y;
  const mag = Math.hypot(dx, dy) || 1;
  b.x += Math.round((dx / mag) * speed);
  b.y += Math.round((dy / mag) * speed);
  keepInRoom(b, minTx, maxTx);
}

const BEHAVIOUR = {
  /** The Sap-Warden: lumber, then seal, then rampage. */
  sapwarden(b, ctx) {
    const you = centreOf(playerBox(ctx.player));

    if (b.phase === 1) {
      b.shell = false;
      drift(b, ctx.player, 5);
      if (b.timer % 90 === 0) {
        const tx = Math.floor(you.x / SUB / TILE);
        const ty = Math.floor(you.y / SUB / TILE);
        for (const dx of [-1, 0, 1]) {
          const sx = clamp(tx + dx, 1, ROOM_W - 2);
          ctx.spawn(makeSpike(sx, clamp(ty, 1, ROOM_H - 2)));
        }
        ctx.sound('roar');
      }
      return;
    }

    if (b.phase === 2) {
      // Sealed. Nothing but a Rootcarver swing gets in.
      b.shell = true;
      drift(b, ctx.player, 2);
      if (b.timer % 70 === 0) {
        const c = centreOf(bossBox(b));
        for (const dir of ['up', 'down', 'left', 'right']) ctx.spawn(makeSeed(c.x, c.y, dir));
      }
      return;
    }

    // Phase three: charge, stop, and lay waves along the floor.
    b.shell = false;
    const cycle = b.timer % 150;
    if (cycle < 60) {
      if (cycle === 0) {
        const c = centreOf(bossBox(b));
        b.dir = Math.abs(you.x - c.x) > Math.abs(you.y - c.y)
          ? (you.x < c.x ? 'left' : 'right')
          : (you.y < c.y ? 'up' : 'down');
      }
      const [vx, vy] = VEC[b.dir];
      b.x += vx * 22;
      b.y += vy * 22;
      keepInRoom(b);
      b.state = 'charge';
    } else if (cycle === 70) {
      const c = centreOf(bossBox(b));
      for (const dir of ['up', 'down', 'left', 'right']) ctx.spawn(makeShockwave(c.x, c.y, dir));
      ctx.sound('stomp');
      b.state = 'stomp';
    } else {
      b.state = 'idle';
    }
  },

  /** The Hollow Chorister: sing, withdraw, then rise. */
  chorister(b, ctx) {
    const you = centreOf(playerBox(ctx.player));

    if (b.phase === 1) {
      b.z = 0;
      // Stays on the east side of the chasm, where Summer is.
      drift(b, ctx.player, 4, 5, ROOM_W - 1);
      if (b.timer % 75 === 0) {
        const c = centreOf(bossBox(b));
        const dx = you.x - c.x;
        const dy = you.y - c.y;
        const mag = Math.hypot(dx, dy) || 1;
        for (const spread of [-0.4, 0, 0.4]) {
          const cos = Math.cos(spread);
          const sin = Math.sin(spread);
          const ux = (dx / mag) * 26;
          const uy = (dy / mag) * 26;
          ctx.spawn(makeNote(c.x, c.y, Math.round(ux * cos - uy * sin), Math.round(ux * sin + uy * cos)));
        }
        ctx.sound('shot');
      }
      return;
    }

    if (b.phase === 2) {
      // Withdrawn to the island. The only way across is two tiles of nothing.
      b.z = 0;
      b.x = 1 * TILE * SUB;
      const targetY = clamp(you.y - (BOSS_H / 2) * SUB, 1 * TILE * SUB, ((ROOM_H - 1) * TILE - BOSS_H) * SUB);
      b.y += Math.sign(targetY - b.y) * 3;
      if (b.timer % 120 === 0) {
        ctx.spawnEnemy(makeEnemy({ type: 'mothkin', x: 6, y: 1 + (b.timer / 120) % 5 }));
        ctx.sound('roar');
      }
      if (b.timer % 60 === 30) {
        const c = centreOf(bossBox(b));
        ctx.spawn(makeNote(c.x, c.y, 26, 0));
      }
      return;
    }

    // Phase three: up out of a grounded swing's reach, waves along the floor.
    b.z = HOVER_Z;
    drift(b, ctx.player, 5, 5, ROOM_W - 1);
    if (b.timer % 110 === 0) {
      const c = centreOf(bossBox(b));
      for (const dir of ['left', 'up', 'down']) ctx.spawn(makeShockwave(c.x, c.y, dir));
      ctx.sound('stomp');
    }
  },
};

/**
 * Advances a boss one frame.
 * @param {object} b
 * @param {{player: object, spawn: Function, spawnEnemy: Function, sound: Function}} ctx
 */
export function stepBoss(b, ctx) {
  if (!b.alive) return;
  b.anim += 1;
  if (b.hurt > 0) b.hurt -= 1;
  if (b.intro > 0) {
    b.intro -= 1;
    return;
  }
  b.timer += 1;
  BEHAVIOUR[b.type](b, ctx);
}

/** Applies damage and returns true if the phase changed. */
export function hurtBoss(b, amount) {
  const was = b.phase;
  b.hp = Math.max(0, b.hp - amount);
  b.hurt = 20;
  b.phase = phaseFor(b.type, b.hp);
  if (b.hp <= 0) {
    b.alive = false;
    return false;
  }
  if (b.phase !== was) {
    b.intro = 60;
    return true;
  }
  return false;
}

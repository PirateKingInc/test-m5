// The bot's combat brain.
//
// The single most important thing here is HYSTERESIS. A controller that
// re-decides from scratch every frame will pick "step toward" and "step away"
// on alternate frames and stand still while something shoots it - which is
// exactly what the first three versions of this file did. So an engagement
// picks a target and a side to attack from, and keeps them.
//
// The other three, all learned the hard way:
//   * FACING FOLLOWS MOVEMENT, so retreating and swinging in one frame cuts
//     the air behind her.
//   * B NEEDS A RISING EDGE, so holding it jumps once and then walks into the
//     pit forever.
//   * A BOSS BODY IS 28 PIXELS ACROSS, so 13px is not "close", it is inside.

import { BTN } from '../../src/game/game.js';
import { SUB } from '../../src/game/constants.js';
import { bossBox } from '../../src/game/bosses.js';
import { centreOf, playerBox, enemyBox } from '../../src/game/combat.js';
import { boxBlocked } from '../../src/game/player.js';
import { isPit } from '../../src/game/tilemap.js';
import { ROOM_W, ROOM_H, TILE, HB_W, HB_H } from '../../src/game/constants.js';
import { VEC } from './navigate.js';

/** How far from a boss's centre to stand: clear of its body, inside her reach. */
const BOSS_RANGE = 28;

/** Row 2's centre line: both lips of the Chorister's chasm, and the island stand. */
const LAUNCH_Y = 40;
/**
 * Where to stand on the island: below the pinned Chorister rather than beside
 * it. East of the boss is the lip of a two-tile chasm, and a note landing
 * there knocks her straight off it; the southern face is a whole tile in from
 * the drop and the same distance from the body.
 */
const ISLAND_STAND = { x: 32, y: 60 };

const STEP = { [BTN.LEFT]: [-1, 0], [BTN.RIGHT]: [1, 0], [BTN.UP]: [0, -1], [BTN.DOWN]: [0, 1] };
const OPPOSITE_BIT = {
  [BTN.LEFT]: BTN.RIGHT, [BTN.RIGHT]: BTN.LEFT, [BTN.UP]: BTN.DOWN, [BTN.DOWN]: BTN.UP,
};
const BIT_OF = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT };

/** The four places to stand relative to a body, and the cut each one makes. */
const CARDINALS = [
  { x: 1, y: 0, swing: BTN.LEFT },
  { x: -1, y: 0, swing: BTN.RIGHT },
  { x: 0, y: 1, swing: BTN.UP },
  { x: 0, y: -1, swing: BTN.DOWN },
];

/** Would three pixels of walking this way put her inside something? */
export function canStep(game, btn) {
  const [dx, dy] = STEP[btn] ?? [0, 0];
  const p = game.player;
  return !boxBlocked(
    game.room.grid, p.x + dx * SUB * 3, p.y + dy * SUB * 3,
    { hasSandals: game.progress.upgrades.sandals, onLedge: p.onLedge },
  );
}

/** True when the blade is free to swing again. */
export function ready(game) {
  return game.player.swing === 0 && game.player.spin === 0;
}

export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) / SUB;
}

export function bitToward(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? BTN.LEFT : BTN.RIGHT;
  return dy < 0 ? BTN.UP : BTN.DOWN;
}

/**
 * A legal step toward a point, or null when she is already there (or every way
 * there is a wall). Distances are subpixels; the tolerance is in pixels.
 */
export function stepToward(game, from, to, tolPx = 2, avoidCentre = null) {
  const tol = tolPx * SUB;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const needX = Math.abs(dx) > tol;
  const needY = Math.abs(dy) > tol;
  if (!needX && !needY) return null;
  const xBit = dx < 0 ? BTN.LEFT : BTN.RIGHT;
  const yBit = dy < 0 ? BTN.UP : BTN.DOWN;
  const order = Math.abs(dx) > Math.abs(dy)
    ? [needX ? xBit : 0, needY ? yBit : 0]
    : [needY ? yBit : 0, needX ? xBit : 0];
  for (const btn of order) {
    if (!btn || !canStep(game, btn)) continue;
    // Never take the detour that walks her into the thing she is circling.
    // When the direct way round is walled off - water above the Cistern's
    // Spitfen, say - the "other axis" fallback aims straight at its body.
    if (avoidCentre) {
      const [sx, sy] = STEP[btn];
      const nx = from.x + sx * 4 * SUB;
      const ny = from.y + sy * 4 * SUB;
      const near = Math.max(Math.abs(avoidCentre.x - nx), Math.abs(avoidCentre.y - ny)) / SUB;
      if (near < 13) continue;
    }
    return btn;
  }
  return null;
}

/**
 * Which side of a monster to stand on, as a unit vector FROM its centre TO
 * where she should be, plus the direction to swing once there.
 */
function sidesFor(enemy) {
  const [fx, fy] = VEC[enemy.dir] ?? [0, 1];
  // A shield faces the way it walks, so the only side that lands is behind it.
  if (enemy.shielded) return [{ x: -fx, y: -fy, swing: BIT_OF[enemy.dir] }];
  // Spitfens used to get a forced approach across their firing line. It was a
  // mistake: insisting on a side she cannot reach - the Cistern has water
  // above one of them - sends her sideways into the monster instead. They die
  // in one or two hits, so taking a seed on the way in is the cheaper trade.
  return null;    // whichever side she is already on
}

// Where to stand, in px from the monster's centre. Bodies touch at about 11px
// and her blade reaches to about 23px, so 18 is clear of one and inside the
// other with room on both sides.
const RANGE = 18;

/**
 * A Thudder is fought at arm's length. Its stomp spawns a wave at its own
 * centre, so standing at the usual 18px means the wave is already on top of
 * her before she can leave the ground. Her blade reaches about 23px, so 22
 * still connects.
 */
function rangeFor(enemy) {
  return enemy.kind === 'thudder' ? 22 : RANGE;
}

/**
 * Which monsters are worth stopping for.
 *
 * A Palebuckler paces a fixed line and never chases, and getting behind a
 * shield means walking around a body that hurts - so she steps around those.
 * Everything in this set either closes on her or shoots her, so leaving it
 * alive costs more than the fight does.
 */
const WORTH_KILLING = new Set(['snag', 'brumbler', 'spitfen', 'thudder']);

export class Fighter {
  constructor() {
    this.jumpHeld = false;
    this.clock = 0;
    this.target = null;
    this.side = null;
    this.until = 0;
    this.dodge = 0;
    this.dodgeBit = 0;
    this.committed = null;
    this.settled = false;
    this.evade = 0;
    this.evadeBit = 0;
    this.retreat = 0;
    this.retreatBit = 0;
    this.bossSide = null;
  }

  jump(btn) {
    return this.jumpHeld ? btn : btn | BTN.B;
  }

  finish(btn) {
    this.jumpHeld = (btn & BTN.B) !== 0;
    this.clock += 1;
    return btn;
  }

  // --- threat spotting -------------------------------------------------------

  /**
   * Flyers are deliberately never threats: a Mothkin hovers, so it cannot
   * touch a Summer who keeps her feet on the ground, and nothing in the game
   * forces her to jump near one.
   */
  static nearest(game, range, want = () => true) {
    const me = centreOf(playerBox(game.player));
    let best = null;
    let bestDist = Infinity;
    for (const e of game.entities) {
      if (!e.alive || e.flying || !want(e)) continue;
      const d = chebyshev(me, centreOf(enemyBox(e)));
      if (d < range && d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  /**
   * Anything close enough to be worth stopping for.
   *
   * A Brumbler only qualifies while it is recovering from a charge: that is
   * the window the monster is designed around, and standing next to a healthy
   * one waiting for it to commit is how a bot spends six thousand frames in a
   * corridor.
   */
  static quarry(game, range) {
    return Fighter.nearest(game, range, (e) => WORTH_KILLING.has(e.kind)
      && (e.kind !== 'brumbler' || e.state === 'stunned'));
  }

  /** Anything close enough to be worth stepping away from. */
  static crowding(game, range) {
    return Fighter.nearest(game, range);
  }

  /**
   * Nudges a travel step sideways around something rather than cancelling it.
   *
   * "Step directly away from the monster" fights the route: navigation pulls
   * her forward, avoidance pushes her back, and she oscillates on the spot
   * while a Palebuckler paces past her twice. Stepping *across* keeps her
   * moving and slips round the body.
   */
  deflect(game, nav, enemy) {
    const [dx, dy] = STEP[nav] ?? [0, 0];
    if (!dx && !dy) return nav;
    const me = centreOf(playerBox(game.player));
    const it = centreOf(enemyBox(enemy));
    // Only worry about things she is walking into.
    if ((it.x - me.x) * dx + (it.y - me.y) * dy <= 0) return nav;
    const perp = dx !== 0
      ? (it.y < me.y ? BTN.DOWN : BTN.UP)
      : (it.x < me.x ? BTN.RIGHT : BTN.LEFT);
    for (const btn of [perp, OPPOSITE_BIT[perp]]) {
      if (canStep(game, btn)) return btn;
    }
    return nav;
  }

  /** One frame of backing out of something's way. */
  avoid(game, enemy) {
    const me = centreOf(playerBox(game.player));
    const it = centreOf(enemyBox(enemy));
    const dx = (it.x - me.x) / SUB;
    const dy = (it.y - me.y) / SUB;
    const away = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? BTN.RIGHT : BTN.LEFT)
      : (dy < 0 ? BTN.DOWN : BTN.UP);
    const sideways = Math.abs(dx) >= Math.abs(dy)
      ? (dy < 0 ? BTN.DOWN : BTN.UP)
      : (dx < 0 ? BTN.RIGHT : BTN.LEFT);
    for (const btn of [away, sideways, OPPOSITE_BIT[sideways]]) {
      if (canStep(game, btn)) return this.finish(btn);
    }
    return null;
  }

  /**
   * A Brumbler mid-charge that is actually going to hit her.
   *
   * "Anything charging nearby" was too broad: they ricochet between walls, so
   * she dodged one all day and never got a swing in. Only a charge she is
   * standing in front of, and close to the line of, is worth reacting to.
   */
  static charger(game, range = 64) {
    const me = centreOf(playerBox(game.player));
    return game.entities.find((e) => {
      if (!e.alive || (e.state !== 'charging' && e.state !== 'winding')) return false;
      const it = centreOf(enemyBox(e));
      const [vx, vy] = VEC[e.dir] ?? [0, 1];
      const along = ((me.x - it.x) * vx + (me.y - it.y) * vy) / SUB;
      const across = Math.abs(vx !== 0 ? me.y - it.y : me.x - it.x) / SUB;
      return along > 0 && along < range && across < 14;
    }) ?? null;
  }

  /**
   * A shockwave worth leaving the ground for.
   *
   * Nearness alone is not it. The Chorister throws three waves at a time and
   * they keep rolling after they have passed her, so a plain box test leaves
   * her airborne for most of the phase - and she covers half as much ground
   * again in the air, which means every spot she aims at, she flies past.
   */
  static waveNear(game, range = 26) {
    const me = centreOf(playerBox(game.player));
    return game.hazards.some((h) => {
      if (!h.groundOnly) return false;
      const dx = (h.x + 8 * SUB - me.x) / SUB;
      const dy = (h.y + 8 * SUB - me.y) / SUB;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) return false;
      if (!h.vx && !h.vy) return true;
      return (h.vx > 0 && dx <= 0) || (h.vx < 0 && dx >= 0)
        || (h.vy > 0 && dy <= 0) || (h.vy < 0 && dy >= 0);
    });
  }

  static incoming(game, range = 24) {
    const me = centreOf(playerBox(game.player));
    return game.hazards.find((h) => {
      if (h.warn > 0 || (h.vx === 0 && h.vy === 0) || h.groundOnly) return false;
      const dx = (h.x + 4 * SUB - me.x) / SUB;
      const dy = (h.y + 4 * SUB - me.y) / SUB;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) return false;
      return (h.vx > 0 && dx < 0) || (h.vx < 0 && dx > 0)
        || (h.vy > 0 && dy < 0) || (h.vy < 0 && dy > 0);
    }) ?? null;
  }

  // --- committed reactions ---------------------------------------------------

  /** A charge is twice her walking speed, so the dodge has to be committed. */
  dodgeCharge(game, enemy) {
    // Keep going until she is properly off the line, not just for N frames.
    if (this.dodge > 0 && canStep(game, this.dodgeBit)) {
      this.dodge -= 1;
      return this.finish(this.dodgeBit);
    }
    this.dodge = 0;
    const me = centreOf(playerBox(game.player));
    const it = centreOf(enemyBox(enemy));
    const [vx] = VEC[enemy.dir] ?? [0, 1];
    const across = vx !== 0
      ? (it.y < me.y ? BTN.DOWN : BTN.UP)
      : (it.x < me.x ? BTN.RIGHT : BTN.LEFT);
    for (const btn of [across, OPPOSITE_BIT[across]]) {
      if (!canStep(game, btn)) continue;
      this.dodge = 14;
      this.dodgeBit = btn;
      return this.finish(btn);
    }
    return null;
  }

  /** Step off the line of a shot rather than trying to outrun it. */
  sidestep(game, hazard) {
    const me = centreOf(playerBox(game.player));
    const across = Math.abs(hazard.vx) > Math.abs(hazard.vy)
      ? ((hazard.y + 4 * SUB) < me.y ? BTN.DOWN : BTN.UP)
      : ((hazard.x + 4 * SUB) < me.x ? BTN.RIGHT : BTN.LEFT);
    for (const btn of [across, OPPOSITE_BIT[across]]) {
      if (canStep(game, btn)) return this.finish(btn);
    }
    return null;
  }

  // --- engagements -----------------------------------------------------------

  /** Picks something to kill and sticks with it. */
  engage(game, enemy) {
    if (this.target !== enemy) {
      this.target = enemy;
      this.side = this.pickSide(game, enemy);
      this.until = this.clock + 900;
      this.settled = false;
    }
  }

  get engaged() {
    return this.target !== null;
  }

  drop() {
    this.target = null;
    this.side = null;
  }

  /**
   * One frame against the current target, or null when there is nothing useful
   * to do from here - which tells the caller to walk on instead of grinding
   * into a wall.
   */
  press(game) {
    const enemy = this.target;
    if (!enemy || !enemy.alive || this.clock > this.until) { this.drop(); return null; }

    const me = centreOf(playerBox(game.player));
    const it = centreOf(enemyBox(enemy));
    // A rooted shooter is worth walking across a room for; everything else is
    // only worth dealing with if it is already close.
    const leash = enemy.kind === 'spitfen' ? 70 : 44;
    if (chebyshev(me, it) > leash) { this.drop(); return null; }

    // A shielded monster turns around at walls, so its back keeps moving.
    if (enemy.shielded && this.clock % 30 === 0) this.side = this.pickSide(game, enemy);

    // A Brumbler is only safe to touch while it is recovering from a charge.
    // Once it is back up, let go and get on with the route; the charge dodge
    // will deal with it if it comes for her again.
    if (enemy.kind === 'brumbler' && enemy.state !== 'stunned') {
      this.drop();
      return null;
    }

    const side = this.side ?? this.nearestSide(me, it);

    // Settling and then letting it walk into her is the commonest way to take
    // a hit mid-fight: the hysteresis that stops her twitching also stops her
    // backing up. Break the settle the moment it gets inside arm's reach.
    if (chebyshev(me, it) < 12) {
      this.settled = false;
      const back = this.avoid(game, enemy);
      if (back !== null) return back;
    }

    const reach = rangeFor(enemy);
    const spot = { x: it.x + side.x * reach * SUB, y: it.y + side.y * reach * SUB };
    const off = Math.max(Math.abs(spot.x - me.x), Math.abs(spot.y - me.y)) / SUB;

    // Arrive within 2px, leave only past 6. Without that gap she twitches one
    // pixel back into place between swings - and because facing follows
    // movement, every swing then goes out in the direction of the twitch
    // instead of at the monster. That is a miss that looks exactly like a hit.
    if (this.settled ? off > 6 : off > 2) {
      const step = stepToward(game, me, spot, 2, it);
      if (step !== null) {
        this.settled = false;
        let move = step;
        if (Fighter.waveNear(game, 24) && !game.player.aloft) move = this.jump(move);
        return this.finish(move);
      }
    }

    // Standing where she meant to stand: hold the facing, and cut the moment
    // the last swing is done. Swinging on a fixed clock instead wastes most of
    // the window, because the clock also ticks while she is walking.
    this.settled = true;
    let btn = side.swing | (ready(game) ? BTN.A : 0);
    // A wave still has to be jumped, even mid-fight.
    if (Fighter.waveNear(game, 24) && !game.player.aloft) btn = this.jump(btn);
    return this.finish(btn);
  }

  /** Is that point somewhere she could actually be - floor, in the room? */
  // eslint-disable-next-line class-methods-use-this
  standable(game, pt) {
    const tx = Math.floor(pt.x / SUB / TILE);
    const ty = Math.floor(pt.y / SUB / TILE);
    if (tx < 1 || ty < 1 || tx > ROOM_W - 2 || ty > ROOM_H - 2) return false;
    if (isPit(game.room.grid[ty][tx])) return false;
    return !boxBlocked(
      game.room.grid, pt.x - (HB_W * SUB) / 2, pt.y - (HB_H * SUB) / 2,
      { hasSandals: game.progress.upgrades.sandals, onLedge: game.player.onLedge },
    );
  }

  /**
   * Which side of a boss to fight from.
   *
   * Nearest is not enough on its own. A boss that drifts into a corner puts
   * its nearest face against a wall, she backs into the gap between the two,
   * and it settles on top of her for the rest of the fight. So only sides she
   * could actually stand on count, and when the boss shuts one down she moves
   * round to one that is still open.
   */
  bossSideFor(game, me, it) {
    let best = null;
    let bestOff = Infinity;
    for (const side of CARDINALS) {
      const spot = { x: it.x + side.x * BOSS_RANGE * SUB, y: it.y + side.y * BOSS_RANGE * SUB };
      if (!this.standable(game, spot)) continue;
      const off = Math.max(Math.abs(spot.x - me.x), Math.abs(spot.y - me.y));
      if (off < bestOff) { bestOff = off; best = side; }
    }
    return best ?? this.nearestSide(me, it);
  }

  /**
   * The button that cuts at a side without walking into it.
   *
   * Facing follows movement, so the only way to turn is to press a direction -
   * but pressing it also moves her, and a boss body is two pixels of walking
   * away. Holding the facing between swings therefore creeps her into the very
   * thing she is cutting, one pixel a frame, until it is touching her. Press
   * the direction only while she is still looking the wrong way.
   */
  // eslint-disable-next-line class-methods-use-this
  strike(game, swingBit) {
    return BIT_OF[game.player.dir] === swingBit ? 0 : swingBit;
  }

  /**
   * A step directly away from something, or across it when that is walled.
   *
   * Committed, like every other reaction here. A boss cornering her against a
   * wall tracks her as she moves, so the direction that is "away" flips from
   * frame to frame and an uncommitted retreat is a one-pixel shudder on the
   * spot while the body stands on her - eleven pixels from a swing she never
   * gets to make. Twelve frames is enough to clear the body's reach.
   */
  backAway(game, it) {
    if (this.retreat > 0 && this.canHold(game, this.retreatBit)) {
      this.retreat -= 1;
      return this.retreatBit;
    }
    const me = centreOf(playerBox(game.player));
    const away = OPPOSITE_BIT[bitToward(me, it)];
    const across = away === BTN.LEFT || away === BTN.RIGHT
      ? [BTN.UP, BTN.DOWN] : [BTN.LEFT, BTN.RIGHT];
    for (const btn of [away, ...across]) {
      if (!this.canHold(game, btn)) continue;
      this.retreat = 12;
      this.retreatBit = btn;
      return btn;
    }
    this.retreat = 0;
    return null;
  }

  /** Of the sides that would land a hit, the one she is nearest to already. */
  pickSide(game, enemy) {
    const options = sidesFor(enemy);
    if (!options) return null;
    const me = centreOf(playerBox(game.player));
    const it = centreOf(enemyBox(enemy));
    let best = options[0];
    let bestOff = Infinity;
    for (const side of options) {
      const reach = rangeFor(enemy);
      const spot = { x: it.x + side.x * reach * SUB, y: it.y + side.y * reach * SUB };
      const off = Math.max(Math.abs(spot.x - me.x), Math.abs(spot.y - me.y));
      if (off < bestOff) { bestOff = off; best = side; }
    }
    return best;
  }

  /** For anything without a required side, attack from whichever she is on. */
  nearestSide(me, it) {
    const dx = it.x - me.x;
    const dy = it.y - me.y;
    // The vector points from the monster to her; the swing points back at it.
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx < 0 ? { x: 1, y: 0, swing: BTN.LEFT } : { x: -1, y: 0, swing: BTN.RIGHT };
    }
    return dy < 0 ? { x: 0, y: 1, swing: BTN.UP } : { x: 0, y: -1, swing: BTN.DOWN };
  }

  // --- bosses ----------------------------------------------------------------

  /**
   * One frame of a boss fight.
   *
   * Same shape as an ordinary fight: pick a spot to stand relative to the
   * thing, walk there, then hold still and cut. The reactive "approach if far,
   * retreat if near" version oscillated across its own boundary and spent the
   * fight one pixel outside a hitbox.
   *
   * A boss body is 28px across and she is 10, so they touch at 19 centre to
   * centre; her blade reaches about 23px from her centre. Standing at 28 on an
   * axis is clear of one and well inside the other.
   */
  versusBoss(game) {
    const b = game.boss;
    const me = centreOf(playerBox(game.player));
    const it = centreOf(bossBox(b));

    if (b.type === 'chorister') {
      // A leap already in the air owns the frame. Half way over the chasm she
      // counts as being on neither side, and handing the controls back to the
      // fight there stops her steering and drops her in.
      if (this.committed !== null) {
        if (game.player.aloft && game.player.falling === 0) return this.finish(this.committed);
        this.committed = null;
      }
      // The island is columns 1 to 3 of rows 1 to 3; everything else in the
      // arena is the open floor or the chasm between them.
      const onIsland = me.x / SUB < 4 * TILE && me.y / SUB < 4 * TILE;
      const wants = b.phase === 2;
      // Phase two starts wherever phase one ended and the boss then flies to
      // its corner. Crossing while it is still in transit means jumping into
      // its body over a two-tile drop, so let it settle first.
      const pinned = chebyshev(it, { x: 32 * SUB, y: 32 * SUB }) < 3;
      if (wants && !onIsland && !pinned) return this.finish(this.keepClear(game, it));
      if (wants !== onIsland) return this.finish(this.crossChasm(game, onIsland));
      if (wants && onIsland) return this.finish(this.onTheIsland(game));
    }

    // Root spikes cost half a heart and arrive in threes across the tile she
    // is standing on. Clearing the field takes about thirty pixels at a pixel
    // a frame, so the dodge is committed.
    if (this.evade > 0 && this.canHold(game, this.evadeBit)) {
      this.evade -= 1;
      return this.finish(this.evadeBit);
    }
    this.evade = 0;
    const spike = Fighter.spikeNear(game, 22);
    if (spike) {
      const step = this.stepOffSpike(game, spike);
      if (step !== null) {
        this.evade = 18;
        this.evadeBit = step;
        return this.finish(step);
      }
    }

    const shot = Fighter.incoming(game, 16);
    if (shot) {
      const away = this.sidestep(game, shot);
      if (away !== null) return away;
    }

    // Settling and then letting the boss drift into her is the commonest way
    // to lose a whole heart: its body is 28px across and does two damage. The
    // hysteresis that stops her twitching also stops her backing up, so break
    // the settle the moment the body closes.
    if (chebyshev(me, it) < 22) {
      this.settled = false;
      const back = this.backAway(game, it);
      if (back !== null) return this.finish(back);
    }

    // Only re-pick the side occasionally - switching every frame is how she
    // walks around a boss instead of hitting it - but never hold onto one that
    // has stopped being a place she can stand.
    const spotOf = (side) => ({
      x: it.x + side.x * BOSS_RANGE * SUB, y: it.y + side.y * BOSS_RANGE * SUB,
    });
    if (!this.bossSide || this.clock % 90 === 0 || !this.standable(game, spotOf(this.bossSide))) {
      this.bossSide = this.bossSideFor(game, me, it);
    }
    const side = this.bossSide;
    const spot = spotOf(side);
    const off = Math.max(Math.abs(spot.x - me.x), Math.abs(spot.y - me.y)) / SUB;

    if (this.settled ? off > 7 : off > 3) {
      const step = this.stepInside(game, me, spot, it);
      if (step !== null) {
        this.settled = false;
        return this.finish(Fighter.shouldJump(game) ? this.jump(step) : step);
      }
    }

    this.settled = true;
    let btn = this.strike(game, side.swing);
    // A hovering boss is out of a grounded swing's reach, so the cut that
    // reaches it leaves the ground on the same frame it goes out.
    const aerial = b.z > 0 && ready(game);
    if (aerial || Fighter.shouldJump(game)) btn = this.jump(btn);
    if (ready(game)) btn |= BTN.A;
    return this.finish(btn);
  }

  /**
   * A step that keeps her in the fight: inside the room, and on the floor.
   *
   * Walking out of a boss arena resets the fight, so the one direction never
   * worth taking is through the door. Nothing stops her walking into a pit
   * either - she only falls when she lands - so circling the Chorister at arm's
   * length across the middle of its chasm reads as a legal step right up to the
   * moment it costs her half a heart and puts her back where she started.
   */
  canHold(game, btn) {
    if (!canStep(game, btn)) return false;
    const [dx, dy] = STEP[btn] ?? [0, 0];
    const me = centreOf(playerBox(game.player));
    const tx = Math.floor(me.x / SUB / TILE) + dx;
    const ty = Math.floor(me.y / SUB / TILE) + dy;
    if (tx < 1 || ty < 1 || tx > ROOM_W - 2 || ty > ROOM_H - 2) return false;
    return !isPit(game.room.grid[ty][tx]);
  }

  /** stepToward, but staying in the room and never into the body. */
  stepInside(game, from, to, avoid) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const tol = 3 * SUB;
    const needX = Math.abs(dx) > tol;
    const needY = Math.abs(dy) > tol;
    if (!needX && !needY) return null;
    const xBit = dx < 0 ? BTN.LEFT : BTN.RIGHT;
    const yBit = dy < 0 ? BTN.UP : BTN.DOWN;
    const order = Math.abs(dx) > Math.abs(dy)
      ? [needX ? xBit : 0, needY ? yBit : 0]
      : [needY ? yBit : 0, needX ? xBit : 0];
    for (const btn of order) {
      if (!btn || !this.canHold(game, btn)) continue;
      const [sx, sy] = STEP[btn];
      const nx = from.x + sx * 4 * SUB;
      const ny = from.y + sy * 4 * SUB;
      const near = Math.max(Math.abs(avoid.x - nx), Math.abs(avoid.y - ny)) / SUB;
      if (near < 23) continue;
      return btn;
    }
    return null;
  }

  /**
   * A root spike worth running from.
   *
   * A spike that has already erupted is only a problem if she is standing in
   * it; one still winding up is a problem if it is anywhere near, because it
   * is about to be where she is. Treating both the same way had her running
   * from spikes she was already clear of and never getting a swing in.
   */
  static spikeNear(game, range) {
    const me = centreOf(playerBox(game.player));
    let best = null;
    let bestDist = Infinity;
    for (const h of game.hazards) {
      if (h.kind !== 'spike') continue;
      const c = { x: h.x + 8 * SUB, y: h.y + 8 * SUB };
      const d = chebyshev(me, c);
      const care = h.warn > 0 ? range : 12;
      if (d < care && d < bestDist) { best = c; bestDist = d; }
    }
    return best;
  }

  stepOffSpike(game, spike) {
    const me = centreOf(playerBox(game.player));
    const dx = spike.x - me.x;
    const dy = spike.y - me.y;
    const away = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? BTN.RIGHT : BTN.LEFT)
      : (dy < 0 ? BTN.DOWN : BTN.UP);
    const sideways = Math.abs(dx) >= Math.abs(dy)
      ? (dy < 0 ? BTN.DOWN : BTN.UP)
      : (dx < 0 ? BTN.RIGHT : BTN.LEFT);
    for (const btn of [away, sideways, OPPOSITE_BIT[sideways]]) {
      if (canStep(game, btn)) return btn;
    }
    return null;
  }

  /**
   * Jumping is for getting over a shockwave, not for getting about.
   *
   * She moves half again as fast in the air, so a bot that holds B because the
   * boss is hovering overshoots every spot it aims at and spends the phase
   * swinging past it. The hop that reaches a hovering boss is taken at the
   * moment of the cut instead, in the settled branch.
   */
  static shouldJump(game) {
    return Fighter.waveNear(game, 30);
  }

  /** Wait out a boss in transit on the far side of the room from it. */
  keepClear(game, it) {
    const me = centreOf(playerBox(game.player));
    if (chebyshev(me, it) > 40) return 0;
    return this.backAway(game, it) ?? 0;
  }

  /**
   * The Chorister's arena is an L. A floor pocket sits in the north-west -
   * columns 1 to 3 of rows 1 and 2 - cut off by two tiles of nothing to the
   * east and two more to the south. Column 6 runs clear from the south wall to
   * the north one, so the crossing is always the same shape: get onto that
   * column, walk up to row 2, and leap west over the gap. Coming back is the
   * same leap mirrored off column 3.
   *
   * The order of the two alignments is not cosmetic. Lining the row up first
   * walks her north into the southern gap at column 4 and holds UP against it
   * for the rest of the fight, which is exactly what the previous version did.
   *
   * The jump itself is committed: re-deciding mid-air never crosses anything.
   */
  crossChasm(game, onIsland) {
    // Lining up or launching in mid-air does neither. A jump asked for while
    // she is already off the ground is swallowed, so the leap becomes a walk
    // off the lip - and the air carries her half again as fast, so the
    // alignment overshoots. Wait for her feet.
    if (game.player.aloft || game.player.falling > 0) return 0;
    const me = centreOf(playerBox(game.player));
    const cx = me.x / SUB;
    const cy = me.y / SUB;
    const padX = onIsland ? 56 : 104;
    const leap = onIsland ? BTN.RIGHT : BTN.LEFT;
    if (cx < padX - 2) return BTN.RIGHT;
    if (cx > padX + 2) return BTN.LEFT;
    if (cy < LAUNCH_Y - 2) return BTN.DOWN;
    if (cy > LAUNCH_Y + 2) return BTN.UP;
    this.committed = leap;
    return this.jump(leap);
  }

  /**
   * Hold the island's southern face and cut north at the pinned boss. Its
   * centre settles on (32, 32), so a stand at (32, 60) is clear of the body,
   * inside the blade, and a tile in from the eastern drop.
   */
  onTheIsland(game) {
    const me = centreOf(playerBox(game.player));
    const spot = { x: ISLAND_STAND.x * SUB, y: ISLAND_STAND.y * SUB };
    const off = Math.max(Math.abs(spot.x - me.x), Math.abs(spot.y - me.y)) / SUB;
    if (this.settled ? off > 6 : off > 2) {
      const step = stepToward(game, me, spot, 2);
      if (step !== null) {
        this.settled = false;
        return step;
      }
    }
    this.settled = true;
    return this.strike(game, BTN.UP) | (ready(game) ? BTN.A : 0);
  }
}

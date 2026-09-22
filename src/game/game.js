// The game, as a pure state machine. `step(buttons)` advances exactly one
// 1/60s tick. Nothing in this file (or anything it imports) touches the DOM,
// the clock, or Math.random, which is what lets CI replay a recorded input
// stream and compare the result byte for byte.

import {
  START_HEARTS, HEART, TRANSITION_FRAMES, WORLD_SEED, TILE, SUB, HB_W, HB_H,
  IFRAMES, KNOCKBACK_SPEED, KNOCKBACK_FRAMES, SWING_FRAMES, CHARGE_FRAMES,
  SPIN_FRAMES, MAX_HEARTS,
} from './constants.js';
import { makeRng } from './rng.js';
import {
  ROOMS, START_ROOM, materialize, edgeId, dungeonOf,
} from './world.js';
import {
  makePlayer, stepPlayer, edgeCrossed, placeAfterExit, isAirborne, aloft,
} from './player.js';
import {
  makeEnemy, stepEnemy, stepHazard, hazardBox, maybeDrop,
} from './enemies.js';
import {
  playerBox, enemyBox, swingBox, spinBox, swingZ, zOverlaps, overlaps,
  connects, centreOf,
} from './combat.js';

/** Button bits. The hardware has a d-pad and exactly two buttons, plus Start. */
export const BTN = {
  UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32, START: 64,
};

export const SCENE = {
  TITLE: 'title',
  PLAY: 'play',
  TRANSITION: 'transition',
  PAUSE: 'pause',
  GAMEOVER: 'gameover',
  ENDING: 'ending',
  CREDITS: 'credits',
};

/** Sound events the audio engine drains each frame. Game logic never plays anything. */
export const SFX = {
  JUMP: 'jump', LAND: 'land', FALL: 'fall', MENU: 'menu', CONFIRM: 'confirm',
  DOOR: 'door', SWING: 'swing', SPIN: 'spin', CLINK: 'clink', HIT: 'hit',
  KILL: 'kill', HURT: 'hurt', SHOT: 'shot', STOMP: 'stomp', HEART: 'heart',
  CHARGED: 'charged',
};

/** Entity types in room data that are monsters rather than scenery. */
const MONSTER_TYPES = new Set([
  'snag', 'brumbler', 'palebuckler', 'mothkin', 'thudder', 'spitfen',
]);

function newProgress() {
  return {
    upgrades: { blade: false, charm: false, sandals: false },
    keys: { mire: 0, aerie: 0 },
    bossKeys: { mire: false, aerie: false },
    openedDoors: new Set(),
    chests: new Set(),
    heartsTaken: new Set(),
    bossesBeaten: new Set(),
    maxHp: START_HEARTS * HEART,
  };
}

export class Game {
  /** @param {{hasSave?: boolean, seed?: number}} [opts] */
  constructor(opts = {}) {
    this.hasSave = Boolean(opts.hasSave);
    this.seed = opts.seed ?? WORLD_SEED;

    this.frame = 0;
    this.buttons = 0;
    this.prevButtons = 0;
    /** Drained by the audio engine every frame. */
    this.sounds = [];

    this.scene = SCENE.TITLE;
    this.menuIndex = this.hasSave ? 0 : 1;
    this.titleT = 0;

    this.rng = makeRng(this.seed);
    this.progress = newProgress();
    this.player = null;
    this.room = null;
    this.transition = null;
    /** Live monsters, projectiles and dropped pickups in the current room. */
    this.entities = [];
    this.hazards = [];
    this.pickups = [];
    /** Set when a room is entered, so the host can autosave. */
    this.saveRequested = false;
    /** Frames the room-name banner still has to live. */
    this.banner = 0;
  }

  // --- input helpers --------------------------------------------------------

  down(bit) { return (this.buttons & bit) !== 0; }

  pressed(bit) { return (this.buttons & bit) !== 0 && (this.prevButtons & bit) === 0; }

  play(sfx) { this.sounds.push(sfx); }

  // --- lifecycle ------------------------------------------------------------

  newGame() {
    this.rng = makeRng(this.seed);
    this.progress = newProgress();
    this.player = makePlayer(4, 4);
    this.room = null;
    this.transition = null;
    this.enterRoom(START_ROOM);
    this.scene = SCENE.PLAY;
  }

  /**
   * Builds the live room from its data plus whatever the save says has already
   * happened to it.
   */
  enterRoom(roomId) {
    const data = ROOMS[roomId];
    this.room = {
      id: roomId,
      name: data.name,
      area: data.area,
      grid: materialize(roomId, this.progress.openedDoors),
    };
    this.entities = (data.entities ?? [])
      .filter((spec) => MONSTER_TYPES.has(spec.type))
      .map(makeEnemy);
    this.hazards = [];
    this.pickups = [];
    this.banner = 90;
    this.saveRequested = true;
  }

  /** True once Summer may pass through this exit. */
  canPass(dir) {
    const dest = this.room ? ROOMS[this.room.id].exits[dir] : null;
    if (!dest) return false;
    const kind = ROOMS[this.room.id].doors?.[dir];
    if (!kind) return true;
    return this.progress.openedDoors.has(edgeId(this.room.id, dest));
  }

  // --- the tick -------------------------------------------------------------

  /** @param {number} buttons bitmask for this frame */
  step(buttons) {
    this.prevButtons = this.buttons;
    this.buttons = buttons;
    this.frame += 1;
    this.sounds.length = 0;
    this.saveRequested = false;

    switch (this.scene) {
      case SCENE.TITLE: this.stepTitle(); break;
      case SCENE.PLAY: this.stepPlay(); break;
      case SCENE.TRANSITION: this.stepTransition(); break;
      case SCENE.PAUSE: this.stepPause(); break;
      default: break;
    }
    return this;
  }

  stepTitle() {
    this.titleT += 1;
    const options = this.titleOptions();
    if (this.pressed(BTN.UP) || this.pressed(BTN.DOWN)) {
      const delta = this.pressed(BTN.UP) ? -1 : 1;
      let i = this.menuIndex;
      do {
        i = (i + delta + options.length) % options.length;
      } while (!options[i].enabled);
      if (i !== this.menuIndex) this.play(SFX.MENU);
      this.menuIndex = i;
    }
    if (this.pressed(BTN.A) || this.pressed(BTN.START)) {
      const chosen = options[this.menuIndex];
      if (!chosen.enabled) return;
      this.play(SFX.CONFIRM);
      if (chosen.id === 'new') this.newGame();
      else if (this.onContinue) this.onContinue();
    }
  }

  titleOptions() {
    return [
      { id: 'continue', label: 'CONTINUE', enabled: this.hasSave },
      { id: 'new', label: 'NEW GAME', enabled: true },
    ];
  }

  stepPause() {
    if (this.pressed(BTN.START)) {
      this.scene = SCENE.PLAY;
      this.play(SFX.MENU);
    }
  }

  stepPlay() {
    if (this.pressed(BTN.START)) {
      this.scene = SCENE.PAUSE;
      this.play(SFX.MENU);
      return;
    }
    if (this.banner > 0) this.banner -= 1;

    const p = this.player;
    this.stepSword();

    const moved = stepPlayer(p, this.room.grid, {
      dx: (this.down(BTN.RIGHT) ? 1 : 0) - (this.down(BTN.LEFT) ? 1 : 0),
      dy: (this.down(BTN.DOWN) ? 1 : 0) - (this.down(BTN.UP) ? 1 : 0),
      jump: this.pressed(BTN.B),
      hasSandals: this.progress.upgrades.sandals,
      frozen: p.spin > 0,
    });
    if (moved.jumped) this.play(SFX.JUMP);
    if (moved.landed) this.play(SFX.LAND);
    if (moved.fell) {
      this.play(SFX.FALL);
      this.damage(1, 0, 0, true);
    }

    this.stepEntities();
    this.resolveAttacks();
    this.resolveHarm();
    this.resolvePickups();

    const edge = edgeCrossed(p);
    if (edge) this.beginTransition(edge);
  }

  /**
   * A is one button doing several jobs. A press swings. Holding it, once the
   * Whorl Charm is found, winds up a spin that is released on let-go; letting
   * go early just leaves you with the swing you already got.
   */
  stepSword() {
    const p = this.player;
    if (p.swing > 0) p.swing -= 1;
    if (p.spin > 0) {
      p.spin -= 1;
      return;
    }

    if (this.pressed(BTN.A)) {
      p.swing = SWING_FRAMES;
      p.swingDir = p.dir;
      p.charge = 0;
      this.play(SFX.SWING);
    }

    if (this.progress.upgrades.charm && this.down(BTN.A)) {
      p.charge += 1;
      if (p.charge === CHARGE_FRAMES) this.play(SFX.CHARGED);
    } else if (!this.down(BTN.A)) {
      if (p.charge >= CHARGE_FRAMES) {
        p.spin = SPIN_FRAMES;
        p.swing = 0;
        this.play(SFX.SPIN);
      }
      p.charge = 0;
    }
  }

  /** True while the blade is actually out, rather than merely recovering. */
  get swinging() {
    return this.player.swing > SWING_FRAMES - 8;
  }

  get spinning() {
    return this.player.spin > 0;
  }

  stepEntities() {
    const ctx = {
      grid: this.room.grid,
      player: this.player,
      rng: this.rng,
      spawn: (h) => this.hazards.push(h),
    };
    for (const e of this.entities) stepEnemy(e, ctx);
    this.hazards = this.hazards.filter((h) => stepHazard(h, this.room.grid));
    this.pickups = this.pickups.filter((q) => (q.life -= 1) > 0);
  }

  /** Summer's blade against everything it can reach this frame. */
  resolveAttacks() {
    const p = this.player;
    const spinning = this.spinning;
    if (!spinning && !this.swinging) return;

    const area = spinning ? spinBox(p) : swingBox(p);
    const dir = spinning ? null : p.swingDir;
    const zr = spinning ? [0, 14] : swingZ(p);
    const power = this.progress.upgrades.blade ? 2 : 1;

    for (const e of this.entities) {
      if (!e.alive || e.hurt > 0) continue;
      if (!overlaps(area, enemyBox(e))) continue;
      if (!zOverlaps(zr, e.z)) continue;
      if (!connects(e, dir)) {
        e.hurt = 10;
        this.play(SFX.CLINK);
        continue;
      }
      e.hp -= spinning ? power + 1 : power;
      e.hurt = 18;
      if (e.hp <= 0) {
        e.alive = false;
        this.play(SFX.KILL);
        const drop = maybeDrop(e, this.rng);
        if (drop) this.pickups.push(drop);
      } else {
        this.play(SFX.HIT);
      }
    }
    this.entities = this.entities.filter((e) => e.alive || e.hurt > 0);
  }

  /** Everything in the room that can hurt Summer, against Summer. */
  resolveHarm() {
    const p = this.player;
    if (p.falling > 0 || p.iframes > 0) return;
    const pb = playerBox(p);
    // Off the ground is a boolean, not a height. Using the drawn arc would leave
    // her vulnerable on the first and last frame of every jump, which would make
    // "jump the shockwave" a matter of luck instead of a rule.
    const offGround = aloft(p);

    for (const e of this.entities) {
      if (!e.alive) continue;
      if (!overlaps(pb, enemyBox(e))) continue;
      // A hovering Mothkin only touches her when she is up there with it.
      if (e.flying && !offGround) continue;
      const c = centreOf(enemyBox(e));
      this.play(SFX.HURT);
      this.damage(2, c.x, c.y);
      return;
    }

    for (const h of this.hazards) {
      if (h.warn > 0) continue;
      if (!overlaps(pb, hazardBox(h))) continue;
      // The whole design of a shockwave: it is only dangerous on the ground.
      if (h.groundOnly && offGround) continue;
      const c = centreOf(hazardBox(h));
      this.play(SFX.HURT);
      this.damage(h.kind === 'shockwave' ? 1 : 2, c.x, c.y);
      return;
    }
  }

  resolvePickups() {
    const pb = playerBox(this.player);
    this.pickups = this.pickups.filter((q) => {
      if (!overlaps(pb, { x: q.x, y: q.y, w: 8 * SUB, h: 8 * SUB })) return true;
      if (q.kind === 'halfheart') {
        this.player.hp = Math.min(this.progress.maxHp, this.player.hp + 1);
        this.play(SFX.HEART);
      }
      return false;
    });
  }

  /** True when nothing hostile is left standing. Condition gates read this. */
  roomCleared() {
    return this.entities.every((e) => !e.alive);
  }

  beginTransition(dir) {
    const dest = ROOMS[this.room.id].exits[dir];
    if (!dest || !this.canPass(dir)) {
      // Nothing to walk into: put her back on the near side of the border.
      const back = placeAfterExit(this.player, dir === 'n' ? 's' : dir === 's' ? 'n' : dir === 'e' ? 'w' : 'e');
      this.player.x = back.x;
      this.player.y = back.y;
      return;
    }
    const spot = placeAfterExit(this.player, dir);
    this.transition = {
      dir,
      t: 0,
      from: { id: this.room.id, grid: this.room.grid },
    };
    this.player.x = spot.x;
    this.player.y = spot.y;
    this.player.safeX = spot.x;
    this.player.safeY = spot.y;
    this.player.air = 0;
    this.enterRoom(dest);
    this.scene = SCENE.TRANSITION;
  }

  stepTransition() {
    this.transition.t += 1;
    if (this.transition.t >= TRANSITION_FRAMES) {
      this.transition = null;
      this.scene = SCENE.PLAY;
    }
  }

  // --- health ---------------------------------------------------------------

  /**
   * Hurts Summer, unless she is still flickering from the last hit.
   *
   * @param {number} halves damage in half-hearts
   * @param {number} fromX source position in subpixels, for knockback
   * @param {number} fromY
   * @param {boolean} [noKnock] falls and shockwaves shove her nowhere
   */
  damage(halves, fromX, fromY, noKnock = false) {
    const p = this.player;
    if (p.iframes > 0) return false;
    p.hp = Math.max(0, p.hp - halves);
    p.iframes = IFRAMES;
    if (!noKnock) {
      // Measured centre to centre: using her top-left corner would push her the
      // wrong way whenever the source sat between her corner and her middle.
      const me = centreOf(playerBox(p));
      const dx = me.x - fromX;
      const dy = me.y - fromY;
      const mag = Math.hypot(dx, dy) || 1;
      p.knockX = Math.round((dx / mag) * KNOCKBACK_SPEED);
      p.knockY = Math.round((dy / mag) * KNOCKBACK_SPEED);
      p.knock = KNOCKBACK_FRAMES;
    }
    if (p.hp === 0) this.scene = SCENE.GAMEOVER;
    return true;
  }

  // --- reporting ------------------------------------------------------------

  /** Compact description used by tests and the bot. */
  describe() {
    return {
      scene: this.scene,
      room: this.room?.id ?? null,
      hp: this.player?.hp ?? 0,
      maxHp: this.progress.maxHp,
      tile: this.player
        ? [
          Math.floor((this.player.x + (HB_W * SUB) / 2) / (TILE * SUB)),
          Math.floor((this.player.y + (HB_H * SUB) / 2) / (TILE * SUB)),
        ]
        : null,
      airborne: this.player ? isAirborne(this.player) : false,
      keys: { ...this.progress.keys },
      upgrades: { ...this.progress.upgrades },
    };
  }
}

export { dungeonOf };

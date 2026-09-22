// The game, as a pure state machine. `step(buttons)` advances exactly one
// 1/60s tick. Nothing in this file (or anything it imports) touches the DOM,
// the clock, or Math.random, which is what lets CI replay a recorded input
// stream and compare the result byte for byte.

import {
  START_HEARTS, HEART, TRANSITION_FRAMES, WORLD_SEED, TILE, SUB, HB_W, HB_H,
  IFRAMES, KNOCKBACK_SPEED, KNOCKBACK_FRAMES,
} from './constants.js';
import { makeRng } from './rng.js';
import {
  ROOMS, START_ROOM, materialize, edgeId, dungeonOf,
} from './world.js';
import {
  makePlayer, stepPlayer, edgeCrossed, placeAfterExit, isAirborne,
} from './player.js';

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
  DOOR: 'door',
};

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
    const moved = stepPlayer(p, this.room.grid, {
      dx: (this.down(BTN.RIGHT) ? 1 : 0) - (this.down(BTN.LEFT) ? 1 : 0),
      dy: (this.down(BTN.DOWN) ? 1 : 0) - (this.down(BTN.UP) ? 1 : 0),
      jump: this.pressed(BTN.B),
      hasSandals: this.progress.upgrades.sandals,
      frozen: false,
    });
    if (moved.jumped) this.play(SFX.JUMP);
    if (moved.landed) this.play(SFX.LAND);
    if (moved.fell) {
      this.play(SFX.FALL);
      this.damage(1, 0, 0, true);
    }

    const edge = edgeCrossed(p);
    if (edge) this.beginTransition(edge);
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
      const dx = p.x - fromX;
      const dy = p.y - fromY;
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

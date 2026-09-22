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
  ROOMS, START_ROOM, materialize, edgeId, dungeonOf, openingDirAt, portalAt,
  signAt, OPENINGS,
} from './world.js';
import {
  makePlayer, stepPlayer, edgeCrossed, placeAfterExit, isAirborne, aloft,
  facingTile, tileUnder, DIR_VEC,
} from './player.js';
import {
  openDialogue, tickDialogue, advanceDialogue, pageComplete,
} from './dialogue.js';
import { PROP_TYPES, CHEST_GIVES, makeProp, propIsSolid, propAt } from './props.js';
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
  DIALOGUE: 'dialogue',
  GAMEOVER: 'gameover',
  ENDING: 'ending',
  CREDITS: 'credits',
};

/** Sound events the audio engine drains each frame. Game logic never plays anything. */
export const SFX = {
  JUMP: 'jump', LAND: 'land', FALL: 'fall', MENU: 'menu', CONFIRM: 'confirm',
  DOOR: 'door', SWING: 'swing', SPIN: 'spin', CLINK: 'clink', HIT: 'hit',
  KILL: 'kill', HURT: 'hurt', SHOT: 'shot', STOMP: 'stomp', HEART: 'heart',
  CHARGED: 'charged', BLIP: 'blip', CHEST: 'chest', KEY: 'key', LOCKED: 'locked',
  SHATTER: 'shatter', SAVE: 'save', PILLAR: 'pillar', CONTAINER: 'container',
  PORTAL: 'portal',
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
    pillars: new Set(),
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
    this.props = [];
    this.dialogue = null;
    /** Suppresses a portal until she steps off the stair she arrived on. */
    this.portalLock = false;
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
    this.props = (data.entities ?? [])
      .filter((spec) => PROP_TYPES.has(spec.type))
      .filter((spec) => !(spec.type === 'chest' && this.progress.chests.has(spec.id)))
      .filter((spec) => !(spec.type === 'heart' && this.progress.heartsTaken.has(spec.id)))
      .map(makeProp);
    this.hazards = [];
    this.pickups = [];
    this.portalLock = true;
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
      case SCENE.DIALOGUE: this.stepDialogue(); break;
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
      solid: this.solidPropTiles(),
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
    this.openSatisfiedGates();
    this.checkPortal();

    const edge = edgeCrossed(p);
    if (edge) this.beginTransition(edge);
  }

  /** The tiles props stand on, so collision can treat them as walls. */
  solidPropTiles() {
    return new Set(
      this.props.filter(propIsSolid).map((q) => `${q.tx},${q.ty}`),
    );
  }

  say(lines) {
    this.dialogue = openDialogue(lines);
    this.scene = SCENE.DIALOGUE;
  }

  stepDialogue() {
    if (tickDialogue(this.dialogue)) this.play(SFX.BLIP);
    if (this.pressed(BTN.A) || this.pressed(BTN.START)) {
      if (advanceDialogue(this.dialogue) === 'close') {
        this.dialogue = null;
        this.scene = SCENE.PLAY;
      }
    }
  }

  // --- context-sensitive A ---------------------------------------------------

  /**
   * Works out what A means right now. Returns true if it meant something other
   * than a swing, in which case the blade stays sheathed. There is no menu and
   * no second item button, so the ordering here IS the interface.
   */
  tryInteract() {
    const p = this.player;
    if (isAirborne(p)) return false;

    const here = tileUnder(p);
    if (this.room.grid[here.ty]?.[here.tx] === 'V') {
      this.saveRequested = true;
      this.play(SFX.SAVE);
      this.say(['THE MARKER TAKES', 'YOUR NAME.', 'PROGRESS SAVED.']);
      return true;
    }

    const { tx, ty } = facingTile(p);
    const prop = propAt(this.props, tx, ty);
    if (prop) return this.useProp(prop);

    const ch = this.room.grid[ty]?.[tx];
    if (ch === undefined) return false;
    switch (ch) {
      case 'S': {
        const lines = signAt(this.room.id, tx, ty);
        if (!lines) return false;
        this.say(lines);
        return true;
      }
      case 'x':
        this.room.grid[ty][tx] = '.';
        this.play(SFX.SHATTER);
        return true;
      case 'o':
        return this.pushBlock(tx, ty);
      case 'C':
        return this.breakCracked(tx, ty);
      case 'L':
        return this.useLock(tx, ty);
      case 'B':
        return this.useBossDoor(tx, ty);
      case 'W':
        this.say(['SPIRALS, CUT DEEP.', 'IT WANTS TO BE', 'TURNED.']);
        return true;
      default:
        return false;
    }
  }

  useProp(prop) {
    if (prop.kind === 'npc') {
      this.say(prop.text);
      return true;
    }
    if (prop.kind === 'chest') {
      if (prop.open) return false;
      prop.open = true;
      this.progress.chests.add(prop.id);
      const gift = CHEST_GIVES[prop.gives];
      if (prop.gives === 'smallkey') {
        const d = dungeonOf(this.room.id);
        if (d) this.progress.keys[d] += 1;
        this.play(SFX.KEY);
      } else if (prop.gives === 'bosskey') {
        const d = dungeonOf(this.room.id);
        if (d) this.progress.bossKeys[d] = true;
        this.play(SFX.KEY);
      } else {
        this.progress.upgrades[gift.upgrade] = true;
        this.play(SFX.CHEST);
      }
      this.say(gift.announce);
      return true;
    }
    return false;
  }

  /** Pushes a block one tile, if there is somewhere for it to go. */
  pushBlock(tx, ty) {
    const [dx, dy] = DIR_VEC[this.player.dir];
    const nx = tx + dx;
    const ny = ty + dy;
    const target = this.room.grid[ny]?.[nx];
    if (target !== '.' && target !== ',') {
      this.play(SFX.CLINK);
      return true;
    }
    if (propAt(this.props, nx, ny)) {
      this.play(SFX.CLINK);
      return true;
    }
    this.room.grid[ny][nx] = 'o';
    this.room.grid[ty][tx] = '.';
    this.play(SFX.DOOR);
    return true;
  }

  breakCracked(tx, ty) {
    if (!this.progress.upgrades.blade) {
      this.say(['THE STONE IS', 'CRACKED THROUGH.', 'NOTHING YOU CARRY', 'WILL SPLIT IT.']);
      return true;
    }
    this.openEdgeAt(tx, ty);
    this.play(SFX.SHATTER);
    return true;
  }

  useLock(tx, ty) {
    const d = dungeonOf(this.room.id);
    if (!d || this.progress.keys[d] <= 0) {
      this.say(['LOCKED.', 'YOU NEED A SMALL', 'KEY FOR THIS ONE.']);
      return true;
    }
    this.progress.keys[d] -= 1;
    this.openEdgeAt(tx, ty);
    this.play(SFX.DOOR);
    return true;
  }

  useBossDoor(tx, ty) {
    const d = dungeonOf(this.room.id);
    if (!d || !this.progress.bossKeys[d]) {
      this.say(['A GREAT LOCK.', 'THE VAULT KEY IS', 'ELSEWHERE.']);
      return true;
    }
    this.openEdgeAt(tx, ty);
    this.play(SFX.DOOR);
    return true;
  }

  /** Opens the barrier whose opening contains this tile, on both sides at once. */
  openEdgeAt(tx, ty) {
    const dir = openingDirAt(this.room.id, tx, ty);
    if (!dir) return false;
    const dest = ROOMS[this.room.id].exits[dir];
    if (!dest) return false;
    this.progress.openedDoors.add(edgeId(this.room.id, dest));
    this.room.grid = materialize(this.room.id, this.progress.openedDoors);
    return true;
  }

  /** Gates that wait on a condition rather than a key. */
  openSatisfiedGates() {
    const room = ROOMS[this.room.id];
    for (const [dir, kind] of Object.entries(room.doors ?? {})) {
      if (!kind.startsWith('gate')) continue;
      const dest = room.exits[dir];
      const id = edgeId(this.room.id, dest);
      if (this.progress.openedDoors.has(id)) continue;
      const met = kind === 'gate:clear'
        ? this.roomCleared()
        : this.progress.pillars.has(this.room.id) || this.progress.pillars.has(dest);
      if (!met) continue;
      this.progress.openedDoors.add(id);
      this.room.grid = materialize(this.room.id, this.progress.openedDoors);
      this.play(SFX.DOOR);
    }
  }

  checkPortal() {
    const { tx, ty } = tileUnder(this.player);
    const portal = portalAt(this.room.id, tx, ty);
    if (!portal) {
      this.portalLock = false;
      return;
    }
    if (this.portalLock) return;
    this.play(SFX.PORTAL);
    this.enterRoom(portal.to);
    this.player.x = portal.tx * TILE * SUB + ((TILE - HB_W) / 2) * SUB;
    this.player.y = portal.ty * TILE * SUB + ((TILE - HB_H) / 2) * SUB;
    this.player.safeX = this.player.x;
    this.player.safeY = this.player.y;
    this.player.air = 0;
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
      if (this.tryInteract()) {
        p.charge = 0;
        return;
      }
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
    for (const q of this.props) q.anim += 1;
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

    if (spinning) this.wakePillar();
  }

  /** A charged spin is the only thing that turns a whorl pillar. */
  wakePillar() {
    if (this.progress.pillars.has(this.room.id)) return;
    const { tx, ty } = tileUnder(this.player);
    for (const [dx, dy] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (this.room.grid[ty + dy]?.[tx + dx] !== 'W') continue;
      this.progress.pillars.add(this.room.id);
      this.play(SFX.PILLAR);
      return;
    }
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
    for (const prop of this.props) {
      if (prop.kind !== 'heart') continue;
      const box = { x: prop.x, y: prop.y, w: TILE * SUB, h: TILE * SUB };
      if (!overlaps(pb, box)) continue;
      this.props = this.props.filter((q) => q !== prop);
      this.progress.heartsTaken.add(prop.id);
      this.progress.maxHp = Math.min(MAX_HEARTS * HEART, this.progress.maxHp + HEART);
      this.player.hp = this.progress.maxHp;
      this.play(SFX.CONTAINER);
      this.say(['A HEART CONTAINER.', 'YOU CAN TAKE ONE', 'MORE HIT NOW.']);
      return;
    }
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
      bossKeys: { ...this.progress.bossKeys },
      upgrades: { ...this.progress.upgrades },
      doors: this.progress.openedDoors.size,
      chests: this.progress.chests.size,
    };
  }
}

export { dungeonOf };

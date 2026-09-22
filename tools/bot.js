#!/usr/bin/env node
// The playthrough bot.
//
// It plays the game the way a person does: it reads the screen (game state),
// presses buttons, and has no privileged access - it never writes to the game,
// never teleports, never grants itself an item. Everything it knows about where
// things are comes from the same room data the game loads.
//
// The run is recorded frame by frame. `replay()` then feeds that raw button
// stream into a brand-new game and checks it ends up in exactly the same place,
// which proves the run is completable AND that the simulation is deterministic.

import { Game, BTN, SCENE } from '../src/game/game.js';
import { CHARGE_FRAMES, SUB, TILE, ROOM_W, ROOM_H } from '../src/game/constants.js';
import { ROOMS, portalAt } from '../src/game/world.js';
import {
  buildGraph, key, routeToAny, capsSignature, capsOf, centre, tileOf,
  parse, steer, tileCentre, edgeDirOf, tileAhead, DIR_BIT, VEC,
} from './lib/navigate.js';
import { Fighter } from './lib/fight.js';
import { ROUTE, done, stationFor, SAVE_TILES } from './lib/objectives.js';

/** What the bot is willing to hunt when it needs hearts back. */
const PREY = new Set(['snag', 'brumbler', 'thudder', 'spitfen']);



const FACE_TO_DIR = { n: 'up', s: 'down', e: 'right', w: 'left' };
const OPPOSITE_DIR = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const DEFAULT_BUDGET = 400_000;

export class Bot {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.fighter = new Fighter();
    this.edges = null;
    this.signature = null;
    this.path = null;
    this.pathTarget = null;
    this.committed = null;
    this.act = null;
    this.actClock = 0;
    this.pulse = 0;
    this.log = [];
    this.stuck = 0;
    this.lastTile = '';
    /** True while she is off the route topping her hearts back up. */
    this.recovering = false;
    this.recoverRoom = null;
    this.recoverUntil = 0;
  }

  /**
   * Hearts are the only resource in this game and the only way to get one back
   * is to kill something and hope. So when she is low she stops advancing,
   * hunts whatever is in the room, and when the room is empty steps next door
   * and back to bring it round again. It is exactly what a person does.
   */
  updateRecovery() {
    const g = this.game;
    const max = g.progress.maxHp;
    // Markers restore her to full, so topping up is cheap and worth doing
    // early. Waiting until she is nearly dead means the walk to the marker is
    // the thing that kills her.
    const floorHp = Math.max(3, Math.ceil(max * 0.6));

    if (!this.recovering && g.player.hp <= floorHp) {
      this.recovering = true;
      this.recoverUntil = g.frame + 5000;
      this.path = null;
    } else if (this.recovering && (g.player.hp >= max || g.frame > this.recoverUntil)) {
      // Bounded on purpose. Drops are a one-in-three roll, so an open-ended
      // hunt can grind for ever; better to press on at whatever she has and
      // come back to it than to stand in a corridor killing Snags all day.
      this.recovering = false;
      this.path = null;
      this.recoverRoom = null;
    }
    return this.recovering;
  }

  /**
   * Where to go when she is low: the nearest save marker. They restore her to
   * full, which makes recovery a short deterministic walk instead of an
   * open-ended hunt for a one-in-two drop - and walking to a marker is what a
   * person does too.
   */
  recoveryStation() {
    return { room: null, spots: [], nodes: SAVE_TILES, act: 'save' };
  }

  get objective() {
    return ROUTE[this.index] ?? null;
  }

  graph() {
    const sig = capsSignature(this.game);
    if (sig !== this.signature) {
      this.signature = sig;
      this.edges = buildGraph(capsOf(this.game), this.game.progress.openedDoors);
      this.path = null;
    }
    return this.edges;
  }

  node() {
    const { tx, ty } = tileOf(this.game.player);
    return key(this.game.room.id, tx, ty);
  }

  /** A half-heart on the floor, if she is hurt and it is close. */
  nearbyDrop() {
    const g = this.game;
    if (g.player.hp >= g.progress.maxHp) return null;
    const me = centre(g.player);
    for (const q of g.pickups) {
      const x = q.x / SUB + 4;
      const y = q.y / SUB + 4;
      if (Math.max(Math.abs(x - me.x), Math.abs(y - me.y)) < 64) return { x, y };
    }
    return null;
  }

  decide() {
    const g = this.game;
    this.pulse += 1;

    if (g.scene === SCENE.DIALOGUE) return this.pulse % 5 === 0 ? BTN.A : 0;
    if (g.scene === SCENE.TRANSITION) return 0;
    if (g.scene === SCENE.ENDING) return this.pulse % 20 === 0 ? BTN.A : 0;
    if (g.scene === SCENE.CREDITS) return 0;
    if (g.scene !== SCENE.PLAY) return 0;
    if (g.player.falling > 0) return 0;

    // Retire finished objectives, however they got finished.
    while (this.objective && done(this.objective, g)) {
      this.log.push({ frame: g.frame, did: this.objective.label, room: g.room.id, hp: g.player.hp });
      this.index += 1;
      this.path = null;
      this.act = null;
      this.committed = null;
      this.objectiveSince = g.frame;
    }
    if (!this.objective) return 0;
    if (this.objectiveSince === undefined) this.objectiveSince = g.frame;

    /**
     * The escape hatch. Rooms repopulate behind her, so a bot that always
     * stops to deal with what is in front of it can trade blows with the same
     * respawning Spitfen for ever and never advance. If an objective has gone
     * nowhere for a while, stop fighting entirely and run: sixty invincibility
     * frames per hit is plenty to cross a room with.
     */
    const stalled = g.frame - this.objectiveSince > 1200;

    // A jump in progress is never interrupted, for anything.
    if (this.committed !== null) {
      if (g.player.aloft) return this.committed;
      this.committed = null;
    }

    const station = (!stalled && this.updateRecovery())
      ? this.recoveryStation()
      : stationFor(this.objective);
    if (stalled) this.recovering = false;

    // Sixty frames of invincibility after a hit is the cheapest movement in
    // the game. Spend it walking, not dodging things that cannot touch her.
    // ...but not in the middle of a fight she has already committed to.
    // Breaking off after every hit is how she trades blows with the same
    // two-hit monster for two thousand frames and never kills it.
    if (station.act !== 'fight' && g.player.iframes > 14
        && !this.recovering && !this.fighter.engaged) {
      this.why = 'iframes';
      return this.travel(station);
    }
    if (station.act === 'fight' && g.room.id === station.room && g.boss?.alive) {
      this.why = 'boss';
      return this.fighter.versusBoss(g);
    }

    if (station.act !== 'fight' && !stalled) {
      // A ground wave has exactly one answer - but jumping on the spot stops
      // her dead, so she jumps in the direction she was already going.
      if (Fighter.waveNear(g) && !g.player.aloft) {
        this.why = 'wave';
        return this.fighter.jump(this.travel(station));
      }

      // A charge is faster than she is, so it is spotted early and dodged.
      const charger = Fighter.charger(g);
      if (charger) {
        const away = this.fighter.dodgeCharge(g, charger);
        if (away !== null) { this.why = 'charge'; return away; }
      }

      // Keep swinging at whatever she already committed to.
      if (this.fighter.engaged) {
        const blow = this.fighter.press(g);
        if (blow !== null) { this.why = 'press'; return blow; }
      }

      // A Spitfen is rooted and shoots across a whole room, so it is worth
      // crossing to. It was by some distance the largest source of damage in
      // the run before this: killing the source beats dodging the stream.
      const gunner = Fighter.nearest(g, 52, (e) => e.kind === 'spitfen');
      if (gunner) {
        this.fighter.engage(g, gunner);
        const blow = this.fighter.press(g);
        if (blow !== null) { this.why = 'gunner'; return blow; }
      }

      // While recovering she goes looking for a fight rather than waiting for
      // one to come to her.
      const reach = this.recovering ? 40 : 22;
      // Pick a new fight only when something worth killing is in her space.
      // Nothing here is solid, so this is never about clearing a path - it is
      // about not being followed around a dungeon by something that bites.
      const quarry = Fighter.quarry(g, reach);
      if (quarry) {
        this.fighter.engage(g, quarry);
        const blow = this.fighter.press(g);
        if (blow !== null) { this.why = 'engage'; return blow; }
      }

      // Anything in flight is worth a sidestep.
      const shot = Fighter.incoming(g);
      if (shot) {
        const away = this.fighter.sidestep(g, shot);
        if (away !== null) { this.why = 'dodge'; return away; }
      }

      // A dropped half-heart within reach is always worth the detour.
      const heal = this.nearbyDrop();
      if (heal) { this.why = 'heal'; return this.fighter.finish(steer(g.player, heal.x, heal.y, 1)); }
    }

    this.why = 'travel';
    const nav = this.travel(station);

    // Whatever she is walking into gets slipped around, not backed away from.
    const crowd = Fighter.crowding(g, 15);
    if (crowd && nav) {
      const around = this.fighter.deflect(g, nav, crowd);
      if (around !== nav) this.why = 'around';
      return around;
    }
    return nav;
  }

  /** Walk toward the objective's station, and act once standing on it. */
  travel(station) {
    const g = this.game;
    const here = this.node();
    const targets = station.spots.map((s) => key(station.room, s.x, s.y));

    // Standing on a station spot: do the thing.
    const spot = station.spots.find((s) =>
      key(station.room, s.x, s.y) === here && g.room.id === station.room);
    if (spot) return this.perform(station, spot);

    if (station.nodes) {
      // A set of places any of which will do; the router picks the nearest
      // one it can actually get to.
      if (station.nodes.includes(here)) {
        if (station.act !== 'save') return 0;
        // Standing on a marker: press A to save, which also heals her.
        this.actClock += 1;
        return this.actClock % 6 === 3 ? BTN.A : 0;
      }
      return this.walkTo(station.nodes);
    }
    if (targets.length === 0) {
      // A boss room with no particular spot: just be in the room.
      if (g.room.id === station.room) return 0;
      return this.walkTo([...this.roomTiles(station.room)]);
    }
    return this.walkTo(targets);
  }

  roomTiles(room) {
    const tiles = [];
    ROOMS[room].tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => { if (ch === '.' || ch === ',') tiles.push(key(room, x, y)); });
    });
    return tiles;
  }

  walkTo(targets) {
    const g = this.game;
    const here = this.node();
    const edges = this.graph();

    const want = new Set(targets);
    if (!this.path || this.pathTarget !== targets.join('|') || !this.path.includes(here)) {
      this.path = routeToAny(edges, here, targets);
      this.pathTarget = targets.join('|');
      if (!this.path) {
        // Nowhere to go. Shuffle rather than freeze, so a wedged frame recovers.
        this.stuck += 1;
        this.why = 'lost';
        return this.stuck % 2 ? BTN.DOWN : BTN.RIGHT;
      }
    }
    if (want.has(here)) return 0;

    const at = this.path.indexOf(here);
    if (at === -1) { this.path = null; return 0; }
    const next = parse(this.path[at + 1]);
    const cur = parse(here);

    // Into the next room, through an opening or down a stair.
    if (next.room !== cur.room) {
      if (portalAt(cur.room, cur.x, cur.y)) return 0;      // the stair does the work
      const dir = edgeDirOf(cur.x, cur.y);
      if (!dir) { this.path = null; return 0; }
      return this.alignThen(cur, dir);
    }

    const dx = next.x - cur.x;
    const dy = next.y - cur.y;
    const dir = dx !== 0 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');

    // A gap or a raised ledge: line up on the other axis, then commit for the
    // whole airtime. A ledge only turns solid for a Summer with her feet on
    // the ground, so the hop that mounts one is the hop that clears a pit -
    // and walking at it instead just stops her dead against a tile the route
    // insists is walkable.
    // A pit is read from her nose, because that is where she leaves the
    // ground and the gap widths are measured from there. A ledge has to be
    // read half a body earlier: it turns solid against her, so she never gets
    // her nose over it - she just stops, with the route insisting the tile
    // ahead is walkable.
    const mustJump = tileAhead(g, dir) === 'P'
      || (tileAhead(g, dir, 6) === 'J' && !g.player.onLedge);
    if (Math.abs(dx) + Math.abs(dy) > 1 || mustJump) {
      const cross = this.alignAcross(next, dir);
      if (cross) return cross;
      if (mustJump) {
        this.committed = DIR_BIT[dir];
        return this.committed | BTN.B;
      }
      return DIR_BIT[dir];
    }

    return this.alignThen(next, dir);
  }

  /**
   * Centre her on the lane she is about to travel down, THEN travel.
   *
   * Getting this wrong is the single nastiest bug in a tile follower: her box
   * is 10px in a 16px tile, so being four pixels high while walking east means
   * clipping the wall tile diagonally above her and stopping dead, with the
   * route insisting the tile ahead is walkable. It looks exactly like a
   * pathfinding failure and is nothing of the kind.
   */
  alignThen(tile, dir) {
    const cross = this.alignAcross(tile, dir);
    return cross || DIR_BIT[dir];
  }

  /** The correction perpendicular to `dir`, or 0 if she is already in lane. */
  alignAcross(tile, dir) {
    const target = tileCentre(tile.x, tile.y);
    const me = centre(this.game.player);
    if (dir === 'left' || dir === 'right') {
      if (Math.abs(me.y - target.y) > 1) return me.y < target.y ? BTN.DOWN : BTN.UP;
      return 0;
    }
    if (Math.abs(me.x - target.x) > 1) return me.x < target.x ? BTN.RIGHT : BTN.LEFT;
    return 0;
  }

  /**
   * Press A at something, or wind up a spin. Facing is set on the frame before
   * the press, because the sword reads the facing from the previous frame.
   */
  perform(station, spot) {
    if (station.act === 'none') return 0;

    if (station.act === 'spin') {
      // Face AWAY from the pillar: pressing A at it only reads the carving.
      const away = DIR_BIT[OPPOSITE_DIR[FACE_TO_DIR[spot.face]]];
      this.actClock += 1;
      if (this.actClock < 4) return away;
      if (this.actClock < 4 + CHARGE_FRAMES + 8) return BTN.A;
      if (this.actClock < 4 + CHARGE_FRAMES + 30) return 0;   // release, spin, wake
      this.actClock = 0;
      return 0;
    }

    const face = DIR_BIT[FACE_TO_DIR[spot.face]];
    this.actClock += 1;
    if (this.actClock % 6 < 3) return face;
    if (this.actClock % 6 === 3) return face | BTN.A;
    return 0;
  }
}

/** Plays the game. Returns the recorded input stream and the finished game. */
export function playthrough({ budget = DEFAULT_BUDGET, trace = false } = {}) {
  const game = new Game();
  game.newGame();
  const bot = new Bot(game);
  const frames = [];

  while (frames.length < budget) {
    const btn = bot.decide();
    frames.push(btn);
    game.step(btn);
    if (game.scene === SCENE.GAMEOVER) break;
    if (game.scene === SCENE.CREDITS || (game.scene === SCENE.TITLE && frames.length > 100)) break;
  }

  if (trace) for (const e of bot.log) console.log(`  ${String(e.frame).padStart(6)}  ${e.room.padEnd(16)} hp ${e.hp}  ${e.did}`);

  return {
    frames: Uint8Array.from(frames),
    game,
    log: bot.log,
    finished: bot.index,
    total: ROUTE.length,
  };
}

/** Replays a recorded stream into a brand-new game. */
export function replay(frames) {
  const game = new Game();
  game.newGame();
  for (const btn of frames) game.step(btn);
  return game;
}

/** A compact digest of everything that matters about a finished run. */
export function digest(game) {
  return JSON.stringify({
    scene: game.scene,
    room: game.room?.id ?? null,
    frame: game.frame,
    hp: game.player?.hp ?? 0,
    maxHp: game.progress.maxHp,
    upgrades: game.progress.upgrades,
    keys: game.progress.keys,
    bossKeys: game.progress.bossKeys,
    chests: [...game.progress.chests].sort(),
    hearts: [...game.progress.heartsTaken].sort(),
    doors: [...game.progress.openedDoors].sort(),
    bosses: [...game.progress.bossesBeaten].sort(),
    rng: game.rng.s,
    x: game.player?.x ?? 0,
    y: game.player?.y ?? 0,
  });
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const t0 = Date.now();
  const run = playthrough({ trace: true });
  const ok = run.game.scene === SCENE.CREDITS || run.game.progress.bossesBeaten.has('chorister');
  const secs = (run.frames.length / 60).toFixed(1);
  console.log(
    `\nbot: ${run.finished}/${run.total} objectives, ${run.frames.length} frames ` +
    `(${secs}s of play, ${Date.now() - t0}ms wall), ` +
    `hearts ${run.game.player.hp}/${run.game.progress.maxHp}, scene ${run.game.scene}`,
  );
  if (!ok) {
    console.error('bot: DID NOT REACH THE ENDING.');
    const next = ROUTE[run.finished];
    console.error(`stopped on objective ${run.finished + 1}/${run.total}: ${next ? next.label : 'none'}`);
    console.error(`last room ${run.game.room?.id}, hearts ${run.game.player?.hp}`);
    process.exit(1);
  }
  const back = replay(run.frames);
  if (digest(back) !== digest(run.game)) {
    console.error('bot: the recorded input stream does not replay to the same state.');
    process.exit(1);
  }
  console.log('bot: recorded stream replays to a byte-identical final state.');
}

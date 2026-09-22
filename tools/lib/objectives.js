// The route through the game, as an ordered list of things to do.
//
// Deliberately hand-written rather than lifted from the progression prover's
// shortest chain: this is the route a person would take, heart containers and
// all, and if it ever stops working that is worth knowing about separately
// from whether *some* route still exists.

import { ROOMS, edgeId, OPENINGS, DIRS, OPPOSITE } from '../../src/game/world.js';

const chestAt = (id) => {
  for (const [room, data] of Object.entries(ROOMS)) {
    const e = (data.entities ?? []).find((q) => q.type === 'chest' && q.id === id);
    if (e) return { room, x: e.x, y: e.y };
  }
  throw new Error(`no chest ${id}`);
};

const heartAt = (id) => {
  for (const [room, data] of Object.entries(ROOMS)) {
    const e = (data.entities ?? []).find((q) => q.type === 'heart' && q.id === id);
    if (e) return { room, x: e.x, y: e.y };
  }
  throw new Error(`no heart ${id}`);
};

/** Every save marker in the game. They restore her to full as well as save. */
export const SAVE_TILES = Object.entries(ROOMS).flatMap(([room, data]) =>
  data.tiles.flatMap((row, y) =>
    [...row].map((ch, x) => (ch === 'V' ? `${room}:${x},${y}` : null)).filter(Boolean)));

const chest = (id) => ({ kind: 'chest', id, ...chestAt(id), label: `chest ${id}` });
const heart = (id) => ({ kind: 'heart', id, ...heartAt(id), label: `heart ${id}` });

/** A door, described from the side she will approach it. */
const door = (room, dir) => ({
  kind: 'door',
  room,
  dir,
  id: edgeId(room, ROOMS[room].exits[dir]),
  label: `${ROOMS[room].doors[dir]} ${room} ${dir}`,
});

const portal = (room, to) => {
  const p = ROOMS[room].portals.find((q) => q.to === to);
  return { kind: 'portal', room, x: p.x, y: p.y, to, label: `stair ${room} -> ${to}` };
};

const pillar = (room) => ({ kind: 'pillar', room, label: `spin the pillar in ${room}` });
const boss = (room, who) => ({ kind: 'boss', room, id: who, label: `defeat ${who}` });

/** Somewhere in a room, to force a route through it. */
const visit = (room, x, y) => ({ kind: 'visit', room, x, y, label: `walk to ${room}` });

const heal = () => ({ kind: 'heal', label: 'rest at a marker' });

export const ROUTE = [
  // --- into the Mire Vaults -------------------------------------------------
  portal('ow_mirevault', 'd1_entry'),
  chest('ch_d1_key1'),

  // The first key buys the Drain Loop, and the Drain Loop is a heart
  // container. Going in with three hearts and no way to get a fourth until
  // the Rootcarver is a much worse dungeon.
  door('d1_guard', 'e'),
  heart('hc_d1'),

  chest('ch_d1_key2'),
  chest('ch_blade'),

  // The Rootcarver opens the shortcut east, which is the dungeon's backtrack.
  door('d1_keyroom', 'e'),
  chest('ch_d1_key3'),

  // --- out to the valley, while the Sap-Warden waits -------------------------
  // The Rootcarver is also what opens Cinderhome's cracked wall, and behind it
  // are the Whorl Charm and a heart container. Going back for them before the
  // boss is worth the walk: four hearts is not enough for that fight and five
  // is, and the pillar has to be spun sooner or later anyway.
  portal('d1_entry', 'ow_mirevault'),
  door('ow_cinderhome', 'n'),
  chest('ch_charm'),
  heart('hc_grove'),
  pillar('ow_northgate'),

  // --- back for the boss ----------------------------------------------------
  portal('ow_mirevault', 'd1_entry'),
  door('d1_pitroom', 'n'),
  door('d1_gallery', 'e'),
  chest('ch_d1_boss'),
  heal(),
  door('d1_prechamber', 'w'),
  boss('d1_boss', 'sapwarden'),

  // --- the Aerie Reliquary --------------------------------------------------
  portal('d1_entry', 'ow_mirevault'),
  portal('ow_aeriedoor', 'd2_foyer'),
  heart('hc_cloister'),
  chest('ch_d2_key1'),
  chest('ch_d2_key2'),
  chest('ch_sandals'),

  // One key buys the Vestry's heart; the other two are spoken for.
  door('d2_organloft', 'e'),
  heart('hc_vestry'),
  heart('hc_highledge'),

  // Out to the cliffs and the shore for the two containers the sandals unlock.
  portal('d2_foyer', 'ow_aeriedoor'),
  heart('hc_cliff'),
  heart('hc_shore'),
  portal('ow_aeriedoor', 'd2_foyer'),

  // The East Spire and the boss wing.
  chest('ch_d2_key3'),
  door('d2_eastspire', 'n'),
  chest('ch_d2_boss'),
  door('d2_updraft', 'n'),
  heal(),
  door('d2_chancel', 'w'),
  boss('d2_boss', 'chorister'),
];

/** Has this objective been met? */
export function done(obj, game) {
  switch (obj.kind) {
    case 'chest': return game.progress.chests.has(obj.id);
    case 'heart': return game.progress.heartsTaken.has(obj.id);
    case 'door': return game.progress.openedDoors.has(obj.id);
    case 'pillar': return game.progress.pillars.has(obj.room);
    case 'portal': return game.room.id === obj.to;
    case 'boss': return game.progress.bossesBeaten.has(obj.id);
    case 'visit': return game.room.id === obj.room;
    case 'heal': return game.player.hp >= game.progress.maxHp;
    default: return true;
  }
}

/** Where she has to stand, and which way to face, to do it. */
export function stationFor(obj) {
  switch (obj.kind) {
    case 'chest':
      return {
        room: obj.room,
        spots: Object.entries(DIRS).map(([dir, [dx, dy]]) => ({
          x: obj.x - dx, y: obj.y - dy, face: dir,
        })),
        act: 'press',
      };
    case 'heart':
      return { room: obj.room, spots: [{ x: obj.x, y: obj.y, face: null }], act: 'none' };
    case 'portal':
      return { room: obj.room, spots: [{ x: obj.x, y: obj.y, face: null }], act: 'none' };
    case 'door': {
      const [dx, dy] = DIRS[obj.dir];
      return {
        room: obj.room,
        spots: OPENINGS[obj.dir].map(([ox, oy]) => ({ x: ox - dx, y: oy - dy, face: obj.dir })),
        act: 'press',
      };
    }
    case 'pillar': {
      const grid = ROOMS[obj.room].tiles;
      for (let y = 0; y < grid.length; y += 1) {
        for (let x = 0; x < grid[y].length; x += 1) {
          if (grid[y][x] !== 'W') continue;
          return {
            room: obj.room,
            spots: Object.entries(DIRS).map(([dir, [dx, dy]]) => ({
              x: x - dx, y: y - dy, face: dir,
            })),
            act: 'spin',
          };
        }
      }
      throw new Error(`no pillar in ${obj.room}`);
    }
    case 'boss':
      return { room: obj.room, spots: [], act: 'fight' };
    case 'heal':
      // Any marker will do; the router picks whichever it can actually reach.
      return { room: null, spots: [], nodes: SAVE_TILES, act: 'save' };
    case 'visit':
      return { room: obj.room, spots: [{ x: obj.x, y: obj.y, face: null }], act: 'none' };
    default:
      throw new Error(`no station for ${obj.kind}`);
  }
}

export { OPPOSITE };

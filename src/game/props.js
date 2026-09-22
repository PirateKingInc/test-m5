// The things in a room that are not monsters: chests, heart containers and the
// people who tell you where to go.

import { TILE, SUB } from './constants.js';

export const PROP_TYPES = new Set(['chest', 'heart', 'npc']);

/** What a chest can hand over, and what to say when it does. */
export const CHEST_GIVES = {
  smallkey: { announce: ['A SMALL KEY.', 'ONE DOOR, ONCE.'] },
  bosskey: { announce: ['THE VAULT KEY.', 'HEAVY, AND WARM', 'TO HOLD.'] },
  blade: {
    announce: [
      'THE ROOTCARVER', 'BLADE.', '',
      'YOUR SWING NOW', 'SPLITS CRACKED', 'STONE.',
    ],
    upgrade: 'blade',
  },
  charm: {
    announce: [
      'THE WHORL CHARM.', '',
      'HOLD A TO WIND', 'UP. LET GO TO', 'SPIN.',
      'A SPIN BITES', 'FROM EVERY SIDE', 'AT ONCE.',
    ],
    upgrade: 'charm',
  },
  sandals: {
    announce: [
      'THE GALE SANDALS.', '',
      'YOUR JUMP CARRIES', 'FURTHER NOW, AND', 'HIGHER.',
    ],
    upgrade: 'sandals',
  },
};

export function makeProp(spec) {
  return {
    kind: spec.type,
    id: spec.id ?? null,
    gives: spec.gives ?? null,
    sprite: spec.sprite ?? null,
    name: spec.name ?? null,
    text: spec.text ?? null,
    tx: spec.x,
    ty: spec.y,
    x: spec.x * TILE * SUB,
    y: spec.y * TILE * SUB,
    open: false,
    anim: 0,
  };
}

/** Chests and people are obstacles; a heart container on the floor is not. */
export function propIsSolid(prop) {
  return prop.kind === 'chest' || prop.kind === 'npc';
}

export function propAt(props, tx, ty) {
  return props.find((p) => p.tx === tx && p.ty === ty) ?? null;
}

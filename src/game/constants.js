// Every magic number the simulation depends on, in one place.
//
// Positions are integers in SUBPIXELS (16 subpixels to the pixel). Nothing in
// src/game may use floating point for anything that affects simulation state:
// the bot playthrough in CI replays a recorded input stream and compares a hash
// of the final state, which only works if the arithmetic is exact.

export const SUB = 16;                 // subpixels per pixel
export const TILE = 16;                // pixels per metatile
export const TILE_SUB = TILE * SUB;    // subpixels per metatile

export const ROOM_W = 10;              // metatiles across
export const ROOM_H = 8;               // metatiles down

export const SCREEN_W = 160;
export const SCREEN_H = 144;
export const HUD_H = 16;
export const VIEW_W = ROOM_W * TILE;   // 160
export const VIEW_H = ROOM_H * TILE;   // 128

// Summer's collision box, in pixels, and where her 16x16 sprite sits relative
// to it: the box is her feet and body, the sprite's head overhangs upward.
export const HB_W = 10;
export const HB_H = 10;
export const SPRITE_OX = -3;
export const SPRITE_OY = -6;

// Movement
export const WALK_SPEED = 16;          // subpixels per frame on the ground (1 px)
export const AIR_SPEED = 24;           // subpixels per frame while airborne (1.5 px)
// Summer falls when the tile under her CENTRE is a pit, so crossing a pit W
// tiles wide means moving her centre from just before it to just past it:
// 16W + 1 pixels. 1 tile needs 17 px, 2 tiles need 33, 3 tiles need 49.
export const BASE_AIRTIME = 20;        // 30.0 px of travel: clears 1, fails 2
export const SANDAL_AIRTIME = 31;      // 46.5 px of travel: clears 2, fails 3
export const JUMP_APEX = 10;           // pixels of visual lift at the top of an arc

// Combat
export const SWING_FRAMES = 14;        // how long a swing pose is held
export const SWING_REACH = 12;         // pixels the blade extends past the hitbox
export const SWING_SPAN = 14;          // pixels wide across the facing axis
export const CHARGE_FRAMES = 30;       // A held this long arms the whorl spin
export const SPIN_FRAMES = 22;
export const SPIN_RADIUS = 16;
export const IFRAMES = 60;             // invincibility after taking damage
export const KNOCKBACK_FRAMES = 12;
export const KNOCKBACK_SPEED = 40;     // subpixels per frame

// Sword and enemy z-ranges. A grounded swing cannot reach a Mothkin, and an
// airborne swing cannot reach something standing on the floor beneath her.
export const GROUND_SWING_Z = [0, 6];
export const AIR_SWING_Z = [4, 14];
export const HOVER_Z = 8;              // where a Mothkin sits

// Health
export const START_HEARTS = 3;
export const MAX_HEARTS = 10;
export const HALF = 1;                 // damage is counted in half-hearts
export const HEART = 2;

// Timing
export const TRANSITION_FRAMES = 24;   // room-to-room scroll
export const TEXT_FRAMES_PER_GLYPH = 2;

// The one and only seed. Everything random in this game derives from it.
export const WORLD_SEED = 0x5c9a17;

# BRACKENFALL — Design Specification

**Working title:** *Brackenfall: The Long Hush*
**Hero:** Summer
**Genre:** top-down action-adventure, flip-screen rooms, early-90s handheld idiom
**Target first-run playtime:** 20–40 minutes

Everything in this document is original to this project. No characters, items,
place names, lore, melodies or iconography are drawn from any existing work.

---

## 1. Premise

Brackenfall is a shallow valley of peat, reed-water and wind-cut stone. For as
long as anyone kept count, the valley kept two **Wick-Stones** burning: one
sunk in the flooded vaults beneath the mire, one hung in the cliff reliquary
where the gales are loudest. Burning, they held back the **Hush** — a slow,
soundless fog that settles on a living thing and leaves it grey and still.

Both stones went dark on the same morning. **Summer**, apprentice to the valley
warden, is the only person left in Cinderhome still able to hear her own
footsteps. Warden Mabel hands her a short bronze sword, points at the mire, and
tells her the plain truth: relight both stones or the valley goes quiet for good.

Something is holding each stone. The **Sap-Warden** grew around the first one
like a tree grows around a fence post. The **Hollow Chorister** sings above the
second, and the Hush is the sound of it inhaling.

---

## 2. Controls (fixed design rule: D-pad + exactly two buttons)

| Input | Action |
| --- | --- |
| D-pad / Arrows / WASD | walk (4-direction) |
| **A** (Z) | context-sensitive: swing sword · talk · read sign · open chest · lift rock · push block · use save point · (held, with Whorl Charm) charge spin |
| **B** (X) | jump |
| **Start** (Enter) | pause |

There is no inventory, no item switching, no sub-menu. Every ability the player
gains changes what A or B already does.

Mobile: on-screen D-pad plus A, B and Start. Touch scrolling and pinch-zoom are
suppressed while the canvas is being touched.

---

## 3. Upgrades (all passive, all gate new ground)

| # | Upgrade | Where | Changes | Gates |
| --- | --- | --- | --- | --- |
| U1 | **Rootcarver Blade** | Dungeon 1 — Vault Keyroom | A's swing now shatters cracked walls and deals double damage | cracked walls in D1 (shortcut to the East Loop), the cracked wall in Cinderhome that hides Whorl Grove, and Boss 1 phase 2 |
| U3 | **Whorl Charm** | Overworld — Whorl Grove (needs U1) | holding A charges a spin attack that strikes all four sides, ignores shields, and wakes whorl pillars | the whorl pillar at Northgate Steps, which opens the Storm Stair to Dungeon 2 |
| U2 | **Gale Sandals** | Dungeon 2 — Updraft Hall | B jumps farther (2 tiles instead of 1) and higher (Summer can vault onto raised ledges) | 2-tile pits in D2 (Gale Hall → East Spire, the small key there), raised ledges (High Ledge), 2-tile pits and a ledge in the overworld, and Boss 2 phase 2 |

Numbering reflects the intended pick-up order: U1 → U3 → U2.

### Jump as a real mechanic

* Clears a 1-tile pit from the start; 2-tile pits only with the Gale Sandals.
* Ground shockwaves (Thudder, both bosses) pass harmlessly under an airborne Summer and are avoidable **only** by jumping.
* Mothkins hover out of reach of a grounded swing; the only way to kill one is to swing while airborne.
* Raised ledges (`J`) can only be entered while airborne **and** wearing the Gale Sandals.
* Landing on a pit tile is not death: Summer falls, loses half a heart, and is
  replaced on the last tile she stood on safely. See SOFTLOCK.md.

### Measured distances (subpixel units, 16 subpx = 1 px, 16 px = 1 tile)

Summer falls when the tile under her **centre** is a pit. Crossing a pit W tiles
wide therefore means carrying her centre from just before the pit to just past
it: **16W + 1 pixels**. A 1-tile pit needs 17 px, 2 tiles need 33, 3 need 49.

| | airtime | air speed | travel | clears | fails |
| --- | --- | --- | --- | --- | --- |
| base jump | 20 frames | 24 subpx/f (1.5 px) | 480 subpx (30.0 px) | 1-tile pit (17 px) | 2-tile pit (33 px) |
| Gale Sandals | 31 frames | 24 subpx/f (1.5 px) | 744 subpx (46.5 px) | 2-tile pit (33 px) | 3-tile pit (49 px) |

Both jumps have margin at the bottom of their range and headroom below the next
one up, so neither is frame-perfect and neither overreaches. Each leaves a
**14-frame window** in which the jump may be started and still clear the pit it
is meant for, which is forgiving without being free. No 3-tile pit exists in the
game, so the sandals are never insufficient.

---

## 4. Presentation constraints

* Internal resolution 160×144, integer nearest-neighbour upscale, no smoothing.
* 4-colour palette **"Brackenfall"**: `#0b1310` · `#2f5245` · `#78a68c` · `#dfeedb`.
* 8×8 tiles composed into 16×16 metatiles. Rooms are 10×8 metatiles (160×128),
  with the top 16 px reserved for the HUD.
* Summer is a 16×16 sprite with 4-direction walk (2 frames each) and a
  4-direction attack pose, all defined in code as pixel strings.
* No external asset files of any kind. Music and SFX are synthesised with the
  Web Audio API.

---

## 5. Tile legend (used by every room data file)

| char | name | behaviour |
| --- | --- | --- |
| `#` | wall | solid |
| `.` | floor | walkable |
| `,` | growth | walkable (decorative) |
| `~` | water | solid |
| `P` | pit | fall-through unless airborne |
| `T` | tree / pillar | solid |
| `x` | loose rock | solid; A lifts it away when adjacent and facing it |
| `o` | push block | solid; A pushes it one tile when adjacent and facing it |
| `C` | cracked wall | solid; destroyed by a swing once U1 is held |
| `L` | locked door | solid; consumes one small key |
| `B` | boss door | solid; consumes the dungeon's boss key |
| `G` | gate | solid until the room's condition is met (all enemies dead) |
| `S` | sign | solid; A reads it |
| `J` | raised ledge | solid unless Summer is airborne **and** holds U2 |
| `V` | save point | walkable; A saves |
| `D` | stair / door | walkable; triggers the room's portal |
| `W` | whorl pillar | solid; a charged spin awakens it |

---

## 6. World map

41 rooms. Every exit below is bidirectional unless it says otherwise; the CI
map-integrity check (`tools/verify-map.js`) fails the build if any exit lacks a
matching entrance on the other side, if any room is unreachable, or if the ASCII
border openings disagree with the declared exits.

### 6.1 Overworld — Brackenfall valley (12 rooms, 4×3)

```
        x=0               x=1               x=2               x=3
y=0  ow_bellhill  ——  ow_northgate  —G—  ow_stormstair  ——  ow_aeriedoor
                           |                                      |
y=1  ow_whorlgrove     ow_crossroads ——  ow_eastfen     ——  ow_cliffside
         |                 |                  |                   |
y=2  ow_cinderhome ——  ow_southmire  ——  ow_mirevault   ——  ow_shore
```

| room | contents |
| --- | --- |
| `ow_cinderhome` | **start.** Warden Mabel (hint), sign, save point. North wall is **cracked** (U1) → Whorl Grove. |
| `ow_southmire` | Snags, 1-tile pits. |
| `ow_mirevault` | **Dungeon 1 entrance** (`D` portal), sign, Brumbler. |
| `ow_shore` | **heart container** across a 2-tile pit (U2). |
| `ow_crossroads` | save point, Tamsin the reed-cutter (hint about whorl pillars). |
| `ow_whorlgrove` | **U3 Whorl Charm** (chest) + **heart container**. Palebucklers. Only entrance is the cracked wall from Cinderhome. |
| `ow_northgate` | **whorl pillar** — a charged spin opens the `G` gate east to the Storm Stair. Mothkins. |
| `ow_bellhill` | sign, save point, hint NPC (Bell-Ringer Orrin), Spitfen. |
| `ow_stormstair` | Thudders on narrow steps. |
| `ow_aeriedoor` | **Dungeon 2 entrance** (`D` portal), sign, save point. |
| `ow_cliffside` | **heart container** on a raised ledge (U2). |
| `ow_eastfen` | water, Spitfens, Brumbler. |

### 6.2 Dungeon 1 — The Mire Vaults (14 rooms)

```
        x=0             x=1              x=2             x=3
y=0  d1_boss  --B--  d1_prechamber   d1_gallery  --L2--  d1_treasury
                          |               |
                         L3               |
                          |               |
y=1  d1_westhall ——  d1_pitroom   ——  d1_keyroom  --C--  d1_eastloop
         |                |               |                   |
y=2  d1_cistern  ——  d1_crossvault ——  d1_guard   --L1--  d1_shortcut
                          |               |
y=3                   d1_entry     ——  d1_sump
```

| room | contents |
| --- | --- |
| `d1_entry` | save point, sign, portal up to `ow_mirevault`. |
| `d1_sump` | **small key 1** (chest). Snags. |
| `d1_crossvault` | Brumblers. Hub. |
| `d1_guard` | 2 Palebucklers; clearing the room opens the `G` gate north to the Keyroom. `L1` east. |
| `d1_shortcut` | **heart container**. Ladder north to the East Loop. |
| `d1_cistern` | **small key 2** across a 1-tile pit. Spitfens, water. |
| `d1_westhall` | Palebuckler corridor. |
| `d1_pitroom` | pits and Mothkins. `L3` north. |
| `d1_keyroom` | **U1 Rootcarver Blade** (big chest), Thudder. Its east wall is **cracked** — break it after taking the blade for the East Loop shortcut. |
| `d1_eastloop` | **small key 3** (chest). |
| `d1_gallery` | Spitfen + Thudder. `L2` east. |
| `d1_treasury` | **boss key**. |
| `d1_prechamber` | boss door `B` west. |
| `d1_boss` | **Boss 1 — The Sap-Warden.** Victory lights **Wick-Stone I** and returns Summer to `d1_entry`. |

Small keys: 3. Locked doors: `L1` (optional — heart container + shortcut), `L2`
(required — boss key), `L3` (required — boss door). **All three keys are
reachable while holding zero keys**, so no spending order can strand the player.

### 6.3 Dungeon 2 — The Aerie Reliquary (15 rooms)

```
        x=0              x=1               x=2              x=3
y=0  d2_boss  --B--  d2_chancel        d2_highledge     d2_reliquary
                          |                  |                |
                         L2                 (J)              L3
                          |                  |                |
y=1  d2_westwing ——  d2_updraft   ——   d2_galehall  -PP-  d2_eastspire
         |                |                  |                |
y=2  d2_cloister ——  d2_bridge    ——   d2_organloft --L1-- d2_vestry
         |                |                  |
y=3  d2_foyer    ——  d2_stairwell ——   d2_cellar
```

| room | contents |
| --- | --- |
| `d2_foyer` | save point, sign, portal down to `ow_aeriedoor`. |
| `d2_stairwell` | Snags, Brumbler. |
| `d2_cellar` | **small key 1** (chest). Spitfens. |
| `d2_cloister` | **heart container**. Palebucklers. |
| `d2_bridge` | 1-tile pits over the chasm, Mothkins. |
| `d2_organloft` | **small key 2** (chest), Thudder. `L1` east. |
| `d2_vestry` | **heart container**. |
| `d2_updraft` | **U2 Gale Sandals** (big chest), Mothkins + Thudder. `L2` north. |
| `d2_galehall` | 2-tile pits east (U2), raised ledge north (U2). |
| `d2_eastspire` | **small key 3** beyond a 2-tile pit. `L3` north. |
| `d2_reliquary` | **boss key**. |
| `d2_highledge` | **heart container**. Thudders. Reached only by vaulting the ledge from Gale Hall. |
| `d2_chancel` | boss door `B` west. |
| `d2_westwing` | Palebuckler corridor. |
| `d2_boss` | **Boss 2 — The Hollow Chorister.** Victory lights **Wick-Stone II** and rolls the ending. |

Small keys: 3. Locked doors: `L1` (optional — heart container), `L2` (required —
boss door), `L3` (required — boss key). All three keys are again reachable with
zero keys spent.

### 6.4 Progression gates, in order

1. Cinderhome → mire → **Dungeon 1**.
2. D1: keys 1 & 2 → open `L3` → the Keyroom route; **U1 Rootcarver Blade**.
3. U1 breaks the Keyroom's cracked east wall → East Loop → key 3 → `L2` → boss key → `B` → **Boss 1**.
4. U1 breaks Cinderhome's cracked north wall → Whorl Grove → **U3 Whorl Charm**.
5. U3 wakes the Northgate whorl pillar → `G` opens → Storm Stair → **Dungeon 2**.
6. D2: keys 1 & 2, then **U2 Gale Sandals** in the Updraft Hall.
7. U2 crosses the 2-tile pits to the East Spire (key 3) and vaults the ledge to the High Ledge.
8. `L3` → boss key; `L2` → the Chancel; `B` → **Boss 2** → ending + credits.

### 6.5 Heart containers (7; Summer starts with 3 hearts, caps at 10)

| # | room | requirement |
| --- | --- | --- |
| 1 | `ow_whorlgrove` | U1 |
| 2 | `ow_shore` | U2 |
| 3 | `ow_cliffside` | U2 |
| 4 | `d1_shortcut` | a small key |
| 5 | `d2_cloister` | none |
| 6 | `d2_vestry` | a small key |
| 7 | `d2_highledge` | U2 |

---

## 7. Monsters

| name | role | behaviour |
| --- | --- | --- |
| **Snag** | wanderer | random 4-direction walk on a seeded timer, contact damage, 1 HP |
| **Brumbler** | charger | idles until Summer shares its row or column, then charges in a straight line until it hits a wall, then recovers for 40 frames (vulnerable window), 2 HP |
| **Palebuckler** | shielded | walks a fixed patrol holding a shield in its facing direction; a swing from that same direction (i.e. from behind it) or any spin attack damages it — anything else is deflected with a clink, 2 HP |
| **Mothkin** | flyer | sine-weaves across the room at hover height 8, crossing pits freely; **only hittable while Summer is airborne**, 1 HP |
| **Thudder** | shockwave | stomps every 120 frames, sending a shockwave along the ground toward Summer; the wave damages her **only if she is grounded**, 3 HP |
| **Spitfen** | ranged | stationary, fires a seed projectile along its facing every 90 frames, turns to face Summer between shots, 2 HP |

All six appear in both dungeons and the overworld. Enemies drop a half-heart
pickup on death with probability derived from the seeded RNG (no wall-clock
randomness anywhere).

## 8. Bosses

### Boss 1 — The Sap-Warden (`d1_boss`, 24 HP)

| phase | HP | pattern |
| --- | --- | --- |
| 1 | 24→16 | lumbers toward Summer; every 90 frames erupts three telegraphed root spikes at her last position |
| 2 | 16→8 | seals itself in a **cracked bark shell**; only a Rootcarver swing (U1) breaks through, everything else clinks off. Fires seed volleys meanwhile |
| 3 | 8→0 | alternates a straight charge with a **ground shockwave ring** that must be jumped |

Tests U1 (phase 2) and the jump (phase 3).

### Boss 2 — The Hollow Chorister (`d2_boss`, 24 HP)

The arena is an L: a three-by-two **island** in the north-west corner, two tiles
of chasm east of it and two more south of it, and open floor everywhere else.
Both ways onto the island are two-tile jumps.

| phase | HP | pattern |
| --- | --- | --- |
| 1 | 24→18 | drifts on the open floor and fires three-note spreads |
| 2 | 18→10 | withdraws into the island corner and pins itself there; the only ways in are the two 2-tile gaps, so it cannot be fought without the Gale Sandals. Summons one Mothkin at a time |
| 3 | 10→0 | hovers at height 8 (airborne swings only) and lays down shockwaves |

A boss flashes for 24 frames after each hit, so neither fight can be won by
standing in it and holding A.

Tests U2 (phase 2) and the jump (phases 2 and 3).

---

## 9. Systems

* **Health.** Hearts in halves. Touching a monster or a boss costs a whole
  heart; a ranged attack, a shockwave or a fall costs half; a root spike costs a
  whole one. 60 invincibility frames with sprite flicker, plus 12 frames of
  knockback away from the damage source.
* **Dialogue.** Fixed 160×40 box, 3 lines of 18 characters, one glyph every 2
  frames, A skips to the end of the page and then advances.
* **Saving.** Autosave on every room entry and on every save point. The save is
  one JSON blob in `localStorage` under `brackenfall.save.v1`. Title screen
  offers **Continue** (only when a save exists) and **New Game**.
* **Determinism.** Fixed 60 Hz timestep with an accumulator; all randomness runs
  through a seeded mulberry32 stream stored in the game state; game logic never
  reads `Date.now()`, `Math.random()`, or the DOM.
* **Separation.** Everything under `src/game/` and `src/data/` is pure and runs
  headless under Node. Everything under `src/engine/` is browser-only I/O
  (canvas, keyboard, touch, Web Audio, rAF).
* **Audio.** Original melodies, one theme per area — title, overworld, Mire
  Vaults, Aerie Reliquary, boss, ending — plus SFX for swing, clink, hit,
  damage, jump, land, chest, key, door, heart, save and text blip.

---

## 10. Verification

| check | tool |
| --- | --- |
| every exit has a matching reverse entrance; ASCII borders agree with declared exits; no orphan rooms | `tools/verify-map.js` |
| the ending is reachable from a new game, modelled as a requirement graph | `tools/verify-progression.js` |
| exhaustive search over small-key spending orders proves no softlock; no pit region can trap the player | `tools/verify-softlock.js` → `SOFTLOCK.md` |
| pit widths vs jump distance before/after U2, sword hitboxes, shield-from-behind, shockwave-only-jumpable, i-frames, save/load round trip | `tests/*.test.js` |
| a scripted input sequence plays New Game → both dungeons → ending, replayed frame-for-frame from a recording | `tools/bot.js` + `tests/playthrough.test.js` |

---

## 11. Out of scope

Deliberately **not** in this game:

* item menus or any inventory UI
* currency, shops, trading
* side quests or optional questlines
* more than two dungeons
* procedural generation of any kind

Ideas that came up and were parked live in `BACKLOG.md`.

# Brackenfall: The Long Hush

**▶ Play it: https://piratekinginc.github.io/test-m5/** — or
[install it](#install-it-and-play-offline) and play offline.

> **The first deploy needs one switch flipped by hand.** GitHub Pages has to be
> turned on before a workflow can publish to it, and a workflow cannot turn it
> on for you: creating a Pages site needs `administration: write`, which is not
> one of the scopes `GITHUB_TOKEN` can be granted. Go to **Settings → Pages**
> and set **Source** to **GitHub Actions**, then re-run the *Deploy to GitHub
> Pages* workflow. Every deploy after that is automatic on merge to `main`.

An original top-down action-adventure in the idiom of an early-90s handheld
dungeon crawler. 160×144, four colours, 8×8 tiles, a d-pad and two buttons.
No engine, no framework, no dependencies, no asset files — every sprite is
drawn in code and every note is synthesised in the browser.

First run: 20–40 minutes.

---

## The valley

Brackenfall is a shallow valley of peat, reed-water and wind-cut stone. For as
long as anyone kept count it kept two **Wick-Stones** burning — one sunk in the
flooded vaults beneath the mire, one hung in the cliff reliquary where the
gales are loudest. Burning, they held back the **Hush**: a slow, soundless fog
that settles on a living thing and leaves it grey and still.

Both stones went dark on the same morning.

**Summer**, apprentice to the valley warden, is the only person left in
Cinderhome who can still hear her own footsteps. Warden Mabel hands her a short
bronze sword, points at the mire, and tells her the plain truth: relight both
stones or the valley goes quiet for good.

Something is holding each stone. The **Sap-Warden** grew around the first one
the way a tree grows around a fence post. The **Hollow Chorister** sings above
the second, and the Hush is the sound of it inhaling.

---

## Controls

Two buttons. That is the design rule, not a limitation I am apologising for —
there is no inventory, nothing to equip, and nothing to switch between.

| | Desktop | Touch |
| --- | --- | --- |
| Move | Arrows or WASD | on-screen d-pad |
| **A** | `Z` | A |
| **B** | `X` | B |
| **Start** | `Enter` | START |
| Sound on/off | `M` | the button under the screen |

**A** is one button doing every context-sensitive job: swing the sword, talk,
read a sign, open a chest, lift a rock, shove a block, rest at a save marker —
and, once you have the Whorl Charm, hold it to wind up a spin.

**B** jumps, from the first screen. It clears pits, passes over shockwaves that
travel along the floor, reaches raised ledges, and is the only way to touch a
Mothkin, which hovers above a grounded swing.

Sound is not a third game button. It never reaches the button mask.

---

## Upgrades

Three, all passive, each one opening ground that was closed before.

| | Where | What it opens |
| --- | --- | --- |
| **Mirecutter Blade** | Mire Vaults | cuts through cracked walls; more damage |
| **Whorl Charm** | Whorl Grove | hold **A** to spin — the only thing that turns a whorl pillar, which opens the Aerie Gate |
| **Gale Sandals** | Aerie Reliquary | jump two tiles instead of one, and onto raised ledges |

Both Wick-Stones are gates too: the Aerie stair stays shut until the first one
is lit, so the Sap-Warden cannot be skipped.

---

## The world

41 rooms — a 12-room overworld hub and two 14/15-room dungeons — as flip
screens with a scrolling transition between them. 7 heart containers, 6 small
keys, 2 boss keys, 12 doors, 11 chests.

### Brackenfall valley (12 rooms)

```
        x=0               x=1               x=2               x=3
y=0  ow_bellhill  ——  ow_northgate  —G—  ow_stormstair  ——  ow_aeriedoor
                           |
y=1  ow_whorlgrove     ow_crossroads ——  ow_eastfen     ——  ow_cliffside
         |                 |                  |                   |
y=2  ow_cinderhome ——  ow_southmire  ——  ow_mirevault   ——  ow_shore
```

### Dungeon 1 — The Mire Vaults (14 rooms)

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

### Dungeon 2 — The Aerie Reliquary (15 rooms)

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

`L` = small-key door · `B` = boss door · `G` = whorl gate · `C` = cracked wall
· `PP` = two-tile gap · `(J)` = raised ledge

`SPEC.md` has the full room-by-room contents, the gate chain and the placement
of every key, heart and upgrade.

---

## The bestiary

Six monsters, each one asking a different question.

| | |
| --- | --- |
| **Snag** | wanders; the one that teaches you the sword reaches further than you think |
| **Brumbler** | winds up, then charges twice your walking speed. Only vulnerable while it recovers |
| **Palebuckler** | shielded from the front. You have to get behind it, and it paces, so its back keeps moving |
| **Mothkin** | hovers. A grounded swing passes under it — jump, or leave it alone |
| **Thudder** | stomps a shockwave along the floor in four directions. Jumpable, and *only* jumpable |
| **Spitfen** | rooted, and shoots across a whole room. Worth crossing a room to kill |

Two bosses, three phases each, and each one is a question about that dungeon's
upgrade. The Sap-Warden seals itself and has to be opened. The Chorister
withdraws onto an island across a two-tile chasm and then rises out of reach of
a swing taken from the ground.

---

## Install it and play offline

Brackenfall is an installable web app. You never *have* to install it — the
page plays exactly the same in a browser tab — but installed it opens in its
own window without browser chrome and has its own icon.

**It plays offline either way.** The first visit stores every file the game
needs on your device, so from then on it loads and plays with no connection
at all, installed or not.

| | How |
| --- | --- |
| **Desktop** (Chrome, Edge) | Click **INSTALL** in the banner at the top of the game, or the install icon at the right of the address bar. |
| **Android** (Chrome) | Tap **INSTALL** in the banner, or ⋮ → **Install app** / **Add to Home screen**. |
| **iPhone / iPad** (Safari) | iOS has no install button for web apps, so the banner tells you how instead: tap **Share** (the square with the arrow), then **Add to Home Screen**. |

Dismiss the banner with **✕** and it stays away for two weeks.

**Updates.** When a new version is published, the game shows *A NEW VERSION
IS READY* with **RELOAD** and **LATER**. Nothing changes under you mid-game:
the version you are playing keeps running until you choose RELOAD, and then
**Continue** picks up from your last autosave.

**Your save when you install.**

* **Chrome and Edge on desktop and Android:** the installed app shares the
  browser's storage for the site, so a game you started in a tab is waiting
  under **Continue** in the app.
* **iPhone and iPad:** a Home Screen app gets **its own storage, separate from
  Safari's**. A save made in Safari does *not* carry over to the Home Screen
  app. If you want to play installed on iOS, install first and start there.

---

## Running it

It is a static site with no build step.

```sh
git clone https://github.com/PirateKingInc/test-m5.git
cd test-m5
python3 -m http.server 8000     # or any static file server
```

Then open `http://localhost:8000/`. Opening `index.html` straight off the disk
will not work — it is ES modules, which browsers refuse to load over `file://`.

### Tests and verification

No dependencies to install. Node 20 or newer.

```sh
npm test        # 162 unit tests
npm run verify  # map integrity, progression proof, softlock search, manifest, icons, service worker
npm run bot     # the scripted playthrough, New Game to the credits
npm run ci      # all three, which is what CI runs
```

The installable-app layer also has browser tests that drive headless Chrome.
They need `playwright-core`, which is test tooling rather than a dependency, so
it is installed without touching `package.json`:

```sh
npm i --no-save --no-package-lock playwright-core
xvfb-run -a npm run test:browser   # xvfb for the standalone-window test; CI does the same
```

They cover the service worker registering and precaching every file, the game
loading and playing with the server stopped and the browser offline, a deploy
of a changed file bringing up the update banner, both install banners, and a
save made in a browser tab being continued in a real standalone app window.
CI also runs a Lighthouse PWA audit and fails unless the site is installable.

| | |
| --- | --- |
| `npm run verify:map` | every room's tiles, exits, doors and entities are well formed and every door agrees with the room on the other side of it |
| `npm run verify:progression` | a state-space search proving the ending is reachable, plus a necessity check that removes each upgrade and each boss in turn and confirms the ending goes away |
| `npm run verify:softlock` | every ordering of key spends and boss kills, and a per-room pit-trap search. Writes `SOFTLOCK.md` |
| `npm run bot` | 26820 frames of scripted input from New Game to the credits, then replayed into a fresh game and compared state-for-state |

`SOFTLOCK.md` is generated, and CI fails if it is stale. So are two more:

| | |
| --- | --- |
| `npm run icons` | draws the app icons from Summer's sprite in the four palette colours. CI fails if `icons/` drifts |
| `npm run sw` | writes the precache list and a hash of every shipped file into `sw.js`. **Run it after changing any file under `src/`, `index.html`, `manifest.json` or `icons/`**, or CI fails: a changed file with an unchanged worker would never reach anyone who already has the game |

---

## How it is built

```
index.html          the whole shell: canvas, touch pad, one <script type="module">
manifest.json       the web app manifest: name, colours, icons, standalone display
sw.js               the service worker: versioned, cache-first precache of every file
src/pwa.js          registers the worker; the update and install banners
icons/              app icons, generated from Summer's sprite by tools/make-icons.js
src/game/           the simulation. No DOM, no clock, no Math.random
src/engine/         render, input, audio, storage, the fixed-timestep loop
src/data/           palette, tiles, sprites, the score, and the rooms
tools/              the provers and the bot
tests/              node:test
```

**The simulation is pure.** `src/game/` never touches the DOM, never reads a
clock and never calls `Math.random`. Randomness is a seeded mulberry32 whose
state lives in the save file; time is a fixed 60 Hz tick; positions are integer
subpixels, sixteen to the pixel. Nothing in there makes a sound either — it
pushes names onto a queue and the audio engine reads them.

That purity is not an aesthetic preference. It is what lets the bot record
26820 button presses, replay them into a brand-new game, and land on the same
subpixel with the same RNG state — which is the strongest evidence in the
project that the game is finishable.

**Four colours, structurally.** The renderer draws into a `Uint8Array` of
palette indices 0–3 and expands it to RGBA once per frame. A fifth colour is
not a rule anyone has to remember; it is unrepresentable.

**Sprites and tiles are pixel strings** in `src/data/`, sliced into a
deduplicated table of 66 distinct 8×8 tiles and composed into 16×16 metatiles.

**The score is data.** Seven original tracks written as rows of tokens, one row
to a sixteenth note, played on two pulse channels, a bass and a noise channel.
The 12.5% duty pulse is a hand-built `PeriodicWave`, because the built-in
`square` is the 50% case and the least characterful of the three.

---

## Saving

Autosaves to `localStorage` on every room entry and at every save marker.
Resting at a marker also heals. The title screen offers **Continue** when there
is a save and **New Game** either way.

---

## Everything here is original

The valley, the characters, the monsters, the items, the melodies and the name.
Nothing is drawn from any existing work, and there are no external assets of
any kind — no images, no audio files, no fonts, no libraries. The app icons
are the one set of image files in the repository, and they are not an
exception: `tools/make-icons.js` renders them from Summer's pixel-string
sprite in the four palette colours.

Ideas that did not fit the two-button rule or the two-dungeon scope are in
`BACKLOG.md`.

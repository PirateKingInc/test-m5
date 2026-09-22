# Backlog

Ideas raised during development that are **out of scope** for this build (see
SPEC.md §11). Nothing here is planned; this is the parking lot.

## Mechanics
- A third dungeon in the drowned quarry north of Bell Hill.
- A fourth passive upgrade: a sword that parries projectiles back at Spitfens.
- Wall-hop: chaining a jump off a ledge edge for extra distance.
- Carryable rocks — currently `x` rocks are lifted and destroyed; letting Summer
  carry and throw one would open block-on-switch puzzles.
- Push blocks on pressure plates (the `o` tile already pushes; no plate exists).

## Content
- Named mini-bosses guarding each heart container.
- A weather layer: gale gusts in the overworld that shove Summer one tile.
- More NPC hint dialogue that reacts to which upgrades Summer already holds.
- A boss rush unlocked after the credits.

## Presentation
- Palette swap unlocked on a second playthrough (the spec fixes one 4-colour set).
- Screen-shake intensity option for accessibility.
- A proper attract-mode demo on the title screen driven by the playthrough bot.

## Tooling
- A room editor page that round-trips the ASCII room files.
- Record/replay of arbitrary play sessions for bug reports.
- Mutation testing of the softlock prover (delete an edge, assert the prover fails).

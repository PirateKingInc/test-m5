// Everything that puts pixels on screen. This module reads game state and
// never writes it.
//
// Drawing goes into an index buffer of palette entries 0..3, one byte per
// pixel, which is then expanded to RGBA once per frame. That is a little
// roundabout, and it is deliberate: it makes it structurally impossible to
// write a fifth colour.

import { PALETTE } from '../data/palette.js';
import { TILES, METATILES, TILE_ART } from '../data/tiles.js';
import { glyph, CELL_W, CELL_H, GLYPH_W, GLYPH_H } from '../data/font.js';
import {
  SUMMER, SWORD, SPIN, MONSTERS, BUCKLER, NPCS, SEED, NOTE, SHOCKWAVE,
  ROOT_SPIKE, CHEST, HEART_CONTAINER, KEY, BOSSES, WICKSTONE,
  FULL_HEART, HALF_HEART, EMPTY_HEART,
} from '../data/sprites.js';
import {
  SCREEN_W, SCREEN_H, HUD_H, VIEW_W, VIEW_H, TILE, SUB, HB_W, HB_H,
  SPRITE_OX, SPRITE_OY, TRANSITION_FRAMES,
} from '../game/constants.js';
import { SCENE, CREDITS } from '../game/game.js';
import { visibleLines, pageComplete } from '../game/dialogue.js';
import { dungeonOf } from '../game/world.js';
import { jumpHeight } from '../game/player.js';

const RGBA = PALETTE.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  255,
]);

export class Renderer {
  /** @param {HTMLCanvasElement} canvas the visible, upscaled canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    this.buf = new Uint8Array(SCREEN_W * SCREEN_H);

    this.small = document.createElement('canvas');
    this.small.width = SCREEN_W;
    this.small.height = SCREEN_H;
    this.smallCtx = this.small.getContext('2d', { alpha: false });
    this.image = this.smallCtx.createImageData(SCREEN_W, SCREEN_H);
  }

  // --- primitives -----------------------------------------------------------

  clear(colour = 0) {
    this.buf.fill(colour);
  }

  px(x, y, colour) {
    if (x < 0 || y < 0 || x >= SCREEN_W || y >= SCREEN_H) return;
    this.buf[y * SCREEN_W + x] = colour;
  }

  fillRect(x, y, w, h, colour) {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(SCREEN_W, x + w);
    const y1 = Math.min(SCREEN_H, y + h);
    for (let py = y0; py < y1; py += 1) {
      this.buf.fill(colour, py * SCREEN_W + x0, py * SCREEN_W + x1);
    }
  }

  /** Draws one 8x8 tile from the tile table. */
  tile(id, x, y) {
    const rows = TILES[id];
    for (let ry = 0; ry < 8; ry += 1) {
      const py = y + ry;
      if (py < 0 || py >= SCREEN_H) continue;
      const row = rows[ry];
      for (let rx = 0; rx < 8; rx += 1) {
        this.px(x + rx, py, row.charCodeAt(rx) - 48);
      }
    }
  }

  /** Draws a 16x16 metatile as its four 8x8 quadrants. */
  metatile(name, x, y) {
    const ids = METATILES[name];
    if (!ids) return;
    this.tile(ids[0], x, y);
    this.tile(ids[1], x + 8, y);
    this.tile(ids[2], x, y + 8);
    this.tile(ids[3], x + 8, y + 8);
  }

  /**
   * Draws a transparent sprite.
   * @param {string[]} rows pixel strings, '.' transparent
   * @param {{flipX?: boolean, solid?: number}} [opts] `solid` paints every lit
   *   pixel one colour, which is how the damage flash works.
   */
  sprite(rows, x, y, opts = {}) {
    const h = rows.length;
    const w = rows[0].length;
    for (let ry = 0; ry < h; ry += 1) {
      const py = y + ry;
      if (py < 0 || py >= SCREEN_H) continue;
      const row = rows[ry];
      for (let rx = 0; rx < w; rx += 1) {
        const ch = row[opts.flipX ? w - 1 - rx : rx];
        if (ch === '.') continue;
        this.px(x + rx, py, opts.solid ?? ch.charCodeAt(0) - 48);
      }
    }
  }

  /** Draws text in the 5x7 font. Returns the x it ended at. */
  text(str, x, y, colour = 3) {
    let cx = x;
    for (const ch of str) {
      const g = glyph(ch);
      for (let ry = 0; ry < GLYPH_H; ry += 1) {
        for (let rx = 0; rx < GLYPH_W; rx += 1) {
          if (g[ry][rx] === '#') this.px(cx + rx, y + ry, colour);
        }
      }
      cx += CELL_W;
    }
    return cx;
  }

  textWidth(str) {
    return str.length * CELL_W - 1;
  }

  centeredText(str, y, colour = 3) {
    this.text(str, Math.round((SCREEN_W - this.textWidth(str)) / 2), y, colour);
  }

  /** Text at 2x, for the title. */
  bigText(str, x, y, colour = 3) {
    let cx = x;
    for (const ch of str) {
      const g = glyph(ch);
      for (let ry = 0; ry < GLYPH_H; ry += 1) {
        for (let rx = 0; rx < GLYPH_W; rx += 1) {
          if (g[ry][rx] !== '#') continue;
          this.fillRect(cx + rx * 2, y + ry * 2, 2, 2, colour);
        }
      }
      cx += CELL_W * 2;
    }
  }

  centeredBigText(str, y, colour = 3) {
    this.bigText(str, Math.round((SCREEN_W - (str.length * CELL_W * 2 - 2)) / 2), y, colour);
  }

  /** A one-pixel box outline. */
  box(x, y, w, h, colour = 3) {
    this.fillRect(x, y, w, 1, colour);
    this.fillRect(x, y + h - 1, w, 1, colour);
    this.fillRect(x, y, 1, h, colour);
    this.fillRect(x + w - 1, y, 1, h, colour);
  }

  // --- scenes ---------------------------------------------------------------

  /** @param {import('../game/game.js').Game} game */
  draw(game) {
    switch (game.scene) {
      case SCENE.TITLE: this.drawTitle(game); break;
      case SCENE.GAMEOVER: this.drawGameOver(game); break;
      case SCENE.ENDING: this.drawEnding(game); break;
      case SCENE.CREDITS: this.drawCredits(game); break;
      default: this.drawWorld(game); break;
    }
    this.present();
  }

  drawTitle(game) {
    this.clear(0);
    this.fillRect(0, 0, SCREEN_W, 52, 2);
    this.centeredBigText('BRACKENFALL', 14, 0);
    this.centeredText('THE LONG HUSH', 36, 0);

    // Summer stands under her own title, breathing.
    const frame = SUMMER.down[Math.floor(game.titleT / 30) % 2];
    this.sprite(frame, SCREEN_W / 2 - 8, 62);

    const options = game.titleOptions();
    options.forEach((opt, i) => {
      const y = 96 + i * 14;
      const colour = opt.enabled ? 3 : 1;
      this.centeredText(opt.label, y, colour);
      if (i === game.menuIndex && Math.floor(game.titleT / 16) % 2 === 0) {
        const w = this.textWidth(opt.label);
        this.text('>', Math.round((SCREEN_W - w) / 2) - 8, y, 3);
      }
    });
    this.centeredText('A / ENTER TO START', 130, 1);
  }

  drawGameOver() {
    this.clear(3);
    this.centeredBigText('THE HUSH', 44, 0);
    this.centeredBigText('TAKES YOU', 66, 0);
    this.centeredText('PRESS START', 108, 1);
  }

  drawEnding(game) {
    this.clear(3);
    const t = game.creditsT;
    // The two stones catch, one after the other.
    this.sprite(WICKSTONE, 48, 40, { solid: t > 30 ? 0 : 2 });
    this.sprite(WICKSTONE, 96, 40, { solid: t > 90 ? 0 : 2 });
    this.centeredText('BOTH STONES LIT', 70, 0);
    this.centeredBigText('THE HUSH', 86, 0);
    this.centeredBigText('LIFTS', 104, 0);
    if (t > 200 && Math.floor(t / 20) % 2 === 0) this.centeredText('PRESS A', 130, 1);
  }

  drawCredits(game) {
    this.clear(3);
    const top = SCREEN_H - Math.floor(game.creditsT / 2);
    CREDITS.forEach((line, i) => {
      const y = top + i * 14;
      if (y < -10 || y > SCREEN_H) return;
      this.centeredText(line, y, 0);
    });
    if (game.creditsT > 120 && Math.floor(game.creditsT / 24) % 2 === 0) {
      this.centeredText('START', SCREEN_H - 10, 1);
    }
  }

  drawWorld(game) {
    this.clear(1);

    // Screen shake. The offset is a pure function of the frame counter, so a
    // recorded input stream still draws the same picture on replay - and it
    // moves the world only, never the HUD, because a heart display that will
    // not sit still is unreadable exactly when it matters most.
    const [sx, sy] = Renderer.shakeOffset(game);
    if (game.transition) {
      const t = game.transition.t / TRANSITION_FRAMES;
      const [dx, dy] = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[game.transition.dir];
      const outX = Math.round(-dx * VIEW_W * t);
      const outY = Math.round(-dy * VIEW_H * t);
      this.drawGrid(game.transition.from.grid, outX, HUD_H + outY);
      const inX = outX + dx * VIEW_W;
      const inY = outY + dy * VIEW_H;
      this.drawGrid(game.room.grid, inX, HUD_H + inY);
      this.drawRoomContents(game, inX, HUD_H + inY);
      this.drawPlayer(game, inX, HUD_H + inY);
    } else {
      this.drawGrid(game.room.grid, sx, HUD_H + sy);
      this.drawRoomContents(game, sx, HUD_H + sy);
      this.drawPlayer(game, sx, HUD_H + sy);
      this.drawBlade(game, sx, HUD_H + sy);
    }

    // A flash, for the two moments big enough to earn one: a heart container
    // and a Wick-Stone relit. Strobing on alternate frames rather than holding
    // - four colours give no room for a fade, so the alternation is the fade.
    if (game.flash > 0 && Math.floor(game.frame / 2) % 2 === 0) {
      this.fillRect(0, HUD_H, SCREEN_W, SCREEN_H - HUD_H, 0);
    }

    this.drawHud(game);

    if (game.banner > 0 && !game.transition) {
      const label = game.room.name;
      const w = this.textWidth(label) + 8;
      const x = Math.round((SCREEN_W - w) / 2);
      this.fillRect(x, HUD_H + 6, w, 13, 3);
      this.text(label, x + 4, HUD_H + 9, 0);
    }

    if (game.dialogue) this.drawDialogue(game);

    if (game.scene === SCENE.PAUSE) {
      this.fillRect(28, 50, 104, 44, 3);
      this.box(30, 52, 100, 40, 0);
      this.centeredText('PAUSED', 60, 0);
      this.centeredText('START TO RESUME', 76, 0);
    }
  }

  /**
   * How far to shove the world this frame, in pixels.
   *
   * Two coprime multipliers against the frame counter, so the horizontal and
   * vertical components come back into step every six frames rather than every
   * two - which is the difference between a rattle and a wobble.
   */
  static shakeOffset(game) {
    if (!game.shake) return [0, 0];
    const m = game.shakeMag;
    return [((game.frame * 7) % 3) - 1, ((game.frame * 5) % 2 === 0 ? 1 : -1)]
      .map((v, i) => Math.round(v * m * (i === 0 ? 1 : 0.7)));
  }

  /** @param {string[][]} grid */
  drawGrid(grid, ox, oy) {
    for (let y = 0; y < grid.length; y += 1) {
      const py = oy + y * TILE;
      if (py <= -TILE || py >= SCREEN_H) continue;
      for (let x = 0; x < grid[y].length; x += 1) {
        const px = ox + x * TILE;
        if (px <= -TILE || px >= SCREEN_W) continue;
        this.metatile(TILE_ART[grid[y][x]], px, py);
      }
    }
  }

  /** Monsters, their projectiles, and anything they dropped. */
  drawRoomContents(game, ox, oy) {
    for (const prop of game.props) {
      const x = Math.round(ox + prop.x / SUB);
      const y = Math.round(oy + prop.y / SUB);
      if (prop.kind === 'chest') this.sprite(prop.open ? CHEST.open : CHEST.closed, x, y);
      else if (prop.kind === 'heart') this.sprite(HEART_CONTAINER, x, y);
      else if (prop.kind === 'npc') {
        const art = NPCS[prop.sprite] ?? NPCS.mabel;
        this.sprite(art[Math.floor(prop.anim / 40) % art.length], x, y);
      }
    }

    for (const q of game.pickups) {
      // Blink out over the last second so a pickup never vanishes unannounced.
      if (q.life < 60 && Math.floor(q.life / 4) % 2 === 0) continue;
      this.sprite(HALF_HEART, Math.round(ox + q.x / SUB), Math.round(oy + q.y / SUB));
    }

    for (const h of game.hazards) {
      const x = Math.round(ox + h.x / SUB);
      const y = Math.round(oy + h.y / SUB);
      if (h.kind === 'seed') this.sprite(SEED, x, y);
      else if (h.kind === 'note') this.sprite(NOTE, x, y);
      else if (h.kind === 'shockwave') this.sprite(SHOCKWAVE[Math.floor(h.anim / 6) % 2], x, y);
      else if (h.kind === 'spike') {
        // Telegraph first, hurt second.
        if (h.warn > 0) {
          if (Math.floor(h.warn / 4) % 2 === 0) this.box(x + 2, y + 2, 12, 12, 3);
        } else {
          this.sprite(ROOT_SPIKE, x, y);
        }
      }
    }

    const boss = game.boss;
    if (boss && boss.alive) {
      const art = BOSSES[boss.type];
      const bx = Math.round(ox + boss.x / SUB);
      const by = Math.round(oy + boss.y / SUB - boss.z);
      const flicker = boss.hurt > 0 && Math.floor(game.frame / 2) % 2 === 0;
      if (boss.z > 0) {
        this.sprite(
          ['..########..', '.##########.', '..########..'],
          bx + 10, Math.round(oy + boss.y / SUB + 28), { solid: 2 },
        );
      }
      if (!flicker) {
        this.sprite(art[Math.floor(boss.anim / 14) % 2], bx, by, {
          solid: boss.intro > 0 && Math.floor(game.frame / 4) % 2 === 0 ? 3 : undefined,
        });
      }
      // The bark shell reads as a box you have to break, not a colour swap.
      if (boss.shell) this.box(bx + 1, by + 1, 30, 30, 3);
    }

    // Back to front, so a monster lower on screen overlaps one above it.
    const order = [...game.entities].sort((a, b) => a.y - b.y);
    for (const e of order) {
      if (!e.alive && e.hurt <= 0) continue;
      if (e.hurt > 0 && Math.floor(game.frame / 2) % 2 === 0) continue;
      const art = MONSTERS[e.kind];
      if (!art) continue;
      const x = Math.round(ox + e.x / SUB - 2);
      const y = Math.round(oy + e.y / SUB - 4 - (e.z ?? 0));
      // A winding Brumbler shudders in place, so the charge can be read.
      const shake = e.state === 'winding' ? (Math.floor(e.anim / 2) % 2 ? 1 : -1) : 0;
      this.sprite(art[Math.floor(e.anim / 10) % 2], x + shake, y);
      if (e.shielded) {
        const side = e.dir === 'left' || e.dir === 'right';
        const shield = side ? BUCKLER.side : e.dir === 'up' ? BUCKLER.up : BUCKLER.down;
        this.sprite(shield, x, y, { flipX: e.dir === 'right' });
      }
      if (e.z > 0) {
        this.sprite(
          ['..####..', '.######.', '..####..'],
          x + 4, Math.round(oy + e.y / SUB + 10), { solid: 2 },
        );
      }
    }
  }

  /** The blade, drawn over the world so it reads as reaching past her. */
  drawBlade(game, ox, oy) {
    const p = game.player;
    if (!p || p.falling > 0) return;
    const bx = Math.round(ox + p.x / SUB + SPRITE_OX);
    const by = Math.round(oy + p.y / SUB + SPRITE_OY - jumpHeight(p));

    if (p.spin > 0) {
      this.sprite(SPIN[Math.floor(p.spin / 4) % 2], bx, by, { solid: 3 });
      return;
    }
    if (p.swing <= 0) return;
    const d = p.swingDir;
    const art = d === 'up' ? SWORD.up : d === 'down' ? SWORD.down : SWORD.side;
    const dx = d === 'left' ? -10 : d === 'right' ? 10 : 0;
    const dy = d === 'up' ? -10 : d === 'down' ? 10 : 0;
    this.sprite(art, bx + dx, by + dy, { flipX: d === 'right' });

    // A charged spin is worth announcing before it goes off.
    if (p.charge >= 30 && Math.floor(game.frame / 4) % 2 === 0) {
      this.box(bx + 1, by + 1, 14, 14, 3);
    }
  }

  drawPlayer(game, ox, oy) {
    const p = game.player;
    if (!p) return;
    if (p.falling > 0) {
      // Shrink into the hole rather than just vanishing.
      const t = 1 - p.falling / 24;
      const size = Math.max(2, Math.round(16 * (1 - t)));
      const x = Math.round(ox + p.x / SUB + SPRITE_OX + (16 - size) / 2);
      const y = Math.round(oy + p.y / SUB + SPRITE_OY + (16 - size) / 2);
      this.fillRect(x, y, size, size, 2);
      return;
    }
    if (p.iframes > 0 && Math.floor(game.frame / 3) % 2 === 0) return;

    const facingSide = p.dir === 'left' || p.dir === 'right';
    const attacking = p.swing > 0 || p.spin > 0;
    const dir = attacking ? p.swingDir : p.dir;
    const side = dir === 'left' || dir === 'right';
    const pose = attacking
      ? (side ? SUMMER.attackSide : dir === 'up' ? SUMMER.attackUp : SUMMER.attackDown)
      : (facingSide ? SUMMER.side : p.dir === 'up' ? SUMMER.up : SUMMER.down);
    const frame = attacking || !p.moving ? pose[0] : pose[Math.floor(p.anim / 8) % pose.length];
    const lift = jumpHeight(p);

    const x = Math.round(ox + p.x / SUB + SPRITE_OX);
    const y = Math.round(oy + p.y / SUB + SPRITE_OY - lift);

    if (lift > 0) {
      // A shadow sells the height; without it a jump reads as a glide.
      this.sprite(
        ['..####..', '.######.', '..####..'],
        Math.round(ox + p.x / SUB + (HB_W - 8) / 2),
        Math.round(oy + p.y / SUB + HB_H - 3),
        { solid: 2 },
      );
    }
    this.sprite(frame, x, y, { flipX: dir === 'right' });
  }

  /** The text box: three lines, revealed a glyph at a time. */
  drawDialogue(game) {
    const top = SCREEN_H - 46;
    this.fillRect(0, top, SCREEN_W, 46, 3);
    this.box(3, top + 3, SCREEN_W - 6, 40, 0);
    visibleLines(game.dialogue).forEach((line, i) => {
      this.text(line, 9, top + 9 + i * 10, 0);
    });
    if (pageComplete(game.dialogue) && Math.floor(game.frame / 16) % 2 === 0) {
      this.sprite(['0000', '.000.', '..0..'], SCREEN_W - 16, top + 34);
    }
  }

  drawHud(game) {
    this.fillRect(0, 0, SCREEN_W, HUD_H, 3);
    const p = game.player;
    if (!p) return;
    const max = game.progress.maxHp;
    // One heart left is the only number a player needs read off a glance, so
    // the last one blinks. Everything above that just sits there.
    const critical = p.hp > 0 && p.hp <= 2 && Math.floor(game.frame / 12) % 2 === 0;
    for (let i = 0; i < max / 2; i += 1) {
      const filled = p.hp - i * 2;
      if (critical && i === 0) continue;
      const art = filled >= 2 ? FULL_HEART : filled === 1 ? HALF_HEART : EMPTY_HEART;
      this.sprite(art, 3 + i * 8, 4, { solid: 0 });
    }

    const boss = game.boss;
    if (boss && boss.alive) {
      // A boss bar, drawn in the same band, because there is nowhere else.
      const w = 52;
      const x = SCREEN_W - w - 4;
      this.box(x, 4, w, 7, 0);
      const fill = Math.round(((w - 4) * boss.hp) / boss.maxHp);
      this.fillRect(x + 2, 6, fill, 3, boss.shell ? 1 : 0);
      return;
    }

    // Keys only matter inside a dungeon, so they only show inside one.
    const dungeon = dungeonOf(game.room.id);
    if (!dungeon) return;
    this.sprite(KEY, 120, 4, { solid: 0 });
    this.text(String(game.progress.keys[dungeon]), 129, 5, 0);
    if (game.progress.bossKeys[dungeon]) {
      this.sprite(KEY, 142, 4, { solid: 1 });
      this.box(140, 2, 12, 12, 0);
    }
  }

  // --- output ---------------------------------------------------------------

  present() {
    const data = this.image.data;
    for (let i = 0; i < this.buf.length; i += 1) {
      const c = RGBA[this.buf[i]];
      const o = i * 4;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
    this.smallCtx.putImageData(this.image, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.small, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** Sizes the visible canvas to the largest whole-number multiple that fits. */
  fit(availW, availH) {
    const scale = Math.max(1, Math.floor(Math.min(availW / SCREEN_W, availH / SCREEN_H)));
    this.canvas.width = SCREEN_W * scale;
    this.canvas.height = SCREEN_H * scale;
    this.canvas.style.width = `${SCREEN_W * scale}px`;
    this.canvas.style.height = `${SCREEN_H * scale}px`;
    this.ctx.imageSmoothingEnabled = false;
    return scale;
  }
}

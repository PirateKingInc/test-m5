// Keyboard and touch, flattened into the same button bitmask the simulation
// takes. A d-pad and two buttons, plus Start - nothing else is wired up.

import { BTN } from '../game/game.js';

const KEYS = {
  ArrowUp: BTN.UP, KeyW: BTN.UP,
  ArrowDown: BTN.DOWN, KeyS: BTN.DOWN,
  ArrowLeft: BTN.LEFT, KeyA: BTN.LEFT,
  ArrowRight: BTN.RIGHT, KeyD: BTN.RIGHT,
  KeyZ: BTN.A,
  KeyX: BTN.B,
  Enter: BTN.START,
};

export class Input {
  constructor() {
    this.keyBits = 0;
    this.touchBits = 0;
    /** Set on the first real input, so audio can start inside a gesture. */
    this.engaged = false;
    this.onEngage = null;
  }

  get buttons() {
    return this.keyBits | this.touchBits;
  }

  engage() {
    if (this.engaged) return;
    this.engaged = true;
    this.onEngage?.();
  }

  attachKeyboard(target = window) {
    target.addEventListener('keydown', (e) => {
      const bit = KEYS[e.code];
      if (bit === undefined) return;
      e.preventDefault();
      this.keyBits |= bit;
      this.engage();
    });
    target.addEventListener('keyup', (e) => {
      const bit = KEYS[e.code];
      if (bit === undefined) return;
      e.preventDefault();
      this.keyBits &= ~bit;
    });
    target.addEventListener('blur', () => { this.keyBits = 0; });
  }

  /**
   * Binds the on-screen controls. Every pad element carries data-btn; touches
   * are tracked by identifier so sliding a thumb across the d-pad works and a
   * lifted finger never leaves a direction stuck on.
   */
  attachTouch(root) {
    const pads = [...root.querySelectorAll('[data-btn]')];
    const bitOf = (el) => BTN[el.dataset.btn];
    const active = new Map();

    const hitTest = (touch) => {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const pad = el?.closest?.('[data-btn]');
      return pad && pads.includes(pad) ? bitOf(pad) : 0;
    };

    const recompute = () => {
      let bits = 0;
      for (const b of active.values()) bits |= b;
      this.touchBits = bits;
    };

    const onStartOrMove = (e) => {
      for (const t of e.changedTouches) active.set(t.identifier, hitTest(t));
      recompute();
      if (this.touchBits) {
        this.engage();
        e.preventDefault();
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) active.delete(t.identifier);
      recompute();
    };

    root.addEventListener('touchstart', onStartOrMove, { passive: false });
    root.addEventListener('touchmove', onStartOrMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);

    // Mouse, so the on-screen pad is usable on a desktop too.
    for (const pad of pads) {
      pad.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.touchBits |= bitOf(pad);
        this.engage();
      });
    }
    window.addEventListener('mouseup', () => { this.touchBits = 0; });
  }
}

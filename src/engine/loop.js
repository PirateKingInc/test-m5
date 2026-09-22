// A fixed 60 Hz timestep with an accumulator. The simulation only ever advances
// in whole ticks; a slow frame runs several, a fast one runs none. Rendering is
// free to happen as often as the browser likes.

export const TICK_MS = 1000 / 60;
const MAX_CATCHUP = 5; // never simulate more than this in one animation frame

export class Loop {
  /**
   * @param {(frame: number) => void} tick advance the simulation one step
   * @param {() => void} render draw the current state
   */
  constructor(tick, render) {
    this.tick = tick;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.frames = 0;
    this.running = false;
    this.raf = null;
  }

  start(now = 0) {
    if (this.running) return;
    this.running = true;
    this.last = now;
    this.acc = 0;
    const step = (t) => {
      if (!this.running) return;
      this.acc += Math.min(t - this.last, TICK_MS * MAX_CATCHUP);
      this.last = t;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        this.frames += 1;
        this.tick(this.frames);
      }
      this.render();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop() {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}

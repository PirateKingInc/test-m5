// Just enough of the canvas API for the renderer to run headless in CI.
// It records nothing clever - the point is that `Renderer.buf`, the index
// buffer the game actually draws into, can be inspected after a frame.

export function installFakeDom() {
  const make = (w = 0, h = 0) => ({
    width: w,
    height: h,
    style: {},
    getContext: () => ({
      imageSmoothingEnabled: true,
      createImageData: (iw, ih) => ({
        width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4),
      }),
      putImageData() {},
      drawImage() {},
    }),
  });
  globalThis.document = { createElement: () => make() };
  return make;
}

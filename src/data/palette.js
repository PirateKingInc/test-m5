// The Brackenfall palette: four colours, index 0 lightest, index 3 darkest.
// Nothing in this game may write a colour that is not one of these four.
export const PALETTE = ['#dfeedb', '#78a68c', '#2f5245', '#0b1310'];

// Convenience names used by the renderer so call sites read as intent, not index.
export const LIGHT = 0;
export const MID = 1;
export const DARK = 2;
export const INK = 3;

// The transparent marker used in every pixel-string in src/data.
export const CLEAR = '.';

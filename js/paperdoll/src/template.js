// The body template: landmarks, body outlines, and the seams garments are built against.
// Everything is in template coordinates: x from the centerline (right half positive), y down.
// The rig applies the default proportions and all body sliders on top of this.
import { lin } from './geom.js';

// Landmark heights.
export const Y = {
  crown: 72, brow: 175, eye: 196, mouth: 251, chin: 280.5, neck: 300, shoulder: 334, armpit: 395,
  bust: 418, underbust: 455, waist: 525, hip: 650, crotch: 690, midThigh: 806, knee: 1010,
  calf: 1110, ankle: 1392, sole: 1446,
};

// ---- body outlines ----------------------------------------------------------
// Half outline of neck + torso (centerline to centerline).
export const TORSO = [
  [0, 250], [21, 250, 1], [21.5, 280], [27, 300], [56, 312], [84, 322], [95, 334, 1], [85, 365],
  [75, 394, 1], [74, 440], [66, 490], [58, 525], [64, 560], [79, 600], [91, 645], [92, 700, 1], [0, 700],
];
// Arms are held behind the back: the upper arm hangs beside the torso, the forearm tucks in behind
// the waist. The arm is drawn behind the body and tucks under the torso at the armpit, so only
// its outer part shows.
export const ARM = [
  [88, 326], [99, 334], [112, 362], [117, 420], [118, 480], [115, 525], [108, 558], [94, 585], [76, 606],
  [55, 622, 1], [40, 590, 1], [58, 566], [72, 542], [75, 510], [73, 460], [70, 400, 1], [80, 362],
];
// Seven-line face: straight sides to the eyes, a soft slant from eyes to mouth, a wide V to the chin.
export const FACE = [
  [0, 72], [34, 76], [57, 96], [67, 135], [68, 170], [67.5, 192], [60.5, 210], [53.5, 228], [50, 238],
  [46, 246.5], [40.5, 254], [32.5, 261], [21, 269], [9.5, 276], [3, 279.6], [0, 280.5],
];
const LEG = [ // y, inner edge, outer edge
  [690, 2, 93], [760, 3, 93], [840, 5, 89], [920, 8, 80], [985, 11, 70], [1015, 12, 67],
  [1050, 12, 67.5], [1110, 9, 72], [1200, 12, 66], [1290, 18, 55], [1360, 21.5, 49.5], [1396, 22, 50],
];

// ---- profiles: body edge positions by height ---------------------------------
const legInner = lin(LEG.map(r => [r[0], r[1]])), legOuter = lin(LEG.map(r => [r[0], r[2]]));
/** [inner x, outer x] of one leg at height y (690..1396). */
export const legAt = y => [legInner(y), legOuter(y)];
/** Half-width of the torso at height y (395..700). */
export const torsoSide = lin([[395, 75], [440, 74], [490, 66], [525, 58], [560, 64], [600, 79], [645, 91], [700, 92]]);
/** Outer edge of the upper arm at height y (334..558). */
export const armOuter = lin([[334, 99], [362, 112], [420, 117], [480, 118], [525, 115], [558, 108]]);
/** Height of the shoulder line at distance x from the centerline (21..99). */
export const shoulderY = lin([[21, 298], [27, 300], [56, 312], [84, 322], [99, 333]]);

const LEG_YS = LEG.map(r => r[0]);
const TORSO_YS = [395, 440, 490, 525, 560, 600, 645, 700];
const between = (ys, y0, y1) => [y0, ...ys.filter(y => y > y0 + 8 && y < y1 - 8), y1];
const ease = (e, y) => (typeof e === 'function' ? e(y) : e || 0);

/** Points down the torso side from y0 to y1, pushed out by e (number or function of y). */
export function sideRun(y0, y1, e) {
  return between(TORSO_YS, y0, y1).map(y => [torsoSide(y) + ease(e, y), y]);
}
/** Points down the outside of a leg from y0 to y1, pushed out by e. */
export function legOuterRun(y0, y1, e) {
  return between(LEG_YS, y0, y1).map(y => [legOuter(y) + ease(e, y), y]);
}
/** Points up the inside of a leg from y1 to y0, pushed in by e (never past the centerline). */
export function legInnerRun(y1, y0, e) {
  return between(LEG_YS, y0, y1).reverse().map(y => [Math.max(0.5, legInner(y) - ease(e, y)), y]);
}
/** Closed outline of one leg between two heights, with ease. Skin-tight legwear reuses it. */
export function legPts(y0, y1, e) {
  const outer = legOuterRun(y0, y1, e), inner = legInnerRun(y1, y0, e);
  outer[0][2] = outer[outer.length - 1][2] = inner[0][2] = inner[inner.length - 1][2] = 1;
  return outer.concat(inner);
}

// ---- seams: where garment parts meet -----------------------------------------
// Sleeves are drawn behind the bodice, so any sleeve fits any bodice as long as the bodice
// uses ARMHOLE and the sleeve reaches inside it.
export const SEAM = {
  neckSide: [26, 300],                               // where a close neckline meets the shoulder line
  shoulderTip: [99, 333],
  ARMHOLE: [[99, 333, 1], [89, 362], [81, 395, 1]],  // shoulder tip -> armpit
  waistY: 530, waistHalf: 60,                        // where bottoms start; tops tuck in here
  bust: [40, 418],                                   // bust center (right side)
  bow: [0, 412],                                     // chest anchor for ribbons and ties
};

/** Under-bust shadow and fold line for any bodice. clip = id of the bodice shape, ch = its channel. */
export function bustShading(clip, ch, layer, fit = 'loose') {
  const clamp = v => Math.min(1, Math.max(0, v));
  return [
    {
      layer, mirror: true, fit, clip, soft: true, fill: ch + '.shadow',
      opacity: st => clamp(0.2 + 0.8 * (st.P.bust + 1) / 2),
      pts: [[9, 424, 1], [21, 446], [42, 455], [63, 448], [78, 426, 1], [65, 434], [42, 438], [24, 433]],
    },
    {
      layer, mirror: true, fit, clip, closed: false, line: ch, sw: 1.3,
      opacity: st => clamp(0.45 * (st.P.bust + 0.6)),
      pts: [[40, 455.5], [54, 453.5], [66, 447], [75, 435]],
    },
  ];
}

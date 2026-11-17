// Tops are assembled from parts: neckline x sleeves x length x fit.
// The bodice uses SEAM.ARMHOLE and sleeves are drawn behind it, so every sleeve fits every bodice.
import { register } from '../registry.js';
import { ellipse, offsetPoly } from '../geom.js';
import { SEAM, ARM, sideRun, armOuter, shoulderY, bustShading } from '../template.js';

export const HEM = { crop: 478, waist: 548, hip: 570, tunic: 640 };
const SLEEVE_CUT = { cap: 374, short: 447, elbow: 512, puff: 440, bell: 512, rolled: 505 };
const SLEEVE_EASE = { tight: 2.5, regular: 6, loose: 9, oversized: 12 };
// A puff is gathered at the seam and again at the cuff, so its ease changes down the arm:
// about 13 through the upper arm, narrowing to 5 at the cuff so the cloth gathers into it.
const clamp01 = t => Math.max(0, Math.min(1, t));
const puffEase = y => 5 + 10 * clamp01((y - 321) / 60) * clamp01((444 - y) / 24);
// A bell sleeve hangs straight from the shoulder and flares from the elbow down.
const bellEase = y => 4 + 15 * clamp01((y - 400) / 106);

// Ease at the side seam. Regular and loose tops do not hug the waist.
function sideEase(fit) {
  if (fit === 'tight') return 1.5;
  const base = fit === 'oversized' ? 14 : fit === 'loose' ? 10 : 5;
  const relax = fit === 'oversized' ? 13 : fit === 'loose' ? 9 : 3;
  return y => base + relax * Math.exp(-(((y - 525) / 45) ** 2));
}

// Each neckline gives the bodice edge from the centerline to the shoulder line, plus extra shapes.
// extra({ L, fit, hem }) returns shapes; 'body' is the bodice id they can clip to.
const NECKLINES = {
  crew: { pts: [[0, 310], [12, 306], [23, 300, 1]] },
  // Cut to the bust line, so the opening shows cleavage rather than a hint of collarbone.
  v: { pts: [[0, 432, 1], [28, 300, 1]] },
  scoop: { pts: [[0, 426], [28, 396], [50, shoulderY(50), 1]] },
  square: { pts: [[0, 420, 1], [57, 420, 1], [59, shoulderY(59), 1]] },
  // Halfway down the sternum (clavicle 330 to underbust 455), wide on the shoulders.
  boat: { pts: [[0, 388], [44, 386], [74, shoulderY(74), 1]] },
  // Sweetheart: one rounded lobe over each breast, highest over the bust centre (x 40), with a
  // point at the centreline. Peaked too near the centreline it reads as an M between the breasts.
  sweetheart: {
    band: true,
    pts: [[0, 406, 1], [14, 394], [30, 380], [42, 376], [54, 384], [64, 398], [70, 410, 1]],
  },
  peter_pan: {
    // Starts from the boat neckline, flaps and all: the opening is as wide and as deep as `boat`.
    pts: [[0, 388], [44, 386], [74, shoulderY(74), 1]],
    // Two thin bands traced along the neckline itself, from beside the centre out to the shoulder,
    // so the collar hugs the opening. Offset straight down by the band thickness: perpendicular on
    // the flat run, close enough on the rise to the shoulder.
    extra: ({ L, fit }) => {
      const edge = [[6, 388], [30, 387], [50, 384], [64, 365], [72, 328]];
      const t = 12;   // band thickness; the flap already spans the whole neckline
      const flap = [...edge.map(([x, y]) => [x, y + 1]), ...edge.slice().reverse().map(([x, y]) => [x, y + 1 + t])];
      return [
        { layer: L, mirror: true, fit, clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.5, offset: [1, 2], pts: flap },
        { layer: L, mirror: true, fit, clip: 'body', fill: 'trim', line: 'trim', sw: 1.2, pts: flap },
      ];
    },
  },
  // The two below are strapless: the bodice stops below the shoulder line, so there is no armhole
  // seam and no shoulder run. `straps` adds two thin bands up over the shoulder.
  off_shoulder: { band: true, pts: [[0, 344], [24, 342], [50, 348], [70, 360], [78, 382, 1]] },
  straps: {
    band: true,
    pts: [[0, 366], [20, 362], [42, 368], [58, 378], [64, 398, 1]],
    // No clip: a strap rises above the bodice, and clipping it to the bodice removed it entirely.
    extra: ({ L, fit }) => [
      { layer: L, mirror: true, fit, fill: 'main', line: 'main', sw: 1.2, pts: [[20, 364], [26, 340], [34, 318], [39, 302], [31, 302], [22, 336], [13, 362]] },
    ],
  },
  turtleneck: {
    pts: [[0, 318], [15, 314], [27, 300, 1]],
    extra: ({ L, fit }) => [
      { layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 264], [21, 266, 1], [24, 296], [31, 307, 1], [16, 318], [0, 321]] },
      { layer: L, fit, closed: false, line: 'main', sw: 1.2, opacity: 0.5, pts: [[-21, 286], [0, 290], [21, 286]] },
    ],
  },
  collar: {
    pts: [[0, 342, 1], [25, 300, 1]],
    extra: ({ L, fit, hem }) => {
      const wing = [[24, 297, 1], [40, 304], [45, 332, 1], [22, 333], [3, 341, 1], [1, 335, 1]];
      const out = [
        { layer: L, mirror: true, fit, clip: 'body', soft: true, fill: 'main.shadow', offset: [2, 5], pts: wing },
        { layer: L, fit, closed: false, line: 'main', sw: 1.2, opacity: 0.7, pts: [[0, 342], [0, hem + 6]] },
        { layer: L, mirror: true, fit, fill: 'main', line: 'main', pts: wing },
      ];
      for (let y = 366; y < hem - 12; y += 46) {
        out.push({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 1, pts: ellipse(0, y, 2.6, 2.6, 8) });
      }
      return out;
    },
  },
  sailor: {
    pts: [[0, 398, 1], [26, 300, 1]],
    extra: ({ L, fit }) => {
      const collar = [[24, 299, 1], [52, 306], [83, 325, 1], [60, 362], [31, 393], [5, 416, 1], [0, 400, 1]];
      return [
        { layer: L, mirror: true, fit, clip: 'body', soft: true, fill: 'main.shadow', offset: [3, 7], pts: collar },
        { id: 'collar', layer: L, mirror: true, fit, fill: 'trim', line: 'trim', pts: collar },
        { layer: L, mirror: true, fit, clip: 'collar', closed: false, stroke: 'accent', sw: 2.2, pts: [[75, 330], [56, 359], [28, 388], [3, 410]] },
      ];
    },
  },
  // A soft collar with a buttoned placket: the collar of a polo shirt rather than a dress shirt.
  polo: {
    pts: [[0, 402, 1], [22, 300, 1]],
    extra: ({ L, fit }) => {
      const wing = [[20, 299, 1], [40, 306], [44, 328, 1], [24, 330], [4, 344, 1], [2, 330, 1]];
      return [
        { layer: L, mirror: true, fit, clip: 'body', soft: true, fill: 'main.shadow', offset: [2, 4], pts: wing },
        { layer: L, mirror: true, fit, fill: 'main', line: 'main', pts: wing },
        // Placket down the V, with two buttons.
        { layer: L, mirror: true, fit, closed: false, line: 'main', sw: 1.1, opacity: 0.7, pts: [[6, 340], [7, 402]] },
        ...[[352], [380]].map(([y]) => ({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 1, pts: ellipse(6, y, 2.4, 2.4, 8) })),
        { layer: L, fit, closed: false, line: 'main', sw: 1.2, pts: [[0, 402], [0, 340]] },
      ];
    },
  },
  // A short stand collar: the neckline of a crew, with a band standing up round the neck.
  mandarin: {
    pts: [[0, 310], [12, 306], [23, 300, 1]],
    extra: ({ L, fit }) => [
      { layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 276], [19, 278, 1], [23, 296], [27, 306, 1], [15, 314], [0, 316]] },
      { layer: L, sym: true, fit, closed: false, line: 'main', sw: 1.1, opacity: 0.6, pts: [[-19, 284], [0, 288], [19, 284]] },
      { layer: L, fit, closed: false, line: 'main', sw: 1.2, pts: [[0, 278], [0, 316]] },
    ],
  },
  // Halter: sleeveless, the bodice edge running up to two straps that meet the neck. A band
  // neckline, like `straps`, so the shoulder is left bare.
  halter: {
    band: true,
    pts: [[0, 392, 1], [26, 386], [46, 378], [60, 380, 1]],
    extra: ({ L, fit }) => [
      { layer: L, mirror: true, fit, fill: 'main', line: 'main', pts: [[22, 384], [30, 336], [26, 306], [33, 302], [38, 338], [32, 386]] },
    ],
  },
};

function bodicePts(o, hem) {
  const neck = NECKLINES[o.neckline].pts, band = NECKLINES[o.neckline].band;
  // A band neckline ends on the body below the shoulder, so it takes neither the armhole seam nor
  // the run between the shoulder tip and the armhole.
  const armhole = band ? [] : o.sleeves === 'none' ? [[93, 330, 1], [84, 362], [79, 397, 1]] : SEAM.ARMHOLE;
  const from = neck[neck.length - 1][0];
  const shoulder = band ? [] : [[55, 311], [86, 322]].filter(p => p[0] > from + 8 && p[0] < armhole[0][0] - 5);
  const side = sideRun(432, hem, sideEase(o.fit));
  const w = side[side.length - 1][0];
  side[side.length - 1][2] = 1;
  // A band bodice has to reach the torso side before the side run starts, or the armpit gap shows
  // the body through the top.
  const lead = band ? sideRun(400, 432, sideEase(o.fit)) : [];
  return { pts: [...neck, ...shoulder, ...armhole, ...lead, ...side, [w * 0.6, hem + 5], [0, hem + 7]], side, w };
}

/**
 * The open end of a short sleeve: inner and outer x at height y, with the middle dipping 8 below.
 * Exported because a trim drawn at the cuff has to end where the sleeve does -- guessed coordinates
 * put a white tab on the inside half of a puff and left the rest of the opening bare.
 */
export function sleeveEnd(kind, ease) {
  const yc = SLEEVE_CUT[kind], E = typeof ease === 'function' ? ease : () => ease;
  const ox = armOuter(yc) + E(yc), ix = yc < 400 ? 84 : 74;
  return { y: yc, ox, ix, mx: (ox + ix) / 2 };
}
export const puffEaseOf = y => puffEase(y);

/** Sleeve shapes for a given length; reused by dresses and outerwear. */
export function sleeveShapes(kind, { layer = 'sleeve', ch = 'main', ease = 6, cuff = false } = {}) {
  if (kind === 'none') return [];
  if (kind === 'long') {
    return [
      { id: 'sleeve', layer, mirror: true, part: 'arm', fill: ch, line: ch, pattern: true, pts: offsetPoly(ARM, ease) },
      { layer, mirror: true, part: 'arm', closed: false, line: ch, sw: 1.2, opacity: 0.5, pts: [[112 + ease, 530], [100, 522], [92, 528]] },
    ];
  }
  const { y: yc, ox, ix, mx } = sleeveEnd(kind, ease);
  const E = typeof ease === 'function' ? ease : () => ease;
  const run = [362, 410, 470].filter(y => y < yc - 8).map(y => [armOuter(y) + E(y), y]);
  const pts = [[86, 321, 1], [97 + E(332), 332], ...run, [ox, yc, 1], [mx, yc + 8], [ix, yc, 1]];
  if (yc >= 400) pts.push([72, 400]);
  pts.push([84, 360]);
  const out = [
    {
      layer: 'armShade', mirror: true, part: 'arm', clip: '@arm', soft: true, fill: '@skin.shadow',
      pts: [[ox + 2, yc - 1, 1], [mx, yc + 7], [ix - 2, yc - 1, 1], [ix - 2, yc + 14, 1], [mx, yc + 24], [ox + 3, yc + 16, 1]],
    },
    { id: 'sleeve', layer, mirror: true, part: 'arm', fill: ch, line: ch, pattern: true, pts },
  ];
  if (yc > 400) {
    out.push({
      layer, mirror: true, part: 'arm', clip: 'sleeve', soft: true, fill: ch + '.shadow',
      pts: [[70, yc + 6, 1], [70, 380, 1], [88, 392], [92, (392 + yc) / 2], [93, yc + 6, 1]],
    });
  }
  if (kind === 'puff') {
    // The gathered cuff: a band of the same cloth following the hem, and the gather line above it.
    out.push({
      layer, mirror: true, part: 'arm', clip: 'sleeve', fill: ch + '.shadow', line: ch, sw: 1,
      pts: [[ox, yc, 1], [mx, yc + 8], [ix, yc, 1], [ix, yc - 9, 1], [mx, yc - 2], [ox, yc - 9, 1]],
    });
    out.push({ layer, mirror: true, part: 'arm', closed: false, line: ch, sw: 1.1, opacity: 0.65, pts: [[ox - 1, yc - 11], [mx, yc - 3.5], [ix + 1, yc - 11]] });
  }
  if (kind === 'rolled') {
    // The hem turned back on itself: a band of the same cloth folded up over the sleeve, with the
    // crease above it. Elbow length, so it reads as a sleeve pushed up rather than a cuff.
    out.push({ layer, mirror: true, part: 'arm', clip: 'sleeve', fill: ch + '.shadow', line: ch, sw: 1.1, pts: [[ox, yc, 1], [mx, yc + 8], [ix, yc, 1], [ix + 0.5, yc - 16, 1], [mx, yc - 8], [ox - 0.5, yc - 16, 1]] });
    out.push({ layer, mirror: true, part: 'arm', clip: 'sleeve', closed: false, line: ch, sw: 1.2, opacity: 0.55, pts: [[ox - 1, yc - 18], [mx, yc - 10], [ix + 1, yc - 18]] });
  }
  if (cuff) {
    out.push({
      layer, mirror: true, part: 'arm', fill: 'trim', line: 'trim',
      pts: [[ox, yc, 1], [mx, yc + 8], [ix, yc, 1], [ix + 0.5, yc - 11, 1], [mx, yc - 3], [ox - 0.5, yc - 11, 1]],
    });
    out.push({ layer, mirror: true, part: 'arm', closed: false, stroke: 'accent', sw: 1.6, pts: [[ox - 0.3, yc - 5.5], [mx, yc + 2.5], [ix + 0.3, yc - 5.5]] });
  }
  return out;
}

/** Bodice + neckline + sleeves. L is the bodice layer; hem overrides the length table. */
export function topShapes(o, { L = 'top', hem = HEM[o.length], castOn = null } = {}) {
  const fit = o.fit === 'tight' ? 'skin' : 'loose';
  const { pts, side, w } = bodicePts(o, hem);
  const S = sleeveShapes(o.sleeves, {
    ease: o.sleeves === 'puff' ? puffEase : o.sleeves === 'bell' ? bellEase : SLEEVE_EASE[o.fit],
    cuff: o.neckline === 'sailor',
  });
  // Shadow the hem casts on whatever is worn below.
  if (castOn) {
    S.push({
      layer: L, sym: true, fit, clip: castOn, soft: true, fill: '^.deep', opacity: 0.85,
      pts: [[0, hem - 12], [w + 4, hem - 16, 1], [w + 6, hem + 8, 1], [w * 0.6, hem + 16], [0, hem + 18]],
    });
  }
  S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts });
  // Rim shadow down the right side (light comes from the upper left).
  S.push({
    layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow',
    pts: [[83, 395, 1], ...side.map(p => [p[0] + 2, p[1]]), [w - 13, hem + 4, 1], ...side.slice().reverse().map(p => [p[0] - 9, p[1]])],
  });
  S.push(...bustShading('body', 'main', L, fit));
  const extra = NECKLINES[o.neckline].extra;
  if (extra) S.push(...extra({ L, fit, hem }));
  return S;
}

export function topCovers(o, hem = HEM[o.length]) {
  const c = [{ target: 'torso', y: [410, Math.min(hem - 12, 685)] }];
  if (o.sleeves !== 'none') c.push({ target: 'arm', y: [350, (SLEEVE_CUT[o.sleeves] || 600) - 14] });
  return c;
}

export const TOP_OPTIONS = {
  neckline: Object.keys(NECKLINES),
  sleeves: ['none', 'cap', 'short', 'puff', 'elbow', 'rolled', 'bell', 'long'],
  fit: ['tight', 'regular', 'loose', 'oversized'],
};

register({
  id: 'top', slot: 'top', label: 'shirt, blouse, T-shirt, sweater', tags: ['modern', 'school'],
  channels: { main: '#ffffff', trim: '#2c3760', accent: '#ffffff' },
  options: { ...TOP_OPTIONS, length: Object.keys(HEM) },
  flags: { tucked: false },
  defaults: { neckline: 'crew', sleeves: 'short', fit: 'regular', length: 'hip' },
  notes: 'trim = sailor collar and cuffs; accent = their stripe, and shirt buttons',
  presets: {
    t_shirt: { neckline: 'crew', sleeves: 'short' },
    tank_top: { neckline: 'scoop', sleeves: 'none', fit: 'tight' },
    camisole: { neckline: 'scoop', sleeves: 'none', fit: 'tight' },
    blouse: { neckline: 'collar', sleeves: 'short' },
    shirt: { neckline: 'collar', sleeves: 'long' },
    dress_shirt: { neckline: 'collar', sleeves: 'long', tucked: true },
    sailor_top: { neckline: 'sailor', sleeves: 'short' },
    sailor_uniform: { neckline: 'sailor', sleeves: 'short' },
    sweater: { neckline: 'crew', sleeves: 'long', fit: 'loose' },
    turtleneck: { neckline: 'turtleneck', sleeves: 'long', fit: 'tight' },
    crop_top: { neckline: 'crew', sleeves: 'short', length: 'crop', fit: 'tight' },
    pajama_top: { neckline: 'crew', sleeves: 'long', fit: 'loose' },
    gym_shirt: { neckline: 'crew', sleeves: 'short', fit: 'loose' },
    polo_shirt: { neckline: 'collar', sleeves: 'short' },
    long_sleeve_tee: { neckline: 'crew', sleeves: 'long' },
    rash_guard: { neckline: 'crew', sleeves: 'long', fit: 'tight' },
    cover_up: { neckline: 'boat', sleeves: 'short', fit: 'oversized', length: 'tunic' },
    tube_top: { neckline: 'straps', sleeves: 'none', fit: 'tight', length: 'crop' },
    off_shoulder_top: { neckline: 'off_shoulder', sleeves: 'none', fit: 'tight' },
    polo_top: { neckline: 'peter_pan', sleeves: 'short' },
  },
  covers: o => topCovers(o),
  view: [100, 250, 400, 430],
  build(o, ctx) {
    const tucked = o.tucked && ctx.has('bottom');
    return topShapes(o, { L: tucked ? 'topTucked' : 'top', castOn: !tucked && ctx.has('bottom') ? '@bottom' : null });
  },
});

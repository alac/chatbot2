// Japanese garments. The yukata is the exemplar: crossed collar, obi, and sleeves on the `sleeve`
// layer so they sit behind the torso and hide the arms.
//
// A yukata is a dress in the wardrobe's terms: it fills the top and bottom slots. It keeps the body
// warp like every other garment (the owner's call), so the cloth follows the chest instead of
// flattening it, which is a different read from a real yukata and the one we want here.
//
// Everything in this family shares the collar: one bent path per panel, drawn `flat` so stiff cloth
// keeps straight edges, over a placket of the same cloth that hides the robe's own warped neckline.
import { register } from '../registry.js';
import { SEAM, sideRun, legOuterRun, legInnerRun, legAt, bustShading } from '../template.js';

const CROSS = 430;         // where the collar crosses, mid-chest
const NECK = [26, 300];    // the V starts at the side of the neck, like a sailor collar's does
const V0 = [0, CROSS], V1 = NECK;
const vLen = Math.hypot(V1[0] - V0[0], V1[1] - V0[1]);
const vN = [(V1[1] - V0[1]) / -vLen, (V1[0] - V0[0]) / vLen];   // unit normal, pointing into the cloth
const dir = [(V0[0] - V1[0]) / vLen, (V0[1] - V1[1]) / vLen];   // down the V, past the crossing

// Collar parts are offsets from the V edge's normal, so they are built from that one line.
const down = (t, d) => [V0[0] + vN[0] * t + dir[0] * d, V0[1] + vN[1] * t + dir[1] * d];
const up = t => V1.map((c, i) => c + vN[i] * t);
const D = 62;   // how far past the crossing a collar runs before the obi takes over

/** One collar band: up the V edge, round the crossing, on into the obi. */
const band = (inner, outer, fill) => ({
  layer: 'dress', fit: 'flat', fill,
  pts: [up(outer), down(outer, 0), down(outer, D), down(inner, D), down(inner, 0), up(inner)],
});

/**
 * The collar stack for a robe. `bands` is a list of [innerOffset, outerOffset, fill] from the opening
 * outwards; the first is the pale under-collar. `placket` is how far the flat cloth under them reaches.
 */
function collarStack(bands, placket = 46) {
  const S = [
    // The robe's own neckline is warped, so it bows at large sizes. This placket is the same cloth,
    // unwarped, reaching from just inside the opening out past the collar: it hides the warped edge
    // and its straight inner line is what you see, which is what keeps the V straight.
    { layer: 'dress', mirror: true, fit: 'flat', fill: 'main',
      pts: [up(-5), down(-5, 0), down(-5, D + 6), down(placket, D + 6), down(placket, 0), up(placket)] },
  ];
  // Both panels' collars continue past the crossing; the front one is drawn again on top, which is
  // what decides which goes over.
  bands.forEach(([inner, outer, fill]) => S.push({ ...band(inner, outer, fill), mirror: true }));
  S.push({ layer: 'dress', fit: 'flat', clip: 'body', soft: true, fill: 'main.deep', opacity: 0.38,
    pts: [down(-9, 4), down(-1, 4), down(-1, D), down(-9, D)] });
  bands.forEach(([inner, outer, fill]) => S.push(band(inner, outer, fill)));
  const [, outerMost] = bands[bands.length - 1];
  S.push({ layer: 'dress', fit: 'flat', closed: false, line: 'main.hi', sw: 1, opacity: 0.5,
    pts: [up(outerMost), down(outerMost, 0), down(outerMost, D)] });
  return S;
}

/** The robe body: crossed-collar front, straight hem, no armhole scoop. */
function robeBody(hem) {
  const side = sideRun(CROSS, 700, 9);
  return {
    side,
    pts: [
      [0, CROSS], [V1[0], V1[1], 1], [56, 311], [84, 322], ...SEAM.ARMHOLE,
      ...side.slice(1), [101, 800], [102, 960], [100, 1120], [97, 1260], [96, hem, 1], [0, hem + 8],
    ],
  };
}

/** Kimono sleeves on the `sleeve` layer: behind the torso, over the arms, hand left inside. */
function robeSleeves(pts, ch = 'main', layer = 'sleeve') {
  // Bounds come from the outline itself: a sleeve shape is a polygon, not four numbers.
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const inner = Math.min(...xs), outer = Math.max(...xs), hem = Math.max(...ys);
  return [
    { id: 'sleeve', layer, mirror: true, fill: ch, line: ch, pattern: true, pts },
    { layer, mirror: true, clip: 'sleeve', soft: true, fill: ch + '.shadow', opacity: 0.5,
      pts: [[inner + 4, 330], [outer - 2, 350], [outer - 6, hem - 20, 1], [inner + 10, hem - 16, 1]] },
    { layer, mirror: true, clip: 'sleeve', closed: false, line: ch, sw: 1.2, opacity: 0.5,
      pts: [[inner + 8, 400], [outer - 8, 500], [outer - 12, hem - 20]] },
    { layer, mirror: true, clip: 'sleeve', soft: true, fill: ch + '.shadow', opacity: 0.5,
      pts: [[inner + 4, hem - 22, 1], [outer, hem - 22, 1], [outer, hem, 1], [inner + 4, hem + 2, 1]] },
  ];
}

register({
  id: 'yukata', slot: 'dress', blocks: ['top', 'bottom'],
  label: 'yukata, summer kimono', tags: ['japanese'],
  channels: { main: '#54658f', trim: '#c9a227', accent: '#f8f5ec' },
  notes: 'trim = the obi, accent = the under-collar and the obi cord',
  covers: () => [{ target: 'torso', y: [440, 690] }, { target: 'leg', y: [720, 1310] }],
  view: [60, 240, 480, 1180],
  build() {
    const L = 'dress', fit = 'loose', HEM = 1340;
    const { side, pts: body } = robeBody(HEM);
    const S = [...robeSleeves([[24, 312], [92, 316], [122, 344], [140, 660, 1], [40, 668, 1], [28, 430]])];
    S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main:v', line: 'main', pattern: true, pts: body });
    S.push(...collarStack([[0, 9, 'accent'], [9, 34, 'main.shadow']], 40));
    S.push(...bustShading('body', 'main', L, fit));
    S.push(...obi(L, fit, 496, 574));
    S.push({ layer: 'bodyShade', sym: true, fit: 'skirt', clip: '@leg', soft: true, fill: '@skin.shadow',
      pts: [[0, HEM - 24], [96, HEM - 26, 1], [96, HEM + 4, 1], [48, HEM + 16], [0, HEM + 20]] });
    S.push({ layer: L, fit, clip: 'body', closed: false, line: 'main', sw: 1.1, opacity: 0.4, pts: [[0, 600], [0, HEM + 6]] });
    return S;
  },
});

/** Obi: a plain band, no knot. The knot belongs at the back, so from the front it is a flat band with
 *  a cord across it. It has to reach the robe's own sides at that height. */
function obi(L, fit, top, bottom, { cord = 'accent' } = {}) {
  const side = sideRun(top + 4, bottom - 4, 9), w = side[side.length - 1][0];
  return [
    { id: 'obi', layer: L, sym: true, fit, fill: 'trim', line: 'trim', pts: [[0, top], ...side, [w, bottom, 1], [0, bottom]] },
    { layer: L, sym: true, fit, clip: 'obi', soft: true, fill: 'trim.shadow', opacity: 0.6,
      pts: [[0, top], ...side.map(([x, y]) => [x, Math.min(y, top + 14)]), [0, top + 12]] },
    { layer: L, sym: true, fit, clip: 'obi', closed: false, stroke: cord, sw: 2, pts: [[0, (top + bottom) / 2 - 4], [w - 2, (top + bottom) / 2 - 3]] },
    { layer: L, sym: true, fit, clip: 'obi', closed: false, line: 'trim', sw: 1, opacity: 0.5, pts: [[0, bottom - 18], [w - 2, bottom - 17]] },
  ];
}

register({
  id: 'kimono', slot: 'dress', blocks: ['top', 'bottom'],
  label: 'kimono, furisode', tags: ['japanese'],
  channels: { main: '#3d4a72', trim: '#b8455a', accent: '#f8f5ec' },
  notes: 'trim = the inner collar and the obi, accent = the under-collar and the obi cord',
  options: { sleeve: ['long', 'furisode'], length: ['ankle', 'trailing'] },
  defaults: { sleeve: 'long', length: 'ankle' },
  presets: { furisode: { sleeve: 'furisode' }, tomesode: { length: 'trailing' } },
  covers: o => [{ target: 'torso', y: [440, 690] }, { target: 'leg', y: [720, (o.length === 'trailing' ? 1400 : 1320)] }],
  view: [60, 240, 480, 1240],
  build(o) {
    const L = 'dress', fit = 'loose', HEM = o.length === 'trailing' ? 1430 : 1350;
    const { side, pts: body } = robeBody(HEM);
    const sleeve = o.sleeve === 'furisode'
      ? [[30, 312], [90, 316], [114, 340], [122, 980, 1], [48, 988, 1], [32, 430]]
      : [[24, 312], [92, 316], [120, 344], [132, 700, 1], [42, 706, 1], [28, 430]];
    const S = [...robeSleeves(sleeve)];
    S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main:v', line: 'main', pattern: true, pts: body });
    // Three layers, as a formal kimono has: pale under-collar, the juban's collar, then the kimono's.
    S.push(...collarStack([[0, 8, 'accent'], [8, 17, 'trim'], [15, 40, 'main.shadow']], 46));
    S.push(...bustShading('body', 'main', L, fit));
    S.push(...obi(L, fit, 486, 596));
    S.push({ layer: 'bodyShade', sym: true, fit: 'skirt', clip: '@leg', soft: true, fill: '@skin.shadow',
      pts: [[0, HEM - 24], [96, HEM - 26, 1], [96, HEM + 4, 1], [48, HEM + 16], [0, HEM + 20]] });
    S.push({ layer: L, fit, clip: 'body', closed: false, line: 'main', sw: 1.1, opacity: 0.4, pts: [[0, 600], [0, HEM + 6]] });
    return S;
  },
});

register({
  // `outer`, not `bottom`: a hakama is worn over a whole robe, and a dress occupies the bottom slot,
  // so as a bottom it could never be worn with the kimono it belongs to.
  id: 'hakama', slot: 'outer', label: 'hakama', tags: ['japanese'],
  channels: { main: '#8e2f42', trim: '#1f1c22', accent: '#e8dfc8' },
  notes: 'trim = the waist ties, accent = the cord across them',
  options: { cut: ['pleated', 'divided'] },
  defaults: { cut: 'pleated' },
  presets: { miko: { cut: 'pleated' } },
  covers: o => [{ target: 'torso', y: [500, 688] }, { target: 'leg', y: [712, 1300] }],
  view: [50, 440, 500, 980],
  build(o) {
    const L = 'outer', HEM = 1340, WAIST = 478;
    const W = 96;                       // half-width at the hem; hakama hang wide and straight
    const S = [];

    // Trousers: two legs, so the inner edge follows the leg and the centre is open below the crotch.
    // Pleated: one panel, the legs only hinted at by the pleats.
    if (o.cut === 'divided') {
      // The inner edge follows the leg, four units clear of it, so no skin shows up the inside.
      const cut = y => Math.max(1, legAt(y)[0] - 4);
      S.push({ id: 'hakama', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pattern: true,
        pts: [[14, 520], [62, 520], [92, 580], [100, 760], [W, HEM, 1], [cut(HEM), HEM, 1],
          ...[1180, 1040, 900, 780].map(y => [cut(y), y]), [cut(700), 700]] });
    } else {
      S.push({ id: 'hakama', role: 'main', layer: L, sym: true, fill: 'main:v', line: 'main', pattern: true,
        pts: [[0, 520], [62, 520], [92, 580], [100, 760], [W, HEM, 1], [0, HEM + 6]] });
    }

    // Pleats: straight folds from the waist to the hem, the thing that reads as hakama.
    for (let k = 1; k <= 4; k++) {
      const x0 = (62 * k) / 5, x1 = (W * k) / 5;
      S.push({ layer: L, mirror: true, clip: 'hakama', closed: false, line: 'main', sw: 1.3, opacity: 0.55,
        pts: [[x0, 522], [x1, HEM - 4]] });
      S.push({ layer: L, mirror: true, clip: 'hakama', soft: true, fill: 'main.shadow', opacity: 0.4,
        pts: [[x0 + 2, 524], [x1 + 2, HEM - 4, 1], [x1 - 8, HEM - 4, 1], [x0 - 6, 524]] });
    }

    // The waist: a high band with the ties across it. Higher than the obi it goes over.
    S.push({ id: 'ties', layer: L, sym: true, fill: 'trim', line: 'trim', pts: [[0, WAIST], [64, WAIST], [66, 522, 1], [0, 524]] });
    S.push({ layer: L, sym: true, clip: 'ties', closed: false, stroke: 'accent', sw: 2.4, pts: [[2, 500], [62, 501]] });
    S.push({ layer: L, sym: true, clip: 'ties', closed: false, line: 'trim', sw: 1, opacity: 0.5, pts: [[0, 490], [63, 491]] });

    S.push({ layer: 'bodyShade', sym: true, fit: 'skirt', clip: '@leg', soft: true, fill: '@skin.shadow',
      pts: [[0, HEM - 26], [W, HEM - 28, 1], [W, HEM + 2, 1], [0, HEM + 16]] });
    return S;
  },
});

register({
  id: 'haori', slot: 'outer', label: 'haori, happi coat', tags: ['japanese'],
  channels: { main: '#2f3a55', trim: '#c9a227' },
  notes: 'trim = the collar band and the sleeve hem',
  options: { length: ['hip', 'knee'] },
  defaults: { length: 'hip' },
  presets: { happi: { length: 'hip' } },
  covers: () => [],
  view: [40, 260, 520, 700],
  build(o) {
    const L = 'outer', fit = 'loose', hem = o.length === 'knee' ? 900 : 700;
    const side = sideRun(340, hem, 17), w = side[side.length - 1][0];
    side[side.length - 1][2] = 1;
    const S = [
      // Worn open: two panels, the robe's collar showing between them.
      { id: 'body', role: 'main', layer: L, mirror: true, fit, fill: 'main:v', line: 'main', pattern: true,
        pts: [[40, 306], [56, 311], [84, 322], [99, 333], ...side, [w * 0.55, hem + 6], [44, hem + 8, 1], [46, 470], [42, 360]] },
      // The lapel band, running the length of the front edge.
      { layer: L, mirror: true, fit, clip: 'body', fill: 'trim', line: 'trim', sw: 1,
        pts: [[40, 306], [56, 311], [58, 340], [58, 470], [60, hem + 8], [44, hem + 10], [46, 470], [42, 340]] },
      { layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.2, opacity: 0.55,
        pts: [[62, 330], [64, 470], [66, hem + 4]] },
      { layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.45,
        pts: [[44, 310], [56, 314], [84, 324], [99, 336, 1], [52, 420], [40, 400]] },
    ];
    // Sleeves over whatever is underneath, so the coat reads as worn over the robe.
    S.push(...robeSleeves([[26, 308], [94, 312], [124, 342], [134, hem - 40, 1], [46, hem - 34, 1], [30, 430]], 'main', 'sleeveOuter'));
    return S;
  },
});

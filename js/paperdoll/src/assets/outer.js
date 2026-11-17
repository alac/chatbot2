// Outerwear exemplar: cardigan. Worn over a top, open or closed. Its sleeves use the
// 'sleeveOuter' layer so they cover the sleeves of whatever is underneath.
import { register } from '../registry.js';
import { ellipse } from '../geom.js';
import { sideRun, bustShading } from '../template.js';
import { sleeveShapes } from './top.js';

const HEM = { waist: 552, hip: 606, long: 700 };
// Roomier than a loose top, so the layer underneath never shows at the sides.
const EASE = y => 13 + 10 * Math.exp(-(((y - 525) / 55) ** 2));
const SHOULDER = [[56, 310], [86, 320], [104, 332, 1], [93, 362], [85, 396, 1]];

function cardiganShapes(o, ctx) {
  const hem = HEM[o.length], L = 'outer', fit = 'loose', S = [];
  const side = sideRun(432, hem, EASE), w = side[side.length - 1][0];
  side[side.length - 1][2] = 1;
  S.push(...sleeveShapes('long', { layer: 'sleeveOuter', ease: 9.5 }));

  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  if (below && hem < 690) {
    S.push({ layer: L, sym: true, fit, clip: below, soft: true, fill: '^.deep', opacity: 0.8, pts: [[0, hem - 12], [w + 4, hem - 16, 1], [w + 6, hem + 8, 1], [w * 0.6, hem + 16], [0, hem + 18]] });
  }

  if (o.worn === 'closed') {
    S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 432, 1], [29, 300, 1], ...SHOULDER, ...side, [w * 0.6, hem + 5], [0, hem + 6]] });
    S.push({ layer: L, fit, closed: false, line: 'main', sw: 1.3, pts: [[0, 432], [0, hem + 6]] });
    for (let y = 452; y < hem - 10; y += 40) S.push({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 1, pts: ellipse(6, y, 3, 3, 8) });
  } else {
    // Two front panels; the top underneath shows down the middle.
    const panel = [[29, 300, 1], ...SHOULDER, ...side, [w * 0.7, hem + 4], [27, hem + 5, 1], [23, hem - 60], [21, 450], [24, 370]];
    S.push({ id: 'body', role: 'main', layer: L, mirror: true, fit, fill: 'main', line: 'main', pattern: true, pts: panel });
    S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.2, opacity: 0.6, pts: [[38, 305], [33, 370], [30, 450], [32, hem - 60], [36, hem + 5]] });
  }
  S.push({ layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', pts: [[88, 396, 1], ...side.map(p => [p[0] + 2, p[1]]), [w - 14, hem + 4, 1], ...side.slice().reverse().map(p => [p[0] - 10, p[1]])] });
  S.push(...bustShading('body', 'main', L, fit));
  // Ribbed hem.
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.2, opacity: 0.55, pts: [[o.worn === 'closed' ? 0 : 27, hem - 9], [w * 0.6, hem - 10], [w + 2, hem - 14]] });
  return S;
}

register({
  id: 'cardigan', slot: 'outer', label: 'cardigan, knit jacket', tags: ['modern', 'school'],
  channels: { main: '#f3e3a8', accent: '#8a6b3c' },
  options: { length: Object.keys(HEM), worn: ['open', 'closed'] },
  defaults: { length: 'hip', worn: 'open' },
  notes: 'accent = buttons',
  covers: o => [{ target: 'arm', y: [350, 590] }, ...(o.worn === 'closed' ? [{ target: 'torso', y: [450, Math.min(HEM[o.length] - 12, 685)] }] : [])],
  view: [80, 250, 440, 500],
  build: cardiganShapes,
});

// Blazer: a closed jacket whose two front panels meet at a button below the bust. The V between the
// lapels is open, so whatever is worn underneath shows there. Each panel carries a lapel flap folded
// back from that V: a strip of the same cloth lying on the jacket, with the fold shadowed, so the
// blazer reads as overlapping the garment underneath rather than merging with its collar.
const BLAZER_HEM = 612;
const V_EDGE = [[26, 300, 1], [58, 331, 1], [42, 362], [24, 420], [9, 470], [2, 506, 1]];
const LAPEL = [...V_EDGE, [14, 502, 1], [26, 468], [40, 420], [54, 368], [64, 338, 1], [34, 306]];
// The same V, one step inside the opening: the shade the jacket casts on the garment underneath.
const V_SHADE = [[0, 500, 1], [2, 506, 1], [9, 470], [24, 420], [42, 362], [58, 331, 1], [50, 328, 1], [36, 358], [17, 414], [3, 462], [0, 494, 1]];

function blazerShapes(o, ctx) {
  const hem = BLAZER_HEM, L = 'outer', fit = 'loose', S = [];
  // Roomier than the cardigan at the hem: with wide hips the body otherwise outruns the jacket
  // sides below the waist, and the torso shows through.
  const { side, w } = closedBody(hem, 5, 0);
  S.push(...sleeveShapes('long', { layer: 'sleeveOuter', ease: 9.5 }));

  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  if (below) S.push({ layer: L, sym: true, fit, clip: below, soft: true, fill: '^.deep', opacity: 0.8, pts: [[0, hem - 12], [w + 4, hem - 16, 1], [w + 6, hem + 8, 1], [w * 0.6, hem + 16], [0, hem + 18]] });

  // The shade on whatever is worn underneath has to go on before the jacket, so the jacket covers
  // its own edge: drawn after, it would darken the lapel instead of the shirt.
  const under = ctx.has('top') ? '@top' : ctx.has('dress') ? '@dress' : null;
  if (under) S.push({ layer: L, mirror: true, fit, clip: under, soft: true, fill: 'main.deep', opacity: 0.38, pts: V_SHADE });

  const panel = [...V_EDGE, [0, hem + 5, 1], [w * 0.62, hem + 4], [w, hem - 8, 1], ...side.slice().reverse(), ...SHOULDER.slice().reverse()];
  S.push({ id: 'body', role: 'main', layer: L, mirror: true, fit, fill: 'main', line: 'main', pattern: true, pts: panel });
  // The lapel flap lying on the panel, its edge crisp and its fold shadowed onto the jacket.
  S.push({ layer: L, mirror: true, fit, clip: 'body', fill: 'main:v', pts: LAPEL });
  S.push({ layer: L, mirror: true, fit, clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.5, pts: [[14, 502, 1], [26, 468], [40, 420], [54, 368], [64, 338, 1], [69, 341, 1], [59, 371], [45, 424], [31, 472], [19, 505, 1]] });
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.4, pts: V_EDGE });
  S.push({ layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', pts: [[88, 396, 1], ...side.map(p => [p[0] + 2, p[1]]), [w - 14, hem + 4, 1], ...side.slice().reverse().map(p => [p[0] - 10, p[1]])] });
  S.push(...bustShading('body', 'main', L, fit));
  S.push({ layer: L, fit, anchor: [0, 508], fill: 'accent', line: 'main', sw: 1, pts: ellipse(9, 508, 3.4, 3.4, 8) });
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.3, opacity: 0.7, pts: [[34, 566], [56, 570], [74, 566]] });
  return S;
}

register({
  id: 'blazer', slot: 'outer', label: 'blazer, uniform jacket', tags: ['school', 'modern'],
  channels: { main: '#2c3760', accent: '#d8c56a' },
  notes: 'accent = the button; trim shows at the lapel edge',
  covers: () => [{ target: 'arm', y: [350, 590] }, { target: 'torso', y: [430, BLAZER_HEM - 12] }],
  view: [80, 250, 440, 520],
  build: blazerShapes,
});

// Sweater vest: the cardigan's closed body with no sleeves, a V neck and a ribbed hem.
const VEST_HEM = 600;
function vestShapes(o, ctx) {
  const hem = VEST_HEM, L = 'outer', fit = 'loose', S = [];
  const side = sideRun(432, hem, EASE), w = side[side.length - 1][0];
  side[side.length - 1][2] = 1;

  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  if (below) S.push({ layer: L, sym: true, fit, clip: below, soft: true, fill: '^.deep', opacity: 0.8, pts: [[0, hem - 12], [w + 4, hem - 16, 1], [w + 6, hem + 8, 1], [w * 0.6, hem + 16], [0, hem + 18]] });

  S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 378, 1], [27, 300, 1], ...SHOULDER, ...side, [w * 0.6, hem + 5], [0, hem + 6]] });
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.6, pts: [[0, 378], [14, 340], [27, 300]] });
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.3, opacity: 0.6, pts: SHOULDER });
  for (let x = 12; x < w * 0.8; x += 13) S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1, opacity: 0.5, pts: [[x, hem - 9], [x + 1, hem + 3]] });
  S.push({ layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', pts: [[88, 396, 1], ...side.map(p => [p[0] + 2, p[1]]), [w - 14, hem + 4, 1], ...side.slice().reverse().map(p => [p[0] - 10, p[1]])] });
  S.push(...bustShading('body', 'main', L, fit));
  return S;
}

register({
  id: 'sweater_vest', slot: 'outer', label: 'sweater vest, sleeveless jumper', tags: ['school', 'modern'],
  channels: { main: '#8c1f2f' },
  covers: () => [{ target: 'torso', y: [430, VEST_HEM - 12] }],
  view: [80, 250, 440, 500],
  build: vestShapes,
});

// ---- jacket, coat, hoodie -------------------------------------------------------
// All three are the cardigan's closed body with a different collar, length and front detail.

function closedBody(hem, extra = 0, flare = 0.04) {
  const side = sideRun(432, hem, y => EASE(y) + extra + Math.max(0, y - 700) * flare), w = side[side.length - 1][0];
  side[side.length - 1][2] = 1;
  return { side, w };
}

// Shadows shared by the closed garments: the hem on whatever is below, and the rim down the side.
function outerShadows(S, side, w, hem, L, fit, below) {
  if (below) S.push({ layer: L, sym: true, fit, clip: below, soft: true, fill: '^.deep', opacity: 0.8, pts: [[0, hem - 12], [w + 4, hem - 16, 1], [w + 6, hem + 8, 1], [w * 0.6, hem + 16], [0, hem + 18]] });
  S.push({ layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', pts: [[88, 396, 1], ...side.map(p => [p[0] + 2, p[1]]), [w - 14, hem + 4, 1], ...side.slice().reverse().map(p => [p[0] - 10, p[1]])] });
}

// Jacket: short, closed, a stand collar and a zip. Denim, bomber or track, depending on colour.
const JACKET_HEM = 592;
function jacketShapes(o, ctx) {
  const hem = JACKET_HEM, L = 'outer', fit = 'loose', S = [];
  const { side, w } = closedBody(hem);
  S.push(...sleeveShapes('long', { layer: 'sleeveOuter', ease: 10 }));
  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 336, 1], [27, 300, 1], ...SHOULDER, ...side, [w * 0.6, hem + 5], [0, hem + 6]] });
  outerShadows(S, side, w, hem, L, fit, below);
  // Stand collar: two pieces, one from each side of the neck toward the center, with a gap between
  // them. One continuous band across the centerline reads as a blob in front of the throat.
  S.push({ layer: L, mirror: true, fit, fill: 'main:v', line: 'main', pts: [[4, 290, 1], [18, 286], [30, 284, 1], [31, 307, 1], [17, 311], [4, 309, 1]] });
  S.push({ layer: L, sym: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.3, pts: [[0, 336], [0, hem - 2]] });
  for (let y = 344; y < hem - 8; y += 17) S.push({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 0.8, pts: [[-2.4, y - 1], [2.4, y - 1], [2.4, y + 1], [-2.4, y + 1]] });
  // Ribbed hem band.
  S.push({ layer: L, sym: true, fit, clip: 'body', fill: 'main.shadow', pts: [[0, hem - 13], [w, hem - 15, 1], [w, hem + 2, 1], [0, hem + 4]] });
  S.push(...bustShading('body', 'main', L, fit));
  return S;
}

register({
  id: 'jacket', slot: 'outer', label: 'jacket, denim jacket, bomber, track jacket', tags: ['modern'],
  channels: { main: '#5b7ba8', accent: '#c8ccd4' },
  notes: 'accent = zip teeth and the ribbed band',
  covers: () => [{ target: 'arm', y: [350, 580] }, { target: 'torso', y: [430, JACKET_HEM - 12] }],
  view: [80, 250, 440, 500],
  build: jacketShapes,
});

// Coat: the same closed body to the knee, with a wide collar and an optional belt.
const COAT_HEM = 985;
function coatShapes(o, ctx) {
  const hem = COAT_HEM, L = 'outer', fit = 'loose', S = [];
  const { side, w } = closedBody(hem, 6, 0.1);
  S.push(...sleeveShapes('long', { layer: 'sleeveOuter', ease: 12 }));
  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 372, 1], [27, 300, 1], ...SHOULDER, ...side, [w * 0.6, hem + 5], [0, hem + 6]] });
  outerShadows(S, side, w, hem, L, fit, below);
  // Wide collar: two points lying on the chest, from the neck out to the shoulder line.
  S.push({ layer: L, mirror: true, fit, clip: 'body', fill: 'main:v', line: 'main', pts: [[26, 300, 1], [58, 316], [72, 350], [50, 372], [30, 356], [0, 372, 1], [0, 300, 1]] });
  S.push({ layer: L, fit, clip: 'body', closed: false, line: 'main', sw: 1.4, pts: [[0, 372], [0, hem - 2]] });
  for (let y = 400; y < hem - 40; y += 190) S.push({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 1, pts: ellipse(11, y, 3.6, 3.6, 8) });
  if (o.belt) {
    const by = 596;
    S.push({ layer: L, sym: true, fit, clip: 'body', fill: 'main.shadow', line: 'main', sw: 1.2, pts: [[0, by - 9], [w * 0.92, by - 10, 1], [w * 0.93, by + 11, 1], [0, by + 12]] });
    S.push({ layer: L, fit, anchor: [0, by], fill: 'accent', line: 'accent', sw: 1.2, pts: [[-9, by - 1], [9, by - 1], [9, by + 13], [-9, by + 13]] });
  }
  S.push(...bustShading('body', 'main', L, fit));
  return S;
}

register({
  id: 'coat', slot: 'outer', label: 'coat, long coat, trench', tags: ['modern'],
  channels: { main: '#c2b49a', accent: '#6b5b46' },
  flags: { belt: false },
  notes: 'accent = buttons and the belt buckle',
  covers: () => [{ target: 'arm', y: [350, 580] }, { target: 'torso', y: [430, 700] }, { target: 'leg', y: [712, COAT_HEM - 20] }],
  view: [60, 250, 500, 800],
  build: coatShapes,
});

// Hoodie: a loose body with the hood gathered at the neck, a pouch pocket and drawstrings.
const HOODIE_HEM = 604;
function hoodieShapes(o, ctx) {
  const hem = HOODIE_HEM, L = 'outer', fit = 'loose', S = [];
  const { side, w } = closedBody(hem, 3);
  S.push(...sleeveShapes('long', { layer: 'sleeveOuter', ease: 12 }));
  const below = ctx.has('bottom') ? '@bottom' : ctx.has('dress') ? '@dress' : null;
  S.push({ id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main', line: 'main', pattern: true, pts: [[0, 330, 1], [27, 300, 1], ...SHOULDER, ...side, [w * 0.6, hem + 5], [0, hem + 6]] });
  outerShadows(S, side, w, hem, L, fit, below);
  // The hood hangs behind the head, on its own layer behind the hair, so from the front only its
  // edge shows past the neck. Nothing of it is drawn over the body.
  S.push({ layer: 'hoodBack', sym: true, fit, fill: 'main.shadow', line: 'main', pts: [[0, 244], [40, 248], [66, 276], [78, 314], [74, 348], [48, 364], [0, 368]] });
  S.push({ layer: L, sym: true, fit, clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.45, pts: [[0, 330], [30, 328], [44, 340], [0, 344]] });
  if (o.worn === 'zip') {
    S.push({ layer: L, fit, clip: 'body', closed: false, line: 'main', sw: 1.6, pts: [[0, 366], [0, hem - 2]] });
    for (let y = 372; y < hem - 10; y += 16) S.push({ layer: L, fit, anchor: [0, y], fill: 'accent', line: 'main', sw: 0.8, pts: [[-2.4, y - 1], [2.4, y - 1], [2.4, y + 1], [-2.4, y + 1]] });
  }
  // Drawstrings, tied to the neckline at the front.
  S.push({ layer: L, mirror: true, fit, closed: false, line: 'accent', sw: 2, pts: [[17, 334], [15, 380], [17, 418]] });
  S.push({ layer: L, mirror: true, fit, anchor: [17, 420], fill: 'accent', line: 'accent', pts: ellipse(17, 420, 2.2, 3, 8) });
  // Kangaroo pocket.
  S.push({ layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.4, opacity: 0.65, pts: [[12, 502], [48, 498], [70, 516]] });
  // Ribbed hem.
  S.push({ layer: L, sym: true, fit, clip: 'body', fill: 'main.shadow', pts: [[0, hem - 14], [w, hem - 16, 1], [w, hem + 2, 1], [0, hem + 4]] });
  S.push(...bustShading('body', 'main', L, fit));
  return S;
}

register({
  id: 'hoodie', slot: 'outer', label: 'hoodie, hooded sweatshirt', tags: ['modern'],
  channels: { main: '#8a94a6', accent: '#e6e8ee' },
  options: { worn: ['pullover', 'zip'] },
  defaults: { worn: 'pullover' },
  notes: 'accent = drawstrings and zip teeth',
  covers: () => [{ target: 'arm', y: [350, 590] }, { target: 'torso', y: [430, HOODIE_HEM - 12] }],
  view: [80, 250, 440, 500],
  build: hoodieShapes,
});

register({
  id: 'cape', slot: 'outer', label: 'cape, poncho', tags: ['modern'],
  channels: { main: '#6c5b8a', trim: '#e8dfc8' },
  notes: 'trim = the band along the hem',
  // It hangs behind the shoulders, so it covers nothing in front of the body: the body silhouette is
  // what you see, with cloth beyond it. The layer puts it behind the arms and the torso, in front of
  // the hair.
  covers: () => [],
  view: [30, 240, 540, 470],
  build() {
    const L = 'outerBack', fit = 'loose';
    return [
      // Hangs from the shoulders and clears the arms, so it reads as cloth behind the whole figure
      // rather than a jacket. No sleeves and no opening: a cape. The top edge dips at the centre for
      // the neck, which sits behind the body and so is never seen.
      { id: 'body', role: 'main', layer: L, sym: true, fit, fill: 'main:v', line: 'main', pattern: true,
        pts: [[0, 352], [26, 344], [58, 328], [86, 322, 1], [114, 382], [130, 470], [141, 560], [150, 650, 1], [118, 664], [86, 652], [54, 668], [24, 660], [0, 676]] },
      { layer: L, sym: true, fit, clip: 'body', fill: 'trim', line: 'trim',
        pts: [[0, 638], [56, 630], [96, 620], [150, 612, 1], [150, 650, 1], [118, 664], [86, 652], [54, 668], [24, 660], [0, 676]] },
      // A shoulder yoke seam, and the folds the cloth takes as it falls.
      { layer: L, sym: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.2, opacity: 0.5, pts: [[0, 372], [52, 356], [92, 336]] },
      { layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.1, opacity: 0.4, pts: [[46, 372], [62, 470], [78, 600]] },
      { layer: L, mirror: true, fit, clip: 'body', closed: false, line: 'main', sw: 1.1, opacity: 0.4, pts: [[86, 344], [108, 460], [124, 600]] },
      { layer: L, fit, clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.5, pts: [[0, 352], [26, 344], [58, 328], [40, 350], [0, 366]] },
    ];
  },
});

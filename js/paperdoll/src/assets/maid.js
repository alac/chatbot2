// Maid: one piece, so the outfit is this dress plus stockings, shoes and the headband.
//
// It is assembled from the parts that already exist -- a bodice from top.js, a bell skirt from
// skirt.js -- with the apron, collar, cuffs and hem frills drawn over them. The apron is part of the
// dress rather than a separate garment, which is the shortcut: a real apron has to be tied over
// clothes, and this one is stitched on.
import { register } from '../registry.js';
import { scallop, ellipse } from '../geom.js';
import { SEAM, ARM, sideRun, bustShading } from '../template.js';
import { topShapes, topCovers, sleeveShapes, sleeveEnd, puffEaseOf } from './top.js';
import { band } from './hairwear.js';
import { skirtShapes, SKIRT_OPTIONS, SKIRT_LEN } from './skirt.js';

const L = 'dress';
const WAIST = 546;                        // bodice meets skirt
const W = SEAM.waistHalf;

// The lolita apron's bib: narrow at the top, widening into the waist, its edge carrying the frill.
const BIB = [[0, 372], [30, 372], [39, 386], [43, 440], [46, 494], [W, WAIST], [0, WAIST + 2]];
// An opera glove: the arm's own outline from the elbow round the hand and back, so it is skin-tight
// and follows every body slider with the arm it is on. ARM's point 6 is the elbow; from point 4 the
// glove started on the upper arm and read as a sleeve.
const GLOVE = [[70, 460], [112, 460], ...ARM.slice(4, 14), [70, 460]];

/** The waist apron: a strap round the waist and a half-disc of cloth hanging from it. */
function waistApron(hem, { flare = 24, drop = 0.55 } = {}) {
  const S = [];
  S.push({ layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: [[0, WAIST - 9], [W + 3, WAIST - 7, 1], [W + 4, WAIST + 12, 1], [0, WAIST + 13]] });
  // The widest point sits a little below the strap rather than at it, or the cloth reads as an egg
  // hanging off a belt. The bottom is a quarter-ellipse from the widest point in to the centreline.
  const ry = (hem - WAIST) * drop, rx0 = W + 2, rx = W + flare, bow = Math.min(60, ry * 0.45);
  const arc = Array.from({ length: 11 }, (_, i) => {
    const t = (Math.PI / 2) * (i / 10);
    return [rx * Math.cos(t), WAIST + bow + (ry - bow) * Math.sin(t)];
  });
  const edge = [[rx0, WAIST + 2], [rx - 5, WAIST + bow * 0.45], [rx, WAIST + bow], ...arc.slice(1), [0, WAIST + ry]];
  // Both halves are built here rather than mirrored by the engine: a `sym` shape strokes its closing
  // edge down the centreline, which on a white apron draws a dark seam up the middle.
  const full = pts => [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  S.push({ layer: L, fit: 'skirt', fill: 'trim', line: 'trim', pts: scallop(full(edge), { dist: 12, amp: 3.8, waves: 18, back: 5, out: [0, WAIST - 40] }) });
  S.push({ id: 'panel', role: 'main', layer: L, fit: 'skirt', fill: 'trim', line: 'trim', pts: full([[0, WAIST + 2], ...edge]) });
  return S;
}

// --- the corset style ---------------------------------------------------------------------------
// The black bodice's front edge, right half: from the underbust out to the side and all the way up to
// the shoulder, so the whole upper chest between the two sides is open -- bare skin above the
// chemise's lace, cloth below it. A closed oval left a thin ring of black round the chest instead.
const MOUTH = [[0, 478], [40, 470], [64, 452], [72, 420], [76, 372], [82, 340], [86, 322]];
// The chemise. It is drawn *over* the corset, as the reference's band is: the white wraps the outside
// of the breasts, so its outer edge has to be the bust's own silhouette, or the bust bulges out past
// it. A fixed x cannot do that -- the bust moves with the body sliders -- so the outer edge runs down
// the torso's side with a little ease and the cup covers the bust to its outermost point.
// Its top edge is a sweetheart: a hump over each breast either side of a dip at the centre.
const CUP_EDGE = [[0, 404], [16, 394], [34, 382], [58, 378], [76, 392]];
// Down the outside of the bust to the underbust, then in along the underbust: the band tapers at the
// sides where it meets the arm, so it is a band rather than a tube around the chest.
// The bust warp pushes the body's own outline and this edge by slightly different amounts, because
// the two curves are sampled at different heights; at the underbust's outer corner that left the
// body a couple of units proud of the cloth. The ease grows toward that corner -- under the arm,
// where it is hidden -- rather than along the whole side, so the band does not stand off the bust.
const cupPts = () => [...CUP_EDGE, ...sideRun(392, 508, 5), [40, 498], [0, 486]];

function corsetDress(o, hem) {
  const S = [], fit = 'tight';
  // Skirt and apron first: the corset is worn over both, and its front edge is what hangs over the
  // apron in two points. Drawing the bodice first and adding the points separately made them a patch
  // stuck onto the skirt, and the patch hid the lacing.
  S.push(...skirtShapes({ ...o, cut: 'flared' }, { L }).map(s => (s.role ? { ...s, role: undefined } : s)));
  // Almost to the skirt's hem and no wider than the skirt is at its top: as wide as the hem it
  // covered the whole skirt.
  if (o.apron) S.push(...waistApron(hem, { flare: 10, drop: 0.79 }));
  // The black body is the torso less the opening, so its front edge is the U itself. Its bottom edge
  // is the W -- down to a point either side of the centreline and up between them -- so the points
  // are part of the bodice and hang over the apron.
  // Ease follows the waist the way a tight top's does, and a straight 4 was not enough on the
  // extreme body: the bust warp pushes the torso's own side seam out past it.
  const side = sideRun(430, WAIST, y => 2 + 5 * Math.exp(-(((y - 528) / 50) ** 2)));
  side[side.length - 1][2] = 1;
  S.push({
    id: 'body', role: 'main', layer: L, sym: true, fit: 'skin', fill: 'main', line: 'main', pattern: true,
    pts: [...MOUTH, [0, 310], [23, 300], [55, 311], [86, 322], ...SEAM.ARMHOLE, ...sideRun(402, 430, 3), ...side, [32, WAIST + 40], [0, WAIST + 6]],
  });
  S.push(...bustShading('body', 'main', L, fit));
  // The chemise over the corset: a cup per breast, with its lace edge, two horizontal seams and the
  // boning lines, all on top of the black. Under it, the cloth poked out at the bust's sides where
  // the bodice's own edge cuts inside the bust's outline.
  S.push({ id: 'cup', layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: cupPts() });
  S.push({ layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: scallop(CUP_EDGE, { dist: 9, amp: 3, waves: 7, back: 6, out: [40, 450] }) });
  for (const y of [414, 446]) S.push({ layer: L, sym: true, fit: 'skin', clip: 'cup', closed: false, line: 'trim.shadow', sw: 1.2, opacity: 0.75, pts: [[0, y], [74, y + 4]] });
  for (const x of [22, 44, 62]) S.push({ layer: L, mirror: true, fit: 'skin', clip: 'cup', closed: false, line: 'trim.shadow', sw: 1.1, opacity: 0.6, pts: [[x, 384], [x + 2, 426], [x - 2, 480]] });
  // Cross-lacing on the black between the chemise and the point of the W: two zigzags crossing, a knot
  // at the top and the ends hanging. It starts below the chemise, so it runs on black as the
  // reference's does rather than across the white band.
  for (let i = 0; i < 4; i++) {
    const y0 = 496 + i * 13, y1 = y0 + 13, x = 15;
    S.push({ layer: L, mirror: true, fit, closed: false, line: 'trim', sw: 2, pts: [[-x, y0], [x, y1]] });
    S.push({ layer: L, mirror: true, fit, closed: false, line: 'trim', sw: 2, pts: [[x, y0], [-x, y1]] });
  }
  S.push({ layer: L, fit, anchor: [0, 488], fill: 'trim', line: 'trim', sw: 1, pts: ellipse(0, 488, 7, 5, 10) });
  for (const s of [-1, 1]) S.push({ layer: L, fit, closed: false, line: 'trim', sw: 2, pts: [[s * 4, 490], [s * 10, 520], [s * 6, 552]] });
  // The sash bow at the hip. A real one is tied between the apron and the body, so it goes on the
  // layer behind the arms: the skirt and the arm both cover part of it and what shows is the loops
  // sticking out past them.
  if (o.apron) {
    S.push({ layer: 'outerBack', fit: 'skirt', fill: 'trim', line: 'trim',
      pts: [[92, 570], [112, 552], [132, 556], [126, 576], [100, 584]] });
    S.push({ layer: 'outerBack', fit: 'skirt', fill: 'trim.shadow', line: 'trim',
      pts: [[92, 582], [110, 600], [128, 606], [124, 586], [98, 578]] });
    S.push({ layer: 'outerBack', fit: 'skirt', fill: 'trim', line: 'trim', sw: 1, pts: [[88, 570], [100, 566], [102, 584], [90, 586]] });
    S.push({ layer: 'outerBack', fit: 'skirt', fill: 'trim', line: 'trim',
      pts: [[94, 588], [110, 626], [122, 648], [110, 650], [100, 612]] });
    S.push({ layer: 'outerBack', fit: 'skirt', fill: 'trim', line: 'trim',
      pts: [[96, 586], [112, 618], [106, 646], [96, 638], [92, 606]] });
  }
  // Puff sleeves with a buttoned white cuff at the elbow.
  S.push(...sleeveShapes('puff', { ease: puffEaseOf, ch: 'main' }));
  const e = sleeveEnd('puff', puffEaseOf);
  S.push({ layer: 'sleeve', mirror: true, part: 'arm', fill: 'trim', line: 'trim', pts: [[e.ix, e.y - 2], [e.mx, e.y + 5], [e.ox, e.y - 2], [e.ox, e.y + 4], [e.mx, e.y + 11], [e.ix, e.y + 4]] });
  S.push({ layer: 'sleeve', mirror: true, part: 'arm', anchor: [e.ox - 8, e.y], fill: 'trim.shadow', line: 'trim', sw: 1, pts: ellipse(e.ox - 8, e.y + 1, 3.2, 3.2, 8) });
  // Wrist cuffs, the same band and button as the sleeve.
  S.push({ layer: 'arm', mirror: true, part: 'arm', fill: 'trim', line: 'trim', pts: [[54, 556], [80, 584], [74, 596], [48, 566]] });
  S.push({ layer: 'arm', mirror: true, part: 'arm', anchor: [70, 580], fill: 'trim.shadow', line: 'trim', sw: 1, pts: ellipse(70, 580, 3.2, 3.2, 8) });
  // A standing white collar and a black ribbon hanging from it, in place of the bow.
  S.push({ layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: [[0, 286], [20, 290], [24, 312], [12, 320], [0, 322]] });
  S.push({ layer: L, fit, fill: 'main', line: 'main', sw: 1, pts: [[-9, 316], [9, 316], [7, 330], [-7, 330]] });
  S.push({ layer: L, fit, fill: 'main', line: 'main', sw: 1, pts: [[-8, 326], [-2, 326], [-6, 430], [-14, 424]] });
  S.push({ layer: L, fit, fill: 'main', line: 'main', sw: 1, pts: [[8, 326], [2, 326], [6, 438], [15, 430]] });
  return S;
}

register({
  id: 'maid_dress', slot: 'dress', blocks: ['top', 'bottom'], label: 'maid dress, frilled apron', tags: ['maid', 'costume'],
  channels: { main: '#26242b', trim: '#f7f4ee', accent: '#e58aa0' },
  options: { style: ['lolita', 'classic', 'corset'], sleeves: ['puff', 'short', 'none'], length: ['mini', 'knee'] },
  flags: { apron: true, collar: true, bow: true, gloves: false },
  defaults: { style: 'lolita', sleeves: 'puff', length: 'mini' },
  notes: 'classic = sleeveless with a short bib; trim = apron, collar, cuffs and glove; accent = the bow',
  presets: {
    maid: {},
    classic_maid: { style: 'classic', sleeves: 'none', length: 'mini', gloves: true, bow: true },
    corset_maid: { style: 'corset', sleeves: 'puff', length: 'mini' },
    gothic_maid: { sleeves: 'puff', length: 'knee' },
    plain_maid: { apron: false, collar: false, bow: false },
  },
  covers: o => [...topCovers({ ...o, fit: 'tight' }, WAIST), { target: 'leg', y: [700, SKIRT_LEN[o.length] - 24] }],
  view: [40, 250, 520, 800],
  build(o) {
    const S = [], hem = SKIRT_LEN[o.length], fit = 'tight', classic = o.style === 'classic';
    if (o.style === 'corset') return corsetDress(o, hem);
    // Bodice and sleeves. Tight, so the cloth follows the body.
    S.push(...topShapes({ ...o, neckline: 'crew', fit, sleeves: o.sleeves }, { L, hem: WAIST }));
    // Skirt: a bell, with the frills stacked at the hem.
    S.push(...skirtShapes({ ...o, cut: 'flared' }, { L }).map(s => (s.role ? { ...s, role: undefined } : s)));
    const W2 = 100 + 0.22 * (Math.min(hem, 806) - 650) + 0.12 * Math.max(0, hem - 806);
    const hemEdge = [[0, hem - 2], [W2 * 0.5, hem - 4], [W2, hem - 8]];
    if (classic) {
      // A thin white piping at the hem rather than a petticoat: the classic silhouette is a plain
      // short bell, and the frills live on the apron.
      S.push({
        layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim',
        pts: [[0, hem - 10], [W2 * 0.5, hem - 12], [W2, hem - 14, 1], [W2, hem - 7, 1], [W2 * 0.5, hem - 5], [0, hem - 3]],
      });
      // The dress buttons up: a placket is a strip of cloth with a seam either side of the buttons,
      // and on a black dress the seam is what reads, not the buttons.
      S.push({ layer: L, sym: true, fit, fill: 'main.deep', pts: [[0, 340], [9, 344], [9, 542], [0, 542]] });
      S.push({ layer: L, mirror: true, fit, closed: false, line: 'main.hi', sw: 1, opacity: 0.55, pts: [[9, 344], [9, 540]] });
      S.push({ layer: L, fit, closed: false, line: 'main.shadow', sw: 2.4, opacity: 1, pts: [[0, 350], [0, 540]] });
      // Buttons above the apron bib only: below it the bib is over them, and a button showing through
      // white cotton is a drawing error rather than a detail.
      for (const y of [368, 394, 420, 446]) {
        S.push({ layer: L, fit, anchor: [0, y], fill: 'main.hi', line: 'main.shadow', sw: 0.9, pts: ellipse(0, y, 4, 4, 9) });
      }
    } else {
      // Pink petticoat first and further out, white ruffle over it: the white hangs at the black hem
      // and the pink shows below. Few wide scallops, not many small ones: a dozen thin waves over a
      // narrow band reads as ric-rac ribbon rather than gathered cloth.
      S.push({ layer: L, sym: true, fit: 'skirt', fill: 'accent', line: 'accent', pts: scallop(hemEdge, { dist: 26, amp: 5, waves: 8, back: 12, out: [0, WAIST] }) });
      S.push({ layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: scallop(hemEdge, { dist: 14, amp: 4.5, waves: 8, back: 10, out: [0, WAIST] }) });
    }
    if (o.apron && classic) {
      S.push(...waistApron(hem));
    } else if (o.apron) {
      // The straps go on first, under everything: an apron strap is sewn to the back of the bib, so
      // the cloth covers its lower end. Drawn last, the strap crossed the bib and cut it in two.
      const strap = [[26, 374], [40, 371], [52, 314], [55, 300], [44, 300], [40, 330], [14, 376]];
      S.push({ layer: L, mirror: true, fit: 'skin', fill: 'trim', line: 'trim', pts: strap });
      S.push({ layer: L, mirror: true, fit: 'skin', fill: 'trim', line: 'trim', pts: scallop([[40, 371], [52, 314], [55, 300]], { dist: 6, amp: 2.4, waves: 4, back: 5, out: [20, 340] }) });
      // Bib, its frill, the skirt panel and its frill, and the band that ties them.
      S.push({ layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: scallop(BIB.slice(0, -2), { dist: 11, amp: 3, waves: 8, back: 4, out: [0, 470] }) });
      S.push({ id: 'bib', role: 'main', layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: BIB });
      // The apron runs the length of the skirt, stopping just short of its hem: a fixed hem left the
      // knee-length dress with an apron ending halfway down it.
      const aHem = WAIST + (hem - WAIST) * 0.94;
      const aHalf = y => W + (y - WAIST) * 0.115;
      const stops = [0.3, 0.6, 0.82].map(t => WAIST + (aHem - WAIST) * t);
      const panel = [[0, WAIST - 2], [W, WAIST], ...stops.map(y => [aHalf(y), y]), [aHalf(aHem), aHem], [0, aHem + 2]];
      const panelEdge = [[aHalf(aHem) - 14, aHem - 6], [aHalf(aHem), aHem - 1], [0, aHem]];
      S.push({ layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: scallop(panelEdge, { dist: 11, amp: 3.4, waves: 7, back: 4, out: [0, 600] }) });
      S.push({ layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: panel });
      S.push({ layer: L, sym: true, fit: 'skirt', closed: false, line: 'trim', sw: 1.2, opacity: 0.5, pts: [[0, WAIST + 4], [W, WAIST + 2]] });
    }
    if (o.collar) {
      // A white band round the neck opening with a scalloped lower edge.
      const edge = [[0, 314], [12, 310], [22, 302], [26, 296]];
      S.push({ layer: L, sym: true, fit: 'skin', fill: 'trim', line: 'trim', pts: scallop(edge, { dist: 12, amp: 3, waves: 6, back: 5, out: [0, 240] }) });
    }
    if (classic && o.sleeves === 'none') {
      // Ruffled cap sleeves: one piece of lace over the shoulder corner, closed along the shoulder
      // seam and scalloped along the V below it. A flat wedge with a frill hung off its edge read as
      // white cloth trimmed with lace; a shape whose only edge is scalloped reads as lace.
      const V = [[42, 302], [56, 344], [70, 386], [86, 358], [99, 330]];
      const waves = scallop(V, { dist: 15, amp: 4.5, waves: 5, back: 0.5, out: [66, 322] });
      const lace = waves.slice(0, waves.length / 2);
      S.push({ layer: L, mirror: true, fit: 'skin', fill: 'trim', line: 'trim', pts: [[42, 300], [72, 316], ...lace.slice().reverse()] });
    }
    if (o.gloves) {
      // Opera gloves, on the arm layer so they pass behind the body where the forearm tucks in.
      // Straight sides and a level opening: a glove is a tube, not a second skin.
      S.push({ layer: 'arm', mirror: true, part: 'arm', fill: 'trim', line: 'trim', pts: GLOVE });
      S.push({ layer: 'arm', mirror: true, part: 'arm', closed: false, line: 'trim', sw: 2, opacity: 0.9, pts: [[70, 462], [96, 472], [114, 482]] });
    }
    // White lace along the bottom of a puff or short sleeve, scalloped downward. The edge comes from
    // sleeveEnd so it spans the sleeve's whole opening: a puff reaches x 124 at the cuff, and a trim
    // drawn from 76 to 108 sat on the inner half of it as a small white tab.
    if (o.sleeves !== 'none') {
      const e = sleeveEnd(o.sleeves, o.sleeves === 'puff' ? puffEaseOf : 2.5);
      const edge = [[e.ix + 1, e.y + 2], [e.mx, e.y + 10], [e.ox - 1, e.y + 2]];
      S.push({ layer: 'sleeve', mirror: true, part: 'arm', fill: 'trim', line: 'trim', pts: scallop(edge, { dist: 10, amp: 3.2, waves: 4, back: 5, out: [e.mx, e.y - 60] }) });
    }
    if (o.bow) {
      // Throat bow: two loops and a knot. The reference's is most of the way across the collarbones,
      // not a small one at the throat.
      S.push({ layer: L, fit, anchor: [0, 324], fill: 'accent', line: 'accent', sw: 1.1, pts: [[-4, 312], [-30, 298], [-34, 338], [-4, 332]] });
      S.push({ layer: L, fit, anchor: [0, 324], fill: 'accent', line: 'accent', sw: 1.1, pts: [[4, 312], [30, 298], [34, 338], [4, 332]] });
      S.push({ layer: L, fit, anchor: [0, 324], fill: 'accent', line: 'accent', sw: 1, opacity: 0.5, closed: false, pts: [[-8, 320], [-24, 314]] });
      S.push({ layer: L, fit, anchor: [0, 324], fill: 'accent', line: 'accent', sw: 1, opacity: 0.5, closed: false, pts: [[8, 320], [24, 314]] });
      S.push({ layer: L, fit, anchor: [0, 324], fill: 'accent', line: 'accent', sw: 1.1, pts: [[-8, 311], [8, 311], [8, 335], [-8, 335]] });
    }
    return S;
  },
});

// The headband is the one piece that cannot be part of the dress, so it lives here rather than in
// hairwear: it is white, its frill stands up off the band, and it belongs to this costume.
const CROWN = [[0, 50], [30, 55], [55, 68], [74, 92], [84, 125], [86, 142]];
register({
  id: 'maid_band', slot: 'head', label: 'maid headband, frilled', tags: ['maid', 'costume'],
  channels: { main: '#f7f4ee', ribbon: '#1c1a20' },
  flags: { frill: true, ribbon: false },
  notes: 'a wide band across the crown with a frilled upper edge',
  covers: () => [],
  view: [140, 10, 320, 270],
  build: o => [
    // The frill goes on first so the band covers its lower edge, and it stands outside the band so
    // the two read as one piece of lace rather than a stripe on a hoop.
    ...(o.frill ? [{ layer: 'headwear', fit: 'hair', fill: 'main', line: 'main', mirror: true, pts: scallop(CROWN, { dist: 7, amp: 3, waves: 9, back: 9, out: [0, 260] }) }] : []),
    { id: 'band', role: 'main', layer: 'headwear', fit: 'hair', fill: 'main:v', pts: band(o.frill ? 13 : 20) },
    { layer: 'headwear', fit: 'hair', closed: false, line: 'main', sw: 1.2, opacity: 0.4, pts: band(4).slice(0, 6) },
    // A black ribbon tied to the band at the side, its two tails hanging past the ear.
    ...(o.ribbon ? [
      { layer: 'headwear', fit: 'hair', fill: 'ribbon', line: 'ribbon', sw: 1, pts: [[52, 96], [64, 92], [66, 106], [54, 110]] },
      { layer: 'headwear', fit: 'hair', fill: 'ribbon', line: 'ribbon', sw: 1, pts: [[54, 104], [66, 104], [76, 156], [86, 208], [72, 200], [58, 140]] },
      { layer: 'headwear', fit: 'hair', fill: 'ribbon', line: 'ribbon', sw: 1, pts: [[50, 104], [62, 106], [66, 160], [58, 196], [48, 188], [46, 140]] },
    ] : []),
  ],
});

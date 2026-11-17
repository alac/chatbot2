// Swimwear and the default underwear. Skin-tight, so outlines come from the torso profile
// with about 1 unit of ease, and the 'skin' fit makes them follow every body slider.
import { register } from '../registry.js';
import { resample } from '../geom.js';
import { sideRun, shoulderY, bustShading, torsoSide, legAt } from '../template.js';

const L = 'inner';
const CUP = [[36, 372, 1], [60, 404], [77, 437, 1], [44, 453], [9, 445, 1], [20, 405]];
const BRIEF = [[0, 631], [45, 627], [85.5, 613, 1], [92.5, 651, 1], [62, 673], [30, 695], [8, 704.5], [0, 706]];
const CUP_EDGE = [[36, 372], [60, 404], [77, 437]];

/** A scalloped band hanging up off the cup's upper edge: the frill on a bikini top. */
function ruffle(edge, dist, amp, waves) {
  const e = resample(edge, 25), top = [], base = [];
  e.forEach((p, i) => {
    const a = e[Math.max(0, i - 1)], b = e[Math.min(e.length - 1, i + 1)];
    const m = Math.hypot(b[1] - a[1], b[0] - a[0]) || 1;
    let nx = -(b[1] - a[1]) / m, ny = (b[0] - a[0]) / m;
    // Upward is outward here. Testing against the bust centre instead picks the inward normal on the
    // inner half of the edge, which puts the frill under the cup and leaves a notch on top of it.
    if (ny > 0) { nx = -nx; ny = -ny; }
    const d = dist + amp * Math.sin((i / (e.length - 1)) * Math.PI * 2 * waves);
    top.push([p[0] + nx * d, p[1] + ny * d]);
    base.push([p[0] - nx * 1.5, p[1] - ny * 1.5]);
  });
  return [...top, ...base.reverse()];
}

/** A wide shoulder strap ending on the shoulder line, angled out so it reads as going over the shoulder. */
function straps(x, w) {
  return [{ layer: L, mirror: true, fill: 'main', line: 'main', pts: [[x, 404], [x + 6, shoulderY(x + 6) + 1], [x + 6 + w, shoulderY(x + 6 + w) + 1], [x + w, 404]] }];
}

function braShapes(style) {
  const S = [];
  if (style === 'bandeau') {
    S.push({ id: 'bra', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true, pts: [[0, 398], [40, 392], [77, 398, 1], [76, 446, 1], [42, 455], [0, 448]] });
  } else if (style === 'sporty') {
    // A band with a straight edge, held up by wide straps over the shoulders.
    S.push({ id: 'bra', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true, pts: [[0, 402], [16, 395], [40, 391], [64, 395], [78, 403, 1], [80, 441, 1], [42, 454], [0, 448]] });
    S.push(...straps(56, 13));
  } else if (style === 'halter') {
    // Wide straps from beside the neck down to each cup. They have to stop at the neck's own width:
    // carried to the centreline they met in front of the throat and read as a loop across the chest,
    // where the neck should be in front of them.
    S.push({ layer: L, mirror: true, fill: 'main', line: 'main', pts: [[22, 304], [28, 299], [41, 367], [28, 372]] });
    S.push({ layer: L, closed: false, stroke: 'main', sw: 2.6, pts: [[-10, 445], [10, 445]] });
    S.push({ id: 'bra', role: 'main', layer: L, mirror: true, fill: 'main', line: 'main', pattern: true, pts: CUP });
  } else {
    S.push({ layer: L, mirror: true, closed: false, stroke: 'main', sw: 2.6, pts: [[36, 373], [29, 335], [25, 301]] });      // neck strap
    S.push({ layer: L, closed: false, stroke: 'main', sw: 2.6, pts: [[-10, 445], [10, 445]] });                              // center
    S.push({ layer: L, mirror: true, closed: false, stroke: 'main', sw: 2.6, pts: [[76, 438], [75.5, 441]] });
    S.push({ id: 'bra', role: 'main', layer: L, mirror: true, fill: 'main', line: 'main', pattern: true, pts: CUP });
    // The frill hangs off the cup's own front edge, so it follows the cup whatever the body does.
    // Filled without an outline: stroking the band as well would draw a second line down the cup's
    // own edge and the pair reads as a torn edge rather than as a frill.
    if (style === 'frill') {
      const f = ruffle(CUP_EDGE, 7.5, 2.2, 4);
      S.push({ layer: L, mirror: true, fill: 'main', pts: f });
      S.push({ layer: L, mirror: true, closed: false, line: 'main', sw: 1, opacity: 0.55, pts: f.slice(0, 25) });
    }
  }
  S.push(...bustShading('bra', 'main', L, 'skin'));
  return S;
}

function briefShapes(style) {
  const leg = [[92.5, 651, 1], [62, 673], [30, 695], [8, 704.5], [0, 706]];
  const S = [];
  if (style === 'high_waist') {
    // Up to the natural waist in a straight line across, like the brief's own top edge. A point in
    // the middle of that line made the waistband bow upward and read as lumpy.
    S.push({ id: 'brief', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true,
      pts: [[0, 566], [torsoSide(566) + 2, 566, 1], ...sideRun(600, 645, 1.5), ...leg] });
  } else if (style === 'boyshorts') {
    // Down the thigh, hem across the top of it. The inner edge has to reach the body's own inner
    // thigh (legAt(y)[0], about 2 here): stopping short of it left a strip of bare skin visible
    // between the legs.
    const cut = y => legAt(y)[0] - 1.5;
    S.push({ id: 'brief', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true,
      pts: [[0, 600], [45, 596], [torsoSide(605) + 2, 605, 1], [94, 645, 1], [97, 720], [96, 752, 1],
        [70, 762], [40, 766], [12, 760], [cut(752), 752, 1], [cut(730), 730], [cut(712), 712], [0, 708]] });
    // The legs are only a few units apart at this height, so a hem alone reads as a skirt. The inseam
    // crease down the middle and the shadow along the hem are what make it two legs.
    S.push({ layer: L, clip: 'brief', closed: false, stroke: 'main', sw: 1.4, opacity: 0.55, pts: [[0, 708], [0, 764]] });
    S.push({ layer: L, clip: 'brief', soft: true, fill: 'main.shadow', opacity: 0.5,
      pts: [[96, 742, 1], [60, 752], [22, 748], [3, 740], [3, 752], [22, 760], [60, 764], [96, 752, 1]] });
  } else {
    S.push({ id: 'brief', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true, pts: BRIEF });
  }
  S.push({ layer: L, clip: 'brief', soft: true, fill: 'main.shadow', opacity: 0.7, pts: [[-12, 680, 1], [12, 680, 1], [8, 708, 1], [-8, 708, 1]] });
  if (style === 'side_tie') {
    for (const dy of [-9, 9]) S.push({ layer: L, mirror: true, closed: false, stroke: 'main', sw: 2.2, pts: [[86, 618], [98, 620 + dy * 0.4], [104, 626 + dy]] });
  }
  if (style === 'frill_skirt') {
    // A gathered ruffle over the brief, scalloped at the hem: the notches rise between the bumps.
    S.push({ layer: L, sym: true, fill: 'main:v', line: 'main', pattern: true,
      pts: [[0, 616], [40, 610], [78, 618, 1], [98, 650], [104, 682, 1], [88, 676], [78, 696, 1], [58, 684], [44, 700, 1], [24, 686], [10, 702, 1], [0, 694]] });
    S.push({ layer: L, sym: true, closed: false, line: 'main', sw: 1.2, opacity: 0.5, pts: [[0, 630], [44, 624], [92, 640]] });
  }
  return S;
}

register({
  id: 'bikini', slot: 'inner', label: 'bikini', tags: ['swimwear'],
  channels: { main: '#e8506a' },
  options: { top: ['triangle', 'bandeau', 'halter', 'sporty', 'frill'], bottom: ['brief', 'side_tie', 'high_waist', 'frill_skirt', 'boyshorts'] },
  covers: () => [],
  // Tall enough for the boyshorts' hem, which sits at y 760; at 460 the crop cut across it and the
  // shorts looked like a skirt in every preview.
  view: [80, 280, 440, 510],
  build: o => [...braShapes(o.top), ...briefShapes(o.bottom)],
});

register({
  id: 'swimsuit', slot: 'inner', label: 'one-piece swimsuit, school swimsuit', tags: ['swimwear', 'school'],
  channels: { main: '#27335c', trim: '#ffffff' },
  flags: { piping: true, side_panels: false },
  options: { cut: ['classic', 'high_leg', 'cutout'] },
  notes: 'trim = piping along the edges and the side panels',
  presets: { school_swimsuit: {}, one_piece_swimsuit: { piping: false }, leotard: { piping: false }, competition_swimsuit: { side_panels: true } },
  covers: o => [{ target: 'torso', y: [415, o.cut === 'cutout' ? 470 : o.cut === 'high_leg' ? 612 : 640] }],
  view: [80, 280, 440, 460],
  build(o) {
    // high_leg cuts the leg opening higher up the hip; cutout pulls the side in at the waist so the
    // middle of the body shows between the bust band and the hip, the way a monokini does.
    const side = o.cut === 'cutout'
      ? [...sideRun(440, 470, 1.2), [70, 484], [52, 500], [38, 520], [32, 552], [32, 578], [40, 598], [58, 612], [78, 632]]
      : sideRun(440, 610, 1.2);
    const leg = o.cut === 'high_leg' ? [[92.5, 618, 1], [70, 640], [34, 670], [10, 692], [0, 700]] : [[92.5, 651, 1], [62, 673], [30, 695], [8, 704.5], [0, 706]];
    const pts = [[0, 378], [20, 368], [31, 338], [33, shoulderY(33), 1], [47, shoulderY(47), 1], [50, 342], [61, 374], [77, 401, 1], ...side, ...leg];
    const S = [{ id: 'suit', role: 'main', layer: L, sym: true, fill: 'main', line: 'main', pattern: true, pts }];
    S.push({ layer: L, clip: 'suit', soft: true, fill: 'main.shadow', pts: [[79, 401, 1], ...side.map(p => [p[0] + 2, p[1]]), [94, 651, 1], [80, 660, 1], ...side.slice().reverse().map(p => [p[0] - 10, p[1]])] });
    S.push(...bustShading('suit', 'main', L, 'skin'));
    if (o.side_panels) {
      // A competition suit: a solid panel down each side, in the trim colour.
      const sd = sideRun(414, 640, 1.2);
      S.push({ layer: L, mirror: true, clip: 'suit', fill: 'trim', pts: [...sd, ...sd.slice().reverse().map(p => [p[0] - 16, p[1]])] });
      S.push({ layer: L, mirror: true, clip: 'suit', closed: false, stroke: 'trim', sw: 1.2, pts: sd.map(p => [p[0] - 17, p[1]]) });
    }
    if (o.piping) {
      S.push({ layer: L, mirror: true, clip: 'suit', closed: false, stroke: 'trim', sw: 2, pts: [[0, 381], [20, 371], [33, 340], [35, shoulderY(35) + 2]] });
      // Follows whatever the leg opening is, so high_leg keeps its piping.
      S.push({ layer: L, mirror: true, clip: 'suit', closed: false, stroke: 'trim', sw: 2, pts: leg.slice(0, -1).map(([x, y]) => [x - 2, y - 2]) });
    }
    return S;
  },
});

// A sarong: cloth wrapped at the hip, hem on the diagonal, knotted on the right.
register({
  id: 'sarong', slot: 'bottom', label: 'sarong, wrap skirt tied at the hip', tags: ['swimwear'],
  channels: { main: '#f0e2cd', trim: '#c98a5b' },
  notes: 'trim = the band above the hem',
  covers: () => [{ target: 'torso', y: [566, 690] }],
  view: [30, 520, 500, 430],
  build() {
    // Both sides come off the torso profile with the same ease. Written by hand, the left one sat a
    // few units inside the right, and the body showed through on wide hips.
    const topY = 562, sideOut = sideRun(topY, 700, 3);
    const S = [
      // One length of cloth round the hips. The hem runs high on the knotted side and low on the
      // other, which is what makes it read as wrapped rather than as a short skirt.
      {
        id: 'sarong', role: 'main', layer: 'bottom', fit: 'skirt', fill: 'main:v', line: 'main', pattern: true,
        pts: [[0, 552], [torsoSide(topY) + 3, topY, 1], ...sideOut.filter(([, y]) => y > topY),
          [104, 748, 1], [60, 790], [0, 824], [-60, 862], [-104, 900, 1],
          ...sideOut.slice().reverse().map(([x, y]) => [-x, y])],
      },
      // The overlap edge, running from the knot down across the front.
      { layer: 'bottom', fit: 'skirt', clip: 'sarong', closed: false, line: 'main', sw: 1.6, opacity: 0.75,
        pts: [[80, 578], [62, 640], [46, 720], [30, 800], [18, 862]] },
      { layer: 'bottom', fit: 'skirt', clip: 'sarong', closed: false, line: 'main', sw: 1.2, opacity: 0.45,
        pts: [[92, 660], [76, 730], [50, 812], [26, 872]] },
      // Knot on the right hip, with the two ends of the wrap hanging from it.
      { layer: 'bottom', fit: 'skirt', fill: 'main', line: 'main', pts: [[72, 566], [90, 570], [92, 584], [74, 580]] },
      { layer: 'bottom', fit: 'skirt', fill: 'main', line: 'main', pts: [[80, 580], [92, 604], [88, 646], [78, 640]] },
      { layer: 'bottom', fit: 'skirt', fill: 'main', line: 'main', pts: [[70, 580], [62, 606], [56, 636], [46, 630]] },
      // Band above the hem, parallel to it.
      { layer: 'bottom', fit: 'skirt', clip: 'sarong', fill: 'trim', line: 'trim',
        pts: [[104, 736], [60, 778], [0, 812], [-60, 850], [-104, 888], [-104, 900], [-60, 862], [0, 824], [60, 790], [104, 748]] },
    ];
    return S;
  },
});

// Drawn automatically wherever nothing else covers; not offered to the LLM.
register({
  id: 'underwear', slot: 'inner', label: 'underwear', hidden: true,
  channels: { main: '#ffffff' },
  options: { parts: ['both', 'top', 'bottom'] },
  covers: () => [],
  view: [80, 280, 440, 460],
  build: o => [...(o.parts !== 'bottom' ? braShapes('triangle') : []), ...(o.parts !== 'top' ? briefShapes('brief') : [])],
});

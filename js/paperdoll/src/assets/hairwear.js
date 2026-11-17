// Hair accessories: the first items in the `head` slot. They sit on the `headwear` layer, above the
// front hair, and use fit 'hair' so they follow the head and not the bust or the waist.
// The head in template coordinates: crown y 72, hair top y ~50, face half-width ~68 at the eyes.
import { register } from '../registry.js';
import { ellipse } from '../geom.js';

const L = 'headwear', HAIR = 'hair';
// Where a ribbon or clip sits: a temple, or the crown.
const AT = { right: [62, 118], left: [-62, 118], top: [0, 60] };
const spots = p => (p === 'both' ? [AT.left, AT.right] : [AT[p]]);
const view = [140, 20, 320, 250];

// A bow: two loops either side of a knot, with a fold line inside each loop.
function bow(cx, cy) {
  const loop = sx => [[cx + 2 * sx, cy], [cx + 15 * sx, cy - 9], [cx + 21 * sx, cy - 1], [cx + 16 * sx, cy + 8]];
  return [
    { layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 1.2, pts: loop(-1) },
    { layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 1.2, pts: loop(1) },
    { layer: L, fit: HAIR, anchor: [cx, cy], fill: 'main', line: 'main', sw: 1.2, pts: ellipse(cx, cy, 3.4, 4, 10) },
    { layer: L, fit: HAIR, closed: false, line: 'main', sw: 1, opacity: 0.45, pts: [[cx + 5, cy + 1], [cx + 15, cy - 2]] },
    { layer: L, fit: HAIR, closed: false, line: 'main', sw: 1, opacity: 0.45, pts: [[cx - 5, cy + 1], [cx - 15, cy - 2]] },
  ];
}

register({
  id: 'hair_ribbon', slot: 'head', label: 'hair ribbon, bow tied in the hair', tags: ['school', 'modern'],
  channels: { main: '#b3283c' },
  options: { position: ['right', 'left', 'both', 'top'] },
  defaults: { position: 'right' },
  covers: () => [],
  view,
  build: o => spots(o.position).flatMap(([x, y]) => bow(x, y)),
});

// A headband seen from the front is a crescent, not a hoop: it crosses the crown and tapers away
// where it passes the temples, so its ends are never visible. Drawn as one closed loop rather than
// a `sym` half, because a symmetric half leaves a stroked seam at the centerline that reads as a
// bulge in the middle of the band. The outer edge follows the skull outline from frontPts().
const SKULL = [[30, 55], [55, 68], [74, 92], [84, 125], [86, 142]];
export function band(thick) {
  const outer = [...SKULL.slice().reverse().map(([x, y]) => [-x, y]), [0, 52], ...SKULL];
  const inner = outer.slice().reverse().map(([x, y]) => [x, y + thick]);
  // Leave out both ends of the inner edge: the outer and inner edges then meet at (+-88, 152),
  // which tapers the band to a point where it passes the head, instead of ending in a cut edge.
  return [...outer, ...inner.slice(1, -1)];
}
// The same path a `thick` lower, used for the line that seats the band in the hair.
function bandInner(thick) {
  const outer = [...SKULL.slice().reverse().map(([x, y]) => [-x, y]), [0, 52], ...SKULL];
  return outer.slice(1, -1).map(([x, y]) => [x, y + thick * 0.9]);
}

register({
  id: 'hairband', slot: 'head', label: 'hairband, Alice band', tags: ['school', 'modern'],
  channels: { main: '#f4efe6' },
  options: { style: ['thin', 'wide'] },
  defaults: { style: 'thin' },
  covers: () => [],
  view,
  build: o => {
    const t = o.style === 'wide' ? 18 : 9;
    return [
      // No outline: the outer edge is the head's own silhouette, so stroking it would draw a second
      // edge just outside the hair. The fill alone contrasts with the hair.
      { id: 'band', layer: L, fit: HAIR, fill: 'main:v', pts: band(t) },
      { layer: L, fit: HAIR, closed: false, line: 'main', sw: 1.2, opacity: 0.45, pts: bandInner(t) },
    ];
  },
});

// A clip: a slanted bar, or a small flower of five petals.
function bar(cx, cy) {
  return [[cx - 13, cy + 2], [cx + 11, cy - 2], [cx + 13, cy + 3], [cx - 11, cy + 7]];
}
function flower(cx, cy) {
  const petals = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    petals.push(ellipse(cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, 5, 5, 10));
  }
  return petals;
}

register({
  id: 'hairclip', slot: 'head', label: 'hair clip, hair pin', tags: ['school', 'modern'],
  channels: { main: '#e8d27a' },
  options: { position: ['right', 'left', 'both'], style: ['bar', 'flower'] },
  defaults: { position: 'right', style: 'bar' },
  covers: () => [],
  view,
  build: o => spots(o.position).flatMap(([x, y]) => (o.style === 'bar'
    ? [{ layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 1.1, pts: bar(x, y) }]
    : [
      ...flower(x, y).map(pts => ({ layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 1, pts })),
      { layer: L, fit: HAIR, anchor: [x, y], fill: 'main.hi', pts: ellipse(x, y, 3.2, 3.2, 8) },
    ])),
});

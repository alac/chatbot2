// Glasses. The first item in the `eyewear` slot, drawn above the front hair (the temple arms cross
// it) and below a hat. The lens is tinted through `trim`, so a clear pair and sunglasses are the
// same drawing at different opacities rather than two shapes.
import { register } from '../registry.js';
import { Y } from '../template.js';
import { ellipse } from '../geom.js';

const EX = 35, EY = Y.eye;   // eye centre at x +-35; the face half-width there is about 67
const L = 'eyewear';

// Lens outlines, drawn for the right eye and mirrored. Round lenses are ellipses, the rest are
// rounded rectangles; `sunglasses` is the box grown by a couple of units.
const BOX = [[14, 181, 1], [56, 180, 1], [58, 190], [58, 203], [56, 213, 1], [14, 214, 1], [12, 203], [12, 190]];
const BIGBOX = [[11, 179, 1], [58, 177, 1], [61, 190], [61, 205], [58, 216, 1], [11, 217, 1], [9, 204], [9, 190]];
const ROUND = ellipse(EX, EY, 22, 17, 16);

const LENS = {
  round: { pts: ROUND, outer: 56, tint: 0.14, sw: 2, rim: null },
  square: { pts: BOX, outer: 58, tint: 0.14, sw: 2, rim: null },
  half_rim: { pts: ROUND, outer: 56, tint: 0.12, sw: 2, rim: [[12, EY], [15, 183], [EX, 179], [55, 183], [58, EY]] },
  sunglasses: { pts: BIGBOX, outer: 61, tint: 0.86, sw: 2.4, rim: null, dark: true },
};

register({
  id: 'glasses', slot: 'eyewear', label: 'glasses, spectacles, sunglasses', tags: ['modern', 'school'],
  channels: { main: '#3a3440', trim: '#8fa6c4' },
  options: { shape: Object.keys(LENS) },
  defaults: { shape: 'round' },
  notes: 'trim = lens tint: keep it light for clear lenses, dark for sunglasses',
  covers: () => [],   // nothing is meant to be hidden; the eye shows through the lens
  view: [195, 140, 210, 110],
  build: o => {
    const l = LENS[o.shape];
    return [
      // A dark lens takes the frame colour rather than the tint: a tint light enough to read as
      // clear glass would leave sunglasses looking like plain glasses.
      { id: 'lens', layer: L, mirror: true, fit: 'hair', fill: l.dark ? 'main.deep' : 'trim', opacity: l.tint, pts: l.pts },
      // The rim: the whole lens outline, or only the top arc on a half rim.
      l.rim
        ? { layer: L, mirror: true, fit: 'hair', closed: false, line: 'main', sw: l.sw, pts: l.rim }
        : { layer: L, mirror: true, fit: 'hair', closed: false, line: 'main', sw: l.sw, pts: l.pts },
      // Bridge over the nose, and the arm running back to the side of the face. The bridge is
      // mirrored like the lenses: without it only the right half is drawn and the glasses have an
      // arch on one side of the nose.
      { layer: L, mirror: true, fit: 'hair', closed: false, line: 'main', sw: l.sw, pts: [[12, EY - 5], [6, EY - 7.5], [0, EY - 8]] },
      { layer: L, mirror: true, fit: 'hair', closed: false, line: 'main', sw: l.sw, pts: [[l.outer, EY - 4], [63, EY - 7], [68, EY - 9]] },
      ...(o.shape === 'sunglasses'
        ? [{ layer: L, mirror: true, fit: 'hair', clip: 'lens', only: 'shaded', fill: 'glow', opacity: 0.3, pts: [[22, 187, 1], [32, 183], [37, 190]] }]
        : []),
    ];
  },
});

// Hats. Slot `head`, on the `headwear` layer, fit 'hair'. Each is drawn larger than the head so it
// covers the top of the hair: the skull outline starts at (0, 52) and the front hair fills from
// there, so a hat that begins at y 35 reads as worn over it.
import { register } from '../registry.js';
import { ellipse } from '../geom.js';

const L = 'headwear', HAIR = 'hair';
const view = [110, 0, 380, 300];

register({
  id: 'beanie', slot: 'head', label: 'beanie, knit hat, watch cap', tags: ['modern', 'school'],
  channels: { main: '#a8564f' },
  options: { style: ['folded', 'plain'] },
  defaults: { style: 'folded' },
  notes: 'A folded beanie shows the deeper band at the bottom',
  covers: () => [],
  view,
  build: o => {
    const S = [
      { id: 'hat', layer: L, sym: true, fit: HAIR, fill: 'main:v', line: 'main', pts: [[0, 34], [30, 37], [58, 50], [80, 80], [90, 116], [93, 152], [0, 154]] },
      // Knit ribs down the side.
      { layer: L, mirror: true, fit: HAIR, clip: 'hat', closed: false, line: 'main', sw: 1, opacity: 0.35, pts: [[28, 42], [34, 90], [38, 146]] },
      { layer: L, mirror: true, fit: HAIR, clip: 'hat', closed: false, line: 'main', sw: 1, opacity: 0.35, pts: [[58, 56], [66, 100], [70, 148]] },
    ];
    if (o.style === 'folded') {
      S.push({ id: 'band', layer: L, sym: true, fit: HAIR, fill: 'main.shadow', line: 'main', sw: 1.2, pts: [[0, 120], [88, 118, 1], [94, 154, 1], [0, 158]] });
      for (let x = 10; x < 88; x += 12) S.push({ layer: L, mirror: true, fit: HAIR, clip: 'band', closed: false, line: 'main', sw: 1, opacity: 0.4, pts: [[x, 122], [x + 2, 154]] });
    }
    return S;
  },
});

register({
  id: 'cap', slot: 'head', label: 'cap, baseball cap', tags: ['modern'],
  channels: { main: '#3f5f8a' },
  covers: () => [],
  view,
  build: () => [
    { id: 'hat', layer: L, sym: true, fit: HAIR, fill: 'main:v', line: 'main', pts: [[0, 32], [32, 36], [62, 51], [80, 82], [87, 114], [0, 118]] },
    { layer: L, mirror: true, fit: HAIR, clip: 'hat', closed: false, line: 'main', sw: 1, opacity: 0.4, pts: [[22, 42], [38, 74], [44, 110]] },
    // The visor, wider than the head and lower than the crown.
    { layer: L, sym: true, fit: HAIR, fill: 'main.shadow', line: 'main', sw: 1.3, pts: [[0, 104], [42, 106], [80, 114], [97, 126, 1], [92, 139, 1], [44, 129], [0, 125]] },
    { layer: L, fit: HAIR, anchor: [0, 34], fill: 'main.hi', pts: ellipse(0, 34, 3.4, 3, 8) },
  ],
});

register({
  id: 'beret', slot: 'head', label: 'beret', tags: ['modern', 'school'],
  channels: { main: '#b23a48' },
  covers: () => [],
  view,
  build: () => [
    { id: 'hat', layer: L, fit: HAIR, fill: 'main:v', line: 'main', pts: [[-74, 96], [-52, 66], [-16, 48], [24, 46], [62, 58], [80, 82], [74, 106], [34, 118], [-16, 116], [-52, 108]] },
    { layer: L, fit: HAIR, clip: 'hat', soft: true, fill: 'main.shadow', opacity: 0.45, pts: [[-70, 96], [-30, 110], [26, 112], [70, 100], [66, 116], [20, 124], [-30, 122]] },
    { layer: L, fit: HAIR, anchor: [22, 46], fill: 'main.shadow', line: 'main', sw: 1.2, pts: ellipse(22, 46, 4, 5, 10) },
  ],
});

register({
  id: 'straw_hat', slot: 'head', label: 'straw hat, sun hat', tags: ['modern', 'swimwear'],
  channels: { main: '#e6cd93', trim: '#c2453f' },
  notes: 'trim = the ribbon round the crown',
  covers: () => [],
  view: [60, 0, 480, 320],
  build: () => [
    // The brim does the hiding: it is wider than the hair at every height the hair occupies, so the
    // crown only has to be big enough to sit over the skull.
    { id: 'brim', layer: L, sym: true, fit: HAIR, fill: 'main:v', line: 'main', pts: [[0, 100], [53, 102], [101, 112], [130, 126, 1], [139, 140, 1], [117, 148, 1], [64, 135], [0, 132]] },
    { layer: L, sym: true, fit: HAIR, clip: 'brim', closed: false, line: 'main', sw: 1, opacity: 0.35, pts: [[0, 118], [68, 123], [123, 137]] },
    { layer: L, sym: true, fit: HAIR, clip: 'brim', closed: false, line: 'main', sw: 1, opacity: 0.3, pts: [[0, 108], [73, 113], [130, 129]] },
    { id: 'crown', layer: L, sym: true, fit: HAIR, fill: 'main:v', line: 'main', pts: [[0, 20], [33, 24], [62, 38], [77, 68], [81, 102], [0, 106]] },
    { layer: L, sym: true, fit: HAIR, clip: 'crown', fill: 'trim', line: 'trim', pts: [[0, 80], [79, 78], [81, 98], [0, 101]] },
    { layer: L, sym: true, fit: HAIR, clip: 'crown', closed: false, line: 'main', sw: 1, opacity: 0.4, pts: [[-33, 32], [-40, 72], [-44, 98]] },
  ],
});

register({
  id: 'kanzashi', slot: 'head', label: 'kanzashi, hair ornament', tags: ['japanese'],
  channels: { main: '#c9425c', trim: '#e8c25c' },
  notes: 'trim = the pin',
  covers: () => [],
  view: [40, 40, 520, 300],
  build: () => [
    // A pin through the side of the hair with a cluster of small blossoms on it.
    { layer: L, fit: HAIR, fill: 'trim', line: 'trim', pts: [[52, 150, 1], [58, 146, 1], [96, 96, 1], [90, 92, 1]] },
    { layer: L, fit: HAIR, anchor: [86, 96], fill: 'main', line: 'main', sw: 1, pts: ellipse(86, 96, 11, 11, 5) },
    { layer: L, fit: HAIR, anchor: [86, 96], fill: 'trim', line: 'trim', sw: 0.8, pts: ellipse(86, 96, 3.4, 3.4, 6) },
    { layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 0.9, pts: ellipse(70, 116, 7, 7, 5) },
    { layer: L, fit: HAIR, fill: 'trim', line: 'trim', sw: 0.7, pts: ellipse(70, 116, 2.2, 2.2, 5) },
    { layer: L, fit: HAIR, fill: 'main', line: 'main', sw: 0.9, pts: ellipse(98, 118, 6, 6, 5) },
    { layer: L, fit: HAIR, fill: 'trim', line: 'trim', sw: 0.7, pts: ellipse(98, 118, 2, 2, 5) },
    { layer: L, fit: HAIR, fill: 'trim', line: 'trim', sw: 0.7, pts: ellipse(84, 104, 2.4, 2.4, 5) },
  ],
});

// Neck accessories. Bows are rigid: they follow SEAM.bow and keep their drawn form.
import { register } from '../registry.js';
import { SEAM } from '../template.js';

const L = 'neck', A = SEAM.bow;
const view = [150, 250, 300, 320];
const covers = () => [];

register({
  id: 'neck_ribbon', slot: 'neck', label: 'ribbon bow at the collar', tags: ['school'],
  channels: { main: '#cf3550' },
  presets: { ribbon: {}, bow: {}, bow_tie: {} },
  covers, view,
  build: () => [
    { layer: L, mirror: true, fit: 'loose', anchor: A, fill: 'main', line: 'main', pts: [[1, 418, 1], [11, 446], [21, 476, 1], [11, 470, 1], [5, 479, 1], [-1, 448], [-3, 418, 1]] },
    { id: 'bow', layer: L, mirror: true, fit: 'loose', anchor: A, fill: 'main', line: 'main', pts: [[4, 408, 1], [20, 395], [40, 396], [46, 410], [40, 426], [21, 425], [4, 417, 1]] },
    { layer: L, mirror: true, fit: 'loose', anchor: A, clip: 'bow', fill: 'main.shadow', pts: [[4, 410, 1], [18, 408.5], [31, 411, 1], [18, 415], [4, 415, 1]] },
    { layer: L, fit: 'loose', anchor: A, fill: 'main', line: 'main', pts: [[-6, 404], [6, 404], [7.5, 412.5], [6, 421], [-6, 421], [-7.5, 412.5]] },
  ],
});

register({
  id: 'necktie', slot: 'neck', label: 'necktie', tags: ['school', 'modern'],
  channels: { main: '#8c2f3c' },
  presets: { tie: {} },
  covers, view: [150, 250, 300, 380],
  build: () => [
    // The blade hangs over the chest, so it follows the body instead of staying rigid.
    { id: 'blade', layer: L, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts: [[-5, 352, 1], [5, 352, 1], [10, 500, 1], [0, 516, 1], [-10, 500, 1]] },
    { layer: L, fit: 'loose', clip: 'blade', fill: 'main.shadow', pts: [[1, 352, 1], [6, 352, 1], [11, 500, 1], [1, 516, 1]] },
    { layer: L, fit: 'loose', fill: 'main', line: 'main', pts: [[-7, 338, 1], [7, 338, 1], [5, 353, 1], [-5, 353, 1]] },
  ],
});

register({
  id: 'choker', slot: 'neck', label: 'choker, neck band', tags: ['modern'],
  channels: { main: '#1f1c22' },
  covers, view: [180, 200, 240, 200],
  build: () => [{ layer: L, sym: true, fill: 'main', line: 'main', pts: [[0, 289], [22, 284.5, 1], [22.6, 292, 1], [0, 297]] }],
});

register({
  id: 'scarf', slot: 'neck', label: 'scarf, winter scarf, muffler', tags: ['modern'],
  channels: { main: '#c8543f', trim: '#f0e6d2' },
  notes: 'trim = the stripe across the end',
  presets: { muffler: {} },
  covers, view: [130, 240, 340, 300],
  build: () => [
    // Wrapped round the neck; the ends hang over the chest, so they follow the body.
    { id: 'wrap', layer: L, sym: true, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts: [[0, 268], [18, 270, 1], [24, 288], [21, 306, 1], [0, 312]] },
    { layer: L, sym: true, fit: 'loose', closed: false, stroke: 'main', sw: 1.1, opacity: 0.55, pts: [[0, 282], [16, 280], [22, 288]] },
    { id: 'end', layer: L, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts: [[6, 306], [24, 302, 1], [34, 360], [30, 426, 1], [10, 434], [4, 374]] },
    { layer: L, clip: 'end', fill: 'trim', pts: [[31, 410], [9, 418], [10, 430], [32, 422]] },
    { layer: L, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts: [[-5, 308], [-22, 304, 1], [-30, 348], [-14, 358], [-5, 352]] },
  ],
});

register({
  // Shares the neck slot with the choker on purpose: a necklace under a choker reads as clutter, so
  // wearing one means not wearing the other.
  id: 'necklace', slot: 'neck', label: 'necklace, pendant, chain', tags: ['modern'],
  channels: { main: '#d8b75c', accent: '#2f6bd8' },
  notes: 'accent = the stone in the pendant',
  presets: { pendant: {} },
  covers, view: [160, 270, 280, 210],
  build: () => [
    // The chain lies on the collarbones, so it follows the chest rather than staying rigid.
    { layer: L, sym: true, fit: 'loose', closed: false, stroke: 'main', sw: 1.5, pts: [[24, 298], [19, 316], [9, 334], [0, 342]] },
    { layer: L, closed: false, stroke: 'main', sw: 1.2, pts: [[0, 341], [0, 347]] },
    { layer: L, fill: 'accent', line: 'main', sw: 0.8, pts: [[0, 345], [5, 353], [0, 363], [-5, 353]] },
  ],
});

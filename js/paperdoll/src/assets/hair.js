// Hair is three parts chosen independently: back (length), sides (lock length), bangs (style).
// Hair is not an outfit item; it lives under spec.hair.
import { lin } from '../geom.js';

export const HAIR_OPTIONS = {
  back: ['bob', 'shoulder', 'chest', 'waist', 'hip', 'thigh'],
  sides: ['chin', 'shoulder', 'chest'],
  bangs: ['tufted', 'straight'],
};
// Other words an LLM may use, mapped to what exists.
export const HAIR_ALIASES = {
  back: { short: 'bob', medium: 'shoulder', mid_back: 'waist', long: 'hip', very_long: 'thigh', neck: 'bob', knee: 'thigh' },
  sides: { short: 'chin', long: 'chest', medium: 'shoulder', none: 'chin' },
  bangs: { hime: 'straight', blunt: 'straight', flat: 'straight', choppy: 'tufted', messy: 'tufted', wispy: 'tufted' },
};
export const HAIR_DEFAULTS = { back: 'hip', sides: 'shoulder', bangs: 'tufted' };

const BACK_END = { bob: 305, shoulder: 372, chest: 470, waist: 590, hip: 715, thigh: 850 };
const SIDE_END = { chin: 282, shoulder: 346, chest: 440 };

// Outer edge of the hair mass behind the body, by height.
const backOuter = lin([[130, 92], [180, 97], [250, 100], [330, 106], [420, 116], [510, 126], [590, 132], [650, 130], [850, 132]]);

function backPts(end) {
  const pts = [[0, 50], [32, 53], [60, 68], [80, 94], [92, 130]];
  for (const y of [180, 250, 330, 420, 510, 590, 650, 760]) if (y < end - 55) pts.push([backOuter(y), y]);
  // Short cuts curl in at the ends; long hair ends in loose tips.
  const w = backOuter(end - 50) - (end < 400 ? 4 : 0);
  const tips = [0.93, 0.8, 0.64, 0.43, 0.18], notches = [0.88, 0.72, 0.54, 0.32, 0.09];
  tips.forEach((t, i) => {
    pts.push([w * t, end - (i % 2 ? 0 : 12) + (i === 2 ? 8 : 0), 1]);
    pts.push([w * notches[i], end - (end < 400 ? 22 : 48)]);
  });
  pts.push([0, end - (end < 400 ? 18 : 30)]);
  return pts;
}

const BANGS = {
  tufted: [
    [59, 166, 1], [55, 170], [51, 175, 1], [47, 166], [44, 155, 1], [40, 163], [34, 170, 1], [29, 162], [25, 153, 1],
    [20, 162], [13, 169, 1], [7, 162], [0, 156],
  ],
  straight: [[59, 166, 1], [57, 172, 1], [45, 173.5], [37, 173, 1], [36, 170, 1], [35, 173, 1], [20, 174], [9, 173.5, 1], [8, 170.5, 1], [7, 173.5, 1], [0, 174]],
};

function frontPts(sideEnd, bangs) {
  // Side lock: outer edge down to the tip, inner edge back up. Heights are stretched to the tip.
  const k = y => 190 + (y - 190) * (sideEnd - 190) / (346 - 190);
  const lock = [[89, 210], [87, 255], [83, 295], [78, 325], [72, 346, 1], [70, 318], [68, 285], [65, 250], [62, 215]].map(p => [p[0], k(p[1]), p[2] || 0]);
  return [[0, 52], [30, 55], [55, 68], [74, 92], [84, 125], [88, 165], ...lock, [61, 190, 1], ...BANGS[bangs]];
}

const SHINE = [
  [0, 90], [30, 93], [58, 105], [80, 126, 1], [75, 137, 1], [68, 120, 1], [61, 141, 1], [52, 116, 1],
  [45, 128, 1], [37, 110, 1], [29, 133, 1], [20, 107, 1], [12, 121, 1], [5, 104, 1], [0, 112, 1],
];

export function hairShapes(hair) {
  const S = [], add = s => S.push(s);
  const end = BACK_END[hair.back], sideEnd = SIDE_END[hair.sides];
  const front = frontPts(sideEnd, hair.bangs);
  const F = { layer: 'hairFront', fit: 'hair' };

  add({ id: 'hairBack', layer: 'hairBack', sym: true, fit: 'hair', pts: backPts(end), fill: 'hair:back', line: 'hair' });
  // Shadow the fringe casts on the forehead.
  add({ layer: 'face', sym: true, fit: 'hair', clip: 'face', soft: true, fill: 'skin.shadow', offset: [0, 7], pts: front });
  add({ id: 'hairFront', ...F, sym: true, pts: front, fill: 'hair:v', line: 'hair' });
  add({ ...F, sym: true, clip: 'hairFront', fill: 'hair.shadow', opacity: 0.7, soft: true, pts: [[0, 40], [60, 40, 1], [96, 100], [100, 200], [96, 300], [90, 450, 1], [84, 300], [86, 200], [80, 120], [52, 72], [0, 62]] });
  add({ ...F, sym: true, clip: 'hairFront', fill: 'hair.hi', opacity: 0.42, pts: SHINE });
  if (sideEnd > 300) add({ ...F, mirror: true, clip: 'hairFront', only: 'shaded', fill: 'hair.hi', opacity: 0.3, pts: [[76, 232, 1], [80, 262], [79, 296, 1], [76, 262]] });
  const strands = [
    [[3, 62], [7, 110], [9, 158]], [[14, 62], [25, 108], [29, 158]], [[28, 64], [46, 104], [50, 162]],
    [[48, 70], [72, 112], [80, 180], [82, 190 + (sideEnd - 190) * 0.45], [77, sideEnd - 16]],
  ];
  strands.forEach((p, i) => add({ ...F, mirror: i > 0, clip: 'hairFront', closed: false, line: 'hair', sw: 1.1, opacity: 0.55, pts: p }));
  return S;
}

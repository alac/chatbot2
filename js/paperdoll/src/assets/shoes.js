// Footwear. All share the same sole outline, so variants only change what sits on top of it.
import { register } from '../registry.js';
import { ellipse } from '../geom.js';
import { legPts } from '../template.js';

const SHOE = [[19, 1386, 1], [13, 1414], [12, 1437], [23, 1450], [47, 1451], [64, 1440], [65, 1418], [52, 1388, 1], [36, 1399]];
const SOLE = [[10, 1439, 1], [23, 1446], [47, 1447], [66, 1436, 1], [66, 1456, 1], [10, 1456, 1]];
const L = 'shoes';

const base = (soleFill = 'main.deep') => [
  { id: 'shoe', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: SHOE },
  { layer: L, mirror: true, clip: 'shoe', fill: soleFill, pts: SOLE },
  { layer: L, mirror: true, clip: 'shoe', only: 'shaded', fill: 'glow', opacity: 0.45, pts: ellipse(34, 1432, 13, 5) },
];
const view = [120, 1000, 360, 480];
const covers = () => [];
// The foot is small in the shared crop, which is sized for boots; these two show the foot only.
const footView = [140, 1340, 250, 150];
// A sandal thong: two straps from the sole's edges meeting over the toe split, plus the toe piece
// between the toes. One strap that stops mid-foot reads as a stick lying on the foot.
const thong = (fill = 'trim') => [
  { layer: L, mirror: true, fill, line: fill, sw: 0.7, pts: [[11, 1444], [18, 1447], [30, 1435], [25, 1428]] },
  { layer: L, mirror: true, fill, line: fill, sw: 0.7, pts: [[63, 1442], [67, 1438], [31, 1426], [26, 1430]] },
  { layer: L, mirror: true, fill, line: fill, sw: 0.7, pts: [[23, 1432], [31, 1430], [29, 1451], [23, 1452]] },
  { layer: L, mirror: true, anchor: [27, 1430], fill, line: fill, sw: 0.5, pts: ellipse(27, 1430, 4.6, 4, 6) },
];

register({
  id: 'loafers', slot: 'shoes', label: 'loafers, school shoes', tags: ['school', 'modern'], channels: { main: '#5b3b2c' },
  covers, view,
  build: () => [...base(), { layer: L, mirror: true, closed: false, line: 'main', sw: 1.4, pts: [[15, 1411], [38, 1421], [62, 1408]] }],
});

register({
  id: 'mary_janes', slot: 'shoes', label: 'strap shoes', tags: ['school', 'modern'], channels: { main: '#26222a' },
  covers, view,
  build: () => [
    ...base(),
    { layer: L, mirror: true, fill: 'main', line: 'main', sw: 1.2, pts: [[17, 1393, 1], [36, 1403], [53, 1393, 1], [53.5, 1400, 1], [36, 1410], [16.5, 1400, 1]] },
  ],
});

register({
  id: 'sneakers', slot: 'shoes', label: 'sneakers, trainers', tags: ['modern'], channels: { main: '#f2f2f2', trim: '#d8475a' },
  notes: 'trim = toe cap and stripe',
  covers, view,
  build: () => [
    ...base('#f4f4f4'),
    { layer: L, mirror: true, clip: 'shoe', fill: 'trim', line: 'trim', sw: 1, pts: [[10, 1428, 1], [24, 1423], [48, 1423], [68, 1426, 1], [68, 1440, 1], [10, 1442, 1]] },
    ...[1404, 1411, 1418].map(y => ({ layer: L, mirror: true, clip: 'shoe', closed: false, line: 'main', sw: 1.3, pts: [[26, y + 2], [37, y + 5], [48, y]] })),
  ],
});

const sole = () => [
  { id: 'shoe', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: SOLE },
  { layer: L, mirror: true, clip: 'shoe', only: 'shaded', fill: 'glow', opacity: 0.4, pts: ellipse(34, 1447, 13, 3) },
];

register({
  id: 'sandals', slot: 'shoes', label: 'sandals, strappy shoes', tags: ['modern', 'swimwear'], channels: { main: '#9c6b4a' },
  covers, view: footView,
  build: () => [
    ...sole(),
    { layer: L, mirror: true, fill: 'main', line: 'main', sw: 1, pts: [[15, 1421, 1], [36, 1427], [59, 1419, 1], [59, 1428, 1], [36, 1436], [15, 1430, 1]] },
    { layer: L, mirror: true, fill: 'main', line: 'main', sw: 1, pts: [[14, 1399, 1], [36, 1405], [62, 1397, 1], [62, 1406, 1], [36, 1414], [14, 1408, 1]] },
  ],
});

const PUMP = [[20, 1391, 1], [14, 1412], [13, 1436], [24, 1449], [46, 1450], [62, 1438], [63, 1414], [51, 1390, 1], [36, 1405]];
register({
  id: 'heels', slot: 'shoes', label: 'heels, pumps, high heels', tags: ['modern'], channels: { main: '#26222a' },
  covers, view: footView,
  build: () => [
    { id: 'shoe', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: PUMP },
    { layer: L, mirror: true, clip: 'shoe', fill: 'main.deep', pts: SOLE },
    { layer: L, mirror: true, fill: 'main.deep', line: 'main', sw: 1, pts: [[30, 1448, 1], [41, 1448, 1], [37, 1463, 1], [31, 1463, 1]] },
    { layer: L, mirror: true, clip: 'shoe', only: 'shaded', fill: 'glow', opacity: 0.4, pts: ellipse(34, 1434, 11, 4) },
  ],
});

register({
  id: 'uwabaki', slot: 'shoes', label: 'uwabaki, indoor school shoes', tags: ['school'], channels: { main: '#f7f7f7', trim: '#4a6fb5' },
  notes: 'trim = the toe cap',
  covers, view: footView,
  build: () => [
    ...base('#f0f0f0'),
    { layer: L, mirror: true, clip: 'shoe', fill: 'trim', line: 'trim', sw: 1, pts: [[10, 1427, 1], [24, 1421], [48, 1421], [66, 1426, 1], [66, 1444, 1], [10, 1444, 1]] },
    { layer: L, mirror: true, clip: 'shoe', closed: false, line: 'main', sw: 1.2, opacity: 0.6, pts: [[17, 1404], [36, 1410], [57, 1402]] },
  ],
});

const BOOT_TOP = { ankle: 1300, knee: 1060 };
register({
  id: 'boots', slot: 'shoes', label: 'boots', tags: ['modern'], channels: { main: '#3a2a25' },
  options: { height: Object.keys(BOOT_TOP) },
  defaults: { height: 'knee' },
  covers: o => [{ target: 'leg', y: [BOOT_TOP[o.height] + 12, 1384] }],
  view: [120, 780, 360, 700],
  build: o => [
    { id: 'shaft', layer: L, mirror: true, fill: 'main:limb', line: 'main', pts: legPts(BOOT_TOP[o.height], 1398, y => 4 + (y < BOOT_TOP[o.height] + 30 ? 2 : 0)) },
    ...base(),
    { layer: L, mirror: true, clip: 'shaft', closed: false, line: 'main', sw: 1.2, opacity: 0.6, pts: [[20, 1368], [36, 1376], [52, 1366]] },
  ],
});

register({
  id: 'flats', slot: 'shoes', label: 'flats, ballet flats', tags: ['modern', 'school'], channels: { main: '#93495c' },
  covers, view: footView,
  build: () => [
    // Lower than the loafer: the upper only reaches the toes, so the instep shows.
    { id: 'shoe', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: [[19, 1398, 1], [13, 1420], [12, 1439], [23, 1450], [47, 1451], [64, 1440], [65, 1422], [52, 1400, 1], [36, 1408]] },
    { layer: L, mirror: true, clip: 'shoe', fill: 'main.deep', pts: SOLE },
    { layer: L, mirror: true, clip: 'shoe', only: 'shaded', fill: 'glow', opacity: 0.4, pts: ellipse(34, 1434, 13, 4) },
    // A small bow on the toe.
    { layer: L, mirror: true, fill: 'main.hi', line: 'main', sw: 1, pts: [[25, 1417], [36, 1412], [38, 1421], [27, 1425]] },
    { layer: L, mirror: true, fill: 'main', line: 'main', sw: 1, pts: [[33, 1416], [40, 1414], [41, 1421], [34, 1422]] },
  ],
});

register({
  id: 'geta', slot: 'shoes', label: 'geta, wooden sandals', tags: ['japanese'], channels: { main: '#a97c50', trim: '#2f2a26' },
  notes: 'trim = the thong and the teeth',
  covers, view: footView,
  build: () => [
    // The board, the two teeth under it, and a thong over the foot. Worn with tabi, so no foot detail.
    { id: 'geta', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: [[10, 1448, 1], [66, 1446, 1], [68, 1460, 1], [8, 1462, 1]] },
    { layer: L, mirror: true, clip: 'geta', fill: 'trim', pts: [[16, 1460, 1], [26, 1460, 1], [26, 1478, 1], [16, 1478, 1]] },
    { layer: L, mirror: true, clip: 'geta', fill: 'trim', pts: [[50, 1459, 1], [60, 1459, 1], [60, 1477, 1], [50, 1477, 1]] },
    ...thong(),
    { layer: L, mirror: true, fill: 'main.hi', line: 'main', sw: 1, pts: [[36, 1396], [52, 1398], [56, 1412], [42, 1414]] },
  ],
});

register({
  id: 'zori', slot: 'shoes', label: 'zori, straw sandals', tags: ['japanese'], channels: { main: '#dcc9a0', trim: '#b8455a' },
  notes: 'trim = the thong',
  covers, view: footView,
  build: () => [
    { id: 'zori', role: 'main', layer: L, mirror: true, fill: 'main:v', line: 'main', pts: [[12, 1446, 1], [64, 1444, 1], [66, 1456, 1], [10, 1458, 1]] },
    { layer: L, mirror: true, clip: 'zori', soft: true, fill: 'main.shadow', opacity: 0.5, pts: [[10, 1454, 1], [66, 1452, 1], [66, 1456, 1], [10, 1458, 1]] },
    ...thong(),
  ],
});

// Skin-tight legwear is generated from the leg outline, so it fits every body with no drawing.
import { register } from '../registry.js';
import { ellipse, scallop } from '../geom.js';
import { legPts, legAt, legOuterRun, legInnerRun } from '../template.js';

// y where the stocking ends. `mid_thigh` sits below `thigh`, so it is the shorter of the two.
const TOP = { ankle: 1345, crew: 1250, knee: 1052, mid_thigh: 940, thigh: 872 };

function legShapes(top, { sheer = false, band = true, stripe = false, frill = false, garter = false } = {}) {
  const [a, b] = legAt(top);
  const S = [{ id: 'leg', role: 'main', layer: 'legwear', mirror: true, fill: 'main:limb', line: 'main', pattern: true, opacity: sheer ? 0.78 : 1, pts: legPts(top, 1396, 0.8) }];
  if (band) S.push({
    layer: 'legwear', mirror: true, clip: 'leg', fill: stripe ? 'trim' : 'main.hi',
    line: stripe ? 'trim' : 'main', opacity: stripe ? 1 : 0.5,
    pts: [[a - 2, top, 1], [b + 2, top, 1], [b + 2, top + 7, 1], [a - 2, top + 7, 1]],
  });
  if (top < 1200) S.push({ layer: 'legwear', mirror: true, clip: 'leg', only: 'shaded', fill: 'glow', opacity: 0.13, pts: ellipse(34, (top + 1396) / 2 + 20, 14, (1396 - top) / 2.6) });
  // A lace cuff standing up off the top of the sock. Not clipped to the sock: it is above it.
  if (frill) S.push({ layer: 'legwear', mirror: true, fill: 'trim', line: 'trim', pts: scallop([[a - 1, top + 2], [b + 1, top + 2]], { dist: 9, amp: 3.4, waves: 4, back: 3, out: [(a + b) / 2, top + 60] }) });
  // Two suspender straps running up from the stocking top and away under the skirt, with the clasp
  // where each one meets it. They are drawn on the legwear layer, so the skirt settles over them.
  if (garter) {
    const up = Math.max(700, top - 200);
    for (const [x0, x1] of [[a + 4, a + 11], [b - 11, b - 4]]) {
      S.push({ layer: 'legwear', mirror: true, fill: 'main', line: 'main', sw: 0.7, pts: [[x0, top + 1], [x1, top + 1], [x1 + 2, up], [x0 - 2, up]] });
      S.push({ layer: 'legwear', mirror: true, fill: 'trim', line: 'trim', sw: 0.6, pts: [[x0 - 2, top - 6], [x1 + 2, top - 6], [x1 + 1, top + 3], [x0 - 1, top + 3]] });
    }
  }
  return S;
}

register({
  id: 'socks', slot: 'legwear', label: 'socks, thigh-highs, stockings', tags: ['modern', 'school'],
  channels: { main: '#23252f', trim: '#ffffff' },
  options: { length: Object.keys(TOP) },
  flags: { stripe_top: false, frill: false, garter: false },
  defaults: { length: 'knee' },
  presets: { thigh_highs: { length: 'thigh' }, stockings: { length: 'thigh' }, knee_socks: { length: 'knee' }, ankle_socks: { length: 'ankle' }, lace_stockings: { length: 'thigh', frill: true }, garter_stockings: { length: 'mid_thigh', frill: true, garter: true } },
  covers: o => [{ target: 'leg', y: [TOP[o.length] + 10, 1384] }],
  view: [120, 780, 360, 700],
  notes: 'trim = the band at the top of the sock',
  build: o => legShapes(TOP[o.length], { stripe: o.stripe_top, frill: o.frill, garter: o.garter }),
});

register({
  id: 'tights', slot: 'legwear', label: 'tights, pantyhose', tags: ['modern', 'school'],
  channels: { main: '#2a2630' },
  flags: { sheer: true },
  presets: { pantyhose: { sheer: true }, leggings_tights: { sheer: false } },
  covers: () => [{ target: 'leg', y: [720, 1384] }],
  view: [120, 640, 360, 840],
  build: o => legShapes(692, { sheer: o.sheer, band: false }),
});

// Loose socks: wider than the leg and bunched. The top edge still hugs, so they hang from it
// and swell below instead of floating away from the calf.
const LOOSE_TOP = { knee: 1045, crew: 1245 };
register({
  id: 'loose_socks', slot: 'legwear', label: 'loose socks, bunched socks', tags: ['school'],
  channels: { main: '#f0ece2' },
  options: { length: Object.keys(LOOSE_TOP) },
  defaults: { length: 'knee' },
  presets: { slouch_socks: { length: 'knee' } },
  covers: o => [{ target: 'leg', y: [LOOSE_TOP[o.length] + 10, 1384] }],
  view: [120, 900, 360, 580],
  build: o => {
    const top = LOOSE_TOP[o.length], S = [];
    const ease = y => 3 + 7 * Math.max(0, Math.min(1, (y - top) / 150));
    S.push({ id: 'leg', role: 'main', layer: 'legwear', mirror: true, fill: 'main:limb', line: 'main', pattern: true, pts: legPts(top, 1396, ease) });
    // Bunching: rings of shadow across the sock, drawn as bands wider than the leg.
    for (let y = top + 40; y < 1368; y += 54) {
      const [a, b] = legAt(y), e = ease(y);
      S.push({
        layer: 'legwear', mirror: true, clip: 'leg', soft: true, fill: 'main.shadow', opacity: 0.42,
        pts: [[a - e - 1, y, 1], [34, y + 9], [b + e + 1, y - 1, 1], [b + e + 1, y + 12, 1], [34, y + 21], [a - e - 1, y + 13, 1]],
      });
    }
    const [ta, tb] = legAt(top);
    S.push({ layer: 'legwear', mirror: true, clip: 'leg', fill: 'main.shadow', line: 'main', sw: 1, pts: [[ta - 4, top, 1], [tb + 4, top, 1], [tb + 4, top + 8, 1], [ta - 4, top + 8, 1]] });
    return S;
  },
});

register({
  id: 'leg_warmers', slot: 'legwear', label: 'leg warmers', tags: ['modern', 'school'],
  channels: { main: '#d3cabb', trim: '#8d857a' },
  notes: 'trim = the band at each end',
  covers: () => [{ target: 'leg', y: [1062, 1386] }],
  view: [120, 960, 360, 500],
  build: () => {
    // Bulkier than a sock and open at both ends, so nothing is drawn inside the footwear.
    const S = [{ id: 'warm', role: 'main', layer: 'legwear', mirror: true, fill: 'main:limb', line: 'main', pattern: true, pts: legPts(1052, 1390, 5) }];
    for (const [y, h] of [[1052, 10], [1380, 10]]) {
      const [a, b] = legAt(y);
      S.push({ layer: 'legwear', mirror: true, clip: 'warm', fill: 'trim', line: 'trim', pts: [[a - 6, y, 1], [b + 6, y, 1], [b + 6, y + h, 1], [a - 6, y + h, 1]] });
    }
    // Bunched cloth: rings across, and a shadow down the inside.
    for (let y = 1100; y < 1370; y += 34) {
      const [a, b] = legAt(y);
      S.push({ layer: 'legwear', mirror: true, clip: 'warm', closed: false, line: 'main', sw: 1.1, opacity: 0.45, pts: [[a - 3, y], [(a + b) / 2, y + 5], [b + 3, y - 1]] });
    }
    return S;
  },
});

register({
  id: 'tabi', slot: 'legwear', label: 'tabi socks', tags: ['japanese'],
  channels: { main: '#f6f3ea', trim: '#d8d2c2' },
  notes: 'trim = the sole and the toe split',
  covers: () => [{ target: 'leg', y: [1310, 1386] }],
  view: [110, 1270, 380, 220],
  build: () => {
    const S = [
      // Ankle height, split at the big toe: the foot is part of the sock, unlike the other legwear.
      // Down the outside of the ankle, round the foot, and back up the inside: the sock is one piece,
      // so the foot cannot be a separate shape the way a shoe's is.
      { id: 'tabi', role: 'main', layer: 'legwear', mirror: true, fill: 'main', line: 'main',
        pts: [...legOuterRun(1300, 1394, 0.8), [62, 1410], [64, 1432], [46, 1450], [22, 1448], [10, 1430], [10, 1406],
          ...legInnerRun(1396, 1300, 0.8)] },
      // The split runs from between the toes back to the instep.
      { layer: 'legwear', mirror: true, clip: 'tabi', closed: false, line: 'trim', sw: 1.6, pts: [[19, 1450], [21, 1430], [19, 1412]] },
      { layer: 'legwear', mirror: true, clip: 'tabi', fill: 'trim', line: 'trim',
        pts: [[10, 1442, 1], [64, 1444, 1], [64, 1454, 1], [40, 1456], [12, 1450, 1]] },
      { layer: 'legwear', mirror: true, clip: 'tabi', closed: false, line: 'trim', sw: 1, opacity: 0.7, pts: [[12, 1404], [52, 1402]] },
    ];
    return S;
  },
});

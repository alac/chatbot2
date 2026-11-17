// Skirts: cut x length. All cuts share the waist seam (SEAM.waistY / waistHalf).
import { register } from '../registry.js';
import { SEAM, sideRun, legOuterRun } from '../template.js';

export const SKIRT_LEN = { micro: 760, mini: 806, knee: 985, midi: 1150, maxi: 1360 };
// Half-width below the hip: [slope down to mid-thigh, slope after].
const FLARE = { pleated: [0.154, 0.08], a_line: [0.12, 0.06], flared: [0.22, 0.12], tiered: [0.16, 0.1] };

function flareWidth(cut, y) {
  const [a, b] = FLARE[cut];
  return 100 + a * (Math.min(y, 806) - 650) + b * Math.max(0, y - 806);
}

/** Skirt shapes on a given layer; reused by dresses. */
export function skirtShapes(o, { L = 'bottom', ch = 'main' } = {}) {
  const hem = SKIRT_LEN[o.length], S = [];
  const W0 = SEAM.waistHalf, Y0 = SEAM.waistY;
  let outline, W;
  const lines = [], shadows = [];

  if (o.cut === 'pencil') {
    // Follows the hips and thighs, then hangs straight.
    const leg = hem > 760 ? legOuterRun(760, hem, y => 4 + Math.max(0, y - 900) * 0.02) : [[97, hem]];
    W = leg[leg.length - 1][0];
    leg[leg.length - 1][2] = 1;
    outline = [[0, Y0 - 2], [W0, Y0, 1], ...sideRun(560, 690, 3), ...leg, [W * 0.5, hem + 3], [0, hem + 4]];
    lines.push([[W * 0.45, 600], [W * 0.6, 640], [W * 0.5, 680]]);
  } else {
    W = flareWidth(o.cut, hem);
    const hemY = x => hem - 9 * (x / W) ** 2;
    const mids = [730, 900, 1070, 1240].filter(y => y < hem - 60).map(y => [flareWidth(o.cut, y), y]);
    outline = [[0, Y0 - 2], [W0, Y0, 1], [80, 580], [100, 650], ...mids, [W, hemY(W), 1]];
    const N = o.cut === 'pleated' ? 5 : o.cut === 'tiered' ? 0 : 3;
    const step = o.cut === 'pleated' ? 7 : o.cut === 'flared' ? 5 : 0;
    for (let k = N - 1; k >= 1; k--) {
      const x = (W * k) / N, y = hemY(x), r = x / W;
      if (step) outline.push([x + 1, y - step, 1], [x, y, 1]);
      else outline.push([x, y + 2]);
      lines.push([[r * 56, Y0 + 8], [r * 100, 650], [x + 1, y - step]]);
      if (o.cut !== 'a_line') shadows.push([[r * 56, Y0 + 12, 1], [r * 100, 650], [x + 1, y - step, 1], [x, y, 1], [x - 13, hemY(x - 13), 1], [r * 100 - 8, 650]]);
    }
    outline.push([0, hemY(0) + (step ? 0 : 3)]);
  }

  // Shadow the hem casts on the legs.
  S.push({
    layer: 'bodyShade', sym: true, fit: 'skirt', clip: '@leg', soft: true, fill: '@skin.shadow',
    pts: [[0, hem - 26], [W + 2, hem - 26, 1], [W + 2, hem + 6, 1], [W / 2, hem + 19], [0, hem + 23]],
  });
  S.push({ id: 'skirt', role: 'main', layer: L, sym: true, fit: 'skirt', fill: ch + ':v', line: ch, pattern: true, pts: outline });
  shadows.forEach(p => S.push({ layer: L, mirror: true, fit: 'skirt', clip: 'skirt', fill: ch + '.shadow', pts: p }));
  lines.forEach(p => S.push({ layer: L, mirror: true, fit: 'skirt', closed: false, line: ch, sw: 1.4, opacity: o.cut === 'pleated' ? 1 : 0.55, pts: p }));
  // Uniform trim: a stripe following the hem line, above it by a constant amount.
  // Tiered: gathered seams across the skirt, each tier hanging over the one below.
  if (o.cut === 'tiered') {
    for (const y of [740, 900, 1090].filter(y => y < hem - 40)) {
      const half = flareWidth(o.cut, y);
      S.push({ layer: L, sym: true, fit: 'skirt', clip: 'skirt', soft: true, fill: ch + '.shadow', opacity: 0.45, pts: [[0, y - 7], [half, y - 6], [half, y + 4], [0, y + 5]] });
      S.push({ layer: L, sym: true, fit: 'skirt', clip: 'skirt', closed: false, line: ch, sw: 1.2, opacity: 0.65, pts: [[0, y + 3], [half, y + 1]] });
    }
  }
  if (o.hem_stripe) {
    const hy = x => (o.cut === 'pencil' ? hem + 2 : hem - 9 * (x / W) ** 2);
    S.push({
      layer: L, sym: true, fit: 'skirt', clip: 'skirt', fill: 'trim', line: 'trim',
      pts: [[0, hy(0) - 18], [W * 0.5, hy(W * 0.5) - 17], [W, hy(W) - 16, 1], [W, hy(W) - 8, 1], [W * 0.5, hy(W * 0.5) - 9], [0, hy(0) - 10]],
    });
  }
  // Waistband, visible when a top is tucked in.
  S.push({ layer: L, sym: true, fit: 'skirt', fill: ch, line: ch, pts: [[0, Y0 - 3], [W0, Y0 - 1, 1], [W0 + 3, Y0 + 12, 1], [0, Y0 + 12]] });
  return S;
}

export const skirtCovers = o => [{ target: 'torso', y: [548, 688] }, { target: 'leg', y: [700, SKIRT_LEN[o.length] - 24] }];

export const SKIRT_OPTIONS = { cut: ['pleated', 'a_line', 'flared', 'pencil', 'tiered'], length: Object.keys(SKIRT_LEN) };

register({
  id: 'skirt', slot: 'bottom', label: 'skirt', tags: ['modern', 'school'],
  channels: { main: '#2c3760', trim: '#ffffff' },
  options: SKIRT_OPTIONS,
  flags: { hem_stripe: false },
  defaults: { cut: 'pleated', length: 'mini' },
  presets: { pleated_skirt: { cut: 'pleated' }, miniskirt: { length: 'mini' }, pencil_skirt: { cut: 'pencil', length: 'knee' }, long_skirt: { cut: 'a_line', length: 'maxi' } },
  covers: skirtCovers,
  view: [60, 480, 480, 520],
  notes: 'trim = the hem stripe on a uniform skirt',
  build: o => skirtShapes(o),
});

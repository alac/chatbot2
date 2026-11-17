// Pants and shorts: cut x length, derived from the leg outline plus ease.
// Drawn as one mirrored half that overlaps the centerline by 1, so the closing edge reads as the
// center seam.
import { register } from '../registry.js';
import { SEAM, sideRun, legOuterRun, legInnerRun, legAt } from '../template.js';

const LEN = { full: 1378, cropped: 1240, capri: 1090, shorts: 800, hot_pants: 742 };
// Ease outside and inside the leg, by height.
const CUT = {
  skinny: { out: () => 2.5, inn: () => 2 },
  straight: { out: y => Math.max(5, 73 - (y - 1015) * 0.012 - legAt(y)[1]), inn: y => Math.max(4, legAt(y)[0] - 6) },
  wide: { out: y => 6 + Math.max(0, y - 720) * 0.055, inn: y => Math.max(4, legAt(y)[0] - 1.5) },
  // Relaxed through the leg, gathered into a cuff at the ankle: the ease collapses over the last
  // 130px so the cloth hugs the ankle instead of hanging past it.
  jogger: {
    out: y => 1.5 + 6.5 * Math.max(0, Math.min(1, (1355 - y) / 130)),
    inn: y => Math.max(2, legAt(y)[0] - (2.5 + 1.5 * Math.max(0, Math.min(1, (1355 - y) / 130)))),
  },
  // Puffy to the hem, gathered into a band there: gym bloomers.
  bloomers: { out: () => 11, inn: y => Math.max(2, legAt(y)[0] - 2) },
  // Bootcut: follows the leg to the knee, then widens to the hem.
  flare: { out: y => 4 + Math.max(0, y - 1100) * 0.09, inn: y => Math.max(3, legAt(y)[0] - 4) },
};

function pantsShapes(o) {
  const hem = LEN[o.length], cut = CUT[o.cut], Y0 = SEAM.waistY, S = [];
  const outer = legOuterRun(Math.min(745, hem - 25), hem, cut.out), inner = legInnerRun(hem, Math.min(716, hem - 22), cut.inn);
  outer[outer.length - 1][2] = 1;
  inner[0][2] = 1;
  const pts = [[-1, Y0 - 2, 1], [SEAM.waistHalf, Y0, 1], ...sideRun(560, 690, 3), ...outer, ...inner, [-1, 708, 1]];
  const ho = outer[outer.length - 1][0], hi = inner[0][0];

  S.push({
    layer: 'bodyShade', mirror: true, clip: '@leg', soft: true, fill: '@skin.shadow',
    pts: [[hi - 4, hem - 4, 1], [ho + 4, hem - 4, 1], [ho + 4, hem + 10, 1], [(hi + ho) / 2, hem + 18], [hi - 4, hem + 10, 1]],
  });
  S.push({ id: 'pants', role: 'main', layer: 'bottom', mirror: true, fill: 'main:v', line: 'main', pattern: true, pts });
  S.push({ layer: 'bottom', mirror: true, closed: false, line: 'main', sw: 1.2, opacity: 0.7, pts: [[0, Y0 + 12], [SEAM.waistHalf + 2, Y0 + 13]] });          // waistband
  S.push({ layer: 'bottom', mirror: true, closed: false, line: 'main', sw: 1.2, opacity: 0.6, pts: [[34, Y0 + 14], [52, Y0 + 30], [70, Y0 + 36]] });          // pocket
  S.push({ layer: 'bottom', closed: false, line: 'main', sw: 1.2, opacity: 0.6, pts: [[6, Y0 + 14], [7, 600], [0, 640]] });                                   // fly
  if (hem > 1050) S.push({ layer: 'bottom', mirror: true, clip: 'pants', closed: false, line: 'main', sw: 1.2, opacity: 0.4, pts: [[legAt(1000)[1] - 14, 1002], [legAt(1012)[1] - 30, 1012]] });
  if (o.side_stripe) {
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', closed: false, stroke: 'trim', sw: 2.6, pts: [[legAt(760)[1] + 1, 760], [legAt(1000)[1] - 1, 1000], [ho - 1, hem - 3]] });
  }
  if (o.cut === 'bloomers') {
    // The band the puff gathers into, with two folds running down to it.
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', fill: 'main.shadow', line: 'main', sw: 1, pts: [[hi, hem - 15, 1], [ho, hem - 15, 1], [ho, hem, 1], [hi, hem, 1]] });
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', closed: false, line: 'main', sw: 1.1, opacity: 0.55, pts: [[hi + 3, hem - 34], [hi + 6, hem - 22], [hi + 9, hem - 5]] });
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', closed: false, line: 'main', sw: 1.1, opacity: 0.55, pts: [[ho - 3, hem - 32], [ho - 8, hem - 20], [ho - 13, hem - 5]] });
  }
  if (o.cut === 'jogger') {
    // The cuff the cloth gathers into, with a rib line above it.
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', fill: 'main.shadow', line: 'main', sw: 1, pts: [[hi, hem - 18, 1], [ho, hem - 18, 1], [ho, hem, 1], [hi, hem, 1]] });
    S.push({ layer: 'bottom', mirror: true, clip: 'pants', closed: false, line: 'main', sw: 1, opacity: 0.6, pts: [[hi + 1, hem - 17], [ho - 1, hem - 17]] });
  }
  return S;
}

register({
  id: 'pants', slot: 'bottom', label: 'pants, jeans, shorts', tags: ['modern'],
  channels: { main: '#3b4a6b', trim: '#ffffff' },
  options: { cut: Object.keys(CUT), length: Object.keys(LEN) },
  flags: { side_stripe: false },
  defaults: { cut: 'straight', length: 'full' },
  notes: 'trim = the side stripe on track pants',
  presets: { jeans: { cut: 'straight' }, skinny_jeans: { cut: 'skinny' }, slacks: { cut: 'straight' }, shorts: { length: 'shorts' }, hot_pants: { length: 'hot_pants', cut: 'skinny' }, leggings: { cut: 'skinny' },
    sweatpants: { cut: 'wide' }, track_pants: { cut: 'straight' }, pajama_pants: { cut: 'straight' },
    gym_shorts: { length: 'shorts' }, bike_shorts: { cut: 'skinny', length: 'shorts' },
    denim_shorts: { length: 'shorts' }, culottes: { cut: 'wide', length: 'cropped' },
    swim_shorts: { length: 'shorts', cut: 'wide' },
    bloomers: { cut: 'bloomers', length: 'shorts' } },
  covers: o => [{ target: 'torso', y: [548, 688] }, { target: 'leg', y: [722, LEN[o.length] - 14] }],
  view: [60, 480, 480, 1000],
  build: o => pantsShapes(o),
});

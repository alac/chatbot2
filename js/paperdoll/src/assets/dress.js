// One-piece dress: a bodice from top.js joined at the waist to a skirt from skirt.js.
import { register } from '../registry.js';
import { SEAM, sideRun } from '../template.js';
import { topShapes, topCovers, TOP_OPTIONS } from './top.js';
import { skirtShapes, skirtCovers, SKIRT_OPTIONS, SKIRT_LEN } from './skirt.js';

const WAIST_HEM = 546;

register({
  id: 'dress', slot: 'dress', blocks: ['top', 'bottom'], label: 'one-piece dress, sundress', tags: ['modern'],
  channels: { main: '#f4f1ea', trim: '#2c3760', accent: '#ffffff' },
  options: { ...TOP_OPTIONS, cut: SKIRT_OPTIONS.cut, length: SKIRT_OPTIONS.length },
  flags: { belt: false },
  defaults: { neckline: 'scoop', sleeves: 'none', fit: 'tight', cut: 'a_line', length: 'knee' },
  notes: 'fit applies to the bodice; trim = belt and sailor collar',
  presets: {
    sundress: { neckline: 'scoop', sleeves: 'none', cut: 'flared' },
    sailor_dress: { neckline: 'sailor', sleeves: 'short', cut: 'pleated', length: 'knee' },
    nightgown: { neckline: 'crew', sleeves: 'short', fit: 'loose', cut: 'a_line', length: 'maxi' },
    shirt_dress: { neckline: 'collar', sleeves: 'long', fit: 'regular', cut: 'a_line', length: 'knee', belt: true },
    sweater_dress: { neckline: 'crew', sleeves: 'long', fit: 'loose', cut: 'pencil', length: 'knee' },
  },
  covers: o => [...topCovers(o, WAIST_HEM), ...skirtCovers(o)],
  view: [40, 250, 520, 1000],
  build(o) {
    const S = [...topShapes(o, { L: 'dress', hem: WAIST_HEM }), ...skirtShapes(o, { L: 'dress' }).map(s => (s.role ? { ...s, role: undefined } : s))];
    if (o.belt) {
      const y = SEAM.waistY, w = SEAM.waistHalf;
      S.push({ layer: 'dress', sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: [[0, y - 5], [w + 1, y - 3, 1], [w + 4, y + 13, 1], [0, y + 13]] });
      S.push({ layer: 'dress', fit: 'skirt', anchor: [0, y + 4], fill: 'accent', line: 'trim', sw: 1.2, pts: [[-8, y - 4, 1], [8, y - 4, 1], [8, y + 12, 1], [-8, y + 12, 1]] });
    }
    return S;
  },
});

// A jumper dress is worn OVER a top, which is why it blocks only the bottom: a blouse survives
// normalization, and because `dress` is drawn after `top` in layers.js its body is covered while its
// collar and sleeves stay visible above the bib. Nothing is clipped; draw order does the work.
// It has to look complete with nothing under it as well, since the guide permits that.
// The bib takes the neckline, so a pinafore can be high and plain or cut low over a blouse. Each
// run ends at the bib's upper right corner; the rest of the outline is shared.
const BIB_TOP = {
  crew: [[0, 366], [40, 366], [50, 382]],
  scoop: [[0, 400], [18, 396], [34, 384], [46, 370], [52, 386]],
  square: [[0, 370], [48, 370], [53, 386]],
  v: [[0, 414], [20, 388], [38, 368], [50, 384]],
};
// Widest at the chest, narrowing into the waistband: the classic pinafore bib.
const bib = neckline => [...BIB_TOP[neckline], [53, 430], [51, 472], [48, 512], [SEAM.waistHalf - 1, 548], [0, 550]];
const bibPocket = [[8, 462], [31, 460], [32, 508], [8, 510]];
register({
  id: 'jumper_dress', slot: 'dress', blocks: ['bottom'], label: 'jumper dress, pinafore', tags: ['modern', 'school'],
  channels: { main: '#5b6f9e', trim: '#eceadf', accent: '#e2c168' },
  options: { cut: ['pinafore', 'bodice'], skirt: SKIRT_OPTIONS.cut, length: SKIRT_OPTIONS.length, neckline: ['crew', 'scoop', 'square', 'v'] },
  flags: { pocket: false },
  defaults: { cut: 'pinafore', skirt: 'a_line', length: 'knee', neckline: 'scoop' },
  notes: 'worn over a top; trim = bib edge and pocket, accent = buckles',
  presets: {
    pinafore: { cut: 'pinafore', length: 'knee' },
    school_pinafore: { cut: 'pinafore', skirt: 'pleated', length: 'mini' },
    bodice_jumper: { cut: 'bodice', neckline: 'crew' },
  },
  // A pinafore hides the centre of the chest and nothing else: its sides are open by design, which
  // is the whole point of wearing it over something. Only the bodice cut claims the torso.
  covers: o => o.cut === 'bodice'
    ? [{ target: 'torso', y: [430, Math.min(SKIRT_LEN[o.length] - 12, 685)] }, { target: 'leg', y: [700, SKIRT_LEN[o.length] - 24] }]
    : [{ target: 'leg', y: [700, SKIRT_LEN[o.length] - 24] }],
  view: [40, 250, 520, 1000],
  build(o) {
    const S = [];
    if (o.cut === 'bodice') {
      // A plain sleeveless dress: the bib is the whole bodice, so it takes a neckline and an armhole.
      S.push(...topShapes({ ...o, sleeves: 'none', fit: 'tight' }, { L: 'dress', hem: WAIST_HEM }));
    } else {
      // A pinafore: a square bib narrower than the chest, so a blouse shows at the sides and above it.
      const pts = bib(o.neckline);
      S.push({ id: 'body', role: 'main', layer: 'dress', sym: true, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts });
      S.push({ layer: 'dress', mirror: true, fit: 'loose', clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.5, offset: [1, 2], pts });
      // Straps over the shoulder, widening upward so they sit on the shoulder rather than the neck.
      S.push({
        layer: 'dress', mirror: true, fit: 'loose', fill: 'main', line: 'main', sw: 1.2,
        pts: [[40, 372], [52, 369], [53, 316], [55, 300], [45, 300], [44, 338], [30, 372]],
      });
      // Buckle where the strap meets the bib: the only thing accent is used for.
      S.push({ layer: 'dress', mirror: true, fit: 'loose', anchor: [42, 370], fill: 'accent', line: 'accent', sw: 1.1, pts: [[36, 365], [48, 364], [48, 375], [36, 376]] });
      S.push({ layer: 'dress', sym: true, fit: 'loose', line: 'trim', sw: 1.8, pts });
      if (o.pocket) S.push({ layer: 'dress', mirror: true, fit: 'loose', clip: 'body', fill: 'trim', line: 'trim', sw: 1.2, pts: bibPocket });
    }
    S.push(...skirtShapes({ ...o, cut: o.skirt }, { L: 'dress' }).map(s => (s.role ? { ...s, role: undefined } : s)));
    return S;
  },
});

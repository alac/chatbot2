// Apron: cloth tied over whatever is worn. A slot of its own (`over`), drawn after `dress` and
// before `neck`, so an apron goes over a dress or a skirt and a necklace still sits on the bib,
// while a cardigan or a haori goes over the whole thing.
//
// It is one piece of cloth: the bib and the skirt panel meet the waist strap at exactly its width,
// so the outline is continuous from shoulder to hem. The three cuts are the three real shapes --
// `bib` has a bib, `half` is tied at the waist and flares, `maekake` is tied at the waist and hangs
// straight. All of them take the waist strap the whole way round.
import { register } from '../registry.js';
import { SEAM } from '../template.js';

const L = 'over';
const Y0 = SEAM.waistY;
const W0 = SEAM.waistHalf;
const TOP = Y0 - 9, BOT = Y0 + 11;            // the waist strap
// Short of the skirt lengths it is worn over (knee 985, midi 1150), so an apron never hangs out of
// the bottom of a dress.
const HEM = { knee: 950, midi: 1120 };
// The bib's upper edge takes the neckline, so a bib can sit high and plain or be cut low over a
// blouse. Each run ends at the bib's upper right corner; the rest of the outline is shared.
const BIB_TOP = {
  crew: [[0, 366], [40, 366], [50, 382]],
  scoop: [[0, 400], [18, 396], [34, 384], [46, 370], [52, 386]],
  square: [[0, 370], [48, 370], [53, 386]],
  v: [[0, 414], [20, 388], [38, 368], [50, 384]],
};
// Widest at the chest, narrowing into the waist strap. The bottom edge stops inside the strap, not
// at the bottom of it: the strap is what holds the bib up, so it has to cross the cloth, and any
// sliver of bib below the strap reads as the two being separate.
const BIB_BOT = Y0 + 3;
const bibPts = neckline => [...BIB_TOP[neckline], [53, 440], [58, 480], [W0, BIB_BOT], [0, BIB_BOT + 2]];
// `neck_loop` hugs the side of the neck and runs up behind the hair, so it reads as going round the
// back of the neck rather than stopping at the throat. `shoulder` crosses the shoulder instead.
const STRAPS = {
  // The loop narrows to nothing as it reaches the neck: a band curving round a cylinder shows less
  // of itself the further it wraps, so it tapers into the neck's edge and is gone by the time the
  // head covers the rest. A band of constant width cut off at the jaw reads as a tab stuck on.
  // Both reach well past the bib's upper edge, so the strap crosses the cloth instead of ending
  // short of it -- on a scoop or a V the bib's edge is 25 units lower at the strap's x than on a
  // crew neck, which is where the straps used to float free.
  neck_loop: [[13, 398], [27, 395], [34, 330], [34, 308], [24, 300], [21, 330], [9, 398]],
  shoulder: [[34, 390], [46, 387], [50, 318], [52, 301], [42, 300], [40, 338], [24, 390]],
};
const pocket = [[8, 452], [31, 450], [32, 496], [8, 498]];
// Ease a top or a dress adds at the waist, from `sideEase` in top.js. The apron is tied over the
// clothes, so its waist has to reach past them: level with a bare waist it leaves a sliver of a
// loose shirt showing outside the strap, which reads as the apron being too small.
const EASE = { tight: 2, regular: 8, loose: 19, oversized: 27 };
const waistEase = ctx => Math.max(
  EASE[ctx.opt('top', 'fit')] || 0,
  EASE[ctx.opt('dress', 'fit')] || 0,
  ctx.has('outer') ? 12 : 0,
);

register({
  id: 'apron', slot: 'over', label: 'apron', tags: ['modern'],
  channels: { main: '#f8f6f1', trim: '#c9d3e4', accent: '#d84f6a' },
  options: { cut: ['bib', 'half', 'maekake'], length: ['knee', 'midi'], neckline: ['crew', 'scoop', 'square', 'v'], strap: ['neck_loop', 'shoulder'] },
  flags: { pocket: false, bow: false },
  defaults: { cut: 'bib', length: 'knee', neckline: 'scoop', strap: 'neck_loop' },
  notes: 'trim = waist strap, ties and bib edge; accent = the bow',
  presets: {
    waist_apron: { cut: 'half', length: 'knee' },
    maekake: { cut: 'maekake', length: 'midi', pocket: true },
  },
  view: [60, 250, 480, 850],
  build(o, ctx) {
    const hem = HEM[o.length], S = [], bib = o.cut === 'bib';
    // Only the strap overshoots. It is the piece that goes round the clothes, so it reaches their
    // edge; the cloth hangs inside it, which is where an apron's cloth hangs. Nothing to clear on
    // bare skin, so the overshoot is zero there.
    const e0 = waistEase(ctx);
    if (bib) {
      const pts = bibPts(o.neckline);
      S.push({ id: 'body', role: 'main', layer: L, sym: true, fit: 'loose', fill: 'main', line: 'main', pattern: true, pts });
      S.push({ layer: L, mirror: true, fit: 'loose', clip: 'body', soft: true, fill: 'main.shadow', opacity: 0.5, offset: [1, 2], pts });
      S.push({ layer: L, mirror: true, fit: 'loose', fill: 'main', line: 'main', sw: 1.2, pts: STRAPS[o.strap] });
      if (o.pocket) S.push({ layer: L, mirror: true, fit: 'loose', clip: 'body', fill: 'main', line: 'trim', sw: 1.4, pts: pocket });
      S.push({ layer: L, sym: true, fit: 'loose', line: 'trim', sw: 1.8, pts });
    }
    // The panel: flared for `half`, straight-sided for `maekake`. Its top edge runs under the strap
    // at the strap's own width -- hanging off the bottom of the strap by its narrower chest width is
    // what made the strap look like a belt floating above an unconnected skirt.
    const halfW = o.cut === 'maekake' ? () => W0 - 9 : y => W0 + Math.max(0, y - BOT) * 0.11;
    const stops = [BOT + 40, 650, 806, 985].filter(y => y < hem - 30);
    S.push({
      id: 'panel', role: bib ? undefined : 'main', layer: L, sym: true, fit: 'skirt', fill: 'main', line: 'main', pattern: true,
      pts: [[0, TOP], [halfW(TOP + 2), TOP + 2, 1], ...stops.map(y => [halfW(y), y]), [halfW(hem), hem - 3, 1], [0, hem]],
    });
    // Shade down the right of the panel, so it reads as cloth lying on what is under it.
    S.push({
      layer: L, mirror: true, fit: 'skirt', soft: true, fill: 'main.shadow', opacity: 0.5,
      pts: [[halfW(BOT + 60) - 24, BOT + 70], [halfW(650) - 1, 650], [halfW(hem) - 2, hem - 6, 1], [halfW(806) - 26, 812], [halfW(BOT + 60) - 28, BOT + 110]],
    });
    // The strap that ties it, the whole way round the waist.
    S.push({ layer: L, sym: true, fit: 'skirt', fill: 'trim', line: 'trim', pts: [[0, TOP], [W0 + 1 + e0, TOP + 2, 1], [W0 + 2 + e0, BOT, 1], [0, BOT + 1]] });
    S.push({ layer: L, sym: true, fit: 'skirt', closed: false, line: 'trim', sw: 1.2, opacity: 0.6, pts: [[0, BOT - 3], [W0 + e0, BOT - 2]] });
    if (o.bow) {
      for (const s of [-1, 1]) S.push({ layer: L, fit: 'skirt', anchor: [0, Y0], fill: 'accent', line: 'accent', sw: 1.2, pts: [[s * 2, Y0 - 8], [s * 31, Y0 - 18], [s * 34, Y0 + 10], [s * 2, Y0 + 8]] });
      S.push({ layer: L, fit: 'skirt', anchor: [0, Y0], fill: 'trim', line: 'accent', sw: 1.2, pts: [[-7, Y0 - 6], [7, Y0 - 6], [7, Y0 + 7], [-7, Y0 + 7]] });
    }
    return S;
  },
});

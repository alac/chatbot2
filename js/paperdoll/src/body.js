// The bare body. Fills carry no outline; outlines are separate open lines, so no stroke crosses
// the shoulder or hip where two body pieces overlap.
import { ellipse } from './geom.js';
import { TORSO, ARM, legPts, legOuterRun, legInnerRun, bustShading } from './template.js';

const FOOT = [[22, 1390, 1], [18, 1415], [15, 1436], [22, 1447], [44, 1449], [58, 1441], [60, 1424], [50, 1390, 1]];
const clamp = v => Math.min(1, Math.max(0, v));

export function bodyShapes() {
  const S = [];
  const add = s => S.push(s);

  add({ id: 'arm', layer: 'arm', mirror: true, part: 'arm', pts: ARM, fill: 'skin:limb', line: 'skin' });

  add({ id: 'foot', layer: 'body', mirror: true, pts: FOOT, fill: 'skin', line: 'skin' });
  add({ layer: 'body', mirror: true, closed: false, line: 'skin', sw: 1, opacity: 0.6, pts: [[30, 1438], [31, 1447]] });
  add({ layer: 'body', mirror: true, closed: false, line: 'skin', sw: 1, opacity: 0.6, pts: [[40, 1439], [41, 1448]] });
  add({ id: 'leg', layer: 'body', mirror: true, pts: legPts(690, 1396), fill: 'skin:limb' });
  add({ id: 'torso', layer: 'body', sym: true, pts: TORSO, fill: 'skin' });

  // shading
  add({ layer: 'bodyShade', sym: true, clip: 'torso', soft: true, fill: 'skin.shadow', pts: [[0, 250], [30, 250, 1], [27, 281], [15, 293], [0, 298]] });
  bustShading('torso', 'skin', 'bodyShade', 'skin').forEach(add);
  add({ layer: 'bodyShade', closed: false, line: 'skin', sw: 1.2, opacity: st => clamp(0.5 * st.P.bust + 0.25), pts: [[0, 398], [0.5, 414], [0, 430]] });
  add({ layer: 'bodyShade', clip: 'leg', only: 'shaded', fill: 'glow', opacity: 0.55, pts: ellipse(-54, 905, 10, 52) });
  add({ layer: 'bodyShade', clip: 'leg', only: 'shaded', fill: 'glow', opacity: 0.55, pts: ellipse(38, 905, 10, 52) });
  add({ layer: 'bodyShade', mirror: true, clip: 'leg', only: 'shaded', fill: 'blush', opacity: 0.28, pts: ellipse(36, 1010, 20, 16) });

  // outlines
  const line = (pts, extra) => add(Object.assign({ layer: 'bodyLine', mirror: true, closed: false, line: 'skin', pts }, extra));
  line([[21, 250], [21.5, 280], [27, 300], [56, 312], [84, 322], [95, 334]]);
  line([[75, 394], [74, 440], [66, 490], [58, 525], [64, 560], [79, 600], [91, 645], [93, 700], ...legOuterRun(760, 1396)]);
  line(legInnerRun(1396, 702));
  line([[75, 394], [79, 380]], { sw: 1.2, opacity: 0.7 });                              // armpit crease
  line([[14, 318], [30, 322], [46, 320]], { sw: 1.3, opacity: 0.6 });                   // collarbone
  line([[20, 1000], [23, 1009], [21, 1018]], { sw: 1.2, opacity: 0.4 });                // knee
  add({ layer: 'bodyLine', closed: false, line: 'skin', sw: 1.2, opacity: 0.6, pts: [[0, 541], [0.6, 548]] });   // navel
  return S;
}

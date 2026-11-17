// Head, facial features and expressions. The face is separate parts driven by a face state F,
// so expressions and blinking never touch the rest of the figure.
import { ellipse } from './geom.js';
import { FACE, Y } from './template.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const LASH = '#2b1b24';
const EYE = { x: 35, y: Y.eye };
const MY = Y.mouth;

// Lid outlines in eye-local coordinates (x outward from the eye center, y down), about 1.6 : 1.
export const EYE_SHAPES = {
  neutral: { up: [[-17, 4], [-13, -4.5], [-4, -11], [7, -11.5], [15, -7.5], [19.5, 0]], lo: [[15.5, 6.5], [6, 10.5], [-6, 10], [-14.5, 7]], iris: 1 },
  gentle: { up: [[-17, 3], [-13, -5.5], [-4, -11.5], [7, -11], [15, -5.5], [19.5, 2.5]], lo: [[15.5, 8], [6, 11], [-6, 10], [-14.5, 6.5]], iris: 1 },
  sharp: { up: [[-17, 5.5], [-13, -2.5], [-4, -9.5], [7, -11.5], [15, -9.5], [20, -3]], lo: [[16, 4.5], [6, 9.5], [-6, 9.5], [-14.5, 8]], iris: 0.95 },
  round: { up: [[-16, 3.5], [-12.5, -6.5], [-4, -13.5], [6.5, -13.5], [14, -8], [18, 0.5]], lo: [[14.5, 8], [6, 12.5], [-6, 12], [-13.5, 7.5]], iris: 1.1 },
};

export const EXPRESSIONS = {
  neutral: { mouth: 'soft', blush: 0.35 },
  smile: { open: 0.92, brow: -1, tilt: -0.1, mouth: 'smile', blush: 0.5 },
  happy: { open: 0, smile: 1, brow: -2, tilt: -0.25, mouth: 'open', blush: 0.6 },
  surprised: { open: 1.18, brow: -6, tilt: -0.3, mouth: 'o', blush: 0.3, iris: 0.84 },
  angry: { open: 0.9, slant: 1, brow: 3, tilt: 1, mouth: 'frown', blush: 0.2 },
  shy: { open: 0.8, slant: -0.6, tilt: -0.9, mouth: 'wavy', blush: 1, lx: 3.5, ly: 2.5 },
  sad: { open: 0.78, slant: -1, brow: 1, tilt: -1, mouth: 'frown', blush: 0.15, ly: 2 },
};
// Other words an LLM may use, mapped to what exists.
export const EXPRESSION_ALIASES = {
  embarrassed: 'shy', blushing: 'shy', flustered: 'shy', bashful: 'shy', mad: 'angry', annoyed: 'angry', irritated: 'angry', furious: 'angry',
  pout: 'angry', joyful: 'happy', laughing: 'happy', laugh: 'happy', grin: 'happy', delighted: 'happy', excited: 'happy', smiling: 'smile',
  content: 'smile', smug: 'smile', shocked: 'surprised', startled: 'surprised', astonished: 'surprised', scared: 'surprised', crying: 'sad',
  upset: 'sad', depressed: 'sad', melancholy: 'sad', worried: 'sad', calm: 'neutral', serious: 'neutral', blank: 'neutral', thinking: 'neutral',
};
export const EYE_ALIASES = { tsurime: 'sharp', upturned: 'sharp', narrow: 'sharp', cat: 'sharp', tareme: 'gentle', droopy: 'gentle', soft: 'gentle', sleepy: 'gentle', big: 'round', large: 'round', wide: 'round', normal: 'neutral' };
export const FACE_DEFAULT = { open: 1, smile: 0, slant: 0, brow: 0, tilt: 0, blush: 0.35, iris: 1, lx: 0, ly: 0, mouth: 'soft' };

// Upper lid height for face state F (open 0..1.2, smile 0..1, slant -1..1).
function lidY(ex, ey, F) {
  const k = clamp(1 - ((ex - 1) / 18.5) ** 2);
  const shut = 2 + 7.5 * k, happy = 2 - 6 * k;
  const target = shut + (happy - shut) * F.smile;
  let y = target + (ey - target) * F.open;
  const r = (ex + 17) / 36.5;
  y += F.slant > 0 ? F.slant * 4 * (1 - r) * k : -F.slant * 3.5 * r * k;
  return y;
}

function eyeShapes(add, side, shape) {
  const sfx = side > 0 ? 'R' : 'L';
  const at = (ex, ey, c) => [side * (EYE.x + ex), EYE.y + ey, c ? 1 : 0];
  const upperLid = F => shape.up.map(([ex, ey]) => [ex, lidY(ex, ey, F)]);
  const open = st => st.F.open > 0.16;
  const iris = st => {
    const F = st.F, k = F.iris * shape.iris;
    return { x: side * (EYE.x - 0.5) + F.lx, y: EYE.y - 1 + F.ly, rx: 10.5 * k, ry: 13 * k };
  };
  const clip = 'eyeWhite' + sfx;
  const inEye = (extra, f) => add(Object.assign({ layer: 'face', clip, pts: st => (open(st) ? f(iris(st), st) : null) }, extra));

  add({
    id: clip, layer: 'face', fill: '#fffdfa',
    pts: st => {
      if (!open(st)) return null;
      const u = upperLid(st.F);
      return u.map((p, i) => at(p[0], p[1], i === 0 || i === u.length - 1)).concat(shape.lo.map(p => at(p[0], p[1])));
    },
  });
  inEye({ fill: 'eye:iris', line: 'eye', sw: 1.3 }, i => ellipse(i.x, i.y, i.rx, i.ry));
  inEye({ fill: '#191225', opacity: 0.8 }, i => ellipse(i.x, i.y - 1, i.rx * 0.36, i.ry * 0.42));
  inEye({ fill: 'eye.hi', opacity: 0.8 }, i => ellipse(i.x, i.y + i.ry * 0.55, i.rx * 0.6, i.ry * 0.27));
  // Shadow the upper lid casts on the eyeball.
  inEye({ fill: '#5d5378', opacity: 0.38 }, (i, st) => {
    const u = upperLid(st.F);
    return u.map(p => at(p[0], p[1])).concat(u.slice().reverse().map(p => at(p[0], p[1] + 4.5)));
  });
  inEye({ fill: '#ffffff' }, i => ellipse(i.x - 4.2, i.y - 6.2, 3.1, 3.7));
  inEye({ fill: '#ffffff', opacity: 0.9 }, i => ellipse(i.x + 4.4, i.y + 5.2, 1.5, 1.5));
  // Upper lash: a tapered band along the lid with a flick at the outer corner.
  add({
    layer: 'face', fill: LASH,
    pts: st => {
      const u = upperLid(st.F), th = [0, 2.6, 3.8, 4.2, 4.4], last = u[u.length - 1];
      const out = u.map((p, i) => at(p[0], p[1], i === 0));
      out.push(at(last[0] + 5, last[1] - 3.5, 1));
      for (let i = 4; i >= 1; i--) out.push(at(u[i][0], u[i][1] - th[i]));
      return out;
    },
  });
  add({ layer: 'face', closed: false, stroke: LASH, sw: 1.2, opacity: 0.7, pts: st => (st.F.open > 0.4 ? [at(shape.lo[0][0] + 2.5, shape.lo[0][1] - 1.5), ...shape.lo.slice(0, 3).map(p => at(p[0], p[1] + 0.5))] : null) });
  add({
    layer: 'face', closed: false, line: 'skin', sw: 1.1, opacity: 0.7,
    pts: st => {
      if (st.F.smile > 0.5) return null;
      const d = (1 - Math.min(1, st.F.open)) * 6;
      return [1, 2, 3, 4].map(i => at(shape.up[i][0] + (i === 1 ? 1 : i === 4 ? 2 : 0), shape.up[i][1] - (i === 1 || i === 4 ? 7 : 6.2) + d));
    },
  });
}

const MOUTH_LINES = {
  soft: [[-9.5, MY - 1.4], [0, MY + 1], [9.5, MY - 1.4]],
  frown: [[-9, MY + 1.8], [0, MY - 1.2], [9, MY + 1.8]],
  wavy: [[-9.5, MY], [-4.7, MY - 2.4], [0, MY], [4.7, MY + 2.4], [9.5, MY]],
};
const MOUTH_FILLS = {
  smile: [[-8.5, MY - 3, 1], [0, MY - 1.6], [8.5, MY - 3, 1], [5, MY + 3.6], [0, MY + 5], [-5, MY + 3.6]],
  open: [[-11.5, MY - 5, 1], [0, MY - 3.2], [11.5, MY - 5, 1], [8.5, MY + 6], [0, MY + 10.5], [-8.5, MY + 6]],
  o: ellipse(0, MY + 1, 4.2, 5.8),
};

export function faceShapes(face) {
  const S = [];
  const add = s => S.push(s);
  const shape = EYE_SHAPES[face.eyes.shape] || EYE_SHAPES.neutral;

  add({ id: 'face', layer: 'head', sym: true, pts: FACE, fill: 'skin', line: 'skin' });
  add({ layer: 'face', mirror: true, clip: 'face', fill: 'blush', opacity: st => 0.85 * st.F.blush, pts: ellipse(43.5, 226, 18, 9) });
  for (const dx of [-5, 0, 5]) {
    add({ layer: 'face', mirror: true, closed: false, stroke: '#e56b78', sw: 1.2, opacity: st => clamp((st.F.blush - 0.6) * 2.5), pts: [[46 + dx, 222], [42 + dx, 230]] });
  }
  add({ layer: 'face', fill: 'skin.shadow', pts: [[0.5, 229, 1], [4, 235.5, 1], [-0.5, 236, 1]] });
  add({ id: 'mouth', layer: 'face', fill: '#b24a58', stroke: '#7c2f3d', sw: 1.5, pts: st => MOUTH_FILLS[st.F.mouth] || null });
  add({ layer: 'face', clip: 'mouth', fill: '#f2909a', pts: st => (st.F.mouth === 'open' ? ellipse(0, MY + 8.5, 6.5, 3.6) : null) });
  add({ layer: 'face', closed: false, line: 'skin', sw: 1.7, pts: st => MOUTH_LINES[st.F.mouth] || null });
  add({ layer: 'face', closed: false, stroke: 'skin.shadow', sw: 1.6, pts: [[-4.5, MY + 7.5], [0, MY + 8.5], [4.5, MY + 7.5]], opacity: st => (st.F.mouth === 'open' ? 0 : 0.9) });
  eyeShapes(add, 1, shape);
  eyeShapes(add, -1, shape);

  // Brows are drawn last so they read through the fringe.
  for (const side of [1, -1]) {
    add({
      layer: 'brows', closed: false, stroke: 'hair.deep', sw: 2, opacity: 0.85,
      pts: st => {
        const F = st.F;
        return [[-18, 2.5 + F.tilt * 5], [-3, -2 + F.tilt * 1.5], [17, 2 - F.tilt * 2.5]].map(p => [side * (35 + p[0]), Y.brow + p[1] + F.brow]);
      },
    });
  }
  return S;
}

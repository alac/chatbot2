// Body parameters -> one warp function applied to every layer (body, clothes, hair).
// Template space: x measured from the centerline, y down. Landmarks are listed in template.js (Y).
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function table(rows, smooth) {
  return y => {
    if (y <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) {
      if (y <= rows[i][0]) {
        const a = rows[i - 1], b = rows[i];
        return lerp(a[1], b[1], smooth ? sm(a[0], b[0], y) : (y - a[0]) / (b[0] - a[0]));
      }
    }
    return rows[rows.length - 1][1];
  };
}

const CX = 300;                       // centerline in output space
const ARM_AXIS = table([[338, 93], [420, 99], [480, 100], [525, 96], [560, 88], [600, 70], [625, 55]]);
const BUST = { x: 40, y: 418, sx: 34, sy: 36 };
const BASE = { head: 1, legs: 0.98, width: 1.13 };   // default proportions relative to the drawn template
const BREATH_RISE = 2.6;                   // how far the chest and head lift on a full breath

// P: { height, build, bust, hips, shoulders } each -1..1, plus breath 0..1
export function makeRig(P) {
  const b = P.build || 0, hp = P.hips || 0, sh = P.shoulders || 0;
  const ht = P.height || 0, bu = P.bust || 0, br = P.breath || 0;
  const bp = Math.max(b, 0), bn = Math.min(b, 0);

  // Hips: up to 1 the slider behaves exactly as it always has; past 1 the same step adds much more
  // width, so the top of the range is where the exaggeration lives (at 1.3 the hips end up 30%
  // wider than they could be before, while every value from -1 to 1 keeps its old meaning).
  const hipW = hp <= 1 ? 0.13 * hp : 0.13 + (hp - 1) * 1.13;

  // Width scale by height on the body.
  const S = table([
    [150, 1],
    [215, 1 + 0.035 * b],
    [262, 1 + 0.02 * b],
    [292, 1 + 0.10 * b],
    [334, 1 + 0.08 * sh + 0.05 * b],
    [400, 1 + 0.05 * sh + 0.09 * b],
    [525, 1 + 0.22 * bp + 0.13 * bn],
    [650, 1 + hipW + 0.13 * b],
    [760, 1 + hipW * 0.92 + 0.17 * b],
    [1010, 1 + hipW * 0.15 + 0.10 * b],
    [1110, 1 + 0.12 * b],
    [1360, 1 + 0.07 * b],
    [1446, 1 + 0.04 * b],
  ], true);

  // Height: legs stretch most, torso less, head barely.
  const kl = BASE.legs * (1 + 0.12 * ht), kt = 1 + 0.06 * ht, kh = BASE.head * (1 - 0.03 * ht);
  const gw = BASE.width * (1 + 0.03 * ht);
  const yCrotch = 1392 - 702 * kl, yNeck = yCrotch - 390 * kt;
  const yMap = y => (y >= 1392 ? y : y >= 690 ? 1392 - (1392 - y) * kl
    : y >= 300 ? yCrotch - (690 - y) * kt : yNeck - (300 - y) * kh);
  const headK = y => lerp(kh, gw, sm(268, 300, y));

  const sShoulder = S(334), sChest = S(400), sHip = Math.max(S(650), S(760));

  // Arms follow the shoulder width and thicken about their own axis.
  const kArm = 1 + 0.18 * b;
  const dShoulder = 99 * (sShoulder - 1);

  function widthScale(y, fit) {
    let s = S(y);
    if (fit === 'hair') return (1 + 0.5 * (sShoulder - 1) * sm(285, 340, y)) * lerp(kh, Math.max(kh, gw), sm(285, 360, y));
    if (fit === 'loose' && y > 400) {
      // Loose tops hang from the chest instead of hugging the waist.
      const target = sChest + 0.07 * Math.max(0, bu);
      s = Math.max(s, s + (target - s) * 0.7 * sm(400, 470, y));
    } else if (fit === 'skirt') {
      // Hangs from the hips, but never narrower than the legs under it.
      s = Math.max(s, lerp(s, sHip, sm(560, 640, y)));
    }
    s *= 1 + 0.014 * br * sm(300, 380, y) * (1 - sm(440, 540, y));
    return s * headK(y);
  }

  function warp(u, v, part, fit) {
    const isArm = part === 'arm';

    // `flat` shapes sit on the body without being pushed by it: a collar band is stiff cloth and its
    // straight edges should stay straight. It keeps the normal width scaling, so it still fits the
    // shoulders -- unlike `skirt`, which is a hip fit that happens to skip the same warp.
    if (bu && !isArm && fit !== 'hair' && fit !== 'skirt' && fit !== 'flat' && v > 320 && v < 560) {
      // Past bu = 2 the chest stops getting pointier and starts rounding: the mass spreads wider,
      // keeps more of its height and sags less, so it reads as full and round rather than drooping.
      const ex = Math.max(0, bu - 2);
      const sx = BUST.sx * (1 + 0.22 * ex), sy = BUST.sy * (1 + 0.18 * ex);
      let du = 0, dv = 0;
      for (const side of [-1, 1]) {
        const dx = u - side * BUST.x, dy = v - BUST.y;
        const w = Math.exp(-(dx * dx) / (sx * sx) - (dy * dy) / (sy * sy));
        // Shrinking must not dent the outer chest contour.
        const keep = bu < 0 ? 1 - sm(18, 34, dx * side) : 1;
        // Lateral push. Inner points move less than outer ones only where necklines live -- above
        // the bust line -- because that taper stops a deep V closing as the bust grows. Below the
        // bust it fades back to radial: keeping it there stretched the outer half of every cup, so
        // the lowest point of the breast landed about three quarters of the way across and the
        // underside read as an asymmetric V instead of a curve.
        const out = dx * side;
        const above = sm(BUST.y + 20, BUST.y - 8, v);   // 1 above the bust line, 0 below it
        const lateral = bu > 0 ? dx * (1 - above * 0.82 * (1 - sm(0, 30, out))) : dx;
        du += lateral * 0.85 * bu * w * keep * (1 + 0.25 * ex);
        dv += dy * 0.85 * bu * w * (1 + 0.1 * ex) + (7 - 4.5 * ex) * bu * w;
      }
      u += du; v += dv;
    }

    let X, Y;
    if (isArm) {
      const wa = sm(338, 400, v), sg = u < 0 ? -1 : 1, au = Math.abs(u);
      const ax = ARM_AXIS(v);
      const xa = (ax + dShoulder + (au - ax) * kArm) * gw;
      X = sg * (lerp(au * S(v) * gw, xa, wa) + 0.8 * br * (1 - sm(340, 520, v)));
      Y = yMap(v) - BREATH_RISE * br * (1 - sm(430, 570, v));
    } else {
      X = u * widthScale(v, fit);
      Y = yMap(v);
      if (fit === 'loose') Y -= 5 * Math.max(0, bu) * sm(450, 560, v);
      Y -= BREATH_RISE * br * (1 - sm(430, 570, v));
    }
    return [CX + X, Y];
  }

  return { warp, yMap, unit: gw, cx: CX };
}

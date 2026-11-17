// Shapes are authored as lists of points the outline passes through.
// A point is [x, y] (smooth) or [x, y, 1] (corner). x is measured from the body centerline.

const norm = pts => pts.map(p => ({ x: p[0], y: p[1], c: !!p[2] }));
const mirror = P => P.map(p => ({ x: -p.x, y: p.y, c: p.c }));
const shift = (P, o) => P.map(p => ({ x: p.x + o[0], y: p.y + o[1], c: p.c }));

// Half outline (first and last point on the centerline) -> full closed outline.
function symClose(P) {
  const out = P.slice();
  for (let i = P.length - 2; i >= 1; i--) out.push({ x: -P[i].x, y: P[i].y, c: P[i].c });
  return out;
}

// Smooth curve through points -> cubic bezier segments [x0,y0,x1,y1,x2,y2,x3,y3].
function segments(P, closed) {
  const n = P.length, out = [];
  const get = i => (closed ? P[((i % n) + n) % n] : P[i]);
  const tangent = i => {
    const p = get(i), a = get(i - 1), b = get(i + 1);
    if (!a || !b || p.c) return null;
    const d = Math.hypot(p.x - a.x, p.y - a.y) + Math.hypot(b.x - p.x, b.y - p.y) || 1;
    return [(b.x - a.x) / d, (b.y - a.y) / d];
  };
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p = get(i), q = get(i + 1);
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    const t0 = tangent(i), t1 = tangent(i + 1);
    out.push([
      p.x, p.y,
      t0 ? p.x + t0[0] * d / 3 : p.x + dx / 3, t0 ? p.y + t0[1] * d / 3 : p.y + dy / 3,
      t1 ? q.x - t1[0] * d / 3 : q.x - dx / 3, t1 ? q.y - t1[1] * d / 3 : q.y - dy / 3,
      q.x, q.y,
    ]);
  }
  return out;
}

function split(s, t) {
  const l = (a, b) => a + (b - a) * t;
  const ax = l(s[0], s[2]), ay = l(s[1], s[3]), bx = l(s[2], s[4]), by = l(s[3], s[5]);
  const cx = l(s[4], s[6]), cy = l(s[5], s[7]);
  const abx = l(ax, bx), aby = l(ay, by), bcx = l(bx, cx), bcy = l(by, cy);
  const mx = l(abx, bcx), my = l(aby, bcy);
  return [[s[0], s[1], ax, ay, abx, aby, mx, my], [mx, my, bcx, bcy, cx, cy, s[6], s[7]]];
}

// Split long segments so a nonlinear warp of the control points stays accurate.
function subdivide(S, maxLen) {
  const out = [];
  for (const s of S) {
    const n = Math.max(1, Math.ceil(Math.hypot(s[6] - s[0], s[7] - s[1]) / maxLen));
    let rest = s;
    for (let k = n; k > 1; k--) { const [a, b] = split(rest, 1 / k); out.push(a); rest = b; }
    out.push(rest);
  }
  return out;
}

const f = v => Math.round(v * 10) / 10;

function toD(S, closed, warp) {
  if (!S.length) return '';
  let p = warp(S[0][0], S[0][1]);
  let d = 'M' + f(p[0]) + ' ' + f(p[1]);
  for (const s of S) {
    const a = warp(s[2], s[3]), b = warp(s[4], s[5]), c = warp(s[6], s[7]);
    d += 'C' + f(a[0]) + ' ' + f(a[1]) + ' ' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(c[0]) + ' ' + f(c[1]);
  }
  return closed ? d + 'Z' : d;
}

function ellipse(cx, cy, rx, ry, n = 12) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}


// Push a closed outline outward by d (number, or function(point, index) -> number).
// Used to derive a garment from a body outline plus ease.
function offsetPoly(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area >= 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    const k = (typeof d === 'function' ? d(p, i) : d) * sign / len;
    return [p[0] + ty * k, p[1] - tx * k, p[2] || 0];
  });
}

// Piecewise-linear lookup through [key, value] rows.
function lin(rows) {
  return k => {
    if (k <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) {
      if (k <= rows[i][0]) { const a = rows[i - 1], b = rows[i]; return a[1] + (b[1] - a[1]) * (k - a[0]) / (b[0] - a[0]); }
    }
    return rows[rows.length - 1][1];
  };
}

/** Points spaced evenly along a polyline, by arc length. */
export function resample(pts, n) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[acc.length - 1], out = [];
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    let i = 1;
    while (i < acc.length - 1 && acc[i] < s) i++;
    const run = acc[i] - acc[i - 1], t = run ? (s - acc[i - 1]) / run : 0;
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
  }
  return out;
}
/**
 * A scalloped band standing out from `edge`. `out` is the point the bumps point away from, so one
 * helper does a bib's side, a hem and a cuff: the normal is flipped to face away from it.
 */
export function scallop(edge, { dist = 7, amp = 2.4, waves = 9, back = 2, out = [0, 500] } = {}) {
  // Nine samples a wave: three is a sawtooth, not a ruffle.
  const e = resample(edge, Math.max(16, waves * 9)), top = [], base = [];
  e.forEach((p, i) => {
    const a = e[Math.max(0, i - 1)], b = e[Math.min(e.length - 1, i + 1)];
    const m = Math.hypot(b[1] - a[1], b[0] - a[0]) || 1;
    let nx = -(b[1] - a[1]) / m, ny = (b[0] - a[0]) / m;
    if (nx * (p[0] - out[0]) + ny * (p[1] - out[1]) < 0) { nx = -nx; ny = -ny; }
    // sqrt(sin) rather than sin: rounded bumps with a cusp between them is what gathered lace looks
    // like. A plain sine gives a symmetrical wave, which reads as ric-rac ribbon.
    const d = dist + amp * Math.sqrt(Math.max(0, Math.sin((i / (e.length - 1)) * Math.PI * 2 * waves)));
    top.push([p[0] + nx * d, p[1] + ny * d]);
    base.push([p[0] - nx * back, p[1] - ny * back]);
  });
  return [...top, ...base.reverse()];
}

export { norm, mirror, shift, symClose, segments, subdivide, toD, ellipse, offsetPoly, lin };

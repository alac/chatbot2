// Builds one inline SVG per avatar and keeps it in sync with a spec and a little runtime state.
import * as G from './geom.js';
import { derive } from './color.js';
import { makeRig } from './rig.js';
import { compose } from './compose.js';
import { normalize, resolveExpression, canon } from './normalize.js';
import { EXPRESSIONS, FACE_DEFAULT } from './face.js';

const NS = 'http://www.w3.org/2000/svg';
// Gradients use each shape's own bounding box, so they survive warping and mirroring.
const GRADS = {
  limb: { x2: 1, y2: 0, flat: '', stops: [[0, 'mid'], [0.25, ''], [0.6, ''], [1, 'shadow']] },
  v: { x2: 0, y2: 1, flat: '', stops: [[0, ''], [0.5, ''], [1, 'shadow']] },
  back: { x2: 0, y2: 1, flat: 'shadow', stops: [[0, 'shadow'], [1, 'deep']] },
  iris: { x2: 0, y2: 1, flat: '', stops: [[0, 'deep'], [0.5, ''], [1, 'hi']] },
};
// Concentric upward arcs (seigaiha's ring, yagasuri's feather, asanoha's leaf).
// A part with `sw` is stroked in the pattern colour instead of filled, so line patterns work too.
const rings = (cx, cy, R, n = 4) => Array.from({ length: n }, (_, i) => {
  const r = R * (1 - i / n), d = `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return ['path', { d, sw: i ? 1.1 : 1.6 }, 1];
});
const blossom = (cx, cy, r = 7.5, rr = 4.3) => Array.from({ length: 5 }, (_, k) => {
  const a = -Math.PI / 2 + k * (Math.PI * 2 / 5);
  return ['circle', { cx: +(cx + Math.cos(a) * r).toFixed(1), cy: +(cy + Math.sin(a) * r).toFixed(1), r: rr }, 1];
});
// Pattern tiles: [tile width, tile height, [[shape, attrs, opacity]...]]
// Tiles repeat in user space, so a shape that spills past an edge is completed by the next tile.
export const TILES = {
  stripes: [8, 26, [['rect', { x: 0, y: 0, width: 8, height: 12 }, 1]]],
  pinstripes: [14, 8, [['rect', { x: 0, y: 0, width: 2, height: 8 }, 1]]],
  polka: [28, 28, [['circle', { cx: 7, cy: 7, r: 4.6 }, 1], ['circle', { cx: 21, cy: 21, r: 4.6 }, 1]]],
  gingham: [24, 24, [['rect', { x: 0, y: 0, width: 12, height: 24 }, 0.45], ['rect', { x: 0, y: 0, width: 24, height: 12 }, 0.45]]],
  plaid: [44, 44, [
    ['rect', { x: 0, y: 0, width: 15, height: 44 }, 0.38], ['rect', { x: 0, y: 0, width: 44, height: 15 }, 0.38],
    ['rect', { x: 28, y: 0, width: 2, height: 44 }, 0.8], ['rect', { x: 0, y: 28, width: 44, height: 2 }, 0.8],
  ]],
  // --- Japanese ---
  // asanoha, hemp leaf: hexagons that share edges, each divided into six triangles. Hexagon centres
  // sit on a triangular lattice, so the rectangular tile holds two of them, offset by half.
  asanoha: [45, 78, [
    ['path', { d: 'M0 -26L22.5 -13L22.5 13L0 26L-22.5 13L-22.5 -13Z M0 -26V26M-22.5 -13L22.5 13M-22.5 13L22.5 -13', sw: 1.2 }, 1],
    ['path', { d: 'M0 -26L22.5 -13L22.5 13L0 26L-22.5 13L-22.5 -13Z M0 -26V26M-22.5 -13L22.5 13M-22.5 13L22.5 -13', transform: 'translate(22.5 39)', sw: 1.2 }, 1],
  ]],
  // seigaiha, blue ocean waves: rows of nested arcs, each row tucked half a radius under the last.
  seigaiha: [60, 30, [...rings(0, 0, 29), ...rings(30, 15, 29)]],
  // yagasuri, arrow feathers: two columns of nested chevrons, one pointing up and one down.
  yagasuri: [32, 26, [
    ['path', { d: 'M3 22L9 5L15 22M5.4 22L9 11.2L12.6 22M7.4 22L9 17.4L10.6 22', sw: 1.2 }, 1],
    ['path', { d: 'M3 22L9 5L15 22M5.4 22L9 11.2L12.6 22M7.4 22L9 17.4L10.6 22', transform: 'translate(16 13) rotate(180 9 13)', sw: 1.2 }, 1],
  ]],
  // floral: five-petal blossoms on a loose diagonal.
  floral: [44, 44, [...blossom(0, 0), ...blossom(22, 22)]],
};
// View boxes in output space. 'waist', 'bust' and 'face' follow the head as height changes.
const FIXED_VIEWS = { full: [0, -70, 600, 1550], stage: [50, -70, 500, 790] };
const HEAD_VIEWS = { waist: [60, -34, 480, 660], bust: [120, -30, 360, 400], face: [185, -12, 230, 250] };
const FLAT_LINE = '#3a2b33';

export const DEFAULT_STATE = {
  expression: null,          // null = use spec.expression
  outfit: null,              // null = use spec.outfit
  finish: 1,                 // 0 flat cel, 1 shaded, 2 shaded + glow
  crop: 'full',              // 'full' | 'waist' | 'bust' | 'face' | 'stage' | [x, y, w, h] | { template: [x, y, w, h] }
  breathing: true,
  blinking: true,
  breath: null,              // fixed 0..1 value for stills
};

const el = (name, attrs) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  return e;
};
const varName = (ch, v) => '--' + ch + (v ? '-' + v : '');

/** Shape -> bezier segments for each copy (1, or 2 when mirrored). Shared with the check tool. */
export function shapeSegs(sh, st) {
  const pts = typeof sh.pts === 'function' ? sh.pts(st) : sh.pts;
  if (!pts) return null;
  let P = G.norm(pts);
  if (sh.offset) P = G.shift(P, sh.offset);
  if (sh.sym) P = G.symClose(P);
  const closed = sh.closed !== false;
  const a = G.subdivide(G.segments(P, closed), 26);
  return sh.mirror ? [a, G.subdivide(G.segments(G.mirror(P), closed), 26)] : [a];
}

/** Warp function for one shape under a rig. Rigid shapes only follow their anchor. */
export function shapeWarp(sh, rig) {
  if (!sh.anchor) return (x, y) => rig.warp(x, y, sh.part, sh.fit);
  const [ax, ay] = sh.anchor, a = rig.warp(ax, ay, sh.part, sh.fit);
  return (x, y) => [a[0] + (x - ax) * rig.unit, a[1] + (y - ay) * rig.unit];
}

let seq = 0;

/**
 * createAvatar(host, spec, state?) -> { el, spec, state, warnings, set, update, toBlob, destroy }
 *   spec   character JSON (normalized here; raw LLM output is fine)
 *   state  see DEFAULT_STATE
 */
export function createAvatar(host, rawSpec, initState) {
  const uid = 'av' + (++seq);
  const state = Object.assign({}, DEFAULT_STATE, initState);
  if (state.expression != null) state.expression = resolveExpression(state.expression);
  if (state.outfit != null) state.outfit = canon(state.outfit);
  let { spec, warnings } = normalize(rawSpec);

  const svg = el('svg', { xmlns: NS, preserveAspectRatio: 'xMidYMax meet' });
  svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible';
  const defs = el('defs'), fig = el('g');
  svg.append(defs, fig);
  let items = [], channels = {};

  function staticDefs() {
    const radial = (id, color, a) => {
      const rg = el('radialGradient', { id: `${uid}-${id}` });
      rg.append(el('stop', { offset: 0, 'stop-color': color, 'stop-opacity': a }), el('stop', { offset: 1, 'stop-color': color, 'stop-opacity': 0 }));
      defs.append(rg);
    };
    radial('blush', '#ff7d8c', 0.8);
    radial('glow', '#ffffff', 0.85);
    const soft = el('filter', { id: `${uid}-soft`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    soft.append(el('feGaussianBlur', { stdDeviation: 2.4 }));
    // Diffusion glow: a blurred copy screened over the figure, kept inside the silhouette.
    const glow = el('filter', { id: `${uid}-glowfx`, x: '-5%', y: '-3%', width: '110%', height: '106%', 'color-interpolation-filters': 'sRGB' });
    const dim = el('feComponentTransfer', { in: 'blur', result: 'dim' });
    dim.append(el('feFuncA', { type: 'linear', slope: 0.2 }));
    glow.append(
      el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 8, result: 'blur' }), dim,
      el('feBlend', { in: 'dim', in2: 'SourceGraphic', mode: 'screen', result: 'lit' }),
      el('feComposite', { in: 'lit', in2: 'SourceGraphic', operator: 'in' }),
    );
    defs.append(soft, glow);
  }

  // ---- (re)build the element tree for the current spec + outfit ---------------
  function rebuild() {
    const c = compose(spec, state.outfit || spec.outfit);
    channels = c.channels;
    defs.replaceChildren();
    fig.replaceChildren();
    staticDefs();

    const grads = new Set();
    for (const sh of c.shapes) if (sh.fill && sh.fill.includes(':')) grads.add(sh.fill);
    for (const ref of grads) {
      const [ch, g] = ref.split(':');
      const lg = el('linearGradient', { id: `${uid}-${ch}-${g}`, x1: 0, y1: 0, x2: GRADS[g].x2, y2: GRADS[g].y2 });
      for (const [off, v] of GRADS[g].stops) {
        const s = el('stop', { offset: off });
        s.style.stopColor = `var(${varName(ch, v)})`;
        lg.append(s);
      }
      defs.append(lg);
    }
    for (const key in c.patterns) {
      const [w, h, parts] = TILES[c.patterns[key]];
      const pat = el('pattern', { id: `${uid}-pat-${key}`, width: w, height: h, patternUnits: 'userSpaceOnUse' });
      for (const [name, raw, opacity] of parts) {
        const { sw, ...attrs } = raw;
        const e = el(name, attrs);
        if (sw) {
          e.style.fill = 'none';
          e.style.stroke = `var(${varName(key + '-pat')})`;
          e.style.strokeWidth = sw;
        } else e.style.fill = `var(${varName(key + '-pat')})`;
        e.style.opacity = opacity;
        pat.append(e);
      }
      defs.append(pat);
    }

    const byId = {};
    items = c.shapes.map(sh => {
      const it = { sh, els: [], over: [], clipEls: [], segs: null, closed: sh.closed !== false };
      for (let i = 0; i < (sh.mirror ? 2 : 1); i++) {
        const p = el('path', { 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        fig.append(p);
        it.els.push(p);
        if (sh.patternKey) {
          // The pattern is a second copy of the path painted over the base fill.
          const o = el('path');
          o.style.fill = `url(#${uid}-pat-${sh.patternKey})`;
          fig.append(o);
          it.over.push(o);
        }
      }
      if (sh.id) byId[sh.id] = it;
      if (typeof sh.pts !== 'function') it.segs = shapeSegs(sh);
      return it;
    });
    for (const it of items) {
      const target = it.sh.clip && byId[it.sh.clip];
      if (!target) continue;
      if (!target.clipId) {
        target.clipId = `${uid}-clip-${it.sh.clip}`;
        const cp = el('clipPath', { id: target.clipId });
        target.clipEls = target.els.map(() => cp.appendChild(el('path')));
        defs.append(cp);
      }
      [...it.els, ...it.over].forEach(e => e.setAttribute('clip-path', `url(#${target.clipId})`));
    }
    restyle();
  }

  // ---- colors and finish ------------------------------------------------------
  function paint(ref) {
    const flat = state.finish === 0;
    if (ref[0] === '#') return ref;
    if (ref === 'blush' || ref === 'glow') return `url(#${uid}-${ref})`;
    if (ref.includes(':')) {
      const [ch, g] = ref.split(':');
      return flat ? `var(${varName(ch, GRADS[g].flat)})` : `url(#${uid}-${ch}-${g})`;
    }
    const [ch, v] = ref.split('.');
    return `var(${varName(ch, v)})`;
  }

  function restyle() {
    const flat = state.finish === 0;
    for (const ch in channels) {
      const c = derive(channels[ch].color, channels[ch].kind);
      svg.style.setProperty(varName(ch), c.base);
      for (const v of ['shadow', 'deep', 'hi', 'mid']) svg.style.setProperty(varName(ch, v), c[v]);
      svg.style.setProperty(varName(ch, 'line'), flat ? FLAT_LINE : c.line);
    }
    for (const it of items) {
      const sh = it.sh;
      const stroke = sh.stroke ? paint(sh.stroke) : sh.line ? `var(${varName(sh.line, 'line')})` : 'none';
      for (const e of it.els) {
        e.style.fill = sh.fill ? paint(sh.fill) : 'none';
        e.style.stroke = stroke;
        if (stroke !== 'none') e.style.strokeWidth = sh.sw || 1.7;
        e.style.filter = sh.soft && !flat ? `url(#${uid}-soft)` : '';
      }
    }
    fig.style.filter = state.finish === 2 ? `url(#${uid}-glowfx)` : '';
  }

  // ---- face state and animation -----------------------------------------------
  const faceTarget = () => Object.assign({}, FACE_DEFAULT, EXPRESSIONS[state.expression || spec.expression]);
  const F = faceTarget();
  let raf = 0, last = 0, t0 = performance.now(), nextBlink = t0 + 1500, blinkStart = -1, alive = true;

  function stepFace(dt) {
    const T = faceTarget(), k = 1 - Math.exp(-dt / 70);
    let moving = false;
    for (const key in T) {
      if (typeof T[key] !== 'number') { F[key] = T[key]; continue; }
      const d = T[key] - F[key];
      if (Math.abs(d) > 0.002) { F[key] += d * k; moving = true; } else F[key] = T[key];
    }
    return moving;
  }

  function breathAt(t) {
    if (state.breath != null) return state.breath;
    if (!state.breathing) return 0;
    const p = ((t - t0) / 4200) % 1, s = x => x * x * (3 - 2 * x);
    return p < 0.42 ? s(p / 0.42) : 1 - s((p - 0.42) / 0.58);
  }

  function blinkAt(t) {
    if (!state.blinking) return 1;
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    if (blinkStart < 0) return 1;
    const e = t - blinkStart;
    if (e > 200) { blinkStart = -1; nextBlink = t + 2200 + Math.random() * 3800; return 1; }
    return e < 70 ? 1 - e / 70 : (e - 70) / 130;
  }

  function draw(t) {
    const P = Object.assign({}, spec.body, { breath: breathAt(t) });
    const face = Object.assign({}, F);
    if (face.smile < 0.5) face.open *= blinkAt(t);
    const st = { P, F: face, spec };
    const rig = makeRig(P);
    const flat = state.finish === 0;

    for (const it of items) {
      const sh = it.sh;
      const segs = sh.only === 'shaded' && flat ? null : it.segs || shapeSegs(sh, st);
      const warp = shapeWarp(sh, rig);
      it.els.forEach((e, i) => {
        const d = segs ? G.toD(segs[i], it.closed, warp) : '';
        e.setAttribute('d', d);
        if (it.over[i]) it.over[i].setAttribute('d', d);
        if (it.clipEls[i]) it.clipEls[i].setAttribute('d', d);
        if (sh.opacity != null) e.style.opacity = typeof sh.opacity === 'function' ? sh.opacity(st) : sh.opacity;
      });
    }

    let vb = Array.isArray(state.crop) ? state.crop : FIXED_VIEWS[state.crop];
    if (state.crop && state.crop.template) {
      // A box given in template coordinates follows the body as height changes.
      const [x, y, w, h] = state.crop.template, top = rig.yMap(y);
      vb = [x, top, w, rig.yMap(y + h) - top];
    } else if (!vb) {
      const h = HEAD_VIEWS[state.crop] || HEAD_VIEWS.waist;
      vb = [h[0], rig.yMap(46) + h[1], h[2], h[3]];
    }
    svg.setAttribute('viewBox', vb.join(' '));
  }

  function tick(t) {
    raf = 0;
    if (!alive) return;
    const moving = stepFace(Math.min(100, t - last));
    last = t;
    draw(t);
    if (moving || state.breathing || state.blinking) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(tick); } };

  rebuild();
  draw(performance.now());
  if (host) host.appendChild(svg);
  kick();

  const api = {
    el: svg,
    get spec() { return spec; },
    get warnings() { return warnings; },
    state,
    /** Change runtime state: expression, outfit, crop, finish, breathing, blinking. */
    set(patch) {
      patch = { ...patch };
      // Accept loose words from a story model: "Embarrassed" -> shy, "School" -> school.
      if (patch.expression != null) patch.expression = resolveExpression(patch.expression) || state.expression;
      if (patch.outfit != null) patch.outfit = canon(patch.outfit);
      const outfitChanged = 'outfit' in patch && patch.outfit !== state.outfit;
      Object.assign(state, patch);
      if (outfitChanged) rebuild(); else if ('finish' in patch) restyle();
      draw(performance.now());
      kick();
    },
    /** Replace the character spec. */
    update(next) {
      ({ spec, warnings } = normalize(next));
      rebuild();
      draw(performance.now());
      kick();
      return warnings;
    },
    /** Rasterize the current frame, e.g. for a message-list icon. */
    toBlob({ crop = state.crop, size = 256, type = 'image/png' } = {}) {
      const prev = state.crop;
      state.crop = crop;
      draw(performance.now());
      const vb = svg.getAttribute('viewBox').split(' ').map(Number);
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', vb[2]);
      clone.setAttribute('height', vb[3]);
      state.crop = prev;
      draw(performance.now());
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const k = size / Math.max(vb[2], vb[3]);
          const cv = document.createElement('canvas');
          cv.width = Math.round(vb[2] * k);
          cv.height = Math.round(vb[3] * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(url);
          cv.toBlob(resolve, type);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not rasterize avatar')); };
        img.src = url;
      });
    },
    destroy() { alive = false; cancelAnimationFrame(raf); svg.remove(); },
  };
  return api;
}

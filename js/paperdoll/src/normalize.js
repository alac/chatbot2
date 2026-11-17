// Lenient parser: turns whatever an LLM produced into a valid spec. Never throws.
// Unknown values fall back to the nearest known one, or the default, with a warning.
import { getItem, allItems } from './registry.js';
import { HAIR_OPTIONS, HAIR_DEFAULTS, HAIR_ALIASES } from './assets/hair.js';
import { EYE_SHAPES, EYE_ALIASES, EXPRESSIONS, EXPRESSION_ALIASES } from './face.js';
import './assets/index.js';

// Named buckets for body sliders. Numbers are accepted too.
export const BODY = {
  height: { range: [-1, 1], buckets: { petite: -1, short: -0.5, average: 0, tall: 0.5, very_tall: 1 } },
  build: { range: [-1, 1], buckets: { slender: -1, slim: -0.5, average: 0, soft: 0.4, plump: 1 } },
  bust: { range: [-1, 2.5], buckets: { flat: -1, small: -0.5, medium: 0, large: 0.8, very_large: 1.4, huge: 2, enormous: 2.5 } },
  hips: { range: [-1, 1.3], buckets: { narrow: -1, medium: 0, wide: 1, very_wide: 1.3 } },
  shoulders: { range: [-1, 1], buckets: { narrow: -1, medium: 0, broad: 1 } },
};
export const SKIN = { pale: '#fff1ea', fair: '#fde9de', light: '#f6d9c6', tan: '#e2b08e', olive: '#d1a57c', brown: '#a8744f', dark: '#7a4f36' };
export const PATTERNS = ['solid', 'stripes', 'pinstripes', 'plaid', 'gingham', 'polka', 'asanoha', 'seigaiha', 'yagasuri', 'floral'];

export const COLORS = {
  black: '#1b1b1f', white: '#ffffff', gray: '#8a8d94', grey: '#8a8d94', silver: '#c9ccd4', charcoal: '#3a3c44',
  red: '#c8323c', crimson: '#b3243a', scarlet: '#d5352b', maroon: '#6e1f2c', burgundy: '#6b1e30', wine: '#5e1a2e',
  pink: '#f29ab4', hot_pink: '#e8468a', rose: '#e0607e', salmon: '#f08a78', coral: '#f0705a', peach: '#f7c3a4',
  orange: '#ee8a2c', amber: '#f0a830', yellow: '#f2d24a', gold: '#d9a93a', cream: '#f6efd8', ivory: '#f8f4e6', beige: '#e3d3b4',
  khaki: '#b7a67a', tan: '#c49a6c', brown: '#6b4630', chocolate: '#4a2f22', chestnut: '#7a4a34', auburn: '#8a3b26',
  green: '#3f9a5a', lime: '#9ad04a', mint: '#a7e0c4', olive: '#7a8440', forest_green: '#2c5a3c', emerald: '#2f9a6a', teal: '#2a8a8a',
  cyan: '#4ac4d8', aqua: '#6ad4d8', turquoise: '#3fc0b8', sky_blue: '#8cc4ee', light_blue: '#a9d3f2', blue: '#3f6fd0',
  royal_blue: '#2f4fb8', navy: '#2c3760', indigo: '#3a3a8c', purple: '#7a4ab0', violet: '#8a5cd0', lavender: '#b9a4e4',
  lilac: '#c8a8e0', magenta: '#c83a9a', plum: '#6a2a5a', blonde: '#f1dc9c', blond: '#f1dc9c', platinum: '#ece6d4',
  ginger: '#c8642c', denim: '#3b4a6b', dark_brown: '#3d2b28', light_brown: '#a07a54', dark_blue: '#24306a', dark_green: '#254a34',
  dark_red: '#7a1c24', light_pink: '#f8c8d8', light_green: '#b4e0a4', light_gray: '#cfd2d8', dark_gray: '#4a4c54', hazel: '#8a6a3a',
};

export const canon = v => String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9#]+/g, '_').replace(/^_|_$/g, '');

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Nearest of the allowed values, or null. */
export function nearest(value, allowed) {
  const v = canon(value);
  if (!v) return null;
  if (allowed.includes(v)) return v;
  // "dark navy blue" -> the longest known name it contains; "vneck" -> the shortest name containing it.
  // On a tie the earlier word wins: "navy blue" is navy.
  const inside = allowed.filter(a => a.length >= 3 && v.includes(a)).sort((x, y) => y.length - x.length || v.indexOf(x) - v.indexOf(y))[0];
  if (inside) return inside;
  const around = v.length >= 3 && allowed.filter(a => a.includes(v)).sort((x, y) => x.length - y.length)[0];
  if (around) return around;
  let best = null, bestD = Infinity;
  for (const a of allowed) { const d = distance(v, a); if (d < bestD) { bestD = d; best = a; } }
  return bestD <= Math.max(1, Math.floor(v.length / 4)) ? best : null;
}

/** Loose expression word ("Embarrassed", "mad") -> a known expression, or null. */
export const resolveExpression = name => (name == null ? null : EXPRESSION_ALIASES[canon(name)] || nearest(name, Object.keys(EXPRESSIONS)));

export function normalize(raw) {
  const warnings = [];
  const warn = m => warnings.push(m);
  const src = raw && typeof raw === 'object' ? raw : {};
  if (src !== raw) warn('spec is not an object; using defaults');

  const pick = (value, allowed, fallback, what, aliases) => {
    if (value == null || value === '') return fallback;
    const hit = (aliases && aliases[canon(value)]) || nearest(value, allowed);
    if (hit == null) { warn(`${what}: unknown "${value}", using "${fallback}"`); return fallback; }
    if (hit !== canon(value)) warn(`${what}: "${value}" read as "${hit}"`);
    return hit;
  };
  const color = (value, fallback, what) => {
    if (value == null || value === '') return fallback;
    const v = String(value).trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v.slice(1).split('').map(c => c + c).join('');
    const hit = nearest(v, Object.keys(COLORS));
    if (hit && hit !== canon(v)) warn(`${what}: "${value}" read as "${hit}"`);
    if (hit) return COLORS[hit];
    warn(`${what}: unknown color "${value}", using ${fallback}`);
    return fallback;
  };
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  // ---- body
  const b = obj(src.body), body = {};
  for (const k in BODY) {
    const { range, buckets } = BODY[k], v = b[k];
    if (typeof v === 'number' && isFinite(v)) body[k] = Math.min(range[1], Math.max(range[0], v));
    else if (v == null) body[k] = 0;
    else body[k] = buckets[pick(v, Object.keys(buckets), k === 'height' || k === 'build' ? 'average' : 'medium', 'body.' + k)];
  }
  const skinName = b.skin != null && nearest(b.skin, Object.keys(SKIN));
  body.skin = skinName ? SKIN[skinName] : color(b.skin, SKIN.fair, 'body.skin');

  // ---- face
  const f = obj(src.face), e = obj(f.eyes);
  const face = { eyes: { shape: pick(e.shape, Object.keys(EYE_SHAPES), 'neutral', 'face.eyes.shape', EYE_ALIASES), color: color(e.color || f.eye_color, '#5a72d8', 'face.eyes.color') } };

  // ---- hair
  const h = obj(src.hair), hair = { color: color(h.color, '#4b3238', 'hair.color') };
  for (const k in HAIR_OPTIONS) hair[k] = pick(h[k], HAIR_OPTIONS[k], HAIR_DEFAULTS[k], 'hair.' + k, HAIR_ALIASES[k]);

  // ---- outfits
  const visible = allItems().filter(d => !d.hidden);
  const ids = visible.map(d => d.id);
  const presets = {};
  for (const d of visible) for (const p in d.presets || {}) presets[p] = { def: d, opts: d.presets[p] };

  function item(rawItem, where) {
    const r = typeof rawItem === 'string' ? { item: rawItem } : obj(rawItem);
    const name = canon(r.item || r.type || r.name);
    let def = ids.includes(name) ? getItem(name) : null, preset = {};
    if (!def && presets[name]) ({ def, opts: preset } = presets[name]);
    if (!def) {
      const hit = nearest(name, [...ids, ...Object.keys(presets)]);
      if (!hit) { warn(`${where}: unknown item "${r.item || r.type || r.name}", skipped`); return null; }
      warn(`${where}: "${name}" read as "${hit}"`);
      if (ids.includes(hit)) def = getItem(hit); else ({ def, opts: preset } = presets[hit]);
    }
    const out = { item: def.id }, o = { ...obj(r.options), ...r };
    for (const k in def.options) out[k] = pick(o[k], def.options[k], preset[k] != null ? preset[k] : def.defaults[k], `${where}.${k}`, def.aliases && def.aliases[k]);
    for (const k in def.flags) out[k] = o[k] == null ? (preset[k] != null ? preset[k] : def.defaults[k]) : (o[k] === true || /^(true|yes|1)$/i.test(String(o[k])));
    const c = typeof r.colors === 'string' ? { main: r.colors } : { ...obj(r.colors) };
    if (r.color != null && c.main == null) c.main = r.color;
    out.colors = {};
    for (const ch in def.channels) out.colors[ch] = color(c[ch], def.channels[ch], `${where}.colors.${ch}`);
    for (const ch in c) if (!(ch in def.channels)) warn(`${where}: ${def.id} has no "${ch}" color`);
    const p = typeof r.pattern === 'string' ? { type: r.pattern } : obj(r.pattern);
    const type = pick(p.type, PATTERNS, 'solid', `${where}.pattern`);
    if (type !== 'solid') out.pattern = { type, color: color(p.color, '#ffffff', `${where}.pattern.color`) };
    return out;
  }

  function outfit(list, where) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((rawItem, i) => {
      const it = item(rawItem, `${where}[${i}]`);
      if (!it) return;
      const def = getItem(it.item), mine = [def.slot, ...(def.blocks || [])];
      for (let j = out.length - 1; j >= 0; j--) {
        const d = getItem(out[j].item), theirs = [d.slot, ...(d.blocks || [])];
        if (mine.some(s => theirs.includes(s))) { warn(`${where}: ${it.item} replaces ${out[j].item}`); out.splice(j, 1); }
      }
      out.push(it);
    });
    return out;
  }

  const outfits = {};
  if (Array.isArray(src.outfits)) {
    // [{ name, items }] form, used by strict schemas
    src.outfits.forEach((o, i) => { const r = obj(o); outfits[canon(r.name) || 'outfit_' + (i + 1)] = outfit(r.items, `outfits[${i}]`); });
  } else {
    const o = obj(src.outfits);
    for (const k in o) outfits[canon(k) || 'default'] = outfit(o[k], `outfits.${k}`);
  }
  if (Array.isArray(src.outfit)) outfits.default = outfit(src.outfit, 'outfit');
  if (!Object.keys(outfits).length) outfits.default = [];
  const names = Object.keys(outfits);
  const chosen = typeof src.outfit === 'string' && names.includes(canon(src.outfit)) ? canon(src.outfit) : names.includes('default') ? 'default' : names[0];

  const spec = {
    v: 1,
    name: typeof src.name === 'string' ? src.name : '',
    summary: typeof src.summary === 'string' ? src.summary : '',
    body, face, hair, outfits,
    outfit: chosen,
    expression: pick(src.expression, Object.keys(EXPRESSIONS), 'neutral', 'expression', EXPRESSION_ALIASES),
    notes: typeof src.notes === 'string' ? src.notes : '',
  };
  return { spec, warnings };
}

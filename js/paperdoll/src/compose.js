// Normalized spec + outfit name -> ordered shape list, color channels and patterns.
// Pure data in, pure data out: no DOM. The renderer and the check tool both use it.
import { bodyShapes } from './body.js';
import { faceShapes } from './face.js';
import { hairShapes } from './assets/hair.js';
import { getItem } from './registry.js';
import { layerIndex } from './layers.js';
import './assets/index.js';

const BODY_IDS = new Set(['arm', 'leg', 'torso', 'face', 'foot', 'hairFront', 'hairBack']);

// Inside an asset, paint refs are local channel names ('main', 'main.shadow', 'trim:v').
// '@skin.shadow' reaches a body channel; '^.deep' means "the channel of the shape I clip to".
function paintRef(ref, key) {
  if (!ref || ref[0] === '#' || ref[0] === '^' || ref === 'glow' || ref === 'blush') return ref;
  return ref[0] === '@' ? ref.slice(1) : `${key}-${ref}`;
}

function localize(s, key, hasPattern) {
  const out = { ...s, item: key };
  if (s.id) out.id = `${key}_${s.id}`;
  if (s.clip && s.clip[0] !== '@') out.clip = `${key}_${s.clip}`;
  for (const f of ['fill', 'stroke']) out[f] = paintRef(s[f], key);
  if (s.line) out.line = s.line[0] === '@' ? s.line.slice(1) : `${key}-${s.line}`;
  if (s.pattern && hasPattern) out.patternKey = key;
  return out;
}

/** Items actually drawn for an outfit, including default underwear where nothing covers. */
export function wornItems(outfit) {
  const slots = new Set();
  for (const it of outfit) {
    const def = getItem(it.item);
    if (!def) continue;
    slots.add(def.slot);
    (def.blocks || []).forEach(b => slots.add(b));
  }
  const list = outfit.filter(it => getItem(it.item));
  // An apron goes over clothes or over bare skin, never over the default underwear: the `over` slot
  // suppresses it, the way outerwear is worn over a top and not under it.
  if (!slots.has('inner') && !slots.has('over')) {
    // A dress covers the chest even when a top is worn under it -- `jumper_dress` blocks only the
    // bottom -- so an empty top slot is not on its own a reason to put a bra on.
    const top = !slots.has('top') && !slots.has('dress'), bottom = !slots.has('bottom');
    if (top || bottom) list.unshift({ item: 'underwear', parts: top && bottom ? 'both' : top ? 'top' : 'bottom' });
  }
  return { list, slots };
}

export function compose(spec, outfitName) {
  const outfit = spec.outfits[outfitName] || spec.outfits[Object.keys(spec.outfits)[0]] || [];
  const channels = {
    skin: { color: spec.body.skin, kind: 'skin' },
    hair: { color: spec.hair.color, kind: 'hair' },
    eye: { color: spec.face.eyes.color, kind: 'eye' },
  };
  const patterns = {}, roles = {}, keys = [];
  let shapes = [];
  const push = list => list.forEach(s => shapes.push({ ...s, order: shapes.length }));

  push(bodyShapes());
  push(faceShapes(spec.face));
  push(hairShapes(spec.hair));

  const { list, slots } = wornItems(outfit);
  // `has(slot)` says whether a kind of garment is worn; `opt(slot, name)` says how it was worn. A few
  // items have to know: an apron is tied over the clothes, so its waist clears their ease, and a
  // loose shirt needs more clearing than a tight one.
  const ctx = {
    has: slot => slots.has(slot),
    opt: (slot, name) => {
      const it = list.find(x => getItem(x.item).slot === slot);
      return it ? (it[name] != null ? it[name] : getItem(it.item).defaults[name]) : undefined;
    },
  };
  list.forEach((it, i) => {
    const def = getItem(it.item), key = 'i' + i;
    const o = { ...def.defaults, ...it };
    keys.push({ key, item: def.id });
    for (const ch in def.channels) channels[`${key}-${ch}`] = { color: (it.colors && it.colors[ch]) || def.channels[ch], kind: 'cloth' };
    if (it.pattern && it.pattern.type && it.pattern.type !== 'solid') {
      patterns[key] = it.pattern.type;
      channels[`${key}-pat`] = { color: it.pattern.color || '#ffffff', kind: 'cloth' };
    }
    const built = def.build(o, ctx).map(s => localize(s, key, !!patterns[key]));
    for (const s of built) if (s.role === 'main') roles['@' + def.slot] = s.id;
    push(built);
  });

  // Resolve cross-item references; a shape whose target is not worn is dropped.
  const byId = Object.fromEntries(shapes.filter(s => s.id).map(s => [s.id, s]));
  shapes = shapes.filter(s => {
    if (s.clip && s.clip[0] === '@') {
      const name = s.clip.slice(1);
      s.clip = BODY_IDS.has(name) ? name : roles[s.clip];
      if (!s.clip) return false;
    }
    if (s.fill && s.fill[0] === '^') {
      const target = byId[s.clip];
      const ch = target && target.fill && target.fill.split(/[.:]/)[0];
      if (!ch) return false;
      s.fill = ch + s.fill.slice(1);
    }
    return true;
  });

  shapes.sort((a, b) => (layerIndex[a.layer] - layerIndex[b.layer]) || (a.order - b.order));
  return { shapes, channels, patterns, keys };
}

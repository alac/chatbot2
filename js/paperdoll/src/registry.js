// Catalogue of wearable items. Assets register themselves; the composer, schema and
// normalizer all read from here, so adding an asset file is the only step needed.
const items = new Map();

/**
 * def: {
 *   id, slot, label, tags[],
 *   blocks[]      other slots this item occupies (a dress blocks top and bottom)
 *   channels      { main: '#hex', ... } default colors; every channel is recolorable
 *   options       { name: [values...] } enums; first value is not special, see defaults
 *   flags         { name: false } booleans
 *   defaults      { option or flag: value }
 *   presets       { alias_item_name: { option: value } } accepted by the normalizer
 *   covers(o)     [{ target: 'torso'|'leg'|'arm', y: [y0, y1] }] body the item must hide (for checks)
 *   view          [x, y, w, h] crop used by contact sheets
 *   build(o, ctx) -> shapes[]   ctx.has(slot) tells what else is worn; ctx.opt(slot, name) how
 * }
 */
export function register(def) {
  def.options = def.options || {};
  def.flags = def.flags || {};
  def.defaults = def.defaults || {};
  for (const k in def.options) if (!(k in def.defaults)) def.defaults[k] = def.options[k][0];
  for (const k in def.flags) if (!(k in def.defaults)) def.defaults[k] = def.flags[k];
  items.set(def.id, def);
  return def;
}
export const getItem = id => items.get(id);
export const allItems = () => [...items.values()];

// Slots in use. One item per slot is worn; a new slot needs no code, only a layer to draw on.
export const SLOTS = ['inner', 'top', 'bottom', 'dress', 'over', 'outer', 'legwear', 'shoes', 'neck', 'eyewear', 'head'];

// What else to wear when previewing or checking an item of a slot, so that shapes which depend on
// other items (cast shadows, tucking) are exercised. Used by the checks, sheets and catalogue.
export const PREVIEW_CONTEXT = {
  top: [{ item: 'skirt' }], bottom: [{ item: 'top' }], dress: [], over: [{ item: 'dress' }], outer: [{ item: 'top', neckline: 'sailor' }, { item: 'skirt' }],
  legwear: [{ item: 'skirt' }], shoes: [], neck: [{ item: 'top', neckline: 'sailor' }], inner: [],
  eyewear: [], head: [],
};

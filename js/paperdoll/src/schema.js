// The LLM-facing contract, generated from the registry so it never drifts from the assets.
import { allItems } from './registry.js';
import { BODY, SKIN, PATTERNS } from './normalize.js';
import { HAIR_OPTIONS } from './assets/hair.js';
import { EYE_SHAPES, EXPRESSIONS } from './face.js';

const visible = tag => allItems().filter(d => !d.hidden && (!tag || (d.tags || []).includes(tag)));
const COLOR = { type: 'string', description: 'CSS color name or #rrggbb' };

/**
 * JSON Schema for a character spec.
 *   strict  every property required, no open-ended objects (for providers' structured output)
 *   tag     only include items with this tag ('school', 'modern', 'swimwear', ...)
 */
export function schema({ strict = false, tag = null } = {}) {
  const object = (properties, required) => ({
    type: 'object', properties, additionalProperties: false,
    required: strict ? Object.keys(properties) : required || [],
  });
  const body = {};
  for (const k in BODY) body[k] = { type: 'string', enum: Object.keys(BODY[k].buckets) };
  body.skin = { type: 'string', description: `one of ${Object.keys(SKIN).join(', ')}, or #rrggbb` };
  const hair = { color: COLOR };
  for (const k in HAIR_OPTIONS) hair[k] = { type: 'string', enum: HAIR_OPTIONS[k] };

  const items = visible(tag).map(d => {
    const p = { item: { type: 'string', enum: [d.id] } };
    for (const k in d.options) p[k] = { type: 'string', enum: d.options[k] };
    for (const k in d.flags) p[k] = { type: 'boolean' };
    p.colors = object(Object.fromEntries(Object.keys(d.channels).map(ch => [ch, COLOR])));
    p.pattern = object({ type: { type: 'string', enum: PATTERNS }, color: COLOR });
    return object(p, ['item']);
  });
  const outfit = { type: 'array', items: { anyOf: items } };

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Character',
    ...object({
      name: { type: 'string' },
      summary: { type: 'string', description: 'One or two sentences describing the look, written before the fields below.' },
      body: object(body),
      face: object({ eyes: object({ shape: { type: 'string', enum: Object.keys(EYE_SHAPES) }, color: COLOR }) }),
      hair: object(hair),
      outfits: strict
        ? { type: 'array', items: object({ name: { type: 'string' }, items: outfit }) }
        : { type: 'object', additionalProperties: outfit },
      expression: { type: 'string', enum: Object.keys(EXPRESSIONS) },
      notes: { type: 'string', description: 'Anything about the look that the fields cannot express.' },
    }, ['body', 'hair', 'outfits']),
  };
}

/** Compact catalogue to paste into the prompt next to (or instead of) the schema. */
export function promptGuide({ tag = null } = {}) {
  const L = [];
  L.push('Describe the character as one JSON object. Use only the values listed; pick the closest match.');
  L.push('Colors: a CSS color name or #rrggbb. Put anything you cannot express in "notes".');
  L.push('');
  L.push('summary: one or two sentences on the look (write this first)');
  L.push('body: ' + Object.keys(BODY).map(k => `${k}: ${Object.keys(BODY[k].buckets).join('|')}`).join('; ') + `; skin: ${Object.keys(SKIN).join('|')} or #rrggbb`);
  L.push(`face.eyes: shape: ${Object.keys(EYE_SHAPES).join('|')}; color`);
  L.push('hair: color; ' + Object.keys(HAIR_OPTIONS).map(k => `${k}: ${HAIR_OPTIONS[k].join('|')}`).join('; '));
  L.push(`expression: ${Object.keys(EXPRESSIONS).join('|')}`);
  L.push('');
  L.push('outfits: { "default": [items...], "<other name>": [items...] }. One item per kind; a dress replaces top and bottom (except jumper_dress, worn over a top). An apron goes over the outfit.');
  L.push(`Every item takes "colors": { <channel>: color } and optionally "pattern": { "type": ${PATTERNS.filter(p => p !== 'solid').join('|')}, "color" }.`);
  L.push('Items:');
  // An option whose values have already been printed is printed as a reference. A dress shares the
  // top's neckline, sleeves and fit vocabulary and the skirt's cuts and lengths, and spelling all of
  // that out twice cost about 350 characters of a capped guide.
  const printed = new Map();
  for (const d of visible(tag)) {
    const opts = [
      ...Object.keys(d.options).map(k => {
        const sig = d.options[k].join('|');
        if (printed.has(sig)) return `${k}: see ${printed.get(sig)}`;
        printed.set(sig, d.id);
        return `${k}: ${sig}`;
      }),
      ...Object.keys(d.flags).map(k => `${k}: true|false`),
    ];
    let line = `- ${d.id} (${d.label})`;
    if (opts.length) line += ` — ${opts.join('; ')}`;
    line += ` — colors: ${Object.keys(d.channels).join(', ')}`;
    if (d.notes) line += ` (${d.notes})`;
    L.push(line);
  }
  L.push('');
  L.push('Example:');
  L.push(JSON.stringify({
    name: 'Aoi', summary: 'Shy second-year, tall and slender, black hair, violet eyes, summer sailor uniform.',
    body: { height: 'tall', build: 'slender', bust: 'small', hips: 'medium', shoulders: 'narrow', skin: 'fair' },
    face: { eyes: { shape: 'gentle', color: 'violet' } },
    hair: { color: 'black', back: 'hip', sides: 'shoulder', bangs: 'straight' },
    outfits: { default: [
      { item: 'top', neckline: 'sailor', sleeves: 'short', colors: { main: 'white', trim: 'navy' } },
      { item: 'skirt', cut: 'pleated', length: 'mini', colors: { main: 'navy' } },
      { item: 'neck_ribbon', colors: { main: 'crimson' } },
      { item: 'socks', length: 'thigh', colors: { main: 'black' } },
      { item: 'loafers', colors: { main: 'brown' } },
    ] },
    expression: 'shy',
  }));
  return L.join('\n');
}

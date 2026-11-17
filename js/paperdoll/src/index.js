// Public API.
//
//   import { createAvatar, normalize, schema, promptGuide } from './src/index.js';
//   const avatar = createAvatar(containerEl, llmJson, { crop: 'bust' });
//   avatar.set({ expression: 'shy', outfit: 'pajamas' });
//   avatar.update(newSpec);
//   const blob = await avatar.toBlob({ crop: 'face', size: 128 });
//
// Importing './element.js' as well registers the <vn-avatar> custom element.
export { createAvatar, DEFAULT_STATE } from './render.js';
export { normalize, resolveExpression, BODY, SKIN, PATTERNS, COLORS } from './normalize.js';
export { TILES } from './render.js';
export { schema, promptGuide } from './schema.js';
export { compose } from './compose.js';
export { allItems, getItem, register, PREVIEW_CONTEXT } from './registry.js';
export { EXPRESSIONS, EYE_SHAPES } from './face.js';
export { HAIR_OPTIONS } from './assets/hair.js';
export { LAYERS } from './layers.js';

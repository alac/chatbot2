// Draw order, back to front. Arms and sleeves sit behind the body, so torso garments overlap them.
export const LAYERS = [
  'hoodBack', 'hairBack', 'outerBack',
  'arm', 'armShade', 'sleeve', 'sleeveOuter',
  'body', 'bodyShade', 'bodyLine',
  'inner',                    // underwear, swimwear
  'legwear', 'shoes',
  'topTucked', 'bottom', 'top', 'dress',
  'over',                     // aprons and anything that hangs over the outfit without being outerwear
  'neck', 'outer',
  'head', 'face', 'hairFront', 'eyewear', 'headwear', 'brows',
];
export const layerIndex = Object.fromEntries(LAYERS.map((l, i) => [l, i]));

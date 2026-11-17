# Integrating the avatar into an app

The avatar side is small. Copy `src/` into the app (25 plain ES module files, about 100 KB
unminified, no dependencies, no build step) and import from `src/index.js`. Most of the work is on
the app's side: where the avatar sits, when to ask the LLM for a character, and where to keep it.

## 1. Render a character

```js
import { createAvatar } from './avatar/src/index.js';

const avatar = createAvatar(document.querySelector('#portrait'), characterJson, { crop: 'full' });
```

The container decides the size; the SVG fills it and keeps its proportions, anchored to the bottom.
`characterJson` can be raw LLM output; it is normalized on the way in, and `avatar.warnings` lists
what was changed. `{}` renders the default character.

Or as an element:

```html
<vn-avatar crop="bust" expression="smile" style="width:240px;height:270px"></vn-avatar>
<script type="module">
  import './avatar/src/element.js';
  document.querySelector('vn-avatar').spec = characterJson;
</script>
```

## 2. Get a character from the LLM

```js
import { promptGuide, schema, normalize } from './avatar/src/index.js';

const prompt = [
  'Read the story excerpt and describe the character named below.',
  promptGuide(),                       // about 900 tokens; promptGuide({ tag: 'school' }) narrows the wardrobe
  'Character: ' + name,
  'Excerpt:\n' + storyFragment,
  'Answer with the JSON object only.',
].join('\n\n');

const text = await callModel(prompt);                 // your existing call
const { spec, warnings } = normalize(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
```

- If the backend supports structured output or grammars, pass `schema({ strict: true })`. Otherwise
  the guide plus `normalize` is enough: unknown values fall back to the nearest known one.
- `warnings` is worth logging while tuning the prompt. A warning that keeps recurring is a synonym
  to add to the alias tables or a garment worth adding.
- The model can define several named outfits in one answer, or you can ask later for one more
  outfit and add it to `spec.outfits`.

## 3. Drive it during the story

Expression and outfit are runtime state, separate from the character.

```js
avatar.set({ expression: 'embarrassed' });   // loose words are mapped: embarrassed -> shy
avatar.set({ outfit: 'swim' });              // a key of spec.outfits
avatar.update(newSpec);                      // the character itself changed
```

Have the story model, or the analysis pass that already returns JSON, emit a field such as
`{ "speaker": "Aoi", "expression": "shy", "outfit": "default" }` per message. Unknown expression
words leave the current expression in place.

## 4. Keep it

Store the normalized `spec` (plain JSON, carries `"v": 1`) with the character or the chat. It is
all that is needed to redraw. Keep the raw LLM answer too if you want to re-normalize after the
wardrobe grows.

## 5. Several characters on screen

Give every avatar the same fixed crop so relative height shows:

```js
const shared = { crop: 'stage' };
cast.forEach(c => createAvatar(row.appendChild(document.createElement('div')), c.spec, shared));
```

```css
#row { display: flex; justify-content: center; align-items: flex-end; height: 100%; }
#row > div { height: 100%; flex: 0 1 34%; margin: 0 -3%; }   /* slight overlap */
```

## 6. Icons

```js
const blob = await avatar.toBlob({ crop: 'face', size: 96 });
img.src = URL.createObjectURL(blob);         // or store the blob in IndexedDB keyed by character
```

Re-make the icon when the character changes; it is a still image.

## 7. Offline (PWA)

Add every file under `src/` to the service worker's cache list, and bump the cache version when
they change. To print the list:

```
node -e "const fs=require('fs'),w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(d+'/'+e.name):[d+'/'+e.name]);console.log(w('src').join('\n'))"
```

Bundling into one file is optional; any bundler works on `src/index.js` unchanged.

## 8. Cost and limits

- An animated avatar recomputes its outlines every frame. That measured about 1 ms of script per
  frame on a desktop; browser paint cost was not measured, and nothing was measured on a phone.
  If it is heavy, pass `{ breathing: false, blinking: false }` for avatars that are not the focus,
  and avoid the glow finish (`finish: 2`).
- Call `avatar.destroy()` when removing one; it stops the animation loop.
- Each avatar is an inline SVG of a few hundred paths. Three at once is the tested case.
- Tested in Chrome only.
- One feminine frame, one pose (arms behind the back, no hands).

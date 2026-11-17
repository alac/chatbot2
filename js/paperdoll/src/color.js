// Derives shadow / highlight / line colors from one base color per channel.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function hexToRgb(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s); l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Move hue h toward target by at most amt degrees.
function toward(h, target, amt) {
  const d = ((target - h + 540) % 360) - 180;
  return h + clamp(d, -amt, amt);
}

// kind: 'skin' | 'hair' | 'cloth' | 'eye'
function derive(hex, kind) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  let shadow, deep, hi, line;
  if (kind === 'skin') {
    const fair = clamp((l - 0.7) / 0.25);            // darker skin: less saturated shadows
    shadow = hsl(toward(h, 352, 9), s * (1 + 0.05 * fair) + 0.1 * fair, l - 0.105);
    deep = hsl(toward(h, 350, 14), clamp(s * 0.9 + 0.1, 0, 0.75), l - 0.2);
    hi = hsl(h + 4, s * 0.8, l + (1 - l) * 0.55);
    line = hsl(toward(h, 8, 12), clamp(s * 0.6, 0.25, 0.45), clamp(l * 0.33, 0.12, 0.32));
  } else if (kind !== 'eye' && s < 0.14 && l > 0.78) {      // whites: cool grey shadows
    shadow = hsl(226, 0.38, l - 0.12);
    deep = hsl(230, 0.32, l - 0.23);
    hi = '#ffffff';
    line = hsl(228, 0.2, 0.47);
  } else {
    const warm = h >= 18 && h <= 75;
    const hs = warm ? toward(h, 18, 8) : toward(h, 262, 12);
    const light = l > 0.6;
    shadow = light ? hsl(hs, s * 0.8, l * 0.84) : hsl(hs, s * 1.05 + 0.04, l * 0.68);
    deep = light ? hsl(hs, s * 0.75, l * 0.7) : hsl(hs, s * 1.05 + 0.06, l * 0.45);
    hi = hsl(h, s * (kind === 'hair' ? 0.55 : 0.9), l + (1 - l) * (kind === 'hair' ? 0.5 : 0.22));
    line = hsl(hs, clamp(s + 0.08, 0, 0.6), clamp(l * 0.4, 0.07, 0.3));
  }
  return { base: hex, shadow, deep, hi, line, mid: mix(hex, shadow, 0.5) };
}


export { derive, mix, hsl, hexToRgb, rgbToHsl };

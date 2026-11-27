// Project accents (D-313, D-435): a project's colour takes every accent role in its window. For each built-in
// theme, the preset is moved to the nearest colour (in OKLab) that passes every rule below, so the accent stays
// recognisably the project's colour yet is legible on that theme and never reads as a status.
//   - accent (and link, focus ring) on every surface: at least 4.5:1, the level for text (7:1 in High contrast,
//     as for every text rule here);
//   - accent on a row state (selection, hover, pressed, the accent's own tint over a surface): at least 3:1;
//   - on-accent ink (white, or the theme's text or deepest surface, whichever contrasts most): at least 4.5:1;
//   - text, and muted text, on the selection and on the accent's tint over every surface: at least 4.5:1
//     (the tint's opacity is lowered from the theme's own until it passes), with the accent and the status
//     glyphs (the live globe, D-436) at least 3:1 on it;
//   - at least STATUS_DISTANCE (OKLab ΔE) from the theme's danger, warning and success, so a red, amber or
//     green project never looks like an error, a warning or a confirmation.

export const STATUS_DISTANCE = 0.07;
export const MIN_TEXT = 4.5;
/** The High contrast themes' level for text (the contrast guard's minHigh, THM-13). */
export const MIN_TEXT_HIGH = 7;
export const MIN_UI = 3;
export const MARGIN = 0.1;

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

export function parseHex(h) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(h).trim());
  if (!m) throw new Error(`Not a hex colour: ${h}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
}
export const toHex = ({ r, g, b }, a = 1) => `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ""}`;

/** An alpha colour drawn over an opaque one. */
export function over(top, bottom) {
  const t = typeof top === "string" ? parseHex(top) : top;
  const b = typeof bottom === "string" ? parseHex(bottom) : bottom;
  return { r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 };
}

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function luminance(c) {
  const { r, g, b } = typeof c === "string" ? parseHex(c) : c;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function toOklab(c) {
  const { r, g, b } = typeof c === "string" ? parseHex(c) : c;
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
function fromOklab({ L, A, B }) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const e = 1e-4;
  if ([R, G, Bl].some((v) => v < -e || v > 1 + e)) return null;
  return { r: gam(Math.max(0, R)), g: gam(Math.max(0, G)), b: gam(Math.max(0, Bl)), a: 1 };
}
export const deltaE = (a, b) => { const p = toOklab(a), q = toOklab(b); return Math.hypot(p.L - q.L, p.A - q.A, p.B - q.B); };

const alphaOf = (h) => parseHex(h).a;

/**
 * The accent roles for one project colour in one theme. `t` is the theme's resolved colours (themeValues),
 * `preset` the project's starting colour for that theme's lightness (its strong shade in a light theme, its soft
 * one in a dark theme). `frost`: the frosted surface's opacity. `high`: a High contrast theme, where text needs MIN_TEXT_HIGH.
 */
export function deriveProjectAccent(preset, t, dark, high = false, frost = 1) {
  // A small margin over the minimum, so checkers that blend and round differently (axe) still pass.
  const minText = (high ? MIN_TEXT_HIGH : MIN_TEXT) + MARGIN;
  const canvas = parseHex(t["color.canvas"]);
  const frosted = (under) => over({ ...parseHex(t["color.surface"]), a: parseHex(t["color.surface"]).a * frost }, under);
  const surfaces = [
    ...["color.canvas", "color.surface", "color.surfaceRaised", "color.surfaceSunken"].map((k) => over(t[k], canvas)),
    // A frosted sheet over the note, and Spotlight's frost over its scrim, as the contrast guard measures them.
    frosted(canvas), frosted(over(t["color.scrim"], canvas)),
  ];
  const states = surfaces.flatMap((s) => [over(t["color.hover"], s), over(t["color.pressed"], s)]);
  const statuses = ["color.danger", "color.warning", "color.success"].map((k) => parseHex(t[k]));
  const inks = [parseHex("#ffffff"), parseHex(t["color.text"]), parseHex(t["color.surfaceSunken"])];
  const text = [parseHex(t["color.onSelection"]), parseHex(t["color.onSelectionMuted"])];
  const tint = (accent, start) => {
    for (let step = Math.round(start * 255); step >= 20; step--) {
      // Measured at the alpha the hex colour carries (n/255), as it's drawn.
      const a = step / 255;
      const fills = surfaces.map((s) => over({ ...accent, a }, s));
      // The status glyphs (the live globe's warning, success and danger, D-436) sit on these fills too.
      if (fills.every((f) => text.every((x) => contrast(x, f) >= minText) && [accent, ...statuses].every((g) => contrast(g, f) >= MIN_UI))) return a;
    }
    return null;
  };
  const selectionAlpha = alphaOf(t["color.selection"]);
  const mutedAlpha = alphaOf(t["color.accentMuted"]);
  const passes = (c) => {
    if (!surfaces.every((s) => contrast(c, s) >= minText)) return null;
    if (!states.every((s) => contrast(c, s) >= MIN_UI)) return null;
    if (!statuses.every((s) => deltaE(c, s) >= STATUS_DISTANCE)) return null;
    const ink = inks.map((i) => [i, contrast(i, c)]).sort((p, q) => q[1] - p[1])[0];
    if (ink[1] < minText) return null;
    const sel = tint(c, selectionAlpha);
    const muted = tint(c, mutedAlpha);
    if (sel === null || muted === null) return null;
    return { ink: ink[0], sel, muted };
  };
  const p = toOklab(preset);
  const C = Math.hypot(p.A, p.B);
  const H = Math.atan2(p.B, p.A);
  let best = null;
  for (let dh = -45; dh <= 45; dh += 3) {
    for (const cs of [1, 0.95, 0.9, 0.85, 0.8, 0.7]) {
      for (let L = 0.2; L <= 0.96; L += 0.01) {
        const h = H + (dh * Math.PI) / 180;
        const lab = { L, A: C * cs * Math.cos(h), B: C * cs * Math.sin(h) };
        // Nearest by lightness first: hue and chroma carry the colour's identity, so they cost more to change.
        const d = Math.hypot(lab.L - p.L, 2 * C * (1 - cs), 1.5 * C * cs * Math.abs((dh * Math.PI) / 180));
        if (best && d >= best.d) continue;
        const rgb = fromOklab(lab);
        if (!rgb) continue;
        const c = parseHex(toHex(rgb));
        const ok = passes(c);
        if (ok) best = { d, c, ...ok };
      }
    }
  }
  if (!best) throw new Error(`No accent passes for ${preset} in a ${dark ? "dark" : "light"} theme`);
  const accent = toHex(best.c);
  return {
    "color.accent": accent,
    "color.link": accent,
    "color.focusRing": accent,
    "color.onAccent": toHex(best.ink),
    "color.selection": toHex(best.c, best.sel),
    "color.accentMuted": toHex(best.c, best.muted),
  };
}

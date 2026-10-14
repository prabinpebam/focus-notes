/**
 * Color math for the contrast guard (THM-13): hex parsing, alpha compositing, WCAG 2.2 relative
 * luminance, and OKLCH, so a fix can change a color's lightness while keeping its hue
 * (Theme manager → Contrast guard). Pure functions with no DOM.
 */
export type Rgb = [number, number, number];
export interface Rgba { rgb: Rgb; alpha: number }
export interface Oklch { l: number; c: number; h: number }

/** Parses #rgb, #rrggbb, or #rrggbbaa. Undefined for anything else. */
export function parseColor(hex: string): Rgba | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  return { rgb, alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
/** An opaque color as #rrggbb. */
export const toHex = ([r, g, b]: Rgb): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** A translucent color painted over an opaque one. */
export const composite = (top: Rgba, under: Rgb): Rgb =>
  top.rgb.map((c, i) => c * top.alpha + under[i]! * (1 - top.alpha)) as Rgb;

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2.2 relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.2 contrast ratio between two opaque colors, from 1 to 21. */
export function ratioOf(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// OKLab (Björn Ottosson, public domain), through linear sRGB.
export function toOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Linear sRGB for an OKLCH color; may be outside 0 to 1 when it's out of gamut. */
function linearOf({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}
const inGamut = (lin: Rgb) => lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/**
 * The sRGB color for an OKLCH color. Out of gamut, chroma is reduced (hue and lightness kept)
 * until it fits, the usual CSS Color 4 approach without the perceptual refinement.
 */
export function fromOklch(color: Oklch): Rgb {
  let lin = linearOf(color);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = color.c;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearOf({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    lin = linearOf({ ...color, c: lo });
  }
  return lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb;
}

/**
 * The contrast guard (THM-13): the color pairs every theme must keep readable, and WCAG 2.2
 * contrast math. Built-in themes are checked in tests; custom themes in the theme manager (M4).
 */
export interface ContrastPair {
  fg: string;
  bg: string;
  /** Minimum ratio for standard themes. */
  min: number;
  /** Minimum ratio for the High contrast themes. */
  minHigh: number;
  /** What the pair is, in the guard's report. */
  role: "text" | "ui";
}

const pair = (fg: string, bg: string, min: number, minHigh: number, role: ContrastPair["role"] = "text"): ContrastPair => ({ fg, bg, min, minHigh, role });

/** WCAG 1.4.3 (text, 4.5:1; 7:1 for High contrast) and 1.4.11 (interface parts, 3:1). */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  pair("color.text", "color.canvas", 4.5, 7),
  pair("color.text", "color.surface", 4.5, 7),
  pair("color.text", "color.surfaceRaised", 4.5, 7),
  pair("color.text", "color.surfaceSunken", 4.5, 7),
  pair("color.textMuted", "color.canvas", 4.5, 7),
  pair("color.textMuted", "color.surfaceRaised", 4.5, 7),
  pair("color.textPlaceholder", "color.canvas", 4.5, 4.5),
  pair("color.textPlaceholder", "color.surfaceSunken", 4.5, 4.5),
  pair("color.link", "color.canvas", 4.5, 7),
  pair("color.danger", "color.canvas", 4.5, 7),
  pair("code.text", "code.background", 4.5, 7),
  pair("color.onAccent", "color.accent", 4.5, 7),
  pair("color.accent", "color.canvas", 3, 4.5, "ui"),
  pair("color.focusRing", "color.canvas", 3, 4.5, "ui"),
  pair("color.focusRing", "color.surfaceRaised", 3, 4.5, "ui"),
  pair("trigger.dot", "trigger.ring", 3, 3, "ui"),
];

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Parses #rgb, #rrggbb, or #rrggbbaa. Returns undefined for anything else, or for translucent colors. */
export function parseHex(hex: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  if (h.length === 8 && h.slice(6) !== "ff") return undefined;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque hex colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return NaN;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastFailure extends ContrastPair {
  ratio: number;
  need: number;
}

/** Checks a theme's resolved colors. `colors` maps token names to hex values. */
export function checkContrast(colors: Readonly<Record<string, string>>, high = false): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  for (const p of CONTRAST_PAIRS) {
    const fg = colors[p.fg];
    const bg = colors[p.bg];
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const need = high ? p.minHigh : p.min;
    if (!(ratio >= need)) out.push({ ...p, ratio: Math.round(ratio * 100) / 100, need });
  }
  return out;
}

/**
 * The contrast guard (THM-13, Theme manager → Contrast guard): the color pairs every theme must
 * keep readable, measured with WCAG 2.2's contrast ratio; the one-click fix, which changes only
 * the lightness of the edited color, by the smallest amount, keeping its hue; and the check a
 * custom theme gets before it's saved. Built-in themes are checked by a test, so none ships failing.
 */
import { composite, fromOklch, parseColor, ratioOf, relativeLuminance, toHex, toOklch, type Rgb } from "./color.ts";

export interface ContrastPair {
  fg: string;
  bg: string;
  /** Minimum ratio for standard themes. */
  min: number;
  /** Minimum ratio for the High contrast themes. */
  minHigh: number;
  /** Text (WCAG 1.4.3) or a non-text part that identifies a control or its state (WCAG 1.4.11). */
  role: "text" | "ui";
  /** The foreground is drawn at this opacity (a tooltip's shortcut, `opacity.muted`). */
  fgOpacity?: number;
}

const pair = (fg: string, bg: string, min: number, minHigh: number, role: ContrastPair["role"] = "text", fgOpacity?: number): ContrastPair =>
  ({ fg, bg, min, minHigh, role, ...(fgOpacity !== undefined ? { fgOpacity } : {}) });

/**
 * WCAG 1.4.3 (text, 4.5:1; 7:1 for High contrast) and 1.4.11 (interface parts, 3:1). A translucent
 * background (the selection, find highlights) is measured over the canvas, as it's drawn.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Body text on the canvas and every surface.
  pair("color.text", "color.canvas", 4.5, 7),
  pair("color.text", "color.surface", 4.5, 7),
  pair("color.text", "color.surfaceRaised", 4.5, 7),
  pair("color.text", "color.surfaceSunken", 4.5, 7),
  // Muted and placeholder text.
  pair("color.textMuted", "color.canvas", 4.5, 7),
  pair("color.textMuted", "color.surface", 4.5, 7),
  pair("color.textMuted", "color.surfaceRaised", 4.5, 7),
  pair("color.textMuted", "color.surfaceSunken", 4.5, 7),
  pair("color.textPlaceholder", "color.canvas", 4.5, 4.5),
  pair("color.textPlaceholder", "color.surfaceSunken", 4.5, 4.5),
  // Links, danger, code, and text on the accent.
  pair("color.link", "color.canvas", 4.5, 7),
  pair("color.danger", "color.canvas", 4.5, 7),
  pair("code.text", "code.background", 4.5, 7),
  pair("color.onAccent", "color.accent", 4.5, 7),
  // Tooltips are inverted (cmp.tooltip): their text, and their shortcut at opacity.muted (0.75).
  pair("color.textInverse", "color.text", 4.5, 7),
  pair("color.textInverse", "color.text", 4.5, 7, "text", 0.75),
  // Selection and find highlights against the text on them.
  pair("color.onSelection", "color.selection", 4.5, 7),
  pair("color.onSelection", "color.findMatch", 4.5, 7),
  pair("color.onSelection", "color.findMatchActive", 4.5, 7),
  // Non-text: the accent, the focus ring, and the trigger's red dot on its frosted circle.
  pair("color.accent", "color.canvas", 3, 4.5, "ui"),
  pair("color.focusRing", "color.canvas", 3, 4.5, "ui"),
  pair("color.focusRing", "color.surfaceRaised", 3, 4.5, "ui"),
  pair("trigger.dot", "trigger.ring", 3, 3, "ui"),
];

/**
 * The five key colors a person edits (Theme manager → Edit colors), and the tokens each one sets.
 * Until generated themes arrive (WP-8.2), the tokens beside each key color follow it exactly.
 */
export const KEY_COLORS = {
  canvas: ["color.canvas"],
  surface: ["color.surface", "color.surfaceRaised"],
  text: ["color.text", "color.onSelection", "code.text"],
  textMuted: ["color.textMuted"],
  accent: ["color.accent", "color.link", "color.focusRing"],
} as const satisfies Record<string, readonly string[]>;
export type KeyColor = keyof typeof KEY_COLORS;

/** Parses #rgb, #rrggbb, or #rrggbbaa. Undefined for anything else, or for translucent colors. */
export function parseHex(hex: string): Rgb | undefined {
  const c = parseColor(hex);
  return c && c.alpha === 1 ? c.rgb : undefined;
}

export const luminance = relativeLuminance;

/** WCAG contrast ratio between two opaque hex colors, from 1 to 21. NaN for anything else. */
export function contrastRatio(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  return x && y ? ratioOf(x, y) : NaN;
}

/** A pair's ratio in a theme, as drawn: a translucent background over the canvas. Undefined if a color is missing. */
export function pairRatio(colors: Readonly<Record<string, string>>, p: ContrastPair): number | undefined {
  const fg = colors[p.fg];
  const bg = colors[p.bg];
  if (!fg || !bg) return undefined;
  const canvas = parseHex(colors["color.canvas"] ?? "") ?? [255, 255, 255];
  const b = parseColor(bg);
  const f = parseColor(fg);
  if (!b || !f) return NaN;
  const under = composite(b, canvas);
  return ratioOf(composite({ ...f, alpha: f.alpha * (p.fgOpacity ?? 1) }, under), under);
}

export interface ContrastResult extends ContrastPair {
  ratio: number;
  need: number;
  pass: boolean;
}
export type ContrastFailure = ContrastResult;

/** Every pair the guard checks in a theme, with its ratio. `colors` maps token names to hex values. */
export function checkTheme(colors: Readonly<Record<string, string>>, high = false): ContrastResult[] {
  const out: ContrastResult[] = [];
  for (const p of CONTRAST_PAIRS) {
    const ratio = pairRatio(colors, p);
    if (ratio === undefined) continue;
    const need = high ? p.minHigh : p.min;
    out.push({ ...p, ratio: Math.floor(ratio * 100) / 100, need, pass: ratio >= need });
  }
  return out;
}

/** The pairs that fail. */
export const checkContrast = (colors: Readonly<Record<string, string>>, high = false): ContrastFailure[] =>
  checkTheme(colors, high).filter((r) => !r.pass);

/** Body text on the canvas, and its badge: AAA at 7:1, AA at 4.5:1. */
export function textContrast(colors: Readonly<Record<string, string>>): { ratio: number; level: "AAA" | "AA" | "low" } {
  const ratio = pairRatio(colors, CONTRAST_PAIRS[0]!) ?? NaN;
  return { ratio: Math.floor(ratio * 10) / 10, level: ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "low" };
}

/**
 * The one-click fix: the nearest color to `tokens`' current color that makes every pair they're in
 * pass, changing only its OKLCH lightness (hue kept; chroma only as far as the color must stay in
 * sRGB). The tokens all take the new color. Undefined when lightness alone can't fix it; the
 * current color when nothing fails.
 */
export function fixColor(colors: Readonly<Record<string, string>>, tokens: readonly string[], high = false): string | undefined {
  const start = parseHex(colors[tokens[0]!] ?? "");
  if (!start) return undefined;
  const pairs = CONTRAST_PAIRS.filter((p) => tokens.includes(p.fg) || tokens.includes(p.bg));
  const passes = (hex: string) => {
    const next: Record<string, string> = { ...colors };
    for (const t of tokens) next[t] = hex;
    return pairs.every((p) => {
      const r = pairRatio(next, p);
      return r === undefined || r >= (high ? p.minHigh : p.min);
    });
  };
  const current = toHex(start);
  if (passes(current)) return current;
  const lch = toOklch(start);
  // Steps of 0.001 in lightness, nearer first, darker before lighter at the same distance.
  for (let step = 1; step <= 1000; step++) {
    for (const dir of [-1, 1]) {
      const l = lch.l + (dir * step) / 1000;
      if (l < 0 || l > 1) continue;
      const hex = toHex(fromOklch({ ...lch, l }));
      if (passes(hex)) return hex;
    }
  }
  return undefined;
}

/**
 * Before a custom theme is saved (THM-13, UNSUP-THEME-02): it can be saved even when it fails,
 * after a warning that names how many pairs are hard to read. The editor (WP-8.2) asks this.
 */
export function checkBeforeSave(colors: Readonly<Record<string, string>>, high = false): { ok: boolean; failing: ContrastResult[] } {
  const failing = checkContrast(colors, high);
  return { ok: failing.length === 0, failing };
}

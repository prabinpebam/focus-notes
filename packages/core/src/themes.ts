/** Built-in themes and content fonts (Theming → Appearance and built-in themes, Fonts). */
export type ThemeKind = "light" | "dark";

export interface ThemeInfo {
  id: string;
  kind: ThemeKind;
  /** Message key for its name. */
  title: string;
  contrast: "standard" | "high";
}

const theme = (id: string, kind: ThemeKind, contrast: ThemeInfo["contrast"] = "standard"): ThemeInfo => ({ id, kind, title: `theme.${id}`, contrast });

export const BUILT_IN_THEMES: readonly ThemeInfo[] = [
  theme("paper", "light"),
  theme("sepia", "light"),
  theme("harbor-light", "light"),
  theme("forest-light", "light"),
  theme("contrast-light", "light", "high"),
  theme("ink", "dark"),
  theme("dusk", "dark"),
  theme("harbor-dark", "dark"),
  theme("forest-dark", "dark"),
  theme("contrast-dark", "dark", "high"),
];
export const DEFAULT_THEMES = { light: "paper", dark: "ink" } as const;
export const themeById = (id: string | undefined) => BUILT_IN_THEMES.find((t) => t.id === id);

/** Content fonts. "mono" (Roboto Mono) is the default (D-78); the rest are token modes. All bundled fonts are OFL (D-29). */
export const CONTENT_FONTS = ["mono", "sans", "serif", "hyperlegible", "dyslexic", "system"] as const;
export type ContentFont = (typeof CONTENT_FONTS)[number];

/** Interface scale steps (DSY-03, Settings → Appearance). Note text has its own size. */
export const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5] as const;

/**
 * Reading settings (Theme manager → Reading): separate from colors, so changing theme never resets
 * them (DD-THEME-03). Line spacing and reading width override `font.lineHeight` and
 * `layout.measure` at run time; paragraph spacing is a token mode; focus dim overrides
 * `focus.dimOpacity`, and until it's set each theme's own value applies.
 */
export const LINE_HEIGHT = { min: 1.3, max: 2, step: 0.1, default: 1.5 } as const;
export const MEASURE = { min: 50, max: 100, step: 5, default: 70 } as const;
export const FOCUS_DIM = { min: 0.15, max: 0.6, step: 0.05 } as const;
export const PARAGRAPH_SPACINGS = ["compact", "comfortable", "airy"] as const;
export type ParagraphSpacing = (typeof PARAGRAPH_SPACINGS)[number];

/** A setting's value if it's a number in range on its steps (to the nearest hundredth), else undefined. */
export function onSteps(v: unknown, r: { min: number; max: number; step: number }): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v < r.min - 1e-9 || v > r.max + 1e-9) return undefined;
  const n = Math.round((v - r.min) / r.step);
  const snapped = Math.round((r.min + n * r.step) * 100) / 100;
  return Math.abs(snapped - v) < 1e-6 ? snapped : undefined;
}

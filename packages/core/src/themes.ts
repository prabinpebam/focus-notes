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

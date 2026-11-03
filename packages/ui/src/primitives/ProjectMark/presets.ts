/** The preset accents and logos a project can choose (D-313). Plain data: contracts and tokens read it. */
export const PROJECT_ACCENTS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"] as const;
export const PROJECT_LOGOS = [
  "book", "briefcase", "beaker", "heart", "star", "leaf", "rocket", "lightbulb", "music", "camera", "people", "home",
  "airplane", "code", "brush", "trophy", "earth", "food", "building", "chat", "diamond", "flag", "sparkle", "pen",
] as const;
export type ProjectAccent = (typeof PROJECT_ACCENTS)[number];
export type ProjectLogo = (typeof PROJECT_LOGOS)[number];
/** The app's colour themes and writing fonts, which a project may choose for itself (D-316). */
export const PROJECT_THEMES = ["paper", "sepia", "harbor-light", "forest-light", "contrast-light", "ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"] as const;
export const PROJECT_FONTS = ["mono", "sans", "serif", "hyperlegible", "dyslexic", "system"] as const;
export type ProjectTheme = (typeof PROJECT_THEMES)[number];
export type ProjectFont = (typeof PROJECT_FONTS)[number];

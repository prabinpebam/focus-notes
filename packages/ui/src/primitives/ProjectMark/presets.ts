/** The preset accents and logos a project can choose (D-313). Plain data: contracts and tokens read it. */
export const PROJECT_ACCENTS = ["red", "orange", "amber", "lime", "green", "teal", "cyan", "blue", "indigo", "violet", "pink", "slate"] as const;
export const PROJECT_LOGOS = [
  "book", "briefcase", "beaker", "heart", "star", "leaf", "rocket", "lightbulb", "music", "camera", "people", "home",
  "airplane", "code", "brush", "trophy", "earth", "food", "building", "chat", "diamond", "flag", "sparkle", "pen",
] as const;
export type ProjectAccent = (typeof PROJECT_ACCENTS)[number];
export type ProjectLogo = (typeof PROJECT_LOGOS)[number];

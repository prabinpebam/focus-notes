import { defineContract } from "../../contract.ts";

const THEMES = ["paper", "sepia", "harbor-light", "forest-light", "contrast-light", "ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"] as const;
const FONTS = ["mono", "sans", "serif", "hyperlegible", "dyslexic", "system"] as const;
const sample = [{ type: "Text", props: { value: { t: "gallery.sample" } } }];

export const contract = defineContract({
  type: "AppRoot",
  tier: "layout",
  description: "The root of every app view. Applies the theme and the token modes to the document.",
  props: {
    scheme: { kind: "enum", values: ["light", "dark"], required: true },
    platform: { kind: "enum", values: ["macos", "windows", "linux", "web"], required: true },
    contentSize: { kind: "number", min: 14, max: 32 },
    focusMode: { kind: "boolean", default: false },
    theme: { kind: "enum", values: THEMES, description: "The theme to show (THM-08). Defaults to Paper or Ink." },
    contentFont: { kind: "enum", values: FONTS, default: "mono", description: "The content font (THM-03)." },
    uiScale: { kind: "number", min: 0.9, max: 1.5, description: "Interface scale (DSY-03); note text is unaffected." },
    frame: { kind: "enum", values: ["native", "rounded", "square"], default: "native", description: "The app-built window's shape on Windows and Linux (D-14): rounded with the drawn shadow, or square (maximized, snapped, full screen)." },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.appRoot.*",
  a11y: { pattern: "application root" },
  fixtures: [
    { name: "scheme light", props: { scheme: "light", platform: "windows" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "scheme dark", props: { scheme: "dark", platform: "macos" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "platform linux", props: { scheme: "light", platform: "linux" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "platform web", props: { scheme: "light", platform: "web" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    ...THEMES.map((theme) => ({ name: `theme ${theme}`, props: { scheme: theme === "paper" || theme.endsWith("-light") || theme === "sepia" ? "light" : "dark", theme, platform: "windows" }, children: sample })),
    ...FONTS.map((contentFont) => ({ name: `contentFont ${contentFont}`, props: { scheme: "light", platform: "windows", contentFont }, children: sample })),
    { name: "uiScale 1.5", props: { scheme: "light", platform: "windows", uiScale: 1.5 }, children: sample },
    { name: "frame rounded", props: { scheme: "light", platform: "windows", frame: "rounded" }, children: sample },
    { name: "frame square", props: { scheme: "dark", platform: "linux", frame: "square" }, children: sample },
  ],
});

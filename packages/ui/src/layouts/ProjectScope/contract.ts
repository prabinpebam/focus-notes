import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS, PROJECT_FONTS, PROJECT_THEMES } from "../../primitives/ProjectMark/presets.ts";

export const contract = defineContract({
  type: "ProjectScope",
  tier: "layout",
  description: "A project's look over what it holds (D-313, D-316): its accent as a modifier on the semantic accent roles, its own colour theme and writing font when it has them. In the app it's the whole window; in the gallery, several windows side by side or a live preview. It never tints a title bar, a dialog or a heading (D-324).",
  props: {
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app", description: "app: the accent around it." },
    theme: { kind: "enum", values: [...PROJECT_THEMES, "app"], default: "app", description: "The project's colour theme (D-316); app: Follow app, the app's theme and its light and dark switching." },
    font: { kind: "enum", values: [...PROJECT_FONTS, "app"], default: "app", description: "The project's writing font (D-316); app: the app's." },
    part: { kind: "enum", values: ["window", "plain"], default: "plain", description: "window: the canvas behind it with the project's subtle colour outline, clipped to the window's shape. plain: only the scope. There's no tinted band: windows, dialogs and modals never get a coloured title bar or project tint (D-324)." },
    grow: { kind: "boolean", default: false },
    contentSize: { kind: "number", min: 14, max: 32, description: "A subtree's reading size, used by the website preview; leaves app appearance unchanged." },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.projectScope.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "local reading size", props: { contentSize: 20, font: "serif", theme: "paper" }, children: [{ type: "NoteContent", props: { blocks: { get: "vm.gallery.noteBlocks" } } }] },
    ...(["window", "plain"] as const).map((part) => ({ name: `part ${part}`, props: { part, accent: "teal" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    ...[...PROJECT_ACCENTS, "app"].map((accent) => ({ name: `accent ${accent}`, props: { part: "plain", accent }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    ...[...PROJECT_THEMES, "app"].map((theme) => ({ name: `theme ${theme}`, props: { part: "window", theme, accent: "violet" }, children: [{ type: "Button", props: { label: { t: "gallery.sample" }, variant: "primary" } }] })),
    ...[...PROJECT_FONTS, "app"].map((font) => ({ name: `font ${font}`, props: { part: "window", font }, children: [{ type: "NoteContent", props: { blocks: { get: "vm.gallery.noteBlocks" } } }] })),
  ],
});

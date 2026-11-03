import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS } from "../../primitives/ProjectMark/presets.ts";

export const contract = defineContract({
  type: "ProjectScope",
  tier: "layout",
  description: "A project's look over what it holds (D-313): its accent as a modifier on the semantic accent roles, and its own Appearance when it has one. In the app it's the whole window; in the gallery, several windows side by side. The band part is the tinted title band and the Files heading.",
  props: {
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app", description: "app: the accent around it." },
    appearance: { kind: "enum", values: ["follow", "light", "dark"], default: "follow", description: "The project's Appearance (D-313): Follow app, or always Light or Dark, without touching the reading theme otherwise." },
    part: { kind: "enum", values: ["window", "band", "plain"], default: "plain", description: "window: the canvas behind it, clipped to the window's shape. band: the accent's tint (the title band, the Files heading). plain: only the accent." },
    grow: { kind: "boolean", default: false },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.projectScope.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...(["window", "band", "plain"] as const).map((part) => ({ name: `part ${part}`, props: { part, accent: "teal" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    ...[...PROJECT_ACCENTS, "app"].map((accent) => ({ name: `accent ${accent}`, props: { part: "band", accent }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    ...(["follow", "light", "dark"] as const).map((appearance) => ({ name: `appearance ${appearance}`, props: { part: "window", appearance, accent: "violet" }, children: [{ type: "Button", props: { label: { t: "gallery.sample" }, variant: "primary" } }] })),
  ],
});

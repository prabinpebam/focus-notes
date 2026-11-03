import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "ProjectPill",
  tier: "primitive",
  description: "Which project a window belongs to, at the end of its status row (D-317): the project's logo and name on a soft fill of its accent. Pressing it opens Settings → Project. The name truncates with an ellipsis; the text keeps the text colour so it always passes contrast.",
  props: {
    name: { kind: "message", required: true, description: "The project's name: the person's own words." },
    logo: { kind: "enum", values: [...PROJECT_LOGOS, "upload", "none"], default: "none" },
    src: { kind: "text", description: "An uploaded logo's sanitized SVG data URL." },
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app" },
    label: { kind: "message", description: "Its accessible name when it can be pressed (Project settings for Book)." },
  },
  events: { press: {} },
  slots: {},
  states: ["rest"],
  tokens: "cmp.projectPill.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...PROJECT_LOGOS.map((logo, i) => ({ name: `logo ${logo}`, props: { name: { t: "gallery.sample" }, accent: PROJECT_ACCENTS[i % PROJECT_ACCENTS.length]!, logo } })),
    { name: "accent app, no logo", props: { name: { t: "gallery.long" }, accent: "app", logo: "none" } },
    { name: "uploaded logo", props: { name: { t: "gallery.sample" }, accent: "pink", logo: "upload", src: { get: "vm.gallery.logoSrc" } } },
  ],
});

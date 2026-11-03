import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "ProjectPill",
  tier: "primitive",
  description: "Which project a window belongs to, at the end of its status row (D-317): the project's logo and name on a soft fill of its accent. Pressing it opens Settings → Project. Outside any project (D-333) it shows a local drive icon and the folder location on a neutral fill in Backed up's place, and pressing it shows the file in File Explorer or Finder. The name truncates with an ellipsis; the text keeps the text colour so it always passes contrast.",
  props: {
    name: { kind: "message", required: true, description: "The project's name: the person's own words." },
    logo: { kind: "enum", values: [...PROJECT_LOGOS, "upload", "none"], default: "none" },
    src: { kind: "text", description: "An uploaded logo's sanitized SVG data URL." },
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app" },
    icon: { kind: "enum", values: ["hardDrive"], description: "Outside any project (Local notes, a file on its own): this icon instead of a logo, on a neutral fill (D-333)." },
    path: { kind: "boolean", default: false, description: "The name is a folder path: ellipsized in the middle at the pill's max width, keeping its start and the containing folder; the full path is its tooltip (D-333)." },
    label: { kind: "message", description: "Its accessible name when it can be pressed (Project settings for Book; Show in File Explorer: C:\\…)." },
  },
  events: { press: {} },
  slots: {},
  states: ["rest"],
  tokens: "cmp.projectPill.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...PROJECT_LOGOS.map((logo, i) => ({ name: `logo ${logo}`, props: { name: { t: "gallery.sample" }, accent: PROJECT_ACCENTS[i % PROJECT_ACCENTS.length]!, logo } })),
    { name: "accent app, no logo", props: { name: { t: "gallery.long" }, accent: "app", logo: "none" } },
    { name: "local drive, long path", props: { name: { get: "vm.gallery.localPath" }, icon: "hardDrive", path: true } },
    { name: "uploaded logo", props: { name: { t: "gallery.sample" }, accent: "pink", logo: "upload", src: { get: "vm.gallery.logoSrc" } } },
  ],
});

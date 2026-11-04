import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "OpenItem",
  tier: "primitive",
  description: "One thing to open in Open (owner, 4 November): a project as a card washed in its accent with its logo large and its name on the title step of the type ramp, or a recent file as a quiet row with its file type's icon. The whole item is the button that opens it; no Open buttons. A project's folder shows on one line, ellipsized in the middle with the full path as its tooltip, and pressing it shows the folder in File Explorer or Finder. Pin shows as an icon at the top right on hover or focus, and stays while pinned.",
  props: {
    kind: { kind: "enum", values: ["project", "file"], default: "file" },
    title: { kind: "message", required: true, description: "The project's or file's name: the person's own words." },
    detail: { kind: "message", description: "A file: its project and folder." },
    path: { kind: "text", description: "A project: its folder's full path." },
    pathLabel: { kind: "message", description: "The path's action: Show in File Explorer, or Show in Finder." },
    logo: { kind: "enum", values: [...PROJECT_LOGOS, "upload", "none"], default: "none" },
    src: { kind: "text", description: "An uploaded logo's sanitized SVG data URL." },
    initials: { kind: "text" },
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app" },
    icon: { kind: "icon", description: "A file's type icon." },
    pinned: { kind: "boolean", default: false },
    pinLabel: { kind: "message", description: "Pin's accessible name: Pin, with the item's name." },
    unpinLabel: { kind: "message", description: "Pin's accessible name while pinned: Unpin, with the item's name." },
    label: { kind: "message", description: "The open action's accessible name, when the title alone doesn't say it." },
  },
  events: { press: {}, pin: {}, reveal: {} },
  slots: {},
  states: ["rest", "selected"],
  tokens: "cmp.openItem.*",
  a11y: { pattern: "button", name: "title" },
  fixtures: [
    { name: "project", props: { kind: "project", title: { t: "gallery.sample" }, path: { get: "vm.gallery.localPath" }, pathLabel: { t: "gallery.action" }, logo: "book", accent: "teal", pinLabel: { t: "gallery.action" } } },
    { name: "project pinned", covers: ["selected"], props: { kind: "project", title: { t: "gallery.sample" }, path: { get: "vm.gallery.localPath" }, logo: "rocket", accent: "pink", pinned: true, pinLabel: { t: "gallery.action" } } },
    { name: "project uploaded logo", props: { kind: "project", title: { t: "gallery.long" }, path: { get: "vm.gallery.localPath" }, logo: "upload", src: { get: "vm.gallery.logoSrc" }, accent: "indigo", pinLabel: { t: "gallery.action" } } },
    ...PROJECT_LOGOS.map((logo, i) => ({ name: `logo ${logo}`, props: { kind: "project", title: { t: "gallery.sample" }, path: { get: "vm.gallery.localPath" }, logo, accent: PROJECT_ACCENTS[i % PROJECT_ACCENTS.length]! } })),
    { name: "initials, app accent", props: { kind: "project", title: { t: "gallery.sample" }, initials: { get: "vm.gallery.initials" }, logo: "none", accent: "app" } },
    { name: "file", props: { kind: "file", title: { t: "gallery.sample" }, detail: { t: "gallery.sample" }, icon: "documentText", pinLabel: { t: "gallery.action" } } },
    { name: "file pinned", covers: ["selected"], props: { kind: "file", title: { t: "gallery.long" }, detail: { t: "gallery.long" }, icon: "documentText", pinned: true, pinLabel: { t: "gallery.action" } } },
  ],
});

import { defineContract } from "../../contract.ts";
import { PROJECT_ACCENTS, PROJECT_LOGOS } from "./presets.ts";

export const contract = defineContract({
  type: "ProjectMark",
  tier: "primitive",
  description: "A project's identity (D-313): a preset logo or an uploaded one on its accent's tinted plate, or the project's first letter. Shown in the title band, the Files heading, Projects and the logo picker; as a watermark it sits faint on the canvas, outside the text. Decorative unless it has a label: the project's name beside it says who it is.",
  props: {
    logo: { kind: "enum", values: [...PROJECT_LOGOS, "upload", "none"], default: "none", description: "A preset logo (licensed Fluent geometry), an uploaded one (src), or none: the initials show." },
    src: { kind: "text", description: "An uploaded logo: only a data URL of the sanitized SVG the shell made (data:image/svg+xml…), never an address. Drawn as an image, so nothing in it runs." },
    initials: { kind: "text", description: "Shown when there's no logo: the project name's first letter." },
    accent: { kind: "enum", values: [...PROJECT_ACCENTS, "app"], default: "app", description: "The project's accent preset; app: the accent around it (inside a ProjectScope, the project's)." },
    plate: { kind: "enum", values: ["tint", "neutral", "solid", "bare"], default: "tint", description: "tint: the accent's tinted plate, the glyph in the accent. neutral: a raised plate, for an uploaded logo in its own colours. solid: the accent itself, a colour swatch. bare: no plate (inside a ProjectPill)." },
    size: { kind: "enum", values: ["inline", "s", "m", "l", "xl", "watermark"], default: "m", description: "inline: the box is the glyph, no room around it (in a ProjectPill). watermark: large and at opacity.watermark, hidden in more contrast, forced colours and reduced transparency." },
    selected: { kind: "boolean", default: false, description: "The chosen preset in the logo picker: a full outline, never a one-sided stripe." },
    value: { kind: "text", bindable: true, description: "The bound choice for a persisted picker; overrides selected when choice is provided." },
    choice: { kind: "text", description: "The value this mark chooses." },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"], description: "The selected compact mark uses its own border; recovery lives in the picker row." },
    label: { kind: "message" },
  },
  events: { press: {}, change: { binds: "value", payload: { value: "text" } } },
  slots: {},
  states: ["rest", "selected", "pending", "confirmed", "failed"],
  tokens: "cmp.projectMark.*",
  a11y: { pattern: "img", name: "label" },
  fixtures: [
    ...["rest", "pending", "confirmed", "failed"].map((commit) => ({ name: `commit ${commit}`, covers: [commit], props: { logo: "book", accent: "teal", label: { t: "gallery.sample" }, value: { get: "vm.gallery.query" }, choice: { get: "vm.gallery.query" }, commit } })),
    ...["inline", "s", "m", "l", "xl"].map((size) => ({ name: `size ${size}`, props: { size, logo: "book", accent: "teal" } })),
    { name: "initials", props: { initials: { get: "vm.gallery.initials" }, accent: "indigo", size: "l" } },
    { name: "upload on a plate", props: { logo: "upload", plate: "neutral", size: "l", src: { get: "vm.gallery.logoSrc" } } },
    { name: "selected", props: { logo: "rocket", accent: "pink", size: "l", selected: true }, covers: ["selected"] },
    { name: "choice", props: { logo: "star", accent: "amber", size: "l", label: { t: "gallery.sample" } } },
    { name: "watermark", props: { logo: "leaf", accent: "green", size: "watermark" } },
    ...PROJECT_LOGOS.map((logo, i) => ({ name: `logo ${logo}`, props: { logo, accent: PROJECT_ACCENTS[i % PROJECT_ACCENTS.length]!, size: "m", label: { t: "gallery.sample" } } })),
    ...(["tint", "neutral", "solid", "bare"] as const).map((plate) => ({ name: `plate ${plate}`, props: { logo: "home", plate, size: "m" } })),
    { name: "accent app", props: { logo: "chat", accent: "app", size: "m" } },
  ],
});

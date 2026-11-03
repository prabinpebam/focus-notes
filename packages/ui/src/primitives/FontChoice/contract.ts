import { defineContract } from "../../contract.ts";
import { PROJECT_FONTS } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "FontChoice",
  tier: "primitive",
  description: "One writing font to choose, drawn in that font (D-316): a large Aa and its name, a toggle pressed when chosen. Used in Settings → Project and the theme manager's fonts; not for interface fonts.",
  props: {
    font: { kind: "enum", values: [...PROJECT_FONTS], required: true },
    label: { kind: "message", required: true, description: "The font's name, shown under the sample and its accessible name." },
    selected: { kind: "boolean", default: false },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "selected"],
  tokens: "cmp.fontChoice.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...PROJECT_FONTS.map((font) => ({ name: `font ${font}`, props: { font, label: { t: "gallery.sample" } } })),
    { name: "selected", props: { font: "serif", label: { t: "gallery.sample" }, selected: true }, covers: ["selected"] },
  ],
});

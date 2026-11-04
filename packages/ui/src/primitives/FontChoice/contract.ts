import { defineContract } from "../../contract.ts";
import { PROJECT_FONTS } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "FontChoice",
  tier: "primitive",
  description: "One writing font to choose, drawn in that font (D-316): a large Aa and its name in a cell of fixed size, a toggle pressed when chosen; pointing at it previews it. Used in Settings → Project and the theme manager's fonts; not for interface fonts.",
  props: {
    font: { kind: "enum", values: [...PROJECT_FONTS], required: true },
    label: { kind: "message", required: true, description: "The font's name, shown under the sample and its accessible name." },
    selected: { kind: "boolean", default: false },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"], description: "Every tile receives its group's commit state; the chosen tile shows the mark, and the whole group stays focusable but locked while pending. Failed recovery belongs under the group." },
  },
  events: { press: {}, preview: {} },
  slots: {},
  states: ["rest", "selected", "pending", "confirmed", "failed"],
  tokens: "cmp.fontChoice.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...["rest", "pending", "confirmed", "failed"].map((commit) => ({ name: `commit ${commit}`, covers: [commit], props: { font: "serif", label: { t: "gallery.sample" }, selected: true, commit } })),
    ...PROJECT_FONTS.map((font) => ({ name: `font ${font}`, props: { font, label: { t: "gallery.sample" } } })),
    { name: "selected", props: { font: "serif", label: { t: "gallery.sample" }, selected: true }, covers: ["selected"] },
  ],
});

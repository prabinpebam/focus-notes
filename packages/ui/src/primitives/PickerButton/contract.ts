import { defineContract } from "../../contract.ts";
import { PROJECT_FONTS, PROJECT_THEMES } from "../ProjectMark/presets.ts";

export const contract = defineContract({
  type: "PickerButton",
  tier: "primitive",
  description: "A compact button that shows only a setting's current value and opens its choices in a popover (D-316, owner 3 November): a font's name drawn in that font, or a theme's name beside a small swatch of it, then a chevron. Use it as a PopoverPanel's trigger.",
  props: {
    label: { kind: "message", required: true, description: "What it sets: its accessible name with the value (Font: Serif)." },
    value: { kind: "message", required: true, description: "The current value, the button's visible text." },
    font: { kind: "enum", values: [...PROJECT_FONTS, "app"], default: "app", description: "Draws the value in this writing font." },
    theme: { kind: "enum", values: [...PROJECT_THEMES, "app"], default: "app", description: "Shows a swatch of this theme before the value; app: no swatch." },
    chevron: { kind: "boolean", default: true, description: "Off for an option inside the popover's grid: a choice, not a trigger." },
    selected: { kind: "boolean", default: false },
  },
  events: { press: {}, preview: {} },
  slots: {},
  states: ["rest", "selected"],
  tokens: "cmp.pickerButton.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...[...PROJECT_FONTS, "app"].map((font) => ({ name: `font ${font}`, props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, font } })),
    { name: "option selected", props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, theme: "sepia", chevron: false, selected: true }, covers: ["selected"] },
    ...[...PROJECT_THEMES, "app"].map((theme) => ({ name: `theme ${theme}`, props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, theme } })),
  ],
});

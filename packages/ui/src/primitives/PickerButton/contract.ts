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
    variant: { kind: "enum", values: ["compact", "fontTile", "themeTile"], default: "compact", description: "fontTile, themeTile: a fixed-size tile (pickerTileWidth × pickerTileHeight) whatever the value, its label small on top with a chevron, the value drawn (an Aa in the font, or the theme rendered small: canvas, text lines, accent) and named under it (owner, 3 November 18:48). App default draws what the app's own font or theme looks like." },
  },
  events: { press: {}, preview: {} },
  slots: {},
  states: ["rest", "selected"],
  tokens: "cmp.pickerButton.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...[...PROJECT_FONTS, "app"].map((font) => ({ name: `font ${font}`, props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, font } })),
    { name: "font tile", props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, font: "serif", variant: "fontTile" } },
    { name: "theme tile", props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, theme: "sepia", variant: "themeTile" } },
    { name: "theme tile, app default", props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, variant: "themeTile" } },
    { name: "option selected", props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, theme: "sepia", chevron: false, selected: true }, covers: ["selected"] },
    ...[...PROJECT_THEMES, "app"].map((theme) => ({ name: `theme ${theme}`, props: { label: { t: "gallery.sample" }, value: { t: "gallery.sample" }, theme } })),
  ],
});

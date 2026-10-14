import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ColorField",
  tier: "primitive",
  description: "A labelled hex color field with a swatch (Theme manager → Edit colors). The value is committed on Enter or on leaving the field, so typing never applies half a color.",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "text", description: "The color, or what was typed if it isn't one." },
    swatch: { kind: "text", description: "The color the swatch shows: #rgb or #rrggbb, anything else shows none." },
    description: { kind: "text", description: "Said with the field: the contrast it's checked against." },
    invalid: { kind: "boolean", default: false },
    error: { kind: "text", description: "Why the value isn't a color, shown instead of the description." },
  },
  events: { commit: { payload: { value: "text" } } },
  slots: {},
  states: ["rest", "focused", "invalid"],
  tokens: "cmp.colorField.*",
  a11y: { pattern: "text box", name: "label" },
  fixtures: [
    { name: "with a swatch", props: { label: { t: "colors.key.text" }, value: { get: "vm.gallery.colorHex" }, swatch: { get: "vm.gallery.colorHex" }, description: { get: "vm.gallery.query" } } },
    { name: "invalid", props: { label: { t: "colors.key.accent" }, value: { get: "vm.gallery.query" }, invalid: true, error: { get: "vm.gallery.query" } } },
  ],
});

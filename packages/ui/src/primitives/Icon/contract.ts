import { defineContract } from "../../contract.ts";
import { ICON_NAMES } from "../../icon-names.ts";

export const contract = defineContract({
  type: "Icon",
  tier: "primitive",
  description: "A system or integration brand icon. Inherited colour; decorative unless it has a label (D-263).",
  props: {
    name: { kind: "icon", required: true },
    size: { kind: "enum", values: ["s", "m", "l"], default: "m" },
    label: { kind: "message" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.icon.*",
  a11y: { pattern: "img", name: "label" },
  fixtures: [
    ...["s", "m", "l"].map((size) => ({ name: `size ${size}`, props: { name: "open", size } })),
    { name: "labelled", props: { name: "warning", label: { t: "gallery.sample" } } },
    ...ICON_NAMES.filter((name) => name.startsWith("ai")).map((name) => ({
      name: `brand ${name}`, props: { name },
    })),
  ],
});

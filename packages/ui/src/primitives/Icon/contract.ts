import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Icon",
  tier: "primitive",
  description: "A Fluent UI System icon. Decorative unless it has a label.",
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
  ],
});

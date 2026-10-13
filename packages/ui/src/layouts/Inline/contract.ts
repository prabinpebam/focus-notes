import { defineContract } from "../../contract.ts";
import { SPACE } from "../Stack/contract.ts";

export const contract = defineContract({
  type: "Inline",
  tier: "layout",
  description: "Children in a row, spaced by a space token.",
  props: {
    gap: { kind: "token", group: "space", default: "none" },
    padding: { kind: "token", group: "space", default: "none" },
    align: { kind: "enum", values: ["start", "center", "end", "stretch"], default: "center" },
    justify: { kind: "enum", values: ["start", "center", "end", "between"], default: "start" },
    wrap: { kind: "boolean", default: false },
    grow: { kind: "boolean", default: false },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "space.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...SPACE.map((gap) => ({ name: `gap ${gap}`, props: { gap }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) })),
    ...["start", "center", "end", "stretch"].map((align) => ({ name: `align ${align}`, props: { align, gap: "s" }, children: [{ type: "Button", props: { label: { t: "gallery.action" } } }] })),
    ...["start", "center", "end", "between"].map((justify) => ({ name: `justify ${justify}`, props: { justify, gap: "s" }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) })),
  ],
});

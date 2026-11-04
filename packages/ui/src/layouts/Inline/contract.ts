import { defineContract } from "../../contract.ts";
import { SPACE } from "../Stack/contract.ts";

export const contract = defineContract({
  type: "Inline",
  tier: "layout",
  description: "Children in a row, spaced by a spacing role (a relationship, never a size).",
  props: {
    gap: { kind: "token", group: "space", default: "none" },
    related: { kind: "boolean", default: false, description: "One semantic group, using space.inlineItem and wrapping by default. Independent groups use space.inlineGroup." },
    label: { kind: "message", requiredWhen: "related", description: "Names the semantic group." },
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
    { name: "related action and explanation", props: { related: true, label: { t: "ai.found.find" } }, children: [{ type: "Button", props: { label: { t: "ai.found.find" } } }, { type: "Text", props: { value: { t: "ai.found.hint" }, role: "caption" } }] },
    ...SPACE.map((gap) => ({ name: `gap ${gap}`, props: { gap }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) })),
    ...["start", "center", "end", "stretch"].map((align) => ({ name: `align ${align}`, props: { align, gap: "inlineItem" }, children: [{ type: "Button", props: { label: { t: "gallery.action" } } }] })),
    ...["start", "center", "end", "between"].map((justify) => ({ name: `justify ${justify}`, props: { justify, gap: "inlineItem" }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) })),
  ],
});

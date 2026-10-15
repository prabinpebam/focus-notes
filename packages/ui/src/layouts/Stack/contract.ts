import { defineContract } from "../../contract.ts";

export const SPACE = ["none", "xs", "s", "m", "l", "xl", "xxl", "xxxl"] as const;

export const contract = defineContract({
  type: "Stack",
  tier: "layout",
  description: "Children in a column, spaced by a space token.",
  props: {
    gap: { kind: "token", group: "space", default: "none" },
    padding: { kind: "token", group: "space", default: "none" },
    shortGap: { kind: "token", group: "space", description: "The gap in a short window (below breakpoint.short): the full-window setup tightens up (D-131)." },
    align: { kind: "enum", values: ["start", "center", "end", "stretch"], default: "stretch" },
    justify: { kind: "enum", values: ["start", "center", "end", "between"], default: "start" },
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
    ...["start", "center", "end", "between"].map((justify) => ({ name: `justify ${justify}`, props: { justify, gap: "s" }, children: [{ type: "Button", props: { label: { t: "gallery.action" } } }] })),
  ],
});

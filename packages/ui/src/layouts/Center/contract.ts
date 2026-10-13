import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Center",
  tier: "layout",
  description: "Centers content up to a maximum width, with the page gutter.",
  props: {
    maxWidth: { kind: "enum", values: ["measure", "wideContent", "popover", "dialogS", "dialogL"], default: "measure" },
    gutter: { kind: "enum", values: ["none", "regular"], default: "regular" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "layout.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...["measure", "wideContent", "popover", "dialogS", "dialogL"].map((maxWidth) => ({ name: `max width ${maxWidth}`, props: { maxWidth }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] })),
    ...["none", "regular"].map((gutter) => ({ name: `gutter ${gutter}`, props: { gutter }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] })),
  ],
});

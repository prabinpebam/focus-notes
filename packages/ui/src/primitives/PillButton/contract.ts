import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "PillButton",
  tier: "primitive",
  description: "A small, quiet text button in a pill: muted until pointed at or focused.",
  props: {
    label: { kind: "message", required: true },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"], description: "The pill's own border shows the commit state without taking label space." },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible"],
  tokens: "cmp.pillButton.*",
  a11y: { pattern: "button", name: "label" },
  uncovered: { hover: GAP.hover, pressed: GAP.pressed, focusVisible: GAP.focusVisible },
  fixtures: [
    ...["rest", "pending", "confirmed", "failed"].map((commit) => ({ name: `border ${commit}`, props: { label: { t: "gallery.action" }, commit } })),
    { name: "unlock", props: { label: { t: "account.unlock" } } },
    { name: "glyph bounds pill", props: { label: { t: "gallery.glyphs" } } },
  ],
});

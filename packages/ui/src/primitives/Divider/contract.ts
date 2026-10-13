import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Divider",
  tier: "primitive",
  description: "Separates groups in menus and toolbars.",
  props: { orientation: { kind: "enum", values: ["horizontal", "vertical"], default: "horizontal" } },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.divider.*",
  a11y: { pattern: "separator" },
  fixtures: ["horizontal", "vertical"].map((orientation) => ({ name: `orientation ${orientation}`, props: { orientation } })),
});

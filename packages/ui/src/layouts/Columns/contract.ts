import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Columns",
  tier: "layout",
  description: "Children side by side in equal columns while each has room (layout.sheetMin), one under the other when it doesn't (D-142): two short fields on one row, so a setup step fits the window.",
  props: {
    gap: { kind: "token", group: "space", default: "m" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "space.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "two", props: { gap: "m" }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) },
  ],
});

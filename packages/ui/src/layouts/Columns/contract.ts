import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Columns",
  tier: "layout",
  description: "Children side by side in equal columns while each has room (layout.sheetMin), one under the other when it doesn't (D-142): two short fields on one row, so a setup step fits the window.",
  props: {
    gap: { kind: "token", group: "space", default: "m" },
    cell: { kind: "enum", values: ["sheet", "choice"], default: "sheet", description: "sheet: each column at least a narrow sheet wide. choice: a uniform grid of equal cells three across, each as wide as a theme manager tile (the font picker in its popover, D-316, D-330)." },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "space.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "choice cells", props: { gap: "xs", cell: "choice" }, children: [1, 2, 3, 4].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) },
    { name: "two", props: { gap: "m" }, children: [1, 2].map(() => ({ type: "Button", props: { label: { t: "gallery.action" } } })) },
  ],
});

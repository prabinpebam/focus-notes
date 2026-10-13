import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Tooltip",
  tier: "primitive",
  description: "Shows a control's name and shortcut. Never holds information you can't get another way.",
  props: {
    label: { kind: "message", required: true },
    shortcut: { kind: "text" },
    placement: { kind: "enum", values: ["top", "bottom", "start", "end"], default: "bottom" },
  },
  events: {},
  slots: { default: { accepts: ["Button", "IconButton"], min: 1, max: 1 } },
  states: ["hidden", "visible"],
  tokens: "cmp.tooltip.*",
  a11y: { pattern: "tooltip", name: "label" },
  fixtures: ["top", "bottom", "start", "end"].map((placement) => ({
    name: `placement ${placement}`,
    props: { label: { t: "gallery.sample" }, placement },
    children: [{ type: "Button", props: { label: { t: "gallery.action" } } }],
  })),
});

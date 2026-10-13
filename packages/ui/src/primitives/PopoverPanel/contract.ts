import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "PopoverPanel",
  tier: "primitive",
  description: "A frosted panel anchored to its trigger. Esc and clicking outside close it.",
  props: {
    label: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
    placement: { kind: "enum", values: ["bottom", "top", "start", "end"], default: "bottom" },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { trigger: { accepts: ["Button", "IconButton", "TriggerButton"], min: 1, max: 1 }, content: { accepts: "any" } },
  states: ["closed", "open"],
  tokens: "cmp.popoverPanel.*",
  a11y: { pattern: "dialog (non-modal popover)", name: "label" },
  fixtures: ["bottom", "top", "start", "end"].map((placement) => ({
    name: `placement ${placement}`,
    props: { label: { t: "gallery.sample" }, placement, open: false },
    slots: { trigger: [{ type: "Button", props: { label: { t: "gallery.action" } } }], content: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
  })),
});

import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "PopoverPanel",
  tier: "primitive",
  description: "A frosted panel anchored to its trigger. Esc and clicking outside close it.",
  props: {
    label: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
    hoverOpen: { kind: "boolean", default: false, description: "An accessible preview card: opens on hover without moving focus, supports entering its content by keyboard, and stays open while pointed at." },
    padding: { kind: "enum", values: ["normal", "comfortable"], default: "normal", description: "The existing compact popover padding, or 16px on every side for a details card." },
    placement: { kind: "enum", values: ["bottom", "top", "top start", "start", "end"], default: "bottom" },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { trigger: { accepts: ["Button", "IconButton", "TriggerButton", "SaveState"], min: 1, max: 1 }, content: { accepts: "any" } },
  states: ["closed", "open"],
  tokens: "cmp.popoverPanel.*",
  a11y: { pattern: "dialog (non-modal popover)", name: "label" },
  fixtures: [...["bottom", "top", "top start", "start", "end"].map((placement) => ({
    name: `placement ${placement}`,
    props: { label: { t: "gallery.sample" }, placement, open: false },
    slots: { trigger: [{ type: "Button", props: { label: { t: "gallery.action" } } }], content: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
  })), ...["normal", "comfortable"].map((padding) => ({
    name: `padding ${padding}`,
    props: { label: { t: "gallery.sample" }, padding, open: false },
    slots: { trigger: [{ type: "Button", props: { label: { t: "gallery.action" } } }], content: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
  }))],
});

import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "TriggerButton",
  tier: "primitive",
  description: "The frosted circle with the red dot. The Trigger compound places it and gives it behavior.",
  props: {
    label: { kind: "message", required: true },
    shortcut: { kind: "text" },
    tone: { kind: "enum", values: ["red", "warning", "danger"], default: "red" },
    expanded: { kind: "boolean", default: false },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible"],
  tokens: "cmp.triggerButton.*",
  a11y: { pattern: "menu button", name: "label" },
  uncovered: { hover: GAP.hover, pressed: GAP.pressed, focusVisible: GAP.focusVisible },
  fixtures: ["red", "warning", "danger"].map((tone) => ({ name: `tone ${tone}`, props: { label: { t: "trigger.label" }, tone } })),
});

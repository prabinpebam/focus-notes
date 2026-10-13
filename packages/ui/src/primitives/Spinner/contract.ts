import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Spinner",
  tier: "primitive",
  description: "An indeterminate wait sign. Stands still with reduced motion.",
  props: {
    label: { kind: "message", description: "What's being waited for; omit inside a control that says it." },
    size: { kind: "enum", values: ["s", "m"], default: "m" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.spinner.*",
  a11y: { pattern: "progressbar (indeterminate)", name: "label" },
  fixtures: [
    { name: "size s", props: { size: "s", label: { t: "task.saving" } } },
    { name: "size m", props: { size: "m", label: { t: "task.saving" } } },
  ],
});

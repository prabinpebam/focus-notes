import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Trigger",
  tier: "compound",
  description: "The trigger at the top center. Opens the toolbar, and shows a save problem in its dot.",
  props: {
    label: { kind: "message", required: true },
    problemLabel: { kind: "message" },
    problem: { kind: "boolean", default: false },
    shortcut: { kind: "text" },
    expanded: { kind: "boolean", default: false },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible", "problem"],
  tokens: "none (composes TriggerButton)",
  a11y: { pattern: "menu button", name: "label" },
  fixtures: [
    { name: "rest", props: { label: { t: "trigger.label" } } },
    { name: "save problem", props: { label: { t: "trigger.label" }, problemLabel: { t: "trigger.saveProblem" }, problem: true } },
  ],
});

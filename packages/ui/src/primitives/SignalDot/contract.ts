import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SignalDot",
  tier: "primitive",
  description: "The red dot. Its tone signals a save problem on the trigger.",
  props: { tone: { kind: "enum", values: ["red", "warning", "danger"], default: "red" } },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.signalDot.*",
  a11y: { pattern: "presentation" },
  fixtures: ["red", "warning", "danger"].map((tone) => ({ name: `tone ${tone}`, props: { tone } })),
});

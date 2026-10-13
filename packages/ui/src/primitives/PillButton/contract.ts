import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "PillButton",
  tier: "primitive",
  description: "A small, quiet text button in a pill: muted until pointed at or focused.",
  props: { label: { kind: "message", required: true } },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible"],
  tokens: "cmp.pillButton.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [{ name: "unlock", props: { label: { t: "account.unlock" } } }],
});

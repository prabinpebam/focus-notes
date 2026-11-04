import { defineContract } from "../../contract.ts";

const states = ["rest", "pending", "confirmed", "failed"] as const;

export const contract = defineContract({
  type: "CommitMark",
  tier: "primitive",
  description: "Commit feedback (ui-states, F2): an inline spinner/tick/error when there is room, or a travelling border, success border and danger border on a compact control. The border inherits the control's shape and becomes dashed under reduced motion. Decorative; recovery and announcements live outside it.",
  props: {
    state: { kind: "enum", values: states, default: "rest" },
    variant: { kind: "enum", values: ["inline", "border"], default: "inline", description: "Inline when there is a free icon slot; border follows the positioned parent's radius without displacing its content." },
  },
  events: {},
  slots: {},
  states: ["rest", "pending", "confirmed", "failed"],
  tokens: "cmp.commitMark.*",
  a11y: { pattern: "decorative (aria-hidden); announced by the live region", name: "none" },
  fixtures: [
    ...states.map((state) => ({ name: `state ${state}`, covers: [state], props: { state } })),
    { name: "border overlay", props: { variant: "border", state: "pending" } },
  ],
});

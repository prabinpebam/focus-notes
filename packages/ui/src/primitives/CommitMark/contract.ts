import { defineContract } from "../../contract.ts";

const states = ["rest", "pending", "confirmed", "failed"] as const;

export const contract = defineContract({
  type: "CommitMark",
  tier: "primitive",
  description: "The commit track's trailing mark (ui-states, F2): nothing at rest, a spinner while a changed value is saved, a green tick in a circle that draws itself in once it's kept, an error icon if it failed. One fixed box, so nothing shifts. Decorative; the live region says it.",
  props: {
    state: { kind: "enum", values: states, default: "rest" },
  },
  events: {},
  slots: {},
  states: ["rest", "pending", "confirmed", "failed"],
  tokens: "cmp.commitMark.*",
  a11y: { pattern: "decorative (aria-hidden); announced by the live region", name: "none" },
  fixtures: states.map((state) => ({ name: `state ${state}`, covers: [state], props: { state } })),
});

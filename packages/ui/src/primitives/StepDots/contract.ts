import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "StepDots",
  tier: "primitive",
  description: "Where the setup is (D-142): one dot per step, the steps done filled, the current one a longer segment. Named as a whole (Step 2 of 4); the dots themselves are decorative.",
  props: {
    current: { kind: "number", min: 1, default: 1 },
    total: { kind: "number", min: 2, max: 8, default: 4 },
    label: { kind: "message", required: true, description: "What a screen reader says: Step 2 of 4." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.stepDots.*",
  a11y: { pattern: "img", name: "label" },
  fixtures: [
    { name: "first", props: { current: 1, total: 4, label: { t: "gallery.sample" } } },
    { name: "middle", props: { current: 2, total: 4, label: { t: "gallery.sample" } } },
    { name: "last", props: { current: 4, total: 4, label: { t: "gallery.sample" } } },
  ],
});

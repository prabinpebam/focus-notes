import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "StrengthMeter",
  tier: "primitive",
  description: "How strong a passphrase is, shown under its field (D-142): four segments filled and toned by strength (weak, fair, strong), and one word or short phrase beside them. A meter to assistive technology.",
  props: {
    value: { kind: "number", min: 0, max: 4, default: 0, description: "0: nothing typed; 1 to 2: too weak; 3: fair; 4: strong." },
    label: { kind: "message", required: true, description: "The meter's name: Passphrase strength." },
    valueText: { kind: "message", description: "What the strength means, shown beside the segments: Too easy to guess, Strong." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.strengthMeter.*",
  a11y: { pattern: "meter", name: "label" },
  fixtures: [0, 1, 2, 3, 4].map((value) => ({ name: `value ${value}`, props: { value, label: { t: "gallery.sample" }, valueText: { t: "gallery.sample" } } })),
});

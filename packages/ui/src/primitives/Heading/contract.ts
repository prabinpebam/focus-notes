import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Heading",
  tier: "primitive",
  description: "An interface heading for a sheet, dialog, or section.",
  props: {
    value: { kind: "message", required: true },
    level: { kind: "enum", values: ["1", "2", "3", "display"], default: "2", description: "display: the interface ramp's largest size, a full-window onboarding step's title (D-126). It is an h1." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.heading.*",
  a11y: { pattern: "heading", name: "value" },
  fixtures: ["1", "2", "3", "display"].map((level) => ({ name: `level ${level}`, props: { value: { t: "gallery.sample" }, level } })),
});

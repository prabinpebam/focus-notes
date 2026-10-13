import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Heading",
  tier: "primitive",
  description: "An interface heading for a sheet, dialog, or section.",
  props: {
    value: { kind: "message", required: true },
    level: { kind: "enum", values: ["1", "2", "3"], default: "2" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.heading.*",
  a11y: { pattern: "heading", name: "value" },
  fixtures: ["1", "2", "3"].map((level) => ({ name: `level ${level}`, props: { value: { t: "gallery.sample" }, level } })),
});

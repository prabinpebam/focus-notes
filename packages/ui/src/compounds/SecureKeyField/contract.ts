import { defineContract } from "../../contract.ts";
export const contract = defineContract({
  type: "SecureKeyField", tier: "compound", description: "One-shot secure credential entry. Never bind secrets to app state.",
  props: { label: { kind: "message", required: true }, saveLabel: { kind: "message", required: true } },
  events: { save: { payload: { key: "text" } } }, slots: {},
  states: ["empty"], tokens: "space.*", a11y: { pattern: "form", name: "label" },
  fixtures: [{ name: "empty", covers: ["empty"], props: { label: { t: "gallery.sample" }, saveLabel: { t: "gallery.action" } } }],
});

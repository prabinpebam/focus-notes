import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Field",
  tier: "layout",
  description: "Label, control, description, and error in one arrangement; the group is named by the label.",
  props: {
    label: { kind: "message", required: true },
    description: { kind: "message" },
    error: { kind: "message" },
  },
  events: {},
  slots: { default: { accepts: "any", max: 1 } },
  states: ["rest", "error"],
  tokens: "cmp.field.*",
  a11y: { pattern: "group", name: "label" },
  fixtures: [
    { name: "with description", props: { label: { t: "find.field" }, description: { t: "gallery.long" } }, children: [{ type: "SearchField", props: { label: { t: "find.field" }, clearLabel: { t: "field.clear" } } }] },
    { name: "with error", props: { label: { t: "find.field" }, error: { t: "find.invalid" } }, children: [{ type: "SearchField", props: { label: { t: "find.field" }, clearLabel: { t: "field.clear" }, invalid: true } }] },
  ],
});

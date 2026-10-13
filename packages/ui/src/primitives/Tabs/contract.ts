import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Tabs",
  tier: "primitive",
  description: "A tab list and the selected tab's panel. The view switches the panel content on the value.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "options", required: true },
    value: { kind: "text", bindable: true },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: { default: { accepts: "any" } },
  states: ["rest", "hover", "selected", "focusVisible"],
  tokens: "cmp.tabs.*",
  a11y: { pattern: "tabs", name: "label" },
  fixtures: [
    { name: "first selected", props: { label: { t: "shortcuts.layer" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});

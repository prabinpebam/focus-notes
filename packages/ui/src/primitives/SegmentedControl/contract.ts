import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SegmentedControl",
  tier: "primitive",
  description: "Two to five mutually exclusive choices drawn as segments, with a visible label.",
  props: {
    label: { kind: "message", required: true },
    options: { kind: "list", of: "options", required: true, description: "2 to 5 options from a view model." },
    value: { kind: "text", bindable: true },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: {},
  states: ["rest", "hover", "selected", "focusVisible"],
  tokens: "cmp.segmentedControl.*",
  a11y: { pattern: "radio group", name: "label" },
  fixtures: [
    { name: "first selected", props: { label: { t: "shortcuts.layer" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } } },
    { name: "last selected", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionLast" } } },
  ],
});

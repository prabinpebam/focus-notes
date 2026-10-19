import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "SegmentedControl",
  tier: "primitive",
  description: "Two to five mutually exclusive choices drawn as segments, with a visible label.",
  props: {
    label: { kind: "message", required: true },
    options: { kind: "list", of: "options", required: true, description: "2 to 5 options from a view model." },
    value: { kind: "text", bindable: true },
    orientation: { kind: "enum", values: ["horizontal", "vertical"], default: "horizontal", description: "vertical: one full-width row per choice, for choices whose labels don't fit side by side (the first run's Workspace, D-123)." },
    readOnly: { kind: "boolean", default: false, description: "Shown and focusable, but the choice can't change: while what it chose is being sent (Send feedback's Kind, D-203)." },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: {},
  states: ["rest", "hover", "selected", "focusVisible"],
  tokens: "cmp.segmentedControl.*",
  a11y: { pattern: "radio group", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    { name: "first selected", covers: ["rest", "selected"], props: { label: { t: "shortcuts.layer" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } } },
    { name: "last selected", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionLast" } } },
    { name: "read only", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, readOnly: true } },
    { name: "orientation vertical", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, orientation: "vertical" } },
  ],
});

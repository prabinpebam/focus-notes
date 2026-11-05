import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "SegmentedControl",
  tier: "primitive",
  description: "Two to five mutually exclusive choices drawn as segments, with a visible label. With actions, the same track holds a group of related actions (a toolbar of buttons; an option with an icon is icon-only, its label the accessible name and tooltip), such as Rotate left, Rotate right and Reset.",
  props: {
    label: { kind: "message", required: true },
    options: { kind: "list", of: "options", required: true, description: "2 to 5 options from a view model." },
    value: { kind: "text", bindable: true },
    orientation: { kind: "enum", values: ["horizontal", "vertical"], default: "horizontal", description: "vertical: one full-width row per choice, for choices whose labels don't fit side by side (the first run's Workspace, D-123)." },
    actions: { kind: "boolean", default: false, description: "A group of related actions, not a choice: segments are buttons (a toolbar), value is unused and label names the toolbar without being shown (owner, 3 November)." },
    iconsOnly: { kind: "boolean", default: false, description: "Native icon-only radios with accessible names and native tooltips; usable without JavaScript on public pages. Options without an icon retain their label." },
    readOnly: { kind: "boolean", default: false, description: "Shown and focusable, but the choice can't change: while what it chose is being sent (Send feedback's Kind, D-203)." },
    commit: { kind: "enum", values: ["rest", "pending", "confirmed", "failed"], description: "State on the chosen segment; only this group locks while pending." },
    error: { kind: "message" }, retryLabel: { kind: "message" }, revertLabel: { kind: "message" },
  },
  events: { change: { payload: { value: "text" }, binds: "value" }, action: { payload: { id: "text" } }, retry: {}, revert: {} },
  slots: {},
  states: ["rest", "hover", "selected", "focusVisible", "pending", "confirmed", "failed"],
  tokens: "cmp.segmentedControl.*",
  a11y: { pattern: "radio group", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    ...["rest", "pending", "confirmed", "failed"].map((commit) => ({ name: `commit ${commit}`, covers: [commit], props: { label: { t: "gallery.sample" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, commit, ...(commit === "failed" ? { error: { t: "commit.failed" }, retryLabel: { t: "commit.retry" }, revertLabel: { t: "commit.revert" } } : {}) } })),
    { name: "first selected", covers: ["rest", "selected"], props: { label: { t: "shortcuts.layer" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } } },
    { name: "last selected", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionLast" } } },
    { name: "read only", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, readOnly: true } },
    { name: "actions, icons and a word", props: { label: { t: "gallery.sample" }, options: { get: "vm.gallery.actionOptions" }, actions: true } },
    { name: "orientation vertical", props: { label: { t: "shortcuts.platform" }, options: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, orientation: "vertical" } },
  ],
});

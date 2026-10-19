import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "Tabs",
  tier: "primitive",
  description: "A tab list and the selected tab's panel. The view switches the panel content on the value.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "options", required: true },
    value: { kind: "text", bindable: true },
    orientation: { kind: "enum", values: ["horizontal", "vertical"], default: "horizontal", description: "vertical puts the list on the inline start, as Settings' categories." },
    autoFocus: { kind: "boolean", default: false, description: "The selected tab takes focus when the tabs appear: Settings opens on its categories, so the arrow keys move between them at once." },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  // footer: an action that belongs to the whole set rather than one tab, right under the list on every tab (Settings' Send feedback, D-203).
  slots: { footer: { accepts: "any" }, default: { accepts: "any" } },
  states: ["rest", "hover", "selected", "focusVisible"],
  tokens: "cmp.tabs.*",
  a11y: { pattern: "tabs", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    { name: "first selected", covers: ["rest", "selected"], props: { label: { t: "shortcuts.layer" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "orientation vertical", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionLast" }, orientation: "vertical" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "orientation vertical with footer", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, orientation: "vertical" }, slots: { footer: [{ type: "Button", props: { label: { t: "gallery.action" }, icon: "github", variant: "subtle" } }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});

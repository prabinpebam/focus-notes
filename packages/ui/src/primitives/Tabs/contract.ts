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
    segmented: { kind: "boolean", default: false, description: "Temporary options in a shared segmented track." },
    scrollPanel: { kind: "boolean", default: false, description: "Only the selected content panel scrolls. Navigation stays fixed; short or narrow containers switch to wrapping horizontal tabs." },
    contentInset: { kind: "boolean", default: true, description: "Inset the scrolling panel's content layout, not its functional scroll wrapper. False supports full-bleed children with their own immediate inset layouts." },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  // footer: an action that belongs to the whole set rather than one tab, right under the list on every tab (Settings' Send feedback, D-203).
  slots: { footer: { accepts: "any" }, default: { accepts: "any" } },
  states: ["rest", "hover", "selected", "focusVisible"],
  tokens: "cmp.tabs.*",
  a11y: { pattern: "tabs", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    { name: "full bleed scrolling panel", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, scrollPanel: true, contentInset: false }, children: [{ type: "Stack", props: { padding: "insetLg" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] }, { type: "Divider" }] },
    { name: "fixed navigation and scrolling panel", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, orientation: "vertical", scrollPanel: true }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "first selected", covers: ["rest", "selected"], props: { label: { t: "shortcuts.layer" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" } }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "orientation vertical", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionLast" }, orientation: "vertical" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "orientation vertical with footer", props: { label: { t: "settings.categories" }, items: { get: "vm.gallery.options" }, value: { get: "vm.gallery.optionFirst" }, orientation: "vertical" }, slots: { footer: [{ type: "Button", props: { label: { t: "gallery.action" }, icon: "github", variant: "subtle" } }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});

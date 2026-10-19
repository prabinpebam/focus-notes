import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "ThemeGallery",
  tier: "primitive",
  description: "The theme manager's gallery (IA-VIEW-THEME): a tile per theme with a sample of its colors. Arrow keys move in two dimensions and preview, Enter or a click chooses, and Esc stops a preview.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "themeTiles", required: true },
    value: { kind: "text", description: "The theme showing on the note: the selected tile." },
    previewing: { kind: "boolean", default: false, description: "The tile showing is a preview, so Esc goes back to the chosen theme (and doesn't close the sheet)." },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus to the selected tile." },
  },
  events: { preview: { payload: { id: "text" } }, choose: { payload: { id: "text" } }, revert: {} },
  slots: {},
  states: ["rest", "hover", "selected", "focusVisible", "previewing"],
  tokens: "cmp.themeGallery.*",
  a11y: { pattern: "listbox", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    { name: "first selected", covers: ["rest", "selected"], props: { label: { t: "theme.gallery" }, items: { get: "vm.gallery.themeTiles" }, value: { get: "vm.gallery.themeFirst" } } },
    { name: "previewing", covers: ["previewing"], props: { label: { t: "theme.gallery" }, items: { get: "vm.gallery.themeTiles" }, value: { get: "vm.gallery.themeDark" }, previewing: true } },
  ],
});

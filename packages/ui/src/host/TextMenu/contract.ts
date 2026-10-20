import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "TextMenu",
  tier: "host",
  description: "The right-click menu in text on Windows and Linux (D-204): the spell checker's suggestions, Add to dictionary, and Cut, Copy, Paste and Select all, as the shell sent them, drawn as the app's own command menu at the pointer, so it follows the theme. It flips or shifts to stay in the window and scrolls in a short one. Esc, a click outside, a scroll, the window losing focus or a resize close it, and the caret and selection go back to the text as they were. macOS shows the system's menu instead.",
  props: {
    label: { kind: "message", required: true, description: "The menu's name for screen readers." },
    sections: { kind: "list", of: "menuSections", required: true, description: "The items in groups, split where the shell's menu has separators. An unavailable item (Cut with nothing selected, No suggestions) shows as unavailable." },
    request: { kind: "number", min: 0, description: "Each new value opens the menu at x, y." },
    x: { kind: "number", description: "Where the menu opens, in page pixels." },
    y: { kind: "number" },
    open: { kind: "boolean", default: false, description: "Open from the start, at x, y (the gallery)." },
  },
  events: {
    action: { payload: { id: "text" } },
    close: {},
  },
  slots: {},
  states: ["closed", "open", "itemFocused", "itemDisabled"],
  tokens: "cmp.menuButton.*",
  a11y: { pattern: "menu (a context menu): arrow keys, Home and End, typeahead, Enter and Space, Esc", name: "label" },
  journeys: [{ spec: "apps/desktop/e2e/spelling-menu.spec.ts", covers: ["closed", "open", "itemFocused", "itemDisabled"] }],
  fixtures: [
    { name: "open at the pointer", covers: ["open", "itemDisabled"], props: { label: { t: "textMenu.label" }, sections: { get: "vm.gallery.textMenu" }, open: true, x: 48, y: 48 } },
  ],
});
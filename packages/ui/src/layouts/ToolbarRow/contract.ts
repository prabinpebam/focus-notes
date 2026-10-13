import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ToolbarRow",
  tier: "layout",
  description: "A row with the toolbar role: one tab stop, with arrow keys, Home, and End moving between its items.",
  props: {
    label: { kind: "message", required: true },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus to its first item (Alt+F10)." },
  },
  events: {},
  slots: { default: { accepts: ["IconButton", "Button", "MenuButton", "Divider"] } },
  states: ["rest"],
  tokens: "space.*",
  a11y: { pattern: "toolbar", name: "label" },
  fixtures: [{ name: "with actions", props: { label: { t: "gallery.sample" } }, children: [
    { type: "IconButton", props: { icon: "newNote", label: { t: "gallery.action" } } },
    { type: "IconButton", props: { icon: "open", label: { t: "gallery.action" } } },
    { type: "Divider", props: { orientation: "vertical" } },
    { type: "IconButton", props: { icon: "more", label: { t: "gallery.action" } } },
  ] }],
});

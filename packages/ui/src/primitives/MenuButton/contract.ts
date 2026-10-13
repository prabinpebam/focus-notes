import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "MenuButton",
  tier: "primitive",
  description: "A button that opens a menu of commands, each showing its state and shortcut: an icon, or a quiet text pill.",
  props: {
    icon: { kind: "icon", description: "For the icon variant." },
    label: { kind: "message", required: true },
    variant: { kind: "enum", values: ["icon", "pill"], default: "icon" },
    text: { kind: "text", description: "The pill variant's visible text." },
    placement: { kind: "enum", values: ["bottom end", "top start"], default: "bottom end" },
    sections: { kind: "list", of: "menuSections", required: true },
    shortcut: { kind: "text" },
  },
  events: { action: { payload: { id: "text" } } },
  slots: {},
  states: ["closed", "open", "itemFocused", "itemDisabled", "itemChecked"],
  tokens: "cmp.menuButton.*",
  a11y: { pattern: "menu button", name: "label" },
  fixtures: [
    { name: "variant icon", props: { icon: "more", label: { t: "gallery.action" }, sections: { get: "vm.gallery.menu" } } },
    { name: "variant pill", props: { variant: "pill", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, placement: "top start", sections: { get: "vm.gallery.menu" } } },
    { name: "placement top start", props: { icon: "more", label: { t: "gallery.action" }, placement: "top start", sections: { get: "vm.gallery.menu" } } },
  ],
});

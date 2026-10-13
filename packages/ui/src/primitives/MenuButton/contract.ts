import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "MenuButton",
  tier: "primitive",
  description: "A button that opens a menu of commands, each showing its state and shortcut: an icon, a quiet text pill, or text with a chevron (Turn into).",
  props: {
    icon: { kind: "icon", description: "For the icon variant." },
    label: { kind: "message", required: true },
    variant: { kind: "enum", values: ["icon", "pill", "text"], default: "icon" },
    text: { kind: "text", description: "The pill and text variants' visible text." },
    placement: { kind: "enum", values: ["bottom end", "bottom start", "top start"], default: "bottom end" },
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
    { name: "variant text, placement bottom start", props: { variant: "text", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, placement: "bottom start", sections: { get: "vm.gallery.menu" } } },
  ],
});

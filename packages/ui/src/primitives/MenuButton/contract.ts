import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "MenuButton",
  tier: "primitive",
  description: "A button that opens a menu of commands, each showing its state and shortcut: an icon, a quiet text pill, or text with a chevron (Turn into).",
  props: {
    icon: { kind: "icon", description: "For the icon variant." },
    label: { kind: "message", required: true },
    variant: { kind: "enum", values: ["icon", "pill", "text", "select"], default: "icon", description: "select: the current value and a chevron in a bordered box, as a form's field, lined up with the rows around it (D-111)." },
    text: { kind: "text", description: "The pill and text variants' visible text." },
    placement: { kind: "enum", values: ["bottom end", "bottom start", "top start"], default: "bottom end" },
    sections: { kind: "list", of: "menuSections", required: true },
    shortcut: { kind: "text" },
    bleed: { kind: "boolean", default: false, description: "The text variant at the edge of a panel's content (the Files sheet's New): its text and chevron line up with the edge (D-111)." },
  },
  events: { action: { payload: { id: "text" } } },
  slots: {},
  states: ["closed", "open", "itemFocused", "itemDisabled", "itemChecked"],
  tokens: "cmp.menuButton.*",
  a11y: { pattern: "menu button", name: "label" },
  journeys: [{ spec: "apps/desktop/e2e/m1-toolbar.spec.ts", covers: ["open", "itemFocused", "itemDisabled", "itemChecked"] }],
  fixtures: [
    { name: "variant icon", covers: ["closed"], props: { icon: "more", label: { t: "gallery.action" }, sections: { get: "vm.gallery.menu" } } },
    { name: "variant pill", covers: ["closed"], props: { variant: "pill", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, placement: "top start", sections: { get: "vm.gallery.menu" } } },
    { name: "placement top start", covers: ["closed"], props: { icon: "more", label: { t: "gallery.action" }, placement: "top start", sections: { get: "vm.gallery.menu" } } },
    { name: "variant text, placement bottom start", covers: ["closed"], props: { variant: "text", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, placement: "bottom start", sections: { get: "vm.gallery.menu" } } },
    { name: "variant select", covers: ["closed"], props: { variant: "select", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, placement: "bottom start", sections: { get: "vm.gallery.menu" } } },
    { name: "variant text, bleed", covers: ["closed"], props: { variant: "text", text: { get: "vm.gallery.query" }, label: { t: "gallery.action" }, bleed: true, sections: { get: "vm.gallery.menu" } } },
  ],
});

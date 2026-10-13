import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "MenuButton",
  tier: "primitive",
  description: "An icon button that opens a menu of commands, each showing its state and shortcut.",
  props: {
    icon: { kind: "icon", required: true },
    label: { kind: "message", required: true },
    sections: { kind: "list", of: "menuSections", required: true },
    shortcut: { kind: "text" },
  },
  events: { action: { payload: { id: "text" } } },
  slots: {},
  states: ["closed", "open", "itemFocused", "itemDisabled", "itemChecked"],
  tokens: "cmp.menuButton.*",
  a11y: { pattern: "menu button", name: "label" },
  fixtures: [{ name: "with sections", props: { icon: "more", label: { t: "gallery.action" }, sections: { get: "vm.gallery.menu" } } }],
});

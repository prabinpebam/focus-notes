import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Toolbar",
  tier: "compound",
  description: "The trigger's toolbar: at most six command actions, then ⋯ with everything else (UI-04).",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "commandItems", required: true },
    more: { kind: "list", of: "menuSections", required: true },
    moreLabel: { kind: "message", required: true },
  },
  events: { action: { payload: { id: "text" } } },
  slots: {},
  states: ["rest"],
  tokens: "none (composes ToolbarRow, IconButton, Divider, MenuButton)",
  a11y: { pattern: "toolbar", name: "label" },
  fixtures: [{ name: "default actions", props: { label: { t: "toolbar.label" }, items: { get: "vm.gallery.toolbar" }, more: { get: "vm.gallery.menu" }, moreLabel: { t: "toolbar.more" } } }],
});

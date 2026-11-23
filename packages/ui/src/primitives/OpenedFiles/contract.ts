import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "OpenedFiles",
  tier: "primitive",
  requiresId: true,
  description: "Opened files above Pinned in the Files panel (owner, 23 November; D-410): bordered tab buttons with a file icon, the name and a close × on hover or keyboard focus; one click activates; the header's ⋯ holds Close all. Not there when nothing is open.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "treeItems", required: true },
    menu: { kind: "list", of: "menuSections", description: "The header's ⋯ menu: Close all, with no confirmation (D-410)." },
    menuLabel: { kind: "message", description: "The ⋯ button's name: Opened files actions." },
    closeLabel: { kind: "message", required: true, description: "The × button's tooltip and the start of its name: Close." },
  },
  events: {
    activate: { payload: { id: "text" } },
    close: { payload: { id: "text" } },
    menuAction: { payload: { id: "text" } },
  },
  slots: {},
  states: ["rest", "current", "truncated", "hover", "pressed", "focusVisible", "menuOpen", "empty"],
  tokens: "cmp.openedFiles.*",
  a11y: { pattern: "labelled list of buttons, the active one aria-current", name: "label" },
  uncovered: { hover: GAP.hover, pressed: GAP.pressed, focusVisible: GAP.focusVisible, menuOpen: GAP.open },
  fixtures: [
    { name: "open notes, the active one, a long name", covers: ["rest", "current", "truncated"], props: { label: { t: "files.opened.heading" }, items: { get: "vm.gallery.openedFiles" }, menu: { get: "vm.gallery.openedFilesMenu" }, menuLabel: { t: "files.opened.menu" }, closeLabel: { t: "files.opened.close" } } },
    { name: "nothing open: not there", covers: ["empty"], props: { label: { t: "files.opened.heading" }, items: { get: "vm.gallery.openedFilesNone" }, closeLabel: { t: "files.opened.close" } } },
  ],
});

import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "TabSwitcher",
  tier: "primitive",
  requiresId: true,
  description: "Ctrl+Tab's list of the opened tabs (owner, 29 November): the same rows as Opened files, most recently used first, the highlighted one drawn as the active tab. The list keeps focus and moves the highlight (aria-activedescendant); a click or Enter opens a row. Shown in a centred DialogPanel.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "treeItems", required: true, description: "The opened tabs in switch order; `current` marks the highlighted one." },
    activeId: { kind: "text" },
  },
  events: { choose: { payload: { id: "text" } }, activeChange: { payload: { id: "text" } } },
  slots: {},
  states: ["rest", "active", "truncated", "siteMarked", "hover"],
  tokens: "cmp.openedFiles.*",
  a11y: { pattern: "listbox with aria-activedescendant", name: "label" },
  uncovered: { hover: GAP.hover },
  fixtures: [
    { name: "opened tabs, the second highlighted", covers: ["rest", "active", "truncated", "siteMarked"], props: { label: { t: "tabs.switcher.label" }, items: { get: "vm.gallery.openedFilesSwitch" }, activeId: { get: "vm.gallery.openedFilesSwitchActive" } } },
  ],
});

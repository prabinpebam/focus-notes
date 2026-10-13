import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Trigger",
  tier: "compound",
  description: "The trigger at the top center. Opens the toolbar under itself, and shows a save problem in its dot.",
  props: {
    label: { kind: "message", required: true },
    problemLabel: { kind: "message" },
    problem: { kind: "boolean", default: false },
    shortcut: { kind: "text" },
    open: { kind: "boolean", default: false },
    toolbarLabel: { kind: "message", required: true },
    items: { kind: "list", of: "commandItems", required: true },
    more: { kind: "list", of: "menuSections", required: true },
    moreLabel: { kind: "message", required: true },
  },
  events: { openChange: { payload: { open: "boolean" } }, action: { payload: { id: "text" } } },
  slots: {},
  states: ["rest", "hover", "pressed", "focusVisible", "open", "problem"],
  tokens: "none (composes TriggerButton, MorphPanel, Toolbar)",
  a11y: { pattern: "button that morphs into a toolbar (non-modal dialog)", name: "label" },
  fixtures: [
    { name: "rest", props: { label: { t: "trigger.label" }, toolbarLabel: { t: "toolbar.label" }, items: { get: "vm.gallery.toolbar" }, more: { get: "vm.gallery.menu" }, moreLabel: { t: "toolbar.more" } } },
    { name: "save problem", props: { label: { t: "trigger.label" }, problemLabel: { t: "trigger.saveProblem" }, problem: true, toolbarLabel: { t: "toolbar.label" }, items: { get: "vm.gallery.toolbar" }, more: { get: "vm.gallery.menu" }, moreLabel: { t: "toolbar.more" } } },
  ],
});

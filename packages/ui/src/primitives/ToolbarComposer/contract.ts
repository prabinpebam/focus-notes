import { defineContract, GAP } from "../../contract.ts";

const copy = ["catalogueLabel", "countLabel", "instructions", "pickedLabel", "placeLabel", "overLabel", "fullLabel", "addedLabel", "movedLabel", "replacedLabel", "removedLabel", "cancelledLabel"] as const;

export const contract = defineContract({
  type: "ToolbarComposer",
  tier: "primitive",
  description: "The visual toolbar customizer (IA-CMP-TOOLBAR, DD-IA-08): the real toolbar shown open, above every action that can join it, grouped by category, each the real icon button with its name. Drag to add or reorder (a marker shows where), hold over a button for motion.hold to replace it, drag one off to remove it; full, the marker is red. Keys: Space or Enter picks up, arrows choose a place, Enter drops, Esc cancels, Delete removes; each step is announced.",
  props: {
    label: { kind: "message", required: true },
    moreLabel: { kind: "message", required: true },
    items: { kind: "list", of: "commandItems", required: true },
    groups: { kind: "list", of: "menuSections", required: true },
    max: { kind: "number", min: 1, default: 6 },
    catalogueLabel: { kind: "message", required: true },
    countLabel: { kind: "message", required: true },
    instructions: { kind: "message", required: true },
    pickedLabel: { kind: "message", required: true },
    placeLabel: { kind: "message", required: true },
    overLabel: { kind: "message", required: true },
    fullLabel: { kind: "message", required: true },
    addedLabel: { kind: "message", required: true },
    movedLabel: { kind: "message", required: true },
    replacedLabel: { kind: "message", required: true },
    removedLabel: { kind: "message", required: true },
    cancelledLabel: { kind: "message", required: true },
  },
  events: { change: { payload: { ids: "text" } } },
  slots: {},
  states: ["rest", "dragging", "holding", "lifted", "full"],
  tokens: "cmp.toolbarComposer.*",
  a11y: { pattern: "two groups (the toolbar, the catalogue) of real buttons, a keyboard pick-up and drop, and a polite live region", name: "label" },
  uncovered: { dragging: GAP.drag, holding: GAP.drag, lifted: GAP.drag },
  fixtures: [
    { name: "rest", covers: ["rest"], props: { label: { t: "toolbar.label" }, moreLabel: { t: "gallery.sample" }, items: { get: "vm.gallery.toolbar" }, groups: { get: "vm.gallery.menu" }, ...Object.fromEntries(copy.map((k) => [k, { t: "gallery.sample" }])) } },
    { name: "full", covers: ["full"], props: { label: { t: "toolbar.label" }, moreLabel: { t: "gallery.sample" }, items: { get: "vm.gallery.toolbar" }, groups: { get: "vm.gallery.menu" }, max: 2, ...Object.fromEntries(copy.map((k) => [k, { t: "gallery.sample" }])) } },
  ],
});

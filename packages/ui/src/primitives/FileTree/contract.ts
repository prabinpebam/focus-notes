import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "FileTree",
  tier: "primitive",
  requiresId: true,
  description: "The Files tree: rows with levels, multiple selection, type-ahead, drag and drop onto folders, an inline name field, and each row's menu (D-162).",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "treeItems", required: true },
    focusId: { kind: "text", description: "The focused row, the tree's one tab stop." },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus into the tree." },
    windowed: { kind: "boolean", default: false, description: "Read-only reviews mount at most 200 rows; scrolling, keyboard navigation and type-ahead still cover the whole tree." },
    editValue: { kind: "text", bindable: true, description: "The text of the row being named." },
    editLabel: { kind: "text", description: "The name field's label: Title or Folder name." },
    editError: { kind: "text", description: "Why the name can't be used, under the field." },
    menu: { kind: "list", of: "menuSections", description: "The focused row's menu (D-162): opened by right-click, the row's ⋯, Shift+F10, or the Menu key." },
    menuLabel: { kind: "text", description: "The menu's name: Actions for “Ideas”." },
  },  events: {
    select: { payload: { id: "text", mode: "text" } },
    expand: { payload: { id: "text", expanded: "boolean" } },
    action: { payload: { id: "text" } },
    drop: { payload: { source: "text", target: "text" } },
    editChange: { payload: { value: "text" }, binds: "editValue" },
    editBlur: {},
    menuAction: { payload: { id: "text" } },
    pin: { payload: { id: "text", pinned: "boolean" } },
  },
  // Controls at a section row's trailing end, by its `accessory` index: each section's repository backup (D-191).
  slots: { sectionEnd: { accepts: ["PopoverPanel"] } },
  states: ["rest", "hover", "focusVisible", "selected", "current", "multiSelected", "editing", "invalid", "dropTarget", "pending", "readOnly", "menuOpen", "pinAvailable", "pinPending", "pinConfirmed", "pinFailed"],
  tokens: "cmp.fileTree.*",
  a11y: { pattern: "tree (multi-selectable) with type-ahead", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible, dropTarget: GAP.drag, menuOpen: GAP.open },
  fixtures: [
    { name: "same-slot pin action and acknowledged outcomes", covers: ["pinAvailable", "pinPending", "pinConfirmed", "pinFailed"], props: { label: { t: "files.tree" }, items: { get: "vm.gallery.treePins" } } },
    { name: "sections, folders, the current note, and a multiple selection", covers: ["rest", "selected", "current", "multiSelected", "pending", "readOnly"], props: { label: { t: "files.tree" }, items: { get: "vm.gallery.tree" }, focusId: { get: "vm.gallery.treeFocus" } } },
    { name: "naming a folder, with an error", covers: ["editing", "invalid"], props: { label: { t: "files.tree" }, items: { get: "vm.gallery.treeEditing" }, editValue: { get: "vm.gallery.query" }, editLabel: { get: "vm.gallery.treeEditLabel" }, editError: { get: "vm.gallery.treeEditError" } } },
  ],
});

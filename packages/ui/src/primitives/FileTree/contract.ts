import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "FileTree",
  tier: "primitive",
  description: "The Files tree: rows with levels, multiple selection, type-ahead, drag and drop onto folders, and an inline name field.",
  props: {
    label: { kind: "message", required: true },
    items: { kind: "list", of: "treeItems", required: true },
    focusId: { kind: "text", description: "The focused row, the tree's one tab stop." },
    focusRequest: { kind: "number", min: 0, description: "Each new value moves focus into the tree." },
    editValue: { kind: "text", bindable: true, description: "The text of the row being named." },
    editLabel: { kind: "text", description: "The name field's label: Title or Folder name." },
    editError: { kind: "text", description: "Why the name can't be used, under the field." },
  },
  events: {
    select: { payload: { id: "text", mode: "text" } },
    expand: { payload: { id: "text", expanded: "boolean" } },
    action: { payload: { id: "text" } },
    drop: { payload: { source: "text", target: "text" } },
    editChange: { payload: { value: "text" }, binds: "editValue" },
    editBlur: {},
  },
  slots: {},
  states: ["rest", "hover", "focusVisible", "selected", "current", "multiSelected", "editing", "invalid", "dropTarget", "pending", "readOnly"],
  tokens: "cmp.fileTree.*",
  a11y: { pattern: "tree (multi-selectable) with type-ahead", name: "label" },
  fixtures: [
    { name: "sections, folders, the current note, and a multiple selection", props: { label: { t: "files.tree" }, items: { get: "vm.gallery.tree" }, focusId: { get: "vm.gallery.treeFocus" } } },
    { name: "naming a folder, with an error", props: { label: { t: "files.tree" }, items: { get: "vm.gallery.treeEditing" }, editValue: { get: "vm.gallery.query" }, editLabel: { get: "vm.gallery.treeEditLabel" }, editError: { get: "vm.gallery.treeEditError" } } },
  ],
});

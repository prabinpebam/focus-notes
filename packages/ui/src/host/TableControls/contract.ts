import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "TableControls",
  tier: "host",
  description: "Loop-style table controls drawn over the note from the editor's geometry: row and column handles with menus and drag to reorder, the + insertion point, New row and New column bars, the column tint, the range outline, and the cell menu.",
  props: {
    columnLabel: { kind: "message", required: true, description: "The column handle's name: \"Column 2, Owner, options\"." },
    rowLabel: { kind: "message", required: true, description: "The row handle's name: \"Row 3 options\"." },
    tableLabel: { kind: "message", required: true },
    insertLabel: { kind: "message", description: "The insertion point's name: \"Insert row between rows 2 and 3\"." },
    newRowLabel: { kind: "message", required: true },
    newColumnLabel: { kind: "message", required: true },
    cellMenuLabel: { kind: "message", required: true },
    columnMenu: { kind: "list", of: "menuSections", required: true },
    rowMenu: { kind: "list", of: "menuSections", required: true },
    tableMenu: { kind: "list", of: "menuSections", required: true },
    cellMenu: { kind: "list", of: "menuSections", required: true, description: "The context menu of the selected cells." },
    menuRequest: { kind: "number", min: 0, description: "Each new value opens the context menu at the active cell." },
    layout: { kind: "enum", values: ["fit", "bleed"], default: "fit", description: "Fit to column or Bleed to edge (D-182): how a column resize shares out the width." },
  },
  events: {
    action: { payload: { id: "text", table: "number", row: "number", col: "number", index: "number", from: "number", to: "number", width: "number", next: "number" } },
    close: {},
  },
  slots: {},
  states: ["hidden", "hover", "handleHover", "menuOpen", "insertPoint", "dragging", "resizing", "rangeSelected"],
  tokens: "cmp.tableControls.*",
  a11y: { pattern: "buttons with menus (menu button)", name: "columnLabel" },
  fixtures: [],
});

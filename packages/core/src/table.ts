/**
 * Table controls (IA-CMP-TABLE, WP-1.5): the editor reports which table, row, and column the pointer
 * or caret is at; these commands and vm.table name the handles and build their menus, send actions
 * back to the editor, announce structural changes, and put whole tables on the clipboard.
 */
import type { CommandRegistry } from "./commands.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import type { MessageCatalog } from "./messages.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { AppState } from "./app.ts";
import type { Store } from "./store.ts";

export type TableSelectionKind = "none" | "cells" | "row" | "column" | "table";
export interface TableUiState {
  /** The pointer or caret is at a table. */
  inTable: boolean;
  /** The table's position in the note, passed back with every action. */
  table: number;
  /** The row and column the handles are for (counting from 0; row 0 is the header). */
  row: number;
  col: number;
  rows: number;
  cols: number;
  /** The column's header text, for its handle's name. */
  header: string;
  /** The column's alignment, checked in the Align submenu ("" when it has none). */
  align: "" | "left" | "center" | "right";
  /** The boundary the + insertion point is at, if one shows: "row" or "column", and its index. */
  insertAxis: "" | "row" | "column";
  insertIndex: number;
  selection: TableSelectionKind;
  /** Bumped to open the context menu of the selected cells (right-click, Shift+F10, the Menu key). */
  menuRequest: number;
}
export const TABLE_CLOSED: TableUiState = { inTable: false, table: -1, row: 0, col: 0, rows: 0, cols: 0, header: "", align: "", insertAxis: "", insertIndex: 0, selection: "none", menuRequest: 0 };

/**
 * Table commands without keys, for the handles' menus, the context menu, and Spotlight (`> Insert
 * column right`). The keyed ones (Tab, Mod+Enter) are editor commands in the keymap.
 */
export const TABLE_MENU_COMMANDS = [
  "table.insertRowAbove", "table.insertRowBelow", "table.insertColumnLeft", "table.insertColumnRight",
  "table.insertRowAt", "table.insertColumnAt", "table.appendRow", "table.appendColumn",
  "table.moveColumnLeft", "table.moveColumnRight", "table.moveRow", "table.moveColumn",
  "table.duplicateRow", "table.clearRow", "table.clearColumn", "table.clearCells", "table.deleteColumn", "table.deleteSelection",
  "table.alignLeft", "table.alignCenter", "table.alignRight", "table.sortAscending", "table.sortDescending",
  "table.selectRow", "table.selectColumn", "table.selectTable",
  "table.copy", "table.cut", "table.copyMarkdown", "table.copyTsv", "table.duplicateTable", "table.deleteTable",
] as const;
/** Every table action the controls may send: the menu commands and the keyed ones they also offer. */
const ACTIONS = new Set<string>([...TABLE_MENU_COMMANDS, "table.moveRowUp", "table.moveRowDown", "table.deleteRow"]);

export interface TableDeps {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
  editorAction: (id: string, args?: Record<string, unknown>) => void;
  toast: (message: string) => void;
  announce: (key: string, args?: Record<string, unknown>) => void;
}

const int = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) ? v : fallback);

export function registerTables({ store, commands, viewModels, catalog, bridge, editorAction, toast, announce }: TableDeps): void {
  const get = () => store.state.ui.format.table;
  const set = (patch: Partial<TableUiState>) => store.update((s) => ({ ...s, ui: { ...s.ui, format: { ...s.ui.format, table: { ...s.ui.format.table, ...patch } } } }));
  const writable = (s: AppState) => s.note.status === "ready";

  commands.register<Record<string, unknown>>({
    id: "table.setState", title: "command.table.setState",
    run: (a) => {
      const prev = get();
      const axis = a.insertAxis === "row" || a.insertAxis === "column" ? a.insertAxis : "";
      const kinds: TableSelectionKind[] = ["none", "cells", "row", "column", "table"];
      const next: TableUiState = {
        inTable: Boolean(a.inTable), table: int(a.table, -1), row: Math.max(0, int(a.row, 0)), col: Math.max(0, int(a.col, 0)),
        rows: Math.max(0, int(a.rows, 0)), cols: Math.max(0, int(a.cols, 0)), header: typeof a.header === "string" ? a.header : "",
        align: a.align === "left" || a.align === "center" || a.align === "right" ? a.align : "",
        insertAxis: axis, insertIndex: int(a.insertIndex, 0), selection: kinds.includes(a.selection as TableSelectionKind) ? (a.selection as TableSelectionKind) : "none",
        // Counted only while the caret is in a table: the controls appear with the table, so a request
        // made as the caret arrives (Shift+F10 straight after an arrow key) is the first they see.
        menuRequest: a.inTable ? prev.menuRequest : 0,
      };
      if (JSON.stringify(next) !== JSON.stringify(prev)) set(next);
    },
  });
  commands.register<Record<string, unknown>>({
    id: "table.action", title: "command.table.action",
    enabled: writable,
    // From a handle, an insertion point, an edge bar, or a menu: only known table actions run.
    run: (a) => {
      const id = String(a.id ?? "");
      if (!ACTIONS.has(id)) return;
      const args: Record<string, unknown> = {};
      for (const k of ["table", "row", "col", "index", "from", "to"]) if (typeof a[k] === "number" && Number.isInteger(a[k])) args[k] = a[k];
      editorAction(id, args);
    },
  });
  for (const id of TABLE_MENU_COMMANDS) {
    commands.register({ id, title: `command.${id}`, enabled: writable, run: (a) => editorAction(id, (a ?? {}) as Record<string, unknown>) });
  }
  commands.register({ id: "table.openMenu", title: "command.table.contextMenu", run: () => set({ menuRequest: get().menuRequest + 1 }) });
  // A menu closed without choosing (Esc): the caret goes back to the note.
  commands.register({ id: "table.closeMenu", title: "command.table.closeMenu", run: () => editorAction("edit.focus") });
  commands.register<{ kind: string; index?: number; align?: string }>({
    id: "table.changed", title: "command.table.changed",
    // Structural changes are announced politely (Tables → Accessibility).
    run: ({ kind, index, align }) => {
      const key = `table.announce.${kind}`;
      if (catalog.has(key)) announce(key, { index: int(index, 0), below: Math.max(1, int(index, 0) - 1), align: String(align ?? "left") });
    },
  });
  commands.register<{ text: string; format: string }>({
    id: "table.copied", title: "command.table.copied",
    enabled: () => Boolean(bridge.copyText),
    run: async ({ text, format }) => {
      if (typeof text !== "string" || !bridge.copyText) return;
      try {
        await bridge.copyText(text);
        toast(catalog.format(format === "tsv" ? "table.copied.tsv" : "table.copied.markdown"));
      } catch {
        toast(catalog.format("table.copyFailed"));
      }
    },
  });

  // ---- the view model ----
  const item = (id: string, label: string, disabled = false) => ({ id, label: catalog.format(label), ...(disabled ? { disabled: true } : {}) });
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, disabled: { type: "boolean" as const }, checked: { type: "boolean" as const }, items: { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, checked: { type: "boolean" as const } } } } } };
  const SECTIONS = { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, items: { type: "array" as const, items: ITEM } } } };
  let memo: { key: TableUiState; value: Record<string, unknown> } | undefined;
  viewModels.register({
    id: "vm.table",
    reads: ["ui.format.table", "note.status"],
    schema: {
      type: "object",
      properties: {
        visible: { type: "boolean" },
        columnLabel: { type: "string" }, rowLabel: { type: "string" }, tableLabel: { type: "string" }, insertLabel: { type: "string" },
        newRowLabel: { type: "string" }, newColumnLabel: { type: "string" }, cellMenuLabel: { type: "string" },
        columnMenu: SECTIONS, rowMenu: SECTIONS, tableMenu: SECTIONS, cellMenu: SECTIONS,
        menuRequest: { type: "number" },
      },
    },
    select: (s) => {
      const t = s.ui.format.table;
      if (memo?.key === t) return memo.value;
      const header = t.row === 0;
      const col = t.col + 1;
      const align = (current: string) => ({
        id: "align", label: catalog.format("table.menu.align"),
        items: (["Left", "Center", "Right"] as const).map((a) => ({ id: `table.align${a}`, label: catalog.format(`table.menu.align${a}`), checked: current === a.toLowerCase() })),
      });
      const columnMenu = [
        { id: "insert", items: [item("table.insertColumnLeft", "table.menu.insertLeft"), item("table.insertColumnRight", "table.menu.insertRight")] },
        { id: "move", items: [item("table.moveColumnLeft", "table.menu.moveLeft", t.col <= 0), item("table.moveColumnRight", "table.menu.moveRight", t.col >= t.cols - 1)] },
        { id: "sort", items: [item("table.sortAscending", "table.menu.sortAscending"), item("table.sortDescending", "table.menu.sortDescending")] },
        { id: "format", items: [align(t.align), item("table.clearColumn", "table.menu.clear")] },
        { id: "delete", items: [item("table.deleteColumn", "table.menu.deleteColumn")] },
      ];
      // The header row can only have a row inserted below it, or be cleared (Tables → Menus).
      const rowMenu = header
        ? [{ id: "insert", items: [item("table.insertRowBelow", "table.menu.insertBelow")] }, { id: "format", items: [item("table.clearRow", "table.menu.clear")] }]
        : [
          { id: "insert", items: [item("table.insertRowAbove", "table.menu.insertAbove"), item("table.insertRowBelow", "table.menu.insertBelow")] },
          { id: "move", items: [item("table.moveRowUp", "table.menu.moveUp", t.row <= 1), item("table.moveRowDown", "table.menu.moveDown", t.row >= t.rows - 1)] },
          { id: "format", items: [item("table.duplicateRow", "table.menu.duplicateRow"), item("table.clearRow", "table.menu.clear")] },
          { id: "delete", items: [item("table.deleteRow", "table.menu.deleteRow")] },
        ];
      const tableMenu = [
        { id: "select", items: [item("table.selectTable", "table.menu.selectTable")] },
        { id: "copy", items: [item("table.copyMarkdown", "table.menu.copyMarkdown"), item("table.copyTsv", "table.menu.copyTsv"), item("table.duplicateTable", "table.menu.duplicateTable")] },
        { id: "delete", items: [item("table.deleteTable", "table.menu.deleteTable")] },
      ];
      // The context menu: every row and column action for the cell, so the keyboard reaches them all.
      const lines = t.selection === "row" || t.selection === "column";
      const cellMenu = [
        { id: "clipboard", items: [item("table.copy", "table.menu.copy"), item("table.cut", "table.menu.cut"), item("table.clearCells", "table.menu.clearCells")] },
        { id: "insert", items: [
          item("table.insertRowAbove", "table.menu.insertRowAbove", header), item("table.insertRowBelow", "table.menu.insertRowBelow"),
          item("table.insertColumnLeft", "table.menu.insertColumnLeft"), item("table.insertColumnRight", "table.menu.insertColumnRight"),
        ] },
        { id: "move", items: [
          item("table.moveRowUp", "table.menu.moveRowUp", t.row <= 1), item("table.moveRowDown", "table.menu.moveRowDown", header || t.row >= t.rows - 1),
          item("table.moveColumnLeft", "table.menu.moveColumnLeft", t.col <= 0), item("table.moveColumnRight", "table.menu.moveColumnRight", t.col >= t.cols - 1),
        ] },
        { id: "sort", items: [item("table.sortAscending", "table.menu.sortColumnAscending"), item("table.sortDescending", "table.menu.sortColumnDescending")] },
        { id: "format", items: [align(t.align), item("table.duplicateRow", "table.menu.duplicateRow", header)] },
        { id: "select", items: [item("table.selectRow", "table.menu.selectRow"), item("table.selectColumn", "table.menu.selectColumn"), item("table.selectTable", "table.menu.selectTable")] },
        { id: "delete", items: [
          ...(lines ? [item("table.deleteSelection", t.selection === "row" ? "table.menu.deleteRows" : "table.menu.deleteColumns")] : []),
          item("table.deleteRow", "table.menu.deleteRow", header), item("table.deleteColumn", "table.menu.deleteColumn"), item("table.deleteTable", "table.menu.deleteTable"),
        ] },
      ];
      const between = t.insertAxis === "row"
        ? catalog.format("table.insertRow", { above: t.insertIndex, below: t.insertIndex + 1 })
        : t.insertAxis === "column" ? catalog.format("table.insertColumn", { left: t.insertIndex, right: t.insertIndex + 1 }) : "";
      const value = {
        visible: t.inTable && s.note.status === "ready",
        columnLabel: t.header.trim() ? catalog.format("table.columnHandle", { index: col, name: t.header.trim() }) : catalog.format("table.columnHandleUnnamed", { index: col }),
        rowLabel: catalog.format("table.rowHandle", { index: t.row + 1 }),
        tableLabel: catalog.format("table.tableHandle"),
        insertLabel: between,
        newRowLabel: catalog.format("table.newRow"),
        newColumnLabel: catalog.format("table.newColumn"),
        cellMenuLabel: catalog.format("table.cellMenu"),
        columnMenu, rowMenu, tableMenu, cellMenu,
        menuRequest: t.menuRequest,
      };
      memo = { key: t, value };
      return value;
    },
  });
}

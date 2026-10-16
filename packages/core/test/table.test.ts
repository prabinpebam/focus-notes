/**
 * WP-1.5: the table controls' model (IA-CMP-TABLE). Handles are named for what they control, menus
 * follow Tables → Menus (the header row's is shorter), actions go back to the editor with their table,
 * row, and column, structural changes are announced, and pastes and copies say what they did.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const copied: string[] = [];
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {}, copyText: async (t: string) => { copied.push(t); },
};

interface Section { id: string; items: { id: string; label: string; disabled?: boolean; items?: { id: string; checked: boolean }[] }[] }
async function started() {
  const app = createApp(bridge, messages);
  await app.start();
  const actions: { id: string; args?: Record<string, unknown> }[] = [];
  app.onEditorAction((id, args) => actions.push({ id, ...(args ? { args } : {}) }));
  const vm = () => app.viewModels.select("vm.table", app.store.state) as {
    visible: boolean; columnLabel: string; rowLabel: string; tableLabel: string; insertLabel: string; newRowLabel: string; newColumnLabel: string;
    columnMenu: Section[]; rowMenu: Section[]; tableMenu: Section[]; cellMenu: Section[]; menuRequest: number;
  };
  const at = (patch: Record<string, unknown>) => app.commands.run("table.setState", { inTable: true, table: 12, row: 2, col: 1, rows: 4, cols: 3, header: "Owner", align: "", insertAxis: "", insertIndex: 0, selection: "none", ...patch });
  return { app, actions, vm, at };
}
const ids = (sections: Section[]) => sections.map((s) => s.items.map((i) => i.id));
const toasts = (app: Awaited<ReturnType<typeof started>>["app"]) => app.store.state.ui.toasts.map((t) => t.message);

describe("handles and insertion points are named for what they control (Tables → Accessibility)", () => {
  it("names the column handle by number and header, the row handle by number, and the insertion point by its boundary", async () => {
    const { vm, at } = await started();
    expect(vm().visible).toBe(false);
    await at({ insertAxis: "row", insertIndex: 2 });
    expect(vm()).toMatchObject({
      visible: true, columnLabel: "Column 2, Owner, options", rowLabel: "Row 3 options", tableLabel: "Table options",
      insertLabel: "Insert row between rows 2 and 3", newRowLabel: "New row", newColumnLabel: "New column",
    });
    await at({ header: " ", insertAxis: "column", insertIndex: 1 });
    expect(vm().columnLabel).toBe("Column 2 options");
    expect(vm().insertLabel).toBe("Insert column between columns 1 and 2");
  });
});

describe("menus (TBL-08, Tables → Menus)", () => {
  it("the column menu inserts, moves, sorts, aligns, clears, and deletes, last with the destructive item (TBL-09)", async () => {
    const { vm, at } = await started();
    await at({ col: 0, align: "center" });
    expect(ids(vm().columnMenu)).toEqual([
      ["table.insertColumnLeft", "table.insertColumnRight"], ["table.moveColumnLeft", "table.moveColumnRight"], ["table.sortAscending", "table.sortDescending"], ["align", "table.clearColumn"], ["table.deleteColumn"],
    ]);
    expect(vm().columnMenu[1]!.items[0]!.disabled).toBe(true);
    expect(vm().columnMenu[2]!.items.map((i) => i.label)).toEqual(["Sort A→Z", "Sort Z→A"]);
    expect(vm().columnMenu[3]!.items[0]!.items!.map((i) => [i.id, i.checked])).toEqual([["table.alignLeft", false], ["table.alignCenter", true], ["table.alignRight", false]]);
  });
  it("the row menu: insert, move, duplicate, clear, delete; the header row's only inserts below and clears", async () => {
    const { vm, at } = await started();
    await at({ row: 1 });
    expect(ids(vm().rowMenu)).toEqual([["table.insertRowAbove", "table.insertRowBelow"], ["table.moveRowUp", "table.moveRowDown"], ["table.duplicateRow", "table.clearRow"], ["table.deleteRow"]]);
    expect(vm().rowMenu[1]!.items[0]!.disabled).toBe(true);
    await at({ row: 0 });
    expect(ids(vm().rowMenu)).toEqual([["table.insertRowBelow"], ["table.clearRow"]]);
  });
  it("the table menu, and a context menu that reaches every row and column action from the keyboard", async () => {
    const { vm, at, app } = await started();
    await at({});
    expect(ids(vm().tableMenu)).toEqual([["table.selectTable"], ["table.copyMarkdown", "table.copyTsv", "table.duplicateTable"], ["table.deleteTable"]]);
    const all = ids(vm().cellMenu).flat();
    for (const id of ["table.copy", "table.cut", "table.clearCells", "table.insertRowAbove", "table.insertRowBelow", "table.insertColumnLeft", "table.insertColumnRight",
      "table.moveRowUp", "table.moveRowDown", "table.moveColumnLeft", "table.moveColumnRight", "table.sortAscending", "table.sortDescending", "align", "table.deleteRow", "table.deleteColumn", "table.deleteTable"]) expect(all).toContain(id);
    await at({ selection: "row" });
    expect(ids(vm().cellMenu).at(-1)).toContain("table.deleteSelection");
    const before = vm().menuRequest;
    await app.commands.run("table.openMenu");
    expect(vm().menuRequest).toBe(before + 1);
  });
});

describe("actions go back to the editor (TBL-02, TBL-08)", () => {
  it("forwards known actions with their table, row, column, and drop target; refuses others", async () => {
    const { app, actions, at } = await started();
    await at({});
    await app.commands.run("table.action", { id: "table.insertRowBelow", table: 12, row: 2, col: 1, junk: "x" });
    await app.commands.run("table.action", { id: "table.moveRow", table: 12, from: 3, to: 1 });
    await app.commands.run("table.action", { id: "note.delete", table: 12 });
    expect(actions).toEqual([
      { id: "table.insertRowBelow", args: { table: 12, row: 2, col: 1 } },
      { id: "table.moveRow", args: { table: 12, from: 3, to: 1 } },
    ]);
  });
  it("menu commands are commands too, for Spotlight", async () => {
    const { app } = await started();
    for (const id of ["table.insertColumnRight", "table.alignCenter", "table.sortAscending", "table.sortDescending", "table.deleteTable", "table.copyMarkdown"]) expect(app.commands.has(id)).toBe(true);
  });
});

describe("feedback", () => {
  it("announces structural changes politely", async () => {
    const { app } = await started();
    await app.commands.run("table.changed", { kind: "rowInserted", index: 3 });
    expect(app.store.state.announcement.text).toBe("Row inserted below row 2");
    await app.commands.run("table.changed", { kind: "columnMoved", index: 1 });
    expect(app.store.state.announcement.text).toBe("Column moved to position 1");
    await app.commands.run("table.changed", { kind: "sortedAscending", index: 2 });
    expect(app.store.state.announcement.text).toBe("Column 2 sorted A to Z");
    await app.commands.run("table.changed", { kind: "sortedDescending", index: 1 });
    expect(app.store.state.announcement.text).toBe("Column 1 sorted Z to A");
  });
  it("a range pasted into a table says its size and how the table grew (TBL-10)", async () => {
    const { app } = await started();
    const said = async (args: Record<string, unknown>) => {
      await app.commands.run("paste.notice", args);
      return toasts(app).at(-1);
    };
    expect(await said({ kind: "tablePasted", rows: 5, cols: 4, addedRows: 2, addedCols: 0 })).toBe("Pasted 5 × 4. Table grew by 2 rows.");
    expect(await said({ kind: "tablePasted", rows: 1, cols: 3, addedRows: 0, addedCols: 1 })).toBe("Pasted 1 × 3. Table grew by 1 column.");
    expect(await said({ kind: "tablePasted", rows: 2, cols: 2, addedRows: 1, addedCols: 2 })).toBe("Pasted 2 × 2. Table grew by 1 row and 2 columns.");
    expect(await said({ kind: "tablePasted", rows: 2, cols: 2, addedRows: 0, addedCols: 0 })).toBe("Pasted 2 × 2.");
    expect(await said({ kind: "lineBreaks" })).toBe("A table cell holds one line, so the line breaks became spaces.");
  });
  it("Copy as Markdown puts the table on the clipboard and says so", async () => {
    const { app } = await started();
    await app.commands.run("table.copied", { text: "| a |\n| - |", format: "markdown" });
    expect(copied.at(-1)).toBe("| a |\n| - |");
    expect(toasts(app).at(-1)).toBe("Table copied as Markdown.");
  });
});

describe("keys (Keyboard shortcuts → Tables)", () => {
  it("table keys are their own context, listed under Tables, and reach the editor ahead of the block keys", async () => {
    const { app } = await started();
    const tables = app.commands.bindings().filter((b) => b.group === "tables").map((b) => [b.id, b.chords.join(" ")]);
    expect(tables).toEqual([
      ["table.nextCell", "Tab"], ["table.prevCell", "Shift+Tab"], ["table.cellBelow", "Enter"], ["table.cellAbove", "Shift+Enter"],
      ["table.addRowBelow", "Mod+Enter"], ["table.addRowAbove", "Mod+Shift+Enter"], ["table.moveRowUp", "Mod+Shift+Up"], ["table.moveRowDown", "Mod+Shift+Down"],
      ["table.deleteRow", "Mod+Shift+K"], ["table.selectCells", "Escape"], ["table.contextMenu", "Shift+F10 ContextMenu"],
    ]);
    const keymap = (app.viewModels.select("vm.app", app.store.state) as { editorKeymap: { id: string; chord: string }[] }).editorKeymap;
    expect(keymap.filter((k) => k.chord === "Mod+Enter").map((k) => k.id).sort()).toEqual(["table.addRowBelow", "task.toggle"]);
  });
  it("the formatting toolbar has marks only in a table (no Turn into)", async () => {
    const { app } = await started();
    await app.commands.run("format.setState", { toolbar: true, table: true, bold: "off", italic: "off", strike: "off", code: "off", block: "block.paragraph" });
    expect((app.viewModels.select("vm.format", app.store.state) as { showTurnInto: boolean }).showTurnInto).toBe(false);
  });
});

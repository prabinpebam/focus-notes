/**
 * Tables in the editor (WP-1.5, IA-CMP-TABLE): the schema, the GFM shape, keys, clipboard, and the
 * GFM header row typed as text (TBL-01). Handles, insertion points, and menus are the design system's
 * TableControls, which act through TABLE_ACTIONS; this is the editor side of them.
 */
import { Extension, type AnyExtension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection, TableMap, nextCell, tableEditing } from "@tiptap/pm/tables";
import { parseMarkdown, type PMNode as JsonNode } from "@focus-notes/markdown";
import { Table, TableCell, TableHeader, TableNormalizer, TableRoles, TableRow, buildTable, cellTextPos, isCell, readGrid, type Grid } from "./table-schema.ts";
import { clipboardFor, nodeGrid, parseTsv, textGrid } from "./table-clipboard.ts";
import { currentCell, locateTable, selectionRect, setTableHooks, tableHooks, type TableHooks } from "./table-commands.ts";

export * from "./table-schema.ts";
export * from "./table-clipboard.ts";
export * from "./table-commands.ts";
export * from "./table-sort.ts";

const PIPE_ROW = /^\s*\|?(.*?)\|?\s*$/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cellCount = (line: string) => (PIPE_ROW.exec(line)?.[1] ?? "").split(/(?<!\\)\|/).length;

/**
 * Enter after a delimiter row under a header row (`| a | b |` then `|---|---|`) makes a table,
 * with the caret in its first body cell (TBL-01, Tables → Inserting a table).
 */
function gfmRowsToTable(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size || $from.depth < 1) return false;
  const delimiter = $from.parent.textContent;
  if (!DELIMITER.test(delimiter) || !delimiter.includes("|")) return false;
  const index = $from.index(-1);
  if (index === 0) return false;
  const header = $from.node(-1).child(index - 1);
  if (header.type.name !== "paragraph" || !header.textContent.includes("|") || cellCount(header.textContent) !== cellCount(delimiter)) return false;
  const parsed = parseMarkdown(`${header.textContent}\n${delimiter}\n`).doc.content?.[0];
  if (parsed?.type !== "table") return false;
  const table = state.schema.nodeFromJSON(parsed as JsonNode);
  const start = $from.before() - header.nodeSize;
  const tr = closeHistory(state.tr).replaceWith(start, $from.after(), table);
  const after = start + table.nodeSize;
  if (!tr.doc.resolve(after).nodeAfter?.isTextblock) tr.insert(after, state.schema.nodes.paragraph!.create());
  tr.setSelection(TextSelection.create(tr.doc, cellTextPos(start, table, 1, 0)));
  editor.view.dispatch(tr.scrollIntoView());
  tableHooks(editor).onChange?.({ kind: "tableInserted" });
  return true;
}

/** In cell selection mode, arrows move the selected cell and Enter goes back to typing in it. */
function cellModeKey(view: EditorView, event: KeyboardEvent): boolean {
  const sel = view.state.selection;
  if (!(sel instanceof CellSelection) || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key === "Enter" && !event.shiftKey) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, sel.$headCell.pos + sel.$headCell.nodeAfter!.nodeSize - 2)));
    return true;
  }
  const dirs: Record<string, ["horiz" | "vert", number]> = { ArrowLeft: ["horiz", -1], ArrowRight: ["horiz", 1], ArrowUp: ["vert", -1], ArrowDown: ["vert", 1] };
  const dir = dirs[event.key];
  if (!dir || event.shiftKey) return false;
  const $next = nextCell(sel.$headCell, dir[0], dir[1]);
  if ($next) view.dispatch(view.state.tr.setSelection(new CellSelection($next)).scrollIntoView());
  return true;
}

let lineBreakNoticeShown = false;

/** Pastes into a table, or a spreadsheet range onto a line (TBL-10, Tables → Copy, paste, and sort). */
function pasteIntoTables(view: EditorView, event: ClipboardEvent, slice: Slice, editor: Editor): boolean {
  const { state } = view;
  const data = event.clipboardData;
  const text = data?.getData("text/plain") ?? "";
  const html = data?.getData("text/html") ?? "";
  if (state.selection.$from.parent.type.spec.code) return false;
  const loc = locateTable(state);
  const cur = loc && currentCell(state, loc);
  // A spreadsheet's range: its HTML table, else its tab-separated text.
  let only: PMNode | null = null;
  slice.content.forEach((n) => { only = slice.content.childCount === 1 && n.type.name === "table" ? n : null; });
  const tsv = parseTsv(text);
  const range: Fragment[][] | null = html && only ? nodeGrid(only) : tsv ? textGrid(state.schema, tsv).cells : null;
  const notice = tableHooks(editor).onNotice;
  if (!loc || !cur) {
    if (!range || only) return false;
    // A tab-separated range on a line becomes a table of its shape, its first row the header.
    const table = buildTable(state.schema, { cells: range, align: range[0]!.map(() => null) });
    view.dispatch(state.tr.replaceSelectionWith(table).scrollIntoView().setMeta("uiEvent", "paste"));
    return true;
  }
  if (range) {
    // Fill from the active cell (a range's top-left) right and down, growing the table to fit.
    const rect = selectionRect(state, loc);
    const top = rect?.top ?? cur.row;
    const left = rect?.left ?? cur.col;
    const grid: Grid = readGrid(loc.node);
    const rows = range.length;
    const cols = Math.max(...range.map((r) => r.length));
    const addedRows = Math.max(0, top + rows - grid.cells.length);
    const addedCols = Math.max(0, left + cols - grid.align.length);
    for (let i = 0; i < addedCols; i++) { for (const r of grid.cells) r.push(Fragment.empty); grid.align.push(null); }
    for (let i = 0; i < addedRows; i++) grid.cells.push(grid.align.map(() => Fragment.empty));
    range.forEach((r, i) => r.forEach((c, j) => { grid.cells[top + i]![left + j] = c; }));
    const table = buildTable(state.schema, grid);
    const tr = closeHistory(state.tr).replaceWith(loc.pos, loc.pos + loc.node.nodeSize, table);
    const map = TableMap.get(table);
    const at = (r: number, c: number) => loc.pos + 1 + map.map[r * map.width + c]!;
    tr.setSelection(rows * cols > 1 ? CellSelection.create(tr.doc, at(top, left), at(top + rows - 1, left + cols - 1)) : TextSelection.create(tr.doc, cellTextPos(loc.pos, table, top, left, true)));
    view.dispatch(tr.scrollIntoView().setMeta("uiEvent", "paste"));
    view.dispatch(closeHistory(view.state.tr));
    notice?.("tablePasted", { rows, cols, addedRows, addedCols });
    return true;
  }
  // Anything else pasted into a cell stays on one line: blocks and line breaks become spaces (UNSUP-TABLE-01).
  const blocks: Fragment[] = [];
  let broke = /[\r\n]/.test(text.replace(/[\r\n]+$/, ""));
  slice.content.descendants((n) => {
    if (n.isTextblock) { blocks.push(n.content); return false; }
    return true;
  });
  if (!blocks.length && slice.content.childCount && slice.content.firstChild!.isInline) return false;
  if (blocks.length <= 1 && !broke) {
    let hasBreak = false;
    blocks[0]?.forEach((n) => { if (n.type.name === "hardBreak") hasBreak = true; });
    if (!hasBreak) return false;
  }
  broke = true;
  const inline: PMNode[] = [];
  blocks.forEach((f, i) => {
    if (i > 0) inline.push(state.schema.text(" "));
    f.forEach((n) => inline.push(n.type.name === "hardBreak" ? state.schema.text(" ", n.marks) : n.isText && /[\r\n]/.test(n.text!) ? state.schema.text(n.text!.replace(/\s*[\r\n]+\s*/g, " "), n.marks) : n));
  });
  view.dispatch(state.tr.replaceSelection(new Slice(Fragment.fromArray(inline), 0, 0)).scrollIntoView().setMeta("uiEvent", "paste"));
  if (broke && !lineBreakNoticeShown) {
    lineBreakNoticeShown = true;
    notice?.("lineBreaks", {});
  }
  return true;
}

/** Copy and cut of a cell range: tab-separated text, a GFM table, and HTML (TBL-11). */
function copyCells(view: EditorView, event: ClipboardEvent, cut: boolean, editor: Editor): boolean {
  const sel = view.state.selection;
  const loc = locateTable(view.state);
  const rect = loc && selectionRect(view.state, loc);
  if (!(sel instanceof CellSelection) || !loc || !rect || !event.clipboardData) return false;
  const grid = readGrid(loc.node);
  const cells = grid.cells.slice(rect.top, rect.bottom).map((r) => r.slice(rect.left, rect.right));
  const { tsv, html, markdown } = clipboardFor(view.state.schema, cells, grid.align.slice(rect.left, rect.right), rect.top === 0);
  event.preventDefault();
  event.clipboardData.clearData();
  event.clipboardData.setData("text/plain", tsv);
  event.clipboardData.setData("text/html", html);
  event.clipboardData.setData("text/markdown", markdown);
  if (cut) {
    const g = readGrid(loc.node);
    for (let r = rect.top; r < rect.bottom; r++) for (let c = rect.left; c < rect.right; c++) g.cells[r]![c] = Fragment.empty;
    const table = buildTable(view.state.schema, g);
    const map = TableMap.get(table);
    const at = (r: number, c: number) => loc.pos + 1 + map.map[r * map.width + c]!;
    const tr = closeHistory(view.state.tr).replaceWith(loc.pos, loc.pos + loc.node.nodeSize, table);
    tr.setSelection(CellSelection.create(tr.doc, at(rect.top, rect.left), at(rect.bottom - 1, rect.right - 1)));
    view.dispatch(tr.setMeta("uiEvent", "cut"));
    tableHooks(editor).onChange?.({ kind: "cleared" });
  }
  return true;
}

/**
 * Empty header cells show their column's name, muted, as a widget that isn't part of the note: it
 * names the column for assistive technology and says what the cell is for. Recomputed only when the
 * document changes, over top-level blocks and header rows alone, so typing in a cell stays cheap.
 */
function emptyHeaders(doc: PMNode, render: (index: number) => HTMLElement): DecorationSet {
  const decos: Decoration[] = [];
  doc.forEach((block, offset) => {
    if (block.type.name !== "table" || !block.firstChild) return;
    const rowPos = offset + 1;
    block.firstChild.forEach((cell, cellOffset, index) => {
      if (cell.type.name !== "tableHeader" || cell.textContent !== "" || cell.firstChild?.childCount) return;
      decos.push(Decoration.widget(rowPos + 1 + cellOffset + 2, () => render(index + 1), { side: -1, ignoreSelection: true, key: `empty-header-${index + 1}` }));
    });
  });
  return DecorationSet.create(doc, decos);
}

export const TableKit = Extension.create<TableHooks>({
  name: "tableKit",
  // Before the paste pipeline and the default keys, so a range pasted into a cell fills cells.
  priority: 200,
  addOptions() {
    return {};
  },
  onBeforeCreate() {
    setTableHooks(this.editor, this.options);
  },
  addKeyboardShortcuts() {
    return { Enter: ({ editor }) => gfmRowsToTable(editor) };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const { emptyHeader } = this.options;
    return [
      new Plugin<DecorationSet>({
        key: new PluginKey("tableKit"),
        state: {
          init: (_c, state) => (emptyHeader ? emptyHeaders(state.doc, emptyHeader) : DecorationSet.empty),
          apply: (tr, old) => (emptyHeader && tr.docChanged ? emptyHeaders(tr.doc, emptyHeader) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleKeyDown: (view, event) => cellModeKey(view, event),
          handlePaste: (view, event, slice) => pasteIntoTables(view, event, slice, editor),
          handleDOMEvents: {
            copy: (view, event) => copyCells(view, event, false, editor),
            cut: (view, event) => copyCells(view, event, true, editor),
            // Right-click a cell: its context menu, with that cell (or the range it's in) selected.
            contextmenu: (view, event) => {
              const target = (event.target as Element | null)?.closest?.("td, th");
              if (!target || !view.dom.contains(target) || !view.editable) return false;
              const pos = view.posAtDOM(target, 0);
              const $pos = view.state.doc.resolve(pos);
              let cellPos = -1;
              for (let d = $pos.depth; d > 0; d--) if (isCell($pos.node(d))) { cellPos = $pos.before(d); break; }
              if (cellPos < 0) return false;
              event.preventDefault();
              const sel = view.state.selection;
              // Inside a selected range, the menu acts on the range; elsewhere, on the clicked cell.
              const inside = sel instanceof CellSelection && sel.ranges.some((r) => r.$from.pos === cellPos + 1);
              if (!inside) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cellPos + view.state.doc.nodeAt(cellPos)!.nodeSize - 2)));
              view.focus();
              tableHooks(editor).onContextMenu?.();
              return true;
            },
          },
        },
      }),
      tableEditing(),
    ];
  },
});

/** Everything tables add to the editor: the nodes, their roles, the GFM normalizer, and TableKit. */
export function tableExtensions(hooks: TableHooks = {}): AnyExtension[] {
  return [Table, TableRow, TableHeader, TableCell, TableRoles, TableNormalizer, TableKit.configure(hooks)];
}

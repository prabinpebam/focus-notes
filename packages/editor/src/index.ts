/**
 * The editor engine (D-01): Tiptap extensions for the schema, the block registry (EXT-01),
 * and the Markdown session that keeps files byte-identical where untouched (EDT-10).
 * Rendering lives in packages/ui (block components and the EditorSurface host).
 */
import { Extension, Node, mergeAttributes, type AnyExtension, type CommandProps, type Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Strike from "@tiptap/extension-strike";
import HardBreak from "@tiptap/extension-hard-break";
import Link from "@tiptap/extension-link";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";

export { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";
export * from "./find.ts";
export * from "./format.ts";
export * from "./slash.ts";
export * from "./paste.ts";
export * from "./sanitize.ts";
export * from "./table.ts";
export { COLUMN_MIN_CH, COLUMN_OPTIMAL_CH, COLUMN_STEP_CH } from "./table-schema.ts";
export * from "./blocks.ts";
export * from "./expand.ts";
export * from "./block-select.ts";
import { BLOCK_SELECT, BlockSelection } from "./block-select.ts";
import { EXPAND_ACTIONS, ExpandSelection } from "./expand.ts";
import { Find, FIND_ACTIONS } from "./find.ts";
import { atBlock, BLOCK_ACTIONS, BLOCK_MENU, BLOCK_MOVE_TO, BlockKit } from "./blocks.ts";
import { LinkOpen, LinkPaste, SelectionGhost, removeLink, selectLink } from "./format.ts";
import { SlashMenu, blockIs, insideNode, type SlashEntry } from "./slash.ts";
import { SmartPaste } from "./paste.ts";
import { isSafeHref } from "./sanitize.ts";
import { TABLE_ACTIONS, insertTable, tableExtensions, type TableChange, type TableHooks } from "./table.ts";

/** One registration per block type, built-in or future (Editor engine → Block registry contract). */
export interface BlockRegistration {
  /** The ProseMirror node name. */
  name: string;
  /** Message key for its name in the slash menu and block menu. */
  title: string;
  /** How Markdown round-trips: natively, or kept verbatim as source. */
  markdown: "native" | "verbatim";
  /** Shown in the slash menu (EDT-06, M1). */
  insertable: boolean;
  /** Markdown shortcut that creates it at the start of a block, if any (EDT-05). */
  inputRule?: string;
  /** Its rows in the slash menu (EDT-06), when it's insertable. */
  slash?: readonly SlashEntry[];
}

const registry = new Map<string, BlockRegistration>();
export function registerBlock(b: BlockRegistration): void {
  if (registry.has(b.name)) throw new Error(`Block ${b.name} is already registered`);
  registry.set(b.name, b);
}
export const blocks = (): BlockRegistration[] => [...registry.values()];
/** Every slash-menu entry, in registry order (EDT-06). */
export const slashEntries = (): SlashEntry[] => blocks().filter((b) => b.insertable).flatMap((b) => b.slash ?? []);
/** What core needs to show an entry: everything but its insert command. */
export const slashCatalog = () => slashEntries().map(({ id, title, group, icon, markdown }) => ({ id, title, group, icon, markdown: markdown ?? "" }));

registerBlock({
  name: "paragraph", title: "block.paragraph", markdown: "native", insertable: true,
  slash: [{ id: "block.paragraph", title: "format.block.paragraph", group: "text", icon: "text", insert: ({ commands, state }) => blockIs(state, "paragraph") || commands.setParagraph() }],
});
registerBlock({
  name: "heading", title: "block.heading", markdown: "native", insertable: true, inputRule: "# ",
  slash: ([1, 2, 3] as const).map((level) => ({
    id: `block.heading${level}`, title: `format.block.heading${level}`, group: "text" as const, icon: `heading${level}`,
    markdown: "#".repeat(level), insert: ({ commands, state }: CommandProps) => blockIs(state, "heading", { level }) || commands.setHeading({ level }),
  })),
});
registerBlock({
  name: "bulletList", title: "block.bulletList", markdown: "native", insertable: true, inputRule: "- ",
  slash: [{ id: "block.bulletList", title: "format.block.bulletList", group: "lists", icon: "bulletList", markdown: "-", insert: ({ commands, state }) => insideNode(state, "bulletList") || commands.toggleBulletList() }],
});
registerBlock({
  name: "orderedList", title: "block.orderedList", markdown: "native", insertable: true, inputRule: "1. ",
  slash: [{ id: "block.orderedList", title: "format.block.orderedList", group: "lists", icon: "numberedList", markdown: "1.", insert: ({ commands, state }) => insideNode(state, "orderedList") || commands.toggleOrderedList() }],
});
registerBlock({ name: "listItem", title: "block.listItem", markdown: "native", insertable: false });
registerBlock({
  name: "taskList", title: "block.taskList", markdown: "native", insertable: true, inputRule: "[ ] ",
  slash: [{ id: "block.taskList", title: "format.block.taskList", group: "lists", icon: "taskList", markdown: "[ ]", insert: ({ commands, state }) => insideNode(state, "taskList") || commands.toggleTaskList() }],
});
registerBlock({ name: "taskItem", title: "block.taskItem", markdown: "native", insertable: false });
registerBlock({
  name: "blockquote", title: "block.blockquote", markdown: "native", insertable: true, inputRule: "> ",
  slash: [{ id: "block.quote", title: "format.block.quote", group: "text", icon: "quote", markdown: ">", insert: ({ commands }) => commands.setBlockquote() }],
});
registerBlock({
  name: "codeBlock", title: "block.codeBlock", markdown: "native", insertable: true, inputRule: "```",
  slash: [{ id: "block.codeBlock", title: "format.block.codeBlock", group: "insert", icon: "code", markdown: "```", insert: ({ commands }) => commands.setCodeBlock() }],
});
registerBlock({
  name: "horizontalRule", title: "block.horizontalRule", markdown: "native", insertable: true, inputRule: "---",
  slash: [{ id: "block.divider", title: "format.block.divider", group: "insert", icon: "divider", markdown: "---", insert: ({ commands }) => commands.setHorizontalRule() }],
});
registerBlock({
  name: "table", title: "block.table", markdown: "native", insertable: true, inputRule: "| a | b |",
  slash: [{ id: "block.table", title: "format.block.table", group: "insert", icon: "table", markdown: "|", insert: (props) => insertTable(props) }],
});
registerBlock({ name: "tableRow", title: "block.tableRow", markdown: "native", insertable: false });
registerBlock({ name: "tableHeader", title: "block.tableHeader", markdown: "native", insertable: false });
registerBlock({ name: "tableCell", title: "block.tableCell", markdown: "native", insertable: false });
registerBlock({ name: "rawMarkdown", title: "block.rawMarkdown", markdown: "verbatim", insertable: false });

/** Markdown the editor can't represent yet, kept verbatim and read-only (EXT-05). */
export const RawMarkdown = Node.create({
  name: "rawMarkdown",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { source: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "pre[data-raw-markdown]", getAttrs: (el) => ({ source: (el as HTMLElement).textContent ?? "" }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["pre", mergeAttributes(HTMLAttributes, { "data-raw-markdown": "" }), String(node.attrs.source ?? "")];
  },
});

/**
 * Links keep their Markdown title, so opening and saving never drops it. `[text](url)` is an input
 * rule (EDT-03); pasting over a selection is LinkPaste's, so one undo pastes the address as text.
 */
export const MarkdownLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), title: { default: null } };
  },
}).configure({
  openOnClick: false, autolink: true, linkOnPaste: false, markdownLinks: true, defaultProtocol: "https",
  // Rendered addresses keep only safe schemes; a note's own text is never changed (SEC-02).
  isAllowedUri: (url) => !url || isSafeHref(url),
});

/** Pressing Enter after ``` (optionally with a language) starts a code block, like typing a space (EDT-05). */
export const FenceOnEnter = Extension.create({
  name: "fenceOnEnter",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parent.type.name !== "paragraph") return false;
        const m = /^(```|~~~)([\w+#.-]*)$/.exec($from.parent.textContent);
        if (!m || $from.parentOffset !== $from.parent.content.size) return false;
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete($from.start(), $from.end());
            return true;
          })
          .setNode("codeBlock", { language: m[2] || null })
          .run();
      },
    };
  },
});

/** Every block picks its own text direction, so notes in any script read correctly (I18N-02). */
export const AutoDirection = Extension.create({
  name: "autoDirection",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading", "blockquote", "listItem", "taskItem", "codeBlock"],
      attributes: { dir: { default: "auto", parseHTML: () => "auto", renderHTML: () => ({ dir: "auto" }), keepOnSplit: true } },
    }];
  },
});

/**
 * Editor commands by ID (KEY-01, KEY-02). The keys come from the command registry; these say what
 * each command does to the document. Each returns whether it applied.
 */
const ACTIONS: Readonly<Record<string, (editor: Editor, args?: Record<string, unknown>) => boolean>> = {
  "edit.undo": (e) => e.commands.undo(),
  // Explicit, so they're reliable in long scrolled notes and scroll into the reading zone (UI-11).
  "edit.docStart": (e) => e.chain().setTextSelection(Selection.atStart(e.state.doc).from).scrollIntoView().run(),
  "edit.docEnd": (e) => e.chain().setTextSelection(Selection.atEnd(e.state.doc).from).scrollIntoView().run(),
  "edit.redo": (e) => e.commands.redo(),
  "format.bold": (e) => e.commands.toggleBold(),
  "format.italic": (e) => e.commands.toggleItalic(),
  "format.strike": (e) => e.commands.toggleStrike(),
  "format.code": (e) => e.commands.toggleCode(),
  "format.clear": (e) => e.commands.unsetAllMarks(),
  // The link editor and hover card (EDT-13). Applying a link needs its address, so the surface does it.
  "link.select": selectLink,
  "link.remove": removeLink,
  /** Only puts the caret back: used when the toolbar or link editor hands focus back to the note. */
  "edit.focus": () => true,
  "block.paragraph": (e) => e.commands.setParagraph(),
  "block.heading1": (e) => e.commands.toggleHeading({ level: 1 }),
  "block.heading2": (e) => e.commands.toggleHeading({ level: 2 }),
  "block.heading3": (e) => e.commands.toggleHeading({ level: 3 }),
  "block.bulletList": (e) => e.commands.toggleBulletList(),
  "block.orderedList": (e) => e.commands.toggleOrderedList(),
  "block.taskList": (e) => e.commands.toggleTaskList(),
  "block.quote": (e) => e.commands.toggleBlockquote(),
  "block.codeBlock": (e) => e.commands.toggleCodeBlock(),
  ...BLOCK_ACTIONS,
  ...FIND_ACTIONS,
  ...TABLE_ACTIONS,
  ...EXPAND_ACTIONS,
  ...BLOCK_MOVE_TO,
  ...BLOCK_MENU,
  ...BLOCK_SELECT,
  "task.toggle": (e) => {
    const { $from } = e.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name !== "taskItem") continue;
      const pos = $from.before(d);
      e.view.dispatch(e.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
      return true;
    }
    return false;
  },
};

/**
 * Every editor command by ID. The block commands also take lock, the block handle's block (its
 * position), to act on it rather than on the caret's block (EDT-07).
 */
export const EDITOR_ACTIONS: Readonly<Record<string, (editor: Editor, args?: Record<string, unknown>) => boolean>> = Object.fromEntries(
  Object.entries(ACTIONS).map(([id, f]) => [id, id.startsWith("block.") && id !== "block.moveTo" && id !== "block.contextMenu" ? atBlock(f) : f]),
);

import { SelectionSync, syncSelection } from "./sync.ts";
export { syncSelection };

/**
 * Puts the caret at the note's end, scrolled into view, and focuses it now. Tiptap's own autofocus focuses a frame later,
 * and that focus writes its selection back over one made by a key pressed in between.
 */
export function focusAtEnd(editor: Editor): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)).scrollIntoView());
  editor.view.focus();
}

/** A viewport click: resolve leaf blocks to a valid caret, without scrolling before pointer-up. */
export function focusAtPosition(editor: Editor, pos: number, anchor?: number): void {
  if (editor.isDestroyed) return;
  const { doc } = editor.state;
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  const selection = anchor === undefined ? Selection.near($pos) : TextSelection.between(doc.resolve(anchor), $pos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.focus();
}

/** A registry chord ("Mod+Shift+X") as a ProseMirror key name ("Mod-Shift-x"). */
export function toKeyName(chord: string): string {
  const parts = chord.split("+");
  const key = parts.pop()!;
  const NAMES: Record<string, string> = { Plus: "+", Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight" };
  const name = NAMES[key] ?? (key.length === 1 ? key.toLowerCase() : key);
  // One order for the modifiers, as ProseMirror's keymap reads them: "Shift+Alt+Right" and
  // "Alt+Shift+Right" are one key, so a table's key and the editor's elsewhere share it (D-182).
  const ORDER = ["Mod", "Ctrl", "Meta", "Alt", "Shift"];
  const mods = [...parts].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return [...mods, name].join("-");
}

export interface KeyBinding {
  id: string;
  chord: string;
}

/**
 * Runs editor commands from the registry's key bindings while typing (KEY-02). Keys that don't
 * apply where the caret is (Mod+Enter outside a task) fall through to the app.
 */
export const CommandKeymap = Extension.create<{ bindings: KeyBinding[] }>({
  name: "commandKeymap",
  priority: 900,
  addOptions() {
    return { bindings: [] };
  },
  addKeyboardShortcuts() {
    // One chord can run a table command in a table and another elsewhere (Mod+Enter): tables first.
    const byKey = new Map<string, ((editor: Editor) => boolean)[]>();
    const ordered = [...this.options.bindings].sort((a, b) => Number(!a.id.startsWith("table.")) - Number(!b.id.startsWith("table.")));
    for (const { id, chord } of ordered) {
      const action = EDITOR_ACTIONS[id];
      if (!action) continue;
      const name = toKeyName(chord);
      byKey.set(name, [...(byKey.get(name) ?? []), action]);
    }
    const map: Record<string, () => boolean> = {};
    for (const [name, actions] of byKey) {
      map[name] = () => {
        syncSelection(this.editor);
        return actions.some((action) => action(this.editor));
      };
    }
    return map;
  },
});

export interface CoreOptions {
  /** Opens a link through the shell (Mod+click). */
  openLink?: (href: string) => void;
  /** The class that keeps the selection visible while the link editor has focus. */
  ghostClass?: string;
  /** The class that tints find in selection's scope while it's on (FND-03). */
  findScopeClass?: string;
  /** The class block selection mode gives the selected blocks (KEY-04). */
  blockSelectedClass?: string;
  /** Draws an empty header cell's column name ("Column 3"), see TableHooks. */
  emptyHeader?: (index: number) => HTMLElement;
  /** Draws a table with its layout and set column widths, and measures its columns (D-182), see TableHooks. */
  tableView?: TableHooks["view"];
  tableColumns?: TableHooks["columns"];
  /**
   * What a paste did that's worth saying: images left out (until EXT-03), a range pasted into a
   * table (`tablePasted`, with its size and how the table grew), or line breaks kept off a cell.
   */
  onPasteNotice?: (kind: string, args?: Record<string, number>) => void;
  /** A table's structure changed (a row inserted, a column moved), to announce (Tables → Accessibility). */
  onTableChange?: (change: TableChange) => void;
  /** A whole table copied as Markdown or tab-separated text, for the clipboard. */
  onTableCopy?: (text: string, format: "markdown" | "tsv") => void;
  /** The context menu of the selected cells was asked for (right-click, Shift+F10, or the Menu key). */
  onTableMenu?: () => void;
  /** The block menu was asked for (Shift+F10 or the Menu key outside a table, EDT-07). */
  onBlockMenu?: () => void;
  /** Block selection mode selected this many blocks (0: it ended), to announce (KEY-04). */
  onBlockSelect?: (count: number) => void;
}

/**
 * Editor options every surface uses with coreExtensions. Tiptap's paste rules are off: pasted
 * Markdown is parsed once by the paste pipeline, and Mod+Shift+V keeps `**text**` as it is.
 */
export const EDITOR_OPTIONS = { enablePasteRules: false } as const;

/** The schema shared by the editor surface, tests, and (later) the publisher. */
export function coreExtensions(bindings: KeyBinding[] = [], options: CoreOptions = {}): AnyExtension[] {
  return [
    SelectionSync,
    ExpandSelection,
    BlockSelection.configure({ className: options.blockSelectedClass ?? "" }),
    BlockKit.configure({ ...(options.onBlockMenu ? { onMenu: options.onBlockMenu } : {}), ...(options.onBlockSelect ? { onSelect: options.onBlockSelect } : {}) }),
    // Strike and line-break keys follow the app keymap (KEY-02), not Tiptap's defaults.
    StarterKit.configure({ underline: false, link: false, trailingNode: false, strike: false, hardBreak: false }),
    Strike.extend({ addKeyboardShortcuts: () => ({}) }),
    HardBreak.extend({
      addKeyboardShortcuts() {
        return { "Shift-Enter": () => this.editor.commands.setHardBreak() };
      },
    }),
    CommandKeymap.configure({ bindings }),
    Find.configure({ scopeClass: options.findScopeClass ?? "" }),
    MarkdownLink,
    LinkPaste,
    LinkOpen.configure(options.openLink ? { openLink: options.openLink } : {}),
    SelectionGhost.configure({ className: options.ghostClass ?? "" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    RawMarkdown,
    AutoDirection,
    FenceOnEnter,
    SlashMenu,
    SmartPaste.configure(options.onPasteNotice ? { onNotice: options.onPasteNotice } : {}),
    ...tableExtensions({
      ...(options.onPasteNotice ? { onNotice: (kind: string, args: Record<string, number>) => options.onPasteNotice!(kind, args) } : {}),
      ...(options.onTableChange ? { onChange: options.onTableChange } : {}),
      ...(options.onTableCopy ? { onCopyText: options.onTableCopy } : {}),
      ...(options.onTableMenu ? { onContextMenu: options.onTableMenu } : {}),
      ...(options.emptyHeader ? { emptyHeader: options.emptyHeader } : {}),
      ...(options.tableView ? { view: options.tableView } : {}),
      ...(options.tableColumns ? { columns: options.tableColumns } : {}),
    }),
  ];
}

/** Holds the parsed source of the open note so saving can reuse untouched blocks. */
export class MarkdownSession {
  #parsed: Parsed;
  constructor(markdown: string) {
    this.#parsed = parseMarkdown(markdown);
  }
  get doc(): PMNode {
    return this.#parsed.doc;
  }
  serialize(doc: PMNode): string {
    return serializeMarkdown(doc, this.#parsed);
  }
}

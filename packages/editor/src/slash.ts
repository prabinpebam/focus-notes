/**
 * The slash menu's editor side (EDT-06, IA-CMP-SLASH). Typing `/` at the start of a block or after
 * a space starts a query; the menu itself is a view node. Its entries come from the block registry,
 * so a block registered later (a table, an image) appears in it without touching this file.
 */
import { Extension, type CommandProps, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";

export type SlashGroup = "text" | "lists" | "insert";

/** One row of the slash menu, declared by a block registration (Editor engine → Block registry contract). */
export interface SlashEntry {
  /** Unique, and the ID the menu reports when it's chosen ("block.heading2"). */
  id: string;
  /** Message key for its name. `slash.keywords.<id>` and `slash.hint.<id>` hold its synonyms and hint. */
  title: string;
  group: SlashGroup;
  /** An icon name from the design system's icon registry. */
  icon: string;
  /** The Markdown shortcut shown on its row ("##"). */
  markdown?: string;
  /** Makes the caret's block this block. Also run through `editor.can()` to offer only valid entries. */
  insert: (props: CommandProps) => boolean;
}

interface SlashState {
  /** Where the `/` is, while the menu is open. */
  from: number | null;
}
const slashKey = new PluginKey<SlashState>("slashMenu");
/** Longer than any name or synonym: past it, the `/` was just text. */
const MAX_QUERY = 40;

export interface SlashInfo {
  open: boolean;
  /** The position of the `/`. */
  from: number;
  /** What's typed after it. */
  query: string;
}

export function slashInfo(state: EditorState): SlashInfo {
  const from = slashKey.getState(state)?.from ?? null;
  if (from === null) return { open: false, from: -1, query: "" };
  return { open: true, from, query: state.doc.textBetween(from + 1, state.selection.from, "\n") };
}

/** At the start of a block, or after a space or line break, and never in code (Text formatting → Slash menu). */
export function slashCanOpen(state: EditorState, pos: number): boolean {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock || parent.type.spec.code) return false;
  if ((state.storedMarks ?? $pos.marks()).some((m) => m.type.spec.code)) return false;
  if ($pos.parentOffset === 0) return true;
  return /\s/.test(parent.textBetween($pos.parentOffset - 1, $pos.parentOffset, undefined, "\n"));
}

function stillOpen(state: EditorState, from: number): boolean {
  const { selection, doc } = state;
  if (!selection.empty || selection.from <= from || from + 1 > doc.content.size) return false;
  if (doc.textBetween(from, from + 1) !== "/" || !doc.resolve(from).sameParent(selection.$from)) return false;
  const query = doc.textBetween(from + 1, selection.from, "\n");
  return !/^\s|\s\s|\n/.test(query) && query.length <= MAX_QUERY;
}

export const SlashMenu = Extension.create({
  name: "slashMenu",
  addProseMirrorPlugins() {
    return [new Plugin<SlashState>({
      key: slashKey,
      state: {
        init: () => ({ from: null }),
        apply(tr, value, _old, next) {
          const meta = tr.getMeta(slashKey) as { open?: number; close?: boolean } | undefined;
          if (meta?.close) return { from: null };
          let from = meta?.open ?? value.from;
          if (from === null) return value;
          if (meta?.open === undefined) {
            const mapped = tr.mapping.mapResult(from, 1);
            if (mapped.deleted) return { from: null };
            from = mapped.pos;
          }
          return stillOpen(next, from) ? (from === value.from ? value : { from }) : { from: null };
        },
      },
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== "/" || !slashCanOpen(view.state, from)) return false;
          view.dispatch(view.state.tr.insertText("/", from, to).setMeta(slashKey, { open: from }));
          return true;
        },
      },
    })];
  },
});

/** Esc: the menu closes and what was typed stays, `/` included (DD-FMT-08). */
export function closeSlashMenu(editor: Editor): boolean {
  if (!slashInfo(editor.state).open) return false;
  editor.view.dispatch(editor.state.tr.setMeta(slashKey, { close: true }).setMeta("addToHistory", false));
  return true;
}

/** The entries valid where the `/` is (DD-FMT-08), in registry order. */
export function validSlashEntries(editor: Editor, entries: readonly SlashEntry[]): SlashEntry[] {
  return entries.filter((e) => {
    try {
      return editor.can().command((props) => e.insert(props));
    } catch {
      return false;
    }
  });
}

/**
 * Inserts the chosen block (Text formatting → Slash menu → Result): `/query` goes, and the block
 * becomes the chosen one, or, if it has other text, a new block goes below it. The caret lands
 * inside. One undo brings back what was typed.
 */
export function insertSlashEntry(editor: Editor, entry: SlashEntry): boolean {
  const info = slashInfo(editor.state);
  if (!info.open) return false;
  const { doc, selection } = editor.state;
  const to = selection.from;
  // At the end of a block, the space typed before the `/` goes too.
  let from = info.from;
  if (to === selection.$from.end()) while (from > selection.$from.start() && /[ \t]/.test(doc.textBetween(from - 1, from))) from--;
  return editor
    .chain()
    .command(({ tr, state }) => {
      // Its own undo step, so one undo brings back the typed `/query`.
      closeHistory(tr);
      tr.delete(from, to).setMeta(slashKey, { close: true });
      const $pos = tr.doc.resolve(from);
      if ($pos.parent.content.size > 0) {
        const after = $pos.after();
        tr.insert(after, state.schema.nodes.paragraph!.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1));
      } else tr.setSelection(TextSelection.create(tr.doc, from));
      return true;
    })
    .command((props) => entry.insert(props))
    .scrollIntoView()
    .run();
}

/** Whether the caret's block is already this type, so choosing it is valid and changes nothing. */
export const blockIs = (state: EditorState, name: string, attrs: Record<string, unknown> = {}): boolean => {
  const block = state.selection.$from.parent;
  return block.type.name === name && Object.entries(attrs).every(([k, v]) => block.attrs[k] === v);
};

/** Whether the caret is already inside a node of this type, so a list isn't toggled off. */
export const insideNode = (state: EditorState, name: string): boolean => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === name) return true;
  return false;
};

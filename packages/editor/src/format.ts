/**
 * Inline formatting and links (EDT-03, EDT-12, EDT-13): what the formatting toolbar shows for a
 * selection, the link commands, pasting a web address over selected text, and Mod+click to open.
 * The toolbar, link editor, and hover card are view nodes; this is the editor side of them.
 */
import { Extension, getMarkRange, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";
import type { ResolvedPos } from "@tiptap/pm/model";
import { CellSelection } from "@tiptap/pm/tables";

export type MarkState = "on" | "off" | "mixed";
/** The marks the toolbar toggles, in its order. */
export const TOOLBAR_MARKS = ["bold", "italic", "strike", "code"] as const;
export type ToolbarMark = (typeof TOOLBAR_MARKS)[number];

export interface FormatInfo {
  /** A non-empty text selection the toolbar serves: not in a raw (read-only) block. */
  text: boolean;
  /** Pressed, not pressed, or half-pressed when only part of the selection has it (DD-FMT-06). */
  marks: Record<ToolbarMark, MarkState>;
  /** The Turn into command matching the selected blocks, "mixed" for several types, "" for others. */
  block: string;
  /** Inside a code block: Markdown can't format it, so only Turn into shows. */
  codeBlock: boolean;
  /** Entirely inline code: only Code (to remove it) shows. */
  inlineCode: boolean;
  /** Within one block, where a link can go. */
  oneBlock: boolean;
  /** The link the selection is entirely inside, or the caret is in. */
  link: { href: string; from: number; to: number } | null;
  /** In a table: cells hold inline content only, so Turn into doesn't show (TBL-05, TBL-06). */
  table: boolean;
}

/** A web address that opens in the browser and can be pasted as a link: http, https, or mailto. */
export const isWebLink = (href: string): boolean => {
  if (!/^(https?:\/\/[^\s/?#]+|mailto:[^\s@]+@)\S*$/i.test(href)) return false;
  try {
    return Boolean(new URL(href));
  } catch {
    return false;
  }
};

function blockOf($pos: ResolvedPos): string {
  const tb = $pos.parent;
  if (tb.type.name === "codeBlock") return "block.codeBlock";
  if (tb.type.name === "heading") {
    const level = Number(tb.attrs.level);
    return level <= 3 ? `block.heading${level}` : "";
  }
  for (let d = $pos.depth - 1; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === "bulletList" || name === "orderedList" || name === "taskList") return `block.${name}`;
    if (name === "blockquote") return "block.quote";
  }
  return tb.type.name === "paragraph" ? "block.paragraph" : "";
}

function linkAt(state: EditorState, $pos: ResolvedPos) {
  const type = state.schema.marks.link;
  if (!type) return null;
  const range = getMarkRange($pos, type);
  if (!range) return null;
  const node = state.doc.nodeAt(range.from);
  const mark = node?.marks.find((m) => m.type === type);
  return mark ? { href: String(mark.attrs.href ?? ""), from: range.from, to: range.to } : null;
}

/** The link at a document position, with its whole range (for the hover card's actions). */
export const linkAround = (state: EditorState, pos: number) => linkAt(state, state.doc.resolve(pos));

/** What the toolbar and hover card show for the current selection (Text formatting → What it shows). */
export function formatState(state: EditorState): FormatInfo {
  const { empty, $from, $to } = state.selection;
  const cells = state.selection instanceof CellSelection;
  const oneBlock = $from.sameParent($to) && $from.parent.isTextblock;
  const raw = $from.parent.type.name === "rawMarkdown" || $to.parent.type.name === "rawMarkdown" || !(state.selection instanceof TextSelection || cells);
  let table = false;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") table = true;
  const counts = Object.fromEntries(TOOLBAR_MARKS.map((m) => [m, 0])) as Record<ToolbarMark, number>;
  let total = 0;
  const blocks = new Set<string>();
  let codeBlock = false;
  // A cell range is one range per cell (TBL-11); a text selection is one range.
  for (const { $from: rangeFrom, $to: rangeTo } of state.selection.ranges) {
  const from = rangeFrom.pos;
  const to = rangeTo.pos;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      const $p = state.doc.resolve(Math.max(from, pos + 1));
      blocks.add(blockOf($p));
      if (node.type.name === "codeBlock") codeBlock = true;
      return true;
    }
    if (!node.isText) return true;
    const n = Math.min(to, pos + node.nodeSize) - Math.max(from, pos);
    if (n <= 0) return false;
    total += n;
    for (const m of node.marks) if (m.type.name in counts) counts[m.type.name as ToolbarMark] += n;
    return false;
  });
  }
  if (blocks.size === 0) blocks.add(blockOf($from));
  const marks = Object.fromEntries(TOOLBAR_MARKS.map((m) => {
    const c = counts[m];
    return [m, total === 0 || c === 0 ? "off" : c >= total ? "on" : "mixed"];
  })) as Record<ToolbarMark, MarkState>;
  let link = null;
  if (oneBlock && !cells) {
    const at = linkAt(state, $from);
    if (at && at.from <= state.selection.from && at.to >= state.selection.to) link = at;
  }
  return {
    text: !empty && !raw && total > 0,
    marks,
    block: blocks.size === 1 ? [...blocks][0]! : "mixed",
    codeBlock,
    inlineCode: marks.code === "on",
    oneBlock: oneBlock && !cells,
    link,
    table,
  };
}

/** Extends the selection to the whole link the caret is in, so Edit and Mod+K change all of it. */
export function selectLink(editor: Editor): boolean {
  const link = formatState(editor.state).link;
  if (!link) return false;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, link.from, link.to)));
  return true;
}

/**
 * Links the selection, keeping it (EDT-13). With nothing selected it inserts a new link at the caret,
 * showing `text` or, without it, the address.
 */
export function applyLink(editor: Editor, { href, text }: { href: string; text?: string }): boolean {
  const type = editor.schema.marks.link;
  if (!type || !href) return false;
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    const words = text || href;
    const tr = editor.state.tr.insert(from, editor.schema.text(words, [type.create({ href })]));
    tr.removeStoredMark(type).setMeta("preventAutolink", true);
    editor.view.dispatch(tr);
    return true;
  }
  editor.view.dispatch(editor.state.tr.removeMark(from, to, type).addMark(from, to, type.create({ href })).setMeta("preventAutolink", true));
  return true;
}

/** Removes the link the selection or caret is in, keeping its text. */
export function removeLink(editor: Editor): boolean {
  const type = editor.schema.marks.link;
  const link = formatState(editor.state).link;
  if (!type || !link) return false;
  editor.view.dispatch(editor.state.tr.removeMark(link.from, link.to, type).setMeta("preventAutolink", true));
  return true;
}

/**
 * Pasting one web address over selected text links it (DD-FMT-07). It's two undo steps: the plain
 * paste, then the link, so Mod+Z straight after leaves the address as text.
 */
export const LinkPaste = Extension.create({
  name: "linkPaste",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("linkPaste"),
      props: {
        handlePaste: (view, event) => {
          const { state } = view;
          const { from, to, empty, $from, $to } = state.selection;
          const type = state.schema.marks.link;
          const href = event.clipboardData?.getData("text/plain").trim() ?? "";
          if (empty || !type || !$from.sameParent($to) || $from.parent.type.spec.code || !isWebLink(href)) return false;
          const words = state.doc.slice(from, to);
          view.dispatch(state.tr.insertText(href, from, to).setMeta("uiEvent", "paste").setMeta("preventAutolink", true));
          const tr = closeHistory(view.state.tr);
          tr.replace(from, from + href.length, words);
          const end = from + words.content.size;
          tr.addMark(from, end, type.create({ href })).setMeta("preventAutolink", true);
          tr.setSelection(TextSelection.create(tr.doc, from, end));
          view.dispatch(tr);
          return true;
        },
      },
    })];
  },
});

/** Mod+click opens a link through the shell; a plain click only places the caret (Text formatting → Open a link). */
export const LinkOpen = Extension.create<{ openLink?: (href: string) => void }>({
  name: "linkOpen",
  addOptions() {
    return {};
  },
  addProseMirrorPlugins() {
    const open = this.options.openLink;
    const hrefAt = (state: EditorState, pos: number) => {
      const type = state.schema.marks.link;
      const mark = type && state.doc.nodeAt(pos)?.marks.find((m) => m.type === type);
      return mark ? String(mark.attrs.href ?? "") : "";
    };
    return [new Plugin({
      key: new PluginKey("linkOpen"),
      props: {
        handleClick: (view, pos, event) => {
          // In a read-only note a plain click opens it too, since there's no caret to place.
          if (!(event.ctrlKey || event.metaKey) && view.editable) return false;
          const href = hrefAt(view.state, pos);
          if (!href) return false;
          open?.(href);
          return true;
        },
        handleDOMEvents: {
          // The window never follows a link itself: modified clicks and middle clicks go nowhere.
          click: (_view, event) => {
            if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
            return false;
          },
          auxclick: (_view, event) => {
            if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
            return false;
          },
        },
      },
    })];
  },
});

const ghostKey = new PluginKey<boolean>("selectionGhost");
/**
 * Keeps the selection visible while focus is in the link editor, whose field takes the browser's
 * own selection highlight (Text formatting → Link editor).
 */
export const SelectionGhost = Extension.create<{ className: string }>({
  name: "selectionGhost",
  addOptions() {
    return { className: "" };
  },
  addProseMirrorPlugins() {
    const className = this.options.className;
    return [new Plugin<boolean>({
      key: ghostKey,
      state: {
        init: () => false,
        apply: (tr, on) => (tr.getMeta(ghostKey) as boolean | undefined) ?? on,
      },
      props: {
        decorations: (state) => {
          if (!ghostKey.getState(state) || state.selection.empty || !className) return null;
          const { from, to } = state.selection;
          return DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: className })]);
        },
      },
    })];
  },
});
export function setSelectionGhost(editor: Editor, on: boolean): void {
  if (ghostKey.getState(editor.state) === on) return;
  editor.view.dispatch(editor.state.tr.setMeta(ghostKey, on).setMeta("addToHistory", false));
}

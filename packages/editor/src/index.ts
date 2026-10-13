/**
 * The editor engine (D-01): Tiptap extensions for the schema, the block registry (EXT-01),
 * and the Markdown session that keeps files byte-identical where untouched (EDT-10).
 * Rendering lives in packages/ui (block components and the EditorSurface host).
 */
import { Extension, Node, mergeAttributes, type AnyExtension, type Editor } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Strike from "@tiptap/extension-strike";
import HardBreak from "@tiptap/extension-hard-break";
import Link from "@tiptap/extension-link";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";

export { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";
export * from "./find.ts";
import { Find, FIND_ACTIONS } from "./find.ts";

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
}

const registry = new Map<string, BlockRegistration>();
export function registerBlock(b: BlockRegistration): void {
  if (registry.has(b.name)) throw new Error(`Block ${b.name} is already registered`);
  registry.set(b.name, b);
}
export const blocks = (): BlockRegistration[] => [...registry.values()];

registerBlock({ name: "paragraph", title: "block.paragraph", markdown: "native", insertable: true });
registerBlock({ name: "heading", title: "block.heading", markdown: "native", insertable: true, inputRule: "# " });
registerBlock({ name: "bulletList", title: "block.bulletList", markdown: "native", insertable: true, inputRule: "- " });
registerBlock({ name: "orderedList", title: "block.orderedList", markdown: "native", insertable: true, inputRule: "1. " });
registerBlock({ name: "listItem", title: "block.listItem", markdown: "native", insertable: false });
registerBlock({ name: "taskList", title: "block.taskList", markdown: "native", insertable: true, inputRule: "[ ] " });
registerBlock({ name: "taskItem", title: "block.taskItem", markdown: "native", insertable: false });
registerBlock({ name: "blockquote", title: "block.blockquote", markdown: "native", insertable: true, inputRule: "> " });
registerBlock({ name: "codeBlock", title: "block.codeBlock", markdown: "native", insertable: true, inputRule: "```" });
registerBlock({ name: "horizontalRule", title: "block.horizontalRule", markdown: "native", insertable: true, inputRule: "---" });
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

/** Links keep their Markdown title, so opening and saving never drops it. */
export const MarkdownLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), title: { default: null } };
  },
}).configure({ openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https" });

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
export const EDITOR_ACTIONS: Readonly<Record<string, (editor: Editor) => boolean>> = {
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
  "block.paragraph": (e) => e.commands.setParagraph(),
  "block.heading1": (e) => e.commands.toggleHeading({ level: 1 }),
  "block.heading2": (e) => e.commands.toggleHeading({ level: 2 }),
  "block.heading3": (e) => e.commands.toggleHeading({ level: 3 }),
  "block.bulletList": (e) => e.commands.toggleBulletList(),
  "block.orderedList": (e) => e.commands.toggleOrderedList(),
  "block.taskList": (e) => e.commands.toggleTaskList(),
  "block.quote": (e) => e.commands.toggleBlockquote(),
  "block.codeBlock": (e) => e.commands.toggleCodeBlock(),
  ...FIND_ACTIONS,
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
 * Input events outrank selectionchange in Chromium, so a key pressed right after moving the selection
 * (fast typists, macros, a double-click then a shortcut) can arrive before ProseMirror has read it.
 * Commands that act on the selection read it first.
 */
export function syncSelection(editor: Editor): void {
  (editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
}

/** A registry chord ("Mod+Shift+X") as a ProseMirror key name ("Mod-Shift-x"). */
export function toKeyName(chord: string): string {
  const parts = chord.split("+");
  const key = parts.pop()!;
  const NAMES: Record<string, string> = { Plus: "+", Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight" };
  const name = NAMES[key] ?? (key.length === 1 ? key.toLowerCase() : key);
  return [...parts, name].join("-");
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
    const map: Record<string, () => boolean> = {};
    for (const { id, chord } of this.options.bindings) {
      const action = EDITOR_ACTIONS[id];
      if (!action) continue;
      map[toKeyName(chord)] = () => {
        syncSelection(this.editor);
        return action(this.editor);
      };
    }
    return map;
  },
});

/** The schema shared by the editor surface, tests, and (later) the publisher. */
export function coreExtensions(bindings: KeyBinding[] = []): AnyExtension[] {
  return [
    // Strike and line-break keys follow the app keymap (KEY-02), not Tiptap's defaults.
    StarterKit.configure({ underline: false, link: false, trailingNode: false, strike: false, hardBreak: false }),
    Strike.extend({ addKeyboardShortcuts: () => ({}) }),
    HardBreak.extend({
      addKeyboardShortcuts() {
        return { "Shift-Enter": () => this.editor.commands.setHardBreak() };
      },
    }),
    CommandKeymap.configure({ bindings }),
    Find,
    MarkdownLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    RawMarkdown,
    AutoDirection,
    FenceOnEnter,
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

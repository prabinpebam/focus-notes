/**
 * The editor engine (D-01): Tiptap extensions for the schema, the block registry (EXT-01),
 * and the Markdown session that keeps files byte-identical where untouched (EDT-10).
 * Rendering lives in packages/ui (block components and the EditorSurface host).
 */
import { Extension, Node, mergeAttributes, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";

export { parseMarkdown, serializeMarkdown, type Parsed, type PMNode } from "@focus-notes/markdown";

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

/** The schema shared by the editor surface, tests, and (later) the publisher. */
export function coreExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({ underline: false, link: false, trailingNode: false }),
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

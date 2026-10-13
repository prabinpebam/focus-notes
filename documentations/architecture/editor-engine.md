# Editor engine

This page covers the choice of editing framework under the block editor, and the block registry contract that makes components pluggable.

> [!NOTE]
> **TL;DR.** **Proposed:** build on **ProseMirror through Tiptap** for Notion-style editing (schema, transactions, tables, input rules, collaboration-ready model), with our **own Markdown bridge** built on the unified/remark (mdast) ecosystem to guarantee round-trip fidelity. Milkdown is the strongest alternative. A raw `contenteditable` editor like the reference project's is ruled out. This is decision **D-01** and its status is *deciding*.

> [!NOTE]
> Naming: this project's documentation tool is **Slate** (`prabinpebam/slate`). That's unrelated to the **Slate.js** editor framework. To avoid confusion, "Slate" in these docs always means the documentation tool.

## What the engine must provide

| Need | Comes from |
| --- | --- |
| Block-based WYSIWYG with Notion/Loop-style interactions | EDT-02, EDT-06, EDT-07 |
| Lossless Markdown on disk | EDT-01, EDT-10 |
| Real table editing | TBL-* |
| Registering new block types without forking the core | EXT-01, EXT-02, EXT-05 |
| Reliable selection geometry for focus mode | FOC-01, FOC-05 |
| IME, accessibility, undo/redo, paste handling | EDT-08, EDT-09, FOC-06 |
| Same behavior in browsers and Electron (Chromium) | PKG-03 |

## Options considered

| Option | Strengths | Concerns |
| --- | --- | --- |
| **Tiptap (ProseMirror)** *(proposed)* | Mature document model and transaction system. Large extension ecosystem (tables, task lists, input rules, drag handles). Headless, so all UI is ours. | Markdown is not native. It needs a bridge, which we'd build anyway for fidelity. |
| **ProseMirror directly** | Maximum control. No wrapper layer. | Much more boilerplate for the same features. |
| **Milkdown** | Markdown-first by design, ProseMirror plus remark under the hood, plugin-based. | Smaller ecosystem. Its UI conventions are less Notion-like. |
| **BlockNote** | Notion-style blocks, slash menu, and drag handles out of the box. | Its own JSON block format is primary, and Markdown export is described as lossy. That conflicts with "Markdown is the source of truth". |
| **Lexical** | Fast, well-maintained, and has Markdown import/export and table plugins. | Its own node model. Markdown fidelity and the plugin story would need more custom work for our needs. |
| **Raw `contenteditable`** (the reference project's approach) | No dependencies. | Rebuilds selection, undo, IME, and paste from scratch. The reference project's own critique shows the cost. Ruled out. |

## Proposed design

1. **Document model:** a ProseMirror schema whose nodes match the [block table](../experience/editing.md#blocks-and-their-markdown) one-to-one.
2. **Markdown bridge:** parse with remark (CommonMark + GFM + directives) into mdast, then map to ProseMirror nodes. Serialize the other way. Each top-level node keeps the original source text range so untouched blocks are written back verbatim (see [round-trip fidelity](content-model.md#round-trip-fidelity)).
3. **Block registry:** every block, built-in or future, registers the same contract (below). The schema, slash menu, input rules, and Markdown bridge are all built from the registry when the app starts.
4. **UI is ours:** formatting bubble, slash menu, block handle, and table controls are app components styled by theme tokens. No stock editor UI ships.
5. **Focus mode integration:** focus mode subscribes to editor transactions and selection updates, finds the caret's block through the editor model, and measures only that block's line boxes (see [Focus mode](../experience/focus-mode.md#how-the-active-row-is-found)).

## Block registry contract

| Field | Purpose |
| --- | --- |
| `name` | Unique block name (also the directive name for components, such as `image`). |
| `schema` | Node attributes, content expression, and grouping (block, inline, or atom). |
| `view` | How it renders and edits on the canvas (a node view for rich components). |
| `markdown.parse` | Which mdast node(s) or directive it comes from. |
| `markdown.serialize` | How it writes back to Markdown. |
| `inputRules` | Optional Markdown shortcuts that create it (`# `, `- `, …). |
| `slash` | Slash-menu label, keywords, and icon. Omit it to hide the block from the menu. |
| `actions` | Optional entries for the block handle (for example *Replace image*). |
| `focusUnit` | `"row"` (default, follows wrapped lines) or `"block"` (atomic components such as image and gallery, which count as one row). |

Adding the future **image** and **gallery** components then means writing one registration each and their node views. The editor core, focus mode, and the file format stay unchanged.

## Exit criteria for D-01

The choice is confirmed when a spike shows all of the following:

- The round-trip corpus passes (open, save, byte-compare) with the remark bridge.
- Table editing (TBL-01 to TBL-06) works with keyboard only.
- Focus-mode measurement stays within budget on a 10,000-word note.
- Japanese and Korean IME input works in Chromium and Safari.

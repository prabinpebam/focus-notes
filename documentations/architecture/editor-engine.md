# Editor engine

This page covers the editing framework under the block editor, the packages it uses, the licensing rules they follow, and the block registry contract that makes components pluggable.

> [!NOTE]
> **TL;DR.** **Decided (D-01):** the editor is built on **Tiptap**, which runs on ProseMirror. It uses only Tiptap's **MIT-licensed** open-source packages, never the paid Tiptap bundles, because the app itself is MIT (D-20). Markdown comes from `@tiptap/markdown` (MIT) or our own remark bridge, whichever passes the round-trip test corpus in the M0 spike. Find and replace uses the MIT `prosemirror-search`. Every block type registers through one contract, so images and galleries can be added later without touching the core.

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
| Find and replace with formatting kept | FND-01, FND-02 |
| A keyboard command layer for the full keymap | KEY-01 to KEY-06 |
| IME, accessibility, undo/redo, paste handling | EDT-08, EDT-09, FOC-06 |
| Same behavior in Electron (Chromium) and browsers | PKG-03, PKG-05 |
| MIT-compatible licensing throughout | LIC-01, LIC-02 |

## Why Tiptap

| Option | Strengths | Concerns | Outcome |
| --- | --- | --- | --- |
| **Tiptap (ProseMirror)** | Mature document model and transaction system. A large MIT extension set (tables, task lists, drag handle, unique IDs). Headless, so all UI is ours. | Markdown isn't native; needs a bridge. | **Chosen** (owner, 2026-10-13) |
| ProseMirror directly | Maximum control. | Much more boilerplate for the same features. | Not chosen. Tiptap is a thin layer over it, so ProseMirror plugins still work. |
| Milkdown | Markdown-first. | Smaller ecosystem. | Not chosen |
| BlockNote | Notion-style blocks out of the box. | Its JSON format is primary and its Markdown export is lossy. | Not chosen |
| Lexical | Fast, with Markdown and table plugins. | Its own node model; more work to get Markdown right. | Not chosen |
| Raw `contenteditable` (the reference project) | No dependencies. | Rebuilds selection, undo, IME, and paste. | Ruled out |

## Licensing

Tiptap's core and its open-source extensions are MIT. In 2025 Tiptap moved ten formerly paid extensions to MIT, including **DragHandle**, **UniqueID**, **FileHandler**, **Details**, **TableOfContents**, **InvisibleCharacters**, **Emoji**, and **Mathematics**. Tiptap's paid offerings (Collaboration, Content AI, Conversion, and Documents/Cloud) are proprietary and are **excluded**. Exact licenses are checked again in CI (LIC-02) at every dependency change, so these docs don't have to be relied on.

| Package | Used for | License |
| --- | --- | --- |
| `@tiptap/core`, `@tiptap/pm` | Editor core and the ProseMirror packages it bundles | MIT |
| `@tiptap/starter-kit` | Paragraphs, headings, lists, quote, code block, bold, italic, strike, code, history | MIT |
| `@tiptap/extension-table` (and row, cell, header) | Table editing | MIT |
| `@tiptap/extension-task-list`, `-task-item` | Task lists | MIT |
| `@tiptap/extension-link`, `-placeholder`, `-typography` | Links, empty-note placeholder, smart punctuation | MIT |
| `@tiptap/extension-drag-handle` | Block handle (EDT-07) | MIT (open-sourced 2025) |
| `@tiptap/extension-unique-id` | Stable block IDs for "copy link to block" and focus mode | MIT (open-sourced 2025) |
| `@tiptap/markdown` | Candidate Markdown bridge | MIT |
| `remark`, `remark-gfm`, `remark-directive` (unified) | Alternative Markdown bridge and plain-text extraction | MIT |
| `prosemirror-search` | Find and replace (FND-01, FND-02) | MIT |

The full allow-list and deny-list are in [Decisions → Licensing policy](../plan/decisions.md#licensing-policy-d-20-details).

## Design

1. **Document model:** a ProseMirror schema, defined through Tiptap extensions, whose nodes match the [block table](../experience/editing.md#blocks-and-their-markdown) one-to-one.
2. **Markdown bridge:** the M0 spike runs the [round-trip corpus](content-model.md#round-trip-fidelity) through both `@tiptap/markdown` and a remark/mdast bridge. Whichever passes, keeping untouched blocks byte for byte, is chosen. If both pass, `@tiptap/markdown` wins because it means less code to maintain. Either way, each top-level node remembers where its source text was, so untouched blocks are written back verbatim.
3. **Block registry:** every block, built-in or future, registers the same contract (below). The schema, slash menu, input rules, Spotlight commands, and Markdown bridge are all built from the registry when the app starts.
4. **UI is ours:** formatting bubble, slash menu, block handle, table controls, and find bar are app components styled by theme tokens. No stock editor UI ships.
5. **Command layer:** Tiptap's default keyboard shortcuts are turned off and replaced by the app's command and keybinding service, so every key follows the [keymap](../experience/keyboard-shortcuts.md) and its contexts. Editor commands are registered as app commands, which puts them in Spotlight automatically.
6. **Focus mode integration:** focus mode subscribes to editor transactions and selection updates, resolves the selection's endpoint blocks through the editor model, and measures their whole paragraph bounds (see [Focus mode](../experience/focus-mode.md#how-the-active-paragraph-is-found), D-232). While the find bar is open it follows the current match instead.

## Block registry contract

| Field | Purpose |
| --- | --- |
| `name` | Unique block name (also the directive name for components, such as `image`). |
| `schema` | Node attributes, content expression, and grouping (block, inline, or atom). |
| `view` | How it renders and edits on the canvas: a [block component](../design/system/components.md#block-components) from the design system, used as the node view and by the publisher. |
| `markdown.parse` | Which mdast node(s) or directive it comes from. |
| `markdown.serialize` | How it writes back to Markdown. |
| `inputRules` | Optional Markdown shortcuts that create it (`# `, `- `, …). |
| `slash` | Its slash-menu rows (built in WP-1.3): each an `id`, a `title` message key (synonyms and hint in `slash.keywords.<id>` and `slash.hint.<id>`), a `group` (text, lists, or insert), an `icon`, its `markdown` shortcut, and an `insert` command that's also dry-run to offer only rows valid at the caret. Omit it to hide the block from the menu. The app receives the rows when it mounts, so a new registration appears in the menu with no other change. |
| `commands` | Named commands with default keybindings and `when` contexts (for example `block.turnInto.heading1`, <kbd>⌥⌘1</kbd>). These also appear in Spotlight. |
| `actions` | Optional entries for the block handle (for example *Replace image*). |
| `searchText` | How to get the block's visible text for find and Spotlight (defaults to its text content). |
| `focusUnit` | `"row"` (default, follows wrapped lines) or `"block"` (atomic components such as image and gallery, which count as one row). |

Adding the future **image** and **gallery** components then means writing one registration each and their node views. The editor core, focus mode, find, Spotlight, and the file format stay unchanged.

## Spike exit criteria (M0)

- The round-trip corpus passes (open, save, byte-compare) with the chosen Markdown bridge.
- Table editing (TBL-01 to TBL-06) works with keyboard only.
- Focus-mode measurement stays within budget on a 10,000-word note.
- Japanese and Korean IME input works in Electron (Chromium) and Safari.
- The license check passes on the full dependency tree.

# Editing

Editing works like Notion or Microsoft Loop: a WYSIWYG, block-based surface where Markdown syntax turns into formatting as you type. Every edit saves as plain Markdown.

> [!NOTE]
> **TL;DR.** Documents are a sequence of **blocks** (paragraph, heading, list, task, quote, code, divider, table, and future components). Formatting comes from shortcuts, Markdown input rules, a selection **bubble**, and a **slash menu**. Tables get real row and column editing but always save as GFM pipe tables. Every block type is a registered plugin, so images and galleries can be added later without touching the editor core. Covers EDT-*, TBL-*, and EXT-* in the [requirements](../product/requirements.md).

## Blocks and their Markdown

Every block maps to exactly one Markdown construct. That mapping is the contract that keeps notes portable (EDT-01, EDT-10).

| Block | Created by | Saved as |
| --- | --- | --- |
| Paragraph | Default | Plain text, separated by blank lines |
| Heading 1 to 3 | `# `, `## `, `### ` or `/h1` to `/h3` | `#`, `##`, `###` |
| Bulleted list | `- ` or `* ` | `- item` |
| Numbered list | `1. ` | `1. item` |
| Task list | `[] ` or `[ ] ` | `- [ ] item` / `- [x] item` |
| Quote | `> ` | `> text` |
| Code block | ```` ``` ```` (optionally with a language) | Fenced code block with language |
| Divider | `---` | `---` |
| Table | `/table`, or typing a GFM header row | GFM pipe table |
| Component (future) | `/image`, `/gallery`, … | Directive syntax (see [Content model](../architecture/content-model.md#components)) |

Lists nest with <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd>. Pressing <kbd>Enter</kbd> on an empty list item exits the list. <kbd>Backspace</kbd> at the start of a heading, quote, or list item turns it back into a paragraph.

## Inline formatting

| Format | Shortcut | Input rule | Saved as |
| --- | --- | --- | --- |
| Bold | <kbd>Ctrl/Cmd</kbd>+<kbd>B</kbd> | `**text**` | `**text**` |
| Italic | <kbd>Ctrl/Cmd</kbd>+<kbd>I</kbd> | `*text*` or `_text_` | `*text*` |
| Strikethrough | <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | `~~text~~` | `~~text~~` |
| Inline code | <kbd>Ctrl/Cmd</kbd>+<kbd>E</kbd> | `` `code` `` | `` `code` `` |
| Link | <kbd>Ctrl/Cmd</kbd>+<kbd>K</kbd> (with nothing selected, it inserts a new link at the caret) | `[text](url)`, or paste a URL over selected text | `[text](url)` |

Underline, text color, and highlight aren't offered because CommonMark/GFM can't represent them. Adding them would break the "Markdown is the source of truth" principle (see [Vision](../product/vision.md)). The full keymap, including block, table, and pro shortcuts, is on [Keyboard shortcuts](keyboard-shortcuts.md).

## Contextual controls

- **Contextual formatting toolbar.** Appears just above any non-empty selection with *Turn into ▾*, Bold, Italic, Strikethrough, Code, and Link. It never covers the selection, hides when typing resumes, and is reachable with <kbd>⌥F10</kbd> / <kbd>Alt+F10</kbd> (EDT-12).
- **Slash menu.** Typing `/` at the start of a block or after a space opens a filterable list of the registered blocks that are valid at the caret (EDT-06). The list comes from the block registry, so new components show up on their own. Arrows, <kbd>Enter</kbd>, and <kbd>Tab</kbd> work while you keep typing, and <kbd>Esc</kbd> keeps what you typed. It never opens in code.
- **Block handle.** On hover or keyboard focus, a handle appears in the left margin. Drag it to reorder; click it for Duplicate, Delete, Turn into, and Copy link to block (EDT-07).

All three use the theme's surface tokens and stay quiet. None of them appear while you're just typing, which keeps the [blank-canvas](main-ui.html) promise. The detailed design (anatomy, placement, states, keyboard, and rationale) is in [Text formatting](../design/components/text-formatting.html).

## Tables

Tables are edited the way Microsoft Loop tables are: hover + insertion points, row and column handles with menus, drag to reorder, and drag to select cells. They always save as GFM pipe tables, so they stay readable on GitHub and in any Markdown viewer. The full design is in [Tables](../design/components/tables.html). In summary:

| Interaction | Behavior |
| --- | --- |
| Insert | `/table` (or "grid", "columns") inserts a 3 &times; 3 table with a header row, the caret in its first cell. Typing a GFM header row and then its delimiter row converts them on <kbd>Enter</kbd>, the caret in the first body cell (TBL-01). |
| Move between cells | <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd>. <kbd>Tab</kbd> in the last cell adds a row. <kbd>Enter</kbd> and <kbd>Shift</kbd>+<kbd>Enter</kbd> move down and up; <kbd>Enter</kbd> in the last row leaves the table onto a new line. Arrow keys cross cell edges at the start or end of a cell's text (TBL-03). |
| Rows and columns | Hovering near a row or column boundary on the table's edge shows a + insertion point, and New row and New column bars show along the bottom and right edges (TBL-07). Row and column handles open menus and drag to reorder (TBL-08). <kbd>Mod</kbd>+<kbd>Enter</kbd> adds a row, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> moves it, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> deletes it. |
| Keyboard | <kbd>Esc</kbd> selects the cell (cell selection mode), <kbd>Shift</kbd>+arrows extend the range, and <kbd>Shift</kbd>+<kbd>F10</kbd> or the Menu key opens the cell menu with every row and column action, so nothing needs the pointer. |
| Alignment | The column menu's Align sets left, center, or right, saved as `:---`, `:---:`, `---:`. Sorting comes with WP-8.1 (TBL-04). |
| Cell content | Inline formatting only, from the toolbar (which has marks only in a table) or the shortcuts (TBL-05). A cell holds one line: <kbd>Enter</kbd> moves down, and a line break that arrives some other way becomes a space, because a GFM cell can't hold line breaks or paragraphs (UNSUP-TABLE-01, TBL-06). |
| Header row | Always present (GFM requires one). It can be emptied but not removed or moved, and nothing goes above it. A table always keeps one body row. |
| Cell ranges | Drag across cells, <kbd>Shift</kbd>+click, or a handle selects a range, rows, or columns to format, clear (<kbd>Backspace</kbd>), copy, or delete (TBL-11). Copying gives tab-separated text, HTML, and a Markdown table. |
| Delete table | Through the table handle's menu or the cell menu. Deleting the last column deletes the table too. Undo brings any of it back. |
| Paste | A spreadsheet range (its HTML table, or tab-separated text) fills cells from the active cell and grows the table, in one undo step; on a line of its own it becomes a table. An HTML table or GFM text pasted outside a table becomes a table (TBL-10). |

## Paste and drop

Pasting and dropping text work the same way (EDT-09, SEC-02):

1. **Markdown text** is parsed into blocks: headings, lists, tasks, quotes, code, links, and marks. One line pasted between words joins them.
2. **HTML** (from browsers, Word, and Google Docs) is sanitized first, then converted to the nearest Markdown: headings, nested lists (Word's list paragraphs too), quotes, code blocks with their language, links, bold, italic (including Docs' styled text), strikethrough, and inline code. Other styling is dropped. HTML that's only styled text, like Markdown copied from a code editor, is read as Markdown.
3. **Anything not supported yet** degrades to plain text, never to a read-only block (footnotes, for example). Tables are tables (TBL-10; until WP-1.5 they became their GFM text). Raw HTML stays text.
4. **Images** are left out with a message ("Images can't be added to notes yet, so they were left out.") until the image component ships (EXT-03). An image's alt text is kept. They're never dropped silently.
5. **Links** keep only safe addresses: http, https, mailto, and relative ones. Others become plain text.
6. **<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>** pastes plain text exactly as it is, one paragraph per line, with Markdown characters kept as characters. Pasting into a code block is always plain.
7. **Copying within Focus Notes** keeps the exact structure.

## Undo, redo, and saving

- **Undo and redo** (<kbd>Ctrl/Cmd</kbd>+<kbd>Z</kbd>, <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) cover typing, formatting, structural edits, and table operations. Typing is grouped into word-sized steps (EDT-08).
- **Saving** is automatic (EDT-11, D-133). The note is written to disk within a second of the last change. It's backed up (committed and pushed) on *Save to cloud*, on quit, and on its own by how much changed: after a minute's pause once 200 characters changed, after 10 s for big changes, and never more than about 30 minutes late; switching notes backs up only when that much changed. That way history stays readable instead of having a commit for every pause. In the browser, a note written there is saved to that browser within a second, and nothing is committed (D-90). Saves don't interrupt: the bottom-left pill's icon shows whether the note is saved here or backed up (D-132), and failures also surface through the trigger's save-problem state (see [Main UI](main-ui.html#states)). <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> is *Save to cloud*, like <kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd>. The mechanics are in [Desktop and Git](../architecture/desktop-and-git.md#save-and-sync).
- **Find and replace** in the note, and across all notes, is described on [Find and replace](find-and-replace.md).
- **Round-trip fidelity.** Opening and closing a note without edits writes nothing. Saving after an edit only changes the lines that were edited, as far as the serializer allows (EDT-10). See [Content model](../architecture/content-model.md#round-trip-fidelity).

## Extending with components

The seed asks for room to add special components later (image, gallery, …). The editor is built around a **block registry** (EXT-01): built-in blocks register through the same API a future image or gallery block would use. A registration declares:

- the block's **schema** (attributes and allowed content);
- its **view** (how it renders and edits on the canvas);
- **Markdown parse and serialize** rules;
- a **slash-menu entry** (label, keywords, icon);
- optional **toolbar or handle actions**.

Unknown component syntax in a file is kept byte-for-byte and shown as a read-only placeholder, so opening a note in an older app version never destroys content (EXT-05). The engine-level design is in [Editor engine](../architecture/editor-engine.md).

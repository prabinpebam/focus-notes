# Requirements

This catalogue turns the [seed spec](../seed-specs.md) into testable requirements. Every requirement has a stable ID, a priority, the seed line it comes from, and the page that specifies it in detail.

> [!NOTE]
> **TL;DR.** 56 requirements in 10 areas. **P0** means the first usable release, **P1** follows soon after, and **Later** marks planned extension points. Requirements marked *(derived)* aren't stated in the seed but are needed to meet a seed requirement, and each one says which.

## Priority legend

| Priority | Meaning |
| --- | --- |
| **P0** | Needed for the first usable release (see [Roadmap](../plan/roadmap.md) M1 to M4). |
| **P1** | Needed for the full vision. Ships after P0. |
| **Later** | Extension point. The architecture must allow it, but it isn't built yet. |

## Text editing (EDT)

Seed: *"a simple text editor that works with markdown… very similar to how Notion or Microsoft Loop does text editing."* Detailed in [Editing](../experience/editing.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| EDT-01 | Notes are stored as Markdown (CommonMark + GitHub-flavored tables, task lists, strikethrough). | P0 |
| EDT-02 | Editing is WYSIWYG and block-based (Notion/Loop style). Raw Markdown syntax isn't shown while editing. | P0 |
| EDT-03 | Inline formatting: bold, italic, strikethrough, inline code, and links. Applied with shortcuts, the formatting bubble, or Markdown input rules (for example `**text**`). | P0 |
| EDT-04 | Block types: paragraph, headings H1 to H3, bulleted, numbered, and task lists, quote, code block, divider. | P0 |
| EDT-05 | Markdown shortcuts at the start of a block convert it (`# `, `- `, `1. `, `[] `, `> `, ```` ``` ````, `---`). | P0 |
| EDT-06 | Slash menu (`/`) to insert any registered block type. | P0 |
| EDT-07 | Block handle to drag-reorder, duplicate, delete, and turn a block into another type. | P1 |
| EDT-08 | Undo and redo across all edits, including table and structural edits. | P0 |
| EDT-09 | Paste: Markdown text is parsed into blocks; HTML is converted to the nearest supported Markdown; unsupported content degrades to plain text. | P0 |
| EDT-10 | Round-trip fidelity: opening and saving a note without edits doesn't change the file (see [Content model](../architecture/content-model.md)). | P0 |
| EDT-11 | Autosave with a visible but unobtrusive saved/unsaved state. *(derived from EDT-01 and FIL-*)* | P0 |

## Table editing (TBL)

Seed: *"table editing capabilities."* Detailed in [Editing → Tables](../experience/editing.md#tables).

| ID | Requirement | Priority |
| --- | --- | --- |
| TBL-01 | Insert a table from the slash menu or by typing a GFM header row. | P0 |
| TBL-02 | Add, delete, and reorder rows and columns from contextual controls. | P0 |
| TBL-03 | Keyboard navigation: Tab and Shift+Tab move between cells; Tab in the last cell adds a row. | P0 |
| TBL-04 | Column alignment (left, center, right), saved as GFM alignment markers. | P1 |
| TBL-05 | Inline formatting inside cells. | P0 |
| TBL-06 | Tables are saved as GFM pipe tables. Content Markdown can't represent (multiple paragraphs in one cell) is prevented in the UI. | P0 |

## Extensibility (EXT)

Seed: *"Special components can be added later… make it scalable… image, gallery etc."* Detailed in [Editor engine](../architecture/editor-engine.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| EXT-01 | Every block type, built-in ones included, is registered through one block registry (schema, view, Markdown parse/serialize, slash-menu entry). | P0 |
| EXT-02 | Custom components are saved in a documented Markdown extension syntax that stays readable in plain Markdown viewers. | P0 |
| EXT-03 | Image block. | Later |
| EXT-04 | Gallery block. | Later |
| EXT-05 | Unknown component syntax is kept verbatim and shown as a read-only placeholder, never dropped. | P0 |

## Main UI (UI)

Seed: *"entire UI is blank except for a red 10px circle enclosed by a frosted circle of 30px radius at the top center… trigger for opening a minimal toolbar."* Detailed in [Main UI and trigger](../experience/main-ui.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| UI-01 | The default UI shows only the document and the trigger. No sidebars, title bars, or status bars stay visible. | P0 |
| UI-02 | Trigger: a red dot 10 px in diameter, centered in a frosted (backdrop-blurred, translucent) circle with a 30 px radius, fixed at the top center. | P0 |
| UI-03 | Activating the trigger (click, tap, Enter or Space, or a global shortcut) opens the minimal toolbar. Esc or clicking outside closes it. | P0 |
| UI-04 | The toolbar holds app-level actions only: files, new note, focus mode, theme, share, settings. | P0 |
| UI-05 | The trigger and toolbar are fully keyboard- and screen-reader-accessible. | P0 |
| UI-06 | Inline formatting UI (bubble, slash menu, block handle) shows up only in context and disappears when unused. | P0 |

## Focus mode (FOC)

Seed: *"Only the row where the text-cursor/caret-position is is highlighted and the rest are subdued."* Detailed in [Focus mode](../experience/focus-mode.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FOC-01 | With focus mode on, the visual row that holds the caret is at full strength and all other content is subdued. | P0 |
| FOC-02 | The highlighted row follows the caret after typing, clicks, arrow keys, selection changes, paste, scrolling, and resize. | P0 |
| FOC-03 | Focus mode can be toggled from the toolbar and with a keyboard shortcut. The setting persists. | P0 |
| FOC-04 | Respects `prefers-reduced-motion`. Row changes aren't animated when it is set. | P0 |
| FOC-05 | Updates are batched to one per animation frame, and typing doesn't drop frames on long documents. | P0 |
| FOC-06 | Defined behavior for multi-row selections, empty documents, tables, IME composition, and editor blur. | P0 |

## Files and folders (FIL)

Seed: *"CRUD files and folders, including moves."* Detailed in [Files and sharing](../experience/files-and-sharing.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FIL-01 | Create, rename, and delete notes. | P0 |
| FIL-02 | Create, rename, and delete folders, including nested ones. | P0 |
| FIL-03 | Move notes and folders between folders (drag-and-drop and a "Move to…" picker). | P0 |
| FIL-04 | Quick open: fuzzy search notes by title or path. | P1 |
| FIL-05 | Every file operation is a Git commit with a readable message. Deletes can be recovered from history. | P0 |
| FIL-06 | Moving a note between public and private changes its storage repository (see SHR-02). | P0 |

## Sharing and visibility (SHR)

Seed: *"Sharing of public links… content can be made public or private… Private content are hosted in a private repo which is a submodule."* Detailed in [Files and sharing](../experience/files-and-sharing.md) and [Repository and publishing](../architecture/repository-and-publishing.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| SHR-01 | Every note is either **public** or **private**. New notes are private by default. *(derived: safe default)* | P0 |
| SHR-02 | Public notes are stored in the public repository; private notes are stored in the private content repository, mounted as a submodule. | P0 |
| SHR-03 | A public note has a stable, read-only public URL on GitHub Pages. "Copy link" in the toolbar copies it. | P0 |
| SHR-04 | Private notes are never published in plaintext. | P0 |
| SHR-05 | A private note can be shared with a specific person through an expiring, revocable link (sealed content plus a key in the URL fragment). | P1 |

## Theming (THM)

Seed: *"ability to change theme — Colors, fonts."* Detailed in [Theming](../experience/theming.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| THM-01 | All UI and content colors come from semantic design tokens. | P0 |
| THM-02 | Built-in Light and Dark themes, plus "System" (follows the OS). | P0 |
| THM-03 | The writer can change the content font (serif, sans, mono, or a custom stack) and size. | P0 |
| THM-04 | Themes are JSON documents, and custom themes can be added without code changes. | P1 |
| THM-05 | Theme choice persists per device and syncs through the repository if the writer opts in. | P1 |

## Packaging and distribution (PKG)

Seed: *"managed as a github repo… hosted in github pages… web or an electron app."* Detailed in [Architecture overview](../architecture/overview.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| PKG-01 | One GitHub repository holds the app source, public content, and documentation. | P0 |
| PKG-02 | The web app is built and deployed to GitHub Pages by GitHub Actions. | P0 |
| PKG-03 | An Electron desktop app wraps the same web build, with native file-system and Git access. | P1 |
| PKG-04 | Developers without access to the private repository can still build and run the app. | P0 |

## Documentation (DOC)

Seed: *"Use slate for documentation."*

| ID | Requirement | Priority |
| --- | --- | --- |
| DOC-01 | Project documentation is a Slate host in `documentations/`, with Slate pinned as the `slate/` submodule. | P0 |
| DOC-02 | `seed-specs.md` is human-authored and is never edited or deleted by tooling or agents. | P0 |

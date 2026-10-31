# Requirements

This catalogue turns the [seed spec](../seed-specs.md) and the owner's later decisions ([Decisions](../plan/decisions.md), 2026-10-13) into testable requirements. Every requirement has a stable ID, a priority, the source it comes from, and the page that specifies it in detail. Requirements are the bottom link of [the articulation chain](spec/chain.md): each one is listed against the [user-can](spec/user-can.md) capabilities it builds, which trace up through [scenarios](spec/scenarios.md) to the [customer promises](spec/customer-promises.md).

> [!NOTE]
> **TL;DR.** 225 requirements in 26 areas. **P0** means the first usable release of its channel (the web app, then the desktop app), **P1** follows soon after, and **Later** marks planned extension points. Requirements marked *(derived)* aren't stated by the owner but are needed to meet one of their requirements, and each one says which. The owner's 2026-10-13 decisions added the desktop window and title bar (DSK), first run and sign-in (FRE), keyboard shortcuts (KEY), find and replace (FND), Spotlight (SPT), and licensing (LIC).

## Priority legend

| Priority | Meaning |
| --- | --- |
| **P0** | Needed for version 1.0: stages M0, M1, MW, M3, M2, M4, and M5, in that order. The browser keeps its own notes and reads the instance; the desktop app is what saves to GitHub (see [Roadmap](../plan/roadmap.md), D-85, D-90). |
| **P1** | Needed for the full vision. Ships after P0. |
| **Later** | Extension point. The architecture must allow it, but it isn't built yet. |

## Text editing (EDT)

Seed: *"a simple text editor that works with markdown… very similar to how Notion or Microsoft Loop does text editing."* Detailed in [Editing](../experience/editing.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| EDT-01 | Notes are stored as Markdown (CommonMark + GitHub-flavored tables, task lists, strikethrough). | P0 |
| EDT-02 | Editing is WYSIWYG and block-based (Notion/Loop style). Raw Markdown syntax isn't shown while editing. The whole document viewport accepts caret placement at the clicked visual row, including blank margins; below the document it places the caret at the end without adding a paragraph. A plain click in the left margin selects the aligned text block (block-selection mode) with the caret at the start of that row; a click in the right margin puts the caret at the end of that row; a drag that starts in a margin or above or below the document selects text from where it started; Shift+click extends the text selection instead. Controls, scrollbars and normal clicks inside the text retain their own behavior. | P0 |
| EDT-03 | Inline formatting: bold, italic, strikethrough, inline code, and links. Applied with shortcuts, the formatting bubble, or Markdown input rules (for example `**text**`). | P0 |
| EDT-04 | Block types: paragraph, headings H1 to H3, bulleted, numbered, and task lists, quote, code block, divider. | P0 |
| EDT-05 | Markdown shortcuts at the start of a block convert it (`# `, `- `, `1. `, `[] `, `> `, ```` ``` ````, `---`). | P0 |
| EDT-06 | Slash menu (`/`) to insert any registered block type. | P0 |
| EDT-07 | Block handle to drag-reorder, duplicate, delete, and turn a block into another type. | P1 |
| EDT-08 | Undo and redo across all edits, including table and structural edits. | P0 |
| EDT-09 | Paste: Markdown text is parsed into blocks; HTML is converted to the nearest supported Markdown; unsupported content degrades to plain text. | P0 |
| EDT-10 | Round-trip fidelity: opening and saving a note without edits doesn't change the file (see [Content model](../architecture/content-model.md)). | P0 |
| EDT-11 | Saving happens on its own (write to disk within 1 s; backed up (committed and pushed) on *Save to cloud*, on quit, and on its own by how much changed: after a 60 s pause once 200 characters changed or the first change is 10 minutes old, after a 10 s pause once 2,000 changed or a change has waited 30 minutes, and on switching or closing a note only when one of those is met). Its state is shown calmly as the bottom-left pill's icon: saved here, not backed up yet, backing up, backed up, offline, or a problem, without taking focus. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, like <kbd>Mod</kbd>+<kbd>S</kbd>, is *Save to cloud*. Only problems and an explicit *Save to cloud*'s result are announced. *(derived from EDT-01 and FIL-*; when it backs up in D-133, which supersedes D-23's cadence; what it shows in D-132)* | P0 |
| EDT-12 | A contextual formatting toolbar appears on any non-empty text selection: Turn into, Bold, Italic, Strikethrough, Code, Link. It never covers the selection and can be used from the keyboard (<kbd>⌥F10</kbd> / <kbd>Alt+F10</kbd>). See [Text formatting](../design/components/text-formatting.html). | P0 |
| EDT-13 | Link editor and link hover card: create, edit, open, copy, and remove links in place. Pasting a URL over selected text makes a link. Links stay on Mod+K everywhere; Rewrite has its own key (KEY-08, D-256). | P0 |
| EDT-14 | Right-clicking text opens a menu with the platform's full set of text actions, from one model on every platform: the OS spell checker's suggestions and *Add to dictionary*, Undo and Redo (the editor's own history), Cut, Copy, Paste, *Paste as plain text*, Delete, Select all, a link's *Copy link* and *Open link*, and the platform's own items (Windows: Emoji; macOS: Look Up, Speech, Emoji & Symbols). Each item is disabled when it can't act and shows its real shortcut. On Windows and Linux the app draws it in the theme (every theme, light and dark, forced colors), answering within a frame; on macOS it's the system's menu in the app's light or dark appearance. *(D-204, amends D-193)* | P1 |

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
| TBL-07 | Hover insertion points: a + appears at the row or column boundary nearest the pointer on the table's edge, plus "New row" and "New column" bars on the bottom and right edges. See [Tables](../design/components/tables.html). | P0 |
| TBL-08 | Row and column handles: click for a menu (insert, move, align, clear, delete), drag to reorder. | P0 |
| TBL-09 | Sort the body rows by a column (A→Z, Z→A, natural order) as a one-time, undoable reorder. | P1 |
| TBL-10 | Pasting a spreadsheet range creates a table, or fills existing cells from the active cell and grows the table to fit. | P0 |
| TBL-11 | Select a range of cells, whole rows, or whole columns to format, clear, copy (as tab-separated text, Markdown, and HTML), or delete. | P0 |

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

Seed: *"entire UI is blank except for a red 10px circle enclosed by a frosted circle of 30px radius at the top center… trigger for opening a minimal toolbar."* The owner later confirmed both sizes are **diameters** (D-03) and capped the toolbar at six entries (D-26). Detailed in [Main UI and trigger](../experience/main-ui.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| UI-01 | The default UI shows only the document and the trigger, plus the document minimap's quiet heading rail when a note has two or more headings (UI-13, D-185). No sidebars, visible title bars, or status bars. | P0 |
| UI-02 | Trigger: a red dot 10 px in diameter, centered in a frosted (backdrop-blurred, translucent) circle 30 px in diameter, fixed at the top center. Its invisible hit area is at least 44 &times; 44 px. | P0 |
| UI-03 | Activating the trigger (click, tap, Enter or Space, or a global shortcut) opens the minimal toolbar. Esc or clicking outside closes it. | P0 |
| UI-04 | The toolbar shows **at most six** actions. Every other action is in a ⋯ (more) menu as the seventh item. | P0 |
| UI-05 | The trigger, toolbar, and ⋯ menu are fully keyboard- and screen-reader-accessible. | P0 |
| UI-06 | Inline formatting UI (bubble, slash menu, block handle) shows up only in context and disappears when unused. | P0 |
| UI-07 | The six default toolbar actions are New note, Open, Search, Save, Focus, Theme. The ⋯ menu holds at least font size (larger, smaller, reset), full screen, find, find and replace, share and visibility, settings, keyboard shortcuts, and help (D-18). | P0 |
| UI-08 | The writer can choose which six actions are pinned to the toolbar. The rest go into ⋯ automatically. | P1 |
| UI-09 | Scrollbars are minimal: no arrow buttons, a thin rounded thumb that is hidden at rest and appears only while scrolling or while the pointer is over the scrollbar edge. Space for it is always reserved, so text never moves when it appears or hides (D-73). | P0 |
| UI-10 | The trigger sits 40 px below the window's top edge. On hover the red dot grows to fill its frosted circle. Opening the toolbar morphs the circle into the toolbar (the dot shrinks and fades, the buttons fade in after the shape settles), and closing reverses it. No motion with reduced motion (D-78). | P0 |
| UI-11 | Reading zone: text is read and written in the band between 25% and 65% of the window height. A note starts 25% down, the last line can scroll up to leave 35% below it, and the line being edited is scrolled back into the band whenever it leaves it (D-78). | P0 |
| UI-12 | In the desktop app, an icon-only save indicator with a permanently visible circular wrapper appears wherever a note is open, signed in or not; no username appears beside it. Hovering opens a details card without taking focus; keyboard users can open and use the same card. It shows the current save/backup state, the last recorded backup (or explicitly that none is recorded in this session), and *Backup to GitHub*. The circular border spins during backup, stays still with reduced motion, and the card updates live, including when opened mid-backup. The control moves clear of docked Files; in a narrow window without side clearance it moves above the sheet. Sign-out remains in Settings. In the browser the existing *Unlock*, owner, *Lock* and *Forget this browser* controls are unchanged (D-89, D-90, D-132). | P0 |
| UI-13 | Document minimap: when a note has two or more top-level headings, a rail of 2 px bars (one per heading, shorter for deeper levels, evenly spaced) sits on the note's right edge clear of the scrollbar, the current section's bar bright. The current section is the caret's while it's in view (until the wheel or the scrollbar scrolls the note), otherwise the last heading at or above the reading zone's top line, or the last heading in view when scrolled to the end. Hovering the rail for 150 ms opens a contents card in its place without taking focus: every heading indented by level, at most two lines each, the current one accented and marked `aria-current="location"`. Choosing a heading moves the caret to it and glides it to the reading zone's top over 200 ms with the reading zone's own scroll (D-156; at once with reduced motion). The card closes 200 ms after the pointer leaves the rail and card, or on Esc. *Show contents* opens it from the keyboard with focus on the current heading (arrows, Home, End, Enter, Esc). The rail hides only where it would overlap the text (it stays in focus mode, on by default); the heading list updates after typing pauses, never on the keystroke (D-185). A button in the card (*Dock contents*, also a command) docks it flush to the window's right edge, top to bottom (its content below the title band, the window's controls shown on it), at the card's width, the note's area beside it, resizable from its inner edge (200 to 480 px) and kept per device; the button on the first heading's row, the current heading live (D-186, D-187). Docked Files is on the left the same way; where the window can't hold both and the note's 400 px, Files undocks first, then the contents go back to the rail; wider, they dock again (D-187). | P1 |

## Focus mode (FOC)

Seed: *"Only the row where the text-cursor/caret-position is is highlighted and the rest are subdued."* The owner changed the unit to the entire current paragraph on 29 October (D-232); the seed remains unchanged. Detailed in [Focus mode](../experience/focus-mode.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FOC-01 | With focus mode on, the entire paragraph that holds the caret is at full strength, including wrapped lines and hard breaks; content outside its full-width band is subdued. | P0 |
| FOC-02 | The highlighted paragraph follows the caret after typing, clicks, arrow keys, selection changes, paste, scrolling, and resize. Moving within a paragraph keeps its whole band bright. | P0 |
| FOC-03 | Focus mode can be toggled from the toolbar and with a keyboard shortcut. The setting persists. | P0 |
| FOC-04 | Respects `prefers-reduced-motion`. Band changes aren't animated when it is set. | P0 |
| FOC-05 | Updates are batched to one per animation frame, and typing doesn't drop frames on long documents. | P0 |
| FOC-06 | Defined behavior for multi-paragraph selections, empty documents, tables, IME composition, and editor blur. | P0 |

## Files and folders (FIL)

Seed: *"CRUD files and folders, including moves."* Detailed in [Files and sharing](../experience/files-and-sharing.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FIL-01 | Create, rename, and delete notes. | P0 |
| FIL-02 | Create, rename, and delete folders, including nested ones. | P0 |
| FIL-03 | Move notes and folders between folders (drag-and-drop and a "Move to…" picker). | P0 |
| FIL-04 | Quick open: fuzzy search notes by title or path (<kbd>Mod</kbd>+<kbd>P</kbd>, part of [Spotlight](../experience/spotlight.html)). | P0 |
| FIL-05 | Every file operation is a Git commit with a readable message. Deletes can be recovered from history. | P0 |
| FIL-06 | Moving a note between public and private changes its storage repository (see SHR-02). | P0 |
| FIL-07 | A note's file name follows its title until the note is first published, then stays fixed unless renamed on purpose. See [Files panel](../design/views/files.html). | P0 |
| FIL-08 | Multi-select in the Files panel (<kbd>Mod</kbd>/<kbd>Shift</kbd>+click, <kbd>Shift</kbd>+arrows), with move, delete, and visibility changes applied as one commit. | P0 |
| FIL-09 | Renaming or moving notes and folders updates relative links in other notes in the same commit. | P0 |
| FIL-10 | Recently deleted: notes deleted in the last 30 days, found from Git history, can be restored in place or to a chosen folder. | P0 |
| FIL-11 | Sort the tree by name or last change. Duplicate a note. | P1 |
| FIL-12 | Conflict resolver: when sync finds the same note changed elsewhere, show both versions and offer keep mine, take theirs (keeping a recoverable copy of mine), or keep both. | P0 |
| FIL-13 | Note history: a note's versions from Git, with time and author (agent changes labeled), comparison, and restore as a new commit. | P1 |
| FIL-14 | Backup by repository: each Files section (Private, Public) shows its repository's backup state at its heading's trailing end, counting what waits there, folders included (empty ones too), and its card backs up everything waiting in that repository's notes on request, keeping empty folders with a `.gitkeep` (D-191). | P1 |
| FIL-15 | Import files: a folder's or section's menu imports Markdown, text, HTML and Word (`.docx`) files as new notes in it, as one batch with Undo, numbering a taken name and replacing nothing. Only the shell reads the files; HTML and Word are read as a paste is (sanitized, images left out) (D-210). | P1 |

## Sharing and visibility (SHR)

Seed: *"Sharing of public links… content can be made public or private… Private content are hosted in a private repo which is a submodule."* Detailed in [Files and sharing](../experience/files-and-sharing.md) and [Repository and publishing](../architecture/repository-and-publishing.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| SHR-01 | Every note is **Private**, **Shared** (with named audiences), or **Public**. New notes are private by default, and nothing is public unless the user chose it: at launch only the note they last opened is reopened (never an empty public file), else a private note opens (D-171); in a workspace without a private repository, a new note is marked Public and isn't backed up until the writer chooses *Make it public* or *Keep it on this computer only* (D-158). *(derived: safe default)* | P0 |
| SHR-02 | Public notes are stored in the public repository; private notes are stored in the private content repository, mounted as a submodule. | P0 |
| SHR-03 | A public note has a stable, read-only public URL on GitHub Pages. "Copy public link" (in ⋯, Share, and Spotlight) copies it. | P0 |
| SHR-04 | Private notes are never published in plaintext. | P0 |
| SHR-05 | Private notes and folders can be shared with an **audience identified only by a name**, through a magic link, a passcode, or both (D-41). See [Sharing and visibility](../design/views/sharing.md). | P0 |
| SHR-06 | Public and share-link pages follow the reader's light or dark preference and are readable from 320 px wide. Share-link errors never reveal whether a note exists. | P0 |
| SHR-07 | Passcodes are generated (four EFF words, about 52 bits) or chosen by the owner. Custom passcodes must be at least 12 characters and rated strong. Keys are derived with PBKDF2-SHA256 at 600,000 iterations and a salt per grant. | P0 |
| SHR-08 | Audiences can be listed, with what they open, their expiry (default 30 days), and their state, then extended, withdrawn (keeping the record), or deleted. | P0 |
| SHR-09 | A copyable invite built from an editable template (`{name}`, `{title}`, `{link}`, `{passcode}`, `{expires}`, `{site}`), stored in the private repository. | P0 |
| SHR-10 | The share reader opens with a magic link (the fragment is removed at once), or with name plus passcode. The session is per tab by default, remembered on the device on request, and Sign out reaches every tab. Errors are generic. | P0 |
| SHR-11 | Sealing per build: fresh keys every build, keyrings only for active grants, name lookup by salted hash, a nightly deploy for expiry, and a warning before GitHub's 60-day schedule shutoff. | P0 |
| SHR-12 | **Print** the open note from ⋯ → Note, the command list, Spotlight and the macOS File menu, through the system's own print dialog, which keeps the printer, paper, orientation, copies, pages and *Save as PDF*. On paper the note is in Paper's colors whatever the theme on screen, at 12 pt, with the note's title as the job's name, no front matter, and, when *Page numbers when printing* is on beside *Print…* (off by default, kept on the device), the page number and count at the foot of every page (D-231). A heading stays with what follows it, and a code line, a table row and a task don't split across pages; a line with only a page break (`<!-- pagebreak -->`, or an empty `<div style="page-break-after: always"></div>` as other Markdown editors write it) starts a new page (D-230). See [Print](../experience/print.md). | P1 |

## Theming (THM)

Seed: *"ability to change theme — Colors, fonts."* The owner confirmed Light, Dark, and System (D-25) and font size controls in the toolbar. Detailed in [Theming](../experience/theming.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| THM-01 | All UI and content colors come from semantic design tokens (see DSY-01). | P0 |
| THM-02 | Built-in Light and Dark themes, plus "System" (follows the OS and switches live). This includes the desktop window's native parts. | P0 |
| THM-03 | The writer can change the content font (serif, sans, mono, or a custom stack) and size. | P0 |
| THM-04 | Themes are JSON documents, and custom themes can be added without code changes. | P1 |
| THM-05 | Theme choice persists per device and syncs through the repository if the writer opts in. | P1 |
| THM-06 | Font size can be made larger, smaller, or reset with <kbd>Mod</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> and from the ⋯ menu, in steps. Light/dark can be toggled with one shortcut. | P0 |
| THM-07 | Theme manager gallery with live preview on the real note. Keyboard focus previews, <kbd>Esc</kbd> reverts. See [Theme manager](../design/views/theme-manager.html). | P0 |
| THM-08 | Appearance (System, Light, Dark) with a separately chosen light theme and dark theme. | P0 |
| THM-09 | Well-known color schemes (for example Solarized, Nord, Dracula, Gruvbox, Catppuccin) offered by name, under compatible licenses. | P1 |
| THM-10 | Import themes from a VS Code theme file, a base16 scheme, or a Focus Notes theme file, with a mapping report. | P1 |
| THM-11 | Generate a matching light and dark theme from one seed color. | P1 |
| THM-12 | Shuffle generated themes with mood options, color locks, and a history of the last 20. | P1 |
| THM-13 | Contrast guard: check every theme's key color pairs, offer a one-click fix, warn before saving a failing custom theme, and never ship a failing built-in. | P0 |

## Packaging and distribution (PKG)

Seed: *"managed as a github repo… hosted in github pages… web or an electron app."* Detailed in [Architecture overview](../architecture/overview.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| PKG-01 | The project repository holds the app's source, docs, releases, and the instance template, and is also the owner's own instance (public notes in `notes/`, the private repository at `private/`). People who want to use Focus Notes make their instance from the **template repository**, which holds only their content and a *Deploy app* workflow; people who want to improve it fork the project repository (D-87). | P0 |
| PKG-02 | Each instance's *Deploy app* workflow publishes the app and the instance's public notes to its own GitHub Pages. The project repository builds the app from source; instances made from the template deploy the released web app bundle at a pinned version, so their owners never build anything (D-87). | P0 |
| PKG-03 | An Electron desktop app wraps the same web build, with native file-system and Git access. It's the only client that writes to GitHub (D-80, D-90). | P0 |
| PKG-04 | The product repository builds and tests without any user workspace, credentials, or secrets. | P0 |
| PKG-05 | The web app runs from each instance's own GitHub Pages site (its *Deploy app* workflow deploys the released bundle in template instances and builds from source in the project repository), in any modern browser with nothing to download. It never signs in to GitHub and never writes to a repository (D-80, D-87, D-90). | P0 |
| PKG-06 | Nothing hosted or registered by the project: no OAuth app, client ID, server, or telemetry. Each user's instance needs only their own GitHub account plus the public release files on GitHub (D-21, D-87). | P0 |
| PKG-07 | Local first in the browser: the notes you write in the browser, and their settings, live only in this browser's IndexedDB, survive reloads, work offline, need no account, and are never sent anywhere. The app asks the browser to keep its storage (`navigator.storage.persist`) and says plainly that clearing the site's data deletes them (D-90). | P0 |
| PKG-08 | The instance's notes in the browser, read-only: the site's public notes (from the published `notes/` and its index, without GitHub's API) and, once unlocked, its private notes (PKG-10) open read-only and clearly marked, with *Copy to my notes* to edit a copy in this browser. The browser never changes them (D-90). | P0 |
| PKG-09 | Visitor view: until a browser unlocks the instance's private notes, it shows only the public notes of the instance, read-only, and **Use this app for yourself** (DST-01). Anyone can still write their own notes, kept only in their own browser (D-87, D-90). | P0 |
| PKG-10 | Unlock in the browser: the owner's passphrase opens the vault (the owner's private notes, sealed by the *Deploy app* workflow as a share grant with an audience of one, D-41) read-only, decrypted in the browser. Locked again when the tab closes, unless *Remember on this browser* is chosen, which keeps a non-extractable key in IndexedDB; *Lock* and *Forget this browser* undo it. A wrong passphrase gets one generic message (D-90). | P0 |
| PKG-11 | Export and import in the browser: *Export my notes* saves every note written in this browser as one bundle file (Markdown text with paths and dates, checked against its JSON Schema); *Import notes* adds a bundle's notes to this browser and keeps both versions when a name is taken. Nothing is deleted on either side (D-90). | P0 |
| PKG-12 | The desktop app is also offered in the Microsoft Store, as an MSIX package built by every release beside the NSIS installer, never instead of it. The Store build behaves as the installer's does: the command-line tool is on the `PATH` with the app (an app execution alias, nothing to install), `focus-notes:` links open it, and nothing writes into its read-only install folder. Each published release is submitted to the Store automatically once the owner has set the Store credentials; the first submission and the age rating are the owner's, in Partner Center (D-202). | P1 |
| PKG-13 | The Microsoft Store package needs no other software: it carries its own Git and Git's sign-in helper (Git Credential Manager) and always uses them, so saving, backing up and signing in work on a PC with nothing else installed. In the Store package no screen, command or link offers to install or get other software (Git, the sign-in helper, the GitHub CLI); a bundled Git that won't start says to repair Focus Notes. The installer and the portable keep using the system's Git (D-22, D-228). | P0 |

## Desktop app (DSK)

Owner: *"Our electron app will have 20px rounded corners with custom title bar."* Detailed in [Desktop app](../experience/desktop-app.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| DSK-01 | On Windows and Linux the window has 20 px rounded corners, or square corners when maximized, snapped, or full screen. On macOS the window is native, with the system's own corners (D-14). | P0 |
| DSK-02 | A custom title bar: the top 44 px are a drag region with the trigger centered. Window controls (macOS traffic lights, app-drawn buttons on Windows and Linux) appear on hover or keyboard focus. | P0 |
| DSK-03 | Full window behavior: native on macOS. On Windows and Linux rebuilt by the app: moving, resizing from every edge and corner, double-click and drag-to-top maximize, restore by dragging, minimize, close, and remembered size and position. | P0 |
| DSK-04 | Full-screen mode (<kbd>⌃⌘F</kbd> / <kbd>F11</kbd> or <kbd>Alt</kbd>+<kbd>Enter</kbd> on Windows and Linux (D-229), and in ⋯). The title bar reappears when the pointer reaches the top edge. | P0 |
| DSK-05 | A full native menu bar on macOS that lists every command with its shortcut. | P0 |
| DSK-06 | Multiple windows, one note per window. | P1 |
| DSK-07 | Signed builds and automatic updates from GitHub Releases. | P1 |
| DSK-08 | Windows and Linux: edge and corner snapping with previews, a Snap Layouts picker on the maximize button, an app-drawn system menu (<kbd>Alt</kbd>+<kbd>Space</kbd>), a drawn shadow with a click-through margin, and correct behavior across monitors with different scaling. See [Desktop app](../experience/desktop-app.html#window-management-on-windows-and-linux). | P0 |
| DSK-09 | The window never shows a blank, white, see-through or unstyled frame. It's shown only after its first themed frame. Finishing setup, opening another workspace, removing it, signing out and changing the theme happen in place, without reloading the page. Views and setup steps swap complete, keeping the old one until the new one is ready. Resizing, maximizing, snapping, full screen and moving between monitors never show unpainted area. A frame-integrity journey checks every transition. See [Perceived performance → Glitch-free windows and views](../architecture/perceived-performance.md#glitch-free-windows-and-views). *(derived from DSK-01 and DSK-03)* | P0 |
| DSK-10 | Starting answers at once: the portable shows a splash while it unpacks, and `pnpm bench:launch` times any Windows build from the process starting to the window showing and to the caret, with a throwaway profile, from the app's launch log (D-216). See [Desktop app → Start and close](../experience/desktop-app.html#start-and-close). *(derived from PRF-02)* | P1 |
| DSK-11 | Windows: closing the main window saves, hides it and keeps the app in the notification area, backing up behind it; the tray icon, the Start menu or a link shows the same window again; *Quit Focus Notes* in the tray's menu, signing out of Windows and shutting down quit; *Keep running when closed* turns it off; a one-time notice says it's still running (D-217). See [Desktop app → Start and close](../experience/desktop-app.html#start-and-close). *(derived from PRF-02)* | P1 |

## First run and sign-in (FRE)

Owner: *"We need a sign in and setup flow for the electron app… device sign in… proper intuitive FRE… sign-in at the CLI level so that all the commit and push work."* Later: *"no hosting overhead… if OAuth requires developer app registration, it's a dealbreaker… everything owned by the end user."* Detailed in [First run and sign-in](../experience/first-run.md) and [Desktop and Git](../architecture/desktop-and-git.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FRE-01 | A guided first run of four screens (Welcome, Connect, Your notes, Ready) that can be done entirely by keyboard and resumed after quitting, in words anyone understands: the main path never says repository, Git, commit, token, credential, CLI, instance, or Pages, and Git is checked silently, showing only when it's missing or too old. *Just use this computer for now* skips the account (D-124). | P0 |
| FRE-02 | Sign-in goes through Git's own sign-in helpers that the user owns, Git Credential Manager or GitHub CLI, with a device code by default, its code shown in the app (D-142); the helper's browser sign-in, or a fine-grained token the user creates from a pre-filled GitHub link. There's no OAuth app and no registration (D-21). Declined, expired, and offline states recover. | P0 |
| FRE-03 | The credential lives only in Git's credential helper, so commits and pushes work in the app and from the user's terminal with one sign-in. The app keeps no copy of its own and holds API tokens in memory only. | P0 |
| FRE-04 | An existing working Git credential or GitHub CLI session is found and offered, skipping the device code. | P0 |
| FRE-05 | The name and email on the notes' commits come from the GitHub account, with its private noreply address, set for the notes workspace only and without a step; Git's global settings are never changed (D-124). | P0 |
| FRE-06 | Your notes: the Focus Notes workspaces the account already has are offered first (*We found your notes*, each with *Open*), or a new one is created (FRE-08); under *More options*, clone any repository from GitHub (with the private submodule when the account can reach it) or open a local clone. Signed in, Settings → Workspace opens another workspace from GitHub the same way (D-124). | P0 |
| FRE-07 | Settings → Account: switch account, sign out (optionally removing Git's saved credential), and run setup again. | P0 |
| FRE-08 | *Set up my instance* (desktop): in the user's own GitHub account, make the repository from the Focus Notes template, the private repository, the submodule link, the read-only deploy key and Actions secret for sealing, the vault passphrase when one is chosen under *More options* (only its derived key is stored, in `private/access.json`), and GitHub Pages, each step retryable on its own, with one button and sensible defaults (D-84, D-90, D-124). | P0 |
| FRE-09 | Web first run: the app knows its instance from its own Pages address. A first visit opens the newest public note, if there is one, or a welcome note kept in this browser, which says that notes written here stay in this browser and that the desktop app saves to GitHub. There's nothing to sign in to (D-90). | P0 |
| FRE-10 | Bring browser notes to the desktop: the first run, and *Import notes* later, add an exported bundle to the instance, private unless the user chooses public, as ordinary commits. The browser keeps its copies until the user deletes them (D-90). | P0 |
| FRE-11 | At start the desktop app checks the notes folder named in its workspace record before Git, the file watcher or any note. A missing folder, or one on a drive that isn't connected, opens the recovery view and is never re-created, emptied or written to without the person's choice; only the first run makes a folder and its welcome note. The record (`workspace.json` in the app's data folder, still `version: 1`) also keeps the folder's kind (GitHub, offline mode, synced by another service), its notes on GitHub, the account and the last backup ([Where your notes live](../experience/notes-folder.md), D-212). | P0 |
| FRE-12 | The recovery view offers, each with one line saying what will happen: *Download your notes again* (the recorded notes into the same folder, or the next free one; the account's notes as a list when there are several or none is recorded), *Sign in to GitHub again* (Connect alone, then download), *Find the folder…* (a moved or renamed folder; Documents moved into OneDrive is found by itself, and a folder put back while the view shows opens by itself), and *Start with an empty folder* (a name and a place, with defaults that never clash: `Focus Notes`, then `Focus Notes 2`). Nothing downloads before a choice (D-212). | P0 |
| FRE-13 | Account and sync problems never block writing (D-213). An alert icon on the save state, the Files header and the affected section opens a card that says what differs (a folder not connected to its notes on GitHub, a sign-in that stopped working, an account that can't reach the notes, notes gone from GitHub, GitHub changes that couldn't come in, many notes removed outside the app, which pauses backup), with *Sync now*, *Sign in again* or *Switch account*. A folder holding nothing of the person's downloads by itself; one with notes written there, on *Sync now*, brings them in as private notes, checks every file, and sends the old folder to the Recycle Bin. Offline mode shows "Offline mode · saved on this computer". Settings → Account shows the account Git signs in with in any folder (DEF-33). | P0 |
| FRE-14 | The person chooses where the notes folder lives: setup's *Just use this computer for now* asks where (default `Documents\Focus Notes`, the next free name), *More options* keeps *Choose another folder…*, and Settings → Workspace has *Move…* (a rename on the same drive; across drives a counted, verified copy with *Cancel* until the switch, then *Send the old folder to the Recycle Bin?*) and *Open another folder…* for any folder of Markdown notes (D-214). | P0 |
| FRE-15 | A folder that OneDrive, Google Drive, iCloud Drive or Dropbox keeps in sync works as a notes folder with that service syncing it (D-215): the service is recognised and named in the corner; GitHub backup is off, and `.git` is never made there unless the person chooses *Use it anyway* after a warning (new GitHub folders avoid a synced Documents); online-only notes aren't downloaded to list or search them; a save the service holds is tried again for up to 5 s; and the service's conflict copies show as ordinary notes. | P1 |

## Keyboard shortcuts (KEY)

Owner: *"A solid keyboard shortcut strategy… same as the most popular apps… exhaustive coverage from basic to advanced… work for mac and iOS."* Detailed in [Keyboard shortcuts](../experience/keyboard-shortcuts.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| KEY-01 | Every action is a named command that can be run from Spotlight, which shows its shortcut. | P0 |
| KEY-02 | The default keymap follows platform conventions and well-known app precedent on macOS, iPadOS and iOS with a hardware keyboard, Windows, and Linux. | P0 |
| KEY-03 | The Basic, Writer, and Power layers of the keymap are complete. | P0 |
| KEY-04 | The Pro layer (block selection mode, cell selection mode, expand selection, Spotlight action keys, reveal in Finder or Explorer) is complete. | P1 |
| KEY-05 | A searchable cheat sheet (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd>) shows the right symbols for the platform. | P0 |
| KEY-06 | OS-reserved keys are never bound. Web substitutes exist for browser-reserved keys. AltGr characters, IME composition, and non-Latin layouts are handled. | P0 |
| KEY-07 | Custom keybindings (`keybindings.json`) with conflict warnings and reset. | P1 |

## Find and replace (FND)

Owner: *"Find and find-and-replace."* Detailed in [Find and replace](../experience/find-and-replace.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FND-01 | Find in the note (<kbd>Mod</kbd>+<kbd>F</kbd>): live count, next and previous, case, whole word, and regex toggles, matching on visible text. | P0 |
| FND-02 | Replace current and replace all in the note. Replace all is one undo step and keeps formatting. | P0 |
| FND-03 | Find in selection. | P1 |
| FND-04 | Find in all notes (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) with grouped snippets and jump to match. | P0 |
| FND-05 | Replace in all notes with a preview, one commit per repository, and a one-step revert. | P1 |

## Spotlight (SPT)

Owner: *"Powerful search-and-act… Ctrl+K can trigger a macOS Spotlight-like UI that can search for stuff and can even show some quick actions."* The owner later corrected the key to <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd> (D-16). Detailed in [Spotlight](../experience/spotlight.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| SPT-01 | <kbd>Mod</kbd>+<kbd>/</kbd> opens Spotlight from anywhere in the app. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> also opens it on every keyboard layout (D-16). | P0 |
| SPT-02 | One ranked list covering notes (title, path, headings, full text), folders, commands, and settings. | P0 |
| SPT-03 | Quick actions for the selected result (<kbd>→</kbd> or <kbd>Mod</kbd>+<kbd>K</kbd>): open in a new window, copy link, move, rename, make public or private, delete, and more. | P0 |
| SPT-04 | Commands and settings show their current state. The empty field shows recent notes and suggestions. No match offers create and find-in-all-notes. Spotlight is also the action center: with the field empty, after recent notes, it lists every action the app has, so <kbd>Mod</kbd>+<kbd>/</kbd>, the arrow keys, and <kbd>Enter</kbd> find and run any of them (D-111). | P0 |
| SPT-05 | Modes and prefixes: quick open (<kbd>Mod</kbd>+<kbd>P</kbd>), commands (<code>&gt;</code>, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>), headings (<code>#</code>, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>), help (<code>?</code>). | P0 |
| SPT-06 | Filters (`is:`, `in:`, `type:`, exact phrases) and a preview pane on the desktop. | P1 |
| SPT-07 | Opens in under 50 ms. Title and command results in under 16 ms per keystroke and full text in under 100 ms, on 5,000 notes. | P0 |
| SPT-08 | The search index is built and kept on the device only. Private note text never leaves it. | P0 |

## Licensing (LIC)

Owner: *"We need MIT licence, our app itself will be MIT."* Detailed in [Decisions → Licensing policy](../plan/decisions.md#licensing-policy-d-20-details).

| ID | Requirement | Priority |
| --- | --- | --- |
| LIC-01 | The app is released under the MIT license (`LICENSE` at the repository root). | P0 |
| LIC-02 | Every shipped dependency uses an allowed MIT-compatible license. A CI check fails the build otherwise, and third-party notices are generated. | P0 |

## Documentation (DOC)

Seed: *"Use slate for documentation."*

| ID | Requirement | Priority |
| --- | --- | --- |
| DOC-01 | Project documentation is a Slate host in `documentations/`, with Slate pinned as the `slate/` submodule. | P0 |
| DOC-02 | `seed-specs.md` is human-authored and is never edited or deleted by tooling or agents. | P0 |

## Agents and automation (AGT)

Owner: *"I want this whole thing to be agent-friendly also, so we can have MCPs and agent friendly interfacing."* Detailed in [Agents and automation](../architecture/agents.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| AGT-01 | A local MCP server (`focus-notes mcp`, stdio) with the tools, resources, and prompts listed on the Agents page. Writes go through the app when it's running. | P1 |
| AGT-02 | Settings → Agents shows connection snippets for common MCP hosts, with copy buttons. | P1 |
| AGT-03 | Agent permissions: read public (on once connected), read private (off), create and edit (off), create public (off), and folder limits. Deleting, visibility changes, and sharing are never available to agents. | P1 |
| AGT-04 | Every agent write is its own commit with a `Focus-Notes-Agent` trailer, announced with Review and Undo, and listed under Recent agent changes. | P1 |
| AGT-05 | A `focus-notes` command-line tool with `--json` output, `--workspace`, and documented exit codes. | P1 |
| AGT-06 | `focus-notes://` deep links for open, new, and search. They never write, delete, or change visibility. | P1 |
| AGT-07 | `AGENTS.md` in the workspace template (layout, front matter, links, `private/` rules, commit style) and in the product repository. | P0 |
| AGT-08 | JSON Schemas (2020-12) for front matter, settings, themes, keybindings, `access.json`, and the invite template, published with stable `$id` URLs. | P0 |
| AGT-09 | MCP safety: note content is returned as labeled, untrusted data, there are rate and size limits, and private content is never returned without permission. | P1 |

## Security (SEC)

Cross-cutting requirements serving CP-SAFE-01 and CP-OWN-01 across every capability. Detailed in [Security and privacy](../architecture/security-and-privacy.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| SEC-01 | The Electron hardening checklist: context isolation, sandbox, no Node in the renderer, a validated preload bridge, navigation and permissions denied, no remote content, strict CSP, fuses (`RunAsNode` off, only load from ASAR, ASAR integrity on). | P0 |
| SEC-02 | Markdown and HTML are sanitized everywhere they're rendered. Raw HTML in notes is shown as text. Only safe URL schemes are allowed. Trusted Types in the app. | P0 |
| SEC-03 | Credentials live only in Git's credential helper, in the desktop app. API tokens are held in memory. The browser holds no GitHub credential at all. Tokens never appear in logs, URLs, or process arguments (D-90). | P0 |
| SEC-04 | Supply chain: lockfiles, Dependabot, CodeQL, secret scanning with push protection, actions pinned by SHA, release SBOM, checksums, and artifact attestations. | P0 |
| SEC-05 | Instances' workflows pin every action by commit SHA and verify the web app bundle by SHA-256 and attestation before deploying it. Updates arrive only as pull requests. | P0 |
| SEC-06 | Every Pages deploy runs the leak check and fails if private text or file names appear in the output. | P0 |
| SEC-07 | `SECURITY.md` and GitHub private vulnerability reporting, with acknowledgement within 7 days. Documented responses for leaked share secrets, keys, and tokens. | P0 |
| SEC-08 | The vault passphrase is never stored or sent. Its key is derived with PBKDF2-SHA256 at 600,000 iterations, and the browser accepts no other parameters. Setting it requires a strong passphrase and says that a forgotten one can't be recovered (the notes stay in the private repository). *Remember on this browser* warns that every site on the same `github.io` address shares the browser's storage, and recommends a custom domain (D-90). | P0 |

## Privacy (PRV)

Cross-cutting requirements serving CP-OWN-01 and CP-SHARE-01. Detailed in [Security and privacy → Privacy commitments](../architecture/security-and-privacy.md#privacy-commitments).

| ID | Requirement | Priority |
| --- | --- | --- |
| PRV-01 | No telemetry, analytics, crash reporting services, or third-party requests in the app, users' sites, or the product site. | P0 |
| PRV-02 | A documented data inventory. Signing out or removing a workspace deletes the local index, recent items, and logs. | P0 |
| PRV-03 | Synced settings and custom themes are stored in the private repository when there is one (D-46). | P0 |
| PRV-04 | Public and shared pages set no cookies and load nothing from other origins. Public notes can opt out of search indexing (`noindex`). | P0 |

## Performance (PRF)

Cross-cutting requirements serving CP-CALM-01, CP-FOCUS-01, and CP-REACH-01. Detailed in [Performance and quality](../architecture/performance-and-quality.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| PRF-01 | Keystroke to paint: p95 16 ms or less and p99 33 ms or less, in a 50,000-word note with focus mode on. | P0 |
| PRF-02 | Desktop start to an editable caret: 2.5 s or less cold, 1.5 s or less warm. | P0 |
| PRF-03 | Opening a 10,000-word note in 150 ms or less. Saving to disk within 1 s of the last keystroke, off the typing path. | P0 |
| PRF-04 | 350 MB or less resident memory with 10,000 notes. Near-zero idle CPU, with no polling except the 5-minute fetch. | P0 |
| PRF-05 | Installers of 150 MB or less. The web reader page loads 300 KB or less of compressed JavaScript. | P0 |
| PRF-06 | Publishing 1,000 public and 200 shared notes takes 5 minutes or less. | P0 |
| PRF-07 | Git status comes from one `git status --porcelain=v2 --branch -z --untracked-files=all --ignore-submodules=dirty` per repository, both repositories in parallel with `GIT_OPTIONAL_LOCKS=0`, cached under a key of the content generation, Git's own file times and sizes, and a 30 s maximum age. Only stable answers are cached, calls in flight are shared, failures aren't stored, commits always ask fresh, and the cache is cleared after commit, push, pull, or discard. No view's first frame waits for Git. *(derived from PRF-02 and DSY-11)* | P0 |
| PRF-08 | Every wait a person starts goes through one task tracker: nothing extra under 300 ms, a sign at the affected place after that, held at least 500 ms, announced to screen readers after 1 s and at its end, and words with the elapsed time after 3 s. The timings are `wait.*` tokens. *(derived from A11Y-01 and DSY-11)* | P0 |
| PRF-09 | Moving, deleting, creating, or duplicating notes and folders shows on screen within 100 ms, before the write and commit. Success is confirmed only after the real commit, and a refusal restores the previous state and says why. *(derived from FIL-03 and FIL-05)* | P0 |
| PRF-10 | Parsed notes are kept in an immutable in-memory snapshot keyed by path, size, and modification time, so reopening an unchanged note takes 50 ms or less. A warm-up after start loads the first views and builds the search index without delaying typing, and is off in end-to-end tests. *(derived from PRF-02 and PRF-03)* | P0 |
| PRF-11 | Each view model declares the content it shows. A change, from the app or outside it, re-renders only the views and fields that show it, within 500 ms of the file watcher's report. Heavy, rarely used parts of a view load when first shown. *(derived from DSY-11)* | P0 |
| PRF-12 | Published pages meet LCP 2.5 s, INP 200 ms, and CLS 0.1 in CI lab runs. Images request the width they're shown at, and pages preload only the font faces their first screen uses. No real-user measurement (PRV-01). *(derived from PRF-05)* | P0 |
| PRF-13 | Every operation that can take longer than 100 ms is in the wait inventory with its class (instant, responsive, waiting, or long) and that class's pattern. A wait of 1 s or more names the work at its place, with a count where there is one. Long work (over 10 s, or several steps) shows the current step in words, determinate progress where the work reports it, and the elapsed time. The window stays usable, and the work can be cancelled where it can stop. Work the next screen needs starts as soon as the intent is known. A "no silent wait" journey slows each operation and checks its sign. See [Perceived performance](../architecture/perceived-performance.md#the-wait-inventory). *(derived from PRF-08)* | P0 |
| PRF-14 | Direct manipulation is attached to the hand. Dragging or resizing the window keeps it within one frame of the pointer (p95 at 3,000 px/s) and puts it at its final place in the frame of release, with no queue of stale moves. A move never repaints the page. Every control answers on pointer-down in the next frame (input to next paint p95 ≤ 50 ms). The main process's event loop never stalls more than 16 ms at p99. See [Perceived performance → Snappy](../architecture/perceived-performance.md#snappy-the-window-and-every-control-follow-the-hand). *(derived from DSK-03 and PRF-01)* | P0 |

## Quality (QLT)

Cross-cutting requirements serving CP-SAFE-01.

| ID | Requirement | Priority |
| --- | --- | --- |
| QLT-01 | The testing strategy runs in CI: unit, round-trip corpus, integration with real Git, end-to-end (web and Electron), visual regression, automated accessibility, input methods, and performance budgets. | P0 |
| QLT-02 | Every release is tested on the support matrix (OS versions, browsers, screen readers, keyboard layouts). | P0 |
| QLT-03 | Crash recovery's drafts (QLT-06) mean a crash loses at most about one second of typing, restored at next launch. | P0 |
| QLT-04 | Local diagnostics: redacted, rotated logs, *Copy diagnostic report*, and *Report a problem* (a pre-filled GitHub issue the user reviews). Nothing is sent automatically. | P0 |
| QLT-05 | Every wait a person feels has a named performance measure, and the main process records named spans for Git and content work, kept in memory and shown only in local diagnostics. `pnpm bench` runs Playwright on a throwaway Git copy of a fixture workspace (never real notes), and a committed budgets file with noise allowances supports `--compare` and `--check`, which fails CI on a regression. *(derived from QLT-01)* | P0 |
| QLT-06 | Crash recovery is isolated: drafts live only in the app's data folder; recovery never creates, writes, renames, moves or deletes a file or folder in the workspace by itself; a draft follows its note through renames; and recovered text comes back in the editor as unsaved edits, through the resolver, or in a Recovered list, for the person to keep (D-190). *(derived from QLT-03; matching at launch is measured as `fn:recovery.match`, under 30 ms with 20 drafts in 10,000 notes; evidence in [gate evidence](../plan/gate-evidence.md#work-package-verification), WP-8.9)* | P0 |
| QLT-07 | *Send feedback*: a problem or an idea, sent from inside the app. Signed in on the desktop, it's posted as an issue to the project's own repository with the person's account, the diagnostic report only when they attach it, and the issue's number shown; otherwise, and always in the browser, GitHub's new-issue form opens filled with their words and never the report. Nothing is sent until they press Send (D-203). *(derived from QLT-04)* | P1 |

## Accessibility (A11Y)

Cross-cutting requirements serving CP-YOURS-01.

| ID | Requirement | Priority |
| --- | --- | --- |
| A11Y-01 | WCAG 2.2 AA for the app, users' public and shared pages, and the product site, with ARIA Authoring Practices patterns for every custom widget. | P0 |
| A11Y-02 | Windows contrast themes (`forced-colors`), 200% interface zoom, and reflow at 320 px are supported. | P0 |

## Language and text (I18N)

Cross-cutting requirements serving CP-YOURS-01 and CP-OWN-01.

| ID | Requirement | Priority |
| --- | --- | --- |
| I18N-01 | Interface strings are externalized in ICU MessageFormat. English ships first. | P0 |
| I18N-02 | Notes in any script: `dir="auto"` for each block, NFC file names, locale-aware sorting, and `Intl` dates and numbers. | P0 |
| I18N-03 | More interface languages. | P1 |

## Design system (DSY)

Owner: *"Make sure we are extremely strict about Design system. Purely driven by tokens, fundamental components, compound components, layouts etc. … the whole app should be possible to be made with data driven UI where something like a json file can serve as the UI code … So actual app UI won't have a single html and css code."* Cross-cutting requirements serving CP-CALM-01, CP-YOURS-01, and CP-AGENT-01. Detailed in [Design system](../design/system/overview.html), [Tokens](../design/system/tokens.md), [Components](../design/system/components.md), and [Views as data](../design/system/views-as-data.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| DSY-01 | Three token tiers (reference, semantic, component) in the DTCG format. Component tokens alias semantic tokens, semantic tokens alias reference tokens, and components read only their own component tokens. Themes may override only the themeable semantic groups. | P0 |
| DSY-02 | Every visual value (color, size, space, radius, type, line height, shadow, blur, opacity, border width, motion, layer order, breakpoint) is a token. A raw value outside the token source fails CI. Geometry measured at run time, applied by primitives and layouts, is the only exception. | P0 |
| DSY-03 | Tokens resolve by mode: color scheme, contrast, forced colors, reduced motion, reduced transparency, pointer, platform, and UI scale. Components never check modes themselves. | P0 |
| DSY-04 | Only primitive and layout components in `packages/ui` render DOM elements or declare styles. Compound components compose primitives, layouts, and other compounds only. | P0 |
| DSY-05 | Every component has a closed, machine-readable contract (typed props, enumerated variants, events, slots, states, tokens, and accessibility pattern with a required accessible name). No `className`, `style`, or attribute pass-through. | P0 |
| DSY-06 | All app UI is defined as JSON view documents rendered by the UI runtime: every IA view, the published reader and share pages, and the *Use this app for yourself* dialog. Application code contains no markup or styles. | P0 |
| DSY-07 | View documents contain only component and fragment references, registry-checked literals, message keys, reads and bindings to view models, local state, and the environment, a restricted expression subset, and actions that run commands or set local state. | P0 |
| DSY-08 | `ui:check` validates every view and fragment (schema, references, binding types, accessibility rules, design rules) on every build, and any failure blocks it. | P0 |
| DSY-09 | Every component variant and state, and every view with each of its view-model fixtures, is in the gallery and covered by visual regression, keyboard, and axe tests in light, dark, high contrast, compact, and reduced transparency. | P0 |
| DSY-10 | Components change only through the component process (need, contract, design decision, tokens, fixtures, tests). Breaking changes bump the UI schema's major version and ship with an automatic migration for every view document. | P0 |
| DSY-11 | Renderer overhead is 10% or less compared with an equivalent hand-written tree, any view opens to its first frame in 100 ms or less, and the typing path never goes through the renderer. | P0 |
| DSY-12 | Toolbar, menu, Spotlight, and other action items reference command IDs. Their labels, icons, shortcuts, and enabled and checked states come from the command registry. | P0 |
| DSY-13 | The component contracts, UI schema, token names, and fragment list are published as JSON on the product site for agents and tools. | P1 |

## Distribution (DST)

Owner: *"How do we package and distribute this?… It would be ideal if people can start this from the web also, from a static page… simpler if the user downloads the electron app."* Detailed in [Distribution and release](../plan/distribution.md), [Web app](../architecture/web-app.md), and [Use this app for yourself](../design/views/get-started.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| DST-01 | **Use this app for yourself:** in the visitor view, a button opens a dialog that explains how Focus Notes works (your own independent instance in your own GitHub account, no server, nothing shared with the person whose site this is) and gives the steps: create a GitHub account, make your instance from the template, turn on GitHub Pages, and write in your site's browser; plus **Download the desktop app** from the latest GitHub Release to save your notes to your repository. The README says the same (D-87, D-90). | P0 |
| DST-02 | Start in the browser: copy the Focus Notes template repository (*Use this template*, or clone it; not the source repository) to make your instance, with no app to build, turn on GitHub Pages with GitHub Actions, open your site, and write at once in the browser. The desktop app connects the same instance to GitHub whenever you want your notes in your repository (D-80, D-87, D-90). | P0 |
| DST-03 | A release pipeline in the project repository that builds the desktop installers for Windows, macOS, and Linux and the web app bundle, plus checksums, an SBOM, and attestations, into a draft GitHub Release with smoke tests. | P0 |
| DST-04 | Store listings: winget and Homebrew cask (and Flathub later), updated automatically from releases. | P1 |
| DST-05 | `.focus-notes/workspace.json` with `formatVersion`. Migrations ask first, and older apps refuse to write newer formats. | P0 |
| DST-06 | The instance template repository is generated from `templates/workspace/` at each release; its *Deploy app* workflow deploys the released web app bundle by version and checksum, and updates arrive as pull requests that move the version (D-87). | P0 |
| DST-07 | Stable and Beta update channels. | P1 |
| DST-08 | The desktop app carries the workspace template: *Create my notes* makes an empty repository in your account and pushes its first commit from the template inside the app (in a release, the same pinned template the release attaches), so making an instance never depends on the public template repository. A repository you already made, in the browser or before, is still used as it is, and a template repository is still never written to (D-157, D-201). | P0 |

## Product site and help (HLP)

Owner (2026-10-16): *"We need to add support articles for the Focus Notes product… meant for the layman user… a place to explore what the app actually does… where the app can link to from its UI… the Marketing page for the app… the default landing page of the web page hosted in GitHub Pages for the repo with the source code… the demo experience… marketing quality screenshots."* Detailed in [Product site and help](site-and-help.md) and [Writing help articles](../design/help-writing.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| HLP-01 | **The landing page.** The project repository's GitHub Pages site opens on a product page: what Focus Notes is in one sentence, a trust strip (open source, MIT, no account on any Focus Notes server, no tracking), how it works in three steps, focus mode first among the features, screenshots of the current release, an honest *Is it for you?* section with alternatives, a short FAQ, and downloads for Windows, macOS and Linux from the latest GitHub Release (the visitor's system first), plus *Try the demo* (D-167). | P0 |
| HLP-02 | **The help centre** at `/help/`: articles grouped in at most eight categories named by what the reader is trying to do, each article one content type (getting started, how-to, concept, troubleshooting, reference, FAQ, what's new) written to the [writing guide](../design/help-writing.md): a verb-first sentence-case title, *Applies to* (desktop or browser, and system), prerequisites, numbered steps with one action each and the result stated, at about grade 8 reading level or below, with every technical word explained on first use (D-168). | P0 |
| HLP-03 | **Learn more links.** Each article and section has a stable ID and address that never changes (a renamed article keeps its old address as a redirect). The app's *Learn more* and *How to fix this* links name an article ID, not an address; a registry maps IDs to addresses, and CI fails when the app names an ID that doesn't exist, an anchor is missing, or any site link is broken (D-168). | P0 |
| HLP-04 | **Screenshots from the real app.** Every screenshot on the site is captured from the release build in CI with the demo workspace, in light and dark, at 2× scale, cropped to the window with a consistent frame, with alt text that describes what it shows; they're regenerated for each release, and a check fails if a screenshot is older than the views it shows (D-169). | P0 |
| HLP-05 | **The demo** at `/demo/`: the web app with the template's starting notes and a small set of sample notes that show every main feature; no sign-in, nothing sent anywhere, everything kept in the visitor's browser; a banner that says it's a demo, with *Download* and *Reset demo*; it never offers to save to GitHub (D-167). | P0 |
| HLP-06 | **Troubleshooting.** Every problem the app can show a writer (Git missing or too old, sign-in, device code, saving to GitHub, sync, conflicts, a folder already in use, install warnings from Windows SmartScreen or macOS Gatekeeper, the web app's storage) has an article that starts from the message's exact words, lists the likely causes in order, fixes each in numbered steps, and ends with *Still stuck?* (D-168). | P0 |
| HLP-07 | **Feedback without tracking.** Each article ends with its last-updated date, the app version it describes, 2 to 4 related articles, and *Was this helpful?* that opens a pre-filled GitHub issue or an edit suggestion, with no counters, cookies or requests (PRV-01). | P0 |
| HLP-08 | **Built like the app, light and fast.** The site is built in CI from Markdown articles and the design system (the same tokens, components and static renderer as public pages, D-114): no hand-written HTML or CSS outside `packages/ui`, light and dark by the visitor's setting, WCAG 2.2 AA (A11Y-01), no requests to any other origin (PRV-01), and the public pages' web vitals budgets (PRF-12). | P0 |
| HLP-09 | **Search without a server.** The help centre's search runs in the browser from an index built with the site, finds articles from everyday words and synonyms ("sign in", "log in", "login"), and works offline once loaded. | P0 |

## Rewrite with AI (RWR)

Rewrite sends selected text and a prompt to an AI service the person chose, and streams the answer into the note in place (D-256). The services, keys and the Writer live in Settings → AI (AIS, D-257). Focus Notes is an integration client only: it never installs, downloads, launches, hosts or runs a model (D-233). [Experience](../experience/rewrite-with-ai.md), [Settings → AI](../experience/ai-settings.md), [design](../design/rewrite-with-ai.md), [engine](../architecture/rewrite-engine.md), [providers](../architecture/rewrite-providers.md) and the [acceptance matrix](../plan/rewrite-acceptance.md) hold the detail.

**Status** says where each row stands on 31 October: *Built* means on the branch `fix-ai-rewrite-simple` and in the owner's review build, with unit tests where named in the acceptance matrix, but not yet on `main`; *In progress* means a builder is on it now; *Not built* means specified only.

**Retired IDs (D-256).** The 30 October design's RWR-01 to RWR-09, RWR-21 to RWR-29, RWR-41 to RWR-48, RWR-61 to RWR-66, SPT-09's file target, FIL-16 and EDT-15 described protected review, three options, saved variations, whole-file targets and a fixture-first owner gate. They're dropped, not deferred; the numbers aren't reused. Their reasoning stays in [decisions D-233 to D-252](../plan/decisions.md#rewrite-with-ai-decisions-30-october-2026).

### Rewrite

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| RWR-70 | **Integration only.** Rewrite calls a service the person runs or pays for, from the desktop main process. Focus Notes never installs, downloads, launches, hosts or runs a model, and has no server or account of its own in the path. | P1 | Built |
| RWR-71 | **Desktop only.** The browser app has no Rewrite command, menu item or AI settings; the command is disabled where the desktop bridge has no AI service. | P1 | Built |
| RWR-72 | **Open.** With text selected in an editable note, Ctrl+Shift+R (⇧⌘R on macOS), *Rewrite…* in the text menu (Windows and Linux) or *Rewrite…* in the Edit menu opens the Rewrite dialog with that selection captured. With nothing selected, it opens nothing and announces "Select some text to rewrite first." The command is enabled only while a note is open and ready. | P1 | Built |
| RWR-73 | **The dialog takes a prompt, nothing else.** Title *Rewrite*; the selected passage, read-only, under "Selected passage"; the Writer line ("Writer: {name} · {service} · {model} · On this computer" or "· Cloud"); a multi-line *Prompt* field, focused, with the placeholder "Make it clearer and warmer"; three presets (*Make concise*, *Make warmer*, *Fix grammar*) that fill the prompt and show pressed while it matches, and never send; *Cancel* and *Generate*. *Generate* is disabled with "Add a prompt or choose a preset" until the prompt has text. No option tabs, *Regenerate*, *Accept* or *Discard*. | P1 | Built |
| RWR-74 | **No Writer yet.** The dialog says "Rewrite needs an AI service. Add one in Settings → AI." and offers *Set up AI*, which closes it and opens Settings at AI, instead of *Generate*. | P1 | Built |
| RWR-75 | **Generate.** *Generate* closes the dialog and starts the rewrite on the captured selection. If the note changed since the selection was captured, nothing is sent and an error toast says "The note changed after you selected the text. Select it again and rewrite." | P1 | Built |
| RWR-76 | **While generating.** The note is read-only and the selection shimmers in the AI rainbow (`rewrite.shimmerDuration`). A toast says "Rewriting with {name}… Press Esc to stop." with *Stop*, and the screen reader hears "Rewriting the selection. The note is locked until it's done." A half-written note is never handed over for saving. | P1 | Built |
| RWR-77 | **Streams in place.** The first text that isn't blank replaces the selection; each later piece rebuilds the inserted text, in the rainbow gradient. Blank lines in the answer become paragraph breaks. Only text reaches the window. | P1 | Built |
| RWR-78 | **Finishes and fades.** The whole answer goes in as one change, the caret sits after it, the rainbow holds for `rewrite.fadeDelay` (1 s) and fades over `rewrite.fadeDuration` (3 s), then the decoration is removed. The screen reader hears "Rewrite finished. Ctrl+Z puts the original back." With reduced motion there's no shimmer or fade: a still gradient while it streams, ordinary text when done. The gradient is never written to the Markdown or the clipboard. | P1 | Built |
| RWR-79 | **One undo step.** Ctrl+Z puts back exactly the selected text; Ctrl+Y (or Ctrl+Shift+Z, ⇧⌘Z) brings the rewrite back. The streamed pieces never enter the undo history. | P1 | Built |
| RWR-80 | **Stop.** Esc, wherever focus is, or *Stop* in the toast aborts the request in the main process and puts the exact original back outside the undo history; the note unlocks and the screen reader hears "Rewrite stopped. The original text is back." | P1 | Built |
| RWR-81 | **Errors restore the original.** Any failure puts the exact original back, unlocks the note and shows one reason as an error toast in plain words, with the fix where there is one (the `ai.error.*` messages, AIS-11): no connection, consent not given, a private note, a refused key (401, 403), a missing model or address (404), a rate limit (429, with "Try again in {n} seconds" when the service sends Retry-After), a service fault (5xx), a refused request (400), too long (413), a timeout (408, 504 or ours), nothing listening, an unknown address (DNS), an unverified secure connection (TLS), a redirect, an unreadable or broken stream, an error event mid-stream, and an empty answer. Only Focus Notes' own reason code crosses to the window, never the service's text. Proven against protocol-faithful fakes of every kind (`apps/desktop/test/ai-contract.test.ts`; D-260). | P1 | Built |
| RWR-82 | **Limits.** Up to 32 KiB of selected text and 4,000 characters of prompt; up to 4,096 tokens of answer (OpenAI's own API and Gemini get four times that, since their reasoning models count thinking in it), and at most 64 KiB of text back, streamed or in one piece (an answer in one piece is read at most 512 KiB, a model list 4 MiB, a Test or Find 2 MiB; past that, "too long"); one rewrite at a time. Each request has three clocks: the answer must start within 30 s (120 s for a server on this computer, which may be loading the model), a started answer may go quiet for at most 30 s (60 s on this computer), and the whole request ends at 5 minutes (10 on this computer). Any of them closes the HTTP request (D-260). | P1 | Built |
| RWR-83 | **What is sent.** One request to the Writer's address: a fixed instruction (reply with only the rewritten text, in the text's language), then the prompt and the selected text. Nothing else from the note (no title, path, front matter or other text) and nothing about the person. Thinking models write only the answer into the note: Ollama is asked not to think (`think: false`), OpenAI's reasoning models get `max_completion_tokens`, and a leading `<think>…</think>` block some compatible servers send inline is left out (D-260). | P1 | Built |
| RWR-84 | **Live Markdown while streaming.** Markdown in the answer (bold, italic, code, links, lists, headings, quotes) shows formatted as it streams, as the editor would show it, and when it's done the note keeps the answer's content, saved in the note's canonical Markdown style (`* ` bullets become `- `, `__bold__` becomes `**bold**`), not the service's exact bytes. While streaming, open syntax (emphasis, a code span, a fence, a link) is closed for display only, and a last line that's only markers is held back. Undo, Stop and errors behave as in RWR-79 to RWR-81. | P1 | In progress (first commit 2616070c, not yet accepted) |
| RWR-85 | **Platform key names.** Menus, the shortcuts cheat sheet, tooltips and messages name Rewrite's key as Ctrl+Shift+R on Windows and Linux and ⇧⌘R on macOS, never "Mod+Shift+R", and the finish message names the platform's undo key. | P1 | In progress (the text menu fixed in bb50e208) |
| RWR-86 | **Leaving mid-rewrite.** Switching or closing the note while a rewrite streams stops the request in the main process and clears its toast, and the editor never gets the old note's later pieces. Closing or reloading the window aborts it in main too (D-260). | P1 | Built |

### Settings → AI (AIS)

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| AIS-01 | **The AI section.** Settings on the desktop always lists *AI*. Its intro: "Rewrite sends the text you select to an AI service you choose: a server on this computer, or a cloud service with your own key. Focus Notes never runs a model itself." With no connection it says "No AI connections yet. Add one, or find a server running on this computer." | P1 | Built |
| AIS-02 | **26 kinds of service, in three groups** (the ai-integration kit at 1613a55, text-capable entries; D-257). *On this computer:* Ollama, LM Studio, llama.cpp server, vLLM, SGLang, LocalAI, Jan, Docker Model Runner. *Cloud APIs:* OpenAI, Anthropic Claude, Google Gemini, Azure OpenAI, Mistral AI, Cohere, Groq, Together AI, Fireworks AI, DeepSeek, xAI Grok, Cerebras, Perplexity, NVIDIA NIM, Cloudflare Workers AI. *Gateways and other services:* OpenRouter, Hugging Face, Other OpenAI-compatible service. Each is called in its own request shape (OpenAI-compatible Chat Completions, Anthropic Messages, Gemini generateContent, Azure OpenAI deployments, Ollama chat, Cohere v2 chat). Not offered: Amazon Bedrock, Vertex AI, Foundry with Entra sign-in, Replicate, fal, MLX LM and CLI or MCP bridges. | P1 | Built |
| AIS-03 | **Connections list.** Up to 30 connections. Each row shows its name; "{service} · {model} · On this computer" or "· Cloud" (an Ollama model is "Cloud" until Ollama's own list, from Find, *Find models* or *Test connection*, shows it runs on this computer; D-259); a *Writer* or *Saved* badge; the key state ("Key saved in the system keychain", "No key saved" or "No key needed"); the last Test; and *Use as Writer*, *Test connection*, *Change* and *Remove*. Removing says "Connection removed. Your notes are unchanged." and deletes its sealed key. | P1 | Built |
| AIS-04 | **Add connection.** *Add connection* opens a form: *Service* (a menu grouped as in AIS-02), then only that service's fields: *Name*; *Address* for local servers, Azure and other compatible services; *Model*, with *Find models* and *Choose a model*; *Deployment name* and *API version* (default 2024-10-21) for Azure; *Account ID* for Cloudflare; *API key* when the service takes one. A line says where text goes: "Selected text goes to {host} · On this computer" or "· Cloud". *Save connection* is disabled with "Fill in the address and model first" until the required fields are filled. Choosing another service starts the form afresh: no address or key carries over. *Change* opens the same form for a saved connection. | P1 | Built |
| AIS-05 | **Keys are sealed.** A key is typed into a key field that never binds to view state; it goes to the main process once, on *Save connection*, is sealed there with the system key store (Electron `safeStorage`) in `ai.json` in the app's data folder, and never comes back to the window, a log, an error, a reason code or a file in the notes; a service's error text that echoes it never leaves main, and the diagnostic report takes out AI keys by their prefixes (`sk-`, `AIza`, `hf_`, `gsk_`, `xai-`, `nvapi-`, `csk-`, `fw_`). Changing a connection with the key left empty keeps the saved key at the same address; a new address or account drops it, the key field says "Enter the key again for the new address. The saved key is never sent to it.", and a service that needs a key won't save without one ("Enter the key again for the new address."; D-259). If the key store can't be used, saving fails with "Couldn't use the system keychain on this computer. Enter the key again." | P1 | Built |
| AIS-06 | **Safe addresses.** An address is https, or plain http only to 127.0.0.1, localhost or [::1]; it carries no user name, password, query or fragment ("Use an https:// address, or http://127.0.0.1 or http://localhost for a server on this computer."). Requests refuse redirects. | P1 | Built |
| AIS-07 | **Find on this computer.** One button asks the usual ports of Ollama, LM Studio, llama.cpp, vLLM, SGLang, Jan and Docker Model Runner for their models (LocalAI shares llama.cpp's port), each within 800 ms, with nothing leaving the computer. It says "Looking for AI servers on this computer…", then lists each server found with its model count and address and *Set up*, which opens *Add connection* filled in with the address and the first model that runs locally; or "No AI server is answering on this computer. Start Ollama, LM Studio or another local server, then look again." A server that asks for a token still counts as found; a program on the port that doesn't answer with its server's own model list (a web page, other JSON) doesn't. | P1 | Built |
| AIS-08 | **Models.** *Find models* lists the service's models (up to 500, within 8 s) for a saved connection or the form being filled in (with the typed key, or the saved key only at the saved address; D-259), and *Choose a model* picks one. Ollama models that run in the cloud are marked "· Cloud". Azure, Perplexity and Cloudflare Workers AI list none (Azure's deployment is the model; the other two document no list), so the model is typed. "No models are available. Install or load one, or type a model you have access to." | P1 | Built |
| AIS-09 | **Test connection.** Before it runs, Settings says: "Test sends one short made-up request ("Connection test.") to the connection's address and asks for a one-word reply. No note text is sent. A cloud service may bill it." It waits up to 20 s (90 s for a server on this computer, which may be loading the model), then records when and whether it answered: "Checked {at}: it answered.", "Last check {at} failed." or "Test failed: {reason}". An answer in the service's own shape counts even if it's empty, since a thinking model may spend its few tokens on thought. A saved connection that was never tested says "Saved. Connection not checked." | P1 | Built |
| AIS-10 | **The Writer.** Exactly one connection is the Writer, the one Rewrite uses, chosen in the *Writer (used by Rewrite)* menu or with *Use as Writer*; the first connection saved becomes the Writer. Removing the Writer leaves none until another is chosen. The Rewrite dialog names it (RWR-73). | P1 | Built |
| AIS-11 | **Errors say what to do.** Each failure has its own words and next step: not configured, consent needed, private note, key store unavailable, key refused, key required, timeout, nothing listening at the address, address not found (DNS), secure connection not verified (TLS), redirected, can't reach, model missing, not found, rate limited (with the wait when the service gives one), service fault, request refused, too long, unreadable answer, error mid-answer, bad address, no model, no deployment, no account ID, bad key, too many connections, connection gone, empty answer. Saving that fails leaves the previous settings unchanged. | P1 | Built |
| AIS-12 | **The first version's service carries over.** A single OpenAI-compatible service saved by the first build becomes a connection, and the Writer if it was. | P1 | Built |
| AIS-13 | **Don't send private notes.** A switch in Settings → AI, *Don't send private notes*, on by default. While it's on, Rewrite in a private note sends nothing: the dialog says "This note is private. Rewrite doesn't send private notes." and offers *Change in Settings*. Public notes aren't affected. A note counts as private when it's under the Private root (shared notes included) or is a browser instance's `private:` note. Main decides for itself from the note's path (under the workspace's `private/`, by its real path too) and refuses it; the window's view only picks the dialog's step (D-259; `ai-contract.test.ts` → consent and private notes). | P1 | In progress (main and the window's logic built; the dialog's case and the Settings switch are view changes queued with the integrating builder) |
| AIS-14 | **Consent before the first send.** The first time Rewrite sends to a connection, and again after its address, model or key changes, one confirmation names the service, its address and whether it's on this computer or in the cloud ("Cloud" for an Ollama model not known to run on this computer). *Send* goes ahead and is remembered for that connection; *Cancel* sends nothing and keeps the original. Main refuses to send without it (D-259). | P1 | In progress (main and the window's logic built; the dialog's consent case is a view change queued with the integrating builder) |
| AIS-15 | **Where it's kept.** `ai.json` in the app's data folder holds the connections (service, name, address, model, deployment, API version, account ID), the Writer, each sealed key and the last Test result. It's on the data inventory, per device, never synced or committed, and removed by deleting the data folder. | P1 | Built |

### Existing-area extensions

| ID | Requirement | Priority | Status |
| --- | --- | --- | --- |
| KEY-08 | Rewrite's key is Mod+Shift+R (Ctrl+Shift+R, ⇧⌘R) in the Writer layer; links stay on Mod+K on desktop and web. The Edit menu lists *Rewrite…*. | P1 | Built |
| SPT-09 | Spotlight lists *Rewrite…* with its key and runs it on the current selection, like any command; disabled while no note is ready or on the web. | P1 | Built, not checked by a test |
| UI-14 | The Rewrite dialog, the in-place stream's states and Settings → AI are view data built from design-system components (Dialog, TextField, Button, Menu, SecureKeyField), with no view-local HTML, CSS or literal strings; closing the dialog returns focus to the note. | P1 | Built |
| FOC-07 | The rainbow decoration never replaces or widens the paragraph focus band (D-232); the caret, selection and spelling underlines stay readable while it fades. | P1 | Not checked |
| HLP-10 | Help explains connecting a service, rewriting, stopping and undoing, and says Rewrite is desktop only. | P1 | Written (31 October) |
| PRV-05 | The data inventory lists `ai.json` (AIS-15). Prompts, selected text and answers are never logged, saved or committed by Focus Notes; only the note's own text changes, through normal saving. | P1 | Built |
| SEC-09 | Threat review of the AI IPC (`ai:*` handlers), address rules and redirects, `safeStorage`, the prompt framing and answer handling (plain text only, no HTML, no tools, no fetches from the answer). | P1 | Not done |
| PRF-15 | Rewrite's waits follow the wait inventory: the dialog opens within 100 ms, *Stop* and *Esc* put the original back within 100 ms, typing elsewhere in the app stays responsive while it streams. Measures `fn:rewrite.*`. | P1 | Not measured |
| QLT-08 | A Windows journey covers select → Ctrl+Shift+R → prompt → Generate → stream → undo and redo, Stop and an error, against a fake local service; no live services or keys in CI. | P1 | Not built |
| A11Y-03 | Rewrite and Settings → AI work by keyboard and with a screen reader: named controls, focus into the prompt and back to the note, announcements at start, stop, finish and error but never per token; contrast 4.5:1 for every frame of the gradient; reduced motion and forced colors need neither colour nor animation. | P1 | Partly built (announcements) |
| I18N-04 | Every Rewrite and AI settings word is a message key with plural-safe interpolation and no concatenated sentences. | P1 | Built |
| DSY-14 | The rainbow is DTCG tokens (`ref.rewrite.*`, `rewrite.*`, `cmp.editorSurface.rewrite.*`); the gallery shows the dialog's states and the stream's states in light, dark and contrast; VVS at least 70. | P1 | Tokens built; gallery and VVS not done |
| DOC-03 | The chain, requirements, work graph, roadmap, acceptance matrix and Help describe what's built and what isn't, and are updated in the same commit as each Rewrite increment (the owner, 31 October, 14:25). | P1 | Done (31 October) |
| LIC-03 | No AI SDK or runtime is a dependency: requests are made with the platform's `fetch`. Any future dependency is permissively licensed, audited and noticed; never paid Tiptap Content AI. | P1 | Built |

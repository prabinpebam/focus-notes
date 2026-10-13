# Requirements

This catalogue turns the [seed spec](../seed-specs.md) and the owner's later decisions ([Decisions](../plan/decisions.md), 2026-10-13) into testable requirements. Every requirement has a stable ID, a priority, the source it comes from, and the page that specifies it in detail. Requirements are the bottom link of [the articulation chain](spec/chain.md): each one is listed against the [user-can](spec/user-can.md) capabilities it builds, which trace up through [scenarios](spec/scenarios.md) to the [customer promises](spec/customer-promises.md).

> [!NOTE]
> **TL;DR.** 196 requirements in 25 areas. **P0** means the first usable release of its channel (the web app, then the desktop app), **P1** follows soon after, and **Later** marks planned extension points. Requirements marked *(derived)* aren't stated by the owner but are needed to meet one of their requirements, and each one says which. The owner's 2026-10-13 decisions added the desktop window and title bar (DSK), first run and sign-in (FRE), keyboard shortcuts (KEY), find and replace (FND), Spotlight (SPT), and licensing (LIC).

## Priority legend

| Priority | Meaning |
| --- | --- |
| **P0** | Needed for the first usable release of its channel: the web app's 1.0 (stages M0, M1, MW, M4, and M5) or the desktop app's first release (M2 and M3) (see [Roadmap](../plan/roadmap.md), D-85). |
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
| EDT-11 | Saving happens on its own (write to disk within 1 s; commit and push on <kbd>Mod</kbd>+<kbd>S</kbd>, switching or closing a note, quit, or 60 s with no typing). Only problems are shown. *(derived from EDT-01 and FIL-*; cadence in D-23)* | P0 |
| EDT-12 | A contextual formatting toolbar appears on any non-empty text selection: Turn into, Bold, Italic, Strikethrough, Code, Link. It never covers the selection and can be used from the keyboard (<kbd>⌥F10</kbd> / <kbd>Alt+F10</kbd>). See [Text formatting](../design/components/text-formatting.html). | P0 |
| EDT-13 | Link editor and link hover card: create, edit, open, copy, and remove links in place. Pasting a URL over selected text makes a link. | P0 |

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
| UI-01 | The default UI shows only the document and the trigger. No sidebars, visible title bars, or status bars. | P0 |
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
| UI-12 | Account pill: a small, muted pill in the bottom-left corner shows the signed-in GitHub name; pressing it offers the sync status, *Sync now*, and *Sign out*. When nobody is signed in, the same place shows a quiet *Sign in* link that opens Connect GitHub. Hidden where there's no GitHub connection (D-89). | P0 |

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

## Sharing and visibility (SHR)

Seed: *"Sharing of public links… content can be made public or private… Private content are hosted in a private repo which is a submodule."* Detailed in [Files and sharing](../experience/files-and-sharing.md) and [Repository and publishing](../architecture/repository-and-publishing.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| SHR-01 | Every note is **Private**, **Shared** (with named audiences), or **Public**. New notes are private by default. *(derived: safe default)* | P0 |
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
| PKG-03 | An Electron desktop app wraps the same web build, with native file-system and Git access, for people who want a dedicated desktop experience (D-80). | P0 |
| PKG-04 | The product repository builds and tests without any user workspace, credentials, or secrets. | P0 |
| PKG-05 | The web app is the primary way to use Focus Notes: each instance's *Deploy app* workflow publishes it to the instance's own GitHub Pages site (template instances deploy the released bundle; the project repository builds from source), and it runs in any modern browser with nothing to download (D-80, D-87). | P0 |
| PKG-06 | Nothing hosted or registered by the project: no OAuth app, client ID, server, or telemetry. Each user's instance needs only their own GitHub account plus the public release files on GitHub (D-21, D-87). | P0 |
| PKG-07 | Local first in the owner's browser: notes, settings, and the queue of unsynced changes live in IndexedDB, survive reloads, and work offline. The app asks the browser to keep its storage (`navigator.storage.persist`). On an instance's site, writing starts once the owner connects (D-82, D-88). | P0 |
| PKG-08 | Sync from the browser: public notes are committed to the instance repository and private notes to its private repository, through the GitHub REST API, several files in one commit per repository, and pulled on open, on focus, and every few minutes. A note changed in both places keeps both versions, so no text is ever lost (D-82, D-84). | P0 |
| PKG-09 | Visitor mode: someone who opens an instance without its owner's token sees only its public notes, read-only, with the note list. Private notes, editing, and syncing need the owner's token. Visitors also see **Use this app for yourself** (DST-01) (D-87). | P0 |

## Desktop app (DSK)

Owner: *"Our electron app will have 20px rounded corners with custom title bar."* Detailed in [Desktop app](../experience/desktop-app.html).

| ID | Requirement | Priority |
| --- | --- | --- |
| DSK-01 | On Windows and Linux the window has 20 px rounded corners, or square corners when maximized, snapped, or full screen. On macOS the window is native, with the system's own corners (D-14). | P0 |
| DSK-02 | A custom title bar: the top 44 px are a drag region with the trigger centered. Window controls (macOS traffic lights, app-drawn buttons on Windows and Linux) appear on hover or keyboard focus. | P0 |
| DSK-03 | Full window behavior: native on macOS. On Windows and Linux rebuilt by the app: moving, resizing from every edge and corner, double-click and drag-to-top maximize, restore by dragging, minimize, close, and remembered size and position. | P0 |
| DSK-04 | Full-screen mode (<kbd>⌃⌘F</kbd> / <kbd>F11</kbd>, and in ⋯). The title bar reappears when the pointer reaches the top edge. | P0 |
| DSK-05 | A full native menu bar on macOS that lists every command with its shortcut. | P0 |
| DSK-06 | Multiple windows, one note per window. | P1 |
| DSK-07 | Signed builds and automatic updates from GitHub Releases. | P1 |
| DSK-08 | Windows and Linux: edge and corner snapping with previews, a Snap Layouts picker on the maximize button, an app-drawn system menu (<kbd>Alt</kbd>+<kbd>Space</kbd>), a drawn shadow with a click-through margin, and correct behavior across monitors with different scaling. See [Desktop app](../experience/desktop-app.html#window-management-on-windows-and-linux). | P0 |

## First run and sign-in (FRE)

Owner: *"We need a sign in and setup flow for the electron app… device sign in… proper intuitive FRE… sign-in at the CLI level so that all the commit and push work."* Later: *"no hosting overhead… if OAuth requires developer app registration, it's a dealbreaker… everything owned by the end user."* Detailed in [First run and sign-in](../experience/first-run.md) and [Desktop and Git](../architecture/desktop-and-git.md).

| ID | Requirement | Priority |
| --- | --- | --- |
| FRE-01 | A guided first run (Welcome, Git, Sign in, Identity, Workspace, Make it yours, Ready) that can be done entirely by keyboard and resumed after quitting. | P0 |
| FRE-02 | Sign-in goes through Git's own sign-in helpers that the user owns, Git Credential Manager or GitHub CLI (both with a device code option), or a fine-grained token the user creates from a pre-filled GitHub link. There's no OAuth app and no registration (D-21). Declined, expired, and offline states recover. | P0 |
| FRE-03 | The credential lives only in Git's credential helper, so commits and pushes work in the app and from the user's terminal with one sign-in. The app keeps no copy of its own and holds API tokens in memory only. | P0 |
| FRE-04 | An existing working Git credential or GitHub CLI session is found and offered, skipping the device code. | P0 |
| FRE-05 | Git identity (name and email) is checked and, if missing, filled in from GitHub with the private noreply address. | P0 |
| FRE-06 | Workspace: create a new one (FRE-08), clone an existing one from GitHub (with the private submodule when the account can reach it), or open a local clone. | P0 |
| FRE-07 | Settings → Account: switch account, sign out (optionally removing Git's saved credential), and run setup again. | P0 |
| FRE-08 | *Set up my instance* (desktop): in the user's own GitHub account, make the repository from the Focus Notes template, the private repository, the submodule link, the read-only deploy key and Actions secret for share links, and GitHub Pages, each step retryable on its own (D-84). | P0 |
| FRE-09 | Web first run: the app knows its instance from its own Pages address. A browser that hasn't connected opens in visitor mode, with **I own this site: Connect GitHub** and **Use this app for yourself**. Connecting: make the private repository from a pre-filled GitHub page, make one fine-grained token for both repositories from a pre-filled GitHub link, paste it, and the app checks that it can write to this instance and links `private/` if it isn't linked yet. Resumable and reversible from Settings (sign out removes the token) (D-81, D-84, D-88). | P0 |

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
| SPT-04 | Commands and settings show their current state. The empty field shows recent notes and suggestions. No match offers create and find-in-all-notes. | P0 |
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
| SEC-03 | Credentials live only in Git's credential helper. API tokens are held in memory. Browser tokens are encrypted with a non-extractable key, or kept for the session. Tokens never appear in logs, URLs, or process arguments. | P0 |
| SEC-04 | Supply chain: lockfiles, Dependabot, CodeQL, secret scanning with push protection, actions pinned by SHA, release SBOM, checksums, and artifact attestations. | P0 |
| SEC-05 | Instances' workflows pin every action by commit SHA and verify the web app bundle by SHA-256 and attestation before deploying it. Updates arrive only as pull requests. | P0 |
| SEC-06 | Every Pages deploy runs the leak check and fails if private text or file names appear in the output. | P0 |
| SEC-07 | `SECURITY.md` and GitHub private vulnerability reporting, with acknowledgement within 7 days. Documented responses for leaked share secrets, keys, and tokens. | P0 |

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

## Quality (QLT)

Cross-cutting requirements serving CP-SAFE-01.

| ID | Requirement | Priority |
| --- | --- | --- |
| QLT-01 | The testing strategy runs in CI: unit, round-trip corpus, integration with real Git, end-to-end (web and Electron), visual regression, automated accessibility, input methods, and performance budgets. | P0 |
| QLT-02 | Every release is tested on the support matrix (OS versions, browsers, screen readers, keyboard layouts). | P0 |
| QLT-03 | A recovery journal means a crash loses at most about one second of typing, restored at next launch. | P0 |
| QLT-04 | Local diagnostics: redacted, rotated logs, *Copy diagnostic report*, and *Report a problem* (a pre-filled GitHub issue the user reviews). Nothing is sent automatically. | P0 |
| QLT-05 | Every wait a person feels has a named performance measure, and the main process records named spans for Git and content work, kept in memory and shown only in local diagnostics. `pnpm bench` runs Playwright on a throwaway Git copy of a fixture workspace (never real notes), and a committed budgets file with noise allowances supports `--compare` and `--check`, which fails CI on a regression. *(derived from QLT-01)* | P0 |

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
| DST-01 | **Use this app for yourself:** in visitor mode, a button opens a dialog that explains how Focus Notes works (your own independent instance in your own GitHub account, no server, nothing shared with the person whose site this is) and gives the steps: create a GitHub account, make your instance from the template, turn on GitHub Pages, and connect; plus **Download the desktop app** from the latest GitHub Release. The README says the same (D-87). | P0 |
| DST-02 | Start in the browser: copy the Focus Notes template repository (*Use this template*, or clone it; not the source repository) to make your instance, with no app to build, turn on GitHub Pages with GitHub Actions, and open your site; the app's first run does the rest (D-80, D-87). | P0 |
| DST-03 | A release pipeline in the project repository that builds the desktop installers for Windows, macOS, and Linux and the web app bundle, plus checksums, an SBOM, and attestations, into a draft GitHub Release with smoke tests. | P0 |
| DST-04 | Store listings: winget and Homebrew cask (and Flathub later), updated automatically from releases. | P1 |
| DST-05 | `.focus-notes/workspace.json` with `formatVersion`. Migrations ask first, and older apps refuse to write newer formats. | P0 |
| DST-06 | The instance template repository is generated from `templates/workspace/` at each release; its *Deploy app* workflow deploys the released web app bundle by version and checksum, and updates arrive as pull requests that move the version (D-87). | P0 |
| DST-07 | Stable and Beta update channels. | P1 |

# Roadmap

The stages in which Focus Notes gets built. Every stage ends with an app someone can install and use for real work, and every requirement belongs to exactly one stage. The work inside each stage is in the [Implementation plan](implementation-plan.md), what "done" means is in [Definition of done](definition-of-done.md), and how agents carry the work is in [The agentic loop](agentic-loop.html). There are no dates, because neither the seed spec nor the owner has set any.

> [!NOTE]
> **TL;DR.** Ten stages, each a vertical slice that leaves something usable. **M0** runs: an installable skeleton that saves a note. **M1** writes: the full editor, focus mode, themes, and find. **MW** is your Focus Notes on GitHub Pages: write in any browser with no account, kept in that browser, and read your site's public notes and, once unlocked, your private ones (D-80, D-90). **M3** makes the desktop app the one place that saves to GitHub (sign-in through Git's own tools, your instance, commits and sync), and **M2** gives it the real desktop window (D-85, D-90). **M4** adds Spotlight and the theme manager. **M5** publishes public links and shares, and is **version 1.0**. Then **M7** agents, **M8** polish, and later the image and gallery components. Each stage exits only when its demo script passes on clean machines, its definition of done is met, and the owner accepts it. Every demo script then becomes an automated journey test, so earlier progress can't silently break.

## Stages at a glance

| Stage | In short | Used by | Delivered as | Requirements |
| --- | --- | --- | --- | --- |
| **M0: Walking skeleton** | It runs. | The team, on their own computers | Preview 0.0.x on GitHub Releases (pre-release, unsigned) | 29 |
| **M1: Writing** | Write a real document. | The owner, for real documents | Preview 0.1.x | 56 |
| **MW: Your Focus Notes on GitHub Pages** | Your notes in any browser, from your own site. | The owner, then anyone | Preview 0.2.x | 22 |
| **M3: Desktop sign-in and Git** | Your instance on your computer. | The owner, then invited testers | Preview 0.3.x | 21 |
| **M2: The desktop app** | A dedicated desktop experience. | The owner, then invited testers | Preview 0.3.x | 9 |
| **M4: Find anything, make it yours** | Everything is one keystroke away. | Invited testers | Preview 0.4.x | 13 |
| **M5: Publish and share** | Version 1.0. | Anyone | 1.0 stable on GitHub Releases | 19 |
| **M7: Agents** | Your agents can help, safely. | Anyone | 1.2 | 8 |
| **M8: Polish and pro features** | Make it yours, fully. | Anyone | 1.x | 22 |
| **Later: Components** | Rich components. | Anyone | Later releases | 2 |

## Where we are

### Current state (16 October, evening)

The short, current list for anyone picking up the work; the stage-by-stage history follows below. Statuses live in [`work-graph.json`](work-graph.json).

- **Built and on `main`, in the owner's Preview:** M0 to M7 are built and verifying. Today added custom themes (WP-8.2, slices 1–3), toolbar and keybinding customization (WP-8.3), Files sort and note history (WP-8.4), Open in new window (WP-8.5), the save-overwrite fix (DEF-26), the slash menu fix (DEF-25), Ctrl+= widening the column, block spacing (D-183), and tables that fill the column, insert on a border, resize by dragging and switch between Fit to column and Bleed to edge (D-182).
- **Live on GitHub Pages:** the landing page, the demo at `/demo/`, the owner's app at `/app/`, and Help as a section of these docs (D-167, D-174, D-176, D-177, D-181).
- **Partly built:**
  - **WP-8.2 custom themes:** rename, import, generate from one color, shuffle, export.
  - **WP-8.4 workspace pro:** last-changed time on rows, replace across notes (FND-05), Spotlight filters and a preview pane (SPT-06).
  - **WP-8.5 multiple windows:** <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd>, reopening the same windows at launch, the macOS Window menu.
  - **WP-8.8 document minimap (D-185, D-186):** built on the `fix-state-note` branch (17 October) with its code, accessibility and design-system reviews addressed, and the owner's docking added: Files and the contents dock flush to the window's edges, resizable, Files undocking first as the window narrows (*Dock contents*, D-186, D-187). Waiting for its Windows CI run and the owner's look. It stays in focus mode, which is on by default. Follow-ups: a setting to turn it off, an exit fade for the card, PopoverPanel's own hover-close delay reading `wait.hoverClose`, and, on Linux only (D-112, report-only), an axe `label-content-name-mismatch` in the ⋯ menu that's new on this branch (m1-toolbar and m1-a11y; Windows and macOS pass).
  - **WP-8.10 backup by repository (D-191):** Private and Public in Files each show their repository's backup icon and card, counting what waits there (empty folders too), with *Back up to GitHub* for that repository. Built on `wp-repo-backup` (18 October); waiting for its Windows CI run and the owner's look.
  - **WP-5.6, WP-5.7, WP-6.2:** loose ends.
- **Not started:**
  - WP-8.6 signing, updates, channels and stores (needs the owner's certificates);
  - WP-8.7 more interface languages;
  - WP-9.1 image block and WP-9.2 gallery block.
- **Product site:**
  - WP-10.2 and WP-10.3: the eight Help sections exist but have no articles yet;
  - WP-10.5: downloads need real installers (WP-8.6);
  - WP-10.7: the app's Learn more links aren't wired yet.
- **Open defects and polish:**
  - Note history briefly says it needs Git before Git has started; it should say it's getting ready.
  - Typing in a 50,000-word note, or in very large tables with wrapping cells, misses its budget locally. Virtualising what's off screen would fix it.
  - Intermittent CI journeys: the real-cursor drag helper never starting (`m5-snappy`), the first-run card (`m1-a11y`), `wp83-customize`, `dsk09-frames`, `m1-tables` (DEF-27).
  - The white window margin (D-153) needs a look on the owner's hardware.
- **Crash recovery made isolated (WP-8.9, D-190, 18 October):** the recovery journal recreated four notes under names they'd held during title renames, and committed them. The plan and a benchmark of how other editors recover are in [Crash recovery](../architecture/crash-recovery.md); its hotfix (S0) comes first.
- **Waiting on the owner:** D-158 (where new notes go without a private repository), the look without a GPU (D-151 (13)), and the anchored setup card.
- **Suggested next, in order:** finish WP-8.5 and WP-8.4, the image block (WP-9.1), then the Help articles (WP-10.3).
- **How to work:** read the project context at the top of [`AGENTS.md`](../../AGENTS.md) first. This is the owner's hobby project in development: do what they ask directly, gate a change only on the checks that cover it (D-180), and keep only the real safety rules (their notes, privacy, their computer).

### History
**M0 (walking skeleton) is built** and passes its demo as automated journey tests on Windows: the app opens to the canvas with the trigger, saves what you type as Markdown, reopens it, keeps untouched files byte-identical, and makes no network requests. CI passes on Windows, macOS, and Linux, and the preview release `v0.0.1` is ready for the owner's gate.

**M1 (Writing) is built and awaits the owner's gate.** Every M1 work package is built and verifying, and the M1 demo runs as two journeys, one with the pointer and one with the keyboard alone (WP-1.11). Built: every block type with Markdown shortcuts, task lists, undo and redo, and per-block text direction (WP-1.1); the trigger's toolbar with the six default actions and the ⋯ menu, keyboard-complete and command-driven, with text size, theme mode, focus mode on and off, full screen, and new notes (WP-1.6, with WP-1.4's first compound components); and **focus mode** itself (WP-1.7): only the caret's visual row at full strength, following the caret, widening for selections, instant with reduced motion, on by default, with keystroke-to-paint p95 of about 7 ms in a 50,000-word note. Scrollbars are minimal and hidden until you scroll or point at them, without moving the text (UI-09). The **keymap** (WP-1.8): the Basic and Writer layers for the app and the editor on every platform, with web substitutes, layout-aware and IME- and AltGr-safe matching, and a searchable **cheat sheet** (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd>) with layer and platform filters, the first dialog built from the new Dialog, SearchField, SegmentedControl, and Shortcut components (WP-1.4). **Themes** (WP-1.9): ten built-in themes (Paper, Sepia, Harbor, Forest, and High contrast for light; Ink, Dusk, Harbor, Forest, and High contrast for dark), chosen separately for light and dark, each passing the contrast guard; five bundled content fonts; Windows contrast themes, the contrast mode, 200% zoom with 320 px reflow, and UI scale. **Find and replace** (WP-1.10): <kbd>Mod</kbd>+<kbd>F</kbd> and <kbd>⌥⌘F</kbd> / <kbd>Ctrl+H</kbd>, filled from the selection, a live count, case, whole-word, and regex toggles, accent-insensitive matching, recent searches, replace current and replace all as one undo step that keeps formatting. **Waits and feedback** (WP-1.4): one task tracker for every wait (nothing under 300 ms, a sign held at least 500 ms, announced after 1 s), toasts with an action, pause on hover, and <kbd>F6</kbd>, and the remaining first-set components (ResultList, Tabs, Field, Spinner). **Inline formatting and links** (WP-1.2): select text and a frosted **formatting toolbar** appears above it (never over it) with Turn into, Bold, Italic, Strikethrough, Code, and Link, half-pressed for a mixed selection, gone as soon as you type, and reachable with <kbd>Alt+F10</kbd>; <kbd>Mod</kbd>+<kbd>K</kbd> opens the **link editor** in place, a **hover card** opens, copies, edits, and removes links, pasting a web address over selected text links it, and links open only through the shell, never in the app window; `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, and `[text](url)` format as you type. **Slash menu and paste** (WP-1.3, D-93): typing `/` at the start of a block or after a space opens a **block menu** under it, built from the block registry, filtered by names and synonyms as you type, driven by the arrow keys, <kbd>Enter</kbd>, and <kbd>Tab</kbd> while focus stays in the note, and closed by <kbd>Esc</kbd> with the typed text kept; it never opens in code. **Paste** reads Markdown text as blocks and HTML from web pages, Word, and Google Docs as the nearest Markdown, degrades what isn't supported yet to plain text, says so when images are left out, and <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> pastes plain text as it is. Pasted HTML is **sanitized** (DOMPurify) before anything parses it, raw HTML in notes stays text, links keep only safe schemes, and both shells run under **Trusted Types**. **Loop-style tables** (WP-1.5, D-96): `/table` or a typed GFM header and delimiter row makes a table; hovering shows row and column **handles** (menus to insert, move, align, clear, and delete, and drag to reorder), a **+ insertion point** at the nearest edge boundary, and **New row** and **New column** bars; <kbd>Tab</kbd>, <kbd>Enter</kbd>, and the row keys move and add rows; <kbd>Esc</kbd> selects cells and <kbd>Shift</kbd>+<kbd>F10</kbd> opens a cell menu with every action, so the keyboard reaches them all; cells keep inline formatting and only ever one line; copying a range gives spreadsheets tab-separated text and documents HTML and Markdown, and a pasted spreadsheet range fills cells and grows the table. Tables save as padded GFM pipe tables, and untouched ones byte for byte. Search shows as unavailable until Spotlight (M4). The **⋯ menu** (WP-1.6, D-100) also lists Share and visibility, Settings, and Help and docs, unavailable and saying why until their stages. **Hardening** (WP-1.11, D-100): an accessibility audit of every surface in every built-in theme and in forced colors (axe, 24 px targets, visible focus, 320 px reflow, reduced motion), with what it found fixed; opening a 10,000-word note in about 50 ms and writing a burst of typing about 0.6 s after the last key (PRF-03, in `pnpm bench`); and typing in a 200 × 10 table whose cells all wrap at about 18 ms keystroke to paint. The screen-reader passes are the owner's scripted checklist at the gate.

**MW is under way** (D-80, D-87, D-90): the web app deploys to an instance's own GitHub Pages with the *Deploy app* workflow. Notes written in the browser stay in that browser (IndexedDB, offline, no account), and *Export my notes* and *Import notes* move them as one bundle (WP-6.1). The workflow publishes `notes/` with an index, and a first visit opens the newest public note read-only, with *Copy to my notes* (WP-6.3). The owner's private notes are sealed at each deploy as the vault, a share grant with an audience of one; the browser unlocks them read-only with the passphrase, and can remember the key, and the leak check guards every deploy (WP-6.4, `packages/seal`). Visitors see the public notes and *Use this app for yourself* (WP-6.2); its template repository arrives with WP-5.6. The browser no longer signs in to GitHub at all: the desktop app (M3, next) becomes the only place that writes to your repository. Next: files and folders (WP-2.3 to WP-2.5).

**M3 is under way** (D-97 to D-103): the desktop app is the one place that saves to GitHub. A seven-screen first run signs in through Git's own helpers and sets up the instance (WP-3.1, WP-3.2); notes are committed and pushed as you write, public and private notes live in their own repositories, conflicts are settled side by side, and deleted notes come back from Recently deleted (WP-3.3 to WP-3.5). **Settings** (<kbd>Mod</kbd>+<kbd>,</kbd>) has Account and Workspace: sign out, with or without Git's own sign-in, switch account, run setup again, and remove the workspace from this computer once everything is on GitHub, deleting exactly what the [data inventory](../architecture/security-and-privacy.md#data-inventory) lists (WP-3.6).

**M4 is built and verifying** (D-107 to D-111): a search index in a worker reads every note, its headings, the commands, and the settings, and keeps up as notes change (WP-4.1). **Spotlight** (<kbd>Mod</kbd>+<kbd>/</kbd>) is one ranked list of notes, headings, text, folders, commands, and settings, with live states, quick actions, modes and prefixes, and quick open (<kbd>Mod</kbd>+<kbd>P</kbd>); with the field empty it is the action center, listing every action after recent notes, so the arrow keys and <kbd>Enter</kbd> run any of them (WP-4.2, D-109, D-111). **Find in all notes** (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) lists every match with its note and opens each in place (WP-4.3, D-110), in the same ResultList as Spotlight. The **theme manager** previews and chooses themes, edits a theme's colors behind a contrast guard with a one-click fix, and sets reading preferences, from Settings → Appearance (WP-4.5, D-108). On the macOS menu bar Spotlight is in Go and File, Find in all notes in Edit → Find, and Theme… in View. WP-4.1, WP-4.2, WP-4.3, and WP-4.5 await verification; the power shortcut layer (WP-4.4) is next.

**Windows first** (D-112): until the owner has used and accepted the Windows app, only Windows had to pass; macOS and Linux ran in CI without blocking. The platform parity pass (19 October, D-193 to D-196) made macOS and Linux pass every journey, and since then CI gates on all three.

## Staging principles

1. **Usable, not just visible.** Each stage ends with an installable build that does a real job end to end, not a set of component demos.
2. **Vertical slices.** Each stage goes through every layer it needs: design system, views, commands, storage, tests, and docs.
3. **Risk first.** The biggest unknowns are spiked in M0 (the Markdown round trip, the Windows window, the UI runtime). Local writing comes before Git, and Git comes before publishing, so the riskiest data paths are proven before anything is public.
4. **The quality bar never waits.** Everything a stage ships meets the full [definition of done](definition-of-done.md). There is no "hardening later" for safety, accessibility, performance, or the design system.
5. **Progress can't regress.** Every stage's demo script becomes an automated journey test that runs on every later build.
6. **Visible every day.** Every merge to `main` produces a nightly build. Every stage exit produces a preview release on GitHub Releases. M5 is the first stable release.

## Stages

<ol class="slate-steps slate-steps--timeline">
<li class="slate-step">
<p class="slate-step__title">M0: Walking skeleton (It runs)</p>
<p>A preview app for Windows, macOS, and Linux opens to the blank canvas with the trigger. You can type paragraphs and headings into a Markdown file you chose, it saves on its own, and the note is back when you reopen the app. <a href="implementation-plan.md#m0">Details</a>. AGT-08, DOC-01, DOC-02, DSY-01, DSY-02, DSY-04, DSY-05, DSY-07, DSY-08, DSY-10, DSY-11, EDT-01, EXT-01, I18N-01, LIC-01, LIC-02, PKG-01, PKG-03, PKG-04, PKG-06, PRF-02, PRV-01, QLT-01, QLT-05, SEC-01, SEC-04, SEC-07, UI-01, UI-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M1: Writing (Write a real document)</p>
<p>Open or create a Markdown file and write a real document: blocks, Markdown shortcuts, inline formatting with the contextual toolbar, links, the slash menu, Loop-style tables, the trigger toolbar and ⋯ menu, focus mode, Light, Dark, and System themes, font size, find and replace, and the Basic and Writer shortcut layers with the cheat sheet. <a href="implementation-plan.md#m1">Details</a>. A11Y-01, A11Y-02, DSY-03, DSY-06, DSY-09, DSY-12, EDT-02 to EDT-06, EDT-08 to EDT-10, EDT-12, EDT-13, EXT-02, EXT-05, FND-01, FND-02, FOC-01 to FOC-06, I18N-02, KEY-02, KEY-05, KEY-06, PRF-01, PRF-03, PRF-08, SEC-02, TBL-01 to TBL-03, TBL-05 to TBL-08, TBL-10, TBL-11, THM-01 to THM-03, THM-06, THM-08, UI-03 to UI-07, UI-09 to UI-11.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">MW: Your Focus Notes on GitHub Pages (Your notes in any browser, from your own site)</p>
<p>Your instance (made from the template, or the project repository for its owner) deploys the app to its own GitHub Pages site. Write at once with no account: notes written in the browser stay in that browser and work offline. Read your site's public notes, unlock your private notes read-only with your passphrase, copy any note into your browser notes to edit it, and export your browser notes for the desktop app. Visitors see only public notes and *Use this app for yourself*. Create, rename, delete, and move notes and folders in the Files panel. The browser never signs in to GitHub (D-90). <a href="implementation-plan.md#mw">Details</a>. DST-01, DST-02, DST-05, FIL-01 to FIL-03, FIL-07 to FIL-09, FRE-09, PKG-05, PKG-07 to PKG-11, PRF-09, PRF-11, SEC-06, SEC-08, SHR-04, UI-12.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3: Desktop sign-in and Git (Your instance on your computer)</p>
<p>The desktop app is the only place that writes to GitHub (D-90). Its first run signs in through Git's own tools and sets up or clones your instance, including the vault passphrase; from then on every change is saved as Git commits and synced, notes are private or public, notes exported from a browser can be imported, conflicts are resolved without loss, and deleted notes can be restored. <a href="implementation-plan.md#m3">Details</a>. AGT-07, EDT-11, FIL-05, FIL-06, FIL-10, FIL-12, FRE-01 to FRE-08, FRE-10, PRF-07, PRV-02, PRV-03, SEC-03, SHR-01, SHR-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2: The desktop app (A dedicated desktop experience)</p>
<p>The Electron app for people who want a dedicated desktop experience: the real desktop window (20 px corners and app-built window management on Windows and Linux, the native window and full menu bar on macOS), full screen, crash recovery, and resource budgets. <a href="implementation-plan.md#m2">Details</a>. DSK-01 to DSK-05, DSK-08, PRF-04, PRF-10, QLT-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4: Find anything, make it yours (Everything is one keystroke away)</p>
<p>Spotlight on <kbd>Mod</kbd>+<kbd>/</kbd> finds notes, headings, text, folders, commands, and settings, and acts on them. Quick open, find in all notes, the complete Power shortcut layer, and the theme manager with live preview and the contrast guard. <a href="implementation-plan.md#m4">Details</a>. FIL-04, FND-04, KEY-01, KEY-03, SPT-01 to SPT-05, SPT-07, SPT-08, THM-07, THM-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5: Publish and share (Version 1.0)</p>
<p>The first public release. Public notes are published to your own GitHub Pages site. Private notes and folders can be shared with named audiences through magic links and passcodes. Visitors' *Use this app for yourself* dialog links to the downloads, and every release ships with checksums, an SBOM, and attestations. <a href="implementation-plan.md#m5">Details</a>. DSK-09, DST-03, DST-06, DST-08, EDT-14, PKG-02, PKG-12, PRF-05, PRF-06, PRF-12, PRF-13, PRF-14, PRV-04, QLT-02, QLT-04, QLT-07, SEC-05, SHR-03, SHR-05 to SHR-11.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7: Agents (Your agents can help, safely)</p>
<p>A local MCP server, permissions you control, attributed and undoable agent changes, the <code>focus-notes</code> command-line tool with JSON output, <code>focus-notes://</code> deep links, and the published design-system catalog. <a href="implementation-plan.md#m7">Details</a>. AGT-01 to AGT-06, AGT-09, DSY-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">MH: The product site and help (Know what you're getting)</p>
<p>The project's GitHub Pages site becomes the product site: a landing page with real screenshots and an honest pitch, a help centre of plain-language articles the app links to from <em>Learn more</em>, troubleshooting for every problem the app can show, downloads for each system, and a demo in the browser. <a href="implementation-plan.md#mh">Details</a>. HLP-01 to HLP-09.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M8: Polish and pro features (Make it yours, fully)</p>
<p>Block handle, column alignment and sorting, the Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, custom and generated themes, synced appearance, multiple windows, a document minimap, signed builds with automatic updates and channels, store listings, more interface languages, and isolated crash recovery. <a href="implementation-plan.md#m8">Details</a>. DSK-06, DSK-07, DST-04, DST-07, EDT-07, FIL-11, FIL-13, FIL-14, FND-03, FND-05, I18N-03, KEY-04, KEY-07, QLT-06, SPT-06, TBL-04, TBL-09, THM-04, THM-05, THM-09 to THM-12, UI-08, UI-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later: Components (Rich components)</p>
<p>Image, then gallery, each added as one block registration with directive syntax. <a href="implementation-plan.md#later">Details</a>. EXT-03, EXT-04.</p>
</li>
</ol>

## Changing the plan

The stage of a requirement changes here and in the [implementation plan](implementation-plan.md) together, and the plan check confirms that every requirement still belongs to exactly one work package. A change that moves a P0 requirement out of M0 to M5 needs an owner decision in [Decisions](decisions.md).

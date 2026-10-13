# Roadmap

The stages in which Focus Notes gets built. Every stage ends with an app someone can install and use for real work, and every requirement belongs to exactly one stage. The work inside each stage is in the [Implementation plan](implementation-plan.md), what "done" means is in [Definition of done](definition-of-done.md), and how agents carry the work is in [The agentic loop](agentic-loop.html). There are no dates, because neither the seed spec nor the owner has set any.

> [!NOTE]
> **TL;DR.** Ten stages, each a vertical slice that leaves something usable. **M0** runs: an installable skeleton that saves a note. **M1** writes: the full editor, focus mode, themes, and find. **MW** is your Focus Notes on GitHub Pages: one repository with public notes and a private submodule, files and folders, written in any browser and synced (D-80, D-84). **M4** adds Spotlight and the theme manager. **M5** publishes public links and shares, and is **version 1.0**. Then the desktop app: **M2** the desktop window and **M3** desktop sign-in and Git (D-85), **M7** agents, **M8** polish, and later the image and gallery components. Each stage exits only when its demo script passes on clean machines, its definition of done is met, and the owner accepts it. Every demo script then becomes an automated journey test, so earlier progress can't silently break.

## Stages at a glance

| Stage | In short | Used by | Delivered as | Requirements |
| --- | --- | --- | --- | --- |
| **M0: Walking skeleton** | It runs. | The team, on their own computers | Preview 0.0.x on GitHub Releases (pre-release, unsigned) | 29 |
| **M1: Writing** | Write a real document. | The owner, for real documents | Preview 0.1.x | 56 |
| **MW: Your Focus Notes on GitHub Pages** | The seed's main workflows, in any browser. | The owner, then anyone | Preview 0.2.x | 20 |
| **M4: Find anything, make it yours** | Everything is one keystroke away. | Invited testers | Preview 0.4.x | 13 |
| **M5: Publish and share** | Version 1.0. | Anyone | 1.0 stable on GitHub Releases | 20 |
| **M2: The desktop app** | A dedicated desktop experience. | Anyone who prefers it | 1.x | 9 |
| **M3: Desktop sign-in and Git** | Your instance on your computer. | Anyone who prefers it | 1.x | 16 |
| **M7: Agents** | Your agents can help, safely. | Anyone | 1.2 | 8 |
| **M8: Polish and pro features** | Make it yours, fully. | Anyone | 1.x | 22 |
| **Later: Components** | Rich components. | Anyone | Later releases | 2 |

## Where we are

**M0 (walking skeleton) is built** and passes its demo as automated journey tests on Windows: the app opens to the canvas with the trigger, saves what you type as Markdown, reopens it, keeps untouched files byte-identical, and makes no network requests. CI passes on Windows, macOS, and Linux, and the preview release `v0.0.1` is ready for the owner's gate.

**M1 is under way.** Built so far: every block type with Markdown shortcuts, task lists, undo and redo, and per-block text direction (WP-1.1); the trigger's toolbar with the six default actions and the ⋯ menu, keyboard-complete and command-driven, with text size, theme mode, focus mode on and off, full screen, and new notes (WP-1.6, with WP-1.4's first compound components); and **focus mode** itself (WP-1.7): only the caret's visual row at full strength, following the caret, widening for selections, instant with reduced motion, on by default, with keystroke-to-paint p95 of about 7 ms in a 50,000-word note. Scrollbars are minimal and hidden until you scroll or point at them, without moving the text (UI-09). The **keymap** (WP-1.8): the Basic and Writer layers for the app and the editor on every platform, with web substitutes, layout-aware and IME- and AltGr-safe matching, and a searchable **cheat sheet** (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd>) with layer and platform filters, the first dialog built from the new Dialog, SearchField, SegmentedControl, and Shortcut components (WP-1.4). **Themes** (WP-1.9): ten built-in themes (Paper, Sepia, Harbor, Forest, and High contrast for light; Ink, Dusk, Harbor, Forest, and High contrast for dark), chosen separately for light and dark, each passing the contrast guard; five bundled content fonts; Windows contrast themes, the contrast mode, 200% zoom with 320 px reflow, and UI scale. **Find and replace** (WP-1.10): <kbd>Mod</kbd>+<kbd>F</kbd> and <kbd>⌥⌘F</kbd> / <kbd>Ctrl+H</kbd>, filled from the selection, a live count, case, whole-word, and regex toggles, accent-insensitive matching, recent searches, replace current and replace all as one undo step that keeps formatting. **Waits and feedback** (WP-1.4): one task tracker for every wait (nothing under 300 ms, a sign held at least 500 ms, announced after 1 s), toasts with an action, pause on hover, and <kbd>F6</kbd>, and the remaining first-set components (ResultList, Tabs, Field, Spinner). Search shows as unavailable until Spotlight (M4).

**MW is built** (D-80): the web app deploys to the repository's own GitHub Pages with the *Deploy app* workflow, so every copy of the repository is its own instance. It writes locally first in IndexedDB, offline included, and after *Connect GitHub* (a notes repository and a fine-grained token, both from pre-filled GitHub pages) it syncs both ways through the GitHub API, one commit per push, keeping both versions on a conflict. Browser journeys cover the first run, connecting, syncing, conflicts, and offline.

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
<p class="slate-step__title">MW: Your Focus Notes on GitHub Pages (The seed's main workflows, in any browser)</p>
<p>Your instance (made from the template, or the project repository for its owner) deploys the app to its own GitHub Pages site. Write at once, locally and offline; connect GitHub once with a token from a pre-filled link, and public notes sync to `notes/` in your repository and private notes to its `private/` repository. Visitors see only public notes and *Use this app for yourself*. Create, rename, delete, and move notes and folders in the Files panel, and make notes public or private. <a href="implementation-plan.md#mw">Details</a>. DST-01, DST-02, DST-05, FIL-01 to FIL-03, FIL-06 to FIL-09, FRE-09, PKG-05, PKG-07 to PKG-09, PRF-09, PRF-11, PRV-03, SHR-01, SHR-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4: Find anything, make it yours (Everything is one keystroke away)</p>
<p>Spotlight on <kbd>Mod</kbd>+<kbd>/</kbd> finds notes, headings, text, folders, commands, and settings, and acts on them. Quick open, find in all notes, the complete Power shortcut layer, and the theme manager with live preview and the contrast guard. <a href="implementation-plan.md#m4">Details</a>. FIL-04, FND-04, KEY-01, KEY-03, SPT-01 to SPT-05, SPT-07, SPT-08, THM-07, THM-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5: Publish and share (Version 1.0)</p>
<p>The first public release. Public notes are published to your own GitHub Pages site. Private notes and folders can be shared with named audiences through magic links and passcodes. The Get started page offers the downloads, and every release ships with checksums, an SBOM, and attestations. <a href="implementation-plan.md#m5">Details</a>. DST-03, DST-06, PKG-02, PRF-05, PRF-06, PRF-12, PRV-04, QLT-02, QLT-04, SEC-05, SEC-06, SHR-03 to SHR-11.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2: The desktop app (A dedicated desktop experience)</p>
<p>The Electron app for people who want a dedicated desktop experience: the real desktop window (20 px corners and app-built window management on Windows and Linux, the native window and full menu bar on macOS), full screen, crash recovery, and resource budgets. <a href="implementation-plan.md#m2">Details</a>. DSK-01 to DSK-05, DSK-08, PRF-04, PRF-10, QLT-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3: Desktop sign-in and Git (Your instance on your computer)</p>
<p>The desktop first run signs in through Git's own tools and sets up or clones your instance; from then on every change on the desktop is saved as Git commits and synced, conflicts are resolved without loss, and deleted notes can be restored. <a href="implementation-plan.md#m3">Details</a>. AGT-07, EDT-11, FIL-05, FIL-10, FIL-12, FRE-01 to FRE-08, PRF-07, PRV-02, SEC-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7: Agents (Your agents can help, safely)</p>
<p>A local MCP server, permissions you control, attributed and undoable agent changes, the <code>focus-notes</code> command-line tool with JSON output, <code>focus-notes://</code> deep links, and the published design-system catalog. <a href="implementation-plan.md#m7">Details</a>. AGT-01 to AGT-06, AGT-09, DSY-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M8: Polish and pro features (Make it yours, fully)</p>
<p>Block handle, column alignment and sorting, the Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, custom and generated themes, synced appearance, multiple windows, signed builds with automatic updates and channels, store listings, and more interface languages. <a href="implementation-plan.md#m8">Details</a>. DSK-06, DSK-07, DST-04, DST-07, EDT-07, FIL-11, FIL-13, FND-03, FND-05, I18N-03, KEY-04, KEY-07, SPT-06, TBL-04, TBL-09, THM-04, THM-05, THM-09 to THM-12, UI-08.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later: Components (Rich components)</p>
<p>Image, then gallery, each added as one block registration with directive syntax. <a href="implementation-plan.md#later">Details</a>. EXT-03, EXT-04.</p>
</li>
</ol>

## Changing the plan

The stage of a requirement changes here and in the [implementation plan](implementation-plan.md) together, and the plan check confirms that every requirement still belongs to exactly one work package. A change that moves a P0 requirement out of M0 to M5 needs an owner decision in [Decisions](decisions.md).

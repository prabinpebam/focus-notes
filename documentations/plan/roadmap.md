# Roadmap

The stages in which Focus Notes gets built. Every stage ends with an app someone can install and use for real work, and every requirement belongs to exactly one stage. The work inside each stage is in the [Implementation plan](implementation-plan.md), what "done" means is in [Definition of done](definition-of-done.md), and how agents carry the work is in [The agentic loop](agentic-loop.html). There are no dates, because neither the seed spec nor the owner has set any.

> [!NOTE]
> **TL;DR.** Ten stages, each a vertical slice that leaves something usable. **M0** runs: an installable skeleton that saves a note. **M1** writes: the full editor, focus mode, themes, and find. **M2** is a daily driver for local folders, with the real desktop window. **M3** syncs your notes through your own GitHub. **M4** adds Spotlight and the theme manager. **M5** publishes and shares, and is **version 1.0**. Then **M6** the browser, **M7** agents, **M8** polish, and later the image and gallery components. Each stage exits only when its demo script passes on clean machines, its definition of done is met, and the owner accepts it. Every demo script then becomes an automated journey test, so earlier progress can't silently break.

## Stages at a glance

| Stage | In short | Used by | Delivered as | Requirements |
| --- | --- | --- | --- | --- |
| **M0: Walking skeleton** | It runs. | The team, on their own computers | Preview 0.0.x on GitHub Releases (pre-release, unsigned) | 29 |
| **M1: Writing** | Write a real document. | The owner, for real documents | Preview 0.1.x | 53 |
| **M2: Desktop and local folders** | Use it every day, offline. | The owner, daily, on one computer | Preview 0.2.x | 18 |
| **M3: Your notes on GitHub** | Sign in, and your notes follow you. | The owner and a few invited testers, on several computers | Preview 0.3.x | 20 |
| **M4: Find anything, make it yours** | Everything is one keystroke away. | Invited testers | Preview 0.4.x | 13 |
| **M5: Publish and share** | Version 1.0. | Anyone | 1.0 stable on GitHub Releases | 21 |
| **M6: The browser** | Write from any browser. | Anyone | 1.1 | 2 |
| **M7: Agents** | Your agents can help, safely. | Anyone | 1.2 | 8 |
| **M8: Polish and pro features** | Make it yours, fully. | Anyone | 1.x | 22 |
| **Later: Components** | Rich components. | Anyone | Later releases | 2 |

## Where we are

**M0 (walking skeleton) is built** and passes its demo as automated journey tests on Windows: the app opens to the canvas with the trigger, saves what you type as Markdown, reopens it, keeps untouched files byte-identical, and makes no network requests. It's being verified in CI on macOS and Linux before its gate.

**M1 is under way.** Built so far: every block type with Markdown shortcuts, task lists, undo and redo, and per-block text direction (WP-1.1); the trigger's toolbar with the six default actions and the ⋯ menu, keyboard-complete and command-driven, with text size, theme mode, focus mode on and off, full screen, and new notes (WP-1.6, with WP-1.4's first compound components); and **focus mode** itself (WP-1.7): only the caret's visual row at full strength, following the caret, widening for selections, instant with reduced motion, on by default, with keystroke-to-paint p95 of about 7 ms in a 50,000-word note. Search shows as unavailable until Spotlight (M4).

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
<p>A preview app for Windows, macOS, and Linux opens to the blank canvas with the trigger. You can type paragraphs and headings into a Markdown file you chose, it saves on its own, and the note is back when you reopen the app. <a href="implementation-plan.md#m0">Details</a>. EDT-01, EXT-01, UI-01, UI-02, PKG-01, PKG-03, PKG-04, PKG-06, LIC-01, LIC-02, DOC-01, DOC-02, AGT-08, SEC-01, SEC-04, SEC-07, PRV-01, PRF-02, QLT-01, QLT-05, I18N-01, DSY-01, DSY-02, DSY-04, DSY-05, DSY-07, DSY-08, DSY-10, DSY-11.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M1: Writing (Write a real document)</p>
<p>Open or create a Markdown file and write a real document: blocks, Markdown shortcuts, inline formatting with the contextual toolbar, links, the slash menu, Loop-style tables, the trigger toolbar and ⋯ menu, focus mode, Light, Dark, and System themes, font size, find and replace, and the Basic and Writer shortcut layers with the cheat sheet. <a href="implementation-plan.md#m1">Details</a>. EDT-02 to EDT-06, EDT-08 to EDT-10, EDT-12, EDT-13, TBL-01 to TBL-03, TBL-05 to TBL-08, TBL-10, TBL-11, EXT-02, EXT-05, UI-03 to UI-07, FOC-01 to FOC-06, THM-01 to THM-03, THM-06, THM-08, KEY-02, KEY-05, KEY-06, FND-01, FND-02, SEC-02, PRF-01, PRF-03, PRF-08, A11Y-01, A11Y-02, I18N-02, DSY-03, DSY-06, DSY-09, DSY-12.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2: Desktop and local folders (Use it every day, offline)</p>
<p>The real desktop window (20 px corners and app-built window management on Windows and Linux, the native window and full menu bar on macOS), full screen, and a folder of notes managed in the Files panel, with link updates, crash recovery, and a versioned workspace format. <a href="implementation-plan.md#m2">Details</a>. FIL-01 to FIL-03, FIL-07 to FIL-09, DSK-01 to DSK-05, DSK-08, PRF-04, PRF-09 to PRF-11, QLT-03, DST-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3: Your notes on GitHub (Sign in, and your notes follow you)</p>
<p>The first run signs in through Git's own tools, creates your workspace in your GitHub account (notes repository, private repository, Pages site), and from then on every change is saved as Git commits and synced. Notes are private or public, conflicts are resolved without loss, and deleted notes can be restored. <a href="implementation-plan.md#m3">Details</a>. EDT-11, FIL-05, FIL-06, FIL-10, FIL-12, SHR-01, SHR-02, FRE-01 to FRE-08, AGT-07, SEC-03, PRV-02, PRV-03, PRF-07.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4: Find anything, make it yours (Everything is one keystroke away)</p>
<p>Spotlight on <kbd>Mod</kbd>+<kbd>/</kbd> finds notes, headings, text, folders, commands, and settings, and acts on them. Quick open, find in all notes, the complete Power shortcut layer, and the theme manager with live preview and the contrast guard. <a href="implementation-plan.md#m4">Details</a>. FIL-04, THM-07, THM-13, KEY-01, KEY-03, FND-04, SPT-01 to SPT-05, SPT-07, SPT-08.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5: Publish and share (Version 1.0)</p>
<p>The first public release. Public notes are published to your own GitHub Pages site. Private notes and folders can be shared with named audiences through magic links and passcodes. The Get started page offers the downloads, and every release ships with checksums, an SBOM, and attestations. <a href="implementation-plan.md#m5">Details</a>. SHR-03 to SHR-11, PKG-02, SEC-05, SEC-06, PRV-04, PRF-05, PRF-06, PRF-12, QLT-02, QLT-04, DST-01, DST-03, DST-06.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M6: The browser (Write from any browser)</p>
<p>The web app at the product site's <code>/app/</code> edits and syncs your workspace through the GitHub API with a token you create, and new users can start in the browser. <a href="implementation-plan.md#m6">Details</a>. PKG-05, DST-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7: Agents (Your agents can help, safely)</p>
<p>A local MCP server, permissions you control, attributed and undoable agent changes, the <code>focus-notes</code> command-line tool with JSON output, <code>focus-notes://</code> deep links, and the published design-system catalog. <a href="implementation-plan.md#m7">Details</a>. AGT-01 to AGT-06, AGT-09, DSY-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M8: Polish and pro features (Make it yours, fully)</p>
<p>Block handle, column alignment and sorting, the Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, custom and generated themes, synced appearance, multiple windows, signed builds with automatic updates and channels, store listings, and more interface languages. <a href="implementation-plan.md#m8">Details</a>. EDT-07, TBL-04, TBL-09, UI-08, FIL-11, FIL-13, THM-04, THM-05, THM-09 to THM-12, DSK-06, DSK-07, KEY-04, KEY-07, FND-03, FND-05, SPT-06, I18N-03, DST-04, DST-07.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later: Components (Rich components)</p>
<p>Image, then gallery, each added as one block registration with directive syntax. <a href="implementation-plan.md#later">Details</a>. EXT-03, EXT-04.</p>
</li>
</ol>

## Changing the plan

The stage of a requirement changes here and in the [implementation plan](implementation-plan.md) together, and the plan check confirms that every requirement still belongs to exactly one work package. A change that moves a P0 requirement out of M0 to M5 needs an owner decision in [Decisions](decisions.md).

# Roadmap

The order in which the documented features get built. Each milestone leaves a working app and maps to requirement IDs in [Requirements](../product/requirements.md). There are no dates, because neither the seed spec nor the owner has given any. Risks for each milestone are tracked in [Risks](risks.md).

> [!NOTE]
> **TL;DR.** The **desktop app is the first writing client** (D-10). **M0** sets up the foundations: repository hygiene, CI, schemas, `AGENTS.md`, the template, and two spikes (the editor, and the Windows window). **M1** builds the editor, **M2** the canvas, toolbar, focus mode, theming, keyboard, and find. **M3** is the desktop app with first run, sign-in, and Git sync. **M4** is Spotlight. **M5** adds **publishing and private sharing** (magic links and passcodes) and the Get started page, completing the **first release**. After that: **M6** the browser (editing and starting on the web), **M7** agents (MCP server, command-line tool, deep links), and **M8** polish. Image and gallery components come later.

<ol class="slate-steps slate-steps--timeline">
<li class="slate-step">
<p class="slate-step__title">M0 - Foundations and spikes</p>
<p>Documentation (this site). The monorepo layout and toolchain from <a href="distribution.md">Distribution and release</a>, CI with tests, the license check, CodeQL, Dependabot, actions pinned by SHA, branch protection, <code>SECURITY.md</code>, and <code>AGENTS.md</code>. JSON Schemas for every file format, and <code>.focus-notes/workspace.json</code> with its format version. <strong>Editor spike</strong>: Tiptap with <code>@tiptap/markdown</code> versus a remark bridge on the round-trip corpus. <strong>Window spike</strong>: the 20 px transparent window with app-built window management on Windows and Linux (D-14). The <strong>workspace template</strong> and the <strong>reusable publish workflow</strong>, pinned by SHA. No OAuth app, no server, and no telemetry. The <a href="../product/spec/chain.md#checking-the-chain">chain check</a> script. LIC-01, LIC-02, PKG-04, PKG-06, AGT-07, AGT-08, SEC-04, SEC-07, PRV-01, QLT-01, DST-05, DST-06.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M1 - Editor core</p>
<p>Block registry, built-in blocks, inline formatting, input rules, slash menu, contextual formatting toolbar and link editor, Loop-style table editing, Markdown bridge, round-trip corpus, undo and redo, paste, crash recovery, text in any script, externalized interface strings, and the typing-latency budget. EDT-01 to EDT-06, EDT-08 to EDT-10, EDT-12, EDT-13, TBL-01 to TBL-03, TBL-05 to TBL-08, TBL-10, TBL-11, EXT-01, EXT-02, EXT-05, QLT-03, I18N-01, I18N-02, PRF-01, PRF-03, SEC-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2 - Canvas, toolbar, focus, theming, keyboard, find</p>
<p>Blank canvas, trigger (10 px dot, 30 px circle), toolbar with six actions and ⋯, contextual UI. Focus mode with all edge cases. Light, Dark, and System themes, the theme gallery with live preview, light and dark slots, the contrast guard, font choice and size. The command and keybinding service with the Basic, Writer, and Power layers and the cheat sheet. Browser shortcut test pass (including Safari on iPad). Find and replace in a note. WCAG 2.2 AA and Windows contrast themes. UI-01 to UI-07, FOC-01 to FOC-06, THM-01 to THM-03, THM-06 to THM-08, THM-13, KEY-01 to KEY-03, KEY-05, KEY-06, FND-01, FND-02, A11Y-01, A11Y-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3 - Desktop app, first run, and Git</p>
<p>The Electron window (native on macOS; 20 px corners and app-built window management on Windows and Linux; custom title bar, full screen, macOS menu bar) with the Electron hardening checklist. The first run: Git check, sign-in through Git Credential Manager, the GitHub CLI, or a token, identity, and <em>Create my workspace</em> or clone. The local Git adapter with save and sync, private settings, Files panel, file operations, public and private roots, conflict handling, and local data handling. DSK-01 to DSK-05, DSK-08, FRE-01 to FRE-08, PKG-03, FIL-01 to FIL-03, FIL-05 to FIL-10, FIL-12, EDT-11, SHR-01, SHR-02, SEC-01, SEC-03, PRV-02, PRV-03, PRF-02, PRF-04.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4 - Spotlight</p>
<p>The search index, the Spotlight panel with every result type, quick actions, modes and prefixes, quick open, go to heading, find in all notes, and checks against the performance budgets. SPT-01 to SPT-05, SPT-07, SPT-08, FIL-04, FND-04.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5 - Publishing and sharing (first release)</p>
<p>Static public note pages, Copy public link, the deploy pipeline with sealing and the leak check, <strong>audiences with magic links and passcodes</strong>, the invite, the share reader, nightly expiry and the keepalive warning, the pinned publish workflow, privacy for readers, the Get started page, signed release pipeline outputs (checksums, SBOM, attestations), the support matrix, and diagnostics. SHR-03 to SHR-11, PKG-01, PKG-02, SEC-05, SEC-06, PRV-04, DST-01, DST-03, QLT-02, QLT-04, PRF-05, PRF-06, DOC-01, DOC-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M6 - The browser</p>
<p>The web app at the product site's <code>/app/</code>: GitHub API adapter, sign-in with a user-created fine-grained token, setup from the Get started page, IndexedDB offline queue, and web substitutes for browser-reserved keys. PKG-05, DST-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7 - Agents</p>
<p>The local MCP server with permissions and attribution, Settings → Agents, the <code>focus-notes</code> command-line tool, <code>focus-notes://</code> deep links, and agent safety rules. AGT-01 to AGT-06, AGT-09.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M8 - Polish and pro features</p>
<p>Block handle, column alignment, sort, custom themes, synced appearance, pinned toolbar choice, Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, multiple windows, automatic updates and update channels, store listings (winget, Homebrew), and more interface languages. EDT-07, TBL-04, TBL-09, THM-04, THM-05, THM-09 to THM-12, UI-08, KEY-04, KEY-07, FND-03, FND-05, SPT-06, FIL-11, FIL-13, DSK-06, DSK-07, DST-04, DST-07, I18N-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later - Components</p>
<p>Image, then gallery, each added as a block registration with directive syntax. EXT-03, EXT-04.</p>
</li>
</ol>

## Definition of done for every milestone

- The milestone's requirement IDs pass their acceptance checks, and the checks are automated where practical.
- CI passes on `main`: tests, performance budgets, accessibility checks, the license check, and CodeQL.
- No new network destinations, telemetry, or permissions without a recorded decision.
- The docs pages for the milestone's features describe what was actually built, and their manifest `status` and `updated` fields are refreshed.
- Any decisions the milestone settled are recorded in [Decisions](decisions.md), and [Risks](risks.md) are reviewed.
- If the milestone runs long, the first things to cut are its P1 items, then polish within P0 items, never safety (sync, conflicts, the leak check).

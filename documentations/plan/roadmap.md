# Roadmap

The order in which the documented features get built. Each milestone leaves a working app and maps to requirement IDs in [Requirements](../product/requirements.md). There are no dates, because neither the seed spec nor the owner has given any.

> [!NOTE]
> **TL;DR.** The **desktop app is the first writing client** (D-10). **M0** sets up the foundations and runs two spikes: the editor (Tiptap and Markdown) and the 20 px window. **M1** builds the editor, **M2** the canvas, trigger, toolbar, focus mode, theming, keyboard system, and find and replace. **M3** is the desktop shell with first run, device sign-in, and Git sync. **M4** is Spotlight. **M5** adds publishing, which completes the first release. After that: **M6** browser editing, **M7** private share links, **M8** polish. Image and gallery components come later through the block registry.

<ol class="slate-steps slate-steps--timeline">
<li class="slate-step">
<p class="slate-step__title">M0 - Foundations and spikes</p>
<p>Documentation (this site). MIT <code>LICENSE</code> and the CI license check. Repository layout, private repository and submodule, CI skeleton with the Pages deploy. <strong>Editor spike</strong>: Tiptap with <code>@tiptap/markdown</code> versus a remark bridge on the round-trip corpus. <strong>Window spike</strong>: 20 px transparent window resizing, maximizing, shadow, and snapping on three OSes (D-14). Register the GitHub OAuth App with device flow enabled. LIC-01, LIC-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M1 - Editor core</p>
<p>Block registry, built-in blocks, inline formatting, input rules, slash menu, formatting bubble, table editing, Markdown bridge, round-trip test corpus, undo and redo, paste. EDT-01 to EDT-06, EDT-08 to EDT-10, TBL-01 to TBL-03, TBL-05, TBL-06, EXT-01, EXT-02, EXT-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2 - Canvas, toolbar, focus, theming, keyboard, find</p>
<p>Blank canvas, trigger (10 px dot, 30 px circle), toolbar with six actions and ⋯, contextual UI. Focus mode with all edge cases. Light, Dark, and System themes, font choice and font size steps. The command and keybinding service with the Basic, Writer, and Power layers and the cheat sheet. Browser shortcut test pass (including Safari on iPad). Find and replace in a note. UI-01 to UI-07, FOC-01 to FOC-06, THM-01 to THM-03, THM-06, KEY-01 to KEY-03, KEY-05, KEY-06, FND-01, FND-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3 - Desktop app, first run, and Git</p>
<p>The Electron window (20 px corners, custom title bar, resizing, full screen, macOS menu bar). The first run: Git check, device-flow sign-in, git credential helper, identity, workspace clone. The local Git adapter with save and sync, Files panel, file operations, public and private roots, conflict handling. DSK-01 to DSK-05, FRE-01 to FRE-07, PKG-03, FIL-01 to FIL-03, FIL-05, FIL-06, EDT-11, SHR-01, SHR-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4 - Spotlight</p>
<p>The search index, the Spotlight panel with every result type, quick actions, modes and prefixes, quick open, go to heading, find in all notes, and checks against the performance budgets. SPT-01 to SPT-05, SPT-07, SPT-08, FIL-04, FND-04.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5 - Publishing (first release)</p>
<p>Static public note pages, Copy public link, deploy pipeline with leak check, installers for all three OSes, developer setup without private access. SHR-03, SHR-04, PKG-01, PKG-02, PKG-04, DOC-01, DOC-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M6 - Editing in the browser</p>
<p>GitHub API adapter, personal access token sign-in, IndexedDB offline queue, and web substitutes for browser-reserved keys. PKG-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7 - Private share links</p>
<p>Grants, sealing, keyrings, share-link reader, expiry and revoke, nightly deploy. SHR-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M8 - Polish and pro features</p>
<p>Block handle, column alignment, custom themes, synced appearance, pinned toolbar choice, Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, multiple windows, signed builds and automatic updates. EDT-07, TBL-04, THM-04, THM-05, UI-08, KEY-04, KEY-07, FND-03, FND-05, SPT-06, DSK-06, DSK-07.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later - Components</p>
<p>Image, then gallery, each added as a block registration with directive syntax. EXT-03, EXT-04.</p>
</li>
</ol>

## Definition of done for every milestone

- The milestone's requirement IDs pass their acceptance checks, and the checks are automated where practical.
- The app builds and deploys from `main`, and the license check passes. A clone without private access still builds.
- The docs pages for the features in the milestone are updated so they describe what was actually built, and their manifest `status` and `updated` fields are refreshed.
- Any decisions the milestone settled are recorded in [Decisions](decisions.md).

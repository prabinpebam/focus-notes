# Roadmap

The order in which the documented features get built. Each milestone leaves a working app and maps to requirement IDs in [Requirements](../product/requirements.md). There are no dates, because the seed spec doesn't give any.

> [!NOTE]
> **TL;DR.** **M0** sets up the foundations and runs the editor spike. **M1 to M4** deliver every P0 requirement for the web: the editor, then the canvas with focus mode and theming, then files on GitHub, then publishing. That ends the first release. **M5** adds Electron, **M6** private share links, and **M7** the remaining P1 polish. Image and gallery components follow through the block registry.

<ol class="slate-steps slate-steps--timeline">
<li class="slate-step">
<p class="slate-step__title">M0 - Foundations</p>
<p>Documentation (this site). Repository layout, private content repository and submodule, CI skeleton with the GitHub Pages deploy. Editor-engine spike to settle D-01.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M1 - Editor core</p>
<p>Block registry, built-in blocks, inline formatting, input rules, slash menu, formatting bubble, table editing, Markdown bridge, round-trip test corpus, undo and redo, paste. EDT-01 to EDT-06, EDT-08 to EDT-10, TBL-01 to TBL-03, TBL-05, TBL-06, EXT-01, EXT-02, EXT-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M2 - Canvas, trigger, focus mode, theming</p>
<p>Blank canvas, trigger, minimal toolbar, contextual UI. Focus mode with all edge cases. Token-based Light, Dark, and System themes and font choice. UI-01 to UI-06, FOC-01 to FOC-06, THM-01 to THM-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M3 - Workspace on GitHub</p>
<p>Token connection, GitHub API adapter, Files panel, create/rename/delete/move for notes and folders, public and private roots, autosave, offline queue, conflict handling. FIL-01 to FIL-03, FIL-05, FIL-06, EDT-11, SHR-01, SHR-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M4 - Publishing (first release)</p>
<p>Static public note pages, Copy link, deploy pipeline with leak check, developer setup without private access. SHR-03, SHR-04, PKG-01, PKG-02, PKG-04, DOC-01, DOC-02.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M5 - Desktop</p>
<p>Electron shell, local Git adapter, device-flow sign-in, OS keychain. PKG-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M6 - Private share links</p>
<p>Grants, sealing, keyrings, share-link reader, expiry and revoke, nightly deploy. SHR-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">M7 - Polish</p>
<p>Block handle, column alignment, quick open, custom themes, synced appearance. EDT-07, TBL-04, FIL-04, THM-04, THM-05.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later - Components</p>
<p>Image, then gallery, each added as a block registration with directive syntax. EXT-03, EXT-04.</p>
</li>
</ol>

## Definition of done for every milestone

- The milestone's requirement IDs pass their acceptance checks, and the checks are automated where practical.
- The app builds and deploys from `main`. A clone without private access still builds.
- The docs pages for the features in the milestone are updated so they describe what was actually built, and their manifest `status` and `updated` fields are refreshed.
- Any decisions the milestone settled are recorded in [Decisions](decisions.md).

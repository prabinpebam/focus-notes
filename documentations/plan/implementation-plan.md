# Implementation plan

Every stage in detail: what you can do at the end, the demo that proves it, the work packages that build it, and the exit criteria on top of the [definition of done](definition-of-done.md). The same plan is in [`work-graph.json`](https://github.com/prabinpebam/focus-notes/blob/main/documentations/plan/work-graph.json), which agents read to pick ready work ([The agentic loop](agentic-loop.html)).

> [!NOTE]
> **TL;DR.** 61 work packages across 10 stages, covering all 200 requirements exactly once. Each work package lists its requirements, the work packages it depends on, the code areas it touches, the reviews it needs, and the spec pages it implements. Every work package also depends on the previous stage's gate, except spikes and long-lead items marked *lookahead*. The longest chain to version 1.0 is 22 work packages. Every stage has a demo script that the owner runs on clean machines at the stage gate, and that then becomes an automated journey test.

## How to read a work package

| Field | Meaning |
| --- | --- |
| **ID** | `WP-<stage>.<n>`. Stable once published. |
| **Requirements** | The requirement IDs it must make pass. Each requirement belongs to exactly one work package. |
| **Depends on** | Work packages that must be Done first. The previous stage's gate is implied. |
| **Reviews** | Reviews it needs before merging: `code`, `design-system`, `accessibility`, `security` ([roles](agentic-loop.html#roles)). |
| **Lookahead** | May start before the previous stage's gate, because it's a spike or has a long lead time. |

## Critical path to 1.0

WP-0.1 → WP-0.3 → WP-0.4 → WP-0.5 → WP-0.7 → WP-1.4 → WP-1.8 → WP-1.6 → WP-1.11 → WP-2.3 → WP-2.4 → WP-2.5 → WP-3.1 → WP-3.2 → WP-3.6 → WP-4.1 → WP-4.2 → WP-4.4 → WP-5.1 → WP-5.5 → WP-5.6 → WP-5.7

Work packages off this path run in parallel when their dependencies are Done and they touch different code areas.

<h2 id="m0" data-reader-personas="product design engineering">M0: Walking skeleton</h2>

**You can:** A preview app for Windows, macOS, and Linux opens to the blank canvas with the trigger. You can type paragraphs and headings into a Markdown file you chose, it saves on its own, and the note is back when you reopen the app.

**Used by:** The team, on their own computers. **Delivered as:** Preview 0.0.x on GitHub Releases (pre-release, unsigned).

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. Install the M0 preview on clean Windows 11, macOS, and Ubuntu machines.
2. Launch it. The canvas appears with only the trigger, and the caret is ready in 2.5 seconds or less.
3. Type `# ` and a heading, then two paragraphs.
4. Quit, and open the file in another text editor: it's clean CommonMark.
5. Relaunch: the note is back with the caret at the end.
6. Open the gallery build: every M0 primitive and layout shows all its states in light and dark.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-0.1 | **Repository, CI, and agent loop**. The monorepo, toolchain, CI on three operating systems, the license check, CodeQL, Dependabot, actions pinned by SHA, branch protection, the work graph, the agent role instructions, and the benchmark harness: performance marks and spans, `pnpm bench` on a throwaway fixture workspace, and a budgets file checked in CI. | PKG-01, PKG-04, LIC-01, LIC-02, DOC-01, DOC-02, SEC-04, SEC-07, QLT-01, QLT-05 | None | code, security |
| WP-0.2 | **Editor spike and block registry** *(lookahead)*. Both Markdown bridges against the round-trip corpus, the decision recorded, and the block registry contract. | EDT-01, EXT-01 | WP-0.1 | code |
| WP-0.3 | **Token source and build**. DTCG sources for every tier, Style Dictionary output, and alias checks. | DSY-01, DSY-02 | WP-0.1 | code, design-system, accessibility |
| WP-0.4 | **First primitives, layouts, and contracts**. Text, Icon, Button, IconButton, Tooltip, SignalDot, Stack, Inline, Surface, Layer, and Positioner, with contracts, the gallery, and the component process. | DSY-04, DSY-05, DSY-10 | WP-0.3 | code, design-system, accessibility |
| WP-0.5 | **UI schema, ui:check, and renderer spike** *(lookahead)*. The schema generated from contracts, `ui:check`, the renderer, message keys, and the overhead benchmark on Settings, Files, and Spotlight prototypes. | I18N-01, DSY-07, DSY-08, DSY-11 | WP-0.4 | code, design-system, accessibility |
| WP-0.6 | **Electron shell and window spike** *(lookahead)*. The hardened Electron shell with a typed preload bridge, an allow-listed network policy, and the 20 px window spike on Windows 10, Windows 11, and Ubuntu. | PKG-03, PKG-06, SEC-01, PRV-01 | WP-0.1 | code, security |
| WP-0.7 | **Canvas skeleton**. The canvas view document with the trigger and a minimal editor saving to a local file, inside the start-time budget. | UI-01, UI-02, PRF-02 | WP-0.2, WP-0.5, WP-0.6 | code, design-system, accessibility, security |
| WP-0.8 | **File format schemas**. JSON Schemas for front matter, settings, themes, keybindings, access, and the invite template. | AGT-08 | WP-0.1 | code |
| WP-0.9 | **Nightly and preview builds**. Unsigned nightly builds from `main`, and preview pre-releases at each stage exit. | Enabler | WP-0.6 | code, security |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The three spikes are concluded and recorded as decisions: the Markdown bridge (D-01), the Windows window (D-14), and the UI runtime overhead (DSY-11).
- CI runs on Windows, macOS, and Linux for every pull request, and every merge to `main` publishes a nightly build.
- The work graph, the role instructions for agents, and the evidence format from [the agentic loop](agentic-loop.html) are in the repository and in use.
- The canvas is rendered from a JSON view document that passes `ui:check`.
- `pnpm bench --check` runs in CI against a committed first baseline for start-up and the canvas (QLT-05).

<h2 id="m1" data-reader-personas="product design engineering">M1: Writing</h2>

**You can:** Open or create a Markdown file and write a real document: blocks, Markdown shortcuts, inline formatting with the contextual toolbar, links, the slash menu, Loop-style tables, the trigger toolbar and ⋯ menu, focus mode, Light, Dark, and System themes, font size, find and replace, and the Basic and Writer shortcut layers with the cheat sheet.

**Used by:** The owner, for real documents. **Delivered as:** Preview 0.1.x.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. Create a note and write 1,000 words using `# `, lists, task lists, quotes, and code blocks.
2. Select text: the contextual toolbar appears. Make it bold, then add a link with <kbd>Mod</kbd>+<kbd>K</kbd>.
3. Type `/table`, add rows and columns with the hover +, move with <kbd>Tab</kbd>, and paste a range copied from a spreadsheet.
4. Turn on focus mode from the trigger toolbar and move around: only the caret's row is bright. Type in the 50,000-word fixture with no visible lag.
5. Switch light and dark with <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>. In System, change the OS appearance and watch the app follow.
6. Find with <kbd>Mod</kbd>+<kbd>F</kbd>, replace all, then undo it in one step.
7. Open the cheat sheet with <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> and search it.
8. Close and reopen the file: everything you didn't touch is byte-for-byte unchanged.
9. Do the whole demo again with the keyboard only, and again with NVDA on Windows and VoiceOver on macOS.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-1.1 | **Block editor core**. Blocks, Markdown shortcuts, undo, round-trip fidelity, the extension syntax, and text in any script. | EDT-02, EDT-04, EDT-05, EDT-08, EDT-10, EXT-02, EXT-05, I18N-02 | WP-0.7 | code, design-system, accessibility |
| WP-1.2 | **Inline formatting, contextual toolbar, and links**. Marks, the contextual toolbar, the link editor, and the hover card. | EDT-03, EDT-12, EDT-13, UI-06 | WP-1.1, WP-1.4 | code, design-system, accessibility |
| WP-1.3 | **Slash menu and paste**. The slash menu from the block registry, and sanitized paste of Markdown, HTML, and plain text. | EDT-06, EDT-09, SEC-02 | WP-1.1, WP-1.4 | code, design-system, accessibility, security |
| WP-1.4 | **Compound components, first set**. Menu, Popover, Dialog, Toolbar, Toast, Field, Tabs, and ResultList, with command-driven items and full gallery coverage, plus the task tracker, the busy state, the `wait.*` timing tokens, and the minimal auto-hiding scrollbar. | DSY-09, DSY-12, PRF-08, UI-09 | WP-0.5 | code, design-system, accessibility |
| WP-1.5 | **Loop-style tables**. Tables with hover insertion, grips, cell selection, keyboard movement, and spreadsheet paste. | TBL-01 to TBL-03, TBL-05 to TBL-08, TBL-10, TBL-11 | WP-1.1, WP-1.4 | code, design-system, accessibility |
| WP-1.6 | **Trigger toolbar and ⋯ menu**. The six-action toolbar and the ⋯ menu as view documents, keyboard and screen-reader complete. | UI-03 to UI-05, UI-07, UI-10, DSY-06 | WP-1.4, WP-1.8 | code, design-system, accessibility |
| WP-1.7 | **Focus mode**. The row mask with every edge case, inside the typing budget. | FOC-01 to FOC-06, PRF-01, UI-11 | WP-1.1 | code, design-system, accessibility |
| WP-1.8 | **Commands, keymap, and cheat sheet**. The command registry, the Basic and Writer layers per platform, browser substitutes, and the cheat sheet. | KEY-02, KEY-05, KEY-06 | WP-1.4 | code, design-system, accessibility |
| WP-1.9 | **Themes, appearance, and modes**. Paper, Ink, and the other built-ins, System switching, fonts and size, and every token mode including forced colors. | THM-01 to THM-03, THM-06, THM-08, A11Y-02, DSY-03 | WP-1.4 | code, design-system, accessibility |
| WP-1.10 | **Find and replace in a note**. The find bar with live count, options, replace, and replace all as one undo step. | FND-01, FND-02 | WP-1.1, WP-1.4 | code, design-system, accessibility |
| WP-1.11 | **Writing hardening**. The stage's accessibility audit, open-note budget, and the M1 demo as an automated journey test. | PRF-03, A11Y-01 | WP-1.2, WP-1.3, WP-1.5, WP-1.6, WP-1.7, WP-1.9, WP-1.10 | code, design-system, accessibility, security |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The round-trip corpus passes at 100%.
- Keystroke to paint meets PRF-01 in the 50,000-word fixture with focus mode on.
- Every M1 surface is a view document. The gallery covers every component and view state, with no unapproved visual differences and no axe violations.
- The owner writes at least three real documents in it before exit.

<h2 id="mw" data-reader-personas="product design engineering">MW: Your Focus Notes on GitHub Pages</h2>

**You can:** open your own Focus Notes at your GitHub Pages address in any browser and write at once, with no account: notes you write there stay in that browser and work offline. Read your site's public notes, unlock your private notes read-only with your passphrase, copy any of them into your browser notes to edit, and export your browser notes for the desktop app. The browser never signs in to GitHub; the desktop app is what saves to your repository (D-80, D-87, D-90).

**Used by:** The owner first, then anyone with a GitHub account. **Delivered as:** Preview 0.2.x, the first build most people use.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. *Use this template* on the template repository, turn on GitHub Pages with GitHub Actions, and open the site when the workflow finishes.
2. Write a note with no account, reload the page, and find it still there. Go offline, keep writing, and reload again.
3. Open a public note from *Open…*: it's marked read-only. Choose *Copy to my notes* and edit the copy.
4. Open the site in a private window: as a visitor you see only the public notes and *Use this app for yourself*.
5. Press *Unlock* and enter the passphrase: the private notes list and open read-only, and the pill shows your name. Close the tab and reopen: locked again. Unlock with *Remember on this browser*: it stays unlocked after a reload, until *Forget this browser*.
6. *Export my notes*, then import the bundle into a second browser: every note arrives, and nothing was removed from the first.
7. Plant a private sentence in a public build: the leak check fails the deploy.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-6.1 | **Web app on your own Pages, local first**. The web build deployed by each instance to its own GitHub Pages; notes written in the browser kept in IndexedDB, offline, with persistent storage; export and import bundles. No GitHub sign-in in the browser. | PKG-05, PKG-07, PKG-11 | WP-1.4 | code, security |
| WP-6.2 | **Start in the browser, the visitor view, and Use this app for yourself**. Make your instance from the template; the web first run; the visitor view with public notes only; and the Use this app for yourself dialog. | DST-01, DST-02, FRE-09, PKG-09 | WP-6.3 | code, security, accessibility |
| WP-6.3 | **The instance's notes in the browser**. The *Deploy app* workflow publishes `notes/` with an index and a site manifest; the browser lists and opens public notes (and, with WP-6.4, private ones) read-only, with *Copy to my notes*. | PKG-08 | WP-6.1 | code, security, accessibility |
| WP-6.4 | **The vault: private notes sealed at deploy, unlocked in the browser**. The sealing format and sealer (`packages/seal`), the owner's grant, the leak check in the *Deploy app* workflow, and the browser's *Unlock*, *Remember on this browser*, *Lock*, and the account pill. | PKG-10, SEC-08, SHR-04, SEC-06, UI-12 | WP-6.3 | code, security, accessibility |
| WP-2.3 | **Local workspace model**. Folder workspaces, `workspace.json` with its format version and migrations, title-based file names, and change notifications scoped to the content each view model declares. | FIL-07, DST-05, PRF-11 | WP-1.1 | code |
| WP-2.4 | **Files panel and file operations**. The Files sheet with the tree, create, rename, delete, multiple selection, drag and drop, and Move to…, with structural changes shown before they're saved. | FIL-01 to FIL-03, FIL-08, PRF-09 | WP-2.3, WP-1.4 | code, design-system, accessibility |
| WP-2.5 | **Link updates**. Relative links updated on every rename and move. | FIL-09 | WP-2.4 | code |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- Browser journeys pass in Chromium, Firefox, and WebKit against the built site, with a sealed fixture vault.
- A network capture shows the web app requests nothing but its own site's files, and nothing that opens the vault is stored unless *Remember on this browser* was chosen.
- The sealer's test vectors pass in Node and in every browser, and the browser refuses keyrings with any other parameters.

<h2 id="m4" data-reader-personas="product design engineering">M4: Find anything, make it yours</h2>

**You can:** Spotlight on <kbd>Mod</kbd>+<kbd>/</kbd> finds notes, headings, text, folders, commands, and settings, and acts on them. Quick open, find in all notes, the complete Power shortcut layer, and the theme manager with live preview and the contrast guard.

**Used by:** Invited testers. **Delivered as:** Preview 0.4.x.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. In the 5,000-note fixture, press <kbd>Mod</kbd>+<kbd>/</kbd>: Spotlight opens in under 50 ms.
2. Type part of a heading and jump to it. Type `>` and run a command, and see each command's current state.
3. Use a quick action on a result (open to the side, copy link, move).
4. Find in all notes with <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> and open a match.
5. Open the theme manager, browse the gallery with the arrow keys while the note previews each theme, and press <kbd>Esc</kbd> to revert.
6. Edit a color until the contrast guard flags it, then apply the one-click fix.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-4.1 | **Search index**. A MiniSearch index in a worker, on the device only, inside the budgets. | SPT-07, SPT-08 | WP-2.3 | code, security |
| WP-4.2 | **Spotlight**. The command palette with every result type, quick actions, modes, prefixes, and quick open. | FIL-04, KEY-01, SPT-01 to SPT-05 | WP-4.1, WP-1.8 | code, design-system, accessibility |
| WP-4.3 | **Find in all notes**. Grouped results across the workspace. | FND-04 | WP-4.1 | code, design-system, accessibility |
| WP-4.4 | **Power shortcut layer**. The complete Basic, Writer, and Power layers. | KEY-03 | WP-4.2 | code, design-system, accessibility |
| WP-4.5 | **Theme manager and contrast guard**. The gallery with live preview, reading settings, and the contrast guard. | THM-07, THM-13 | WP-1.9 | code, design-system, accessibility |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- Spotlight meets its budgets (SPT-07) on reference hardware.
- A network capture shows that no note text leaves the computer while indexing and searching.

<h2 id="m5" data-reader-personas="product design engineering">M5: Publish and share</h2>

**You can:** The first public release. Public notes are published to your own GitHub Pages site. Private notes and folders can be shared with named audiences through magic links and passcodes. The Get started page offers the downloads, and every release ships with checksums, an SBOM, and attestations.

**Used by:** Anyone. **Delivered as:** 1.0 stable on GitHub Releases.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. On a clean machine, go from the Get started page to a downloaded, installed app and your first synced note in under five minutes.
2. Make a note public, copy its link, and open it after the deploy: it follows light and dark, sets no cookies, and makes no third-party requests.
3. Share a private folder with "Asha" by magic link and passcode. Open it in another browser with the link, then with the name and passcode. Withdraw it: access ends after the next deploy.
4. Plant a private sentence in a public build: the leak check fails the deploy.
5. Download the release assets and verify the checksum and attestation with `gh attestation verify`.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-5.1 | **Static renderer and public pages**. Public pages rendered from the reader views and block components, deployed by the user's workflow, with font preloading and lab-measured Core Web Vitals. | SHR-03, SHR-06, PKG-02, PRV-04, PRF-06, PRF-12 | WP-3.4, WP-1.1 | code, design-system, accessibility, security |
| WP-5.2 | **Share sealing and the pinned bundle**. Share grants sealed with the vault's format (WP-6.4), and instances deploying the released web app bundle at a pinned version, verified by checksum and attestation. | SHR-11, SEC-05 | WP-5.1, WP-6.4 | code, security |
| WP-5.3 | **Audiences, passcodes, and invites**. The Share popover, audiences, generated and custom passcodes, expiry, withdrawal, and the invite. | SHR-05, SHR-07 to SHR-09 | WP-5.2 | code, design-system, accessibility, security |
| WP-5.4 | **Share reader**. The reader with magic links, name and passcode, and the page weight budget. | SHR-10, PRF-05 | WP-5.2 | code, design-system, accessibility, security |
| WP-5.5 | **Release pipeline**. Draft releases with the desktop installers, the web app bundle, checksums, SBOM, and attestations. | DST-03 | WP-0.9, WP-5.1 | code, security |
| WP-5.6 | **Instance template and update pull requests**. The template repository generated from templates/workspace/ at each release, its pinned Deploy app workflow, and update pull requests. | DST-06 | WP-5.5 | code, design-system, accessibility |
| WP-5.7 | **Diagnostics and release qualification**. Local diagnostics, Report a problem, and the full support-matrix pass for 1.0. | QLT-02, QLT-04 | WP-5.3, WP-5.4, WP-5.6 | code, design-system, accessibility, security |
| WP-5.8 | **Glitch-free windows and honest waits**. No blank or white frame in any transition: no page reloads for state changes, double-buffered swaps, the first themed frame, and the frame-integrity journey. Every wait in the [inventory](../architecture/perceived-performance.md#the-wait-inventory) gets its class's pattern (named waits, steps and progress, prefetch), setup first, checked by the "no silent wait" journey (D-148, D-149). | DSK-09, PRF-13 | WP-2.1, WP-1.4, WP-3.2 | code, design-system, accessibility |
| WP-5.9 | **Snappy window and controls**. The window attached to the pointer: the main process follows the cursor itself once per display frame during a drag, or the system's own move loop if measured faster; only the latest position applied; no page repaint on move; resizing with nothing but layout on its path; a main process that never stalls; every control answering on pointer-down in the next frame. Measured with a real pointer on CI and in the benchmark (D-151). Built first of WP-5.8 and WP-5.9, after D-147 and D-150. | PRF-14 | WP-2.1 | code, design-system, accessibility |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The [release definition of done](definition-of-done.md#release-definition-of-done) is met for everything in M0 to M5.
- A moderated usability test with five writers new to the app: at least four finish setup and their first shared note unaided.

<h2 id="m3" data-reader-personas="product design engineering">M3: Desktop sign-in and Git</h2>

**You can:** The first run signs in through Git's own tools, creates your instance in your GitHub account (instance repository, private repository, vault passphrase, Pages site), and from then on every change is saved as Git commits and synced: the desktop app is the only place that writes to GitHub (D-90). Notes are private or public, notes exported from a browser can be imported, conflicts are resolved without loss, and deleted notes can be restored.

**Used by:** The owner and a few invited testers, on several computers. **Delivered as:** Preview 0.3.x.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. On a clean machine without Git, the first run guides the Git install, sign-in with a device code, and your identity, then creates the workspace. The repositories appear in your GitHub account.
2. Write a note: it's committed and pushed, and the commit shows on GitHub.
3. On a second computer, sign in and choose the existing workspace: the notes are there.
4. Edit the same note offline on both computers, then reconnect: the conflict resolver appears, and nothing is lost.
5. Make a note public, then private again: it moves between the repositories. New notes are private.
6. Import a bundle exported from the browser: its notes become private notes in the instance, committed and pushed, and after the deploy they open in the browser once unlocked.
7. Delete a note and restore it from Recently deleted.
8. In a terminal, `git push` in the workspace works without signing in again.
9. Sign out from Settings → Account: everything in the data inventory is removed.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-3.1 | **Setup engine and workspace template**. Create my workspace in the user's account from the template, including its AGENTS.md. | FRE-08, AGT-07 | WP-2.3 | code, security |
| WP-3.2 | **First run and sign-in**. The setup steps, sign-in through Git Credential Manager, the GitHub CLI, or a token, identity, and create or clone. | FRE-01 to FRE-06, SEC-03 | WP-3.1, WP-1.4 | code, design-system, accessibility, security |
| WP-3.3 | **Local Git adapter, save, and sync**. Commits for every change, push and pull, the lock file, readable commit messages, and one cached Git status per repository that no view waits for. | EDT-11, FIL-05, PRF-07 | WP-2.3 | code |
| WP-3.4 | **Public and private roots**. The private repository as a separately synced submodule, visibility per note, private by default, private settings, and importing a browser export bundle. | FIL-06, SHR-01, SHR-02, PRV-03, FRE-10 | WP-3.3 | code, design-system, accessibility, security |
| WP-3.5 | **Conflicts and Recently deleted**. The conflict resolver and restoring from Git history. | FIL-10, FIL-12 | WP-3.3, WP-2.4 | code, design-system, accessibility |
| WP-3.6 | **Account settings and data inventory**. Switch account, sign out, and remove a workspace, deleting exactly what the inventory lists. | FRE-07, PRV-02 | WP-3.2 | code, security |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The fault-injection suite (network drop mid-push, kill during commit, full disk, two computers editing) runs 1,000 randomized rounds with no lost text.
- The owner and at least two testers use it across two computers for five working days.
- On the 10,000-note benchmark workspace, no view's first frame waits for Git, and a refresh starts at most one `git status` per repository (PRF-07).

<h2 id="m2" data-reader-personas="product design engineering">M2: The desktop app</h2>

**You can:** The real desktop window (20 px corners and app-built window management on Windows and Linux, the native window and full menu bar on macOS), full screen, and a folder of notes managed in the Files panel, with link updates, crash recovery, and a versioned workspace format.

**Used by:** The owner, daily. **Delivered as:** Preview 0.3.x, with M3.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. On Windows, drag the window to each edge and corner and see snap previews, hover the maximize button for Snap Layouts, use <kbd>Win</kbd>+arrows and <kbd>Alt</kbd>+<kbd>Space</kbd>, resize from every edge, and move it between monitors with different scaling.
2. On macOS, find every command in the menu bar with its shortcut.
3. Enter and leave full screen with <kbd>F11</kbd> and <kbd>Ctrl</kbd>+<kbd>⌘</kbd>+<kbd>F</kbd>.
4. Open a folder. In Files, create, rename, and delete notes and folders, select several, drag them into a folder, and use Move to….
5. Rename a note that others link to: their links update.
6. Kill the app while typing, relaunch, and get the text back.
7. Open the 10,000-note fixture: memory stays at 350 MB or less, and idle CPU is near zero.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-2.1 | **Windows and Linux window**. The transparent 20 px window with app-built moving, resizing, maximizing, snapping, Snap Layouts, the system menu, and DPI handling. | DSK-01, DSK-03, DSK-08 | WP-0.6, WP-1.4 | code, design-system, accessibility, security |
| WP-2.2 | **Title bar, full screen, and macOS menu**. The title bar band, full screen, and the native macOS menu bar generated from commands. | DSK-02, DSK-04, DSK-05 | WP-2.1, WP-1.8 | code, design-system, accessibility |
| WP-2.6 | **Recovery journal and resource budgets**. The one-second recovery journal, memory and idle CPU budgets on 10,000 notes, the parsed-note snapshot, and the warm-up after start. | PRF-04, PRF-10, QLT-03 | WP-2.3 | code |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The owner uses it as their only notes app for five working days with no S1 or S2 defects.
- Window behavior passes on Windows 10, Windows 11, and Ubuntu with mixed-DPI monitors.

<h2 id="m7" data-reader-personas="product design engineering">M7: Agents</h2>

**You can:** A local MCP server, permissions you control, attributed and undoable agent changes, the `focus-notes` command-line tool with JSON output, `focus-notes://` deep links, and the published design-system catalog.

**Used by:** Anyone. **Delivered as:** 1.2.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. Connect an MCP host using the snippet in Settings → Agents in under a minute.
2. Ask the agent to edit a note: the edit appears as its own commit with the Agent badge, and one click undoes it.
3. Try to read a private note with that permission off: the agent is refused, with a reason.
4. Run `focus-notes search "draft" --json` and open a `focus-notes://` link from another app.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-7.1 | **Agent permissions and attribution**. Permission checks in the command layer, agent trailers, undo, and safety rules; the Agent badge and the toast land with WP-8.4 and WP-7.2 (D-145). | AGT-03, AGT-04, AGT-09 | WP-3.3 | code, security |
| WP-7.2 | **MCP server**. The stdio MCP server with its tools, resources, and prompts (D-159). Acceptance: driven over stdio with a fixture workspace, each tool and resource works within its permission and is refused outside it with its code (not connected, not permitted, outside folders or notes, invalid path, sharing, link, changed, never, rate limited, too large, app running); every title, name, snippet, heading, and body comes back untrusted and wrapped, including text shaped like instructions or like the markers; each write is one attributed commit; `access.json` and anything outside the two note roots is never returned; the server refuses to start while agents can't connect; the security review passes. | AGT-01 | WP-7.1 | code, security |
| WP-7.3 | **Command-line tool and deep links**. `focus-notes` with `--json`, and read-only deep links (D-165). Acceptance: every command runs as a process with text and `--json` output of the documented shape and the documented exit codes; refusals (outside the notes, invalid paths, links, sharing, visibility moves) exit 3 and changes since read exit 2; writes are one `command line` commit each and are refused while the app holds the workspace; `mcp` keeps the agent switches; the deep-link parser refuses every malformed or hostile link (other schemes and hosts, credentials, ports, fragments, repeated or unknown parameters, `..`, absolute and Windows paths, paths outside the two roots, control characters, over-long links); a journey opens a note from a link given at start and ignores a hostile one; the security review passes. | AGT-05, AGT-06 | WP-7.1 | code, security |
| WP-7.4 | **Settings → Agents and the published catalog**. Connection snippets, permission controls, recent agent changes, and the design-system catalog on the product site (D-166). Acceptance: each switch writes `agents.json` at once and persists across starts, and the others are disabled while agents can't connect; a file changed outside the app shows its notice; each snippet copies a command that starts this app's MCP server; recent agent changes list the attributed commits, and Undo puts the note back as a new commit or says why not; Install command-line tool never runs outside an installed app; the page has no axe violations and scores VVS ≥ 70; `schemas/ui/catalog.v1.json` is generated, kept current by `pnpm check`, and published with the schemas; the security review passes. | AGT-02, DSY-13 | WP-7.2 | code, design-system, accessibility |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The MCP server passes the official MCP Inspector checks and the agent-safety tests (AGT-09).

<h2 id="mh" data-reader-personas="product design engineering">MH: The product site and help</h2>

**You can:** Find out what Focus Notes is, whether it suits you, and try it in your browser before installing; and, once you use it, open a plain-language article for any setting, step or problem straight from the app ([Product site and help](../product/site-and-help.md), D-167 to D-169).

**Used by:** Visitors and every writer. **Delivered as:** the project's GitHub Pages site, updated with each release. It can run beside M7 and M8: it needs only what M5 already built.

**Demo script** (run by the owner at the gate, then automated):

1. Open `prabinpebam.github.io/focus-notes/` in a fresh browser: the first screen says what Focus Notes is, offers the download for this system and *Try the demo*, and its screenshots match the current release in light and dark.
2. *Try the demo*: write in focus mode, open Files and Spotlight, reload, then *Reset demo*. No request leaves the site.
3. In the desktop app, open *Learn more* next to the device code at Connect and *How to fix this* on a backup problem: each opens the right article at the right section.
4. Search the help centre for "log in" and find *Connect your GitHub account*.
5. Follow *Can't connect to GitHub* on a machine without Git: the article gets you to a working setup.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-10.1 | **Site build and addresses**. The static site builder on the design system and the public pages' renderer; the new addresses (`/`, `/help/`, `/demo/`, `/download/`, `/privacy/`, the owner's app at `/app/`, `/n/` unchanged); light and dark; no other origins; the web vitals budgets. | HLP-08 | WP-5.1 | code, design-system, accessibility, security |
| WP-10.2 | **Help centre**. Article front matter and content-type checks, reading level, link and anchor checks, the help home, category and article pages, *Was this helpful?*, *What's new* from release notes, and the in-browser search. | HLP-02, HLP-07, HLP-09 | WP-10.1 | code, design-system, accessibility |
| WP-10.3 | **Articles**. The first set of about 40 articles in eight categories, troubleshooting for every problem message the app shows, each meeting the help article definition of done. | HLP-06 | WP-10.2, WP-10.4 | design-system, accessibility |
| WP-10.4 | **Screenshots from the app**. The `site` capture catalogue on the release build with the demo workspace, light and dark at 2×, framing, alt text, the screen-level CI job, and the freshness check. | HLP-04 | WP-10.6 | code, design-system |
| WP-10.5 | **Landing page and downloads**. The pitch, trust strip, how it works, features, *Is it for you?*, built in the open, questions, and downloads for each system from the latest release. | HLP-01 | WP-10.1, WP-10.4 | design-system, accessibility |
| WP-10.6 | **Demo**. The demo workspace (the template's notes plus sample notes), the `/demo/` build kept in the browser, the banner with *Download* and *Reset demo*, and no route to GitHub. | HLP-05 | WP-10.1 | code, design-system, accessibility, security |
| WP-10.7 | **Learn more links**. `help:` links in view documents, the ID registry, *How to fix this* on every problem message, Help → Help centre, and the CI check that every ID, anchor and link resolves. | HLP-03 | WP-10.2 | code, design-system, accessibility |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- Every article meets the [help article definition of done](definition-of-done.md#help-article-definition-of-done).
- A usability check with five people who have never used Git: at least four finish *Get started* and *Can't connect to GitHub* using only the articles.

<h2 id="m8" data-reader-personas="product design engineering">M8: Polish and pro features</h2>

**You can:** Block handle, column alignment and sorting, the Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, custom and generated themes, synced appearance, multiple windows, signed builds with automatic updates and channels, store listings, and more interface languages.

**Used by:** Anyone. **Delivered as:** 1.x.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. Create a theme from one color, shuffle it, lock two colors, and save it. It syncs to your other computer through the private repository.
2. Rebind a command, see the conflict warning, then reset.
3. Replace a phrase across all notes with a preview, then undo the whole change in one step.
4. Open a note's history, compare versions, and restore one.
5. Install with winget and Homebrew. Receive an automatic update on the Beta channel.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-8.1 | **Editor pro**. The block handle, column alignment, sorting, the Pro layer, and find in selection. | EDT-07, TBL-04, TBL-09, KEY-04, FND-03 | WP-1.5, WP-4.4 | code, design-system, accessibility |
| WP-8.2 | **Custom and generated themes**. Custom themes, sync, named schemes, import, generation from a seed color, and shuffle. | THM-04, THM-05, THM-09 to THM-12 | WP-4.5 | code, design-system, accessibility |
| WP-8.3 | **Toolbar and keybinding customization**. Choosing the six toolbar actions, and `keybindings.json` with conflict warnings (D-170). Acceptance: the toolbar is customized by keyboard alone (pin, unpin, reorder, reset), never holds more than six, and an unpinned action is in ⋯; the choice persists across starts; a binding from `keybindings.json` takes effect, wins over a default on the same key, and a change to the file applies without a restart; conflicts show in Settings → Keyboard and the cheat sheet; invalid entries are reported by position and never stop the rest; the schema accepts exactly what the app applies; no axe violations. | UI-08, KEY-07 | WP-4.2 | code, design-system, accessibility |
| WP-8.4 | **Workspace pro**. Replace across notes, Spotlight filters and preview, sorting and duplicating, and note history. | FIL-11, FIL-13, FND-05, SPT-06 | WP-4.3, WP-3.3 | code, design-system, accessibility |
| WP-8.5 | **Multiple windows**. One note per window, with state kept per window. | DSK-06 | WP-2.2 | code |
| WP-8.6 | **Signing, updates, channels, and stores** *(lookahead)*. Code signing and notarization, automatic updates, Stable and Beta, winget, and Homebrew. Getting a certificate starts early. | DSK-07, DST-04, DST-07 | WP-5.5 | code, security |
| WP-8.7 | **More interface languages**. Translations through the externalized messages, with pseudo-localization checks. | I18N-03 | WP-0.5 | code, design-system, accessibility |
| WP-8.8 | **Document minimap** (D-185, D-186). Notion-style heading rail on the note's right edge, its contents card on hover, and *Show contents* from the keyboard ([Document minimap](../design/components/document-minimap.html)). Acceptance: shown with two or more headings, in focus mode too, and hidden with fewer and where it would overlap the text; one bar per heading with lengths by level; the current section follows the caret in view, else the reading zone's top line, else the last heading at the end; hover opens the card without taking focus, it stays while pointed at and closes on leaving or Esc; choosing a heading puts the caret there and glides it to the reading zone's top over 200 ms (at once with reduced motion); *Show contents* opens it with focus on the current heading, and arrows, Home, End, Enter and Esc work; the heading list never updates on the keystroke; the pin, on the first heading's row, keeps the card open at the same width beside the text (rail gone), through leaving, Esc, a jump and the next launch, falls back to the rail without room, and unpins from the card or the command; no axe violations, light and dark. | UI-13 | WP-1.7, WP-4.2 | code, design-system, accessibility |

**WP-8.1 acceptance checks** (its definition of done, on top of the [work package definition of done](definition-of-done.md); [D-160](decisions.md)):

- **TBL-04:** choosing Align ▸ Center in the column menu, or in the cell menu from the keyboard, writes `:---:` for that column; reopening the note shows it centered. Every marker form (`:--`, `:-:`, `--:`, `---`, short and long) round-trips byte for byte in the corpus (`26-table-alignment.md`), and an aligned column survives an edit, a save, and a reopen (`packages/markdown/test/table.test.ts`).
- **TBL-09:** Sort A→Z and Z→A in the column menu and the cell menu reorder the body rows in natural order (numbers by value, ISO dates by date, text without case or accents, empty cells last), keep the header, the alignment, and equal rows' order, and are undone by one <kbd>Mod</kbd>+<kbd>Z</kbd>; a sorted table adds no undo step (`packages/editor/test/table.test.ts`).
- **FND-03:** with a word inside and outside a selected range, <kbd>Alt+L</kbd> counts and steps through only the ones inside, and replace all changes only those as one undo step (`packages/editor/test/find.test.ts`).
- **EDT-07:** the block handle shows for the hovered block (never while typing), answers on pointer-down, drags it between blocks as one undo step with a drop line, and its menu (Turn into, Duplicate, Move up and down, Copy link to a heading, Delete) opens from the grip and, from the keyboard, with <kbd>Shift</kbd>+<kbd>F10</kbd> outside a table, with no axe violations (`m8-editor-pro`, `packages/core/test/block-handle.test.ts`, `packages/editor/test/blocks.test.ts`).
- **KEY-04:** every Pro row of [Keyboard shortcuts](../experience/keyboard-shortcuts.md) is bound in the Pro layer or listed as planned with its work package (`packages/core/test/keymap-layers.test.ts`).
- **Journeys and budgets:** the M8 journey `m8-editor-pro` sorts, aligns, and finds in a selection from the keyboard alone with no axe violations, and the M1 editor, table, and find journeys still pass. The typing budget (PRF-01) is unchanged: nothing new runs on a keystroke.

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- The [project definition of done](definition-of-done.md#project-definition-of-done) is met.

<h2 id="later" data-reader-personas="product design engineering">Later: Components</h2>

**You can:** Image, then gallery, each added as one block registration with directive syntax.

**Used by:** Anyone. **Delivered as:** Later releases.

**Demo script** (run by the owner on clean machines at the gate, then automated):

1. Insert an image and a gallery, save, and open the file in a plain Markdown viewer: it stays readable.

**Work packages**

| ID | Work package | Requirements | Depends on | Reviews |
| --- | --- | --- | --- | --- |
| WP-9.1 | **Image block**. An image block registration. | EXT-03 | WP-1.1 | code, design-system, accessibility |
| WP-9.2 | **Gallery block**. A gallery block registration. | EXT-04 | WP-9.1 | code, design-system, accessibility |

**Exit criteria** (in addition to the [stage definition of done](definition-of-done.md#stage-definition-of-done)):

- Round-trip and the block registry contract hold for both components.

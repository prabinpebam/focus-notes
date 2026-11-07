# Roadmap

> **MAI owner feedback, D-267 (built, verifying as of 6 November):** WP-AI.15 owns AIS-16, the single directly selectable Settings AI connections list, now in Preview. Default is the same device-local Writer as Rewrite's remembered picker. One Find on this PC button replaces the local section. UX-LIST.1 to UX-LIST.5 evidence and Try it are in [Definition of done](definition-of-done.md#settings-ai-single-list-stage); [candidate evidence](rewrite-acceptance.md#settings-list-combined-candidate-1-november) retains the earlier scoped checks. Owner acceptance and the full MAI gate remain pending.

The stages in which Focus Notes gets built. Every stage ends with an app someone can install and use for real work, and every requirement belongs to exactly one stage. The work inside each stage is in the [Implementation plan](implementation-plan.md), what "done" means is in [Definition of done](definition-of-done.md), and how agents carry the work is in [The agentic loop](agentic-loop.html). There are no dates, because neither the seed spec nor the owner has set any.

> [!NOTE]
> **TL;DR.** The stages below, each a vertical slice that leaves something usable. **3 November:** browser writing, the owner vault and the demo are retired (D-292), so MW's browser-writing outcome below is historical; **MP** brings projects, simpler sharing and a read-only website, smallest visible slices first (D-314). **M0** runs: an installable skeleton that saves a note. **M1** writes: the full editor, focus mode, themes, and find. **MW** is your Focus Notes on GitHub Pages: write in any browser with no account, kept in that browser, and read your site's public notes and, once unlocked, your private ones (D-80, D-90). **M3** makes the desktop app the one place that saves to GitHub (sign-in through Git's own tools, your instance, commits and sync), and **M2** gives it the real desktop window (D-85, D-90). **M4** adds Spotlight and the theme manager. **M5** publishes public links and shares, and is **version 1.0**. Then **M7** agents, **M8** polish, and later the image and gallery components. Each stage exits only when its demo script passes on clean machines, its definition of done is met, and the owner accepts it. Every demo script then becomes an automated journey test, so earlier progress can't silently break.

## Stages at a glance

| Stage | In short | Used by | Delivered as | Requirements |
| --- | --- | --- | --- | --- |
| **M0: Walking skeleton** | It runs. | The team, on their own computers | Preview 0.0.x on GitHub Releases (pre-release, unsigned) | 29 |
| **M1: Writing** | Write a real document. | The owner, for real documents | Preview 0.1.x | 56 |
| **MW: Your Focus Notes on GitHub Pages** | Historical browser-writing scope, retired by D-292. | The owner, then anyone | Preview 0.2.x | 20 |
| **M3: Desktop sign-in and Git** | Your instance on your computer. | The owner, then invited testers | Preview 0.3.x | 21 |
| **M2: The desktop app** | A dedicated desktop experience. | The owner, then invited testers | Preview 0.3.x | 9 |
| **M4: Find anything, make it yours** | Everything is one keystroke away. | Invited testers | Preview 0.4.x | 13 |
| **M5: Publish and share** | Version 1.0. | Anyone | 1.0 stable on GitHub Releases | 30 |
| **M7: Agents** | Your agents can help, safely. | Anyone | 1.2 | 8 |
| **M8: Polish and pro features** | Make it yours, fully. | Anyone | 1.x | 23 |
| **MAI: Rewrite with AI** (before Later) | Select text, give a prompt, and the answer from the AI service you chose streams in place as one undo step; Settings → AI connects 26 kinds of local or cloud service. Built in the owner's review build (D-256, D-257). | Owner, then desktop writers | Desktop 1.x | 46 |
| **MP: Projects and simpler sharing** | Desktop slices built and verifying; G1–G7 close production gaps, including the transferred live leak gate (D-382). | Desktop writers and website readers | Preview; partial 1.x | 37 |
| **MACT: Actions you can trust** (built, verifying) | Spotlight becomes Actions, *Find and act*: files and folders, and only proven, distinct actions grouped by what they act on. Own actions deferred. | The owner, then desktop writers | Preview 1.x | 16 |
| **Later: Components** | Inline images, safe media assets/sharing, crop/rotate and optional captions; gallery separately. | Writers and readers | Later releases | 14 |

## Where we are

**Settings type ramp (1 November, D-258).** A low-risk refinement to DSY-01 / WP-0.3 (M0): the shared Heading/Text primitives separate section headers (20 px / 700), subsection labels (16 px / 600) and body/help text (14 px / 400). The [foundations](../design/foundations.md#type) record the complete ramp and chain; the owner's combined review build is prepared by the coordinator, not merged here.

### Historical MP build order (3 November, evening)

The projects, Files, Local notes, images, sharing and publishing UX was approved (owner, 19:39; D-335 and the projects mocks). This was the implementation order, not today's status; the current assessment follows below. Each package is checked against its [Definition of Done rows](definition-of-done.md#projects-and-simpler-sharing):

1. **WP-P.16** Switch primitive (landed on `main` at `2bc655a5`).
2. **WP-P.9** item-first share dialog, in parallel with the general fixes **WP-P.1**, **WP-P.2**, **WP-P.7** (D-338, today's workspace) and **WP-P.3**.
3. **WP-P.17**, **WP-P.4**, **WP-P.5**, **WP-P.19**, **WP-P.20**, **WP-P.6**.
4. Files type ramp (FIL-19, D-332), then **WP-P.8** Local notes and the location pill.
5. Images: **WP-9.1**, **WP-9.3**, **WP-9.4** (display, menu and crop built); next, by [the 5 November readiness assessment](../experience/images.md#readiness-assessment-5-november) (D-349): **WP-9.7** with WP-9.3's storage core, then WP-9.1's rest, **WP-9.8**, **WP-9.9**, **WP-9.5**, **WP-9.6**.

Sharing follow-ons come after WP-P.9: **WP-P.10**, **WP-P.18**, **WP-P.11**, then **WP-P.12**, **WP-P.14** and **WP-P.15**. Publishing (5 November readiness, D-349): gallery mocks for the missing publish states, then **WP-P.22** on today's workspace, once the owner answers [the publishing questions](../experience/published-site.md#readiness-assessment-5-november).

### Current state (16 October, evening)

**Updated 7 November, evening.** This heading stays unchanged so existing links keep working. The read-only audit at `42bc9a30` found production gaps behind fake-only paths; F1's no-remote backup status and F4's New-project folder acceptance have since landed (`b933b03e`, `4ed4ad48`, `6667dc33`, exact-head CI `42381219626` seven of seven green). D-378/G0–G7 DoD landed in `50e23d3e`. This is a main/spec assessment, not a new inspection of the scheduled Preview or real-account certification. Statuses live in [`work-graph.json`](work-graph.json); verifying is not formal stage sign-off. The stage-by-stage history below is historical.

#### Built and in Preview

| Stage | Delivered |
| --- | --- |
| M0 to M4 | The writing editor, blocks, tables, slash menu, focus mode, themes, font size, find/replace, shortcut layers, desktop window, isolated crash recovery, sign-in and Git sync, private/public notes, Recently deleted, Spotlight and theme manager. Built and verifying; no formal stage sign-off recorded. |
| M5 | Public/private notes, public pages, sealed link/passcode shares with expiry, Extend/Withdraw, diagnostics, Send feedback (WP-5.12) and close to tray. Release qualification and remaining first-run work are still open. |
| M7 | MCP server, agent permissions (Switches), CLI and deep links. |
| M8 | Customize toolbar, note history (FIL-13, separately verifying WP-8.8), Open in new window, minimap, per-repository backup, Import files and Print. Custom/generated themes, sort/duplicate, replace across notes and Spotlight filters/preview retain partial scope; their complete outcome proof is not claimed. |
| MAI | Settings → AI with 26 service kinds, inline prompt, streaming rewrite with formatting and one Undo, Ctrl+Shift+R, Ctrl+Enter to send, and writing at the caret without a selection. The full MAI gate remains open. |
| MP | Item-first Files Share dialog, first-share confirmation, Project wording, distinct project windows/profiles and scope, 2 px colour outline with Switch, pill/watermark, preset/uploaded logos, project font/theme, Open with recent/project cards (GitHub link and size), pins, caret restoration, New note in…, Rename file, Local notes/location pill and in-app Open file. Delete project is built with fake-account tests only. Preview site is full-window but local only. |
| OFB | Every allocated row is met: shared button geometry/padding, Settings Switches, one pending pattern, auto-dismiss notifications, slash blocks/Table insertion, images slice 1, Customize toolbar, Actions A.2 to A.6, project border, restored toolbar icons, code tint, table-wide focus and disabled-section fade. [Evidence](gate-evidence.md#owner-feedback-batch-6-november-ofb) records final Preview `ca6ae17`. |
| Images | Local images, Column/Wide/Actual, Rounded corners, Limit height, crop/rotate, broken-image Retry, paste/drop/Insert image/slash/Actions insertion into managed assets, and metadata stripping before public Git writes. Print and Save as PDF with captions and missing descriptions (WP-9.8 / IMG-12) landed at `42cb1ed8`: [42216947356](https://github.com/prabinpebam/focus-notes/actions/runs/42216947356) passed every Windows job; Preview refresh is not independently inspected. This is not completion of the whole image stage. |

#### Waiting on the owner

| Decision or acceptance | What remains |
| --- | --- |
| Publishing P1 to P4 | [Readiness questions](../experience/published-site.md#readiness-assessment-5-november): publish on today's project rather than wait for a separate site repository; `/n/` note paths; stripped location/camera metadata; first live publish on the real site or a throwaway repository. Until answered, Publish… saves only a local preview draft. |
| First real Delete project | The owner's manual run, including progress, status-check and resume screens (D-343). Agents never delete a real repository; MP.34 real-account acceptance is open. |
| On-disk Project rename | UI terminology is delivered; folders, the workspace-format filename and template files are a separate decision, part c of “Project replaces workspace”. No disk move is implied. |
| Faster reopen | `fix-reopen-residual` is paused after red CI on 5 November (shards 2 and 3); resume or drop. |
| Your own actions | WP-A.7 / MACT.9 is deferred by D-364 until a week using the starter set. |
| MAI acceptance | Full gate and owner acceptance remain open; real providers beyond connected ones require approval (WP-AI.7, WP-AI.8). |

### Gap closure: what's next

The owner chose systematic P0/P1 closure on 7 November at 21:10 (D-379). Each slice has its [DoD before implementation](definition-of-done.md#gap-closure-7-november-p0-and-p1), requirements and an owning WP in the [implementation plan](implementation-plan.md#gap-closure-execution-order-7-november). Existing dependencies still apply; the order is the visible delivery priority, not a reason to duplicate ownership or serialize independent safe preparation.

| Order | A person gains | Requirement / stage / package | Remaining dependency |
| --- | --- | --- | --- |
| G1 | Choose On this computer only or On GitHub and start an empty note, with real production creation and honest backup | PRJ-01, UC-PROJ-01 / MP / WP-P.4; D-378 resolves S1 | Fake-backed runtime evidence and exact-head gate; owner first real creation |
| G2 | Turn on sharing for a new project with named public-site confirmation; invite a GitHub account with an honest role | PRJ-10/12, SHR-05–16, UC-SHARE-08/09/12 / MP WP-P.18/11/9, M5 WP-5.1–5.4 and M8 WP-8.12 | Owner first real site activation/invite; no public effect before confirmation |
| G3 | Publish/Unpublish reaches Pages, with a live leak gate and exact-commit status | SHR-20/25/26, SHR-04, SEC-06, UC-SHARE-02/10 / MP WP-P.22/12 | Owner first real Publish/Unpublish and target; agents use fakes |
| G4 | Open .txt on its own and save plain text without conversion or Git | PRJ-09, UC-PROJ-08 / MP / WP-P.8 | Standalone byte/recovery/Windows association journey |
| G5 | Recover missing/moved notes without an empty replacement | FRE-11–13, UC-SAFE-08–10 / M5 / WP-5.14 | Disposable removed/recovered-folder journey; owner real account recovery if needed |
| G6 | Use opaque random codes, Copy again, Extend/Withdraw and the exact share template | SHR-17–19/23, UC-SHARE-03–05, UC-READ-02 / MP / WP-P.10 | SHR-23 first; owner first real share/Extend/Withdraw |
| G7 | Sign out/remove a project without leaving private traces in other profiles | PRV-02 / M3 / WP-3.6 | Cross-profile/live-writer cleanup proof; source notes/remotes untouched |

**Spec closure G0:** S1 is D-378; S2 transfers SHR-04/SEC-06 to live WP-P.22 (D-382); S3 makes macOS/Linux installers and desktop matrix after v1 in the Store (D-211/D-383); S4 is W-create2's separate D-381 repository-rename ruling, not a new feature; S5 defers undesigned Spotlight Share (D-384); S6 uses current build assessments (D-385); S7 separates built FIL-13 into verifying M8 WP-8.8 (D-386). Every finding has a durable flow and negative-case evidence; first-real rows remain owner-dependent. F4.x is still the owner's first deletion.

No agent creates/deletes/invites/publishes on a real account. D-379 authorizes safe implementation, not real output or a release. Nothing becomes public without the owner pressing the button. Windows is the desktop delivery target until v1 is in the Store; non-Windows parts of DST-03/QLT-02 follow afterward.

#### Specced but missing or partial

| Area | Remaining work |
| --- | --- |
| MP | Explorer file associations (WP-P.8); Invite sends only a local draft, not GitHub invitations (WP-P.11); live Publish/Unpublish, deploy status, live theme and public home sections/counts (WP-P.22, WP-P.12, WP-P.14); browser app/demo/IndexedDB retirement (WP-P.13); separate site repository per project (D-312), full Turn sharing off across that model (WP-P.18), and extended opaque-name/media leak proof (WP-P.10, MP.14). Windows sharing copies information; macOS uses the share sheet, as designed. |
| Images | Description/caption, Cut/Copy/Replace/Save and remembered defaults (rest of WP-9.1); move/copy link rebasing (rest of WP-9.3); publishing (WP-9.9), AI captions (WP-9.5), encrypted sharing (WP-9.6; notes with images cannot yet be shared), and Gallery (WP-9.2). Image printing (WP-9.8) is built and verifying, not missing. |
| M5 / 1.0 | Notes-folder recovery/sync status is partial (WP-5.14); choosing where notes live and Move… are missing (WP-5.15). Template update PRs (WP-5.6), Windows splash/launch timing (WP-5.16), Store-package Git (WP-5.17) and release qualification (WP-5.7) remain in progress. |
| M8 | Code signing, automatic updates, Beta, winget and Homebrew (WP-8.6) and more interface languages (WP-8.7) remain missing; the Store build updates itself. Custom themes, workspace pro and multiple windows retain remaining scope in building packages. |
| Product site and Help | 11 articles of roughly 40 planned (WP-10.3); Learn more links (WP-10.7) missing; Help extras, screenshots and landing work remain building. Browser writing is retired in the product direction, not yet removed from `apps/web`. |
| MAI / MACT | MAI gate evidence and Help (WP-AI.9), shortcut names in menus (WP-AI.12); unlisted Actions candidates remain unlisted until wired: Caption image with AI, Show this project in Explorer, Open this project on GitHub. |

**Evidence is not stage acceptance.** MP.5 has recorded evidence; remaining MP rows still need named proofs, including the two-project MP.1 journey and real-account MP.8/MP.34. IMG.11 and [IMG.12](gate-evidence.md#inline-images-print-and-save-as-pdf) are met by automated evidence; other image rows remain open. MACT is met except deferred MACT.9; OFB is met. No formal owner stage sign-off is claimed.

**IMG-12 Try it after Preview updates:** open a note with images → More → Print… → Save as PDF: images and captions in place, none split; a missing image prints its description.

**Known open defects:** DEF-40 save-timing flake is quarantined until 7 November; DEF-42 rename storm takes 1067 ms against 1000 ms only under 4× CPU stress (owner allowed landing). The Preview-versus-Store launch lock was fixed on 6 November (D-366); the paused reopen candidate is not landed.

**Next work is the owner's choice**, not an automatic feature queue. Read the project context in [`AGENTS.md`](../../AGENTS.md), keep partial-package scope explicit, and protect the owner's notes, privacy and computer.

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
<p>Historical browser-writing stage, retired by D-292: local browser notes, public reading, owner Unlock and the export ease-in remain descriptions of the old runtime, not future delivery promises. Safe recovery of existing browser drafts belongs to WEB-01. <a href="implementation-plan.md#mw">Details</a>. DST-01, DST-02, DST-05, FIL-01 to FIL-03, FIL-07 to FIL-09, FRE-09, PKG-05, PKG-07 to PKG-11, PRF-09, PRF-11, SEC-08, UI-12. Active leak requirements SHR-04 and SEC-06 belong to MP / WP-P.22 (D-382), not this retired stage.</p>
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
<p>The first public release. Public notes are published to your own GitHub Pages site. Private notes and folders can be shared with named audiences through magic links and passcodes. Visitors' *Use this app for yourself* dialog links to the downloads, and every release ships with checksums, an SBOM, and attestations. <a href="implementation-plan.md#m5">Details</a>. DSK-09, DSK-10, DSK-11, DST-03, DST-06, DST-08, EDT-14, FRE-11 to FRE-15, PKG-02, PKG-12, PKG-13, PRF-05, PRF-06, PRF-12, PRF-13, PRF-14, PRV-04, QLT-02, QLT-04, QLT-07, SEC-05, SHR-03, SHR-05 to SHR-11.</p>
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
<p>Block handle, column alignment and sorting, the Pro shortcut layer, custom keybindings, find in selection, replace across notes, Spotlight filters and preview, note history, custom and generated themes, synced appearance, multiple windows, a document minimap, printing, signed builds with automatic updates and channels, store listings, more interface languages, and isolated crash recovery. <a href="implementation-plan.md#m8">Details</a>. DSK-06, DSK-07, DST-04, DST-07, EDT-07, FIL-11, FIL-13, FIL-14, FIL-15, FND-03, FND-05, I18N-03, KEY-04, KEY-07, QLT-06, SHR-12, SPT-06, TBL-04, TBL-09, THM-04, THM-05, THM-09 to THM-12, UI-08, UI-13.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">MAI: Rewrite with AI (building)</p>
<p>WP-AI.11 also owns the integration icon increment (D-263, 1 November): CP-RWR-01 → SC-RWR-04 → UC-RWR-05 → IA-CMP-REWRITESTATUS → DD-RWR-07 → AIS-03. Licensed monochrome service marks and explicit neutral fallbacks share the Icon primitive and a kind-to-icon API; built on fix-ai-icons, not merged.</p>
<p>D-264 extends WP-AI.11's AIS-02 to AIS-04 and AIS-07 to AIS-11: GitHub Copilot (on this computer), a Cloud-labelled official CLI SDK integration. Find directly adds supported signed-in Copilot without generation, preserving an existing active integration and first-send consent. Isolated login reuse, zero tools, dummy streaming and abort proven on 1 November; adapter integrated on <code>own-candidate</code> with icons, type ramp and picker, not main. Claude subscription reuse is dropped, Gemini held, Codex deferred. No new requirement IDs or stage.</p>
<p>Desktop rewriting in place: select text, then <kbd>Ctrl+Shift+R</kbd> or Rewrite… in the text menu, give a prompt, and the answer streams over the selection as one undo step; <kbd>Esc</kbd>, Stop and errors put the original back. WP-AI.14 (built 1 November, D-265/D-266) replaces the modal with an inline selection-anchored popover: document scrolling, viewport clamping while any selected fragment is visible, prompt-loss confirmation only for written drafts, no passage preview or first-send disclaimer/consent. Active integration and remembered picker stay. <a href="definition-of-done.md#inline-prompt-popover-definition-of-done">Try it / UX-POP.1 to UX-POP.6</a>; locally verified, candidate integration and owner review pending. Settings → AI connects 26 kinds of service on this computer or in the cloud, with sealed keys, Find on this computer and Test. Focus Notes never runs a model. Browser rewriting is not included. <a href="implementation-plan.md#mai">Details</a>; <a href="rewrite-acceptance.md#stage-gate">GATE-MAI</a>. RWR-70 to RWR-90, AIS-01 to AIS-15, KEY-08, SPT-09, UI-14, FOC-07, HLP-10, PRV-05, SEC-09, PRF-15, QLT-08, A11Y-03, I18N-04, DSY-14, DOC-03, LIC-03.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">MP: Projects and simpler sharing (planned)</p>
<p>The <a href="next-direction.md">3 November direction</a> adds project windows, safe SVG logos, pins, local capture, opaque names-free item sharing, account collaborators and a read-only website/preview. A project is a Git folder on this computer only or linked to a private GitHub repository (D-378). Existing terminology migration moves no files; browser retirement preserves existing drafts and leaves ordinary import independent. <a href="implementation-plan.md#mp">23 work packages</a>; <a href="definition-of-done.md#projects-and-simpler-sharing">Try it and GATE-MP</a>. PRJ-01 to PRJ-25 (PRJ-24 in WP-P.4, PRJ-25 in WP-P.19), FIL-17 to FIL-19, KEY-09, RWR-91, RWR-92, SPT-10, SHR-13 to SHR-26, SHR-04, SEC-06, DSY-15, WEB-01. D-382 transfers the active leak gate to WP-P.22. <a href="definition-of-done.md#gap-closure-7-november-p0-and-p1">G1–G7</a> supplies production and failure evidence before safe fake-backed implementation; real Publish/Unpublish and target choice remain the owner's. <strong>Sharing UX approved (D-335):</strong> build the existing gallery dialogs, add nothing to the writing window (D-336). <strong>WP-P.23 / PRJ-23:</strong> approved and production handoff/folder acceptance landed; <a href="../experience/project-model.md#deleting-a-project">first real deletion</a> remains the owner's F4.x/MP.34, never an agent action.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">MACT: Actions you can trust (approved 6 November, building)</p>
<p>The owner's Spotlight note of 5 November: Spotlight becomes <a href="../experience/actions.md">Actions</a>, tagline <em>Find and act</em>. It finds the project's files and folders, and lists only a curated, proven catalogue of actions, grouped by what they act on (this selection, this note, this project, the app), each with a label no other action shares; blocked actions say why and list their fix. The rules are the <a href="../architecture/actions-framework.md">Actions framework</a>. The allow-list and the name are the first slice the owner can try. <a href="implementation-plan.md#mact">7 work packages</a>; <a href="definition-of-done.md#actions-mact">Try it and GATE-MACT</a>. ACT-01 to ACT-16. Approved by the owner on 6 November (D-361 to D-364); building on <code>wp-mact</code>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Later: Components (Rich components)</p>
<p><a href="../experience/images.md">Inline images</a>: managed local assets first (WP-9.3), then insertion/display/menu/bulk options (WP-9.1), encrypted image sharing once shares have opaque names (WP-9.6, D-314), explicit destructive crop/rotate (WP-9.4) and optional chosen-integration captions (WP-9.5). Gallery remains separate (WP-9.2). Five new scenarios and six capabilities trace the source to IMG-01 to IMG-13, EXT-03 and EXT-04. Part of WP-9.1 and WP-9.4 is built; the [readiness assessment](../experience/images.md#readiness-assessment-5-november) orders the rest in eight slices, starting with paste, drop and Insert image… (WP-9.7, D-349), then print (WP-9.8) and published images (WP-9.9). <a href="implementation-plan.md#later">Plan</a>; <a href="definition-of-done.md#inline-images-planned">Try it and evidence</a>. Specification only; no implementation or release date is claimed.</p>
</li>
</ol>

## Changing the plan

The stage of a requirement changes here and in the [implementation plan](implementation-plan.md) together, and the plan check confirms that every requirement still belongs to exactly one work package. A change that moves a P0 requirement out of M0 to M5 needs an owner decision in [Decisions](decisions.md).

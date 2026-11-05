# Actions: find and act

**Draft, for owner review (6 November 2026).** The feature the owner's Spotlight note asks for: one dialog, **Actions**, tagline **Find and act**, that opens any file or folder in the project and runs a curated set of actions that all work and can't be confused. The rules behind it are the [Actions framework](../architecture/actions-framework.md).

> [!NOTE]
> **TL;DR.** <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>⌘/</kbd>) opens **Actions**. Type to find a file or folder (Enter opens it; a folder opens in Files, focused) or an action (Enter does it, or starts its flow). With text selected, *This selection* comes first (*Bold*, *Add link…*, *Rewrite with AI…*); then *This note* (*Share this note…*, *Publish this note…*), *This project* (*Project settings…*, *Rename project…*) and *App* (*Sign in to GitHub…*, *Connect to AI…*, *Keyboard shortcuts*, *Customize toolbar…*). About 55 proven actions are listed, each with a label no other action shares; today's ~200 rows, with *Cancel*, *Retry* and two identical *Share…*, go. Nothing is added to the writing window: the dialog, its keys and the toolbar's existing trigger are what Spotlight already has.

| Promise | Scenario | User can | Surface | Requirements and decisions |
| --- | --- | --- | --- | --- |
| CP-REACH-01 | SC-ACT-01 | UC-ACT-01 | IA-VIEW-SPOTLIGHT | ACT-03, ACT-04; D-TBD (name, content) |
| CP-REACH-01 | SC-ACT-02, SC-ACT-05 | UC-ACT-02, UC-ACT-06, UC-ACT-08 | IA-VIEW-SPOTLIGHT | ACT-01, ACT-02, ACT-06, ACT-07, ACT-09, ACT-12; D-TBD (allow-list, distinction) |
| CP-REACH-01 | SC-ACT-03, SC-ACT-04 | UC-ACT-03, UC-ACT-04, UC-ACT-05 | IA-VIEW-SPOTLIGHT, IA-CMP-REWRITEPROMPT | ACT-05, ACT-10, ACT-11, ACT-15; D-TBD (anchors, AI actions) |
| CP-REACH-01 | SC-ACT-06 | UC-ACT-07 | IA-VIEW-SPOTLIGHT | ACT-08 |
| CP-REACH-01 | SC-ACT-07 | UC-ACT-09 | IA-VIEW-SPOTLIGHT | ACT-13, ACT-14 (later, needs the owner's yes) |

## The jobs

Each job is in [Scenarios](../product/spec/scenarios.md#actions); each capability in [User can](../product/spec/user-can.md#actions). Jobs 1 to 4 and 6 come from the owner's note; 5 is the note's "distinction" line; 7 is a proposal.

| Job | When I… I want to… so I can… | Source |
| --- | --- | --- |
| SC-ACT-01 | …know roughly which file or folder I want, type part of its name and land on it, a folder shown in Files, so I never browse | Owner (content) |
| SC-ACT-02 | …want to do something in the app but don't know where it lives, type what I want and do it, so I never hunt through menus | Owner (independent actions) |
| SC-ACT-03 | …have selected words or an image, see what I can do to them first, so formatting, linking or rewriting is a few keys away | Owner (explicit anchor) |
| SC-ACT-04 | …am in a note or a project, act on it without naming it, so sharing, publishing or renaming it is quick | Owner (implicit anchor) |
| SC-ACT-05 | …see two actions that sound alike, know which is which before I press Enter, so I never do the wrong one | Owner (distinction) |
| SC-ACT-06 | …find an action that can't run yet, see why and reach the fix, so I'm never stuck on a dead row | Proposal, from "don't work, can't work" |
| SC-ACT-07 | …reuse the same instruction or opening text, keep it as my own action, so I don't retype it | Proposal P-10 (later) |

**One, several, all.** Actions act on one anchor: one selection, the current note, the project, or one chosen result. Several notes or folders are acted on in Files, which already selects several and batches moves, visibility and deletion (D-99); Actions' *Show in Files* gets you there. "All" isn't a job any starter action serves.

## The starter set

**Owner:** "only the ones we know for sure makes sense and actually works." Each row passes the [seven tests](../architecture/actions-framework.md#what-qualifies-an-action) on paper; it's **listed** only once its proof passes (ACT-02). *Command* is the existing command it runs, so most rows are relabelling and proving, not building. *New* means a small piece of wiring to an existing surface.

### App (no anchor)

| Action | Does | Command | Effect | Why it's in | Source |
| --- | --- | --- | --- | --- | --- |
| Sign in to GitHub… | Starts sign-in; listed only while signed out | `account.signIn` (was *Sign in…*) | flow, leaves: GitHub | Owner's first example; today's label doesn't say to what | Owner |
| Sign out of GitHub | Asks, then signs out; listed only while signed in | `account.signOut` | flow | The pair to the above; one shows at a time (D6) | Proposal |
| Connect to AI… | Opens Settings → AI ready to add or find a connection | *New:* opens `settings` at AI and runs `ai.add` | flow | Owner's example; today needs Settings → AI → Add | Owner |
| Keyboard shortcuts | Opens the searchable cheat sheet | `shortcuts.open`; synonyms *shortcuts mapping, keys, hotkeys, cheat sheet* | navigate | The owner asks for one; it exists (KEY-05) but isn't found by "mapping" | Owner ([question 4](#open-questions-for-the-owner)) |
| Customize toolbar… | Opens toolbar customizing | `toolbar.customize` | flow | Owner's example | Owner |
| Change theme… | Opens the theme picker (your theme, on this device, D-46) | `theme.manager.open` (was *Theme…*) | flow | Owner: "I can change the theme" | Owner ([question 5](#open-questions-for-the-owner)) |
| Use light appearance / Use dark appearance / Match system appearance | Sets it at once; the current one shows *On* | `appearance.light`, `.dark`, `.system` | toggle | Replaces *Switch light and dark* and the stepping *Appearance* row: three clear outcomes (D6) | Proposal |
| Focus mode | Turns it on or off, showing its state | `focus.toggle` | toggle | Existing capability (UC-FOCUS-01); replaces two rows (command and setting) | Proposal |
| Settings… | Opens Settings | `settings.open` | navigate | The way to everything not listed | Proposal |
| Open project… | Opens the project chooser | `projects.choose` | flow | Global by nature (D-309); one of two today | Proposal |
| New project… | Starts a new project | `projects.new` | flow | Global | Proposal |
| Open file… | Opens a single file outside any project | `projects.openFile` | flow | Global | Proposal |
| Help and docs | Opens Help in the browser | `help.open` | navigate, leaves: browser | Help in context (H10) | Proposal |
| Send feedback… | Opens Send feedback | `feedback.open` | flow, leaves: GitHub | Existing | Proposal |
| Report a problem… | Opens the problem report with diagnostics | `diagnostics.reportProblem` | flow | Existing; distinct from feedback by its outcome line | Proposal |
| Full screen | Toggles full screen | `window.fullScreen` | toggle | Existing | Proposal |

### This project (implicit anchor; project windows only)

| Action | Does | Command | Effect | Why it's in | Source |
| --- | --- | --- | --- | --- | --- |
| Project settings… | Opens Settings → Project | `project.settings` (was *Project*) | navigate | Owner's example; today's label is one ambiguous word | Owner |
| Rename project… | Opens Settings → Project with the name field focused | *New:* `project.settings` with a focus target | flow | Owner's example | Owner |
| Project colour and logo… | Opens Settings → Project at its colour and logo (D-275) | *New:* `project.settings` with a focus target | flow | The project's own look, distinct from your theme | Proposal ([question 5](#open-questions-for-the-owner)) |
| New note | A new note in the current folder | `note.new` | edit (files) | The most common action | Proposal |
| New note in… | Choose a folder or project first (KEY-09) | `note.newIn` | flow | Owner's earlier request; the seven *New note in…* rows become one | Proposal |
| New folder… | Asks a name, in the current folder | `files.newFolder` (was *New folder*) | flow | Existing | Proposal |
| Show Files | Opens the Files panel | `files.open` (was *Files*) | navigate | Distinct from *Show this note in Files* (D5) | Proposal |
| Find in all notes | Opens Find in all notes | `find.allNotes` | navigate | Exhaustive text search (D-110) | Proposal |
| Import files into this project… | Picks files to copy in | `files.import` (was *Import files…*) | flow | Existing; names where they go | Proposal |
| Show project folder | Opens it in Explorer or Finder | `projects.reveal` | navigate, leaves: system | Existing | Proposal |
| Open project on GitHub | Opens the repository in the browser; hidden for a project on this computer only | `projects.openRepo` | navigate, leaves: browser | Existing | Proposal |
| Sync with GitHub now | Saves and syncs now; hidden for a project on this computer only | `sync.now` (was *Save to cloud*) | outbound | "Cloud" isn't a word the app uses elsewhere; *Back up to GitHub* (`repoBackup.backUp`) must merge with it or be told apart before either is listed (D5) | Proposal |
| Recently deleted | Shows deleted notes you can restore | `files.showDeleted` | navigate | The way back from Delete | Proposal |

### This note (implicit anchor; a note or file is open)

| Action | Does | Command | Effect | Why it's in | Source |
| --- | --- | --- | --- | --- | --- |
| Share this note… | Opens the share dialog for this note | `note.share` (was *Share…*) | outbound | Owner's example; today two rows say *Share…* | Owner |
| Publish this note… / Unpublish this note | Puts it on, or takes it off, the project's website (D-349) | `note.publish` (was *Publish…*) | outbound | Owner's example; today two rows say *Publish…* | Owner |
| Rename note… | Renames the file; the title stays the note's first heading (FIL-18) | `files.rename` (was *Rename file…*) | files | Common; the outcome line says it's the file name | Proposal |
| Move note to… | Chooses a folder | `files.moveTo` | files | Existing | Proposal |
| Duplicate note | Makes a copy beside it | `files.duplicate` | files | Existing | Proposal |
| Show this note in Files | Reveals and selects it in Files | `files.reveal` | navigate | Existing | Proposal |
| Show in Explorer (Finder on macOS) | Opens its folder in the system | `note.revealLocal` | navigate, leaves: system | Existing, label missing today | Proposal |
| Note history | Opens this note's versions | `history.open` | navigate | Existing | Proposal |
| Show contents | Opens the headings card | `outline.show` | navigate | Existing (UC-FIND-06) | Proposal |
| Write with AI… | Opens the AI prompt at the caret (RWR-92); listed when nothing is selected | the rewrite command at the caret | outbound, leaves: AI | Existing capability, findable by "write", "AI" | Proposal |
| Print… | Opens printing for this note | the print command | flow | Existing (print page) | Proposal |
| Delete note | Moves it to Recently deleted | `files.delete` | destructive | Existing, with Files' confirmation | Proposal |

**Not both, until told apart:** *Make this note public…* and *Publish this note…* may reach the same outcome now that public notes are what the website shows. Only *Publish* (the owner's word) is in the starter set; *Make public/private* returns only if the build shows a different outcome, with labels that say how (D5).

### This selection (explicit anchor)

| Action | Does | Command | Effect | Source |
| --- | --- | --- | --- | --- |
| Bold, Italic, Strikethrough, Inline code | Formats the selection; state shows *On* where it's already applied | `format.bold` and siblings | edit, one undo step | Owner (bold); the rest proposal |
| Add link… | Opens the link editor on the selection | `link.edit` (was *Add or edit link*) | edit | Proposal |
| Rewrite with AI… | Opens the prompt on the selection | the rewrite command (SPT-09) | outbound, leaves: AI | Proposal |
| One row per rewrite preset (three today), for example *Make shorter with AI…* | Opens the same prompt **pre-filled**; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends | the rewrite command with the preset | outbound, leaves: AI | Proposal P-08 |
| Edit image… (image selected) | Opens crop and rotate | `image.edit` | flow | Proposal |
| Caption image with AI… (image selected, once IMG-09 is built) | Opens the caption request for this image | the caption command | outbound, leaves: AI | Proposal |

### A result's own actions (<kbd>→</kbd> on a note or folder row)

Kept from Spotlight's quick actions, curated by the same rules: **note:** Open, Rename note…, Move to…, Share…, Publish…, Copy Markdown link, Show in Files, Delete; **folder:** Show in Files, New note here, New folder here…, Rename folder…, Move to…, Share folder…, Delete folder. The panel's heading is the item's name, so *Share…* there can't be mistaken for *Share this note…*. *Open in new window* goes (one window per project, D-309).

### When nothing matches

*Create note "…"* and *Find "…" in all notes*, as today (SPT-04).

## Deliberately out

| Left out | Why | Still reachable |
| --- | --- | --- |
| Steps inside flows: *Cancel*, *Retry*, *Next*, *Back*, *Save the name*, *Restore this version*, *Got it*, *Dismiss* | Q1, Q2: they belong to their dialog | Their dialog's buttons |
| Keys described as actions: *Cut, copy, paste*, *Select all*, *Line break within a block*, *Indent or outdent* | Not something you'd set out to do from a dialog | The keys; the cheat sheet |
| Actions' own keys: *Next result*, *Show actions for the selected result* | Plumbing of the dialog itself | The keys |
| Browser-era actions: *Download the desktop app*, *Lock*, *Unlock private notes…*, *Forget this browser*, *Reset demo* | Q6: browser writing is retired (D-292) | — |
| *Open in new window* | Q6: one window per project (D-309) | *Open project…* |
| Developer rows: *Copy command ID*, *Reload panel*, *Report an action failure* | Not a person's goal | Diagnostics |
| *Turn into heading, list, quote…* | The slash menu and Markdown typing already do it where the caret is (SC-WRITE-05) | `/` |
| Text size and interface size steps | Keys do it faster; a six-row group for one setting is noise | Keys; Settings → Appearance |
| "Ask AI about my notes" | Would send private notes beyond a selection | Not proposed |
| Chains, macros, scripts, plugins | [Framework](../architecture/actions-framework.md#composition-and-chaining): no starter job needs them, and code is a security boundary | — |

## Task flows

Every flow starts with <kbd>Ctrl</kbd>+<kbd>/</kbd> or the toolbar's existing trigger, and Actions captures the context (project, note, selection) before it takes focus.

| Flow | Steps | Branches | Wait |
| --- | --- | --- | --- |
| **Open content** (UC-ACT-01) | Type part of a name → the file is the top hit → Enter → Actions closes and the note opens where you left it | A folder: Files opens, the folder revealed, expanded and focused. A match in the body: the row shows the line, Enter opens at it with the find bar ready. A standalone window: only that file and recent files | Instant |
| **App action** (UC-ACT-02) | Type "sign" → *Sign in to GitHub…* → Enter → Actions closes and sign-in starts | Already signed in: the row is *Sign out of GitHub*. Offline: sign-in's own offline state | The flow's own |
| **Selection action** (UC-ACT-03) | Select words → open Actions → *This selection* is first, *Bold · Ctrl+B* at the top → Enter → bold, Actions closes, the selection is kept | Already bold: the row shows *On* and Enter removes it. Read-only note: no selection actions. Selection changed meanwhile: refused, *Your selection changed* | Instant |
| **AI action** (UC-ACT-04) | Select → open Actions → type "short" → *Make shorter with AI…* → Enter → the inline prompt opens on the selection, pre-filled, showing integration, model and where it runs → <kbd>Ctrl</kbd>+<kbd>Enter</kbd> → the approved stream and one-step undo | No connection: the row is blocked, *Connect to AI first*, and *Connect to AI…* follows. Esc in the prompt: nothing sent | As Rewrite (PRF-15) |
| **Implicit anchor** (UC-ACT-05) | In a note, open Actions → type "share" → *Share this note…* (group *This note*) → Enter → the share dialog for this note | Project on this computer only: blocked, *Link this project to GitHub to share*, with *Project settings…* after it. A standalone file: share and publish hidden | The flow's own |
| **Look-alikes** (UC-ACT-06) | Type "rename" → *Rename note…* (This note), *Rename project…* (This project); the active row's outcome line says what changes | — | — |
| **Blocked** (UC-ACT-07) | The row says why and is unavailable; ↓ reaches its fix → Enter runs the fix | After the fix, open Actions again; the action is listed | — |
| **Stale context** | Enter on an action whose note was moved or changed since Actions opened | Actions stays open with the query; the row says what changed; the list refreshes | — |
| **Browse** | Type `>` → the whole catalogue, grouped by anchor; actions whose anchor is missing show what they need (*Select text first*) | Choosing one that needs a selection explains, it doesn't run | — |
| **Your own action** (UC-ACT-09, later) | Type `>` → *New action…* → name, kind (prompt or text), anchor → Save → it's listed under *Yours* | Label clashes with any action: *That name is taken by …* and the field keeps your words. File unreadable: built-ins still work, *Yours* says it couldn't be read | Instant |

## The view

The same dialog Spotlight built (IA-VIEW-SPOTLIGHT, renamed *Actions*): `DialogPanel`, `SearchField` with its mode chip, `ResultList` with header rows, highlights, state and shortcut. **Nothing new is needed for the first slices:** `ResultItem` already has `description`, `disabled`, `header`, `state` and `shortcut`. Groups become anchors; the active row shows its outcome as its description; a blocked row is `disabled` with its reason as its description. AI actions reuse the approved inline prompt (IA-CMP-REWRITEPROMPT) unchanged. The writing window gains nothing.

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" role="img" aria-labelledby="fnactv-title fnactv-desc" preserveAspectRatio="xMidYMid meet" data-slate-safe-margin="24">
<title id="fnactv-title">Actions with a selection, typing "sh"</title>
<desc id="fnactv-desc">A centered panel. The field holds the query "sh" after the mode chip All. Results are grouped by anchor. This selection: Make shorter with AI, unavailable, with the reason Connect to AI first, followed by Connect to AI. This note: Share this note, active, with its outcome line Opens the share dialog for this note. This project: Show Files. App: Keyboard shortcuts with Ctrl+Shift+slash. Files: a note named Shipping notes in essays. The footer shows Enter Run, right arrow More actions, Escape Close.</desc>
<g id="fnactv-panel" font-family="Segoe UI, system-ui, -apple-system, sans-serif">
<rect x="120" y="20" width="720" height="560" rx="20" fill="var(--color-neutral-bg-1)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5" />
<rect x="144" y="44" width="672" height="52" rx="12" fill="var(--color-neutral-bg-3)" />
<text x="168" y="77" fill="var(--color-neutral-fg-2)" font-size="15">All</text>
<text x="210" y="78" fill="var(--color-neutral-fg-1)" font-size="20">sh</text>
<text x="150" y="128" fill="var(--color-neutral-fg-2)" font-size="13" font-weight="700" letter-spacing="1">THIS SELECTION</text>
<text x="172" y="158" fill="var(--color-neutral-fg-3, var(--color-neutral-fg-2))" font-size="17" opacity="0.6">Make shorter with AI…</text>
<text x="792" y="158" text-anchor="end" fill="var(--color-neutral-fg-2)" font-size="14">Connect to AI first</text>
<text x="172" y="190" fill="var(--color-neutral-fg-1)" font-size="17">Connect to AI…</text>
<text x="150" y="232" fill="var(--color-neutral-fg-2)" font-size="13" font-weight="700" letter-spacing="1">THIS NOTE</text>
<rect id="fnactv-active" x="144" y="242" width="672" height="64" rx="10" fill="var(--color-neutral-bg-2)" stroke="var(--color-brand-stroke)" stroke-width="2" />
<text x="172" y="268" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnactv-active" data-slate-fit-padding="10">Share this note…</text>
<text x="172" y="292" fill="var(--color-neutral-fg-2)" font-size="14" data-slate-fit-target="fnactv-active" data-slate-fit-padding="10">Opens the share dialog for this note</text>
<text x="150" y="340" fill="var(--color-neutral-fg-2)" font-size="13" font-weight="700" letter-spacing="1">THIS PROJECT</text>
<text x="172" y="370" fill="var(--color-neutral-fg-1)" font-size="17">Show Files</text>
<text x="150" y="412" fill="var(--color-neutral-fg-2)" font-size="13" font-weight="700" letter-spacing="1">APP</text>
<text x="172" y="442" fill="var(--color-neutral-fg-1)" font-size="17">Keyboard shortcuts</text>
<text x="792" y="442" text-anchor="end" fill="var(--color-neutral-fg-2)" font-size="14">Ctrl+Shift+/</text>
<text x="150" y="484" fill="var(--color-neutral-fg-2)" font-size="13" font-weight="700" letter-spacing="1">FILES</text>
<text x="172" y="514" fill="var(--color-neutral-fg-1)" font-size="17">Shipping notes</text>
<text x="792" y="514" text-anchor="end" fill="var(--color-neutral-fg-2)" font-size="14">essays/</text>
<path d="M144 536 H816" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="150" y="564" fill="var(--color-neutral-fg-2)" font-size="14">↵ Run</text>
<text x="230" y="564" fill="var(--color-neutral-fg-2)" font-size="14">→ More actions</text>
<text x="370" y="564" fill="var(--color-neutral-fg-2)" font-size="14">Esc Close</text>
</g>
</svg>
<figcaption>Groups name the anchor, the active row says what will happen, and a blocked row is followed by its fix. A sketch for review, not the design-system mock (that's WP-A.1).</figcaption>
</figure>
<details class="slate-figure-data">
  <summary>Data</summary>
  <table>
    <thead><tr><th>Group</th><th>Row</th><th>Shown at the end or below</th></tr></thead>
    <tbody>
      <tr><td>This selection</td><td>Make shorter with AI… (unavailable)</td><td>Connect to AI first</td></tr>
      <tr><td>This selection</td><td>Connect to AI…</td><td>—</td></tr>
      <tr><td>This note</td><td>Share this note… (active)</td><td>Opens the share dialog for this note</td></tr>
      <tr><td>This project</td><td>Show Files</td><td>—</td></tr>
      <tr><td>App</td><td>Keyboard shortcuts</td><td>Ctrl+Shift+/</td></tr>
      <tr><td>Files</td><td>Shipping notes</td><td>essays/</td></tr>
    </tbody>
  </table>
</details>

**Order.** With a query: the top hit first, then groups in the order their best row ranked, each keeping its heading. With an empty field (proposal, [question 2](#open-questions-for-the-owner)): *Recent* (five files), then the groups for the anchors present, up to four rows each, most used first, then a *Type > to browse all actions* hint.

**Usability check** (H1 to H10): status in the row's state and outcome (H1); the person's words in labels and synonyms (H2); Esc and undo for every effect (H3); the same dialog, keys and confirmations as today (H4); stale-context refusal and hidden impossible rows prevent errors (H5); groups and outcomes make choices recognisable (H6); shortcuts shown on every row (H7); only proven, applicable rows (H8); blocked rows say how to recover (H9); `?` and `>` are help in place (H10).

## Words

Following [Foundations → Words](../design/foundations.md). Draft keys; final strings in `en.json` at build time.

| Where | Words |
| --- | --- |
| Dialog name (accessible name, cheat sheet, Help) | Actions |
| Field placeholder | Find and act |
| Toolbar trigger tooltip | Actions (Ctrl+/) |
| Group headings | This selection · This note · This project · App · Files · Recent · Yours |
| Footer | ↵ Run (↵ Open on content) · → More actions · Esc Close |
| Blocked reasons | Select text first · Connect to AI first · Sign in to GitHub first · Link this project to GitHub to share · Read-only here |
| Stale context | This note changed. Try again. · Your selection changed. Select again. |
| Browse hint | Type > to browse all actions |
| Clash (own actions) | That name is taken by "{label}". |

"Spotlight" leaves every user-facing string. Code and command IDs keep `spotlight` (as with *workspace*, words first). *More actions* names the per-result panel so it isn't confused with the dialog.

## States

Following [UI states](../design/ui-states-audit.md): the dialog opens complete within 50 ms (titles first while the index builds, as today); a toggle's state changes in its row before Actions closes; an `edit` is confirmed by the note itself; flows confirm in their own surfaces; a refused or failed action keeps the query and says why, with the command error pill's Retry where it applies (SPT-10). Empty: *No match*, then *Create note "…"* and *Find "…" in all notes*.

## Requirements

ACT-01 to ACT-15 in [Requirements → Actions](../product/requirements.md#actions-act), planned as [stage MACT](../plan/implementation-plan.md#mact) with its [Definition of Done](../plan/definition-of-done.md#actions-draft-for-owner-review). Assumptions and risks: [Risks → Actions](../plan/risks.md#actions-risks-and-assumptions). Decisions: [D-TBD, Actions](../plan/decisions.md#d-tbd-actions-lists-only-catalogued-actions).

## Open questions for the owner

Only the real decisions. Each has a working default, so design can start without waiting.

| # | Question | Options | Default (recommended) |
| --- | --- | --- | --- |
| 1 | Should a heading or a sentence in a note still be searchable from Actions? | (a) As the reason a file appears, the line shown on the file's row; (b) separate *Headings* and *In notes* groups, as today; (c) not at all, only names | **(a)**: content stays "files and folders", as your note says, and text search still finds them |
| 2 | What does an empty Actions show? | (a) Recent files, then what applies here (selection, note, project, app), with `>` for everything; (b) today's full list | **(a)**: the full list is what made today's Spotlight feel like a dump |
| 3 | Do you want your own actions (saved AI prompts and text templates), and when? | (a) Plan them, build after the starter set has been in use for a week; (b) build with the starter set; (c) leave them out | **(a)** |
| 4 | "View shortcuts mapping (We need one)": is the existing searchable cheat sheet (Ctrl+Shift+/) what you mean? | (a) Yes, make it findable as *Keyboard shortcuts* with "mapping", "keys", "hotkeys"; (b) you want a view where shortcuts can be changed, not only read | **(a)** now; (b) is a separate request (KEY-07 edits `keybindings.json` today) |
| 5 | "I can change the theme" inside a project: your theme, or the project's colour and logo? | (a) Both, as two actions: *Change theme…* (yours, this device) and *Project colour and logo…*; (b) only the theme | **(a)** |

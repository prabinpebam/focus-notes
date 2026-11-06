# Actions: find and act

**Approved by the owner, 6 November 2026 (D-361 to D-364), with the recommended defaults on the five open questions.** The feature the owner's Spotlight note asks for: one dialog, **Actions**, tagline **Find and act**, that opens any file or folder in the project and runs a curated set of actions that all work and can't be confused. The rules behind it are the [Actions framework](../architecture/actions-framework.md).

> [!NOTE]
> **TL;DR.** <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>⌘/</kbd>) opens **Actions**. Type to find a file or folder (Enter opens it; a folder opens in Files, focused) or an action (Enter does it, or starts its flow). With text selected, *This selection* comes first (*Bold*, *Add link…*, *Rewrite with AI…*); then *This note* (*Share this note…*, *Publish this note…*), *This project* (*Project settings…*, *Rename project…*) and *App* (*Sign in to GitHub…*, *Connect to AI…*, *Keyboard shortcuts*, *Customize toolbar…*). About 50 actions are listed, each proven and with a label no other action shares; a few more wait as candidates until they're known to work. Today's ~200 rows, with *Cancel*, *Retry* and two identical *Share…*, go. Nothing is added to the writing window: the dialog, its keys and the toolbar's existing trigger are what Spotlight already has.

| Promise | Scenario | User can | Surface | Requirements and decisions |
| --- | --- | --- | --- | --- |
| CP-REACH-01 | SC-ACT-01 | UC-ACT-01 | IA-VIEW-SPOTLIGHT | ACT-03, ACT-04; D-362, D-363 |
| CP-REACH-01 | SC-ACT-02, SC-ACT-05 | UC-ACT-02, UC-ACT-06, UC-ACT-08 | IA-VIEW-SPOTLIGHT | ACT-01, ACT-02, ACT-06, ACT-07, ACT-09, ACT-12; D-361, D-363 |
| CP-REACH-01 | SC-ACT-03, SC-ACT-04 | UC-ACT-03, UC-ACT-04, UC-ACT-05 | IA-VIEW-SPOTLIGHT, IA-CMP-REWRITEPROMPT | ACT-05, ACT-10, ACT-11, ACT-15; D-363, D-364 |
| CP-REACH-01 | SC-ACT-06 | UC-ACT-07 | IA-VIEW-SPOTLIGHT | ACT-08 |
| CP-REACH-01 | SC-ACT-07 | UC-ACT-09 | IA-VIEW-SPOTLIGHT | ACT-13, ACT-14 (later: after a week of use) |

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

**Owner:** "only the ones we know for sure makes sense and actually works." Each row passes the [seven tests](../architecture/actions-framework.md#what-qualifies-an-action) on paper, and is **listed** only once its proof passes (ACT-02). The status column says how sure we are today:

- **Ready**: an existing command runs it; the work is a label and a proof.
- **New**: the owner asked for it; it needs a little wiring to a surface that already exists.
- **Candidate**: not listed until the named blocker is closed and recorded in decisions.

### App (no anchor)

| Action | Does (its outcome line) | Command | Effect | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Sign in to GitHub… | Starts signing in to GitHub; listed only while signed out | `account.signIn` (was *Sign in…*) | flow, leaves: GitHub | Ready | Owner |
| Sign out of GitHub | Asks, then signs out; listed only while signed in | `account.signOut` | flow | Ready | Proposal (the pair, D6) |
| Connect to AI… | Opens Settings → AI ready to add or find a connection | opens Settings at AI, then `ai.add` | flow | New | Owner |
| Keyboard shortcuts | Opens the searchable list of shortcuts; synonyms *shortcuts mapping, keys, hotkeys, cheat sheet* | `shortcuts.open` | navigate | Ready | Owner ([question 4](#open-questions-for-the-owner)) |
| Customize toolbar… | Opens toolbar customizing | `toolbar.customize` | flow | Ready | Owner |
| Change theme… | Your theme, on this device (D-46): opens the theme picker | `theme.manager.open` (was *Theme…*) | flow | Ready | Owner ([question 5](#open-questions-for-the-owner)) |
| Use light appearance · Use dark appearance · Match system appearance | Sets it at once; the current one shows *On* | `appearance.light`, `.dark`, `.system` | toggle | Ready | Proposal: three clear outcomes replace *Switch light and dark* and the stepping *Appearance* row (D6) |
| Focus mode | Turns it on or off; shows its state | `focus.toggle` | toggle | Ready | Proposal: one row replaces the command and the setting (UC-FOCUS-01) |
| Settings… | Opens Settings at the last tab | `settings.open` | navigate | Ready | Proposal; paired with *Project settings…* in the look-alike review (D8) |
| Open project… | Opens the project chooser | `projects.choose` | flow | Ready | Proposal; one of two rows today |
| New project… | Starts a new project | `projects.new` | flow | Ready | Proposal |
| Open file… | Opens one file outside any project | `projects.openFile` | flow | Ready | Proposal |
| Help and docs | Opens Help in the browser | `help.open` | navigate, leaves: browser | Ready | Proposal (H10) |
| Send feedback… | Writes an idea or comment to the developers | `feedback.open` | flow, leaves: GitHub | Ready | Proposal |
| Report a bug with diagnostics… | Collects a diagnostic report to attach to a problem | `diagnostics.reportProblem` (was *Report a problem…*) | flow | Ready | Proposal; named so it can't be mistaken for feedback |
| Full screen | Turns full screen on or off | `window.fullScreen` | toggle | Ready | Proposal |

### This project (implicit anchor; project windows only)

| Action | Does (its outcome line) | Command | Effect | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Project settings… | Opens Settings → Project | `project.settings` (was *Project*) | navigate | Ready | Owner |
| Rename project… | Opens Settings → Project with the name field focused | `project.settings` with a focus target | flow | New | Owner |
| New note | Makes a note in the current folder | `note.new` | files | Ready | Proposal |
| New note in… | Asks for a folder first (KEY-09) | `note.newIn` | flow | Ready | Proposal; seven rows today become one |
| New folder… | Asks a name, in the current folder | `files.newFolder` (was *New folder*) | flow | Ready | Proposal |
| Show Files | Opens the Files panel | `files.open` (was *Files*) | navigate | Ready | Proposal; told apart from *Show this note in Files* (D5) |
| Find in all notes | Searches every note's text (D-110) | `find.allNotes` | navigate | Ready | Proposal |
| Import files into this project… | Picks files to copy in | `files.import` (was *Import files…*) | flow | Ready | Proposal |
| Show this project in Explorer | Opens the project's folder in Explorer (Finder on macOS) | `projects.reveal` (was *Show project folder*) | navigate, leaves: system | Ready | Proposal |
| Open this project on GitHub | Opens the repository in the browser; hidden for a project on this computer only | `projects.openRepo` | navigate, leaves: browser | Ready | Proposal |
| Sync with GitHub now | Saves and syncs now | `sync.now` (was *Save to cloud*) | outbound | Candidate: merge with or tell apart from *Back up to GitHub* (`repoBackup.backUp`) | Proposal |
| Show recently deleted notes | Opens Files at Recently deleted | `files.showDeleted` | navigate | Candidate: today it runs only inside Files, and only when something can be restored | Proposal |

### This note (implicit anchor; a note or file is open)

These are also a note result's own actions behind <kbd>→</kbd>: one catalogue entry, one label, in both places, so "this note" is the open note in the list and the chosen note in its panel.

| Action | Does (its outcome line) | Command | Effect | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Share this note… | Opens the share dialog for this note | `note.share` (was *Share…*) | outbound | Ready | Owner |
| Publish this note… | Puts it on the project's website (D-349) | `note.publish` (was *Publish…*) | outbound | Ready | Owner |
| Unpublish this note | Takes it off the website | none today | outbound | Candidate: no command | Owner (the pair) |
| Make this note public… | Moves it to public notes; always asks first | `files.makePublic` | visibility | Ready, listed as Publish's fix (below) | Proposal |
| Rename this note… | Renames the file; the title stays its first heading (FIL-18) | `files.rename` (was *Rename file…*) | files | Ready | Proposal |
| Move this note to… | Asks for a folder | `files.moveTo` | files | Ready | Proposal |
| Duplicate this note | Makes a copy beside it | `files.duplicate` | files | Ready | Proposal |
| Show this note in Files | Reveals and selects it in Files | `files.reveal` | navigate | Ready | Proposal |
| Show this note in Explorer | Opens its folder in Explorer (Finder on macOS) | `note.revealLocal` | navigate, leaves: system | Ready | Proposal |
| Copy link to this note | Copies a relative Markdown link (from a result: relative to the open note) | `note.copyLink`; results use `spotlight.copyLink` | navigate | Ready | Native clipboard proof |
| Show note history | Opens this note's versions | `history.open` (was *Note history*) | navigate | Ready | Proposal |
| Show contents | Opens the headings card (UC-FIND-06) | `outline.show` | navigate | Ready | Proposal |
| Write with AI… | Opens the AI prompt at the caret (RWR-92); listed when nothing is selected | the caret prompt | outbound, leaves: AI | Candidate: name its command | Proposal |
| Print this note… | Opens printing | `note.print` | flow | Ready | Proposal |
| Delete this note | Moves it to Recently deleted, with Files' confirmation | `files.delete` | destructive | Ready | Proposal |

**Publish on a private note.** Publishing acts on public notes. On a private note *Publish this note…* is blocked with *Make this note public first*, and the next row is *Make this note public…*, which asks before moving it (CP-REACH-01: "Making a note public always asks for confirmation, even from Spotlight"). *Make this note public…* is otherwise found by typing or with `>`; it isn't in the empty list.

### A folder result's own actions (<kbd>→</kbd> on a folder)

Show this folder in Files · New note in this folder · New folder inside… · Rename this folder… · Move this folder to… · Share this folder… · Delete this folder. All Ready, from the Files commands that do these today. The panel's heading is the folder's name; the labels never rely on it to be told apart.

### This selection (explicit anchor)

| Action | Does (its outcome line) | Command | Effect | Status | Source |
| --- | --- | --- | --- | --- | --- |
| Bold · Italic · Strikethrough · Inline code | Formats the selection; shows *On* where it already applies | `format.bold` and siblings | edit, one undo step | Ready | Owner (bold); the rest proposal |
| Add link… | Opens the link editor on the selection | `link.edit` (was *Add or edit link*) | edit | Ready | Proposal |
| Rewrite with AI… | Opens the prompt on the selection | the rewrite command (SPT-09) | outbound, leaves: AI | Ready | Proposal |
| One row per rewrite preset (three today), for example *Make shorter with AI…* | Opens the same prompt **pre-filled**; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends | the rewrite command with the preset | outbound, leaves: AI | New | Proposal P-08 |
| Edit this image… (image selected) | Opens crop and rotate | `image.edit` | flow | Ready | Proposal |
| Caption this image with AI… (image selected) | Opens the caption request | the caption command | outbound, leaves: AI | Candidate: IMG-09 isn't built | Proposal |

Counted: about 50 Ready or New rows; 5 Candidates. *Open in new window* goes (one window per project, D-309).
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
| **Open content** (UC-ACT-01) | Type part of a name → the file is the top hit → Enter → Actions closes and the note opens where you left it | A folder: Files opens, the folder revealed, expanded and focused. A match in the body: the row shows the line, Enter opens at it with the find bar ready. Moved or deleted since it was found: the row goes, *That note was moved or deleted* shows, the query stays. Index still building: names are found at once and *Still finding files… 1,240 / 5,000* shows in the footer. A standalone file's window: that file and recent standalone files only, never a project's (D-273) | Instant; waiting while the index builds |
| **App action** (UC-ACT-02) | Type "sign" → *Sign in to GitHub…* → Enter → Actions closes and sign-in starts | Already signed in: the row is *Sign out of GitHub*. Offline: sign-in's own offline state | The flow's own |
| **Selection action** (UC-ACT-03) | Select words → open Actions → *This selection* is first, *Bold · Ctrl+B* at the top → Enter → bold, Actions closes, the selection is kept | Already bold: the row shows *On* and Enter removes it. Read-only note: no selection actions. Selection changed meanwhile: refused, *Your selection changed* | Instant |
| **AI action** (UC-ACT-04) | Select → open Actions → type "short" → *Make shorter with AI…* → Enter → the inline prompt opens on the selection, pre-filled, showing integration, model and where it runs → <kbd>Ctrl</kbd>+<kbd>Enter</kbd> → the approved stream and one-step undo | No connection: the row is blocked, *Connect to AI first*, and *Connect to AI…* follows. Esc in the prompt: nothing sent | As Rewrite (PRF-15) |
| **Implicit anchor** (UC-ACT-05) | In a note, open Actions → type "share" → *Share this note…* (group *This note*) → Enter → the share dialog for this note | Signed out or offline: blocked, *Sign in to GitHub first*, with *Sign in to GitHub…* next. Project on this computer only: blocked, *Link this project to GitHub to share*, with *Project settings…* next. Private note and *Publish this note…*: blocked, *Make this note public first*, with *Make this note public…* next, which asks before moving it. A standalone file: share and publish hidden | The flow's own |
| **Look-alikes** (UC-ACT-06) | Type "rename" → *Rename this note…* (This note), *Rename project…* (This project); the active row's outcome line says what changes | — | — |
| **Blocked** (UC-ACT-07) | The row says why and is unavailable; ↓ reaches its fix → Enter runs the fix | The fix finishes: focus returns to the note with the selection restored, and the blocked action is listed next time Actions opens. The fix fails or is cancelled: its own error or nothing; the original stays blocked | — |
| **Stale context** | Enter on an action whose note was moved or changed since Actions opened | Actions stays open with the query; the row says what changed; the list refreshes | — |
| **Browse** | Type `>` → the whole catalogue, grouped by anchor; actions whose anchor is missing show what they need | Enter on one that needs a selection runs nothing and says *Select text first, then open Actions.* | — |
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

ACT-01 to ACT-16 in [Requirements → Actions](../product/requirements.md#actions-act), planned as [stage MACT](../plan/implementation-plan.md#mact) with its [Definition of Done](../plan/definition-of-done.md#actions-mact). Assumptions and risks: [Risks → Actions](../plan/risks.md#actions-risks-and-assumptions). Decisions: [D-361 to D-364](../plan/decisions.md#d-361-actions-lists-only-catalogued-actions).

## As built

**First slice, WP-A.2/A.3 (6 November, landing pending).** The catalogue replaces command discovery by deny-list; Actions lists only its entries, grouped by the captured anchor, with blocked reasons and next-row fixes. The empty field is recent files and four runnable actions per anchor; `>` browses the catalogue. Command rows have no More actions panel.

The initial catalogue also proves *Open a project from GitHub…*, *Copy public link to this note* and *Save diagnostic report…*, reusing their existing flows. *Show this project in Explorer* and *Open this project on GitHub* remain unlisted candidates until their project-ID arguments are wired and proven. Content merging, project renaming and AI preset prompts are subsequent slices; this slice does not claim their acceptance.

Shift+Enter retains a toggle's row and query while its acknowledged settings write completes. The row is temporarily unavailable during that write; its enabled state, not just its On/Off text, is the signal that a second Enter can run it.

The combined table slice retains *Insert table* as an anchored note action, reusing the Insert and slash-menu command. Its native journey checks editable cells and the saved table after restarting. Two-stage search reselects the first runnable result after full-text answers unless the person moved the selection, so a provisional Create row cannot steal Enter from an action that has become available.

The combined image slice also retains *Insert image* as a writable-note action, reusing the image picker from the slash menu, Insert menu and toolbar. Its existing native journey checks managed image bytes and decoded pixels after restarting. This insertion route does not require an image selection.

**Content slice, WP-A.4 (landing pending).** In All and quick-open results, Files contains both files and folders. A matching heading or body line is a reason on one file row, never another content kind. Enter on a heading reason opens at that heading; a body reason opens the file with Find ready. The `#` and `##` navigation modes retain their individual heading rows. Body-only results replace the provisional Create selection unless the person has moved to another row. A missing result is removed with a recovery message and the query kept; a folder opens Files revealed, expanded and focused.

**Starter-flow slice, WP-A.5/A.6 (landing pending).** *Rename this project…* opens the existing Project settings name field focused; opening or cancelling writes nothing. The three selection presets open the existing Rewrite prompt pre-filled, with its provider, model and destination disclosure unchanged. Only explicit Generate or Ctrl+Enter sends; Escape sends nothing. Typing in Actions never contacts the provider: opening checks only cached, device-local connection settings, with a named checking state and a Connect to AI fix if no Writer is configured. Selection presence is independent of the formatting toolbar's intentional delay, so opening Actions immediately after selecting text does not hide selection actions.

`pnpm check` now includes the catalogue proof tests, failing on a missing proof, command, pointer path or duplicate label. The generic catalogue tests prove listing and blocked reasons; renderer-only outcomes still need the native per-entry evidence in the MACT gate, not just a command event.

*Copy link to this note* is an anchored note row, using the same relative Markdown-link builder as file-result actions. It copies a link to the captured note, not the currently highlighted search result. Copying neither writes a note nor contacts a service.

The native outcome journey covers 37 entries, including formatting with Undo, actual destination surfaces, file changes, both Copy link actions, confirmed public deletion with Recently deleted restoration, and Markdown import without overwriting the current note. The Actions accessibility journey checks Chromium's accessibility tree and axe in light, dark, increased contrast and forced colours; manual spoken screen-reader evidence remains open. The 150-entry availability benchmark uses the same evaluator as the live catalogue, with a 2 ms p95 budget. The [MACT evidence](../plan/gate-evidence.md#actions-mact-6-november) records the remaining native rows and cold-open gap; these checks do not mark the stage accepted.

The caret's *Write with AI…* row reuses `rewrite.open`, with no note context in its request. *Caption this image with AI…* remains a candidate: there is no caption command in the current app, and this slice does not invent a second AI surface or send an image.

**Image-anchor follow-up (landing pending).** Selecting one image makes *Edit this image…* available in This selection. Actions captures that image and its decoded dimensions before its field takes focus, then opens the existing crop-and-rotate dialog. A text range containing images is not a single-image anchor, and image-only selection does not offer text formatting or caret Write. Cancelling leaves the image and Markdown bytes unchanged; a replaced document cannot run the old image target.

## Owner decisions (approved defaults, 6 November)

The owner approved the spec on 6 November at 02:07; the recommended default of each question below is the decision.

| # | Question | Options | Default (recommended) |
| --- | --- | --- | --- |
| 1 | Should a heading or a sentence in a note still be searchable from Actions? | (a) As the reason a file appears, the line shown on the file's row; (b) separate *Headings* and *In notes* groups, as today; (c) not at all, only names | **(a)**: content stays "files and folders", as your note says, and text search still finds them |
| 2 | What does an empty Actions show? | (a) Recent files, then what applies here (selection, note, project, app), with `>` for everything; (b) today's full list | **(a)**: the full list is what made today's Spotlight feel like a dump |
| 3 | Do you want your own actions (saved AI prompts and text templates), and when? | (a) Plan them, build after the starter set has been in use for a week; (b) build with the starter set; (c) leave them out | **(a)** |
| 4 | "View shortcuts mapping (We need one)": is the existing searchable cheat sheet (Ctrl+Shift+/) what you mean? | (a) Yes, make it findable as *Keyboard shortcuts* with "mapping", "keys", "hotkeys"; (b) you want a view where shortcuts can be changed, not only read | **(a)** now; (b) is a separate request (KEY-07 edits `keybindings.json` today) |
| 5 | "I can change the theme" inside a project: your theme, or something of the project's own? | (a) Your theme (themes are yours and per device, D-46), listed as *Change theme…* with the outcome *Your theme, on this device*; (b) also a *Project colour and logo…* action for the project's own look (D-275) | **(a)**: it's what you named; (b) only if you ask, since you didn't |

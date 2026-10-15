# Performance and quality

How fast Focus Notes must be, how big a workspace it must handle, how it's tested, and the accessibility and language standards it meets.

> [!NOTE]
> **TL;DR.** Typing must never lag: at most **16 ms from keystroke to paint** at the 95th percentile, even in a 50,000-word note. The app opens to a usable caret in **under 1.5 s** (warm start), Spotlight answers within its budgets, and a workspace of **10,000 notes** stays fast. Every budget is measured in CI on the release build, on fixed reference hardware, by one **benchmark** with a committed **budgets file** that fails the build on a regression (QLT-05). Every wait a person feels has a named measure, and the measurements stay on the computer: there's no telemetry (D-55, D-65). The app does less work rather than hiding it: **one cached Git status** per repository that no view waits for, redraws limited to what changed, structural changes shown before they're saved, and one task tracker that explains every wait (PRF-07 to PRF-11). Quality relies on a test pyramid (Vitest, Playwright for web and Electron, a Markdown round-trip corpus, axe and manual accessibility passes, IME and keyboard-layout tests), a tested support matrix, crash recovery that loses at most a second of typing, and **WCAG 2.2 AA**. These targets are set by this spec, not measured. They're checked from M0 onward, each from the stage that builds what it measures.

## Performance budgets

| Measure | Budget | How it's measured | Requirement |
| --- | --- | --- | --- |
| Keystroke to paint | p95 ≤ 16 ms, p99 ≤ 33 ms, in a 50,000-word note with focus mode on | Playwright with performance traces, scripted typing | PRF-01 |
| Cold start to typing (desktop) | ≤ 2.5 s | From process start to an editable caret | PRF-02 |
| Warm start to typing (desktop) | ≤ 1.5 s | Same, on a second launch | PRF-02 |
| Open a note | ≤ 150 ms for 10,000 words. ≤ 500 ms for 50,000 words. | From click to caret | PRF-03 |
| Save to disk | ≤ 1 s after the last keystroke, off the typing path | Timestamp of the atomic write | PRF-03 |
| Spotlight | See [Spotlight → Performance budgets](../experience/spotlight.html) | Built-in benchmark on 5,000 notes (the panel in the app, keypress to the first frame with results: `SPT-07.panelOpenMs`, D-109; the index: `SPT-07.openMs`, `SPT-07.titleQueryP95Ms`, and `SPT-07.fullTextP95Ms`, through the search worker's messages, D-107) | SPT-07 |
| Find in all notes | First results ≤ 300 ms on 5,000 notes | Built-in benchmark: `FND-04.findAllP95Ms`, every match counted and the first 1,000 listed with their lines, through the search worker's messages (D-110) | FND-04 |
| Focus band update | Within the same frame as the caret move | Frame timeline | FOC-05 |
| Memory | ≤ 350 MB resident with a 10,000-note workspace open | Process metrics after 10 minutes of use (built: `PRF-04.memoryMB`, after scripted use of a generated 10,000-note workspace, with pages the processes share counted once, D-105; read once memory has settled after use, the median of eight samples within 2%, D-120) | PRF-04 |
| Idle CPU | Near zero when not typing or syncing. No polling except the 5-minute fetch. | OS process sampling (built: `PRF-04.idleCpuPct`, every process over 10 s of idle, at most 1%; and a test that the code has no `setInterval` but the window's two pointer watches, each run only while the pointer is where the page can't see it and stopped as it leaves, D-104, D-105, D-106) | PRF-04 |
| View rendering | ≤ 100 ms to a view's first frame, ≤ 10% overhead from the UI runtime | Benchmarks on Settings, Files, and Spotlight | DSY-11 |
| Git status | One `git status` per repository per refresh, both repositories in parallel. A cached answer in ≤ 5 ms. No view's first frame waits for Git. | The `git.status` span and process count in the benchmark (built: `PRF-07.statusProcesses` and `PRF-07.cachedStatusMs`, D-97) | PRF-07 |
| Waits explained | Acknowledged in the same frame as the input. A sign after 300 ms, kept ≥ 500 ms once shown, announced after 1 s, elapsed time after 3 s. | The task tracker's marks, with scripted slow operations | PRF-08 |
| Structural change shown | ≤ 100 ms from the action to the change on screen (move, delete, create, or duplicate a note or folder), before the write or commit finishes | From the drop or key to the updated tree | PRF-09 |
| Reopening a note | ≤ 50 ms for a note already read this session and unchanged on disk | From click to caret, warm (built: `PRF-10.reopenMs`, from the key in the Files panel to the note's text with the caret in it, D-105) | PRF-10 |
| Start-up warm-up | Done within 10 s of start. Never pushes a keystroke past the PRF-01 budget. | Typing benchmark run during warm-up (from Spotlight's index, WP-4.1, its first heavy task, D-105) | PRF-10 |
| External change | Affected views update ≤ 500 ms after the file watcher reports it. Unaffected views do no work. | A scripted edit from outside the app | PRF-11 |
| Published pages (M5) | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, in lab runs only | Playwright lab runs in CI on a throttled profile | PRF-12 |
| Installer size | ≤ 150 MB per platform | Release assets | PRF-05 |
| Web app first load (MW) | ≤ 300 KB JavaScript compressed for the reader page. ≤ 1.5 MB for the editor. | Build report | PRF-05 |
| Publish (CI) | ≤ 5 minutes for 1,000 public notes and 200 shared notes | Workflow duration | PRF-06 |

**Reference hardware:** a mid-range laptop (4 cores, 8 GB, SSD) on Windows 11 and macOS. CI enforces the same budgets with a margin, on a fixed runner type: the hosted Windows runner. The macOS runner runs the benchmarks too but only reports, because its start times vary several-fold between runs; macOS budgets are checked on the reference laptop. A regression beyond a measure's noise allowance (10% unless the budgets file says otherwise) fails the build.

## Measuring

Measure before fixing anything. Guesses about what's slow are usually wrong: in a project with the same public and private repository layout, Git was 88 to 97% of every screen's time, and the part that looked heavy was 15% of it. Every optimization in this page starts from a measurement and ends with a new baseline (D-65).

### Marks and spans

- **Every wait a person feels** has a `performance.mark` at the input and a `performance.measure` at the visible result, named `fn:<area>.<action>`: for example `fn:view.open.files`, `fn:file.move`, `fn:note.open`, `fn:sync.commit`, and `fn:theme.preview`. Built so far (D-100): `fn:note.open`, from the request to open a note to the first frame showing it with the caret ready, and a `fn:note.saved` mark at each write to disk, which the journeys and the benchmark compare with the last keystroke (PRF-03).
- **The main process records named spans** inside each bridge call: `git.status`, `git.commit`, `git.push`, `content.read`, `content.parse`, `content.serialize`, and `content.write`. Each bridge reply carries its spans, so the renderer can join them to its own measure.
- **The last 2,000 measures** stay in memory, in a ring buffer. Nothing is written to disk except the summary in the diagnostic report, and nothing is ever sent (D-55).
- **Count the work, not only the time.** The benchmark also records Git processes started, notes parsed, and nodes rendered per view, so a fix targets what's actually heavy.

### The benchmark and its budgets

`pnpm bench` (in `tools/bench/`) runs Playwright against the release build of the desktop app (QLT-05).

| Part | Rule |
| --- | --- |
| Workspace | A throwaway copy of a fixture workspace (10,000 notes, a `private/` submodule, and a local bare remote for each repository), created in a temporary folder and initialized as real Git repositories. It never opens the user's real notes. |
| What it times | Start-up cold and warm. Each view opened cold and warm. Each interaction, from the click or key to the visible result. The main-process spans for each step. Typing (PRF-01). Built so far: start-up (PRF-02), the renderer's overhead (DSY-11), Git status (PRF-07), opening a 10,000-word note from Files and the write after a burst of typing (PRF-03), and the search index on a seeded 5,000-note fixture (SPT-07: the first answer after building, titles per keystroke, and full text, at p95; the index runs on a Node worker thread with the same code as the app's Web Worker, D-107), with Find in all notes on the same fixture (FND-04, p95, D-110), and opening Spotlight in the app on the same fixture, from the key to the first frame with results (D-109); typing is timed in the journeys. |
| Repetitions | Each measure runs at least 5 times. The report gives p50 and p95. |
| Budgets file | `tools/bench/budgets.json`, committed. Each measure has a budget, a baseline, and a noise allowance. Changing a baseline is a reviewed commit with the benchmark report attached. |
| `--compare <report>` | Prints each measure against the baseline or another report, with the change in percent. |
| `--check` | Exits with an error when a measure is over its budget or regresses beyond its noise allowance. CI runs it on every pull request that touches app code. |
| Slow-computer run | Before each stage gate, one run with the CPU slowed 4× shows how it feels on an older laptop. A change that takes more than 100 ms to show at 4× is the next thing to trim. |

## Doing less work

| Technique | Rule | Detail | Requirement |
| --- | --- | --- | --- |
| One cached Git status | One `git status` per repository, both in parallel, cached and kept off the path of every view | [Desktop and Git → Asking Git what changed](desktop-and-git.md#asking-git-what-changed) | PRF-07 |
| Redraw only what changed | Per-field subscriptions, views that declare the content they show, and heavy panels loaded when first opened | [Views as data → Rendering](../design/system/views-as-data.md#rendering) | PRF-11 |
| Show changes first | Structural changes appear before the write and commit, and are put back if refused | [Desktop and Git → Changes shown before they're saved](desktop-and-git.md#changes-shown-before-theyre-saved) | PRF-09 |
| Explain every wait | One task tracker, signs at the place, and timings as tokens | [Feedback and dialogs → Waits](../design/components/feedback-and-dialogs.md#waits) | PRF-08 |
| Less reading | A parsed-note snapshot, and a warm-up after start | Below | PRF-10 |

### Less reading

- **Parsed-note snapshot.** The main process keeps each note it has parsed (front matter, blocks, title, links) in memory, keyed by absolute path, size, and modification time, and parses again only what changed. A write hands its result straight to the snapshot, so the next read doesn't touch the disk.
- **Snapshots are never changed in place.** Each read returns a fresh top-level object over frozen parts. A unit test deep-freezes every cached value and runs the core's operations against it, so any caller that mutates a cached note fails.
- **Warm-up after start.** Once the canvas has a caret, the app loads the code of the first views people open (Files, Spotlight, Settings) and builds the Spotlight index in its worker, at idle priority. As built so far, the index starts once the first note is open (`startSearch`, D-107), titles at once and full text a few notes at a time in short slices, so it never delays the caret or a keystroke. Warm-up pauses while someone types and never delays the first caret (PRF-02). A view opened before warm-up reaches it says what it's waiting for ("Indexing notes: 4,000 of 10,000") instead of showing a blank panel.
- **Warm-up is off in end-to-end tests**, so timing and focus stay deterministic. The benchmark measures with it on and off.

**As built (WP-2.6, D-105):** the main process keeps two snapshots, keyed by absolute path, size, and modification time: each note it reads or writes (its text, title, and hash, up to 32 MB) and the Files panel's titles (up to 4 MB), the least recently used going first. The editor's own document isn't cached; reopening an unchanged 1,500-word note in a 10,000-note workspace takes about 17 ms. The warm-up is `app.warmUp` in the app core: tasks run one at a time at idle priority once the caret is ready, wait until the keys have been quiet for half a second, and report how far they got. Today its one task loads the Files tree's code; Spotlight's index adds itself with WP-4.1. It's off in end-to-end tests, and the benchmark measures with it on.

### Published pages

- **Images** (with the image block, EXT-03): `srcset` and `sizes` match the width the image is actually shown at, capped at the layout's maximum width, rather than the width of its frame.
- **Fonts:** pages preload only the font faces their first screen uses. An italic or bold face is preloaded only when the page's first screen contains text set in it. Fonts are self-hosted (PRV-04).
- **Core Web Vitals are measured in the lab only.** CI runs the publisher on a fixture workspace and measures LCP, INP, and CLS with Playwright on a throttled profile (PRF-12). There's no real-user monitoring, no beacon, and no `PerformanceObserver` reporting from readers' browsers, because that would be telemetry (D-55, D-65).
- **As built (WP-5.1, D-114):** pages are static HTML with no script and one stylesheet; a page preloads the content font's latin `woff2` faces its title and first ~1,500 characters use (regular and bold, italic only when used). `apps/web/e2e/public-pages.spec.ts` publishes a fixture site and measures LCP, CLS, and the longest event duration after a click on a 4× CPU slowdown and a slow 4G profile (about 1.3 s, 0, and under 16 ms on the fixture). Publishing time (PRF-06) is measured by `pnpm bench` (`PRF-06.publishMs`, `tools/bench/publish.ts`, D-139): the real publisher on 1,000 public notes (pages and the index) and 200 private notes sealed for 10 share audiences and the vault, leak check included, about 10 s on a development machine against the 5-minute budget.

## Scale the product supports

| Dimension | Supported | Beyond this |
| --- | --- | --- |
| Notes in a workspace | 10,000 | Works more slowly. The Files tree and Spotlight are virtualized and indexed incrementally. |
| Words in one note | 50,000 comfortably, 200,000 at most | Above 200,000, the app suggests splitting the note. Focus mode stays on. |
| Rows in one table | 1,000 | Editing still works. A hint suggests a spreadsheet. |
| Repository size | Under 1 GB | GitHub Pages sites are limited to 1 GB and repositories should stay small. The app warns at 500 MB. |
| Audiences | 200 active | Publishing slows slightly. Nothing breaks. |

## Reliability

- **No lost typing.** Each note's unsaved text is also written to a recovery journal in the app's data folder every second. After a crash, the next launch restores it with a message, then deletes the journal (QLT-03).
  - **As built (WP-2.6, D-105):** while typing goes on, the editor hands its text over at most 0.5 s after it changed (a keystroke that finds it overdue hands it over itself) and the app keeps each handover in `recovery-journal.jsonl` within 0.25 s, so a key is kept within 0.75 s, each record appended and flushed to the disk by the main process. At the next launch the text goes back into its note before anything reads it, or beside it as "⟨name⟩ (recovered)" when the note changed meanwhile, and one calm toast says so ([Feedback and dialogs](../design/components/feedback-and-dialogs.md#save-and-sync-status)). The journal is emptied whenever nothing is unsaved and deleted on a clean quit. A save supersedes every text the journal was sent before it, even one it doesn't match, since the app always saves its latest text: typing undone back to what's on disk and then saved never comes back at the next launch. Killing the main process at random points while typing, saving, and committing loses at most a second (0.43 s at worst over 20 rounds with the renderer slowed fourfold, 0.52 s sixfold). The browser has no journal: it saves the note itself within 0.25 s of each handover while typing goes on.
- **Atomic writes** (temporary file, then rename) and Git commits mean disk never holds a half-written note.
- **Retries:** sync and publish operations retry with backoff and can safely run twice. Every failure leaves the repository in a clean state (see [Desktop and Git](desktop-and-git.md#save-and-sync)).

## Testing strategy

| Layer | Tool (license) | Covers |
| --- | --- | --- |
| Unit | Vitest (MIT) | Markdown bridge, block registry, commands and keybindings, theme validation and the contrast guard, slug and link rewriting, crypto and keyring format |
| Round-trip corpus | Vitest plus a fixtures repository | Hundreds of real Markdown files: open, save, and byte-compare (EDT-10) |
| Integration | Vitest with real Git in temporary folders | Save and sync, conflicts, submodule rules, rename and link updates, Recently deleted, the lock file |
| End-to-end, web | Playwright (Apache-2.0) | Editor, Spotlight, find, tables, theme manager, sharing reader, in Chromium, WebKit, and Firefox |
| End-to-end, desktop | Playwright's Electron support | First run (against a test GitHub organization), window management on Windows, menus, deep links |
| Visual regression | Playwright screenshots of the gallery | Every component variant and state, and every view with each view-model fixture, in light, dark, high contrast, compact, and reduced transparency (DSY-09) |
| View documents | `ui:check` | Schema, references, binding types, accessibility and design rules for every view (DSY-08) |
| Accessibility | axe-core (MPL-2.0, test-only) plus manual passes | Automated checks on every view, and manual screen-reader passes before each release |
| Input | Playwright plus manual | IME (Japanese, Chinese, Korean), dead keys, AltGr layouts (German, Polish), non-Latin layouts, macOS Emacs-style keys |
| Performance | Playwright traces plus `pnpm bench --check` against the budgets file | The budgets above (QLT-05) |
| Publishing and sealing | A workflow test repository | The leak check, keyrings, expiry, withdrawal, and the name lookup |

### Testing pitfalls

- **Optimistic changes:** a test of a change shown before it's saved holds back the bridge's write or commit reply, checks the screen, then releases the reply and checks that the change was confirmed, or put back with a message.
- **Navigating after a save:** a test that reloads or opens another view right after a save waits for the save task to end (the task tracker reports when it's idle). Otherwise it races the save.
- **Line endings:** fixtures and generated files are compared byte for byte. The repository's `.gitattributes` keeps them LF, so a Windows checkout or a new worktree can't turn them into CRLF and fail the comparison.
- **Windows processes:** each process costs about 80 ms on Windows, so the app and its tests batch Git calls rather than running one per question.
- **Ports:** a server port closed by one test can stay in use for a few seconds on Windows. Test servers ask the system for a free port each time.
- **Caches:** unit tests, integration tests, and builds never use the Git status cache. They ask Git directly.
- **Waits:** a journey waits for the state it needs (the menu has focused an item, the note has the new text, the scroll has happened), never for a fixed time, and uses each platform's caret keys (macOS moves by line and note with <kbd>⌘</kbd> and the arrows). `FOCUS_NOTES_E2E_CPU_THROTTLE=4` slows the app's renderer 4×, with `CI=1` for CI's budgets, to find races before a CI runner does (D-100).

### Support matrix (tested each release)

| Area | Versions |
| --- | --- |
| Desktop OS | Windows 11 and Windows 10 22H2. The two latest macOS versions (on Apple silicon and Intel where Electron supports it). Ubuntu LTS (current and previous). |
| Browsers (web build, MW) | The two latest versions of Chrome, Edge, Firefox, and Safari. Safari on iPadOS. |
| Screen readers | NVDA and Narrator (Windows), VoiceOver (macOS and iPadOS) |
| Keyboard layouts | US, UK, German, French AZERTY, Polish, Japanese IME, Chinese Pinyin, Korean, Arabic, Hebrew, Cyrillic |

## Accessibility

- **Target: WCAG 2.2 Level AA** for the app (including what visitors see), public and shared pages, and these docs (A11Y-01).
- **Patterns:** the ARIA Authoring Practices Guide (combobox, menu, tree, grid, toolbar, dialog, tabs) for every custom widget.
- **Windows contrast themes:** the app respects `forced-colors`. The trigger, focus band, selection, and find highlights switch to system colors and stay visible (A11Y-02).
- **Zoom and reflow:** usable at 200% interface size and at a 320 px wide viewport.
- **Motion and transparency:** reduced-motion and reduced-transparency settings are honored everywhere (see [Foundations](../design/foundations.md)).
- An accessibility conformance report is published with version 1.0.

### Accessibility audit

Each stage's hardening work package audits everything built so far (M1: WP-1.11, D-100). The automated part is the journeys in `apps/desktop/e2e/m1-a11y.spec.ts` and the demo journeys (`m1-demo.spec.ts`), which run on every build:

| Check | How |
| --- | --- |
| No axe violations, contrast included | Every surface opened from the keyboard (the canvas, the trigger toolbar and a tooltip, the ⋯ menu and a submenu, find and replace, the cheat sheet, Files, Move to…, the delete confirmation, the formatting toolbar, the link editor and card, the slash menu, the table controls and cell menu, a toast; on Windows and Linux the window controls, Snap Layouts, and the system menu; Settings; and the first run's Welcome and Connect steps, with *Having trouble?* open), in Paper, Ink, and both High contrast themes, and in forced colors |
| Targets (2.5.8) | Every visible control outside the note's text is at least 24 × 24 px, or a 24 px circle on it touches no other target |
| Focus (2.4.7, 2.4.11) | The focused control in each surface, and the next one after <kbd>Tab</kbd>, shows a 2 px ring or a fill and isn't covered by anything that paints (the window's title bar band is an invisible box over the note's top, and covers nothing) |
| Landmarks | A tooltip opened by keyboard focus renders inside its control's landmark, next to it |
| Reflow (1.4.10) | At 320 CSS px (400% zoom), no surface scrolls sideways or spills out of the window. On Windows and Linux that's the window as drawn, inside its shadow margin (D-104) |
| Motion (2.3.3) | With reduced motion, nothing animates as any surface opens or closes |
| Keyboard only | The whole M1 demo, with a check that no pointer event happened |

The browser's dialogs (Quick open, *Unlock*, *Use this app for yourself*) are checked by the web journeys. The screen-reader passes can't be automated. Before each stage gate the owner runs this script with NVDA (Windows) and VoiceOver (macOS), and records the result in the gate issue:

1. Start the app: the note is announced as an editable "Note" with its text, and the caret is at its end.
2. Press <kbd>Mod</kbd>+<kbd>.</kbd>: "Toolbar", then the focused action and its shortcut. Arrow through all seven; each is named, and Focus mode says whether it's on.
3. On ⋯, press <kbd>↓</kbd>: a menu of five groups. Arrow to *Share and visibility…*: it's unavailable and says why. Arrow to *Light theme* and press <kbd>→</kbd>: a submenu, with the current theme checked. <kbd>Esc</kbd> twice returns to the note.
4. Write a heading, a list, a task, a quote, and code with Markdown shortcuts; each block is announced as what it became.
5. Select a word with <kbd>Shift</kbd>+<kbd>Ctrl</kbd>+<kbd>←</kbd> (<kbd>⌥⇧←</kbd>), press <kbd>Alt</kbd>+<kbd>F10</kbd>: "Text formatting" toolbar; make it bold; <kbd>Esc</kbd> returns with the selection. <kbd>Mod</kbd>+<kbd>K</kbd>: the link editor's address field; Enter makes the link.
6. Type `/table`: the block menu's active row is read as the arrows move. Insert the table; <kbd>Tab</kbd> through cells (each read with its column header, "Column 3" for an empty one); <kbd>Shift</kbd>+<kbd>F10</kbd> opens the cell menu.
7. <kbd>Mod</kbd>+<kbd>F</kbd>, type a word: the count is announced; replace all: the toast is announced; <kbd>Mod</kbd>+<kbd>Z</kbd> restores it.
8. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd>: the cheat sheet's search field; type "bold": "1 shortcut".
9. <kbd>Mod</kbd>+<kbd>O</kbd>: the Files tree, with the open note selected; open another note and back.

## Language and text

- **Interface strings** are externalized in ICU MessageFormat (FormatJS, MIT). English ships first, and other languages follow (I18N-01, I18N-03).
- **Note text in any script:** each block gets `dir="auto"`, so right-to-left paragraphs work. File names are normalized to NFC. Sorting uses `Intl.Collator` for the user's locale, and dates and numbers use `Intl` (I18N-02).
- **Spelling** uses the OS spell checker with the user's languages.

## Diagnostics

Diagnostics stay on the computer, and nothing is sent automatically (D-55, QLT-04). As built (WP-5.7, D-140):

- **Settings → About** previews the diagnostic report as one card per part: the app and OS, Git and its credential helper, the workspace's repositories, the recovery journal, compositing (D-121), and recent problems. Below them it says what's never included, beside **Copy diagnostic report**, **Save diagnostic report…**, and **Report a problem…**. All three are in Spotlight and the macOS Help menu too.
- **What the report holds:** the app, OS, Electron, Chromium and Node versions; Git's version, whether Git Credential Manager is its credential helper, and whether the GitHub CLI is installed; whether saving with Git is idle, syncing or has a problem (and its code), the changes not on GitHub, and the conflicts held; for each repository (notes, private) whether `origin` is on GitHub, elsewhere or missing, the branch and upstream, ahead, behind, changed and unmerged counts; the recovery journal's note count and size; the compositing mode; device settings by value (a custom theme shows as "custom"); a summary of the window's timings (each measure's name, count, p50, and p95); and the main process's recent log lines.
- **What it never holds:** note text, note or folder names, paths, the remotes' addresses, email addresses, passwords, passcodes, keys, or tokens. The main process builds it from facts, never from note text, file names, or command output, and then redacts (`redact` in `@focus-notes/core/diagnostics`): known strings (the login, names, emails, and repository names, in any case), the workspace's and the home folder's paths with everything after them, credentials and paths in addresses, GitHub and bearer tokens, secret-style values quoted or not, private keys, email addresses, device codes, long base64 or hex runs, any other absolute path to the end of the line, and runs of words ending in a Markdown file name. Its input is capped at 4 KB and its patterns are bounded. Timings keep only the app's own measure names. The window gets only the preview's summary.
- **Logs stay in memory.** The main process writes counts, states, and problem codes to standard output and keeps its last 200 lines in memory for the report, redacted as they arrive, and gone on quit. There's no log file (D-140 replaces the planned rotated 7-day file; whether to keep one so a crash's lines survive is open).
- **Saving** shows the system's save dialog, with `focus-notes-diagnostics-<date>.md` in Documents as the suggestion and an overwrite confirmation; a place in the workspace or the app's data folder is refused, and the dialog asks again. The report is in English, for the people who read it in an issue.
- **Report a problem…** puts the report on the clipboard and opens the project's new-issue form (`REPORT_PROBLEM_URL`, a fixed address with a short template), where the person pastes it and reads it before submitting. The report is never in the address, so opening the form sends GitHub nothing of it; there's no automatic sending (QLT-04, D-140).

Tests: `packages/core/test/diagnostics.test.ts` (redaction and the report, with tokens, note text, paths, and emails fed through every field), `apps/desktop/test/diagnostics.test.ts` (the main process's report with real Git and a journal holding unsaved text), and the journey `m5-diagnostics.spec.ts` (copy, Report a problem, save from Spotlight, axe, and the visual score in light and dark).
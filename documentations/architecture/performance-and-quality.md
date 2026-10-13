# Performance and quality

How fast Focus Notes must be, how big a workspace it must handle, how it's tested, and the accessibility and language standards it meets.

> [!NOTE]
> **TL;DR.** Typing must never lag: at most **16 ms from keystroke to paint** at the 95th percentile, even in a 50,000-word note. The app opens to a usable caret in **under 1.5 s** (warm start), Spotlight answers within its budgets, and a workspace of **10,000 notes** stays fast. Every budget is measured in CI on the release build, on fixed reference hardware. Quality relies on a test pyramid (Vitest, Playwright for web and Electron, a Markdown round-trip corpus, axe and manual accessibility passes, IME and keyboard-layout tests), a tested support matrix, crash recovery that loses at most a second of typing, and **WCAG 2.2 AA**. These targets are set by this spec, not measured. They're checked from M1 onward.

## Performance budgets

| Measure | Budget | How it's measured | Requirement |
| --- | --- | --- | --- |
| Keystroke to paint | p95 ≤ 16 ms, p99 ≤ 33 ms, in a 50,000-word note with focus mode on | Playwright with performance traces, scripted typing | PRF-01 |
| Cold start to typing (desktop) | ≤ 2.5 s | From process start to an editable caret | PRF-02 |
| Warm start to typing (desktop) | ≤ 1.5 s | Same, on a second launch | PRF-02 |
| Open a note | ≤ 150 ms for 10,000 words. ≤ 500 ms for 50,000 words. | From click to caret | PRF-03 |
| Save to disk | ≤ 1 s after the last keystroke, off the typing path | Timestamp of the atomic write | PRF-03 |
| Spotlight | See [Spotlight → Performance budgets](../experience/spotlight.html) | Built-in benchmark on 5,000 notes | SPT-07 |
| Focus band update | Within the same frame as the caret move | Frame timeline | FOC-05 |
| Memory | ≤ 350 MB resident with a 10,000-note workspace open | Process metrics after 10 minutes of use | PRF-04 |
| Idle CPU | Near zero when not typing or syncing. No polling except the 5-minute fetch. | OS process sampling | PRF-04 |
| View rendering | ≤ 100 ms to a view's first frame, ≤ 10% overhead from the UI runtime | Benchmarks on Settings, Files, and Spotlight | DSY-11 |
| Installer size | ≤ 150 MB per platform | Release assets | PRF-05 |
| Web app first load (M6) | ≤ 300 KB JavaScript compressed for the reader page. ≤ 1.5 MB for the editor. | Build report | PRF-05 |
| Publish (CI) | ≤ 5 minutes for 1,000 public notes and 200 shared notes | Workflow duration | PRF-06 |

**Reference hardware:** a mid-range laptop (4 cores, 8 GB, SSD) on Windows 11 and macOS. CI enforces the same budgets with a margin, on a fixed runner type. A budget regression of more than 10% fails the build.

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
| Performance | Playwright traces plus benchmarks | The budgets above |
| Publishing and sealing | A workflow test repository | The leak check, keyrings, expiry, withdrawal, and the name lookup |

### Support matrix (tested each release)

| Area | Versions |
| --- | --- |
| Desktop OS | Windows 11 and Windows 10 22H2. The two latest macOS versions (on Apple silicon and Intel where Electron supports it). Ubuntu LTS (current and previous). |
| Browsers (web build, M6) | The two latest versions of Chrome, Edge, Firefox, and Safari. Safari on iPadOS. |
| Screen readers | NVDA and Narrator (Windows), VoiceOver (macOS and iPadOS) |
| Keyboard layouts | US, UK, German, French AZERTY, Polish, Japanese IME, Chinese Pinyin, Korean, Arabic, Hebrew, Cyrillic |

## Accessibility

- **Target: WCAG 2.2 Level AA** for the app, users' public and shared pages, and the product site (A11Y-01).
- **Patterns:** the ARIA Authoring Practices Guide (combobox, menu, tree, grid, toolbar, dialog, tabs) for every custom widget.
- **Windows contrast themes:** the app respects `forced-colors`. The trigger, focus band, selection, and find highlights switch to system colors and stay visible (A11Y-02).
- **Zoom and reflow:** usable at 200% interface size and at a 320 px wide viewport.
- **Motion and transparency:** reduced-motion and reduced-transparency settings are honored everywhere (see [Foundations](../design/foundations.md)).
- An accessibility conformance report is published with version 1.0.

## Language and text

- **Interface strings** are externalized in ICU MessageFormat (FormatJS, MIT). English ships first, and other languages follow (I18N-01, I18N-03).
- **Note text in any script:** each block gets `dir="auto"`, so right-to-left paragraphs work. File names are normalized to NFC. Sorting uses `Intl.Collator` for the user's locale, and dates and numbers use `Intl` (I18N-02).
- **Spelling** uses the OS spell checker with the user's languages.

## Diagnostics

- Logs live in the app's data folder, redacted (no tokens, passcodes, or note text), rotated, and kept for 7 days.
- **Settings → About → Copy diagnostic report** puts the versions, settings summary, recent errors, and Git status on the clipboard.
- **Report a problem** opens a GitHub issue form on the product repository, with the report pasted for the user to review. There's no automatic sending (QLT-04).

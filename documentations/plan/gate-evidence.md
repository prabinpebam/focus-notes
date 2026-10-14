# Stage gate evidence

The evidence for each stage gate before 1.0, in the order the stages close (M0, M1, MW, M3, M2, M4, Windows first, [D-112](decisions.md)): each item of the [stage definition of done](definition-of-done.md#stage-definition-of-done) with its status and evidence, each stage's exit criteria, the gaps still open, and the steps only the owner can take.

> [!NOTE]
> **TL;DR.** All 150 requirements in these six stages are named by at least one automated test (`pnpm trace` lists none untraced). **SEC-01** (the Electron fuses and the hardening checklist), **DSY-10** (the UI schema's major version), and **PKG-07** (the storage notice) are closed; **DST-02** is traced for the parts that exist, and starting from the template repository stays open until WP-5.6 makes it. Every demo script is automated, as one journey (M0, M1, M2) or as journeys named per demo step (MW, M3, M4). 22 work packages whose every requirement has a passing Windows unit test are now *done*; all of M3 and M2 are. No gate can pass yet: the Windows bench (`pnpm bench --check`) fails on `main`, which also skips the Windows journeys there, and every gate still needs the owner's demo on a clean Windows 11 machine, the screen-reader passes, and acceptance.

## How this page is kept

| What | Where it comes from |
| --- | --- |
| Requirement → tests | `pnpm trace` (all six stages), `pnpm trace M3` (one stage), `pnpm trace --check` (fails on any untraced requirement). It reads `work-graph.json` and lists the test files (`*.test.*`, `*.spec.*` in `packages/*/test`, `apps/*/test`, `apps/*/e2e`, `tools/test`) that name each requirement ID in a test title or a comment. |
| Passing | The CI run on `main`, or on the `fix-*` branch before an unattended merge ([When checks run](definition-of-done.md#when-checks-run)). |
| Demo steps | The demo journeys below, and the comments `// <stage> demo, step N` on the journeys that automate a step. |
| Owner's checks | The last section of each stage. They are recorded on the stage gate issue, not here. |

**Status words.** *Met*: automated and passing in CI. *Traced*: automated; passing in CI is still to be confirmed on Windows. *Open*: a gap, listed with the stage. *Owner*: only the owner can do it, at the gate.

## Summary

| Stage | Requirements traced | Untraced | Work packages | Demo automated | Blocking the gate |
| --- | ---: | ---: | --- | --- | --- |
| [M0](implementation-plan.md#m0) | 29 of 29 | None | 9 of 9 done | `m0-walking-skeleton.spec.ts` | Windows bench |
| [M1](implementation-plan.md#m1) | 56 of 56 | None | 4 of 11 done; 7 verifying (journey-only evidence) | `m1-demo.spec.ts` | Windows bench and journeys on CI; owner |
| [MW](implementation-plan.md#mw) | 22 of 22 | None (DST-02 in part) | 5 of 7 done; WP-6.1 verifying, WP-6.2 building | `web.spec.ts` steps 2 to 6, `seal.test.ts` step 7 | DST-02's template repository (WP-5.6); Firefox and WebKit |
| [M3](implementation-plan.md#m3) | 21 of 21 | None | 6 of 6 done | Named steps in `m3-*.spec.ts` | 1,000-round fault run; owner |
| [M2](implementation-plan.md#m2) | 9 of 9 | None | 3 of 3 done | `m2-demo.spec.ts` | Windows bench; owner |
| [M4](implementation-plan.md#m4) | 13 of 13 | None | 4 of 5 done; WP-4.4 planned | Named steps in `m4-*.spec.ts` | WP-4.4 (KEY-03) |

## Stage definition of done, per stage

| # | Item | M0 | M1 | MW | M3 | M2 | M4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | All work packages done, every requirement passes | Open | Open | Open | Traced | Traced | Open |
| 2 | Demo passes on a clean Windows 11 machine, run by the owner | Owner | Owner | Owner | Owner | Owner | Owner |
| 3 | The demo is an automated journey | Met | Met | Traced | Traced | Traced | Traced |
| 4 | All earlier journeys pass | Open | Open | Open | Open | Open | Open |
| 5 | No S1 or S2 defect open | Met | Met | Met | Met | Met | Met |
| 6 | The quality bar holds (budgets, accessibility, design system, security, privacy) | Open | Open | Open | Open | Open | Open |
| 7 | Docs match the build, stage pages `stable` | Owner | Owner | Owner | Owner | Owner | Owner |
| 8 | Decisions and risks reviewed | Owner | Owner | Owner | Owner | Owner | Owner |
| 9 | Retrospective on the agentic loop | Owner | Owner | Owner | Owner | Owner | Owner |
| 10 | The owner accepts it | Owner | Owner | Owner | Owner | Owner | Owner |

- **Item 1.** A work package moved from *verifying* to *done* on 2026-10-15 when every one of its requirements is traced and at least one unit test naming it passed on Windows in CI run 38615626147: 22 packages (WP-1.2, 1.3, 1.8, 1.10, 2.1 to 2.6, 3.1 to 3.6, 4.1, 4.2, 4.3, 4.5, 6.3, 6.4). Packages with requirements proven only by journeys (WP-1.1, 1.4 to 1.7, 1.9, 1.11, 6.1) stay *verifying* until the Windows journeys pass on CI. The last full Windows pass of the journeys is run 38589761831 on `5c8e1b9`.
- **Items 4 and 6.** On `main` (`ce4f332`, CI run 38613845186) the Windows job fails at *Budgets (QLT-05)*, so its desktop and web journeys don't run. Until a Windows run passes the bench and the journeys, no stage has item 4, and item 6 is open for performance. The work branch run is listed in [Open gaps](#open-gaps-across-stages).
- **Item 5.** No issue is open on GitHub (checked 2026-10-15).
- **Item 6, accessibility.** Automated: zero axe violations in every journey that checks it (`m1-a11y.spec.ts`, `a11y.spec.ts`, and the stage journeys). The NVDA pass is the owner's.

## M0: Walking skeleton

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Install the preview on clean Windows 11 | Preview build from `preview-release.yml` | Owner |
| 2. Canvas with only the trigger, caret ready in 2.5 s | `m0-walking-skeleton.spec.ts`; `PRF-02.coldReadyMs` in `pnpm bench --check` | Traced |
| 3 to 5. Heading and paragraphs, clean CommonMark, back on relaunch | `m0-walking-skeleton.spec.ts` | Traced |
| 6. The gallery shows every M0 primitive in light and dark | `vq-surfaces.spec.ts`, `screens.spec.ts`; the gallery build (`pnpm gallery`) | Owner |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Spikes recorded: D-01, D-14, DSY-11 | [Decisions](decisions.md); `render.test.ts` (renderer overhead 10% or less) | Met |
| CI on three systems, nightly build from `main` | `ci.yml` matrix, `nightly.yml`; Windows gates, macOS and Linux report (D-112) | Met |
| Work graph, role instructions, evidence format in use | `work-graph.json`, `.github/agents`, `pull_request_template.md`; `pnpm check:plan` | Met |
| The canvas is a view document that passes `ui:check` | `views.test.ts`, `check.test.ts` | Met |
| `pnpm bench --check` against a committed baseline | `tools/bench/budgets.json`; `repository.test.mjs` (QLT-05) | Open: fails on Windows CI |

**Closed.** **SEC-01** (WP-0.6): the packaging config sets the Electron fuses (`electronFuses`: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` off; `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` on). `apps/desktop/test/hardening.test.ts` checks the web preferences, the request allow-list, denied navigation and permissions, the CSP and the fuse config, and reads the fuses from a packaged executable when there is one; `packaged.spec.ts` reads them from `FOCUS_NOTES_E2E_EXE`. The journeys drive a copy beside the packaged executable with only the inspector fuse on, since Playwright needs it. **DSY-10** (WP-0.4): `packages/ui-runtime/src/migrate.ts` holds the UI schema's major (read from each document's `$schema`) and the migrations; `ui:check` migrates before validating and refuses newer majors (`migrate.test.ts`).

**Gaps.** The fuses are read from a packaged build only where one exists: locally after `electron-builder --dir`, and in the nightly Windows packaging run on `main` (`hardening.test.ts` after `dist`). CI's per-branch run doesn't package, and no CI job launches the packaged app (`packaged.spec.ts`).

**Owner.** Install and run the demo on a clean Windows 11 machine from the M0 preview, and browse the gallery in light and dark.

## M1: Writing

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1 to 8 | `m1-demo.spec.ts`, once with the pointer and once keyboard only (step 9) | Traced |
| 4. No visible lag in the 50,000-word fixture with focus mode | `m1-demo.spec.ts`, `m1-performance.spec.ts` (PRF-01) | Traced |
| 9. NVDA on Windows | [Accessibility audit](../architecture/performance-and-quality.md) script | Owner |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Round-trip corpus at 100% | `roundtrip.test.ts` (25 files, EDT-10, EXT-02) | Met |
| PRF-01 in the 50,000-word fixture with focus mode | `m1-performance.spec.ts` | Traced |
| Every surface a view document; gallery, baselines, no axe violations | `views.test.ts`, `vq-surfaces.spec.ts`, `m1-a11y.spec.ts` | Traced |
| The owner writes three real documents | None | Owner |

**Gaps.** None in requirements.

**Owner.** The demo on a clean Windows 11 machine, keyboard only, then with NVDA; three real documents.

## MW: Your Focus Notes on GitHub Pages

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. *Use this template*, turn on Pages, open the site | `workspace-template.test.mjs` (the template's content and workflow) | Owner, on real GitHub |
| 2. Write with no account, reload, offline | `web.spec.ts` "your notes stay in this browser" | Traced |
| 3, 4. Public notes read-only, *Copy to my notes*, the visitor view | `web.spec.ts` "a visitor sees the public notes" | Traced |
| 5. Unlock, *Remember on this browser*, Forget | `web.spec.ts` "the owner unlocks private notes" | Traced |
| 6. Export, import into a second browser | `web.spec.ts` "export your notes" | Traced |
| 7. A private sentence in a public build fails the deploy | `seal.test.ts` "the leak check (SEC-06)" | Met |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Browser journeys in Chromium, Firefox, WebKit with a sealed vault | `apps/web/playwright.config.ts` runs Chromium only | Open |
| Network capture: only the site's own files; nothing that opens the vault stored unless remembered | `web.spec.ts` (hosts watched; IndexedDB keys checked) | Traced |
| Sealer test vectors in Node and every browser; other parameters refused | `seal.test.ts` in Node (SEC-08); browsers through the unlock journeys | Traced |

**Closed.** **PKG-07**: the web welcome note says plainly that clearing the site's data deletes the notes, and points to *Export my notes* and the desktop app; `web.spec.ts` checks that `navigator.storage.persist()` is called and the notice shows.

**Gaps.** **DST-02** (WP-6.2, building), traced in part: `workspace-template.test.mjs` checks that the template's *Deploy app* workflow publishes the released app to the copy's own Pages with GitHub Actions and builds nothing, that its README walks through Pages, the site and the desktop app, and that the app's copy link is the template repository; `web.spec.ts` follows *Use this app for yourself* to it. Still open: the template repository `focus-notes-workspace` itself, generated from `templates/workspace/` with a real pinned release (WP-5.6), and a first deploy from a fresh copy, which only the owner's demo can show. **Firefox and WebKit** projects are missing from the web journeys.

**Owner.** Make an instance from the template on real GitHub, deploy it, and run steps 1 to 7 in two browsers; a private window for the visitor view.

## M3: Desktop sign-in and Git

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. First run: Git, sign-in, identity, create the workspace | `m3-first-run.spec.ts` (fake GitHub and fake Git helpers) | Traced; clean machine without Git: Owner |
| 2. A note is committed and pushed | `m3-git.spec.ts` "Mod+S commits and pushes" | Traced |
| 3. A second computer opens the existing workspace | `m3-first-run.spec.ts` "sign in with the GitHub CLI's code" | Traced |
| 4. Offline edits on two computers, then the conflict resolver | `m3-conflicts.spec.ts` "a sync conflict offers Resolve" | Traced |
| 5. Public, then private again | `m3-visibility.spec.ts` "Make public asks first" | Traced |
| 6. Import a browser's bundle | `m3-visibility.spec.ts` "Import notes" | Traced; opening it after a real deploy: Owner |
| 7. Delete and restore | `m3-conflicts.spec.ts` "a delete's toast offers Undo" | Traced |
| 8. `git push` in a terminal without signing in | `m3-settings.spec.ts` "Switch account … the terminal follows" | Traced; real terminal: Owner |
| 9. Sign out removes the data inventory | `m3-settings.spec.ts` "signing out with Git's credential deletes exactly what the data inventory lists" | Traced |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Fault injection, 1,000 randomized rounds, no lost text | `fault-injection.spec.ts` (CI runs 3); run `FOCUS_NOTES_FAULT_ROUNDS=1000` before the gate | Open |
| Owner and two testers, two computers, five working days | None | Owner |
| 10,000 notes: no first frame waits for Git; one `git status` per repository | `PRF-07.statusProcesses`, `PRF-07.cachedStatusMs` in `pnpm bench --check` | Open: Windows bench |

**Gaps.** The fault suite kills the app while typing and committing; network drop mid-push, a full disk, and two computers are covered by `git-sync.test.ts` and `git-conflicts.test.ts`, not by the randomized rounds.

**Owner.** Steps 1 to 9 on two clean Windows machines with a real GitHub account; the five-day trial with two testers.

## M2: The desktop app

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Snap, Snap Layouts, Win+arrows, Alt+Space, resize, mixed DPI | `m2-window.spec.ts` (app-built moving, resizing, maximize); real snapping and monitors | Traced; Owner |
| 2. The macOS menu bar | `menu-bar.test.ts`, `m2-titlebar.spec.ts` | Platform parity pass (D-112) |
| 3. Full screen with F11 | `m2-demo.spec.ts`, `m2-titlebar.spec.ts` | Traced |
| 4. Files: create, rename, delete, select several, Move to… | `m2-demo.spec.ts`, `mw-files.spec.ts` | Traced |
| 5. A rename updates links | `m2-demo.spec.ts`, `mw-links.spec.ts` | Traced |
| 6. Kill while typing, get the text back | `m2-demo.spec.ts`, `m2-recovery.spec.ts` | Traced |
| 7. 10,000 notes: 350 MB or less, idle CPU near zero | `PRF-04.memoryMB`, `PRF-04.idleCpuPct` in `pnpm bench --check` | Open: Windows bench |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Five working days as the only notes app, no S1 or S2 | None | Owner |
| Window behavior on Windows 10, Windows 11, mixed DPI | `m2-window.spec.ts` on one display | Owner; Ubuntu at parity (D-112) |

**Gaps.** None in requirements.

**Owner.** Step 1 by hand on two monitors with different scaling; five working days.

## M4: Find anything, make it yours

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Spotlight in under 50 ms in the 5,000-note fixture | `m4-spotlight.spec.ts` "(M4 demo 1)"; `SPT-07.*` budgets | Traced |
| 2. Jump to a heading; `>` runs a command with its state | `m4-spotlight.spec.ts` "(M4 demo 2)" | Traced |
| 3. Quick actions on a result | `m4-spotlight.spec.ts` "(M4 demo 3)" | Traced |
| 4. Find in all notes and open a match | `m4-find-all.spec.ts` "(M4 demo, step 4)" | Traced |
| 5. Theme gallery with live preview; Esc reverts | `m4-themes.spec.ts` "THM-07, keyboard only" | Traced |
| 6. The contrast guard and its fix | `m4-themes.spec.ts` "THM-13, keyboard only" | Traced |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Spotlight budgets (SPT-07) on reference hardware | `SPT-07.*` in `pnpm bench --check` | Open: Windows bench |
| No note text leaves the computer while indexing and searching | `m4-search.spec.ts` (SPT-08) | Traced |

**Gaps.** **KEY-03** (WP-4.4, planned): the complete Power layer isn't built.

**Owner.** The demo on a clean Windows 11 machine.

## Open gaps across stages

| Gap | Stage | Size | Next step |
| --- | --- | --- | --- |
| Windows `pnpm bench --check` fails on `main`; Windows journeys skipped there | All | Blocks items 4 and 6 | In run 38613845186 the 10,000-note bench (`tools/bench/large.mjs`, line 82) times out after 30 s waiting for Files' type-ahead to focus "Alpha". Find whether type-ahead in a 10,000-row tree is slow (a PRF-09 defect) or the harness waits wrongly |
| DST-02: the template repository and a first deploy from a fresh copy | MW | WP-5.6, owner | Build WP-5.6; owner's demo |
| SEC-01: launch the packaged app in CI (`packaged.spec.ts`), not just read its fuses | M0 | Small | CI follow-up |
| Firefox and WebKit web journeys | MW | Small | Add projects to `apps/web/playwright.config.ts` |
| KEY-03: the Power layer | M4 | WP-4.4 | Build WP-4.4 |
| 1,000-round fault run | M3 | A run | Run before the gate, record the seed and result |
| Linux journeys (not blocking, D-112) fail: `m1-tables.spec.ts` "TBL-08, TBL-11 by keyboard", `vq-flows.spec.ts` and `vq-surfaces.spec.ts` (D-111) | M1 | Unknown | Read the traces in run 38615626147; check them on Windows once the bench passes |

The work branch's CI (run 38617507089 on `99c6960`, and 38615626147 before it) passes the repository checks, typecheck, and every unit test on Windows and Linux, and fails the Windows bench the same way as `main`. On macOS (not blocking), run 38617507089 failed one unit test, `watch-tree.test.ts` "reports a note that's deleted and written again" (PRF-11), which passed on macOS in 38615626147: a file-watching flake to look at during the platform parity pass.

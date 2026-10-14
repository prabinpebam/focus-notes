# Stage gate evidence

The evidence for each stage gate before 1.0, in the order the stages close (M0, M1, MW, M3, M2, M4, Windows first, [D-112](decisions.md)): each item of the [stage definition of done](definition-of-done.md#stage-definition-of-done) with its status and evidence, each stage's exit criteria, the gaps still open, and the steps only the owner can take.

> [!NOTE]
> **TL;DR.** 145 of 150 requirements in these six stages are named by at least one automated test (`pnpm trace`). M1, M3 and M2 trace every requirement; M0 misses **DSY-10** and **SEC-01**, MW misses **PKG-07** and **DST-02**, and M4 misses **KEY-03** (WP-4.4 isn't built). Every demo script is automated, as one journey (M0, M1, M2) or as journeys named per demo step (MW, M3, M4). No gate can pass yet: the Windows bench (`pnpm bench --check`) fails on `main`, which also skips the Windows journeys there, and every gate still needs the owner's demo on a clean Windows 11 machine, the screen-reader passes, and acceptance.

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
| [M0](implementation-plan.md#m0) | 27 of 29 | DSY-10, SEC-01 | 9 of 9 done | `m0-walking-skeleton.spec.ts` | SEC-01, DSY-10; Windows bench |
| [M1](implementation-plan.md#m1) | 56 of 56 | None | 11, all requirements traced | `m1-demo.spec.ts` | Windows bench and journeys on CI; owner |
| [MW](implementation-plan.md#mw) | 20 of 22 | PKG-07, DST-02 | WP-6.2 still building | `web.spec.ts` steps 2 to 6, `seal.test.ts` step 7 | PKG-07, DST-02; Firefox and WebKit |
| [M3](implementation-plan.md#m3) | 21 of 21 | None | 6, all requirements traced | Named steps in `m3-*.spec.ts` | 1,000-round fault run; owner |
| [M2](implementation-plan.md#m2) | 9 of 9 | None | 3, all requirements traced | `m2-demo.spec.ts` | Windows bench; owner |
| [M4](implementation-plan.md#m4) | 12 of 13 | KEY-03 | WP-4.4 planned | Named steps in `m4-*.spec.ts` | WP-4.4 (KEY-03) |

## Stage definition of done, per stage

| # | Item | M0 | M1 | MW | M3 | M2 | M4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | All work packages done, every requirement passes | Open | Traced | Open | Traced | Traced | Open |
| 2 | Demo passes on a clean Windows 11 machine, run by the owner | Owner | Owner | Owner | Owner | Owner | Owner |
| 3 | The demo is an automated journey | Met | Met | Traced | Traced | Traced | Traced |
| 4 | All earlier journeys pass | Open | Open | Open | Open | Open | Open |
| 5 | No S1 or S2 defect open | Met | Met | Met | Met | Met | Met |
| 6 | The quality bar holds (budgets, accessibility, design system, security, privacy) | Open | Open | Open | Open | Open | Open |
| 7 | Docs match the build, stage pages `stable` | Owner | Owner | Owner | Owner | Owner | Owner |
| 8 | Decisions and risks reviewed | Owner | Owner | Owner | Owner | Owner | Owner |
| 9 | Retrospective on the agentic loop | Owner | Owner | Owner | Owner | Owner | Owner |
| 10 | The owner accepts it | Owner | Owner | Owner | Owner | Owner | Owner |

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

**Gaps.** **SEC-01** (WP-0.6, done): context isolation, the sandbox, no Node in the renderer, denied permissions and navigation (`main.ts`), and a strict CSP (`src/renderer/index.html`) are in place, but the Electron fuses (`RunAsNode` off, load only from ASAR, ASAR integrity) aren't set in the packaging config, and no test checks the checklist. Setting the fuses is build work, not a test. **DSY-10** (WP-0.4, done): the component process is followed by review, but there's no UI schema major version and no automatic view-document migration to test. Both work packages need a follow-up package.

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

**Gaps.** **PKG-07**: the browser asks to keep its storage (`navigator.storage.persist()` in `apps/web/src/bridge.ts`), but no test checks that request, and nothing tells the person that clearing the site's data deletes their notes; the rest of PKG-07 is in `web.spec.ts`. **DST-02** (WP-6.2, building): the web first run and *Use this app for yourself* aren't finished. **Firefox and WebKit** projects are missing from the web journeys.

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
| Windows `pnpm bench --check` fails on `main`; Windows journeys skipped there | All | Blocks items 4 and 6 | Read the failing measure in run 38613845186, fix or rebaseline in a reviewed commit |
| SEC-01: Electron fuses not set; no test of the hardening checklist | M0 | Small, security review | Follow-up to WP-0.6 |
| DSY-10: no UI schema major version or view migrations | M0 | Work package | Follow-up to WP-0.4 |
| PKG-07: no "clearing site data deletes your notes" message; the `persist()` request is untested | MW | Small | Add to WP-6.1 |
| DST-02: web first run, *Use this app for yourself* | MW | WP-6.2 | Finish WP-6.2 |
| Firefox and WebKit web journeys | MW | Small | Add projects to `apps/web/playwright.config.ts` |
| KEY-03: the Power layer | M4 | WP-4.4 | Build WP-4.4 |
| 1,000-round fault run | M3 | A run | Run before the gate, record the seed and result |

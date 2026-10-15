# Stage gate evidence

The evidence for each stage gate before 1.0, in the order the stages close (M0, M1, MW, M3, M2, M4, Windows first, [D-112](decisions.md)): each item of the [stage definition of done](definition-of-done.md#stage-definition-of-done) with its status and evidence, each stage's exit criteria, the gaps still open, and the steps only the owner can take.

> [!NOTE]
> **TL;DR.** All 150 requirements in these six stages are named by at least one automated test (`pnpm trace` lists none untraced), and on 2026-10-15 every one of them has a test that passed on Windows in CI run 38639327074 on `be2f820` (now `main`): repository checks, typecheck, 1,054 unit tests, the bench (`pnpm bench --check`), 147 desktop journeys (5 skipped, all macOS-only or packaged) and 27 web journeys. Every demo script is automated and passed there. Even so, none of the 31 *verifying* work packages in M1, MW, M3, M2, and M4 can move to *done* yet, because rows of the [work package definition of done](definition-of-done.md#work-package-definition-of-done) have no evidence: for all of them, recorded review approvals, a dependency audit, and a nightly build that installs and starts on Windows; for the 24 with surfaces, approved visual baselines and the light and dark screenshot review; and for eight, open high CodeQL findings. No gate can pass until these are closed and the owner runs each demo on a clean Windows 11 machine, confirms the proposed decisions, and accepts it.

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
| [M0](implementation-plan.md#m0) | 29 of 29 | None | 9 of 9 done | `m0-walking-skeleton.spec.ts` | Launching the packaged app in CI; owner |
| [M1](implementation-plan.md#m1) | 56 of 56 | None | 11 verifying | `m1-demo.spec.ts` | The four missing evidence rows; CodeQL (WP-1.2); owner |
| [MW](implementation-plan.md#mw) | 22 of 22 | None (DST-02 in part) | 6 verifying; WP-6.2 building | `web.spec.ts` steps 2 to 6, `seal.test.ts` step 7 | The missing rows; CodeQL (WP-2.3, 2.4, 6.4); DST-02 (WP-5.6); Firefox and WebKit; owner |
| [M3](implementation-plan.md#m3) | 21 of 21 | None | 6 verifying | Named steps in `m3-*.spec.ts` | The missing rows; CodeQL (WP-3.4, 3.5); 1,000-round fault run; owner |
| [M2](implementation-plan.md#m2) | 9 of 9 | None | 3 verifying | `m2-demo.spec.ts` | The missing rows; owner |
| [M4](implementation-plan.md#m4) | 13 of 13 | None | 5 verifying | Named steps in `m4-*.spec.ts` | The missing rows; CodeQL (WP-4.1, 4.2); owner |

*The missing rows* are the evidence the [work package verification](#work-package-verification) finds missing: review approvals, a dependency audit, and the nightly build installing and starting on Windows for every package, and approved visual baselines and the light and dark screenshot review for those with surfaces.

## Stage definition of done, per stage

| # | Item | M0 | M1 | MW | M3 | M2 | M4 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | All work packages done, every requirement passes | Open | Open | Open | Open | Open | Open |
| 2 | Demo passes on a clean Windows 11 machine, run by the owner | Owner | Owner | Owner | Owner | Owner | Owner |
| 3 | The demo is an automated journey | Met | Met | Met | Met | Met | Met |
| 4 | All earlier journeys pass | Met | Met | Met | Met | Met | Met |
| 5 | No S1 or S2 defect open | Met | Met | Met | Met | Met | Met |
| 6 | The quality bar holds (budgets, accessibility, design system, security, privacy) | Open | Open | Open | Open | Open | Open |
| 7 | Docs match the build, stage pages `stable` | Owner | Owner | Owner | Owner | Owner | Owner |
| 8 | Decisions and risks reviewed | Owner | Owner | Owner | Owner | Owner | Owner |
| 9 | Retrospective on the agentic loop | Owner | Owner | Owner | Owner | Owner | Owner |
| 10 | The owner accepts it | Owner | Owner | Owner | Owner | Owner | Owner |

- **Item 1.** Every requirement in all six stages passes on Windows in CI run 38639327074, but no work package after M0 is *done*: the [work package verification](#work-package-verification) below lists what each still lacks. (On 2026-10-15, 22 packages were moved to *done* on unit tests alone and moved back, since the definition of done needs the journeys and the other rows too.)
- **Items 3 and 4.** CI run 38639327074 on `be2f820` (branch `fix-integrate-refocus`, the commit now on `main`) passed every Windows step: the demo journeys of every stage, 147 desktop journeys with 5 skipped (the three macOS-only window journeys, which passed on macOS in the same run, and the two `packaged.spec.ts` journeys, which need a packaged build), and 27 web journeys. macOS and Linux fail visual-quality journeys there; they report without blocking until the platform parity pass ([D-112](decisions.md)).
- **Item 5.** No issue is open on GitHub (checked 2026-10-15).
- **Item 6.** *Budgets:* `pnpm bench --check` passed in run 38639327074 on a CI runner; the gate still needs it on a quiet reference machine. *Security:* CodeQL on `be2f820` (run 38643530510) succeeded, but 13 high findings are open (12 `js/polynomial-redos` in app code, listed per package below, and 1 `js/incomplete-multi-character-sanitization` in `documentations/shell/slate.js`) and need fixing or a recorded dismissal; Dependabot alerts are turned off for the repository, so there's no dependency audit result. *Design system:* `ui:check` passes (257 documents), but no visual baseline exists. *Accessibility:* zero axe violations in every journey that checks it (`m1-a11y.spec.ts`, `a11y.spec.ts`, and the stage journeys); the NVDA pass is the owner's.

## Work package verification

The verifier checked the 31 *verifying* work packages in M1, MW, M3, M2, and M4 against the [work package definition of done](definition-of-done.md#work-package-definition-of-done) on 2026-10-15, with CI run 38639327074 (Windows job 116110527545) on `be2f820` as the evidence. `pnpm trace` gives each requirement's test files; each file is either a unit test file (all 86 passed, 1 test skipped in `hardening.test.ts`) or a journey file whose tests passed in that job. A package moves to *done* only when every row has evidence; missing evidence is a failure.

| Row | Evidence for these packages | Status |
| --- | --- | --- |
| Behavior | Every requirement of every package has at least one test that passed on Windows in run 38639327074. The macOS-only journeys for DSK-01, DSK-02, and DSK-05 are skipped on Windows and passed on macOS in the same run (job 116110527860). KEY-03's planned keys are recorded in D-115 | Met |
| No regressions | All Windows unit tests, 147 desktop journeys (5 skipped) and 27 web journeys passed; macOS and Linux report without blocking ([D-112](decisions.md)) | Met |
| Design system | `ui:check` passed (257 documents, 47 components, 348 commands). No journey compares a screenshot (`toHaveScreenshot`), so no new variant or state has an approved visual baseline | Open for packages with surfaces |
| Visual quality | The geometry rules pass in `vq-surfaces.spec.ts` and `vq-flows.spec.ts` on Windows, at the default and minimum window sizes. No critical review of screenshots in a light and a dark theme is recorded | Open for packages with surfaces |
| Accessibility | Zero axe violations and the keyboard journeys pass | Met |
| Performance | `pnpm bench --check` passed (*Budgets (QLT-05)*) | Met |
| Security and privacy | CodeQL ran on `be2f820` (run 38643530510); 12 high `js/polynomial-redos` findings are open in eight packages' code. No dependency audit runs: Dependabot alerts are off for the repository and CI has no audit step | Open |
| Code quality | Typecheck and the boundary check pass; the review approval that is this row's evidence isn't recorded | Open |
| Licensing | The license check passed | Met |
| Docs and traceability | Every package's spec pages exist, the chain and plan checks pass, and the deviations are recorded as proposed decisions (D-74 to D-116) | Met; the owner confirms the decisions at the gate |
| Reviews | Work merges from branches without pull requests, so no evidence record exists, and no commit records an approval | Open |
| Integrated | Merged to `main` (`be2f820`); nightly run 38643530564 built the Windows installer and read its fuses, but nothing installs and starts it (`packaged.spec.ts` is skipped in CI) | Open |

**Missing, per package.** *Reviews*: approvals from each listed reviewer. *Audit*: a dependency audit with no high or critical finding. *Installs*: the nightly build from the commit installing and starting on Windows. *Baselines*: approved visual baselines for the package's new variants and states. *Screenshots*: the critical screenshot review in light and dark. *CodeQL #n*: open high alerts in the package's code, to fix or dismiss with a reason the security reviewer accepts.

| Work package | Stage | Status | Requirements passing in run 38639327074 | Reviews it lists | Missing |
| --- | --- | --- | --- | --- | --- |
| WP-1.1 | M1 | Verifying | 8 of 8 (EDT-02, EDT-04, EDT-05, EDT-08, EDT-10, EXT-02, EXT-05, I18N-02) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.2 | M1 | Verifying | 4 of 4 (EDT-03, EDT-12, EDT-13, UI-06) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #4, #7 |
| WP-1.3 | M1 | Verifying | 3 of 3 (EDT-06, EDT-09, SEC-02) | code, design-system, accessibility, security | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.4 | M1 | Verifying | 4 of 4 (DSY-09, DSY-12, PRF-08, UI-09) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.5 | M1 | Verifying | 9 of 9 (TBL-01, TBL-02, TBL-03, TBL-05, TBL-06, TBL-07, TBL-08, TBL-10, TBL-11) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.6 | M1 | Verifying | 6 of 6 (UI-03, UI-04, UI-05, UI-07, DSY-06, UI-10) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.7 | M1 | Verifying | 8 of 8 (FOC-01, FOC-02, FOC-03, FOC-04, FOC-05, FOC-06, PRF-01, UI-11) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.8 | M1 | Verifying | 3 of 3 (KEY-02, KEY-05, KEY-06) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.9 | M1 | Verifying | 7 of 7 (THM-01, THM-02, THM-03, THM-06, THM-08, DSY-03, A11Y-02) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.10 | M1 | Verifying | 2 of 2 (FND-01, FND-02) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-1.11 | M1 | Verifying | 2 of 2 (A11Y-01, PRF-03) | code, design-system, accessibility, security | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-2.3 | MW | Verifying | 3 of 3 (DST-05, FIL-07, PRF-11) | code | Reviews, Audit, Installs, CodeQL #5, #6 |
| WP-2.4 | MW | Verifying | 5 of 5 (FIL-01, FIL-02, FIL-03, FIL-08, PRF-09) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #8 |
| WP-2.5 | MW | Verifying | 1 of 1 (FIL-09) | code | Reviews, Audit, Installs |
| WP-6.1 | MW | Verifying | 3 of 3 (PKG-05, PKG-07, PKG-11) | code, security | Reviews, Audit, Installs |
| WP-6.3 | MW | Verifying | 1 of 1 (PKG-08) | code, security, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-6.4 | MW | Verifying | 5 of 5 (PKG-10, SEC-08, SHR-04, SEC-06, UI-12) | code, security, accessibility | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #3 |
| WP-3.1 | M3 | Verifying | 2 of 2 (FRE-08, AGT-07) | code, security | Reviews, Audit, Installs |
| WP-3.2 | M3 | Verifying | 7 of 7 (FRE-01, FRE-02, FRE-03, FRE-04, FRE-05, FRE-06, SEC-03) | code, design-system, accessibility, security | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-3.3 | M3 | Verifying | 3 of 3 (EDT-11, FIL-05, PRF-07) | code | Reviews, Audit, Installs |
| WP-3.4 | M3 | Verifying | 5 of 5 (FIL-06, SHR-01, SHR-02, PRV-03, FRE-10) | code, design-system, accessibility, security | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #11 |
| WP-3.5 | M3 | Verifying | 2 of 2 (FIL-12, FIL-10) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #10 |
| WP-3.6 | M3 | Verifying | 2 of 2 (FRE-07, PRV-02) | code, security | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-2.1 | M2 | Verifying | 3 of 3 (DSK-01, DSK-03, DSK-08) | code, design-system, accessibility, security | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-2.2 | M2 | Verifying | 3 of 3 (DSK-02, DSK-04, DSK-05) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-2.6 | M2 | Verifying | 3 of 3 (QLT-03, PRF-04, PRF-10) | code | Reviews, Audit, Installs |
| WP-4.1 | M4 | Verifying | 2 of 2 (SPT-07, SPT-08) | code, security | Reviews, Audit, Installs, CodeQL #12, #13, #14 |
| WP-4.2 | M4 | Verifying | 7 of 7 (SPT-01, SPT-02, SPT-03, SPT-04, SPT-05, FIL-04, KEY-01) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots, CodeQL #15 |
| WP-4.3 | M4 | Verifying | 1 of 1 (FND-04) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-4.4 | M4 | Verifying | 1 of 1 (KEY-03) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-4.5 | M4 | Verifying | 2 of 2 (THM-07, THM-13) | code, design-system, accessibility | Reviews, Audit, Installs, Baselines, Screenshots |
| WP-5.5 | M5 | Verifying | 1 of 1 (DST-03) | code, security | Reviews (code; security re-check of the fixes), Installs, the owner's release environment and tag ruleset (D-128) |
| WP-5.7 | M5 | Building | QLT-04 (locally: `diagnostics.test.ts` in core and desktop, `m5-diagnostics.spec.ts`); QLT-02 specified, not run | code, design-system, accessibility, security | Reviews (security first: it handles data), Windows CI run, the owner's decision on a log file (D-140 (4)), the release qualification run |

The CodeQL alerts: #3 `packages/seal/src/format.ts:207`; #4 `packages/core/src/format.ts:68`; #5 and #6 `packages/core/src/workspace.ts:129` and `:177`; #7 `packages/editor/src/format.ts:40`; #8 `packages/core/src/bridge.ts:236`; #10 `packages/core/src/history.ts:35`; #11 `packages/core/src/notes.ts:52`; #12 to #14 `packages/core/src/search/extract.ts:24`, `:66`, `:86`; #15 `packages/core/src/spotlight.ts:50`. Each is attributed to the package whose commit added the line. #1 (high, `documentations/shell/slate.js:63`) belongs to the docs site, and #9 (medium, `packages/editor/src/table-commands.ts:173`, WP-1.5) is below the bar.

**WP-5.5 (release pipeline, D-128, D-129).** DST-03 is traced by `tools/test/release-workflows.test.mjs` and `tools/test/release-tools.test.mjs` (and the template's checks in `workspace-template.test.mjs`). Two dry runs of `release.yml` on `c89d27a`, run 38692554080 (the `v0.0.1-dryrun.1` tag) and run 38692597770 (a manual run on `wp-5.5`), built the Windows installer (fuses read back, packaged smoke test passed), the macOS and Linux packages, the web app bundle (smoke-tested with its own publisher) and the pinned template, and drafted nothing; `gh attestation verify` passed on the bundle with the signer workflow and tag, and failed for any other tag. Windows CI for `c89d27a`: run 38692554160. The security review found no critical or high issues; its medium and low findings are fixed after it, and from then on dry runs aren't attested at all. `preview-channel.yml` can't run before it's on `main` (`workflow_run` uses the default branch's file), so its first run after the merge is its evidence. Open: a code review, installs on clean machines, and the owner's settings in D-128 (8).
## M0: Walking skeleton

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Install the preview on clean Windows 11 | Preview build: the `v0.0.x` tag's draft pre-release from `release.yml` (D-128), or the rolling `preview` pre-release (D-129) | Owner |
| 2. Canvas with only the trigger, caret ready in 2.5 s | `m0-walking-skeleton.spec.ts`; `PRF-02.coldReadyMs` in `pnpm bench --check` | Met |
| 3 to 5. Heading and paragraphs, clean CommonMark, back on relaunch | `m0-walking-skeleton.spec.ts` | Met |
| 6. The gallery shows every M0 primitive in light and dark | `vq-surfaces.spec.ts`, `screens.spec.ts`; the gallery build (`pnpm gallery`) | Owner |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Spikes recorded: D-01, D-14, DSY-11 | [Decisions](decisions.md); `render.test.ts` (renderer overhead 10% or less) | Met |
| CI on three systems, nightly build from `main` | `ci.yml` matrix, `nightly.yml`; Windows gates, macOS and Linux report (D-112) | Met |
| Work graph, role instructions, evidence format in use | `work-graph.json`, `.github/agents`, `pull_request_template.md`; `pnpm check:plan` | Met |
| The canvas is a view document that passes `ui:check` | `views.test.ts`, `check.test.ts` | Met |
| `pnpm bench --check` against a committed baseline | `tools/bench/budgets.json`; `repository.test.mjs` (QLT-05); *Budgets (QLT-05)* in run 38639327074 | Met |

**Closed.** **SEC-01** (WP-0.6): the packaging config sets the Electron fuses (`electronFuses`: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` off; `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` on). `apps/desktop/test/hardening.test.ts` checks the web preferences, the request allow-list, denied navigation and permissions, the CSP and the fuse config, and reads the fuses from a packaged executable when there is one; `packaged.spec.ts` reads them from `FOCUS_NOTES_E2E_EXE`. The journeys drive a copy beside the packaged executable with only the inspector fuse on, since Playwright needs it. **DSY-10** (WP-0.4): `packages/ui-runtime/src/migrate.ts` holds the UI schema's major (read from each document's `$schema`) and the migrations; `ui:check` migrates before validating and refuses newer majors (`migrate.test.ts`).

**Gaps.** The fuses are read from a packaged build only where one exists: locally after `electron-builder --dir`, and in the nightly Windows packaging run on `main` (`hardening.test.ts` after `dist`). CI's per-branch run doesn't package, and no CI job launches the packaged app (`packaged.spec.ts`).

**Owner.** Install and run the demo on a clean Windows 11 machine from the M0 preview, and browse the gallery in light and dark. Confirm D-116 (the fuses and the schema major as built). Then the risks review, the retrospective, and acceptance (items 8 to 10).

## M1: Writing

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1 to 8 | `m1-demo.spec.ts`, once with the pointer and once keyboard only (step 9) | Met |
| 4. No visible lag in the 50,000-word fixture with focus mode | `m1-demo.spec.ts`, `m1-performance.spec.ts` (PRF-01) | Met |
| 9. NVDA on Windows | [Accessibility audit](../architecture/performance-and-quality.md) script | Owner |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Round-trip corpus at 100% | `roundtrip.test.ts` (25 files, EDT-10, EXT-02) | Met |
| PRF-01 in the 50,000-word fixture with focus mode | `m1-performance.spec.ts` | Met |
| Every surface a view document; gallery, baselines, no axe violations | `views.test.ts`, `vq-surfaces.spec.ts`, `m1-a11y.spec.ts`; no visual baselines exist | Open: baselines |
| The owner writes three real documents | None | Owner |

**Gaps.** None in requirements.

**Owner.** The demo on a clean Windows 11 machine, keyboard only, then with NVDA; three real documents. Confirm the proposed decisions M1 was built on: D-74, D-75, D-76, D-77, D-83, D-91, D-93, D-96, D-100, D-104, D-106. Then the risks review, the retrospective, and acceptance (items 8 to 10).

## MW: Your Focus Notes on GitHub Pages

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. *Use this template*, turn on Pages, open the site | `workspace-template.test.mjs` (the template's content and workflow) | Owner, on real GitHub |
| 2. Write with no account, reload, offline | `web.spec.ts` "your notes stay in this browser" | Met |
| 3, 4. Public notes read-only, *Copy to my notes*, the visitor view | `web.spec.ts` "a visitor sees the public notes" | Met |
| 5. Unlock, *Remember on this browser*, Forget | `web.spec.ts` "the owner unlocks private notes" | Met |
| 6. Export, import into a second browser | `web.spec.ts` "export your notes" | Met |
| 7. A private sentence in a public build fails the deploy | `seal.test.ts` "the leak check (SEC-06)" | Met |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Browser journeys in Chromium, Firefox, WebKit with a sealed vault | `apps/web/playwright.config.ts` runs Chromium only | Open |
| Network capture: only the site's own files; nothing that opens the vault stored unless remembered | `web.spec.ts` (hosts watched; IndexedDB keys checked) | Met |
| Sealer test vectors in Node and every browser; other parameters refused | `seal.test.ts` in Node (SEC-08); Chromium through the unlock journeys | Met in Node and Chromium; Firefox and WebKit: Open |

**Closed.** **PKG-07**: the web welcome note says plainly that clearing the site's data deletes the notes, and points to *Export my notes* and the desktop app; `web.spec.ts` checks that `navigator.storage.persist()` is called and the notice shows.

**Gaps.** **DST-02** (WP-6.2, building), traced in part: `workspace-template.test.mjs` checks that the template's *Deploy app* workflow publishes the released app to the copy's own Pages with GitHub Actions and builds nothing, that its README walks through Pages, the site and the desktop app, and that the app's copy link is the template repository; `web.spec.ts` follows *Use this app for yourself* to it. Still open: the template repository `focus-notes-workspace` itself, generated from `templates/workspace/` with a real pinned release (WP-5.6), and a first deploy from a fresh copy, which only the owner's demo can show. **Firefox and WebKit** projects are missing from the web journeys.

**Owner.** Make an instance from the template on real GitHub, deploy it, and run steps 1 to 7 in two browsers; a private window for the visitor view. Confirm D-83, D-92, D-94, D-95, D-102. Then the risks review, the retrospective, and acceptance (items 8 to 10).

## M3: Desktop sign-in and Git

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. First run: Git, sign-in, identity, create the workspace | `m3-first-run.spec.ts` (fake GitHub and fake Git helpers) | Met; clean machine without Git: Owner |
| 2. A note is committed and pushed | `m3-git.spec.ts` "Mod+S commits and pushes" | Met |
| 3. A second computer opens the existing workspace | `m3-first-run.spec.ts` "sign in with the GitHub CLI's code" | Met |
| 4. Offline edits on two computers, then the conflict resolver | `m3-conflicts.spec.ts` "a sync conflict offers Resolve" | Met |
| 5. Public, then private again | `m3-visibility.spec.ts` "Make public asks first" | Met |
| 6. Import a browser's bundle | `m3-visibility.spec.ts` "Import notes" | Met; opening it after a real deploy: Owner |
| 7. Delete and restore | `m3-conflicts.spec.ts` "a delete's toast offers Undo" | Met |
| 8. `git push` in a terminal without signing in | `m3-settings.spec.ts` "Switch account … the terminal follows" | Met; real terminal: Owner |
| 9. Sign out removes the data inventory | `m3-settings.spec.ts` "signing out with Git's credential deletes exactly what the data inventory lists" | Met |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Fault injection, 1,000 randomized rounds, no lost text | `fault-injection.spec.ts` (CI runs 3); run `FOCUS_NOTES_FAULT_ROUNDS=1000` before the gate | Open |
| Owner and two testers, two computers, five working days | None | Owner |
| 10,000 notes: no first frame waits for Git; one `git status` per repository | `PRF-07.statusProcesses`, `PRF-07.cachedStatusMs` in `pnpm bench --check` | Met on CI; a quiet reference machine at the gate |

**Gaps.** The fault suite kills the app while typing and committing; network drop mid-push, a full disk, and two computers are covered by `git-sync.test.ts` and `git-conflicts.test.ts`, not by the randomized rounds.

**Owner.** Steps 1 to 9 on two clean Windows machines with a real GitHub account; the five-day trial with two testers. Confirm D-97, D-98, D-99, D-100, D-101, D-102, D-103. Then the risks review, the retrospective, and acceptance (items 8 to 10).

## M2: The desktop app

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Snap, Snap Layouts, Win+arrows, Alt+Space, resize, mixed DPI | `m2-window.spec.ts` (app-built moving, resizing, maximize, vertical maximize, on CI only: D-141); real snapping and monitors | Met; Owner |
| 1a. Vertical maximize and the shadow (D-141) | `custom-window.test.ts`, `window-geometry.test.ts` (bounds, work area, taskbar, displays, Win+Shift keys, the shadow inside its margin in every theme), `window-app.test.ts`; `m2-window.spec.ts` (top-edge resize to the work area, double-click on the border, restoring the height; the captured window's edge fully transparent) | Met on CI; Owner: the real gestures |
| 2. The macOS menu bar | `menu-bar.test.ts`, `m2-titlebar.spec.ts` | Platform parity pass (D-112) |
| 3. Full screen with F11 | `m2-demo.spec.ts`, `m2-titlebar.spec.ts` | Met |
| 4. Files: create, rename, delete, select several, Move to… | `m2-demo.spec.ts`, `mw-files.spec.ts` | Met |
| 5. A rename updates links | `m2-demo.spec.ts`, `mw-links.spec.ts` | Met |
| 6. Kill while typing, get the text back | `m2-demo.spec.ts`, `m2-recovery.spec.ts` | Met |
| 7. 10,000 notes: 350 MB or less, idle CPU near zero | `PRF-04.memoryMB`, `PRF-04.idleCpuPct` in `pnpm bench --check` | Met on CI; a quiet reference machine at the gate |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Five working days as the only notes app, no S1 or S2 | None | Owner |
| Window behavior on Windows 10, Windows 11, mixed DPI | `m2-window.spec.ts` on one display | Owner; Ubuntu at parity (D-112) |

**Gaps.** None in requirements.

**Owner.** Step 1 by hand on two monitors with different scaling, and D-141 by hand: drag the top edge to the top of the screen and the bottom edge onto the taskbar (the window fills the height, same width), double-click the top or bottom border, try <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> (whether Windows passes them to a transparent window is unknown), drag the window away to get its height back, and look at the shadow on a light wallpaper; five working days. Confirm D-104, D-105, D-106, D-107. Then the risks review, the retrospective, and acceptance (items 8 to 10).

## M4: Find anything, make it yours

| Demo step | Evidence | Status |
| --- | --- | --- |
| 1. Spotlight in under 50 ms in the 5,000-note fixture | `m4-spotlight.spec.ts` "(M4 demo 1)"; `SPT-07.*` budgets | Met |
| 2. Jump to a heading; `>` runs a command with its state | `m4-spotlight.spec.ts` "(M4 demo 2)" | Met |
| 3. Quick actions on a result | `m4-spotlight.spec.ts` "(M4 demo 3)" | Met |
| 4. Find in all notes and open a match | `m4-find-all.spec.ts` "(M4 demo, step 4)" | Met |
| 5. Theme gallery with live preview; Esc reverts | `m4-themes.spec.ts` "THM-07, keyboard only" | Met |
| 6. The contrast guard and its fix | `m4-themes.spec.ts` "THM-13, keyboard only" | Met |

| Exit criterion | Evidence | Status |
| --- | --- | --- |
| Spotlight budgets (SPT-07) on reference hardware | `SPT-07.*` in `pnpm bench --check` | Met on CI; reference hardware at the gate |
| No note text leaves the computer while indexing and searching | `m4-search.spec.ts` (SPT-08) | Met |

**Gaps.** None in requirements. **KEY-03** (WP-4.4) is built; the keys that wait for multiple windows or belong to the Pro layer are listed as planned in D-115, and `keymap-layers.test.ts` fails on any Basic, Writer, or Power row that is neither bound nor listed.

**Owner.** The demo on a clean Windows 11 machine. Confirm D-75, D-105, D-107, D-108, D-109, D-110, D-115. Then the risks review, the retrospective, and acceptance (items 8 to 10).

## Open gaps across stages

| Gap | Stage | Size | Next step |
| --- | --- | --- | --- |
| Review approvals: work merges from branches without pull requests, so the reviews each package lists leave no record | M1 to M4 | 31 packages | Run the listed reviewers (code, design system, accessibility, security) per package or per stage, and record each approval where the [evidence record](agentic-loop.html) can be found, for example on the stage gate issue. If approvals should live somewhere other than a pull request, that's an owner decision |
| Visual baselines: no journey compares screenshots, so no variant or state has an approved baseline | M1 to M4 | 24 packages | Add screenshot comparisons for the gallery fixtures and the vq surfaces on Windows; the owner approves the baselines |
| Light and dark screenshot review (visual quality row) | M1 to M4 | 24 packages | The design-system reviewer reviews `vq-surfaces.spec.ts` and `vq-flows.spec.ts` screenshots from a Windows run and records the result |
| CodeQL: 12 high `js/polynomial-redos` alerts in app code (#3 to #8, #10 to #15) and 1 in the docs shell (#1) | MW, M3, M4, M1 | 8 packages | Fixed on `fix-quality-bar`: each pattern is a linear scan (`packages/core/src/scan.ts`, seal's `titleOf`, editor's `isWebLink`), checked against the old pattern on random strings and on 50,000-character adversarial input (`scan.test.ts`, `title.test.ts`, `web-link.test.ts`). The alerts close when CodeQL scans `main` after the merge. #1 is in `documentations/shell/slate.js`, byte for byte the Slate submodule's `shell/slate.js` (at `0a43f8f`): an upstream Slate issue |
| Dependency audit | All | Done on `fix-quality-bar` | `pnpm audit:deps` (`tools/audit-deps.mjs`) runs on Windows in CI. It asks the `.npmrc` registry (the package feed proxy), fails on any high or critical advisory in production dependencies, and fails when no report comes back. On 2026-10-15: 208 production dependencies, none with advisories |
| SEC-01 and the Integrated row: nothing installs and starts the nightly build | All | Small | The nightly Windows job now runs `packaged.spec.ts` against `release/win-unpacked/focus-notes.exe` after `dist`: 2 of 2 passed in nightly run 38646466179 on `fix-quality-bar` (the packaged app starts and shows a note, the icon, and the fuses). The installer itself still isn't run |
| DST-02: the template repository and a first deploy from a fresh copy | MW | WP-5.6, owner | Build WP-5.6; owner's demo |
| DST-06 end to end: publish the template from a real release, then an instance's update pull request from it | M5 | WP-5.6, owner | Built on `wp-5.6` (D-137): the workflow's properties and the update logic are pinned by `update-workflow.test.mjs`, `update-security.test.mjs` (the security review's 13 findings, D-137 (6)), `workspace-template.test.mjs` and `release-tools.test.mjs`, and a local run packed a 1.2.3 template and planned an update that changes only `.focus-notes/app.json`. Still needs a real `v<x.y.z>` release: `publish-template.mjs --version <x.y.z>`, then *Update app* in a copy (with *Allow GitHub Actions to create and approve pull requests* on) opening one pull request that the owner merges and that deploys |
| QLT-02 release qualification: the [checklist](distribution.md#release-qualification) on the support matrix has never run | M5 | The first release | Specified on `wp-5.7` (D-140): ten rows, each with its evidence. Run it with the first `v<x.y.z>` draft. To build first: the hooks it names (the journeys against the installed draft on a clean runner, the web journeys in Firefox and WebKit, the keyboard journeys per layout) |
| Firefox and WebKit web journeys | MW | Small | Add projects to `apps/web/playwright.config.ts` |
| 1,000-round fault run | M3 | A run | Run before the gate, record the seed and result |
| The bench on a quiet reference machine | All | A run | `pnpm bench --check` before each gate, as [When checks run](definition-of-done.md#when-checks-run) says |
| macOS and Linux visual-quality journeys fail (not blocking, D-112): on macOS in run 38639327074, `vq-surfaces.spec.ts` "every surface passes the visual quality checklist" and `vq-flows.spec.ts` "the conflict resolver and Recently deleted", in light and dark, at both sizes | M1, M3 | Unknown | The platform parity pass |

The Windows bench failure that blocked `main` (run 38613845186) and the Windows journeys it skipped are fixed: run 38639327074 passes both. On macOS (not blocking), `watch-tree.test.ts` "reports a note that's deleted and written again" (PRF-11) failed once in run 38617507089: a file-watching flake to look at during the platform parity pass.

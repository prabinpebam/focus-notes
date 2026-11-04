# Definition of done

What "done" means at every level: a work package, a stage, a release, and the whole project. Each level has measurable criteria and named evidence, so a person or an agent can tell without judgment calls whether something is done.

> [!NOTE]
> **TL;DR.** Five nested production levels remain unchanged below. The owner approved exact d40b78a3 Rewrite/Settings UX and UI on 1 November; its combined runtime/test/config head passed complete Windows CI 41325681712. The **MAI** rows add CP-RWR-01 to the production bar and still retain the explicitly unmeasured renderer, screen-reader, contrast and live-account certification gaps. Runtime hardening proof is not complete stage or release certification.

## UI states, after visual approval

**All eight design slices were approved** (owner, 4 November 14:06), including the compact border-spinner rule. The [audit's approval table](../design/ui-states-audit.md#visual-review-and-approval) records the authorization for phase 2. The rows below specify implementation evidence, not completed acceptance: silent failures land first, then commit states, with scoped typechecks, related unit tests and one journey per slice. App code stays on `vq-ui-states`; no full suite, CI wait or benchmarks are authorized by this increment.

| Slice | Wiring done when | Unit evidence, after approval | One related journey, after approval |
| --- | --- | --- | --- |
| D1 · Notifications (F3, F4, F10) | The notification host shows at most 3 pills, errors first; repeated subjects update/coalesce; errors and decision warnings stay until resolved or dismissed. Visible-only timers pause on hover, focus and window blur. Withdraw offers Undo only if it can restore the same link; otherwise explain the irreversible consequence before acting. | Queue priority/limit, coalescing, hard dismiss, visibility and pause/resume with fake clocks; notification region naming; same-link withdrawal restoration or irreversible confirmation. | Trigger 4 outcomes while writing, recover an error, dismiss a pill and see the next queued outcome without focus loss; withdraw and restore a reversible link. |
| D2 · Fields (F1, F2, F12) | TextField and ColorField use real commit results: pending and confirmed each hold at least 200 ms, only the field locks; failed values remain editable with Retry/Revert; storage errors are never silent. AI connection details commit independently; the provider-checked access key has its own explicit-save group. | Instant/slow/rejected writes; minimum beats; retained input; last-confirmed rollback; late response ordering and stable focus; key-check failure cannot claim Saved. | Change a project name and colour, inject a write failure, retry and reopen to find the stored values; distinguish connection details from the access-key Save. |
| D3 · Switches (F2) | One switch stays the same focusable element while pending; confirmation shows the stored value; a failure restores the last confirmed value with Retry, without blocking neighbours. | Instant/slow/rejected commits, 200 ms floor per beat, lock release at confirmation, stable focus and rollback. | Toggle watermark, force failure, use Retry and verify the kept value after reopening project settings. |
| D4 · Choices (F2, F14) | SegmentedControl, ThemeGallery and FontChoice confirm on the chosen option, lock only their group, and retain input on failure; keyboard browsing does not save every arrow step. Slider and PickerButton follow the same approved commit treatment. Hover styles in the audited components are hover-capability gated, with pressed feedback. | 500 ms pause/blur/release semantics; a single in-flight commit per group; stale-result ordering; Retry/Revert and keyboard focus; the static no-bare-hover enforcement rule. | Change appearance, theme and font using keyboard and pointer; inject failure, recover and reopen to check persistence; touch emulation never leaves hover stuck. |
| D5 · Empty spaces (F6) | Files, Open, AI connections, sharing and site-preview lists use the approved empty wrapper, minimum size, cause and next action; loading and errors never masquerade as empty. | First-use/filtered/cleared/all-done variants; section/view/component sizing; good-news tone; no empty flash during loading. | Visit the empty lists, use each available first action and see content replace the empty state in the same wrapper. |
| D6 · Recovery (F4, F5, F11, F15) | Open, New project, Local import, history and broken images expose a scoped recovery action and optional Details, keeping successful work and drafts. Failure copy names what is safe, including appearance and AI rewrite failures. No retry silently repeats completed destructive work. | Failure classification, preserved input, retry target and partial-result safety; optional Details; image alt fallback; safe-clause copy review. | Fail Open/import/history and an image read; retry from each surface without closing it or losing the draft. |
| D7 · Long operations (F7, F8, F13) | New project and Publish stream real steps, real-count progress and elapsed time with Cancel; failures name the failed step and preserve completed work; a crashed panel offers recovery without discarding the note. Native startup resolves the theme background before showing the window, without a blank or white frame. | Step transitions, known/unknown totals, cancellation and partial retry, retained draft, crash-boundary fallback, single outcome announcement and resolved startup scheme. | Start in light and dark, run a multi-step operation, cancel once and retry a failed step; recover a crashed panel with the note intact. |
| D8 · Section loading (F9) | Agents, the share item and history load independently in their own shape: 300 ms delay, at least 500 ms once visible, 3 shimmer passes then still; refresh keeps old content until replacement is ready. | Fast/slow/failed/empty load tracks; finite passes; reduced-motion static shapes; no stale overwrite or duplicate announcements. | Load and refresh the 3 sections with delayed/failed responses; navigation remains usable and Retry replaces only the affected section. |

**Try it in phase 1:** use the [review hub](http://127.0.0.1:5231/?f=mock.uistates.hub), compare Before/After and Play in light, dark and reduced motion. **Try it in phase 2:** perform the approved row's journey in the real app. Record exact-head evidence only after that slice's approval and implementation.

### Phase-2 evidence, 4 November

**W2 infrastructure is verified on `vq-ui-states` at `dbf53479`; no D2–D4 acceptance is claimed.** Rejected bound setters and action sequences report an error with Retry, stop dependent actions and preserve the original retry arguments. Keyboard/startup commands and unhandled renderer rejections use the same reporter. Settings writes are serialized and failed writes do not alter the confirmed appearance/reading values or leak into later writes.

| Check on `dbf53479` | Result |
| --- | --- |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed; desktop typecheck repeated after journey edits |
| `pnpm exec vitest run packages/core/test/settings-failures.test.ts packages/core/test/app.test.ts packages/core/test/settings-app.test.ts packages/core/test/theme-manager-app.test.ts packages/ui-runtime/test/failures.test.tsx` | 4 files, 35 tests passed; the additional `theme-manager-app.test.ts` selector matched no file |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write` | Passed: 695 documents, 81 components, 549 commands; generated files unchanged |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test e2e/ui-states.spec.ts --workers=1 -g "a rejected settings write"` | Passed: a real isolated state-file write fails, Retry persists 110% scale, and reopening Settings shows that value. Cleanup ran with only the journey's PID, first with `-WhatIf`, then without. |

**Follow-up:** the modal host and project prerequisite gaps above are resolved in the following increment. W2's evidence remains historical; it does not by itself accept D2–D4.

### Phase-2 functional increment, bf1c5afd

`vq-ui-states` now includes the approved project/Open implementation through a normal merge (`36e93da4`), modal notification recovery (`5251ef0d`), the notification queue (`414b9341`) and the first commit-track controls (`bf1c5afd`). App code remains off main.

| Check | Result |
| --- | --- |
| `pnpm typecheck` after the project merge | Passed for all workspace packages |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed on the commit-track increment |
| `pnpm exec vitest run packages/core/test/commits.test.ts packages/core/test/project-settings.test.ts packages/core/test/tasks.test.ts packages/core/test/settings-failures.test.ts packages/ui/test/commit-controls.test.tsx packages/ui-runtime/test/failures.test.tsx` | 6 files, 22 tests passed: separate 200 ms beats, stale confirmation timers, failed draft/Revert, 500 ms keyboard pause, stable focus, ordered project patches, rejected settings and local/global recovery |
| `pnpm exec vitest run packages/core/test/notifications.test.ts packages/core/test/app.test.ts packages/core/test/settings-failures.test.ts packages/ui/test/notification-layer.test.tsx packages/ui-runtime/test/failures.test.tsx` on the notification increment | 5 files, 27 tests passed: priority/queue, visible-only clocks, hard-dismiss actions/errors, coalescing, pause/resume and modal top-layer marker |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test e2e/ui-states.spec.ts --workers=1` | 3 journeys passed: rejected scale/Retry/reopening; F6 and pointer Retry above the open Settings modal; project-name blur/failure/retained draft/Retry/reopening |
| `pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write` | Generated schemas current; still fails on 54 inherited sharing/site-preview view findings. No new canvas finding remains. |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed: copied exact-commit output into the candidate, opened it invisibly, used normal Project settings, saved name/watermark, rejected a real state-file write, retained the draft and recovered with Retry. Candidate and journey apps closed; PID-scoped cleanup ran first with `-WhatIf`, then without. |

**Try it:** open `E:\Projects\side-projects\focus-notes-work\preview\candidates\bf1c5afd\Open review build.cmd`, then Project → Name/Watermark and Appearance → Interface size. The candidate uses sample notes and its own profile.

**Acceptance remains partial.** W3's separate commit lane and the first W4/W5 controls are functional. Action-driven project colour/logo/font/theme pickers, other app settings, AI's separate save groups, watermark failure, the full notification queue/withdrawal journey, scoped recovery, empty wrappers, long-operation steps and section shimmer still need their own evidence. The 54 inherited `ui:check` findings are recorded, not silently waived. No full suite, CI wait or benchmark ran.

### Phase-2 project increment, fd5252ee

Colour/preset-logo commit feedback (`78d0a335`), font/theme trigger feedback (`c766d793`) and watermark refusal/recovery proof (`fd5252ee`) are pushed. GitHub repeatedly refused the ordinary branch updates with `Internal Server Error`; one `git push --no-thin origin vq-ui-states` succeeded without changing history. No app code is merged to main.

Project choices retain the attempted selection and error locally while the writing surface keeps its saved identity. Retry uses the latest attempted value, Revert does not write, and the persistent font/theme trigger carries the minimum feedback beat after its popover closes. A refused font/theme write clears its temporary preview, not the retained choice. Theme arrows remain preview-only; Use app default commits explicitly.

| Check | Result |
| --- | --- |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed on the font/theme increment; core/desktop repeated after watermark test edits |
| `pnpm exec vitest run packages/core/test/project-settings.test.ts packages/core/test/commits.test.ts packages/ui/test/commit-controls.test.tsx packages/ui-runtime/test/failures.test.tsx` | 4 files, 17 tests passed on the combined increment: retained choices, unchanged saved identity, write-free Revert, focusable pending groups/triggers, repeated local Retry failures, preview cleanup, minimum beats and ordered project patches |
| `pnpm --filter @focus-notes/desktop run build` | Passed again at exact candidate head `fd5252ee` |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1` | 5 passed on the combined app build. Watermark's first attempt checked busy state on the RadioGroup rather than its wrapper and tried changing during its 200 ms pending hold; corrected to wait on the real wrapper. |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "a refused watermark"` | Passed after that selector correction, including failed On/Retry and failed Off/Revert; the actual writing-surface mark and write-free Revert are asserted |
| `pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write` | Generated contracts/current schemas: 0 fixture gaps, 0 stale files; still fails on the same 54 inherited sharing/site-preview findings |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at `fd5252ee`: normal Settings saved name/watermark/colour/logo/font/theme; real name/font write failures retained input and recovered via Retry. Candidate and every journey were invisible, closed, and followed by PID-scoped `-WhatIf` then actual cleanup. |

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\fd5252ee\Open review build.cmd`, then Project → Name/Colour/Logo/Watermark/Font/Theme. Synthetic notes and a separate profile only. The [approved gallery](http://127.0.0.1:5231/?f=mock.uistates.hub) remains running.

**Still partial:** SVG logo upload, other app settings, AI's details/key save groups, notification/withdrawal acceptance, scoped recovery, empty wrappers, streamed operations and section shimmer. Project settings evidence does not certify the other D2–D4 surfaces. No full suite, CI wait or benchmark ran.

### Phase-2 app choices and announcements, b7f54383

The app's Appearance and Paragraph spacing groups use the commit lane at pushed `9132ff95`. Named polite confirmation is added at pushed `b7f54383`: a bound control supplies its label, otherwise the outcome says “Change saved.” Confirmation happens once after successful storage, never for a pending or failed attempt, Revert or expiry; draft values never enter the announcement. The existing live region is reused, with no writing-window element added.

| Check on the combined increment | Result |
| --- | --- |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm exec vitest run packages/core/test/project-settings.test.ts packages/core/test/theme-manager.test.ts packages/core/test/commits.test.ts packages/core/test/settings-failures.test.ts packages/ui-runtime/test/failures.test.tsx` | 5 files, 35 tests passed: independent groups, confirmed-value safety, ordered Retry, minimum beats, retained input, single named outcomes and no draft disclosure |
| `pnpm --filter @focus-notes/desktop run build` at `b7f54383` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1` | All 7 scoped journeys passed together: scale, app mode/paragraph choices, modal F6/pointer Retry, project name, colour/logo, font/theme and watermark. Reopening preserves mode/spacing; the named live-region confirmation is accessible while Settings stays open. |
| `pnpm ui:check` | Still fails on the same 54 inherited sharing/site-preview findings; 0 fixture gaps, 0 stale generated files |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at exact pushed head `b7f54383`; normal Project settings plus app Appearance/Paragraph spacing and named polite confirmations were reached in the invisible candidate. Its synthetic profile/notes are separate. All apps closed; PID-scoped `-WhatIf` then actual cleanup ran. |

The theme-manager test's category list was updated for the Project section introduced by the prerequisite merge. No unrelated CI repair or quarantine was added. This is DOM/role evidence for announcements, not live screen-reader certification.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\b7f54383\Open review build.cmd`. Project settings cover the project controls; Settings → Appearance → Open theme manager covers Appearance and Reading → Paragraph spacing. Remaining app controls/sliders, AI save groups, SVG logo upload and the other D1–D8 gaps above remain unaccepted. No full suite, CI wait or benchmark ran.

### Phase-2 reading sliders and SVG upload, 6a217238

Pushed `7d8811e3` wires the three Reading sliders. Live note preview does not write or change acknowledged appearance; release, blur or a 500 ms keyboard pause commits once. A failed write restores the note's stored appearance while keeping the attempted numeric value and its formatted output in the slider. Other sliders remain usable. Pushed `6a217238` wires SVG upload to the shared logo commit group: Retry reuses the sanitized source without reopening the picker, Revert discards it without writing, and picker cancellation emits no saved outcome. The upload button uses its own border, with recovery outside.

| Check | Result |
| --- | --- |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed on the slider increment; core/desktop repeated and passed after SVG upload |
| `pnpm exec vitest run packages/core/test/theme-manager.test.ts packages/ui/test/commit-controls.test.tsx packages/ui-runtime/test/failures.test.tsx` | 3 files, 23 tests passed, including transient preview, refused-save rollback, formatted retained values, independent Retry and keyboard pause/blur/focus |
| `pnpm exec vitest run packages/core/test/project-settings.test.ts` | 9 tests passed, including retained upload source, picker cancellation, source-preserving Retry, write-free Revert and named confirmation |
| `pnpm --filter @focus-notes/desktop run build` | Passed for each slice |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "reading sliders"` | Passed: all three values persist and reopen; refused width keeps 85 characters, independent line spacing saves and Retry restores width |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "SVG logo upload"` | Passed: real sanitized SVG, actual state-write refusal, Retry with picker deliberately unavailable, later failed upload/Revert preserving the stored Rocket |
| `pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write` | Schemas regenerated; 0 fixture gaps, 0 stale files. Still fails on 54 inherited sharing/site-preview view findings; not a green static check |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at exact pushed head `6a217238`: normal project controls, SVG write refusal/Retry, Appearance/Paragraph spacing and all Reading sliders inspected invisibly |

Every journey and candidate closed its app and ran PID-scoped cleanup, `-WhatIf` first. The review gallery is detached from fresh folder `vq-ui-states-5` on port 5231; HTTP 200 verified. Clock marks recorded worker/production-ready; status says no matching clock, so reviews are tracked manually. No full suite, CI wait, benchmark or app-code merge to main ran.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\6a217238\Open review build.cmd`. Settings → Project → Upload SVG; Settings → Appearance → Open theme manager → Reading. This remains partial D2–D4 acceptance; the other controls, AI save groups and D1/D5–D8 gaps remain.

### Phase-2 known-empty wrappers, 7d8f98fd

**Partial D5 plus inherited static gates, pushed on `vq-ui-states`.** Open/recent, Files, AI, Sharing and site-preview lists use the approved sealed wrapper in their own content. Filtered results say No matches and Clear search restores the list; first-use Open selects a folder; AI's Add connection opens its existing form. Delayed/failed AI reads never become known-empty. Sharing/preview first actions close their transient surface and open Files without toggling an already-open panel shut. Site navigation/section actions lead to Files' existing publish flow, not a new configuration UI.

| Check | Result |
| --- | --- |
| `pnpm check` | Passed, including boundaries, token ownership, generated component inventory and `ui:check`; no inherited static findings remain |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm exec vitest run packages\core\test\project-open.test.ts packages\core\test\ai-app.test.ts packages\core\test\share-manage.test.ts packages\ui\test\commit-controls.test.tsx packages\ui-runtime\test\check.test.ts` | Passed: 118 tests; filtered clearing, known-empty/load-failure gating, sharing Files preservation, busy-menu focus/inertness and full-window overlay validation |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "known-empty wrappers"` | Passed: AI's first action opens/cancels its form in place; Open's filtered empty wrapper clears its search without navigating |
| Slate `runtime-host.mjs check --repo . --host documentations` from the worker folder | Passed for the updated component guidance/inventory |

EmptyState's unchanged sealed markup/styles now live in the primitive tier; NotificationRegion owns its matching token group. Other inherited styles use component aliases of their previous values; no visual redesign. Generated schemas/catalog are committed. The initial focused journey assumed Open was always a dialog; corrected to accept its existing full-window region. The touched Sharing unit's category list was stale after the inherited Project integration; corrected its expectation. Every app was invisible and closed with PID-scoped cleanup, `-WhatIf` first.

**Try it:** the next candidate refresh will include these wrappers; the current `6a217238` candidate still covers sliders/upload only. All-done/good-news cases and complete first-action/content-replacement journeys remain unaccepted; no full suite, CI wait, benchmark or app merge ran.

### Phase-2 independent section loading, 47101d57

**D8 wiring pushed; full phase 2 remains in progress.** `TaskTracker.section` delays the shape by 300 ms and holds its actual visible start for at least 500 ms, even on failure. Agents uses two approved rows, item-sharing one, history two. Each has three finite shimmer passes and static reduced motion. Refresh retains existing content. Agents failures offer local Retry; history list failure keeps prior versions and offers Retry. Sharing Retry reloads only its listing, keeps editable expiry/method choices and never creates a grant. Request identities discard late Agents/history replies, including a closed/reopened sheet for the same note.

| Check | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\tasks.test.ts packages\core\test\agents-app.test.ts packages\core\test\note-history.test.ts packages\core\test\share-manage.test.ts` | Passed: 60 tests. Measured 299/300 ms reveal and 499/500 ms minimum boundaries; fast/no-shape, failed minimum, retained history, late replies and failed-sharing Retry retaining expiry |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm check` and `pnpm ui:check` | Passed, no inherited static findings remain |
| `pnpm --filter @focus-notes/desktop run build` | Passed, rebuilt at exact pushed head before candidate creation |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "section loading"` | Passed: approved Agents row anatomy, exactly three passes, static reduced motion, old content retained during failed refresh and Retry. Only that read handler was faked; no real account/network writes |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at `47101d57`: normal Settings/project/reading/upload refusal/Retry, AI empty first action, real Agents data and filtered Open/Clear search inspected invisibly |
| Slate `runtime-host.mjs check --repo . --host documentations` from the worker folder | Passed for the updated wait inventory |

The touched Agents Undo test still assumed errors were appended after success; corrected its assertion for the already-built error-first queue. The existing 10,000-note sharing test caught a draft-input lock while preparation ran; removed that lock, preserving editable input while only share creation waits. All focused checks then passed. Every started app was invisible, closed, and followed by PID-scoped `-WhatIf` then actual cleanup.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\47101d57\Open review build.cmd`. Settings → AI → Add connection/Cancel; Open → unmatched search → Clear search; Settings → Agents. Full desktop journeys through delayed sharing/history are still absent; individual history-version/restore recovery and other D1–D7 gaps remain. No full suite, CI wait, benchmark or app merge ran.

### Phase-2 theme and Reading font, e643bd48

The theme gallery and Reading font menu now use the approved commit track. Failed drafts remain local to Settings; the actual note retains its stored theme/font. Retry remembers the failed theme even after keyboard previewing another tile. Revert writes nothing. Choosing an opposite-scheme theme stores its slot and appearance mode together, avoiding a partially saved theme selection. Unknown theme/font values fail rather than claim success. MenuButton and IconButton support the existing own-border progress, outcome and reduced-motion treatment.

| Check on `e643bd48` | Result |
| --- | --- |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm exec vitest run packages\core\test\theme-manager.test.ts packages\ui\test\commit-controls.test.tsx` | 26 passed: atomic scheme/slot write, retained draft, one named confirmation, write-free Revert, retry after preview, stable pending focus, inert compact triggers and keyboard preview without saving |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "theme and font choices"` | Passed: real storage refusal, stored note unchanged, theme Retry after another preview, font Revert/Retry and persistence after reopening |
| `pnpm check` and UI schema regeneration | Passed: no view findings, fixture gaps or stale generated output |

Journey apps were invisible, closed, and followed by own-PID cleanup (`-WhatIf`, then actual). No full suite, CI wait or app merge ran. GitHub rejected two ordinary non-thin pushes with `Internal Server Error`; a subsequent ordinary push of `b6375b3a` persisted this increment too. The refreshed candidate below includes both worker-6 commits.

### Phase-2 compact focus and docking, b6375b3a

The existing Focus mode toolbar button, Files pin and contents pin use the same own-border commit treatment. Roomy menu rows keep inline marks; Retry remains outside compact controls, in the existing notification. Persistence completes before the acknowledged value changes. Files previously discarded its persistence promise; refusal now surfaces and leaves the saved docking unchanged. Retry carries the original intended boolean, so an old Retry cannot toggle an already-correct setting backwards. Pending locks only its own command. These compact setting actions keep the toolbar open for feedback, without changing ordinary outside dismissal or adding writing-window elements.

| Check on `b6375b3a` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\settings-failures.test.ts packages\core\test\files-app.test.ts packages\core\test\outline.test.ts packages\ui\test\commit-controls.test.tsx` | 48 passed: refusal keeps stored values, exact-value Retry, duplicate-write lock, outline behavior and shared compact feedback |
| `pnpm exec vitest run packages\core\test\menu-bar.test.ts packages\core\test\files-menu.test.ts -t "sends the menu bar\|the pin keeps\|pinned from closed\|Mod\+O doesn\|docked \(D-187\)"` | 5 passed, 35 skipped: pending menu availability and existing Files docking behavior |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm --filter @focus-notes/desktop run build` | Passed; output copied into the exact-head candidate after committing without further source edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "compact focus and docking"` | Passed: real state-file write refusal on all three controls, old value retained, outside Retry persists the intended value, note bytes unchanged |
| `pnpm check`, UI schema regeneration and component inventory | Passed, 773 documents, 82 components, 693 commands |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs --retry-inspection` | Passed at exact pushed head `b6375b3a`: theme/font, Focus mode, Files docking and contents docking reached through normal UI, alongside previous project/slider/empty-state paths |

The initial candidate inspection assumed Focus mode defaulted to Off; the app defaults to On. Its synthetic fixture now explicitly starts Off, then verifies On. The initial compact journey was obstructed by the existing project-renaming notice; it now dismisses that notice through its real button. Candidate and journey apps were invisible, closed and followed by own-PID cleanup.

**Unrelated inherited checks, not acceptance:** the broader six-file unit selection exposed existing Files menu pin-item/source expectations, notification ordering and native-menu command inventories; the exact affected cases above pass. Three old `m1-toolbar.spec.ts` UI-07 journeys stop before any compact action because their empty-start fixture no longer supplies the expected Note textbox. Their toolbar visibility expectation was updated for the deliberate behavior, but those journeys are not claimed green. No full suite, CI wait, merge or unrelated repair ran.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\b6375b3a\Open review build.cmd`. Settings → Appearance → theme manager → Themes/Reading; then toolbar Focus mode, Files → Dock Files, More → Dock contents. Font size, AI save groups, notification acceptance, remaining recovery/streamed work and independent delayed history/share journeys remain in progress.

### Phase-2 Reading size, 399bd9c9

The existing size row reuses one inline CommitMark beside its number, not two competing button indicators. The attempted formatted size remains visible after refusal while the actual note keeps its acknowledged size. Smaller/Larger remain focusable but inert during their group's pending write; unrelated settings stay available. Retry saves the exact retained value even if another action has since reached a size boundary. Revert writes nothing. Menu and shortcut commands use the same commit lane, and font-size reset changes only size, not paragraph spacing or other reading choices.

| Check on `399bd9c9` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\theme-manager.test.ts packages\core\test\settings-failures.test.ts` | 29 passed: retained formatted draft, unchanged acknowledged note, exact Retry after another size change, write-free Revert, reset, invalid-value refusal and pending-group isolation |
| `pnpm exec vitest run packages\core\test\toolbar.test.ts -t "a setting keeps"` | 1 passed: size feedback keeps the toolbar open; an unrelated normal action still closes it |
| `pnpm exec vitest run packages\core\test\roots-app.test.ts -t "settings"` | 3 passed: workspace reading-setting synchronization remains intact |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm check` and UI schema regeneration | Passed, 773 documents, 82 components, 694 commands |
| `pnpm --filter @focus-notes/desktop run build` | Passed at the final source state |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Reading size"` | Passed: real storage refusal, retained output, unchanged actual editor size, exact Retry, write-free Revert, unrelated spacing preserved and reopened setting retained |

The journey waits for failure before repairing its synthetic blocked file; a visible draft alone is not proof the write has failed. No uncommitted draft is announced as saved. The invisible app closed and own-PID cleanup ran. No full suite, CI wait or merge ran. The candidate remains `b6375b3a`; it does not yet include `399bd9c9`.

**Try it after the next candidate refresh:** Settings → Appearance → theme manager → Reading → Smaller/Larger text. AI groups, full notification acceptance, recovery and streamed operations remain in progress.

### Phase-2 notification acceptance increment, 0db24cb0

The host now carries success, warning and progress as well as info/error. A progress outcome stays until replaced; replacing it with success resets the repetition count and starts the success lifetime. Errors, recovery actions and explicit decision warnings remain hard-dismiss outcomes. A notice that actually wraps receives `wait.noticeLong` (8 seconds) rather than the ordinary 6 seconds, preserving elapsed visible time rather than restarting its clock.

Recovery now keeps its original pill until the action succeeds, with only that action inert and own-border pending feedback. Failed Retry preserves the original command, arguments and coalescing subject. Notification dismissal/recovery restores its connected prior field, and F6 captures one notification ID instead of handing an old request to whichever pill happens to become first.

| Check on `0db24cb0` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\notifications.test.ts packages\core\test\settings-failures.test.ts packages\ui\test\notification-layer.test.tsx packages\ui-runtime\test\failures.test.tsx` | 25 passed: priority/limit, coalescing, hard dismiss, visible clocks, 8-second extension, progress-to-success replacement, retained Retry, captured F6 target and focus restoration |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm check`, UI schema regeneration and component inventory | Passed, 774 documents, 82 components, 695 commands |
| `pnpm --filter @focus-notes/desktop run build` | Passed at final source state |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "four writing outcomes\|actually wrapped\|notification Retry stays"` | Initial run: 2 passed / 1 failed. Four-outcome and modal journeys passed; the wrapped fixture still consumed real time between clock calls. After pausing before triggering it, that case passed separately below |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "actually wrapped"` | Passed: real multi-line geometry, visible after 6 seconds and 7,999 ms, absent at exactly 8,000 ms |
| Final combined rerun of the three-case selector above on the unchanged pushed head | All 3 passed together (13.7 seconds); own-PID cleanup ran after each case |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs --retry-inspection` | Passed at exact pushed head `0db24cb0`: all worker-6 normal UI paths, Reading size, warning and repeated failed Retry followed by successful recovery and editor focus |

The four-outcome journey uses an actual refused setting, the unsupported-underline warning and two successful Replace all operations. Dismissing a pill reveals the queued outcome; a second refused Retry stays usable; success returns to the note with its expected text intact. These journeys uncovered the retained-Retry and F6-target bugs above, not just fixture issues. Wrapped timing is measured from a paused renderer clock: elapsed real test-run time is not counted as part of the promised 8 seconds.

Candidate and journey apps were invisible, closed and followed by own-PID `-WhatIf` and actual cleanup. No full suite, CI wait or merge ran. **D1 is still partial:** overlapping hover/focus causes need their own combined-state proof/fix; withdrawal still requires same-link restoration evidence or the irreversible confirmation. AI groups, remaining recovery/streamed work, complete empty-state acceptance and delayed history/share journeys remain in progress.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\0db24cb0\Open review build.cmd`. Reading → Smaller/Larger text; while writing, an unsupported underline shows a warning. The separate journey injects the refused writes; the candidate contains only synthetic data.

### Phase-2 overlapping notification pauses, b68775f8

Hover and focus now pause a notification independently. The primitive reports only a change in their union, so leaving hover while a button remains focused, or leaving focus while hovering, cannot restart the timer. Focus moving between the pill's buttons also keeps the pause.

| Check on `b68775f8` | Result |
| --- | --- |
| `pnpm exec vitest run packages\ui\test\notification-layer.test.tsx packages\core\test\notifications.test.ts` | 10 passed; both overlap orders, internal focus movement, retained queue clocks and focus restoration |
| `pnpm --filter @focus-notes/ui --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "notification lifetime stays paused"` | 2 passed: actual hover/F6 focus, 8 seconds with one cause remaining, then visible at the retained 4,999 ms and gone at 5,000 ms; note bytes unchanged |
| `pnpm check` | Passed, including generated component inventory and `ui:check` |

Both apps ran invisibly, closed and received own-PID cleanup (`-WhatIf`, then actual). The gallery migrated to fresh worker folder 7, HTTP 200 verified; only folder 6's verified gallery process was stopped, then its clean inactive folder removed. Candidate `0db24cb0` remains the latest inspected build until the next refresh. Withdrawal confirmation and AI groups are next; phase 2 is not complete. No full suite, CI wait or app merge ran.

### Phase-2 irreversible withdrawal, 46c0cb31

The existing access format rejects edits to a withdrawn grant. A subsequent share creates a different ID/link, so Undo cannot honestly restore the same link. The existing item and Settings confirmations remain; both now say that withdrawal cannot be undone and sharing again creates a new link. The publication delay and downloaded-copy limitation remain explicit. No vault or grant restoration mechanism was added.

| Check on `46c0cb31` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\share-manage.test.ts packages\seal\test\access.test.ts` | 68 passed; confirmation before mutation, cancel safety, refused reactivation and new-link identity |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed; desktop repeated after final journey edits |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test item-sharing.spec.ts --workers=1 -g "SHR-16: first copy"` | Passed: real local sealing/publication, safe default Cancel, explicit irreversible consequence, cancelled grant unchanged, confirmed withdrawal, old link rejected after publication and exact pre-withdrawal note bytes kept |
| `pnpm check` | Passed |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs --retry-inspection` | Passed at exact pushed `46c0cb31`: existing project/Reading/compact/empty paths, retained Retry, actual wrapped notification overlap, final editor focus; invisible app closed and own-PID cleanup ran |

The initial sharing fixture opened the new Open surface without a selected note; it now explicitly selects its synthetic Hello note. The second assertion compared the note to its pre-publication text instead of retaining the ID assigned by publication; corrected to compare exact bytes immediately before withdrawal. The final journey passes. Candidate timing inspection initially left its pointer over the newly created pill after dismissing an earlier notice; moving it back to the editor before starting the clock measurement fixes the fixture. The candidate uses the standard renderer focus emulation, never OS focus.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\46c0cb31\Open review build.cmd`. Notification overlap and the prior settings/Reading paths are inspected; withdrawal's proof is the separate synthetic sharing journey, not a real account. D1's requested irreversible alternative is verified. AI groups, remaining recovery/empty/streamed work and complete delayed history/share journeys remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 independent AI details and checked key, 42e06fc0

The approved Connection details and Access key groups are now wired independently. Detail fields save on blur/Enter through the existing commit track, including its 200 ms pending/confirmed floors, retained attempted values and scoped Retry/Revert. Only the committing field locks. Provider choice persists its defaults, including ready Copilot defaults; discovery persists its actual endpoint/model and reuses a partial connection on Retry instead of requiring a removed full-form Save.

The separate **Save key** sends only a synthetic connection test, then stores the sealed key after the provider accepts it and storage succeeds. A name can still save during that check. Refusal preserves the previous key and the same-destination entry in the local password component; Retry resends that local entry, while Revert writes nothing. Raw keys never enter view models, commit values, generic retained retries or logs. A changed destination clears its local entry; a check begun for older details cannot attach its result to the changed configuration. An incomplete saved connection cannot send note text or silently become the Writer.

| Check on `42e06fc0` | Result |
| --- | --- |
| `pnpm exec vitest run apps\desktop\test\ai-commits.test.ts apps\desktop\test\ai-rewrite.test.ts apps\desktop\test\ai-own-key.test.ts packages\core\test\ai-app.test.ts packages\ui\test\secure-key-field.test.tsx` | 75 passed: independent/ordered detail writes, first-connection identity, retained failures, provider/default/discovery paths, synthetic checking before storage, sealed-only results, wrong-key/storage refusal, changed-destination rejection, local entry clearing, existing Writer semantics and OpenAI/Anthropic Rewrite through protocol fakes |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed; desktop repeated after final journey edits |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 777 documents, 82 components, 706 commands; related schemas and component inventory regenerated |
| `pnpm --filter @focus-notes/desktop run build` | Passed at final runtime source state |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "AI details commit independently\|known-empty wrappers"` | Both passed together: actual failed detail/independent neighbour/Retry, held synthetic key check with independent name save, provider 401, real storage refusal, retained key/Retry/Revert, successful sealed replacement, no note text in probes, exact note bytes, destination clearing, AI Add-to-content replacement and Open/Clear search |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at exact pushed head: previous project/Reading/compact/notification paths plus separate AI groups, persisted compatible-service choice and unavailable key Save; no provider request in candidate inspection |

The first-action fixture initially queried an uncheckable menu role; it now uses the real checkable service item. The key journey checks the button's existing border-progress child, not a nonexistent button attribute. Final scoped tests and journeys pass. Candidate and journey apps were invisible, closed and followed by own-PID cleanup, first `-WhatIf`, then actual.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\42e06fc0\Open review build.cmd`. Settings → AI → Change shows the separate groups. Enter details and leave a field to save it; a key requires its own Save. The candidate contains no real key or usable provider. Remaining recovery, complete empty-state acceptance, streamed work and independent delayed/failed history/share journeys remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 scoped Open recovery, cf5859a2

Open now keeps its error, expanded safe Details, query and old entries while only Retry is inert. List, open, pin and reveal failures retain the original command and arguments. Safe Details and diagnostics use only the existing whitelisted operation code, never the raw exception or path. Successful recovery returns focus to search. Closing/reopening invalidates old list replies. A successful pin followed by failed list refresh retries the list, not the completed toggle; cancelled pickers clear obsolete recovery.

| Check on `cf5859a2` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\project-open.test.ts packages\ui\test\status-row.test.tsx` | 11 passed: retained list/query, exact original targets, pin partial-success safety, stale-list guard, cancelled picker, mounted recovery/Details/focus and correct idle/pending button names |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed; desktop repeated after final journey edits |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 778 documents, 82 components, 708 commands; Open gallery data and related generated files updated |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final runtime edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Open retries the failed action"` | Passed: controlled list/open/pin IPC failures, held Retry with retained query/content/expanded Details, search focus after success, one pin despite a failed post-write list, exact note bytes and unchanged writing content |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at exact pushed head; earlier settings/Reading/compact/notification paths plus separate AI groups, actual Agents and filtered Open |

The journey caught the shared busy helper's persistent outcome-label semantics: passing pending words at rest incorrectly named the button “Trying again…”. StatusRow now passes them only while pending, with a unit assertion for the restored Retry name. Journey and candidate apps were invisible, closed and followed by own-PID `-WhatIf` and actual cleanup.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\cf5859a2\Open review build.cmd`; Ctrl+Alt+O opens the retained-content surface. Controlled failures are in the scoped journey, not permanently injected into this candidate. This is not complete D6 acceptance: New project and Local import need partial-success-safe recovery; same-project note-read failure propagation, history/broken-image recovery, complete task timing, empty/streamed work and independent delayed history/share journeys remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 partial-safe New/Local recovery, 651b1340

New project's completed `created` receipt is retained: a failed Open retries only that project, never creation. When creation itself fails before returning a receipt, setup may already exist; recovery keeps the choices and offers a location change instead of pretending creation can safely be replayed. A cancelled location picker leaves that error and draft intact.

Local import retains the original note, target and request ID through Retry. The desktop stages a complete file in the chosen destination, then publishes it with an exclusive hard link; collisions are never overwritten and a partial staging write cannot appear as a Markdown note. Completed in-session requests return their original copy receipt, including after a lost reply or concurrent Retry. Failed staging is cleaned before Retry. Unsupported hard-link destinations fail visibly rather than falling back to an unsafe partial write. The source note is never removed.

| Check on `651b1340` | Result |
| --- | --- |
| `pnpm exec vitest run apps\desktop\test\local-import.test.ts packages\core\test\project-open.test.ts` | 19 passed: lost/concurrent acknowledgement, one completed copy, exact original target/request, collision safety, partial staging and link refusal/cleanup, listing recovery, retained project choices and non-repeated creation |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed after final journey edits |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 778 documents, 82 components, 710 commands; generated output current |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final runtime edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "New project and Local import recover"` | Passed: actual destination refusal, same-sheet Retry, one byte-exact imported note and unchanged source; controlled creation/Open refusal with retained choices, held Retry and exactly one creation |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Passed at exact pushed head; earlier settings/Reading/compact/notification paths plus separate AI groups, actual Agents and filtered Open inspected invisibly |

The first journey reached and recovered Local import, then used “New project” instead of the real “New project…” label. Corrected the selector and the combined journey passed. Apps were invisible, closed and followed by own-PID cleanup (`-WhatIf`, then actual). Worker 8 verified both npm and pnpm Microsoft feeds, installed fresh dependencies/tokens, migrated only folder 7's verified gallery process to folder 8 and verified HTTP 200 before removing the clean inactive predecessor.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\651b1340\Open review build.cmd`. Recovery failures are injected only in the scoped journey. This slice does not claim crash-persistent import receipts, resumable partial project setup or D7 streaming. Same-project note-read failure propagation, complete tracker/timing, history/broken-image recovery, complete empty-state acceptance and independent delayed history/share journeys remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 same-project Open acceptance and waits, 8f1fb690

Open now treats a same-project note read as accepted only when the loader returns success. A rejected read keeps the acknowledged note, Open, its query and its exact Retry target mounted. Retry closes Open only after the actual note text loads. Failure to remember the next-launch path is separately reported after an accepted read; it no longer mislabels an already-open note as a failed Open. External open-note events keep their existing error presentation.

Open list, launch/file/project picker, pin and reveal operations use named task-tracker entries with `fn:project.list`, `fn:project.open`, `fn:project.pin` and `fn:project.reveal` measures. The list's skeleton is absent before 300 ms and remains for at least 500 ms once shown, including failed reads; refresh keeps old entries. Long pending labels include elapsed time after 3 seconds. Closing/reopening invalidates presentation work: an obsolete launch cannot close the new Open, and a late post-pin list or error cannot replace its results.

| Check on `8f1fb690` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\project-open.test.ts packages\core\test\tasks.test.ts packages\core\test\app.test.ts` | 38 passed: read refusal/Retry, metadata-only refusal, exact 300/500 ms boundary, fast-list absence, exact named success/failure measures and obsolete launch/post-pin replies |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed on final source |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 778 documents, 82 components, 710 commands; generated output current |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final runtime edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "same-project Open\|Open retries the failed action"` | 2 passed on final source: actual same-project read rejection preserves the ready note and dialog; held Retry loads the target before closing. Existing scoped recovery still preserves Details/query and never repeats a completed pin |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Exact pushed head built, inspected invisibly through the earlier normal settings/Reading/compact/notification/AI/Agents/Open paths and closed |

Both journeys and candidate inspection ended with own-PID cleanup (`-WhatIf`, then actual). No OS input, live account, full suite, CI wait or app merge ran. The action-generation guards cover Open presentation, not every concurrent note-loader race.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\8f1fb690\Open review build.cmd`. The failed-read journey injects only its controlled target, not a permanent failure in the candidate. History/broken-image recovery, complete D5 and D8 acceptance, streaming, crash receipts and tracker coverage outside Open remain in progress.

### Phase-2 history recovery and independent section, ef03a581

History now retains the previous list and chosen preview on failure. Retry repeats the exact failed initial read, older page or version, not a fresh history request that discards loaded pages. The error and safe Details remain mounted while its action is inert. List and first-preview shapes use the shared 300 ms delay and 500 ms visible minimum. Back/close invalidate pending version reads.

Restore first saves the current draft; refusal never replaces it. A failed restored save leaves the preview/sheet and unsaved restored text available, retaining the original Undo snapshot across Retry. If the person edits after that refusal, Retry reviews the version again before a new explicit Restore, never overwriting the new draft. Restore and Undo announce success only after their save acknowledgement; failed Undo retains its exact save target and offers Retry. All read/restore/Undo diagnostics use fixed operation names and known error codes, never raw exception text or note paths.

| Check on `ef03a581` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\note-history.test.ts packages\core\test\history.test.ts packages\core\test\tasks.test.ts` | 33 passed: exact older-page/version Retry, retained preview, safe Details, exact first-preview 300/500 ms timing, obsolete Back response, pre-restore save refusal, changed-draft protection and original Undo retention across failed saves |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed on final source |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 778 documents, 82 components, 711 commands; generated output current |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final tracker edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "History delays its own section"` | Passed on final source: real local Git history, held/failed list and version reads, independent shapes and Retry, actual restored/Undo disk writes refused then accepted; no success before the saved text. Two measures each for `fn:history.list`, `fn:history.version`, `fn:history.restore` and `fn:history.undo` |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Exact pushed head built, earlier normal settings/Reading/compact/notification/AI/Agents/Open paths inspected invisibly and app closed |

The initial fixture had no selected note; it now explicitly selects its synthetic note. The old Spotlight lookup did not expose history in this fixture, so the journey uses the normal toolbar More menu rather than widening into search repair. It also caught a persistent busy-label error: idle restore labels must be empty, with pending/elapsed words derived from the tracker. Fixed and covered by units before the final passing run. Every run closed its own invisible app and performed own-PID `-WhatIf`, then actual cleanup.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\ef03a581\Open review build.cmd`; toolbar More → Note history. Failures are injected only in the scoped journey. This accepts the independent delayed/failed history slice, not all D8: share-item proof, broken-image recovery, complete D5, streaming, crash receipts and remaining tracker coverage are still in progress. No full suite, CI wait or app merge ran.

### Phase-2 broken-image recovery, cd0cede9

The approved ImageFrame is now wired to actual file-read and browser-decode failures. Its alt, error and local Retry remain mounted during recovery; only that action is inert. Keyboard Retry retains focus through another refusal. Recovering one image does not disable another. Distinct failures coalesce into one retained notice per note; repeated failure of the same image does not add another notice/count.

Image sources now have their own checked list shape with explicit pending/failed fields, not colour-value items or an empty-string-only failure signal. Retry bypasses a failed cache entry without rereading successful images. Read replies check both path and document key; per-request tokens prevent an obsolete completion from releasing a newer same-source read. Native decode errors carry their document key and exact cached value, so an old error cannot mark a replacement broken. Destroyed/obsolete editor nodes do not initiate reads for the new note.

| Check on `cd0cede9` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\images-app.test.ts` | 6 passed: coalesced distinct failures, no repeat notice, exact scoped Retry/deduplication, retained failed state, 300/500 ms task boundaries, same-path generation/token isolation, obsolete failure suppression, invalid source/decode and old-value rejection |
| `pnpm --filter @focus-notes/core --filter @focus-notes/ui --filter @focus-notes/ui-runtime --filter @focus-notes/desktop run typecheck` | Passed on final runtime/journey source |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`, `node tools\component-inventory.mjs --write` and `pnpm check` | Passed: 779 documents, 82 components, 713 commands; typed image list, retrying ImageFrame fixture, component inventory and committed UI schemas current |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final runtime edits |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Broken images keep their alt"` | Passed: actual missing PNG and corrupt PNG decode, two alt/Retry frames with one notice, held keyboard Retry/refusal with retained focus and no notice growth, independent successful recovery to two decoded 128 px PNGs; note and final image bytes unchanged by the app; five `fn:image.read` measures |
| `node E:\Projects\side-projects\focus-notes-work\scratch\ui-states-candidate.cjs` | Exact pushed head built, earlier normal settings/Reading/compact/notification/AI/Agents/Open paths inspected invisibly and app closed |

The gallery fixture's busy label initially used a raw text value where the checked contract requires a message/read. It now uses the existing localized Retry words; regeneration and static gates passed. The new image diagnostics log only a fixed operation and known error code. This is read/recovery evidence, not an end-to-end decode performance benchmark or new image-editing acceptance.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\cd0cede9\Open review build.cmd`; in a synthetic note, reference an unavailable image, restore its file and choose its Retry. The controlled journey also tests a corrupt image and another refusal. All app runs were invisible and ended with own-PID `-WhatIf`, then actual cleanup. Complete D5, share-item D8 proof, streaming, crash receipts and remaining tracker coverage are still in progress. No full suite, CI wait or app merge ran.

### Phase-2 owner review launch, cd0cede9

The owner asked for the most complete reviewable app immediately, before the next implementation slice. Both implementation heads were clean/pushed. `git merge-base --is-ancestor origin/vq-open-cards HEAD` succeeded at exact `cd0cede9bb538495c982f9fe73fb6162a232c1a0`; latest Open head `34fa5dea` is already included, so no consolidation merge was required. The previously built exact-head candidate was reused, not replaced with a dirty build.

| Check | Result |
| --- | --- |
| `node E:\Projects\side-projects\focus-notes-work\preview\candidates\cd0cede9\review-launch.mjs --inspect` | Passed: invisible normal-UI Project/AI settings, Open, local-only GitHub repository list and Open file using a synthetic file-picker selection; inspection closed, own-PID `-WhatIf` then actual cleanup |
| `Open review build.cmd` | Launched visibly for the owner with a fresh `owner-review-profile`; process/window verified and local stand-in `/user/repos` returned HTTP 200 |
| Additional suites/CI | Not run, as requested for this priority launch; no runtime source or dependency changes, no app merge to main or release |

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\cd0cede9\Open review build.cmd`. Project/Reading settings and AI groups include all pushed phase-2 increments. Open from GitHub lists `review-user/example-notes` and clones only from the candidate's local bare repository; no real account is connected. The visible owner instance is explicitly exempt from ordinary inspection cleanup and stays open. This launch does not accept outstanding D5/D7/share-item D8 work.

### Phase-2 share-item independent section, 2ce9b22d

The share-item list now has delayed/failed desktop evidence independent of Agents and history. Retry retains the existing error row while only its action is inert; expiry and method choices stay editable. Successful reads clear the original failure. A failed refresh keeps acknowledged history instead of replacing it with a loading shape; closed/reopened item generations reject old results. Preparation uses the named `fn:share.item.prepare` task measure; diagnostics contain only the known error code.

| Check on `2ce9b22d` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\share-manage.test.ts packages\core\test\tasks.test.ts` | 40 passed: exact 300/500 ms shape timing, held error during Retry, editable expiry, retained history, no grant mutation and rejected late closed-item reads |
| `pnpm --filter @focus-notes/core run typecheck`; `pnpm --filter @focus-notes/desktop run typecheck` | Passed; desktop repeated after final journey correction |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`; `pnpm check` | Passed: 779 documents, 82 components, 713 commands; no stale generated files |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Share item delays its own section"` | Passed: held/refused real sharing-read handler, finite/static reduced-motion shapes, retained editable choices and history through Retry, four named measures, no access mutation, unchanged note bytes |

The first journey tried finding the selected private note in an unopened Files tree; the final fixture uses the normal toolbar More → Share action and passes. The invisible test app closed with own-PID `-WhatIf`, then actual cleanup; the expressly requested owner-review instance remained open and untouched.

**Try it after the next candidate refresh:** Share a synthetic note, change its expiry while preparing, and inspect its existing sharing history. Controlled failures belong only to the scoped journey. The currently open owner review remains the earlier `cd0cede9`; this slice is pushed but not in that running instance. Complete D5, D7 streaming/crash receipts, remaining tracker coverage and any remaining static/hover acceptance are still in progress. No full suite, CI wait or app merge ran.

### Phase-2 Files known-empty and first action, 6218b99d

Files no longer labels a collapsed nonempty root as empty. A filtered query checks actual matching content, independently of collapsed roots. Initial listing is now a named read task: unknown and failed reads cannot show the empty wrapper; failure offers scoped Retry with safe copy, retains its error while retrying and logs only a known diagnostic code. Watcher events and acknowledged note saves are queued over the scan snapshot, including bridges without watchers. Retry itself never writes a note.

| Check on `6218b99d` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\files-app.test.ts packages\core\test\workspace-app.test.ts packages\core\test\workspace-names.test.ts packages\core\test\tasks.test.ts` | 68 passed: collapsed/filter/unknown/failure distinctions, read-only Retry, duplicate Retry exclusion, retained watcher events and acknowledged saves, existing names and task timing |
| `pnpm --filter @focus-notes/core run typecheck`; `pnpm --filter @focus-notes/desktop run typecheck` | Passed; desktop repeated after final journey selectors |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`; `pnpm check` | Passed: 779 documents, 82 components, 714 commands; generated files unchanged |
| `pnpm --filter @focus-notes/desktop run build` | Passed after final save-queue correction |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Files distinguishes collapsed content"` | Passed: collapse retains nonempty truth, filtered empty clears its query, removing only the synthetic fixture note reveals known-empty, its own New note action fills the same connected Files body, one named listing measure |
| Exact pushed-head candidate inspection | `6218b99d` inspected invisibly through existing project/Reading/compact/notification/AI/Agents/Open flows and new collapsed/filtered Files; closed, own-PID `-WhatIf` then actual cleanup |

Two regressions failed before implementation. Early journey attempts corrected a missing last-note fixture, model-selection rather than DOM-focus navigation, the SearchField role and the empty action's visible text selector; the final unchanged-runtime repeat passed. No unrelated empty-start repair was made. Candidate inspection helper initially had a duplicate local declaration; fixed before it started an app. All started inspection/test instances closed; the explicitly requested `cd0cede9` owner instance stayed open.

**Try it:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\6218b99d\Open review build.cmd` includes all prior slices and the local GitHub stand-in. Collapse Files, search for an absent title, then Clear search. The synthetic first-note replacement and refused listing Retry belong to scoped evidence, not the owner's notes. This is bounded D5 evidence, not acceptance of every empty/all-done surface or an independent delayed initial-scan journey. Recently-deleted read failure/good-news treatment, other first actions, D7 streaming/crash receipts, remaining tracker coverage and hover/static acceptance remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 owner review refresh, 6218b99d

The owner's priority direction at 20:23 stopped the next implementation slice for an immediate latest combined launch. After `git fetch origin --no-recurse-submodules`, exact `git log vq-ui-states..origin/vq-open-cards` returned no commits: Open cards are already included in pushed `6218b99d80d9c7783cb271204d2f2a81f84d83b3`. No merge, source change or additional build was needed; the exact candidate already built and inspected at 20:19 was reused without rolling back image recovery.

| Check | Result |
| --- | --- |
| `node E:\Projects\side-projects\focus-notes-work\preview\candidates\6218b99d\review-launch.mjs --inspect` | Passed again: normal Project/AI settings, Open, local-only GitHub repository list and Open file with synthetic picker selection; invisible inspection closed with own-PID `-WhatIf`, then actual cleanup |
| `E:\Projects\side-projects\focus-notes-work\preview\candidates\6218b99d\Open review build.cmd` | Separate visible owner-review instance left open; actual Electron PID 51232, launcher parent 55868, exact candidate command verified; loopback `/user/repos` returned HTTP 200 |
| Earlier owner instance | PID 51996 and parent 60712 remain open and untouched; neither was silently replaced |
| Suites/CI/app merge | Not run: priority launch reused exact verified output, with no runtime changes |

**Try it:** the launcher above includes Open file/Open from GitHub, broken-image recovery and all later sharing/Files slices. The GitHub list is a synthetic loopback stand-in with a local bare repository, not a real account. This expressly requested visible instance stays open. Phase 2 remains in progress; the launch does not accept remaining D5/D7 or hover/static work.

### Phase-2 Recently deleted honest states, 71e94423

Recently deleted distinguishes unknown, loading, failed and acknowledged empty results. A failed first read never says Nothing deleted; refresh failure keeps acknowledged rows. Read-only Retry retains its error, locks only that action and cannot restore or delete notes. Closing/reopening invalidates old results; successful Restore invalidates the old read too. The shared named section task supplies exact 300/500 ms shape timing and `fn:history.deleted`. Diagnostics contain only the fixed operation and known code. A refused Git log now rejects the listing instead of silently returning a partial/empty result.

The approved success StatusRow replaces both bare empty-history branches, gated on a successful empty read. The colour editor's existing All colours pass branch also uses the approved success row. No writing-window element, new workflow or destructive replay was added.

| Check on `71e94423` | Result |
| --- | --- |
| `pnpm exec vitest run packages\core\test\files-app.test.ts -t "Recently deleted known-empty"` before implementation | All 3 new regressions failed: failure became empty, refresh discarded rows and the first shape appeared before 300 ms |
| `pnpm exec vitest run packages\core\test\files-app.test.ts packages\core\test\tasks.test.ts` | 36 passed: retained rows/error, duplicate Retry exclusion, read-only recovery, late closed/reopened result rejection, exact 299/300 and 499/500 ms boundaries, real task measure and existing Files behavior |
| `pnpm exec vitest run apps\desktop\test\git-conflicts.test.ts -t "FIL-10: Recently deleted"` | 3 passed: real Git listing/restoration and controlled log refusal followed by acknowledged empty history |
| `pnpm --filter @focus-notes/core --filter @focus-notes/desktop run typecheck` | Passed on final runtime/journey source |
| `pnpm --filter @focus-notes/ui-runtime exec node src\cli\ui-check.ts --write`; `pnpm check` | Passed: 779 documents, 82 components, 715 commands; generated schemas unchanged |
| `pnpm --filter @focus-notes/desktop run build` | Passed |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Recently deleted never calls failed history empty"` | Passed: real Git history behind held/refused IPC, no false empty during loading/failure, retained rows/error through Retry, actual restoration, then successful empty read shown as good news in the same connected Files body; 5 named measures and unchanged existing note bytes |

An intermediate measurement assertion ran under mocked performance; moved it to the real-clock failure/Retry unit. Static validation required both repeat fallback branches; each is now gated on acknowledged empty state. A nonexistent command metadata property was replaced by the existing Spotlight exclusion mechanism. Final focused checks passed. The invisible journey closed and received own-PID `-WhatIf`, then actual cleanup; both explicitly requested owner-review instances stayed open.

**Try it after the next candidate refresh:** Files → Recently deleted. The currently visible owner review is still `6218b99d`; this increment is pushed, not silently installed into that running app. Complete D5 first actions, independently delayed initial Files, D7 and hover/static acceptance remain in progress. No full suite, CI wait or app merge ran.

### Phase-2 independent initial Files scan, b830a17c

A test-only entrypoint wraps the existing IPC registration before importing the unchanged built main entrypoint. It holds the actual first-ever workspace scan, then refuses that read; no renderer reload, replacement application state, production test hook or live account is involved. A second held request delegates to the real scan. The note remains open throughout.

| Check on `b830a17c` | Result |
| --- | --- |
| `pnpm --filter @focus-notes/desktop run typecheck` | Passed |
| `pnpm check`; `git diff --check` | Passed; 779 documents, 82 components, 715 commands |
| `FOCUS_NOTES_E2E=1` with `pnpm --filter @focus-notes/desktop exec playwright test ui-states.spec.ts --workers=1 -g "Files initial scan is independent"` | Passed: real first-scan held/refused before any successful listing; three section shapes, bounded three-cycle shimmer and static reduced motion; no false empty; safe local error, held Retry, editable retained filter and editor; actual notes after Retry/Clear search, same connected Files body, two `fn:workspace.list` measures and exact unchanged note bytes |
| Build | Reused the final runtime build verified for `71e94423`; this increment changes only journey code and its test launcher helper |

The initial test expected six shapes and different copy; corrected it to the approved three-shape Files section and existing message. The final journey passed in 4.7 seconds. Its invisible app closed and own-PID `-WhatIf`, then actual cleanup found no leftovers. Both expressly requested visible owner instances stayed open. Complete D5 first actions, D7 and hover/static acceptance remain in progress; no full suite, CI wait or app merge ran.

## Projects and simpler sharing

**MP design approved for projects, Files, Local notes and images (owner, 3 November 19:39: "The UI and UX looks good"); sharing and publishing approved at the same time, with MP.26 to MP.29 holding the built surfaces to those mocks (D-335). No implementation acceptance is claimed.** These rows define the future evidence, not tests to run before design approval. [Projects](../experience/projects.md), [Sharing](../design/views/sharing.md) and [the implementation plan](implementation-plan.md#mp) own the flows.

**Owner acceptance, 3 November 13:35:** all six follow-up product choices are accepted, including indefinite public Git history, keeping the site repository, opaque shares, personal-account invites, UX-led naming migration and proportionate browser retirement. Evidence below belongs to future approved implementation, not a reason to reopen accepted decisions.

**Try it (after approval/build):** open two projects called Work and Book. Search in Work for a Book-only phrase; nothing appears. Create a note in Book with New note in…, change its heading, pin its folder, reopen it from Recent and confirm the filename stayed. Capture a Local note and open a `.txt` in place while signed out. Share a folder, review its contents, cancel once, then enable sharing with the public-site explanation and send an access code. Read it on the website, withdraw it and inspect pending publication honestly. Publish a different page with Paper while the app stays dark. Quit with Book's note open and start again: it reopens at the same caret. Press Ctrl+Alt+O, find Work and open it in its own window.

| Row | Done when | Evidence required |
| --- | --- | --- |
| MP.1 | UC-PROJ-01 to UC-PROJ-03: separate histories/windows; own paired Public root usable, foreign roots/IDs rejected; private/public crossing needs confirmation and site permission. No symlink bypass or lost draft. | Two-project/pair journey, denied site-write and canonical-path units, crash/restore checks |
| MP.2 | UC-PROJ-04 to UC-PROJ-06: name survives colour/logo Off; Recent distinguishes same titles; project/folder/note pins follow moves and unpin deletes nothing. | Light/dark/contrast/narrow visual review, keyboard/screen-reader pass, pin identity units |
| MP.3 | UC-PROJ-07/08, UC-FILE-08/09: local files survive failed writes/external edits; Local notes Undo/local recovery survives restart, failed retention prevents deletion and restore never overwrites collisions. No bespoke 30-day gate, implicit upload or timed purge; Save as leaves original intact. | Local filesystem/network journey, encoding/denied-write/conflict/crash corpus, local-delete/restart/retention-failure/collision checks |
| MP.4 | UC-FILE-02 and UC-FILE-12: first-save name remains after title edits; picker cancel creates nothing; explicit rename updates links exactly once. | File-operation units and project/folder picker journey |
| MP.5 | UC-RWR-01, UC-RWR-12 and UC-FIND-03: Ctrl+Enter generates once, IME never sends; caret mode sends no note context and exact Undo/Stop restores; Enter dismisses Spotlight. | Prompt/request-shape units and focused keyboard journey |
| MP.6 | UC-SHARE-03/05/07/08: fixed target/review/counts/switches; cancel creates no grant/site; explicit first-share confirmation and honest wait. Rendered share information contains an enabled link or site plus access code, never successful unusable output. | Approved light/dark/narrow states; publish failure/nested focus; Link-only/Passcode-only/both × template placeholder matrix |
| MP.7 | UC-SHARE-04 and UC-READ-02: new access codes, generic errors, expiry/withdrawal and old grant compatibility; no plaintext or secret in public output/logs. | Sealed-reader fixtures, build-output leak scan, security review and legacy-grant migration corpus |
| MP.8 | UC-SHARE-09: GitHub roles are actual permissions; collaborator warning includes all private notes and secrets; no fake personal Read role. | API protocol fakes; owner-authorized live organization/personal smoke before real invites (owner supplies accounts) |
| MP.9 | UC-SHARE-10: approved browser retirement replaces editor/demo/vault with the website; owner's drafts, if any, get one-click local export before removal. Failed/cancelled export keeps draft access; no heavy inventory, byte-equivalence or retention gate. | Export download/open and failed-export preservation; absent retired routes and intact public/share links |
| MP.10 | UC-SHARE-08 / CP-SAFE-01: Turn off preserves public-source working copies privately, then removes current shared/published content at next successful publish, never the repository/private notes. First-share confirmation has one history line; failed preservation stops removal, offline stays pending. | Cancel/no-side-effect, copy-failure/collision and removal/retry/re-enable fixtures; inspect retained notes/repository/history and current output |
| MP.11 | UC-PROJ-04: uploaded SVG validated before rendering; active/external/oversize/unsupported inputs fail explicitly, old logo/draft survives; Apply publishes only sanitized chosen assets. | Passive-SVG adversarial fixtures, no-network protocol check, Apply/Cancel and light/dark/contrast visual review |
| MP.12 | UC-SHARE-10: public-only home/sections/counts/excerpts/articles, no shared metadata; all 1,000 fixture articles reachable, at most 50 direct entries/page; theme/focus controls work without an editor. | Public/private/shared leak fixture, deep-tree/navigation link inventory, narrow/keyboard/reduced-motion visual review |
| MP.13 | UC-SHARE-11: real-renderer preview, public inventory by default, fonts/theme/size independent of app; Apply is not Publish, Cancel/error loses no draft or saved values. | Preview state views and focused save/cancel/no-network/private-exclusion checks |
| MP.14 | UC-SHARE-03 / SHR-23: no source-name/title/path derivation in any share link, code, published share path or filename, including media; only random opaque identifiers. | Short/Unicode/encoded-name fixtures, injected slug/hash rejection, generator-provenance and rename/collision cases; pre-commit and deploy leak failures reveal no private text |
| MP.15 | UC-PROJ-01 / PRJ-11: existing user finds the same note, folder and settings under Project; answers three questions unaided from the figure: where are my notes now, what is the site, and what does turning sharing on create. Paths, links, IDs and history are unchanged. | First-run/upgrade copy and light/dark/narrow/keyboard review; existing-pair fixture confirms no move/reclone or extra consent/setup |
| MP.16 | UC-SHARE-08 / D-305: turning sharing off stops access, not just listings. Shared links stop opening and published notes are back among private notes after the next publish; the site holds no key or secret for the private repository, and no scheduled deploy remains for an existing pair. | Protocol fake listing deploy keys, secrets and workflows before and after; reader fixture refusing withdrawn shares; one owner-authorized check on a test pair |
| MP.17 | UC-SHARE-07 / D-311: a note created in, or moved into, a shared folder is never published unless **Include notes added later** is on or the owner chooses **Add them**. | Seal-output fixture before and after adding a note, with the switch off and on |
| MP.18 | UC-SHARE-03 / D-307: a second Share… on the same item creates a second link; the first link keeps its expiry and methods until changed from its own row, which says the change applies to everyone holding it. | Two-grant fixture; reader opens both; Change… copy check |
| MP.19 | UC-SHARE-05 / D-308: on a platform without a share sheet, the primary action reads Copy share information and copies a usable message; on macOS, Share… opens the sheet; cancelling the sheet copies nothing. | Platform-gated view-model units; A-SHR-01 spike result recorded before the Windows behaviour is chosen |
| MP.20 | UC-PROJ-02 / D-309: with two projects open, *Open with* on a file inside each lands in its own project window; a file outside both opens a file window; a second app launch never starts a second process. A project window's Projects list shows no other project's files. | Single-instance routing units (`second-instance`, `open-file` queued before ready); two-project journey after approval |
| MP.21 | Sign-in expired and offline: share, first share, invite and Turn off each keep the draft, say what happened, and resume the same operation after sign-in or reconnection, creating nothing twice. | Protocol fakes returning 401 and network failure mid-operation; idempotent retry checks |
| MP.22 | UC-PROJ-04 / PRJ-04, PRJ-19: a project window shows only the note, the colour outline, the project pill after Backed up and the optional watermark; no title band, page heading, tinted Files heading, caption line or tinted dialog header (D-324, D-325). The pill is as tall as Backed up with about 6 px visible inset and 4 px logo to text (D-331). | Visual baselines of the approved mocks 1 to 8 in light, dark and contrast; a measured-inset check of the pill and Backed up |
| MP.23 | UC-PROJ-04 / PRJ-18: Settings → Project matches mock 2; the Font and Theme tiles keep 128 × 96 px for every value, their popovers show ThemeGallery and FontChoice tiles with full names, and pointing or focusing previews in the window preview (D-323, D-329, D-330). | Tile-size check over every font and theme; light/dark/narrow visual review; keyboard path through both popovers |
| MP.24 | UC-PROJ-07/08 / PRJ-19: Local notes and a file on its own show the local-drive pill in Backed up's place, never a backup status; a long path ellipsizes in the middle keeping drive and folder; pressing it shows the file selected in File Explorer or Finder (D-333). | Path-ellipsis units (short, long, UNC, macOS); a shell-reveal protocol fake per platform; screen-reader name check |
| MP.25 | UC-PROJ-06 / FIL-19: Files is headed by the project's name in the title role and holds Pinned, Recent, Private and Public as equal collapsible sections; reveal items say Show in File Explorer / Finder / file manager (D-328, D-332). | Visual baseline of mock 3; collapse and keyboard units; copy check of every reveal item per platform |
| MP.26 | UC-SHARE-03/05/07/08 / SHR-13 to SHR-16, SHR-24: Share… from the Files row menu and ⋯ → Note, the share dialog (item card, Include notes added later, How it opens, actions, Share information, Shared before), Review contents, the first-share step and the offline, signed-out, large-folder and deleted states match approved mocks 1 to 11 (D-335); nothing is added to the writing window and every dialog is the standard one (D-336). | Visual comparison with the mock entries in light, dark and 320 px; copy check against the approved messages; keyboard path including Escape from Review contents back to the intact draft |
| MP.27 | UC-SHARE-04 / UC-SHARE-09 / UC-SHARE-12 / SHR-18, PRJ-10, PRJ-12: Settings → Sharing (Show, Find by item, Copy again, Extend, Withdraw, Delete record, Turn off sharing with its progress) and People (Invite… for organization and personal-account projects, Pending, Cancel invite) match approved mocks 12 to 14. | Visual comparison light/dark/narrow; protocol fakes for each action's result line; personal and organization invite copy checks |
| MP.28 | UC-SHARE-10 / UC-SHARE-11 / SHR-20, SHR-22: Publish… confirms in the standard dialog and reports with the toast; Preview site fills the window with the site's theme, font and size from Settings → Sharing, and Close preview restores the app's look exactly (D-337), matching mocks 11 and 15. | Visual comparison; a check that the app's theme attributes are unchanged after Close preview and Apply |
| MP.29 | DSY-15: the shipped Switch is the approved primitive (label, On/Off word, description, disabled reason) and its name and state word, like SegmentedControl's labels, sit within 1 px of the control's centre on the measured ink in light and dark (D-331, D-335). | Gallery fixtures; ink-centre measurement in light and dark; keyboard (Space) and screen-reader name check |
| MP.30 | UC-PROJ-09 / PRJ-14: launch opens the last-edited note (the last window closed) in its project's window at its caret and scroll, with no screen first; a quit with several windows reopens them all; a missing note opens its project's recovery; nothing to reopen shows Open. | Restart journey with caret/scroll check; several-window quit/reopen; deleted-note and empty-state fixtures |
| MP.31 | UC-PROJ-10 / UC-PROJ-11 / PRJ-15 to PRJ-17: Ctrl+Alt+O (⌥⌘O) opens Open outside any project, with one search over Recent and Projects, the four actions, frecency ranking (open +1, editing session +2, 14-day half-life, one decay date per item) and items opening in their own window; columns stack below 640 px; pins in Open and in Files stay separate. | Frecency units (decay, removal forgets score); window-routing units; narrow/keyboard visual review; pin-scope units |

**Against the promise:** nothing in MP is built yet. No product decisions remain from the six owner questions. Future implementation must prove opaque output and honest collaborator access; the accepted migration/retirement plans are proportionate to unmoved files and the owner's own drafts, not a hypothetical user migration.

**Specification review, 3 November:** the one requested grounding critique found three gaps, corrected here and on their durable pages: authorized private/site-root scope (MP.1), local deletion recovery without Git (MP.3) and enabled-method-aware share-template validation (MP.6). Final source additions introduced passive uploaded logos and the website/preview rows MP.11 to MP.13. No UX sign-off, implementation, live account action or future evidence is claimed.

## Inline images (planned)

**Design approved (owner, 3 November 19:39, mock 9).** [Exact source, flows, figures and copy](../experience/images.md) deliver UC-IMG-01 to UC-IMG-06 through WP-9.1 / WP-9.3 to WP-9.5. The evidence below is for future approved implementation, not tests run now.

**Try it (after approval/build):** drop a small picture and a tall one into a private note. Compare Column/Wide/Actual size; right-click the tall one and untick Limit height. Select both with text, right-click, and see Rounded corners mixed; choose it (all on), then Undo. Replace/copy one image, crop/rotate its preview, cancel, then explicitly save and observe the no-pixel-Undo boundary. Generate/review a caption with an existing image-capable integration. Share the illustrated note, verify its images through the authorized reader and inspect public output for plaintext/names; reopen Markdown and a missing-image case.

| Row | Done when | Future evidence |
| --- | --- | --- |
| IMG.1 | UC-IMG-01: drop/picker insert within 20 MiB/40 MP/20-image bounds, all-or-none asset-before-reference; original external sources unchanged, corrupt/failed/closed-target insertion leaves no dangling note reference. | Import/transaction/restart corpus at exact boundaries, denied write, target edit/delete and malformed-format fixtures; no remote request |
| IMG.2 | UC-IMG-02: all three proportional modes and Limit height bounds hold at 320/768/1440 px; Actual never upscales; mixed selection leaves text/unselected images unchanged, one Undo; last successful defaults survive restart. | Layout geometry and selection-state fixtures, failed-default persistence, light/dark/contrast/zoom/reduced-motion visual review after design sign-off |
| IMG.3 | UC-IMG-01: Cut is conditional on successful clipboard write; Replace/Save never silently overwrites external sources; metadata contains no absolute private path. | Clipboard refusal/cancel/replace/Undo/taken-destination fixtures and explicit error/retry |
| IMG.4 | UC-IMG-03: crop/rotate preview/Cancel changes no bytes; Save changes is explicitly destructive/no pixel Undo, atomic and guarded against external edits; other note references untouched. | Pixel dimensions/orientation/4-rotation fixtures; encode/write/conflict/crash checks, shared-reference isolation and conditional committed/uncommitted/non-Git history cases |
| IMG.5 | UC-IMG-04 / SHR-23: exact selected media decrypts only under authorized grants; no private image bytes, plaintext thumbnail, source metadata, names/paths or unrelated asset in public Git/artifact/index/cache. Missing media blocks ready state. | Synthetic public/private/shared media fixture, tamper/wrong-grant cases, binary/metadata/path/provenance leak checks before commit/deploy; inspect reader blob disposal and no plaintext service-worker writes |
| IMG.6 | UC-IMG-05: explicit capable integration sees only one stripped image/instruction; no title/path/note, silent fallback or model hosting. Review/Use caption inserts one undoable caption; Stop/error/changed target preserves old text. | Protocol fakes for capable/incapable integrations, payload/metadata/network allowlist, malicious caption as plain text, old-caption restore and changed/deleted-image fixtures |
| IMG.7 | UC-IMG-06: untouched standard images/unknown directives round-trip; edited typed attributes persist, relative refs rebase on move/copy, broken image retains source/alt; keyboard crop and menu paths work. | Markdown corpus, private/public/local/standalone filesystem cases, 320 px/read-only/alt-caption semantics and keyboard/screen-reader review |
| IMG.8 | UC-IMG-01 to UC-IMG-06: every wait answers within 100 ms and uses its named inventory status; old pixels/draft remain until replacement is ready; decode/encode never blocks the main process. | Scoped wait/frame/worker-resource observations after approval against existing performance budgets; no speed claim from the specification |
| IMG.9 | UC-IMG-06 / D-310: every image the app writes shows as a picture in a plain Markdown viewer; a default image has no attribute block; description and caption can be written by hand (**Edit description…**, **Add caption**). | Markdown corpus rendered by a CommonMark/GFM reference renderer (an `<img>` for every image); menu and keyboard checks for description and caption |
| IMG.10 | UC-IMG-02 / IMG-11: nothing is drawn on or around an image (no ⋯ button, border, backdrop or placeholder); transparent images show as they are; selection is the editor's tint; the menu opens only by right-click, the context-menu key or Shift+F10 and holds Rounded corners (last used) and Limit height (on by default), mixed for a selection; Auto caption reads Auto caption with AI…; Edit image's fields and rotate/reset group sit on one row (D-326, D-327, D-334). | Visual baselines of mock 9 in light and dark; context-menu keyboard journey; mixed-selection units; menu copy check |

**Against the promise:** images are not built. Highest-risk proofs are encrypted media closure, atomic/destructive saves and image-only provider payloads. Validate those in scoped work after the owner reviews JSON views; this document does not approve their UX or authorize real-note writes.

## Settings AI single-list stage

**Approved at 19:59, 1 November:** the owner accepted UX and UI of exact `d40b78a345b7fe79262116b270b3a908c0966eac`, including shared centering/opaque hover, discovery grouping, prominent Default, stable focused row/editor/scroll and Add last. Production hardening has 217 targeted passing units and six passing real-app journeys, plus the complete green Windows runtime/test/config gate on `ece4c25c722f96c572232c5c58398c9f25d74260`; [current gate evidence](gate-evidence.md#current-production-candidate-checks) supplies its exact commands/results/run and retains live-account/assistive-technology limitations. Earlier evidence below is historical, not a claim that the revised design remains unapproved.

**D-267 · WP-AI.15 / MAI · integrated, locally verified; owner acceptance pending.** CP-RWR-01 → SC-RWR-04 → UC-RWR-05 / UC-RWR-08 → AIS-16. Exact published Settings implementation c4335741 is integrated into own-candidate over 86631980, preserving the CLI companion and inline prompt. Combined checks and the five related journeys pass; see [candidate evidence](rewrite-acceptance.md#settings-list-combined-candidate-1-november). The owner-review refresh follows these checks; production acceptance is not implied.

| Row | Done when | Evidence required |
| --- | --- | --- |
| UX-LIST.1 | Empty, one and multiple connections render one list; no Writer menu, Use as Writer or local section; one Find on this PC button and exact scan explanation. | Settings journey and light/dark captures at default and narrow sizes |
| UX-LIST.2 | Keyboard/assistive technology expose one saved Default with checked semantics; Space selects and arrows navigate; actions do not also select, no nested interactive controls. | Role/keyboard journey assertions and UI behaviour units |
| UX-LIST.3 | Settings choice is next Rewrite's Writer; choosing Rewrite integration changes the same ID seen on Settings reopen. No independent default store. | Core Writer tests and Settings/Rewrite round-trip journey |
| UX-LIST.4 | Pending and failed saves retain the previous choice and show named feedback; deleting the default clears it; empty never invents a connection. | Controlled bridge failure/pending/deletion units and journey |
| UX-LIST.5 | Icons, model/locality, key and Test state remain honest; unsupported/unknown discovery is not ready; no note text sent by choosing or finding. | Discovery fake tests; light/dark/narrow captures; bounded call assertions |
| UX-LIST.6 | Find and the scan explanation are one related responsive row above the list; Add is last; Default badge is emphasized; no redundant signed-in/default/local-empty prose. | Approved exact d40b78a3; current static view checks and six related journeys pass; signed-in discovery still announces its translated availability without visible success prose |
| UX-LIST.7 | Default selection changes existing row state/paint only, preserving native radio focus, panel/editor identity, scroll and input; errors remain explicit. | Native busy-radio unit preserves identity/focus and rejects choices; Settings journey preserves the radio, panel, editor and scroller nodes and keyboard focus |

### Try it

Open Settings → AI with two fake connections. Select the second row, see **Default**, open Rewrite and confirm the same integration. Choose the first integration there, reopen Settings and confirm its badge. Use arrow keys and Space; Test, Change and Remove must not also select. Delay and reject the settings write: the old Default remains, with **Remembering your choice…** or an explicit error. Remove the default, then inspect empty, one-row and unknown discovery states. Repeat in light/dark and at a narrow window.

### Spec evidence, 1 November 12:10

| Check | Result |
| --- | --- |
| `pnpm check` in own-ai-default-list | Passed: chain and plan include AIS-16 exactly once in WP-AI.15 / MAI; 393 view documents and 71 contracts unchanged. Kit-copy checks skipped because isolated worktree submodules are not checked out. |
| `node E:\Projects\side-projects\focus-notes\slate\scripts\runtime-host.mjs check --repo . --host documentations` in own-ai-default-list | Passed; canonical pinned runtime invoked read-only from the checked-out kit. |
| `git diff --check` | Passed. |
| `node E:\Projects\side-projects\focus-notes-work\scratch\own-list-render.mjs` | Passed 26 changed reader-page/theme cases in headless Edge on a private ephemeral port, never 8787. One H1 per page, theme and SVG fit assertions; new target headings rendered. Settings light/dark captures inspected, readable. Browser/server closed in finally. |

**Historical spec-only boundary (145eb45c): runtime evidence was not yet available.** UX-LIST.1 to UX-LIST.5 were open at that boundary. Initial check found missing TypeScript; approved-feed offline frozen-lockfile install restored it without downloads or manifest changes. The next check needed generated tokens; `pnpm tokens` fixed that prerequisite, then the complete check passed. Build was queued because live POP owned overlapping core AI state, AI unit tests, message catalogue and generated schemas. No runtime, test, message or schema file was edited by that spec. The implementation and combined evidence below supersede that historical queue state.

### Settings implementation evidence, 1 November

| Row | Checked evidence |
| --- | --- |
| UX-LIST.1 | `AIS-16: Settings Default is one list shared with Rewrite` passed: 0, 1, 2 and 30 rows; absent Writer menu/Use as Writer/local heading; one Find button and exact scan line. Captures include light/dark two-row views at normal and 480-wide viewport sizes. |
| UX-LIST.2 | ItemCard units passed for 30 native radios, one checked value, action outside label and pending disabled selection. Journey passed ArrowDown, Space, direct selection and independent Change/Remove; explicit native radio names and checked state asserted. |
| UX-LIST.3 | Core units and journey passed Settings → Rewrite → Settings with the same saved Writer ID, preserving Rewrite draft; no second preference or store. |
| UX-LIST.4 | Core units passed delayed/rejected writes retaining the previous default and explicit error/retry; journey deletion clears the Writer and all checked rows. The first journey exposed the old implicit next-connection fallback; main removal now clears it, with main-service tests also proving an edit does not invent a replacement. |
| UX-LIST.5 | Existing API/Copilot contract fake tests passed, including discovery outcome honesty; unchanged icon/locality/key/Test information checked in captures. Core round-trip records only Writer calls, no rewrite requests. |

**Commands and results in the isolated worktree:**

- `pnpm exec vitest run packages/core/test/ai-app.test.ts packages/ui/test/item-card-choice.test.tsx apps/desktop/test/ai-rewrite.test.ts apps/desktop/test/ai-contract.test.ts apps/desktop/test/ai-copilot-contract.test.ts`: **158 passed**.
- `pnpm --filter @focus-notes/core run typecheck`, `pnpm --filter @focus-notes/ui run typecheck`, `pnpm --filter @focus-notes/desktop run typecheck`: **passed**.
- `pnpm --filter @focus-notes/desktop run build`: **passed**, existing renderer chunk-size warning.
- `pnpm --filter @focus-notes/desktop exec playwright test e2e/air-safeguards.spec.ts e2e/air-rewrite.spec.ts --workers=1 -g 'AIS-16: Settings Default|D-265, D-266: inline|AIS-13, AIS-14:|AIS-04, AIS-13:|AI Rewrite: streams'` with `FOCUS_NOTES_E2E=1`: **5 passed**, including four coupled POP/stream/direct-Generate/picker journeys.
- `pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write`, `node tools/component-inventory.mjs`, `pnpm check`: **passed**, generated schemas/catalogue in this implementation commit; 396 documents, 71 contracts. Kit checks skipped because worktree submodules are unchecked.
- Canonical Slate runtime check and `git diff --check`: **passed**.

Captures are in `focus-notes-work\scratch\own-list-ui`; normal/narrow Settings light/dark images inspected. Native radio plus badge/border make selection visible without colour alone; actions remain sibling controls and wrap in narrow views. Test apps quit in finally; PID-scoped close-test-apps WhatIf then actual reported 0 leftovers. That isolated implementation did not change the owner app/settings/profile, notes/private content, Preview or 8787. No real inference, full suite, CI wait or screen-level benchmark. Combined integration now passes 401 related units and all five journeys, with fresh captures in `focus-notes-work\scratch\own-int2-ui`; [candidate evidence](rewrite-acceptance.md#settings-list-combined-candidate-1-november) records the commands. Owner acceptance and full assistive-technology/forced-colours audit remain pending.

## OWNER-TESTABLE Rewrite UX stage

**Mode:** show me the UX sooner · work with me (D-255). **Status: OPEN, in the owner's hands.** The review build of `fix-ai-rewrite-simple` (452e44ba plus the dialog scroll fix, 59fb5449) is open on the owner's review profile with their Ollama Writer. The 30 October version of this stage (Ctrl+K, three variations, Accept and Discard, whole-file New file, restart recovery of variations) was dropped with D-256.

### Done when

Every row traces to CP-RWR-01.

| Row | Trace | Done when | Evidence |
| --- | --- | --- | --- |
| UX-RWR.1 | UC-RWR-05, UC-RWR-08 | The owner connects their own service in Settings → AI (Find on this computer, or Add connection with a key), tests it, and it's the Writer. | The owner, in the review build |
| UX-RWR.2 | UC-RWR-01 | The owner selects text, opens Rewrite with <kbd>Ctrl+Shift+R</kbd> and the text menu, uses a preset and their own prompt. | The owner |
| UX-RWR.3 | UC-RWR-02, UC-RWR-06 | Generate locks the note, the selection shimmers, the answer streams in place in the rainbow and fades. | The owner; `rewrite-stream.test.ts` |
| UX-RWR.4 | UC-RWR-07 | One <kbd>Ctrl+Z</kbd> gives back the exact original, <kbd>Ctrl+Y</kbd> the rewrite; <kbd>Esc</kbd> mid-stream and a stopped server both leave the original. | The owner; `rewrite-stream.test.ts`, `ai-rewrite.test.ts` |
| UX-RWR.5 | UC-RWR-02 | **Safety, not deferred:** no note is lost or half-written, text outside the selection never changes, and the saved note holds the original until a rewrite finishes. | Unit tests; the owner on their own notes |
| UX-RWR.6 | UC-RWR-05 | **Privacy, not deferred:** text goes only to the Writer's address; keys never show in the window, a log or the notes. | `ai-rewrite.test.ts` (sealed keys); code review |
| UX-RWR.7 | UC-RWR-01, UC-RWR-02 | The owner says the UX is right, or names what to change. | The owner's words, in the progress log |

### Try it: five minutes, by the owner

<ol class="slate-steps">
  <li class="slate-step"><p class="slate-step__title">Connect</p><p>Settings → AI → <strong>Find on this computer</strong> → <strong>Set up</strong> on Ollama → <strong>Save connection</strong> → <strong>Test connection</strong>. Or <strong>Add connection</strong> with a cloud service and your key.</p></li>
  <li class="slate-step"><p class="slate-step__title">Rewrite</p><p>Select a paragraph, press <kbd>Ctrl+Shift+R</kbd>, choose <strong>Make concise</strong>, then <strong>Generate</strong>. Watch the shimmer, the stream and the fade.</p></li>
  <li class="slate-step"><p class="slate-step__title">Undo and redo</p><p><kbd>Ctrl+Z</kbd>: the exact original. <kbd>Ctrl+Y</kbd>: the rewrite.</p></li>
  <li class="slate-step"><p class="slate-step__title">Stop and fail</p><p>Rewrite again and press <kbd>Esc</kbd> halfway. Stop Ollama and rewrite once more: the error, and your original.</p></li>
</ol>

### What's left after the owner accepts

The owner's next changes (live Markdown while streaming, platform key names: WP-AI.12), WP-AI.13 (user judgement and leaving mid-rewrite), the inline prompt below (WP-AI.14), and WP-AI.9's evidence, then the desktop gate before `main`.

### Inline prompt popover definition of done

**Delivers:** UC-RWR-10 and UC-RWR-11, with UC-RWR-01 and UC-RWR-09 under CP-RWR-01. **Status: built and locally verifying, 1 November; candidate integration and owner acceptance pending.** WP-AI.14 belongs to MAI (D-265, D-266). Mode: show me the UX sooner; fast checks and one targeted rewrite journey, not the full suite or a CI wait before the owner sees it.

| Row | Trace / done when | Local implementation evidence | Try it |
| --- | --- | --- | --- |
| UX-POP.1 | UC-RWR-01, UC-RWR-10; RWR-87: all entry points open the same inline non-modal prompt, with no passage preview, backdrop, document scroll lock or full-screen conversion. Selection remains marked while prompt controls take focus. | PASS: `ui:check`; D-265 journey; reviewed light/dark captures at normal and 480 × 360 sizes | Select a paragraph, open Rewrite, type a prompt and scroll the note; selected words remain visible in the document, not copied into the popover. |
| UX-POP.2 | UC-RWR-10; RWR-87/88: exactly two initial textarea lines, content growth/shrink up to the token/viewport limit; normally only textarea overflow. When the complete prompt's chrome cannot fit the short usable viewport, the existing prompt scrolls to keep all controls reachable. One x and retained side/fragment during scrolling, no panel-size reflow loop. | Owner approved d40b78a3; current edge-resize unit and normal/480 x 360 light/dark journey pass with Generate in viewport | Type, paste several lines, then erase. Scroll slowly in both directions: no horizontal jitter. At very short heights, scroll the prompt to Generate without leaving the editor viewport. |
| UX-POP.3 | UC-RWR-10; RWR-88: selection/dialog leaving either edge morphs into one directional return button; return scrolls selection into view and restores the same prompt/focus, reversible with reduced motion. | Current fractional Return geometry and edge-resize regressions; light/dark journey passes both Return directions and reduced motion with retained draft | Write a prompt; scroll beyond each edge, use Return to selection, then repeat by scrolling back. Try reduced motion; draft never changes. |
| UX-POP.4 | UC-RWR-11; RWR-89: deselect with zero prompt characters dismisses automatically with no warning, request or write; moving focus among prompt controls is not deselection. | PASS: `ai-app.test.ts` draft units; D-265 empty-prompt and control-focus journey branches | Open Rewrite without typing; click elsewhere in the note. It closes immediately. Open again and focus Prompt or the integration picker; it stays open. |
| UX-POP.5 | UC-RWR-11; RWR-90: deselect with written, whitespace or preset text opens exactly one loss confirmation. Keep editing/Escape restores the original range, exact draft and prompt focus; Discard prompt accepts deselection and clears the draft. | PASS: core draft units, real-editor observer regression, repeated Escape/Keep editing/Discard journey; confirmation light/dark captures and keyboard checks | Type “Make warmer”, click elsewhere: read the loss warning. Choose Keep editing, then try Escape on the warning. Deselect again and Discard prompt; nothing sends or writes. Repeat with a preset and whitespace. |
| UX-POP.6 | UC-RWR-09; AIS-14: no first-send disclaimer, consent or extra Send step/gate; icon, service, model, This computer/Cloud and remembered picker remain. Data-safety and stale-capture protections are unchanged. | PASS: core/provider units with absent/stale consent and stale-note regression; direct first-send fake-service safeguards journeys; reviewed captures | On a disposable connection with no saved consent, open Rewrite: just the active integration, prompt, presets and actions. Generate sends once directly to that integration. Cancel sends nothing. |
| UX-POP.7 | RWR-87/88, D-265: shared preset text/icon centering and symmetric padding; Return hover is opaque and highlighted, with the same draft restored at first/middle/last document boundaries. | Owner approved d40b78a3; current journey asserts opaque highlighted Return hover, centered icon/label and symmetric padding; both directional returns retain the exact draft | Hover both return directions, restore the draft on the first press, then Cancel; inspect preset labels with and without icons. |

**Documentation evidence (1 November):** `pnpm check` passed (chain, plan, licenses, generated files and UI contracts); the pinned Slate runtime check passed. All 17 affected reader pages, including the regenerated component and view inventories, rendered with one H1 in headless Edge in light and dark (34 cases), figures stayed within the content column, and the new DoD/design anchors resolved. Historical link and anchor-parser observations were recorded separately, not repaired in this slice. This is documentation evidence; implementation proof is below.

**Local proof (1 November):** UX-POP.1: `ui:check` passes for 394 documents / 71 components; the D-265 actual-app journey opens a named non-modal region and reviews normal/small light/dark captures. UX-POP.2/3: `selection-placement.test.ts` covers fragment visibility, bounding-box gaps and full clamping; that journey scrolls entirely offscreen and back without losing the exact draft. UX-POP.4/5: `ai-app.test.ts` covers empty, whitespace and preset drafts; the journey covers empty dismissal, repeated same-caret deselection after both Escape and Keep editing, prompt focus and Discard without sending or writing. `format.test.ts` holds the native-selection observer regression. UX-POP.6: absent/stale consent and changed captures are covered by core/provider units; all three `air-safeguards` journeys pass, including direct first Generate, private disposable selection/Cancel/undo and the remembered picker. The affected aggregate is 206 passed / five opt-in live tests skipped.

**Against the promise:** these six rows have local implementation proof, not owner acceptance or a full MAI gate. The extra stream journey also passes, including external overwrite and switching notes. Its initial panel failure was caused by the new listener effect accessing an unmounted Tiptap view during note replacement; obtaining the owning document from the mounted column fixes that lifecycle access without changing saving or conflict handling. The [design](../design/rewrite-with-ai.md#selection-anchoring-and-dismissal) defines the selection and focus rules; the [acceptance matrix](rewrite-acceptance.md) records the delivery limit. The owner's current candidate remains `52bf0dfe` until accepted integration.

## MAI rewrite definition of done

**Production gate open.** This adds CP-RWR-01 to the project Definition of Done and UC-RWR-01, UC-RWR-02 and UC-RWR-05 to UC-RWR-09 to the MAI stage.

**Try it:** the owner's five minutes above, in a release build.

| Row | Done when | Evidence |
| --- | --- | --- |
| MAI.1 | UC-RWR-01: every entry opens the inline prompt on the selection, with the key named for the platform; no selection explains why; presets never send. UC-RWR-10 and UC-RWR-11 meet UX-POP.1 to UX-POP.5. | Journey (QLT-08); `text-menu.test.ts`, `keymap-layers.test.ts`; WP-AI.14 evidence |
| MAI.2 | UC-RWR-02: the answer streams in place, formatted, with the note read-only; only the selection changes; only the prompt and selection are sent. | `rewrite-stream.test.ts`, `ai-rewrite.test.ts`; journey |
| MAI.3 | UC-RWR-07: one undo step; <kbd>Esc</kbd>, Stop, every error and switching notes restore the exact original and stop the request. | `rewrite-stream.test.ts`; journey with a failing fake |
| MAI.4 | UC-RWR-05, UC-RWR-08: every service kind's request shape, key sealing, address rules, discovery and Test behave as specified. | `ai-rewrite.test.ts`; security review (SEC-09) |
| MAI.5 | UC-RWR-05, UC-RWR-09: every prompt shows the integration, model and locality; choosing another connection persists for the next rewrite; user judgement replaces the private-page guard and first-send disclaimer/consent (UX-POP.6). | Unit and journey tests, one/two-connection light/dark captures (WP-AI.11, WP-AI.13, WP-AI.14; D-261, D-262, D-266) |
| MAI.6 | UC-RWR-06: the rainbow is at least 4.5:1 in every frame in light and dark, never hides the focus band, and reduced motion and forced colours show ordinary text. | Look in the gallery; contrast check |
| MAI.7 | Every row of the [acceptance matrix](rewrite-acceptance.md) has evidence; the [wait rows](../architecture/perceived-performance.md#rewrite-waits) are measured (open and Stop within 100 ms). | Acceptance matrix; `fn:rewrite.*` |
| MAI.8 | GATE-MAI: the owner accepts the feature; reviews approve; Windows app CI is green; Help matches what ships. | WP-AI.9 |

**Against the promise:** the approved flow is built and its current targeted checks pass. The retained static security reviewer reports no findings, but supplies no comprehensive file-level certification or live SDK/account proof. Every connection kind is tested against protocol fakes; historical live Ollama evidence remains distinct. The [current gate evidence](gate-evidence.md#current-production-candidate-checks) lists full-gate, contrast, screen-reader and latency limitations honestly; they are not silently closed.

## The levels

| Level | Applies to | Decided by | Evidence lives in |
| --- | --- | --- | --- |
| **Definition of ready** | A work package before it starts | The orchestrator agent | The work package brief |
| **Work package definition of done** | Each work package (one or more pull requests) | The verifier agent, then the required reviewers | The pull request's evidence record |
| **Stage definition of done** | Each stage, M0 to M8 | The owner, at the stage gate | The stage gate issue on GitHub |
| **Release definition of done** | Each public release, starting with 1.0 at M5 | The owner | The release checklist issue |
| **Project definition of done** | Focus Notes as a whole, after M8 | The owner | The final release checklist |
| **Help article definition of done** | Each article on the product site (stage MH onward) | CI for the automated checks, then a reviewer who has never used Git | The article's pull request |

Evidence records live with the work on GitHub (pull requests and issues), not in these docs. These docs change only to describe what was actually built, and a page's manifest status becomes `stable` when the stage that builds it passes its gate.

<h2 id="definition-of-ready" data-reader-personas="engineering product">Definition of ready</h2>

A work package can start only when all of these are true:

- Every work package it depends on is Done, and so is the previous stage's gate (unless it's marked *lookahead*).
- Its requirements trace to user-can capabilities, and the spec pages that define them have no open questions. Gaps go to [Decisions](decisions.md) first.
- Each requirement has its acceptance checks written as test names, before any code: what will be tested, and with which fixture.
- Any view it adds is sketched as a view document outline: components, view model, and commands.
- Any new component, token, command, network destination, dependency, or file format is named, so the matching process can run (component process, license check, decision).
- It's small enough: about a week of work, in pull requests of about 400 changed lines or fewer. If not, split it.

<h2 id="work-package-definition-of-done" data-reader-personas="engineering">Work package definition of done</h2>

| Area | Done means | Evidence |
| --- | --- | --- |
| **Behavior** | Every acceptance check for its requirements is automated and passes. Manual checks are allowed only where automation is impossible (for example a screen reader pass), and are scripted and recorded. | Test names and results, mapped to requirement IDs |
| **No regressions** | All earlier tests and journey tests pass on Windows, macOS and Linux (required since the platform parity pass, [D-196](decisions.md), amending [D-112](decisions.md)). | CI run |
| **Design system** | `ui:check` passes. No raw values, markup, or styles outside the allowed places. Any new component or token went through the [component process](../design/system/overview.html#adding-or-changing-a-component). Every new variant and state has a fixture and an approved visual baseline. | CI run, gallery link, baseline approvals |
| **Visual quality** | Every new or changed surface passes the [visual quality checklist](../design/foundations.md#visual-quality): inside the window, never edge to edge, inside its container, uniform padding, gaps between items, fading scroll edges, aligned rows, grouped spacing, and anchored tooltips. Its geometry rules are checked in journeys at the default window size and at the minimum (480 × 360), and it's reviewed critically in screenshots in a light and a dark theme. It scores **VVS ≥ 70 (≥ 80 for onboarding and empty states), no criterion below 10** on the [visual vs verbose score](../design/visual-score.html): the anchor and word budget measured in journeys, the other three scored by the design-system-reviewer. | Journey results, screenshots, the five VVS criterion scores per surface |
| **Accessibility** | Zero axe violations. Keyboard path tested for each new interaction. Accessible names present. Focus order and focus return checked. | Test results, keyboard journey test |
| **Performance** | `pnpm bench --check` passes: no measure regresses beyond its noise allowance (10% unless the budgets file says otherwise). New budgets this package owns are met on reference hardware and added to the budgets file. Every new wait a person can feel has a named measure, a class and its pattern, and a row in the [wait inventory](../architecture/perceived-performance.md#the-wait-inventory) (PRF-13). No transition shows a blank or white frame, and nothing reloads the page to change state (DSK-09). | Benchmark report; the "no silent wait" and frame-integrity journeys |
| **Security and privacy** | CodeQL and dependency audit clean of high and critical findings. No new network destination, permission, or stored data without a decision and an updated data inventory. The threat model is updated if the attack surface changed. | CI run, diff of the inventory and threat model |
| **Code quality** | Strict TypeScript with no `any` escapes, lint clean, no unexplained `TODO`, and code an independent reviewer can follow. | Review approval |
| **Licensing** | The license check passes and new notices are in `THIRD_PARTY_NOTICES`. | CI run |
| **Docs and traceability** | The spec pages describe exactly what was built. Any deviation is recorded as a decision. The work graph status is updated. | Docs diff, decision IDs |
| **Reviews** | The reviews the work package lists (code, design system, accessibility, security) approve, and the owner approves anything the [escalation rules](agentic-loop.html#escalation) name. | Approvals |
| **Integrated** | Merged to `main`, and the nightly build from that commit installs and starts on Windows; macOS and Linux report without blocking until the platform parity pass ([D-112](decisions.md)). | Nightly build link |

<h2 id="help-article-definition-of-done" data-reader-personas="product design">Help article definition of done</h2>

An article in the help centre is done when every row holds. CI checks the rows marked *automated*, and a person checks the rest ([Writing help articles](../design/help-writing.md), D-168).

| Check | Done means | How |
| --- | --- | --- |
| **One task, one type** | The title is verb-first, in sentence case, 10 words or fewer, and names a real task or question. The article is one content type and has that type's parts in order. | Automated (front matter and template parts), then review |
| **Plain words** | About grade 8 or below (fails above 9). Every technical word is explained on first use. No "simply", "just", "click here" or Latin abbreviations. | Automated reading level and word list, then review |
| **Steps that work** | Numbered steps, one action each, the verb first, the result stated. A reviewer follows them on the current release, on each system *Applies to* names, and gets the result. | Review on the release build |
| **Troubleshooting from the reader's side** | Starts from the message's exact words. Causes are in order of likelihood, with the simplest fix first. Ends with *Still stuck?* | Automated (the message text matches the app's message catalogue), then review |
| **Applies to, and current** | *Applies to*, prerequisites if any, last-updated date and release in the front matter and the footer. | Automated |
| **Screenshots** | From the screenshot pipeline only, light and dark, fresh (no view they show changed since), with alt text, and one highlight at most. | Automated (freshness, alt text), then review |
| **Links** | Every link and anchor resolves. Link text describes the target. Every app *Learn more* ID that points here exists. | Automated |
| **Accessible** | Zero axe violations in light and dark. Headings in order with no skipped levels. | Automated |
| **No tracking** | *Was this helpful?* opens a pre-filled GitHub issue. The page makes no request to another origin. | Automated |
| **Understood** | A person who has never used Git completes the article's task using only the article (sampled for each category at the stage gate). | Usability check |

<h2 id="stage-definition-of-done" data-reader-personas="product engineering">Stage definition of done</h2>

Every stage, in addition to its own exit criteria in the [implementation plan](implementation-plan.md):

1. **All work packages Done**, and every requirement in the stage passes its acceptance checks.
2. **The demo script passes** on a clean Windows 11 machine, installed from the stage's preview build, run by the owner. macOS (current release) and Ubuntu LTS are covered at the platform parity pass ([D-112](decisions.md)).
3. **The demo is automated.** The demo script is an end-to-end journey test, and it joins the regression suite for every later build.
4. **All earlier journeys pass.** Nothing a previous stage delivered has regressed.
5. **No S1 or S2 defects open** in anything shipped so far. S3 defects have an owner and a planned stage.
6. **The quality bar holds** for everything shipped so far: performance budgets, accessibility, the design system, security, and privacy at the [release level](#release-definition-of-done), scoped to what exists.
7. **Docs match the build**: the pages for this stage's features describe what was built, their manifest status is `stable`, and the roadmap says what you can do now.
8. **Decisions and risks reviewed.** Decisions the stage settled are recorded. Proposed decisions it relied on are confirmed or changed by the owner. [Risks](risks.md) are reviewed.
9. **The loop improves.** A short retrospective on the [agentic loop](agentic-loop.html) records what slowed or misled the agents, and the role instructions are updated.
10. **The owner accepts it** at the gate, by running the demo themselves.

### Defect severity

| Severity | Meaning | Example |
| --- | --- | --- |
| **S1** | Data loss, a security or privacy breach, or a crash or hang on a common path | Typed text lost after a sync, private text in a public build |
| **S2** | A P0 capability broken with no reasonable workaround | Can't create a folder; focus mode drifts off the caret's row |
| **S3** | Broken with a workaround, or a P1 capability broken | Snap Layouts missing on one monitor arrangement |
| **S4** | Cosmetic, or wording | A tooltip shows the wrong shortcut glyph |

<h2 id="release-definition-of-done" data-reader-personas="product design engineering">Release definition of done</h2>

The product-wide quality bar. It applies to every public release, for everything that release contains. Version 1.0 (M5) must meet all of it for M0 to M5, except the first Microsoft Store release, v1.0.0, which is held to the smaller [indie release bar](gate-evidence.md#version-1-0-for-the-microsoft-store) the owner approves ([D-202](decisions.md) (10)).

| Quality | The bar | How it's verified |
| --- | --- | --- |
| **Complete** | Every P0 requirement in scope passes. Every user-can in scope passes its acceptance criterion. Every scenario in scope can be walked end to end. Every boundary (`UNSUP-*`) behaves as stated. | Requirement tests, journey tests per scenario |
| **Calm and consistent** | Every view matches its design page, with no unreviewed deviations, and passes the [visual quality checklist](../design/foundations.md#visual-quality), and meets its [VVS](../design/visual-score.html) threshold. Zero design-system violations. Every view has approved baselines in light, dark, high contrast, compact, and reduced transparency. All copy follows [Foundations → Words](../design/foundations.md#words). | Design review against each design page, `ui:check`, visual regression, copy review |
| **Fast** | Every budget in [Performance and quality](../architecture/performance-and-quality.md#performance-budgets) is met at p95 on reference hardware, in three consecutive runs. | Benchmarks in CI and on reference machines |
| **Reliable** | No text is ever lost: the fault-injection suite (process kill during save and commit, power loss, network loss mid-push, full disk, two computers editing) runs 1,000 randomized rounds without loss. A 72-hour scripted soak shows no memory growth above 10% and no crash. The round-trip corpus passes at 100%. | Fault-injection and soak reports |
| **Secure** | The OWASP ASVS Level 2 checklist and the Electron security checklist are complete. Zero high or critical CodeQL or dependency findings. The leak check catches every planted secret in its test suite. The sealing design and code have an independent review (the security-review agent and a human reviewer). The threat model is current. | Checklists, scan reports, review record |
| **Private** | A network capture across every journey shows only the allowed destinations. No telemetry. Signing out or removing a workspace deletes exactly what the data inventory lists. | Capture report, inventory test |
| **Accessible** | WCAG 2.2 AA across the app (including the visitor view, *Unlock*, and *Use this app for yourself*), public and shared pages, and these docs. Every scenario can be completed with the keyboard alone, and with NVDA, Narrator, VoiceOver (macOS and iPadOS), and Orca. Windows contrast themes, 200% zoom, and 320 px reflow work. | Audit record, screen-reader journey scripts |
| **International** | IME, dead-key, AltGr, and non-Latin layout suites pass. Right-to-left notes render and edit correctly. Pseudo-localized builds (40% longer, accented strings) show no clipping or truncation. | Input suites, pseudo-localization screenshots |
| **Installable and updatable** | Clean installs pass on the whole support matrix: Windows until the platform parity pass, and macOS and Linux only after it, before any release for them ([D-112](decisions.md)). Updating from the previous release keeps every note and setting. Uninstalling leaves only what the docs say. Release assets have checksums, an SBOM, and attestations that verify. | Install matrix report, update test, `gh attestation verify` |
| **Usable** | Five people new to Focus Notes, in a moderated test: at least four write their first note in the browser, and finish the desktop setup and save a note to GitHub, each in five minutes or less without help, and the average System Usability Scale score is 80 or higher. | Usability test notes |
| **Documented** | Docs describe the release exactly. Release notes, the privacy statement, and `SECURITY.md` are current. | Docs review |
| **Licensed** | The license check passes and `THIRD_PARTY_NOTICES` is complete. | CI run |
| **Operable** | The release runbook has been rehearsed, including pulling a bad release and pointing users back to the previous one, and a security-report drill has been run. | Rehearsal record |

From M7, **agent-ready** joins the bar: the MCP server passes the MCP Inspector checks, the agent permission and safety tests pass, and every agent change is attributed and undoable.

<h2 id="project-definition-of-done" data-reader-personas="product design engineering">Project definition of done</h2>

Focus Notes is done (as planned, before the *Later* components) when:

1. **Every stage from M0 to M8 has passed its gate**, and every P0 and P1 requirement passes.
2. **The final release meets the release definition of done in full**, including the agent-ready bar and signed, automatically updating builds.
3. **All 12 customer promises are demonstrably kept**: for each promise, its scenarios pass as journey tests, and the owner signs off on a walkthrough.
4. **The spec and the product agree.** Every docs page is `stable`, every requirement links to its passing tests, and the chain check and the plan check pass.
5. **Every decision is closed.** No decision remains *Proposed*.
6. **Every risk is closed or explicitly accepted** by the owner.
7. **No S1, S2, or S3 defects are open.**
8. **Anyone can carry it on.** A new contributor (person or agent) can go from a fresh clone to a merged, gate-passing change using only `AGENTS.md`, these docs, and the work graph.

<h2 id="when-checks-run" data-reader-personas="engineering product">When checks run</h2>

The bar above never weakens, but each check runs at the moment that matches its cost and the risk it covers (D-113, D-255, [The agentic loop → Throughput](agentic-loop.html#throughput)):

| Moment | Checks | Time budget |
| --- | --- | --- |
| **Each change, before the owner sees it** | Typecheck of the packages touched, `ui:check`, the boundary check, and the unit tests and journeys for what changed | 5 minutes or less |
| **Each merge to `main`** | Sized to the risk (D-255). Low-risk UI-only changes (tokens, primitive styling, view documents, copy) land on their fast checks. Desktop runtime changes (main, preload or IPC, file I/O and saving, sync or Git, security or privacy, build or packaging) wait for their Windows CI on the pushed work branch, batched on one merge candidate. The full suite runs only when every item in [AGENTS.md → Before the full suite](../../AGENTS.md#before-the-full-suite-d-255) is true. A failing gated check is never waived as "the same as main" or "a flake": fix it, or quarantine it explicitly, with a scope, an owner and an expiry recorded in the gate evidence | Before the merge, for runtime changes only |
| **Before a stage gate** | Everything in the work package and stage definitions of done: guard journeys, the accessibility audit, the visual quality checklist on every surface, the [VVS](../design/visual-score.html) of every surface (anything below its threshold goes into the feedback queue), the bench on a quiet machine | Once per stage |
| **Before a release** | Everything, on every platform (D-112) | Once per release |

A work package is **Done** only when every check in its definition has passed at least once at the right moment; "verifying" means its fast checks pass and its full checks are scheduled.

<h2 data-reader-personas="product engineering">Plan decisions</h2>

| ID | Decision | Rationale | Alternatives rejected |
| --- | --- | --- | --- |
| PD-DOD-01 | Five nested levels, each with evidence. | Agents and people need the same unambiguous test for "done", and each level builds on the one below. | One general checklist, which is either too vague for a pull request or too heavy for a stage. |
| PD-DOD-02 | The full quality bar applies from the first stage, scoped to what exists. | Quality debt in safety, accessibility, and the design system compounds, and is the hardest debt to pay back. | A hardening stage before 1.0. |
| PD-DOD-03 | Demo scripts become journey tests. | Visible progress stays visible: a later change can't break an earlier stage's promise unnoticed. | Manual demos only. |
| PD-DOD-04 | Measurable bars with named evidence, including usability. | "Done" decided by numbers and records, not by how confident someone feels. | Qualitative sign-off. |

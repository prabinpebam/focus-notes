# Definition of done

What "done" means at every level: a work package, a stage, a release, and the whole project. Each level has measurable criteria and named evidence, so a person or an agent can tell without judgment calls whether something is done.

> [!NOTE]
> **TL;DR.** Five nested production levels remain unchanged below. The separate **OWNER-TESTABLE Rewrite UX stage** is the owner's 30 October review cutoff: the complete Rewrite flow on their own notes in a normal packaged Windows build, with data safety and privacy mandatory, but without claiming production readiness. It is **OPEN**: packaged synthetic checks are not proof that ordinary real-note activation works. MAI and the release/project bars remain separate gates.

## OWNER-TESTABLE Rewrite UX stage

**Mode:** show me the UX sooner · work with me. **Status: OPEN, not owner-ready.** This is the owner-requested 18:06 review stage, beside MAI, not a replacement for MAI or a public release. It delivers the desktop slice of [CP-RWR-01](../product/spec/customer-promises.md) through [UC-RWR-01 to UC-RWR-06](../product/spec/user-can.md). It succeeds only when the owner can judge the complete flow on real owner notes in the **normal packaged Windows build**, without demo flags, fixture-only note binding, a development console or agents handling their credentials.

### Done when and evidence named in advance

Every row traces to CP-RWR-01. Evidence names below are required proof to collect, **not claims that new tests already exist**. Record the exact source SHA, packaged executable, profile/restart identity, command and result for automated checks; record only pass/fail and redacted observations for owner checks, never note text or keys. Each row must pass on the delivered candidate; the owner accepts the stage after the timed walkthrough.

| Row | Trace | Done when | Named advance evidence |
| --- | --- | --- | --- |
| UX-RWR.1 | UC-RWR-01, UC-RWR-05 | The owner opens their own note in a normal package, selects text, opens Rewrite by context menu and Ctrl+K, chooses a preset, edits a custom prompt and can cancel before sending. No selection, unsupported selection, read-only and conflict states explain the refusal without changing the note. Setup is reachable in-app, not via a launcher configuration. | **Owner normal-package entry walkthrough**; exact-package `rewrite-editor.spec.ts` plus **normal-activation journey** with no demo flag, trusted current-note/window binding and note-switch checks. |
| UX-RWR.2 | UC-RWR-01, UC-RWR-02, UC-RWR-06 | The owner sees distinguishable original/suggestion and streaming progress, Stops an incomplete result, regenerates, compares at least two completed variations, then Accepts one and Discards another. Stop/error leaves an editable prompt and an explicit retry; incomplete output cannot be accepted or silently saved. Review controls are readable in light/dark, keyboard reachable, with focus return and a non-color state signal. | **Owner stream/Stop/regenerate/compare walkthrough**; exact-package `rewrite-connection.spec.ts` and `rewrite-editor.spec.ts`, including slow stream, cancel, error/retry and stale-generation refusal; **light/dark keyboard review**. |
| UX-RWR.3 | UC-RWR-02, UC-RWR-04 | Accept uses the ordinary acknowledged save lane; one native Undo restores the prior wording, and Discard leaves the original and unrelated edits intact. Completed variations and original survive closing/reopening the **same profile/workspace**; browsing does not apply or send, explicit restoration is undoable, and stale restoration refuses. | **Owner Accept/Discard/Undo/restart walkthrough**; exact-package `rewrite-connection.spec.ts` and `rewrite-lifecycle.spec.ts`: persisted encrypted refs read after same-profile restart, restore/save acknowledgement/native Undo and request-count assertions. A fresh-profile launcher is not restart evidence. |
| UX-RWR.4 | UC-RWR-03 | Files context menu and Shift+F10 open whole-file Rewrite. The owner chooses **New file**, reviews the output and creates a separate Markdown note with a fresh ID in the same visibility section; source bytes/ID remain unchanged. A colliding name, dirty source, stale disk or another window cannot be overwritten. | **Owner new-file walkthrough**; planned exact-package `rewrite-files.spec.ts` for atomic creation, distinct ID, collision, dirty/stale/other-window refusal and unchanged source hashes. Existing selection tests do not prove this row. |
| UX-RWR.5 | UC-RWR-02, UC-RWR-03, UC-RWR-04 | **Mandatory safety, not deferred:** original is durable before requests; no note loss or overwrite of outside edits, another note/window or external changes, including crashes/forced close during checkpoint, stream, review and save. Unaccepted/partial output never becomes the only durable copy. Unsupported mapping safely refuses. | **Exact-package safety matrix**: `rewrite-authority.spec.ts`, `rewrite-editor.spec.ts`, `rewrite-lifecycle.spec.ts`, plus crash/fault-injection and new-file fixtures covering every named phase; before/after byte/ID checks and checkpoint recovery. Owner notes are never fault-injection fixtures. |
| UX-RWR.6 | UC-RWR-03, UC-RWR-04, UC-RWR-05 | **Mandatory privacy:** no Private → Public crossing through new files, variations, normal/mirror push, logs or commit messages. Rewrite network traffic goes only to the explicitly configured endpoint, with no redirects/fallback/extra fetches; keys stay in the existing secret store, never logs, Git or commits. No default provider or background send. | **Synthetic private/public sentinel and egress matrix**: numeric `127.0.0.1` streaming stand-in request capture, denied-destination/redirect checks, public Git-object inspection (including mirror push), redacted log/commit secret scan and credential-reference storage check. Never copy real private notes into evidence. |
| UX-RWR.7 | UC-RWR-05 | **Depends on the owner:** they enter their own compatible endpoint, model and key **in the app**, see the named destination/consent before sending and personally exercise the complete flow with that service. Wrong key, offline/timeout/refusal are recoverable without note loss or automatic fallback. Owner-only live-service consent/decision dependencies (D-236/D-238/D-239 where applicable) are explicit, not treated as fixture approvals. | **Owner live-provider session and approval**, recording only build, nonsecret service identity and pass/fail. Agents test **only a numeric `127.0.0.1` streaming stand-in**, with synthetic data and no real key, account or external inference. A stand-in pass cannot close this row. |

### Try it — ten minutes, by the owner

**Prerequisites:** a candidate explicitly marked normal-note enabled after UX-RWR.5/.6 safety evidence, a recoverable copy of the owner's chosen note and their independently available compatible service. The owner alone handles endpoint/model/key and any live send. If activation remains gated, stop and record **blocked**, not pass. Use the same profile when restarting. Do not disturb the owner's running candidate to perform this check.

<ol class="slate-steps">
  <li class="slate-step"><p class="slate-step__title">0–2 minutes · Open and configure</p><p>Open the normal package and an owner-chosen real note. In app settings enter endpoint, model and key, review destination/consent, then select a paragraph and open Rewrite. Confirm the original remains identifiable.</p></li>
  <li class="slate-step"><p class="slate-step__title">2–4 minutes · Prompt and interrupt</p><p>Choose Shorten, edit a custom instruction before sending, watch streaming, then Stop. Confirm writing and the original remain available; regenerate and compare two completed variations without silently applying either.</p></li>
  <li class="slate-step"><p class="slate-step__title">4–6 minutes · Decide and undo</p><p>Accept a completed variation, wait for the ordinary saved acknowledgement and Undo once. Try another variation and Discard; confirm the original and unrelated text remain. Reopen with Ctrl+K and use the keyboard to reach the review actions.</p></li>
  <li class="slate-step"><p class="slate-step__title">6–8 minutes · Restart and recover</p><p>Close and reopen the same profile/workspace. Browse saved variations and original without applying; explicitly restore one, verify save and Undo. No new request should result from browsing/restoration.</p></li>
  <li class="slate-step"><p class="slate-step__title">8–10 minutes · Create, do not overwrite</p><p>In Files use Shift+F10, Rewrite and New file. Confirm a separate same-visibility note, unchanged source and no overwrite on a name collision. Record pass/fail for each row and whether the UX is acceptable; never include note contents or credentials.</p></li>
</ol>

The ten-minute owner script evaluates the UX; it does not replace automated fault/egress evidence or certify production performance.

### Actual evidence and remaining blockers

**As of 30 October, 18:09 handoff:** source `2beb8a9bde46f756fff06c32d24bec2ff49a1d90` has a reported **8/8 packaged synthetic journey pass** across `rewrite-connection.spec.ts`, `rewrite-authority.spec.ts`, `rewrite-editor.spec.ts` and `rewrite-lifecycle.spec.ts`. The run used the existing inspector-enabled packaged harness, synthetic notes and numeric `127.0.0.1` streaming stand-in. It exercised persisted variation/original retrieval, explicit restore, native Undo and guarded stale/foreign-note/outside-edit refusals. It is **not** an uninstrumented ordinary-owner-launch proof, full safety-matrix proof or live-provider proof. Durable run details: `focus-notes-work/scratch/air-ux10-package.md` (local worker evidence); [source commit](https://github.com/prabinpebam/focus-notes/commit/2beb8a9bde46f756fff06c32d24bec2ff49a1d90).

**Against the promise — blockers in order:**

1. **Ordinary real-note activation is GATED.** Trusted note/window binding and safe activation must be proved and delivered in a normal package; the synthetic candidate cannot satisfy UX-RWR.1 or make the stage owner-ready.
2. **Safety/privacy coverage is incomplete.** Narrow packaged refusal/restart checks do not prove all crash phases, outside-edit preservation, private/public isolation, new-file collisions, egress and secret-handling rows. Close UX-RWR.5/.6 before inviting real-note use; do not remove a guard merely to expose the UX.
3. **The complete normal-package flow remains unproved.** File → New file and the combined entry/prompt/Stop/regenerate/compare/Accept/Discard/Undo/same-profile-restart path need exact-candidate evidence, not inherited component passes.
4. **Live service and owner acceptance depend on the owner.** No real-provider result, owner ten-minute completion or UX approval is recorded. Do not substitute agent stand-in results or request the owner's key.

**Explicitly deferred to MAI/production:** the full MAI.5–MAI.7 bar (production provider/consent/cost matrix, Store capabilities and published privacy-policy changes, benchmark/performance budgets and the full accessibility/screen-reader/forced-colors matrix), production soak and release hardening, browser support/parity. Mandatory safety/privacy in UX-RWR.5/.6, readable controls/basic keyboard access, honest stream/Stop/error feedback and owner consent are **not deferred**. No Store/privacy publication or production-ready/full-feature completion is claimed. MAI.8, the work graph and all production stages stay open until their own gates pass.

## MAI rewrite definition of done

**Production gate remains open.** This adds CP-RWR-01 to the project Definition of Done and UC-RWR-01 to UC-RWR-06 to the MAI stage. The owner-testable slice above has limited synthetic execution evidence, not MAI completion. All existing release safety, accessibility and design-system bars still apply.

**Try it:** in the future fixture gallery/candidate preview, select a paragraph, open Rewrite with AI, Shorten, stop once, regenerate, compare two variations, Discard, undo and restart. From Files, use Shift+F10 to rewrite to a new file. No account or real provider is needed for this first demonstration.

| Row | Done when | Planned evidence |
| --- | --- | --- |
| MAI.1 | UC-RWR-01: every entry point and disabled reason is observable, the key move is taught, and a prompt/preset is editable without sending. | `rewrite-entry.spec.ts` and `rewrite-prompt.spec.ts`; KEY-08 migration inventory |
| MAI.2 | UC-RWR-02: complete target mapping corpus preserves outside bytes and IDs; unaccepted streams/review never enter note disk, normal commits or sync; original survives crash at every state. | `rewrite-mapping.test.ts`, `rewrite-save-lane.test.ts`, `rewrite-crash.spec.ts` |
| MAI.3 | UC-RWR-03: Same/New paths cannot overwrite another window, stale disk or colliding path, or cross Private to Public. | `rewrite-files.spec.ts`, atomic-create and changed-baseline fixtures |
| MAI.4 | UC-RWR-04: compare, undo/redo and restart retrieval work without rewriting history or exposing variations even through workspace mirror push. | `rewrite-history.test.ts`, `rewrite-restart.spec.ts`, mirror-push sentinel fixture |
| MAI.5 | UC-RWR-05: offline fixture profiles demonstrate consent, caps, error repairs and zero unauthorized egress. Real sends remain blocked until the owner records D-236, D-238 and D-239 approval and Store/privacy scope. | `rewrite-policy.test.ts`, `rewrite-egress.test.ts`; WP-AI.7 signed-off decision record, then security review |
| MAI.6 | UC-RWR-06: fresh text is ephemeral, every frame is at least 4.5:1, and keyboard/screen-reader/reduced-motion/forced-colors paths convey the same state. | `rewrite-fresh-text.test.ts`, `rewrite-a11y.spec.ts`; theme and 480 x 360 review |
| MAI.7 | Every requirement in the [acceptance matrix](rewrite-acceptance.md) has recorded evidence; fixture p95 first token under 1 s, acknowledgement and Stop within 100 ms; no claim that fixtures prove live latency. | `rewrite-performance.test.ts`, named `fn:rewrite.*` measures, acceptance evidence links |
| MAI.8 | GATE-MAI: required reviews approve, Windows app CI is green, Help and approved claims match what ships, rollback disables only sends, and owner accepts the feature. | WP-AI.9 gate record, release/version-specific Help review and owner acceptance |

**Against the promise:** a packaged synthetic Rewrite slice now exists, but ordinary real-note activation, complete owner UX acceptance and the production acceptance matrix remain unproved. See the ordered blockers above. The owner alone resolves live-provider/privacy/consent/cost approvals; browser support remains a named gap, not implied parity.

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

The bar above never weakens, but each check runs at the moment that matches its cost and the risk it covers (D-113, [The agentic loop → Throughput](agentic-loop.html#throughput)):

| Moment | Checks | Time budget |
| --- | --- | --- |
| **Each change, before the owner sees it** | Typecheck of the packages touched, `ui:check`, the boundary check, and the unit tests and journeys for what changed | 5 minutes or less |
| **Each merge to `main`** | Attended: the full Windows suite (unit, desktop and web journeys) runs on CI after the merge, never blocking the owner. Unattended: it runs on CI for the pushed work branch before the merge, and the merge waits until it's green. A failing check is never waived as "the same as main" or "a flake": fix it, or quarantine it explicitly, with a scope, an owner and an expiry recorded in the gate evidence. Data safety and security changes always run their full checks before merging | While the owner tests, or before the merge when they're away |
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

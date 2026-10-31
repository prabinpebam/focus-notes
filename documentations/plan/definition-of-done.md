# Definition of done

What "done" means at every level: a work package, a stage, a release, and the whole project. Each level has measurable criteria and named evidence, so a person or an agent can tell without judgment calls whether something is done.

> [!NOTE]
> **TL;DR.** Five nested production levels remain unchanged below. The **OWNER-TESTABLE Rewrite UX stage** is the owner trying Rewrite and Settings → AI in the review build, on their own notes with their own AI service (D-255, D-256, D-257): open as of 31 October, with the built flow in front of the owner. The **MAI** rows add CP-RWR-01 to the production bar.

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

The owner's next changes (live Markdown while streaming, platform key names: WP-AI.12), then WP-AI.13 (private notes, first-send consent, leaving mid-rewrite) and WP-AI.9's evidence below, then the desktop gate before `main`.

## MAI rewrite definition of done

**Production gate open.** This adds CP-RWR-01 to the project Definition of Done and UC-RWR-01, UC-RWR-02 and UC-RWR-05 to UC-RWR-09 to the MAI stage.

**Try it:** the owner's five minutes above, in a release build.

| Row | Done when | Evidence |
| --- | --- | --- |
| MAI.1 | UC-RWR-01: every entry opens the dialog on the selection, with the key named for the platform; no selection explains why; presets never send. | Journey (QLT-08); `text-menu.test.ts`, `keymap-layers.test.ts` |
| MAI.2 | UC-RWR-02: the answer streams in place, formatted, with the note read-only; only the selection changes; only the prompt and selection are sent. | `rewrite-stream.test.ts`, `ai-rewrite.test.ts`; journey |
| MAI.3 | UC-RWR-07: one undo step; <kbd>Esc</kbd>, Stop, every error and switching notes restore the exact original and stop the request. | `rewrite-stream.test.ts`; journey with a failing fake |
| MAI.4 | UC-RWR-05, UC-RWR-08: every service kind's request shape, key sealing, address rules, discovery and Test behave as specified. | `ai-rewrite.test.ts`; security review (SEC-09) |
| MAI.5 | UC-RWR-09: private notes aren't sent while the switch is on; the first send to a connection is confirmed. | Unit and journey tests (WP-AI.13) |
| MAI.6 | UC-RWR-06: the rainbow is at least 4.5:1 in every frame in light and dark, never hides the focus band, and reduced motion and forced colours show ordinary text. | Look in the gallery; contrast check |
| MAI.7 | Every row of the [acceptance matrix](rewrite-acceptance.md) has evidence; the [wait rows](../architecture/perceived-performance.md#rewrite-waits) are measured (open and Stop within 100 ms). | Acceptance matrix; `fn:rewrite.*` |
| MAI.8 | GATE-MAI: the owner accepts the feature; reviews approve; Windows app CI is green; Help matches what ships. | WP-AI.9 |

**Against the promise:** the flow the owner asked for is built and in their hands. What would still break the promise today: private notes that can be sent (AIS-13), and no security review yet (SEC-09).

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

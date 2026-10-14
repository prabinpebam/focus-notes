# Definition of done

What "done" means at every level: a work package, a stage, a release, and the whole project. Each level has measurable criteria and named evidence, so a person or an agent can tell without judgment calls whether something is done.

> [!NOTE]
> **TL;DR.** Five nested levels. A **work package** is *ready* when its spec, requirements, dependencies, and tests are clear, and *done* when every acceptance check is automated and passing, every gate in CI is green, the required reviews approve, and the docs match what was built. A **stage** is done when all its work packages are done, its demo script passes on clean machines, no S1 or S2 defect is open, every earlier journey still passes, and the owner accepts it. A **release** is done when the product-wide quality bar holds for everything released: complete, calm, fast, reliable, secure, private, accessible, international, installable, usable, documented, and licensed, each with a number and a way to check it. The **project** is done when M0 to M8 have passed, the final release meets the release bar in full, and every decision and risk is closed. Nothing ships that wouldn't pass the bar today. Quality is never deferred to a later stage.

## The levels

| Level | Applies to | Decided by | Evidence lives in |
| --- | --- | --- | --- |
| **Definition of ready** | A work package before it starts | The orchestrator agent | The work package brief |
| **Work package definition of done** | Each work package (one or more pull requests) | The verifier agent, then the required reviewers | The pull request's evidence record |
| **Stage definition of done** | Each stage, M0 to M8 | The owner, at the stage gate | The stage gate issue on GitHub |
| **Release definition of done** | Each public release, starting with 1.0 at M5 | The owner | The release checklist issue |
| **Project definition of done** | Focus Notes as a whole, after M8 | The owner | The final release checklist |

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
| **No regressions** | All earlier tests and journey tests pass on Windows, macOS, and Linux. | CI run |
| **Design system** | `ui:check` passes. No raw values, markup, or styles outside the allowed places. Any new component or token went through the [component process](../design/system/overview.html#adding-or-changing-a-component). Every new variant and state has a fixture and an approved visual baseline. | CI run, gallery link, baseline approvals |
| **Visual quality** | Every new or changed surface passes the [visual quality checklist](../design/foundations.md#visual-quality): inside the window, never edge to edge, inside its container, uniform padding, gaps between items, fading scroll edges, aligned rows, grouped spacing, and anchored tooltips. Its geometry rules are checked in journeys at the default window size and at the minimum (480 × 360), and it's reviewed critically in screenshots in a light and a dark theme. | Journey results, screenshots |
| **Accessibility** | Zero axe violations. Keyboard path tested for each new interaction. Accessible names present. Focus order and focus return checked. | Test results, keyboard journey test |
| **Performance** | `pnpm bench --check` passes: no measure regresses beyond its noise allowance (10% unless the budgets file says otherwise). New budgets this package owns are met on reference hardware and added to the budgets file. Every new wait a person can feel has a named measure. | Benchmark report |
| **Security and privacy** | CodeQL and dependency audit clean of high and critical findings. No new network destination, permission, or stored data without a decision and an updated data inventory. The threat model is updated if the attack surface changed. | CI run, diff of the inventory and threat model |
| **Code quality** | Strict TypeScript with no `any` escapes, lint clean, no unexplained `TODO`, and code an independent reviewer can follow. | Review approval |
| **Licensing** | The license check passes and new notices are in `THIRD_PARTY_NOTICES`. | CI run |
| **Docs and traceability** | The spec pages describe exactly what was built. Any deviation is recorded as a decision. The work graph status is updated. | Docs diff, decision IDs |
| **Reviews** | The reviews the work package lists (code, design system, accessibility, security) approve, and the owner approves anything the [escalation rules](agentic-loop.html#escalation) name. | Approvals |
| **Integrated** | Merged to `main`, and the nightly build from that commit installs and starts on all three platforms. | Nightly build link |

<h2 id="stage-definition-of-done" data-reader-personas="product engineering">Stage definition of done</h2>

Every stage, in addition to its own exit criteria in the [implementation plan](implementation-plan.md):

1. **All work packages Done**, and every requirement in the stage passes its acceptance checks.
2. **The demo script passes** on clean Windows 11, macOS (current release), and Ubuntu LTS machines, installed from the stage's preview build, run by the owner.
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

The product-wide quality bar. It applies to every public release, for everything that release contains. Version 1.0 (M5) must meet all of it for M0 to M5.

| Quality | The bar | How it's verified |
| --- | --- | --- |
| **Complete** | Every P0 requirement in scope passes. Every user-can in scope passes its acceptance criterion. Every scenario in scope can be walked end to end. Every boundary (`UNSUP-*`) behaves as stated. | Requirement tests, journey tests per scenario |
| **Calm and consistent** | Every view matches its design page, with no unreviewed deviations, and passes the [visual quality checklist](../design/foundations.md#visual-quality). Zero design-system violations. Every view has approved baselines in light, dark, high contrast, compact, and reduced transparency. All copy follows [Foundations → Words](../design/foundations.md#words). | Design review against each design page, `ui:check`, visual regression, copy review |
| **Fast** | Every budget in [Performance and quality](../architecture/performance-and-quality.md#performance-budgets) is met at p95 on reference hardware, in three consecutive runs. | Benchmarks in CI and on reference machines |
| **Reliable** | No text is ever lost: the fault-injection suite (process kill during save and commit, power loss, network loss mid-push, full disk, two computers editing) runs 1,000 randomized rounds without loss. A 72-hour scripted soak shows no memory growth above 10% and no crash. The round-trip corpus passes at 100%. | Fault-injection and soak reports |
| **Secure** | The OWASP ASVS Level 2 checklist and the Electron security checklist are complete. Zero high or critical CodeQL or dependency findings. The leak check catches every planted secret in its test suite. The sealing design and code have an independent review (the security-review agent and a human reviewer). The threat model is current. | Checklists, scan reports, review record |
| **Private** | A network capture across every journey shows only the allowed destinations. No telemetry. Signing out or removing a workspace deletes exactly what the data inventory lists. | Capture report, inventory test |
| **Accessible** | WCAG 2.2 AA across the app (including the visitor view, *Unlock*, and *Use this app for yourself*), public and shared pages, and these docs. Every scenario can be completed with the keyboard alone, and with NVDA, Narrator, VoiceOver (macOS and iPadOS), and Orca. Windows contrast themes, 200% zoom, and 320 px reflow work. | Audit record, screen-reader journey scripts |
| **International** | IME, dead-key, AltGr, and non-Latin layout suites pass. Right-to-left notes render and edit correctly. Pseudo-localized builds (40% longer, accented strings) show no clipping or truncation. | Input suites, pseudo-localization screenshots |
| **Installable and updatable** | Clean installs pass on the whole support matrix. Updating from the previous release keeps every note and setting. Uninstalling leaves only what the docs say. Release assets have checksums, an SBOM, and attestations that verify. | Install matrix report, update test, `gh attestation verify` |
| **Usable** | Five people new to Focus Notes, in a moderated test: at least four write their first note in the browser, and finish the desktop setup and save a note to GitHub, each in five minutes or less without help, and the average System Usability Scale score is 80 or higher. | Usability test notes |
| **Documented** | Docs describe the release exactly. Release notes, the privacy statement, and `SECURITY.md` are current. | Docs review |
| **Licensed** | The license check passes and `THIRD_PARTY_NOTICES` is complete. | CI run |
| **Operable** | The release runbook has been rehearsed, including pulling a bad release and pointing users back to the previous one, and a security-report drill has been run. | Rehearsal record |

From M7, **agent-ready** joins the bar: the MCP server passes the MCP Inspector checks, the agent permission and safety tests pass, and every agent change is attributed and undoable.

<h2 id="project-definition-of-done" data-reader-personas="product design engineering">Project definition of done</h2>

Focus Notes is done (as planned, before the *Later* components) when:

1. **Every stage from M0 to M8 has passed its gate**, and every P0 and P1 requirement passes.
2. **The final release meets the release definition of done in full**, including the agent-ready bar and signed, automatically updating builds.
3. **All 11 customer promises are demonstrably kept**: for each promise, its scenarios pass as journey tests, and the owner signs off on a walkthrough.
4. **The spec and the product agree.** Every docs page is `stable`, every requirement links to its passing tests, and the chain check and the plan check pass.
5. **Every decision is closed.** No decision remains *Proposed*.
6. **Every risk is closed or explicitly accepted** by the owner.
7. **No S1, S2, or S3 defects are open.**
8. **Anyone can carry it on.** A new contributor (person or agent) can go from a fresh clone to a merged, gate-passing change using only `AGENTS.md`, these docs, and the work graph.

<h2 data-reader-personas="product engineering">Plan decisions</h2>

| ID | Decision | Rationale | Alternatives rejected |
| --- | --- | --- | --- |
| PD-DOD-01 | Five nested levels, each with evidence. | Agents and people need the same unambiguous test for "done", and each level builds on the one below. | One general checklist, which is either too vague for a pull request or too heavy for a stage. |
| PD-DOD-02 | The full quality bar applies from the first stage, scoped to what exists. | Quality debt in safety, accessibility, and the design system compounds, and is the hardest debt to pay back. | A hardening stage before 1.0. |
| PD-DOD-03 | Demo scripts become journey tests. | Visible progress stays visible: a later change can't break an earlier stage's promise unnoticed. | Manual demos only. |
| PD-DOD-04 | Measurable bars with named evidence, including usability. | "Done" decided by numbers and records, not by how confident someone feels. | Qualitative sign-off. |

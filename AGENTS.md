# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project context: read this first (the owner, 16 Oct)

- **This is a development-stage hobby project by one person.** It isn't a corporate project. Nobody but the owner looks at the code, the app or the websites.
- **Everything here exists so the owner can move fast.** They review by hand and push several parts forward at once. Process is there to help that, never to slow it.
- **Don't gate on artificial restrictions.** There's no audience, no press and no reputation to protect. Anything can go live; almost no one will visit.
- **Do what the owner asks, directly.** When they ask for something (publish it, show it, change it), do that first and in the simplest way. Don't hold it behind checks that don't apply to it. If a rule below seems to block a direct request, the request wins; say what you skipped in one line.
- **What still matters, because it's real:**
  - the owner's own notes are never lost or overwritten (data safety);
  - private notes and secrets never become public;
  - the owner's computer isn't slowed down or taken over (close every app instance you start).

## What this repository is

Focus Notes, a calm, Markdown-native writing app. **Status: M0 to M7 are built and verifying, and M8 is under way; the current state, what's left and what to do next are in [Roadmap → Current state](documentations/plan/roadmap.md#current-state-16-october-evening).** Work follows [the agentic loop](documentations/plan/agentic-loop.html) over [`work-graph.json`](documentations/plan/work-graph.json).

- `apps/desktop/`: the Electron shell, the renderer and gallery entries, and the journey tests (`e2e/`).
- `packages/`: `tokens`, `ui` (the design system), `ui-runtime` (renderer and `ui:check`), `views` (view documents and messages), `core` (state, commands, view models), `markdown`, `editor`.
- `tools/`: the repository checks and `bench/`. `schemas/`: JSON Schemas for every file format and the generated UI schema.
- `templates/workspace/`: the source of the template repository people copy to make their instance (`focus-notes-workspace`).
- `site/`: the product site's content (D-167): the landing page (`landing.json`, D-174, with the downloads as its last section, D-184), `privacy.md`, `demo.md` and `media/` (screenshots from the `site` catalogue). `tools/site/build.mjs` renders it through the design system; see [Product site and help](documentations/product/site-and-help.md#how-the-site-is-built).
- `documentations/`: the spec, published as a [Slate](https://github.com/prabinpebam/slate) documentation site, and Help for people who write (`documentations/help/`, D-181).
- `slate/`, `agentic-craft/`, `agent-orchestration/`: the three agent kits, pinned as Git submodules. Don't edit them here; see [Agent kits](#agent-kits-d-205).
- `.github/skills/` and `.github/agents/`: `skills/slate/` is the adapter that loads Slate's rules; the other skills and `design-system-auditor`, `grounding-critic` and `throughput-reviewer` are the kits' installed copies; `builder`, `orchestrator`, `verifier`, `code-reviewer`, `design-system-reviewer`, `accessibility-reviewer`, `security-reviewer` and `docs-keeper` are this project's roles in [the agentic loop](documentations/plan/agentic-loop.html#roles).

The planned code layout (a pnpm monorepo) is in [`documentations/plan/distribution.md`](documentations/plan/distribution.md).

## Agent kits (D-205)

Work runs on three kits, each owning one part and pinned at the repository's root:

| Kit | Owns | Start with |
| --- | --- | --- |
| [Slate](https://github.com/prabinpebam/slate) (`slate/`) | Writing and checking the documentation site | the `slate` skill |
| [agentic-craft](https://github.com/prabinpebam/agentic-craft) (`agentic-craft/`) | What's worth building and what success means: the chain, assumptions, Definitions of Done, design system, copy, waits, performance | the `craft` skill |
| [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) (`agent-orchestration/`) | How work runs: modes, bounds, checks by tier, progress reviews, logs and handoffs | the `orchestrate` skill |

- **The installed copies belong to the kits.** Never edit a kit skill or agent in `.github/`; project specifics go in the kits' facts sections at the end of this file, which their installers keep. To update a kit: `git -C <kit> pull`, then `node tools/agent-kits.mjs --sync`, and commit the pointer with the copies, separately from code and spec changes. `pnpm check` runs `node tools/agent-kits.mjs`, which fails when a copy differs from its pinned kit (it skips kits that aren't checked out, as on CI).
- **When they disagree, the first of these wins:** the project context at the top of this file (the owner's direct requests, data safety, privacy); then this file's rules and working modes and the spec pages they link; then the kits' facts sections; then the kits' skills. How the kits' general rules apply here:

| The kits say | Here |
| --- | --- |
| Chain: promise → jobs → user-can → task flows → UI | Promise → scenario → user can → view or component → design decision → requirement ([chain.md](documentations/product/spec/chain.md)); a scenario's steps and the experience pages are its task flows, and `pnpm check` checks the chain. The `grounding-critic` critiques against it. |
| IDs P1, J1, U1, A1, O1, PD1 | The project's IDs in the Craft facts. Decision numbers come from the orchestrator, never picked by a builder. |
| Four tiers: tokens → fundamentals → compounds → layouts → views | The six layers of [the design system](documentations/design/system/overview.html): tokens → primitives → layouts → compounds → fragments → views. Layouts sit below compounds, primitives may use other primitives, and views and fragments are JSON checked by `ui:check`. The `design-system-auditor` audits against these layers, tokens, states, accessibility and copy; the project's `design-system-reviewer` adds the visual vs verbose score, view documents and visual baselines. UI changes get both. |
| Goal modes and attention | Attended is *work with me*, unattended is *keep going unattended* (D-113), with the same 15-minute and 45-minute shapes. The default goal is *make this production-ready*; *show me the UX sooner* is for a surface the owner hasn't seen (a candidate preview or a `vq-*` branch); *prove the risky assumption* is a spike against a risk in `risks.md`. |
| Validation tiers 0–3; the full suite only on a trigger | Tiers 0–2 locally. For desktop and shared app code, the full suite on CI for the pushed work branch is the merge gate, with no exceptions; site, docs and web-only changes ship on their own checks (D-180). |
| Never merge, push, deploy or publish unless allowed | The Orchestration facts allow what this file allows; data safety, private content and releases still escalate. |
| Work plan, progress log and handoff templates | The work graph and the owner's feedback queue are the work plan. Log lines use the kit's format (`2026-10-24 11:40 [production-ready · with-me] WP-8.2: …`) in the progress log; handoffs go where the facts say. The kits' templates aren't copied. |
| A copy glossary | None yet: the Words section of [foundations](documentations/design/foundations.md) and [Writing Help](documentations/design/help-writing.md) are the copy rules. |

## Rules

1. **Never edit or delete `documentations/seed-specs.md`.** The owner wrote it by hand. It is the source of truth that everything else interprets.
2. **Follow the articulation chain.** Every view, component, behavior, and requirement traces customer promise → scenario → user can → view or component → design decision → requirement. Change the chain first, then the views and requirements that depend on it. See [`documentations/product/spec/chain.md`](documentations/product/spec/chain.md).
3. **Record decisions.** Any assumption beyond the seed spec goes into [`documentations/plan/decisions.md`](documentations/plan/decisions.md) with an ID, a status, and the pages it affects.
4. **Follow Slate.** One H1 per page, a TL;DR on every page, Slate components only, SVG figures that use tokens and prefixed IDs, and no meta-documents (put findings into the durable page they belong to). Register every page in `documentations/docs-manifest.json`.
5. **Every requirement is planned.** Each requirement ID in `product/requirements.md` belongs to exactly one work package in `plan/work-graph.json` and one stage in `plan/roadmap.md`. When building, follow [the agentic loop](documentations/plan/agentic-loop.html) and the [definition of done](documentations/plan/definition-of-done.md).
6. **Design system.** The app's interface is data. When code arrives, markup and styles may exist only in `packages/ui` primitives and layouts, every visual value is a token, and views are JSON documents validated by `ui:check`. Never add HTML, CSS, inline styles, or literal UI strings anywhere else. See [`documentations/design/system/overview.html`](documentations/design/system/overview.html).
   - **Visual over verbose.** Every surface that presents a task or a state must pass the [visual vs verbose score](documentations/design/visual-score.html) threshold: VVS ≥ 70 (≥ 80 for first-run steps and empty states), no criterion below 10. Prefer the right element over sentences: a profile card, option cards, a badge, a stepper, not prose describing what the UI could show (D-127).
   - **No frozen waits, no glitches** ([Perceived performance](documentations/architecture/perceived-performance.md), D-148, D-149):
     - A new operation that can take longer than 100 ms gets a row in the wait inventory: its class (instant, responsive, waiting, long), its pattern, the place its sign shows, its words, and its `fn:` measure.
     - It goes through the task tracker, and long work streams its steps and progress. A single unnamed `busy` is a defect.
     - Never call `webContents.reload()` to change state, and never unmount a view before its replacement is ready: no frame may be blank, white or unstyled (DSK-09).
     - The window stays draggable and takes the mouse in every state.
     - Direct manipulation is attached to the hand: a dragged window follows the pointer within a frame, with no queued moves (PRF-14, D-151).
     - Controls answer on pointer-down in the next frame, and the main process never blocks.
7. **Licenses.** The app is MIT. Only permissive dependencies are allowed (see the licensing policy in `plan/decisions.md`).
8. **Package sources.** Use the package sources and registries your environment requires. Never commit secrets or tokens.

## Working modes and throughput (D-113)

The loop optimizes validated progress toward the definition of done per hour. See [the agentic loop → Throughput](documentations/plan/agentic-loop.html#throughput).

- **Attended** (the owner is testing and giving feedback): work the owner's feedback queue, one fix at a time, about 15 minutes from report to a fix they can see. Run only the fast checks for what changed (5 minutes or less), and let CI run the full Windows suite. One builder at a time by default. A second is allowed only when both tasks are the owner's, touch disjoint files, can land on their own, and will each produce something testable within about 15 minutes. Never three. Give each builder its own worktree and shell before it starts. A large request is split into slices, with the smallest visible slice landing first.
- **Candidate previews:** when CI is still running on a head the owner is waiting for, and it would save 5 minutes or more, build that exact commit locally after the fast checks. Put it in `focus-notes-work\preview\candidates\<commit>`, label it "pending CI", and open it with a fresh profile. The scheduled Preview only ever takes green `main`.
- **Unattended** (the owner is away): do deeper, systematic work on the critical path in 45-minute time-boxes, push the work branch so CI runs the full Windows suite before merging, and leave a handoff summary for the owner's return. At most two builders, on areas that don't overlap.
- **Gates match what changed (D-180, D-206).** A change to the site, docs or the web app only (`site/`, `tools/site/`, `documentations/`, `apps/web/`, site-only components) ships on the checks that cover it: `pnpm check`, typecheck, unit tests, the site and web journeys and, for anything published, a security review. It isn't held for the desktop journey suite. When the owner asks for something to be published, publishing is never blocked by unrelated desktop defects. Desktop and shared app code still go through the full Windows gate below.
  - **No desktop paths, no CI wait (D-206).** When nothing under `apps/desktop/`, `packages/`, `templates/`, `schemas/`, `tools/release|bench|dev/`, the root manifests or lockfile, `.npmrc`, `.nvmrc` or `ci.yml` changed (docs, the site, `AGENTS.md`, `.github/agents|skills/`, the kit submodules, repository checks and their tests), run the related fast checks locally, commit straight to `main` and push. Don't open a work branch or watch CI for it; CI skips the desktop build, budgets and journeys for such pushes by the same path list (`ci.yml` → `changes`).
  - **Screenshot code isn't app code (D-224).** The screenshot catalogues (`apps/desktop/e2e/*-catalog.spec.ts`, `scene-capture.ts`, `fre-fakes.ts`), `tools/review/`, `store/` and the Store screenshot and listing scripts (`tools/release/store-screenshots.py`, `store-logos.py`, `store-listing.mjs`) never ship in the app. After `pnpm check`, the desktop typecheck and a local capture, they go straight to `main`; CI drops them before its path test. Hand the owner the screenshots, builds or release files first; a merge never holds them up.
  - **Don't fix what you weren't asked to.** A red check unrelated to the task (a new advisory, a flaky journey) is reported in one line and queued, never fixed inside the task, unless it blocks landing the task itself.
- **The merge gate has no exceptions** in either mode for desktop and shared app code, apart from the attended fast loop above. A work branch merges only when its Windows CI is green. A failure that's "the same as main" or "a flake" isn't green: either fix it first, or quarantine it explicitly, by marking the check skipped with a recorded scope, owner and expiry in `documentations/plan/gate-evidence.md`. Two ad hoc exceptions on 15 October let a regression into main (D-113).
- **Merge exactly what was tested.** Main only fast-forwards to a commit whose own Windows CI run is green. When several branches are ready, combine them on one merge-candidate branch (`fix-merge-candidate`, main plus the branches in landing order), run CI once, and fast-forward main to that head. Don't re-run each branch one after another.
- **Decision numbers are assigned by the orchestrator.** Each builder brief names the D- numbers that builder may use. Builders never pick the next free number themselves, because parallel branches collided four times on 15 October (D-113).
- **Watch CI for anomalies, not just completion.** A watcher flags any step that runs more than twice its usual time (the Windows journey shards take about 5–8 minutes, the unit tests about 2), so a hang is investigated in minutes, not after an hour.
- **Don't widen a branch whose CI is green.** It lands at its time-box. Windows only until v1 is in the Microsoft Store (D-211, pausing D-196): CI runs on Windows, and `test (windows-latest)` and the four journey shards are the merge gate.
- **The owner tests through Preview, any time.** The "Focus Notes Preview" desktop shortcut opens the newest green `main`, built by `E:\Projects\side-projects\focus-notes-work\preview\update.ps1` every 10 minutes (a scheduled task). Never kill, replace or build into the Preview's folder. Getting changes to the owner means merging them green; there's no separate restart step (D-122).
- **Always:** Windows first (D-112). Merge what works at the end of every time-box, and keep branches no older than about an hour. Never widen a running task with new feedback; queue it. Log one timestamped line per step to `E:\Projects\side-projects\focus-notes-work\logs\builder-progress.log` (outside the repository). Journeys never take the owner's focus (`FOCUS_NOTES_E2E=1`).
- **Everything outside the repository lives in one folder (D-227).** `E:\Projects\side-projects` holds the owner's other projects too, so Focus Notes adds only `focus-notes` (this repository) and `focus-notes-work` beside them. In `focus-notes-work`: `worktrees\<branch>` (every builder's worktree: `git worktree add ..\focus-notes-work\worktrees\<branch> -b <branch>`), `preview\` (the owner's Preview), `release\<version>\` (packages and Store files), `review\<label>\` (fetched captures), `logs\`, `handoffs\` and `scratch\` (throwaway probes, logs and downloads). Never create a folder or file directly in `side-projects`. When a branch has landed, remove its worktree (`git worktree remove`, or `rmdir /s /q` and `git worktree prune` when it holds a submodule) and its local branch.
- **Never take over the owner's screen.** Local runs use FOCUS_NOTES_E2E=1 and never maximize, snap, full-screen or move a window over the owner's apps, send OS keys, or take full-screen screenshots. Screen-level journeys run on CI (D-141). Local journey windows are invisible (opacity 0) so they never sit over the owner's apps; `FOCUS_NOTES_E2E_VISIBLE=1` shows them when the owner wants to watch (D-209).
- **Never leave app instances open.** Every local run that starts the app (journeys, benches, captures, `pnpm dev`) ends with `pwsh tools/dev/close-test-apps.ps1`, even when it failed. At most one candidate preview is open at a time: close the previous one first (`-KeepCandidate <commit>` keeps the one the owner is testing). The script never touches the owner's Preview or other projects' apps.
- **`FOCUS_NOTES_E2E_ALLOW_SCREEN=1` is CI-only.** Never set it locally. Review captures at every window size (default, 480 × 360 and 1600 × 1000, light and dark) come from the **Review captures** workflow (`.github/workflows/review-captures.yml`), which runs on every push to a `vq-*` branch, or by hand: `gh workflow run review-captures.yml --ref <branch> -f catalog=fre-catalog`. Fetch the result with `node tools/review/fetch-captures.mjs --branch <branch> [--label <label>]`, which puts it in `E:\Projects\side-projects\focus-notes-work\review\<label>\`. A local capture (`node tools/review/capture.mjs fre-catalog`) takes the default window only. Catalogues are listed in `tools/review/catalogs.mjs` (D-146).

## Validate before committing

The docs are always served from this working copy at <http://127.0.0.1:8787/documentations/> (the owner, 25 October: "Keep the slate site running at all times"). The **Focus Notes Docs site** scheduled task runs `python -m http.server 8787 --bind 127.0.0.1` from the repository's root. It starts at logon, and its 5-minute trigger brings it back if it stops. Don't start another server on 8787, and don't stop this one. If it's down:

```powershell
Start-ScheduledTask -TaskName 'Focus Notes Docs site'
```

Check the Slate runtime:

```powershell
node .\slate\scripts\runtime-host.mjs check --repo . --host documentations
```

Then check in a browser that every changed page renders with one H1, that its links and anchors resolve, and that figures fit and stay legible in light and dark themes.

## Build and test

```powershell
pnpm install
pnpm tokens          # build the design tokens
pnpm check           # boundaries, chain, plan, licenses, generated files, ui:check
pnpm typecheck
pnpm test            # unit tests, including the Markdown round-trip corpus
pnpm --filter @focus-notes/desktop run build
pnpm test:e2e        # journey tests against the real Electron app
pnpm bench --check   # budgets (QLT-05)
pnpm dev             # run the app; pnpm gallery for the component gallery
```

A changed contract or view means regenerating the UI schemas (`pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write`) in the same commit; `pnpm check` fails while `schemas/ui/` or any other committed generated file is stale (D-138).

## Notes in this repository (AGT-07)

This repository is also the owner's own Focus Notes instance, so the workspace rules apply here too. The template's [`templates/workspace/AGENTS.md`](templates/workspace/AGENTS.md) has them in full; in short:

- **Layout.** Public notes in `notes/`, published on GitHub Pages. Private notes in `private/notes/`, where `private/` is a Git submodule pointing at a private repository; `private/access.json` holds share grants and the vault's key. `.focus-notes/workspace.json` names the workspace format. The template's source is `templates/workspace/`, published as `focus-notes-workspace`.
- **Front matter.** Optional. The app writes only `id`; never change or remove one, and keep other keys as they are. The first H1 is a note's title.
- **Links.** Relative Markdown links (`[see](../ideas.md)`). Renames and moves update them in the same commit. A public note never links to a private one.
- **`private/` rules.** Never copy, quote, or summarize private content into `notes/`, commit messages, issues, pull requests, or logs; never make the private repository public; never print or edit `access.json`'s secrets and keys. Commit and push in `private/` first, then the pointer; pull `private/` on its own, never recursively.
- **Commit style.** Small commits with plain subjects that say what changed (`Update notes/ideas.md`, `Move 2 items to notes/archive`, `Update private notes to 1a2b3c4`); code commits name the area and the requirement IDs. Never force-push published history or skip hooks.

## Commits

Small, descriptive commits. Keep `slate/`, `agentic-craft/` and `agent-orchestration/` updates (with their installed copies) separate from spec changes.

<!-- agentic-craft:start -->
## Craft (agentic-craft harness)

This project uses the [agentic-craft](https://github.com/prabinpebam/agentic-craft) skills for product reasoning: what is worth building and what success means. Start with the `craft` skill; it routes to the rest: `ground` (promise → jobs → user-can → flows → UI), `assumptions`, `definition-of-done`, `design-system`, `ui-copy`, `perceived-performance`, `performance`. Agents: `grounding-critic`, `design-system-auditor`. These skills define product intent and success criteria; they don't prescribe how the work is carried out.

### Project facts (fill in; the skills read these)

- **Product artifacts:** the chain in `documentations/product/spec/` (`customer-promises.md`, `scenarios.md`, `user-can.md`, rules in `chain.md`), then `documentations/design/information-architecture.html` and `documentations/product/requirements.md`; assumptions and risks in `documentations/plan/risks.md`; decisions in `documentations/plan/decisions.md`; the source of truth `documentations/seed-specs.md` (read-only) · Definitions of Done in `documentations/plan/definition-of-done.md` (work package, Help article, stage, release, project), evidence in `documentations/plan/gate-evidence.md`
- **Design system:** tokens `packages/tokens`, built with `pnpm tokens` (`node packages/tokens/build.mjs --check` for the tier rules) · components by layer `packages/ui` (primitives, layouts, compounds), fragments and views as JSON in `packages/views`, checked by `pnpm ui:check`; rules in `documentations/design/system/overview.html` · library at `pnpm gallery` · glossary: none yet; copy rules in `documentations/design/foundations.md` (Words) and `documentations/design/help-writing.md`
- **Performance:** benchmark `pnpm bench --check` · baseline `tools/bench/budgets.json` (per platform, written with `--write-baseline`) · budgets `tools/bench/budgets.json`; the wait inventory in `documentations/architecture/perceived-performance.md`
- **IDs:** promises `CP-…` (the kit's P1), scenarios `SC-…` (J1), user-can `UC-…` (U1), views and components `IA-VIEW-…`/`IA-CMP-…`, design decisions `DD-…`, requirements such as `EDT-14`, risks `R-…` (A1), decisions `D-…` (O1, numbered by the orchestrator), Definition of Done rows by level and stage (PD1, 1.1)
<!-- agentic-craft:end -->

<!-- agent-orchestration:start -->
## Orchestration (agent-orchestration harness)

This project uses the [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) skills to carry out work. Start with the `orchestrate` skill: it picks the mode (show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended) and routes to `execution-modes`, `stage-validation`, `progress-review` and `coordinate`. Agent: `throughput-reviewer` (about every 30 minutes of running work). These skills decide how work is run, not what to build; product intent comes from the files named below when there are any.

### Project facts (fill in; the skills read these)

- **Product intent:** the Craft facts above; what's built and what's next in `documentations/plan/roadmap.md` (Current state)
- **Work plan:** `documentations/plan/work-graph.json` (work packages `WP-…`, kept in step with `documentations/plan/implementation-plan.md`); with the owner here, their feedback queue comes first, one item at a time
- **Commands by validation tier:** unit, related files `pnpm exec vitest run <test files>` · types `pnpm --filter <package> run typecheck` (all: `pnpm typecheck`) · one end-to-end test `pnpm --filter @focus-notes/desktop run build`, then `pnpm --filter @focus-notes/desktop exec playwright test e2e/<file> --workers=1 -g "<title>"` with `FOCUS_NOTES_E2E=1`, always followed by `pwsh tools/dev/close-test-apps.ps1` · full suites `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:web` (CI runs them on Windows only until v1 is in the Store, D-211; the desktop build and journeys only when desktop paths changed, D-206) · production build with budgets `pnpm build`, then `pnpm bench --check` on a quiet machine
- **Progress log:** `E:\Projects\side-projects\focus-notes-work\logs\builder-progress.log` (outside the repository); handoffs in `E:\Projects\side-projects\focus-notes-work\handoffs\<yyyy-mm-dd-hhmm>.md`
- **Branches and merges:** work branches `wp-*`, `fix-*` or `vq-*`, each builder in its own worktree, for desktop and shared app code only; docs, site, agent-file, kit and repository-check changes go straight to `main` after their fast checks, with no CI wait (D-206) · merge app code by fast-forwarding `main` to a commit whose own CI run is green (several ready branches: one `fix-merge-candidate`) · deploy watched with `gh run watch <run>` (CI, Pages, `preview-channel.yml`); Preview picks up green `main` within 10 minutes · the agent may: commit, push work branches, fast-forward `main` once CI is green (or a failure is quarantined in `gate-evidence.md`), and publish the site and docs when the owner asks (D-180); releases and tags only when the owner asks · must never break: the owner's notes and private content, green `main`, the owner's Preview (never kill, replace or build into its folder)
- **Reviews and escalation:** review every 30 minutes (`throughput-reviewer`) · always escalate: a spec gap or contradiction, anything that could lose the owner's notes or make private content or secrets public, a new network destination or a non-permissive license, a release, force-pushing published history, and a fix that failed three rounds
<!-- agent-orchestration:end -->

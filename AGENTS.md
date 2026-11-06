# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project context: read this first (the owner, 16 Oct)

- **This is a development-stage hobby project by one person.** It isn't a corporate project. Nobody but the owner looks at the code, the app or the websites.
- **Everything here exists so the owner can move fast.** They review by hand and push several parts forward at once. Process is there to help that, never to slow it.
- **Don't gate on artificial restrictions.** There's no audience, no press and no reputation to protect. Anything can go live; almost no one will visit.
- **Do what the owner asks, directly.** When they ask for something (publish it, show it, change it), do that first and in the simplest way. Don't hold it behind checks that don't apply to it. If a rule below seems to block a direct request, the request wins; say what you skipped in one line.
- **Judgement over procedure (D-255).** Every rule and gate here is the owner's preference, and each serves throughput: useful, validated outcomes per unit of time. Before running a step, ask whether it moves the owner's current goal forward. If it doesn't, skip it and say so in one line. Size every check to the risk of the change.
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
| The mode ladder (strict design → show me the UX sooner → make this production-ready) and attention | The same ladder (D-261). *Strict design* is a new surface or an exploratory design, shown as view documents with the real design system before any wiring ([here](#working-modes-and-throughput-d-113)); *show me the UX sooner* is a working surface the owner hasn't approved (a candidate preview or a `vq-*` branch); *make this production-ready* is the default once the owner signs off; *prove the risky assumption* is a spike against a risk in `risks.md`. Attended is *work with me*, unattended is *keep going unattended*, in 15-minute and 45-minute shapes (D-113). |
| Validation tiers 0–3; the full suite only on a trigger | Before sign-off, only the build, the typecheck and `ui:check` ([the rule](#mandatory-no-tests-on-unapproved-designs-the-owner-1-november)). Otherwise tiers 0–2 locally, and the full suite only under [Before the full suite](#before-the-full-suite-d-255). CI gates desktop runtime changes only; low-risk UI changes (D-255) and site, docs and web-only changes (D-180) land on their fast checks. |
| Never merge, push, deploy or publish unless allowed | The Orchestration facts allow what this file allows; data safety, private content and releases still escalate. |
| Main chat → one coordinator → workers; the guard enforces each role | The same roles, marked for the guard, within the builder limits in [Working modes](#working-modes-and-throughput-d-113). Ready items beyond those limits wait in the coordinator registry with their trigger. |
| A review build at the last validated commit, refreshed by the agent | The owner's Preview, refreshed by its scheduled task from green `main`; agents never touch its folder. A candidate preview is the only build an agent opens for the owner. |
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
   - **The writing window is sacred** (the owner, 3 November): its contents are as designed; never add anything to the main window without the owner's explicit direction. Project identity in a window is only the colour outline, the project pill and the optional logo watermark. Dialogs and modals never get a coloured title bar or project tint. Dialogs and modals never get a coloured title bar or project tint. Before adding any element, check the owner's source notes and next-direction.md.
   - **Buttons are fixed in the system, not per screen** (the owner, 6 November; D-354): every button variant has token-driven inline padding greater than zero on both sides, and rest, hover, pressed, focus, disabled, pending and selected share one box. Only colour, ink and the focus ring change, painted on the button itself, never on an offset layer. The design-system check fails on zero or literal padding and on any state geometry drift; never patch one screen's button.
   - **Disabled preserves the value** (the owner, 6 November 10:39; D-367): disabled = the same colours at `opacity.disabled`, never a recolour. Fade the whole control, label and description once. Switch track-to-label spacing is a positive component token (8 px by default), owned by the Switch's gap. Dependents under an Off parent are disabled, unfocusable and inoperable, keeping their reason; pending locks still retain focus.
   - **On/off settings use a Switch** (the owner, 6 November; D-355, D-368): every binary setting uses the Switch primitive. Writing-window toolbar modes (Focus mode, light/dark) stay icon toggle buttons with `aria-pressed`, as do editor formatting toggles; segmented choices need three or more options. `ui:check` rejects other binary buttons. The writing window is sacred: a rule change never alters it without the owner's direction.
   - **One pending pattern per need** (the owner, 6 November; D-356): compact controls show only the own-border pending arc, then a success or danger outline. No overlaid spinners, and no second variant of a state where one does the job; remove duplicates rather than add them.
   - **Notifications dismiss themselves** (the owner, 6 November; D-357): auto-dismiss is the default, including confirmations with Undo. Must-read (manual dismiss) only when the person has to read or decide something, with the reason in the notification inventory of the UI states audit; a test fails on any notification missing from it.
   - **No visual noise (the owner, 5 November):** never restyle an approved component as a side effect; members of an enclosed group (toolbar, segmented control, card) get no border or resting fill of their own; drag, hover and selection cues are transient. See the visual-noise skill (D-345).
7. **Add nothing the owner didn't ask for** (the owner, 3 November). Before adding any element to a view, mock or spec, check the owner's source notes (`focus-notes-features.md`, `images-in-focus-notes.md`, `focus-notes-launch.md`, kept word for word in [next-direction.md](documentations/plan/next-direction.md) and [Images](documentations/experience/images.md)); if they don't ask for it, don't add it. Project identity in a window is only the colour outline, the project pill and the optional logo watermark.
8. **Licenses.** The app is MIT. Only permissive dependencies are allowed (see the licensing policy in `plan/decisions.md`). The exceptions are the Microsoft Store package's own Git (GPL-2.0, a separate program the app starts, never linked; D-228) and the unmodified Electron runtime's separately replaceable FFmpeg DLL (LGPL-2.1+) and Chromium's MPL-2.0 code (D-269). Electron's Microsoft DirectX files ship under Microsoft's terms, stated in `apps/desktop/build/license-terms.txt` (D-271).
9. **Package sources.** Use the package sources and registries your environment requires. Never commit secrets or tokens.

## Working modes and throughput (D-113)

The `orchestrate` skill's pre-action checklist, the mode ladder in `execution-modes` and the guard hook apply as written; this section adds only what's specific to Focus Notes. Run the smallest check that covers the change: a CSS, token or padding change gets `pnpm check` and a visual look; a view JSON change gets `ui:check`; runtime code gets its typecheck, related unit tests and one related journey.

Agents never block on inconsequential prompts (browser-tab sharing, pickers, wording); they decide and record. Critical or irreversible actions (owner data, publishing, real accounts, releases, licences) always ask the owner first (the owner, 3 November).

Documentation rendering checks are headless only: the Slate runtime check, requests to the existing local server, or headless Playwright. Never invoke browser-tab sharing or another interactive tool for these checks; close every process started. Workers route critical decisions through the owner's original main chat, not a blocking picker.

- **Set the mode** for the guard in each worktree: `node .github/hooks/orchestration-clock.mjs mark mode design|ux-sooner|assumption|production-ready`, or write the value in `.agent-orchestration/mode` (ignored by Git). The owner's main chat marks itself `mark role main` and the coordinator `mark role coordinator` (D-261).
- **Strict design here:** screens built from view documents and fragments in `packages/views` with the real design system, shown in the gallery (`pnpm gallery`) or as a candidate preview from a `vq-*` branch. No wiring in `packages/core`, the main process, preload or IPC until the owner approves the design.

### MANDATORY: no tests on unapproved designs (the owner, 1 November)

The rule is the kit's (`execution-modes`). Here, before the owner's explicit sign-off on the UX and UI, only these run: `pnpm --filter @focus-notes/desktop run build` (or the package's own build), `pnpm typecheck` (or `pnpm --filter <package> run typecheck`) and `pnpm ui:check` (also run by `pnpm check`). Never journeys, `pnpm test`, catalogues or the Review captures workflow, accessibility or render passes, visual baselines, `pnpm bench` or a CI wait.

- **Rapid iteration (the owner, 4 November):** UI first, no tests, wiring only after the owner's explicit UI approval.
- **A built screen must match its approved mock:** compare side by side in the built app before reporting ready; a mismatch is a defect (the owner, 4 November). Where possible the mock renders the app's own view document over fake data, so the two can't drift.

### MANDATORY: handing over is not completion (the owner, 1 November)

The rule is the kit's (`orchestrate`, checklist item 3): handed-over or running work is "Handed over: …" or "In progress: …", never "done", and never the completion tool.

### Before the full suite (D-255)

The kit's full-suite trigger (`stage-validation`) applies. Here the full suite is `pnpm test:e2e` (all the journeys) plus a full CI wait, and "runtime the fast checks can't cover" means main, preload or IPC, file I/O and saving, sync or Git, security or privacy, or build and packaging, never just styles, tokens, copy, view JSON or one component.

### Modes, gates and merges

- **Attended** (*work with me*): the owner's feedback queue, one fix at a time, about 15 minutes from report to a visible fix, fast checks of 5 minutes or less. Do only the item the owner named: never add the next items, a rebuild or a release to a brief unless the owner asks (the owner, 2 November). One builder; a second only when both tasks are the owner's, touch disjoint files, land on their own and are each testable within about 15 minutes. Never three. Each builder gets its own worktree and shell. Split a large request; the smallest visible slice lands first.
- **Land reviewable milestones continuously (the owner, 5 November; replaces the 2 November batching rule).** Each slice the owner can see lands on `main` as soon as its own exact-head CI is green, as a fast-forward push (never force). A worker whose green head is no longer a fast-forward rebases and runs the gate once more. No big batch or release at the end: Preview shows each milestone within 10 minutes, and main tells the owner what to try.
- **Unattended** (*keep going unattended*): 45-minute time-boxes on the critical path, at most two builders on areas that don't overlap, desktop runtime work pushed to a work branch for CI and batched on one merge candidate, and a handoff for the owner's return.
- **Candidate previews:** when CI is still running on a head the owner is waiting for and it saves 5 minutes or more, build that commit locally after the fast checks into `focus-notes-work\preview\candidates\<commit>`, label it "pending CI" and open it with a fresh profile. At most one is open. An owner review is a normal Windows Shell launch through `Open review build.cmd`, with every `FOCUS_NOTES_E2E*` variable removed: never E2E or `showInactive`. "Launched" requires a live process after at least 20 seconds, a titled non-zero window handle, non-minimized/non-cloaked/non-transparent on-screen bounds, and read-only proof that some of its interior is actually exposed (for example `WindowFromPoint`, not just `IsWindowVisible`). Never force focus or send OS input; leave an owner-requested review open.
- **Gates match what changed (D-180, D-206, D-224).**
  - Site, docs and web-only changes ship on `pnpm check`, typecheck, unit tests, the site and web journeys and, for anything published, a security review. A publish the owner asks for is never blocked by unrelated desktop defects.
  - With no desktop paths changed (`apps/desktop/`, `packages/`, `templates/`, `schemas/`, `tools/release|bench|dev/`, the root manifests or lockfile, `.npmrc`, `.nvmrc`, `ci.yml`), commit straight to `main` after the related fast checks, with no work branch and no CI wait.
  - Screenshot code (`apps/desktop/e2e/*-catalog.spec.ts`, `scene-capture.ts`, `fre-fakes.ts`, `tools/review/`, `store/`, the Store screenshot and listing scripts) never ships in the app: after `pnpm check`, the desktop typecheck and a local capture, it goes straight to `main`.
  - A red check unrelated to the task is reported in one line and queued, never fixed inside the task unless it blocks landing it.
- **The merge gate is sized to the risk (D-255).** Low-risk UI-only changes (tokens, primitive styling, view documents, copy) land after their fast checks. Desktop runtime changes merge only on a green Windows CI run of the exact commit; a failure "the same as main" or "a flake" isn't green: fix it or quarantine it with a scope, owner and expiry in `documentations/plan/gate-evidence.md`. Several ready branches go on one `fix-merge-candidate`.
- **Batch CI (D-pending).** The owner: "Do we need these many and this frequent push to actions... can be optimized with much lesser number and frequency by batching it on accumulated work."
  - Push a work branch only when it's a landing candidate, never per step; bundle several ready branches on one `fix-merge-candidate`.
  - Docs-only and agent-file commits go to `main` without CI: `ci` ignores `documentations/**` (except Help, the manifest and index), root `*.md`, `.github/skills/`, `.github/agents/` and kit pointers; `vq-*` branches run only review-captures; nightly runs daily and CodeQL weekly or on code changes.
  - Don't push follow-up docs or test-only commits to `main` while another branch's gate is in flight: each move of `main` makes every in-flight branch merge again and rerun. Batch them into the next landing.
  - A candidate head the path filter skipped gets its exact-head run with `gh workflow run ci.yml --ref <branch>`.
- **Decision numbers are assigned by the orchestrator**; builders never pick one (D-113).
- **CI:** Windows only until v1 is in the Microsoft Store (D-211); `test (windows-latest)` and the four journey shards gate runtime changes. Flag any step that runs more than twice its usual time (journey shards about 5–8 minutes, unit tests about 2). Don't widen a branch whose CI is green, keep branches under about an hour old, and queue new feedback instead of widening a running task.
- **Everything outside the repository lives in `focus-notes-work` (D-227):** `worktrees\<branch>` (`git worktree add ..\focus-notes-work\worktrees\<branch> -b <branch>`), `preview\`, `release\<version>\`, `review\<label>\`, `logs\`, `handoffs\` and `scratch\`. Never create anything directly in `side-projects`. Remove a landed branch's worktree (`git worktree remove`, or `rmdir /s /q` then `git worktree prune` when it holds a submodule) and its local branch.
- **Never take over the owner's screen.** Local automated test runs use `FOCUS_NOTES_E2E=1`: journey windows are invisible (opacity 0; `FOCUS_NOTES_E2E_VISIBLE=1` when the owner wants to watch a test, D-209), and nothing maximizes, snaps, moves over the owner's apps, sends OS keys or takes full-screen screenshots. Owner review launches instead follow the normal Shell rule above, without E2E variables. `FOCUS_NOTES_E2E_ALLOW_SCREEN=1` is CI-only (D-141).
  - Never send OS-level keystrokes or mouse input, activate windows or steal focus on the owner's machine to test; drive only an invisible app window from inside its own process (the owner, 4 November). Keys go to that window through `webContents.sendInputEvent` or Playwright's `page.keyboard`, global shortcuts are checked with `globalShortcut.isRegistered`, and screenshots come from the window's own `capturePage`.
- **Never leave app instances open.** Every local run that starts the app ends with `pwsh tools/dev/close-test-apps.ps1`, even on failure. With other builders working, use `-OnlyPid <pid,…>` (try `-WhatIf` first); `-KeepCandidate <commit>` keeps the candidate the owner is testing. It never touches the owner's Preview, other projects' apps or `scratch\owner-review\` profiles (only `-IncludeOwnerReview`, when the owner asks).
- **Review captures** at every window size come from the **Review captures** workflow (`.github/workflows/review-captures.yml`), on every push to a `vq-*` branch or by hand: `gh workflow run review-captures.yml --ref <branch> -f catalog=fre-catalog`. Fetch them with `node tools/review/fetch-captures.mjs --branch <branch> [--label <label>]` into `focus-notes-work\review\<label>\`. A local capture (`node tools/review/capture.mjs fre-catalog`) takes the default window only. Catalogues are listed in `tools/review/catalogs.mjs` (D-146).

## Validate before committing

The docs are always served from this working copy at <http://127.0.0.1:8787/documentations/> (the owner, 25 October: "Keep the slate site running at all times"). The **Focus Notes Docs site** scheduled task runs `python -m http.server 8787 --bind 127.0.0.1` from the repository's root. It starts at logon, and its 5-minute trigger brings it back if it stops. Don't start another server on 8787, and don't stop this one. If it's down:

```powershell
Start-ScheduledTask -TaskName 'Focus Notes Docs site'
```

Check the Slate runtime:

```powershell
node .\slate\scripts\runtime-host.mjs check --repo . --host documentations
```

Then check headlessly that every changed page renders with one H1, that its links and anchors resolve, and that figures fit and stay legible in light and dark themes. Do not open or share an interactive browser tab.

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

This project uses the [agentic-craft](https://github.com/prabinpebam/agentic-craft) skills for product reasoning: what is worth building and what success means. Start with the `craft` skill; it routes to the rest: `ground` (promise → jobs → user-can → flows → UI), `assumptions`, `definition-of-done`, `design-system`, `spacing`, `ui-copy`, `perceived-performance`, `ui-states`, `performance`. Agents: `grounding-critic`, `design-system-auditor`. These skills define product intent and success criteria; they don't prescribe how the work is carried out.

### Project facts (fill in; the skills read these)

- **Product artifacts:** the chain in `documentations/product/spec/` (`customer-promises.md`, `scenarios.md`, `user-can.md`, rules in `chain.md`), then `documentations/design/information-architecture.html` and `documentations/product/requirements.md`; assumptions and risks in `documentations/plan/risks.md`; decisions in `documentations/plan/decisions.md`; the source of truth `documentations/seed-specs.md` (read-only) · Definitions of Done in `documentations/plan/definition-of-done.md` (work package, Help article, stage, release, project), evidence in `documentations/plan/gate-evidence.md`
- **Design system:** tokens `packages/tokens`, built with `pnpm tokens` (`node packages/tokens/build.mjs --check` for the tier rules) · components by layer `packages/ui` (primitives, layouts, compounds), fragments and views as JSON in `packages/views`, checked by `pnpm ui:check`; rules in `documentations/design/system/overview.html` · library at `pnpm gallery` · glossary: none yet; copy rules in `documentations/design/foundations.md` (Words) and `documentations/design/help-writing.md`
- **Performance:** benchmark `pnpm bench --check` · baseline `tools/bench/budgets.json` (per platform, written with `--write-baseline`) · budgets `tools/bench/budgets.json`; the wait inventory in `documentations/architecture/perceived-performance.md`
- **IDs:** promises `CP-…` (the kit's P1), scenarios `SC-…` (J1), user-can `UC-…` (U1), views and components `IA-VIEW-…`/`IA-CMP-…`, design decisions `DD-…`, requirements such as `EDT-14`, risks `R-…` (A1), decisions `D-…` (O1, numbered by the orchestrator), Definition of Done rows by level and stage (PD1, 1.1)
<!-- agentic-craft:end -->

<!-- agent-orchestration:start -->
## Orchestration (agent-orchestration harness)

This project runs work with the [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) skills. Start with the `orchestrate` skill: its **pre-action checklist** comes before every tool call and reply. It routes to `execution-modes` (the mode ladder: strict design, show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended), `stage-validation`, `progress-review` and `coordinate`. Agent: `throughput-reviewer`. The hooks in `.github/hooks/` are **mandatory**: the session clock (`orchestration-clock.json`) schedules reviews and roll-overs on active time, and the guard (`orchestration-guard.json`) denies what the session's role and mode forbid; never disable them or loosen their limits without the owner. Project rules below and in this file win over the kit's general rules.

### Project facts (fill in; the skills read these)

- **Product intent:** the Craft facts above; what's built and what's next in `documentations/plan/roadmap.md` (Current state)
- **Work plan:** `documentations/plan/work-graph.json` (work packages `WP-…`, kept in step with `documentations/plan/implementation-plan.md`); with the owner here, their feedback queue comes first, one item at a time
- **Commands by validation tier:** static and build (all a design may run before sign-off; [the rule](#mandatory-no-tests-on-unapproved-designs-the-owner-1-november)) `pnpm --filter @focus-notes/desktop run build`, `pnpm typecheck` or `pnpm --filter <package> run typecheck`, `pnpm ui:check` or `pnpm check` · unit, related files `pnpm exec vitest run <test files>` · one end-to-end test `pnpm --filter @focus-notes/desktop run build`, then `pnpm --filter @focus-notes/desktop exec playwright test e2e/<file> --workers=1 -g "<title>"` with `FOCUS_NOTES_E2E=1`, always followed by `pwsh tools/dev/close-test-apps.ps1` · full suites `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:web`, only when every item in [Before the full suite](#before-the-full-suite-d-255) is true (CI runs them on Windows only until v1 is in the Store, D-211; the desktop build and journeys only when desktop paths changed, D-206) · production build with budgets `pnpm build`, then `pnpm bench --check` on a quiet machine
- **Progress log:** `E:\Projects\side-projects\focus-notes-work\logs\builder-progress.log` (outside the repository); handoffs in `E:\Projects\side-projects\focus-notes-work\handoffs\<yyyy-mm-dd-hhmm>.md`
- **Branches and merges:** work branches `wp-*`, `fix-*` or `vq-*`, each builder in its own worktree, for desktop runtime code only; docs, site, agent-file, kit and repository-check changes (D-206) and low-risk UI-only changes (D-255) go straight to `main` after their fast checks, with no CI wait · merge runtime code by fast-forwarding `main` to a commit whose own CI run is green (several ready branches: one `fix-merge-candidate`) · deploy watched with `gh run watch <run>` (CI, Pages, `preview-channel.yml`); Preview picks up green `main` within 10 minutes · the agent may: commit, push work branches, fast-forward `main` once CI is green (or a failure is quarantined in `gate-evidence.md`), and publish the site and docs when the owner asks (D-180); releases and tags only when the owner asks · must never break: the owner's notes and private content, green `main`, the owner's Preview (never kill, replace or build into its folder)
- **Reference products:** none declared by the owner. A behaviour question is settled first by the spec or a prior decision in `documentations/plan/decisions.md`, then by the current behaviour of the comparable editors already cited there (for example Typora for focus mode and printing, VS Code for editor keys and hot exit), with the sources recorded in the decision
- **Coordinator registry:** initialized at `E:\Projects\side-projects\focus-notes-work\handoffs\registry.md`, owned by one coordinator. The work plan and progress log above remain the existing records. The registry has one row per task naming its owner worker, worktree and branch, state, trigger and completion signal. Workers report by message and a `done:` or `blocked:` line in the progress log with the commit and the checks run.
- **Review build:** the owner's Preview (the "Focus Notes Preview" desktop shortcut): the newest green `main`, rebuilt by `E:\Projects\side-projects\focus-notes-work\preview\update.ps1` every 10 minutes (a scheduled task). Never kill, replace or build into it (D-122); an agent moves it forward only by landing green `main`. For a head still in CI, at most one candidate preview in `focus-notes-work\preview\candidates\<commit>`, labelled "pending CI", opened with a fresh profile. The docs are at http://127.0.0.1:8787/documentations/, served from the working copy by the **Focus Notes Docs site** scheduled task
- **Documentation system:** the Slate site in `documentations/`: owner requirements in the chain and `product/requirements.md`, decisions in `plan/decisions.md`, the plan in `plan/work-graph.json`, every page registered in `docs-manifest.json` (never `seed-specs.md`, which is the owner's). Owner attachments and references are recorded on the page that uses them. Every increment updates it in the same commit
- **Owner's main chat:** the original main session named in the registry header (`send_message`, queue); never a successor main chat. Owner reports go only there, in at most 3 plain lines
- **Reviews and escalation:** review every 30 active minutes (`throughput-reviewer`) · roll-over limits are the session clock's in `.github/hooks/orchestration-clock.json` (90 active minutes, 600 tool calls or 2 compactions; only the owner changes them) · always escalate: a spec gap or contradiction, anything that could lose the owner's notes or make private content or secrets public, a new network destination or a non-permissive license, a release, force-pushing published history, and a fix that failed three rounds
<!-- agent-orchestration:end -->

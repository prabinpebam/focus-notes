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

Focus Notes, a calm, Markdown-native writing app. **Status: M0 (walking skeleton) is built and being verified; M1 is next.** Work follows [the agentic loop](documentations/plan/agentic-loop.html) over [`work-graph.json`](documentations/plan/work-graph.json).

- `apps/desktop/`: the Electron shell, the renderer and gallery entries, and the journey tests (`e2e/`).
- `packages/`: `tokens`, `ui` (the design system), `ui-runtime` (renderer and `ui:check`), `views` (view documents and messages), `core` (state, commands, view models), `markdown`, `editor`.
- `tools/`: the repository checks and `bench/`. `schemas/`: JSON Schemas for every file format and the generated UI schema.
- `templates/workspace/`: the source of the template repository people copy to make their instance (`focus-notes-workspace`).
- `site/`: the product site's content (D-167): the landing page (`landing.json`, D-174), `download.md`, `privacy.md`, `demo.md`, the help centre (`help/categories.json`, articles in `help/<category>/<id>.md`) and `media/` (screenshots from the `site` catalogue). `tools/site/build.mjs` renders it through the design system; see [Product site and help](documentations/product/site-and-help.md#how-the-site-is-built).
- `documentations/`: the spec, published as a [Slate](https://github.com/prabinpebam/slate) documentation site.
- `slate/`: the Slate system, pinned as a Git submodule. Don't edit it here.
- `.github/skills/slate/`: the skill that loads Slate's rules.

The planned code layout (a pnpm monorepo) is in [`documentations/plan/distribution.md`](documentations/plan/distribution.md).

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
- **Candidate previews:** when CI is still running on a head the owner is waiting for, and it would save 5 minutes or more, build that exact commit locally after the fast checks. Put it in `focus-notes-preview\candidates\<commit>`, label it "pending CI", and open it with a fresh profile. The scheduled Preview only ever takes green `main`.
- **Unattended** (the owner is away): do deeper, systematic work on the critical path in 45-minute time-boxes, push the work branch so CI runs the full Windows suite before merging, and leave a handoff summary for the owner's return. At most two builders, on areas that don't overlap.
- **Gates match what changed (D-180).** A change to the site, docs or the web app only (`site/`, `tools/site/`, `documentations/`, `apps/web/`, site-only components) ships on the checks that cover it: `pnpm check`, typecheck, unit tests, the site and web journeys and, for anything published, a security review. It isn't held for the desktop journey suite. When the owner asks for something to be published, publishing is never blocked by unrelated desktop defects. Desktop and shared app code still go through the full Windows gate below.
- **The merge gate has no exceptions** in either mode for desktop and shared app code, apart from the attended fast loop above. A work branch merges only when its Windows CI is green. A failure that's "the same as main" or "a flake" isn't green: either fix it first, or quarantine it explicitly, by marking the check skipped with a recorded scope, owner and expiry in `documentations/plan/gate-evidence.md`. Two ad hoc exceptions on 15 October let a regression into main (D-113).
- **Merge exactly what was tested.** Main only fast-forwards to a commit whose own Windows CI run is green. When several branches are ready, combine them on one merge-candidate branch (`fix-merge-candidate`, main plus the branches in landing order), run CI once, and fast-forward main to that head. Don't re-run each branch one after another.
- **Decision numbers are assigned by the orchestrator.** Each builder brief names the D- numbers that builder may use. Builders never pick the next free number themselves, because parallel branches collided four times on 15 October (D-113).
- **Watch CI for anomalies, not just completion.** A watcher flags any step that runs more than twice its usual time (the Windows journey shards take about 5–8 minutes, the unit tests about 2), so a hang is investigated in minutes, not after an hour.
- **Don't widen a branch whose Windows CI is green.** It lands at its time-box. Problems that only show on macOS or Linux, and don't block (D-112), get a separate follow-up, unless they touch data safety, security or what the owner sees in Preview.
- **The owner tests through Preview, any time.** The "Focus Notes Preview" desktop shortcut opens the newest green `main`, built by `E:\Projects\side-projects\focus-notes-preview\update.ps1` every 10 minutes (a scheduled task). Never kill, replace or build into the Preview's folder. Getting changes to the owner means merging them green; there's no separate restart step (D-122).
- **Always:** Windows first (D-112). Merge what works at the end of every time-box, and keep branches no older than about an hour. Never widen a running task with new feedback; queue it. Log one timestamped line per step to `E:\Projects\side-projects\builder-progress.log` (outside the repository). Journeys never take the owner's focus (`FOCUS_NOTES_E2E=1`).
- **Never take over the owner's screen.** Local runs use FOCUS_NOTES_E2E=1 and never maximize, snap, full-screen or move a window over the owner's apps, send OS keys, or take full-screen screenshots. Screen-level journeys run on CI (D-141).
- **Never leave app instances open.** Every local run that starts the app (journeys, benches, captures, `pnpm dev`) ends with `pwsh tools/dev/close-test-apps.ps1`, even when it failed. At most one candidate preview is open at a time: close the previous one first (`-KeepCandidate <commit>` keeps the one the owner is testing). The script never touches the owner's Preview or other projects' apps.
- **`FOCUS_NOTES_E2E_ALLOW_SCREEN=1` is CI-only.** Never set it locally. Review captures at every window size (default, 480 × 360 and 1600 × 1000, light and dark) come from the **Review captures** workflow (`.github/workflows/review-captures.yml`), which runs on every push to a `vq-*` branch, or by hand: `gh workflow run review-captures.yml --ref <branch> -f catalog=fre-catalog`. Fetch the result with `node tools/review/fetch-captures.mjs --branch <branch> [--label <label>]`, which puts it in `E:\Projects\side-projects\fre-review\<label>\`. A local capture (`node tools/review/capture.mjs fre-catalog`) takes the default window only. Catalogues are listed in `tools/review/catalogs.mjs` (D-146).

## Validate before committing

Serve the repository and open the docs:

```powershell
python -m http.server 8787 --bind 127.0.0.1
# open http://127.0.0.1:8787/documentations/
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

Small, descriptive commits. Keep `slate/` updates separate from spec changes.

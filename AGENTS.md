# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this repository is

Focus Notes, a calm, Markdown-native writing app. **Status: M0 (walking skeleton) is built and being verified; M1 is next.** Work follows [the agentic loop](documentations/plan/agentic-loop.html) over [`work-graph.json`](documentations/plan/work-graph.json).

- `apps/desktop/`: the Electron shell, the renderer and gallery entries, and the journey tests (`e2e/`).
- `packages/`: `tokens`, `ui` (the design system), `ui-runtime` (renderer and `ui:check`), `views` (view documents and messages), `core` (state, commands, view models), `markdown`, `editor`.
- `tools/`: the repository checks and `bench/`. `schemas/`: JSON Schemas for every file format and the generated UI schema.
- `templates/workspace/`: the source of the template repository people copy to make their instance (`focus-notes-workspace`).
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
7. **Licenses.** The app is MIT. Only permissive dependencies are allowed (see the licensing policy in `plan/decisions.md`).
8. **Package sources.** Use the package sources and registries your environment requires. Never commit secrets or tokens.

## Working modes and throughput (D-113)

The loop optimizes validated progress toward the definition of done per hour. See [the agentic loop → Throughput](documentations/plan/agentic-loop.html#throughput).

- **Attended** (the owner is testing and giving feedback): work the owner's feedback queue, one fix at a time, about 15 minutes from report to a fix they can see. Run only the fast checks for what changed (5 minutes or less), merge, rebuild and restart the app for them, and let CI run the full Windows suite. One builder at a time.
- **Unattended** (the owner is away): do deeper, systematic work on the critical path in 45-minute time-boxes, push the work branch so CI runs the full Windows suite before merging, and leave a handoff summary for the owner's return. At most two builders, on areas that don't overlap.
- **The merge gate has no exceptions** in either mode, apart from the attended fast loop above. A work branch merges only when its Windows CI is green. A failure that's "the same as main" or "a flake" isn't green: either fix it first, or quarantine it explicitly, by marking the check skipped with a recorded scope, owner and expiry in `documentations/plan/gate-evidence.md`. Two ad hoc exceptions on 15 October let a regression into main (D-113).
- **Always:** Windows first (D-112). Merge what works at the end of every time-box, and keep branches no older than about an hour. Never widen a running task with new feedback; queue it. Log one timestamped line per step to `E:\Projects\side-projects\builder-progress.log` (outside the repository). Journeys never take the owner's focus (`FOCUS_NOTES_E2E=1`).

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
pnpm check           # boundaries, chain, plan, licenses, ui:check
pnpm typecheck
pnpm test            # unit tests, including the Markdown round-trip corpus
pnpm --filter @focus-notes/desktop run build
pnpm test:e2e        # journey tests against the real Electron app
pnpm bench --check   # budgets (QLT-05)
pnpm dev             # run the app; pnpm gallery for the component gallery
```

## Notes in this repository (AGT-07)

This repository is also the owner's own Focus Notes instance, so the workspace rules apply here too. The template's [`templates/workspace/AGENTS.md`](templates/workspace/AGENTS.md) has them in full; in short:

- **Layout.** Public notes in `notes/`, published on GitHub Pages. Private notes in `private/notes/`, where `private/` is a Git submodule pointing at a private repository; `private/access.json` holds share grants and the vault's key. `.focus-notes/workspace.json` names the workspace format. The template's source is `templates/workspace/`, published as `focus-notes-workspace`.
- **Front matter.** Optional. The app writes only `id`; never change or remove one, and keep other keys as they are. The first H1 is a note's title.
- **Links.** Relative Markdown links (`[see](../ideas.md)`). Renames and moves update them in the same commit. A public note never links to a private one.
- **`private/` rules.** Never copy, quote, or summarize private content into `notes/`, commit messages, issues, pull requests, or logs; never make the private repository public; never print or edit `access.json`'s secrets and keys. Commit and push in `private/` first, then the pointer; pull `private/` on its own, never recursively.
- **Commit style.** Small commits with plain subjects that say what changed (`Update notes/ideas.md`, `Move 2 items to notes/archive`, `Update private notes to 1a2b3c4`); code commits name the area and the requirement IDs. Never force-push published history or skip hooks.

## Commits

Small, descriptive commits. Keep `slate/` updates separate from spec changes.

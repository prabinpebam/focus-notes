# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this repository is

Focus Notes, a calm, Markdown-native writing app. **Status: M0 (walking skeleton) is built and being verified; M1 is next.** Work follows [the agentic loop](documentations/plan/agentic-loop.html) over [`work-graph.json`](documentations/plan/work-graph.json).

- `apps/desktop/`: the Electron shell, the renderer and gallery entries, and the journey tests (`e2e/`).
- `packages/`: `tokens`, `ui` (the design system), `ui-runtime` (renderer and `ui:check`), `views` (view documents and messages), `core` (state, commands, view models), `markdown`, `editor`.
- `tools/`: the repository checks and `bench/`. `schemas/`: JSON Schemas for every file format and the generated UI schema.
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

## Commits

Small, descriptive commits. Keep `slate/` updates separate from spec changes.

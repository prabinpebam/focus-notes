# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this repository is

Focus Notes, a calm, Markdown-native writing app. **Status: specification only.** There is no application code yet. Don't add code unless the owner asks for it.

- `documentations/`: the spec, published as a [Slate](https://github.com/prabinpebam/slate) documentation site.
- `slate/`: the Slate system, pinned as a Git submodule. Don't edit it here.
- `.github/skills/slate/`: the skill that loads Slate's rules.

The planned code layout (a pnpm monorepo) is in [`documentations/plan/distribution.md`](documentations/plan/distribution.md).

## Rules

1. **Never edit or delete `documentations/seed-specs.md`.** The owner wrote it by hand. It is the source of truth that everything else interprets.
2. **Follow the articulation chain.** Every view, component, behavior, and requirement traces customer promise → scenario → user can → view or component → design decision → requirement. Change the chain first, then the views and requirements that depend on it. See [`documentations/product/spec/chain.md`](documentations/product/spec/chain.md).
3. **Record decisions.** Any assumption beyond the seed spec goes into [`documentations/plan/decisions.md`](documentations/plan/decisions.md) with an ID, a status, and the pages it affects.
4. **Follow Slate.** One H1 per page, a TL;DR on every page, Slate components only, SVG figures that use tokens and prefixed IDs, and no meta-documents (put findings into the durable page they belong to). Register every page in `documentations/docs-manifest.json`.
5. **Every requirement is on the roadmap.** Each requirement ID in `product/requirements.md` must appear in exactly one milestone in `plan/roadmap.md`.
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

## Commits

Small, descriptive commits. Keep `slate/` updates separate from spec changes.

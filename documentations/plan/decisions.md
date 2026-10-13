# Decisions

Every assumption and design choice these docs make beyond the literal [seed spec](../seed-specs.md), so they can be confirmed or overturned in one place.

> [!NOTE]
> **TL;DR.** 12 decisions. Three are **open** and need input from the project owner: **D-01** editor engine, **D-02** web sign-in, and **D-03** how to read the trigger's measurements. The rest are **proposed** defaults that the docs already assume. Change one here first, then update the pages it links to.

## Status legend

| Status | Meaning |
| --- | --- |
| **Open** | Needs a decision before the milestone that depends on it. |
| **Proposed** | A default the docs assume. It stands unless someone overrides it. |
| **Decided** | Confirmed by the project owner. |

## Decision log

| ID | Decision | Status | Affects |
| --- | --- | --- | --- |
| D-01 | **Editor engine:** Tiptap (ProseMirror) plus our own remark-based Markdown bridge. Milkdown is the alternative. Confirmed by the spike exit criteria. | Open | [Editor engine](../architecture/editor-engine.md), M0 |
| D-02 | **Web sign-in:** a fine-grained personal access token limited to the two content repositories for the first release. Add GitHub OAuth through a small token-exchange function later if needed. Electron uses the device flow. | Open | [Architecture overview](../architecture/overview.html), M3 |
| D-03 | **Trigger geometry:** read *"red 10px circle"* as a 10 px **diameter** dot, and *"frosted circle of 30px radius"* literally (60 px across). | Open | [Main UI](../experience/main-ui.html), M2 |
| D-04 | **Focus mode default:** on for new installs, because it's a signature feature. | Proposed | [Focus mode](../experience/focus-mode.md) |
| D-05 | **New notes are private** by default, so nothing gets published by accident. | Proposed | [Files and sharing](../experience/files-and-sharing.md) |
| D-06 | **Save state UI:** autosave is invisible. Only failures or unsynced offline edits show, as a status ring on the trigger plus a toast the first time. | Proposed | [Main UI](../experience/main-ui.html#states) |
| D-07 | **Submodule pointer cadence:** the public repository's pointer to the private repository moves only for publishing-relevant private changes (share grants, shared notes), plus once a day. | Proposed | [Repository and publishing](../architecture/repository-and-publishing.html) |
| D-08 | **Public URL stability:** renaming or moving a public note leaves a redirect at the old URL, found through the note's front-matter `id`. | Proposed | [Content model](../architecture/content-model.md#public-urls) |
| D-09 | **Private mount path:** `private/` (the reference `personal-site` uses `private-pages/`). | Proposed | [Content model](../architecture/content-model.md) |
| D-10 | **Release order:** web first (P0); Electron in M5 (P1). The seed allows either. | Proposed | [Roadmap](roadmap.md) |
| D-11 | **Component syntax:** generic Markdown directives (`::name{}` / `:::name`) for future components. | Proposed | [Content model](../architecture/content-model.md#components) |
| D-12 | **Markdown-only formatting:** no underline, color, or highlight, because GFM can't represent them. | Proposed | [Editing](../experience/editing.md#inline-formatting) |

## Questions for the project owner

1. **D-03:** Is the red circle 10 px across or 10 px in radius? Is the frosted circle 30 px in radius (60 px across), as written?
2. **D-02:** Is a personal access token acceptable for signing in on the web at first, or is a one-click GitHub sign-in needed from day one? The second option needs a small serverless function outside GitHub Pages.
3. **D-01:** Any preference or past experience with Tiptap, Milkdown, or Lexical that should outweigh the proposal?
4. Should the generated documentation also be published with the app at `/docs/`?

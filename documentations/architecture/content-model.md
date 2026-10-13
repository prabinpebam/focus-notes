# Content model

This page defines what's on disk: how notes and folders are laid out, what a note file contains, how future components are written in Markdown, and the rules that keep files from changing behind the writer's back.

> [!NOTE]
> **TL;DR.** A note is one `.md` file of CommonMark + GFM. The first H1 is its title, and YAML front matter is optional and minimal. Folders are real folders. Public notes live under `notes/` in the user's instance repository (the notes repository); private notes live under `notes/` in their private repository, linked at `private/` (D-84). Future components (image, gallery) use **generic directive syntax** (`::image{…}`, `:::gallery … :::`), which stays readable as plain text anywhere. Untouched blocks are written back byte-for-byte.

## Workspace layout

Each user's workspace is **their instance repository** (the notes repository), copied from the Focus Notes template repository into their GitHub account (see [Repository and publishing → Who owns what](repository-and-publishing.html#who-owns-what)):

```text
notes/                           # the user's instance repository (public, their account)
├─ notes/                        # PUBLIC notes, published on their GitHub Pages
│  ├─ ideas.md
│  └─ essays/
│     └─ on-focus.md
├─ private/                      # git submodule -> their private repository
│  ├─ notes/                     # PRIVATE notes, never deployed
│  │  └─ journal/
│  │     └─ 2026-10-13.md
│  ├─ access.json                # share audiences (never published in plaintext)
│  ├─ access-message.json        # invite template
│  └─ .focus-notes/
│     ├─ themes/                 # custom themes (JSON), private by design (D-46)
│     └─ settings.json           # opt-in synced settings (appearance, themes, font), private by design
├─ .focus-notes/
│  └─ workspace.json             # formatVersion and template version (DST-05)
├─ AGENTS.md                     # instructions for coding agents (AGT-07)
├─ .github/workflows/            # Deploy app: deploys the released app at a pinned version
├─ .gitmodules
└─ README.md
```

The project repository has the same shape (it's the owner's own instance) plus the app's source and these docs, and its *Deploy app* workflow builds the app from source (D-87). Instances made from the template hold no app source.
The two roots, `notes/` and `private/notes/`, are what the [Files panel](../experience/files-and-sharing.md) shows as *Public* and *Private*. Folder structure inside each root is entirely up to the writer.

## The workspace model

The web app and the desktop app share one workspace model (`packages/core`, `workspace.ts`): the workspace's **roots** as one tree of notes and folders, and every operation on it as a pure plan (D-92).

| Shell | Roots |
| --- | --- |
| Desktop, a workspace | The notes folder with `.focus-notes/workspace.json`: *Private* is `private/notes/`, *Public* is `notes/` |
| Desktop, a plain folder | A notes folder without `workspace.json` (everything written through M2) is one root of its own, so its notes stay where they are until setup makes it a workspace |
| Browser | The notes kept in this browser, writable, plus the instance's `public:` and `private:` notes, read-only ([Web app](web-app.md)) |

- **The tree** lists every Markdown file and folder in the roots, folders first, then notes, in the reader's language order. Names starting with a dot are skipped.
- **Operations are plans.** Creating a note or folder, renaming, moving, and deleting each return the new tree and what changed, without touching any file. Items a plan didn't change stay the same objects, and nodes don't hold their paths, so a moved note is the same object in its new place ([Desktop and Git → Changes shown before they're saved](desktop-and-git.md#changes-shown-before-theyre-saved)). A move says whether it crosses between *Public* and *Private*, and a delete says whether to ask first.
- **Changes from outside** (the desktop's file watcher) are applied to the tree the same way, and only the views that show a changed note do any work (PRF-11, [Desktop and Git → External changes](desktop-and-git.md#external-changes)).

## The workspace format

`.focus-notes/workspace.json` names its `formatVersion` (DST-05, `schemas/workspace.schema.json`). This app writes version 1.

| The file | What the app does |
| --- | --- |
| The current version | Reads and writes the workspace. |
| Missing | Reads and writes; it doesn't create the file (workspace setup does, from M3). |
| A newer version | Opens every note in the workspace **read-only**. A message says it was saved by a newer Focus Notes, and the bottom-left pill says *Read only · Needs a newer Focus Notes*. Nothing is written: the desktop's main process and the browser refuse too. |
| Unreadable (not JSON, or no valid `formatVersion`) | Read-only, so a file it doesn't understand is never overwritten. |
| An older version | **Asks first.** A message offers *Update*, and the pill says *Read only · Update the workspace*. Until the person agrees, the workspace is read-only. Then each migration step runs in order (one per version) and the file is written. |

The browser keeps the format of its own notes in IndexedDB (`meta` → `workspaceFormat`), so a browser holding notes from a newer app never writes them either. The format is read before the first note opens, and again whenever the watcher sees the file change.

## A note file

```markdown
---
id: 01JA7Q8Z3M4N5P6R7S8T9V0W1X
---

# On focus

Writing happens one line at a time.

- [ ] Draft the intro
- [x] Pick a title
```

| Part | Rule |
| --- | --- |
| **Encoding** | UTF-8, LF line endings, one trailing newline. |
| **Title** | The first H1. A note without an H1 is titled after its file name. Renaming a note in the Files panel edits its title (the H1). See *File name* for when the file follows. |
| **Front matter** | Optional. The app only writes `id` (a stable ULID, used for redirects and share links when the path changes). Any other keys the writer adds are kept as they are. |
| **Body** | CommonMark + GFM (tables, task lists, strikethrough, autolinks). |
| **Links between notes** | Relative Markdown links (`[see](../ideas.md)`), so they work on GitHub, in any editor, and on the published site. Renames and moves rewrite them by changing only the destination's characters, at the positions the parser reports, never by writing the note again ([Files and sharing → Links that follow](../experience/files-and-sharing.md#links-that-follow), FIL-09). |
| **File name** | Follows the title until the note is first published (`On focus` → `on-focus.md`), then stays fixed so its public URL is stable, unless renamed on purpose (FIL-07, D-30). Lowercase; letters, marks, and numbers in any language kept, with `.` and `_`; spaces, punctuation, and symbols become one hyphen; at most 80 characters, unique within its folder (`-2`, `-3` on clashes, ignoring case). A name chosen by hand isn't replaced (D-92). Renames and moves update relative links in other notes in the same commit (FIL-09). Full rules: [Files panel → Names and titles](../design/views/files.html#names-and-titles). |

## Components

The seed calls for special components such as image and gallery in the future. They are written as [generic directives](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444), a widely used extension proposal for CommonMark:

```markdown
::image{src="assets/cover.jpg" alt="A quiet desk at dawn" width="720"}

:::gallery{columns="3"}
![First](assets/a.jpg)
![Second](assets/b.jpg)
![Third](assets/c.jpg)
:::
```

- **Leaf directives** (`::name{attrs}`) are single-line components. **Container directives** (`:::name … :::`) wrap Markdown content.
- Inside a container, ordinary Markdown is used wherever possible (in a gallery, the images are plain Markdown images). On GitHub or in another viewer, a gallery still degrades to a readable list of images.
- Each component's name, attributes, and allowed content are defined by its block registration (see [Editor engine](editor-engine.md)).
- **Unknown directives** are kept verbatim and shown as read-only placeholders (EXT-05).
- **Media files** sit next to the note in an `assets/` folder in the same root, so private images stay in the private repository.

## Round-trip fidelity

Notes are often edited elsewhere too: on GitHub, in VS Code, or on a phone. The app must not rewrite style it didn't need to touch (EDT-10).

1. **No-op opens.** Opening and closing a note never writes a file.
2. **Untouched blocks keep their source.** The parser records the original text range of each top-level block. When saving, blocks the user didn't edit are written back from their original text, byte-for-byte.
3. **Edited blocks use canonical style.** `-` bullets, `1.` numbering, `*italic*`, `**bold**`, fenced code blocks, and GFM pipe tables with aligned delimiter rows.
4. **Unsupported constructs survive.** HTML blocks, footnotes, reference-style link definitions, and unknown directives are kept as opaque raw blocks and shown read-only.
5. **Test corpus.** A fixture set of real-world Markdown files must survive open, save, and compare unchanged, and that check runs in CI.

## Public URLs

| Note | URL on GitHub Pages |
| --- | --- |
| `notes/ideas.md` | `/n/ideas` |
| `notes/essays/on-focus.md` | `/n/essays/on-focus` |
| Private note shared by link | `/s/<opaque-token>/#a=<grant>.<secret>` |

Moving or renaming a public note leaves a small redirect page at its old URL, found through the note's `id` (proposed, D-08).

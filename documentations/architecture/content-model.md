# Content model

This page defines what's on disk: how notes and folders are laid out, what a note file contains, how future components are written in Markdown, and the rules that keep files from changing behind the writer's back.

> [!NOTE]
> **TL;DR.** A note is one `.md` file of CommonMark + GFM. The first H1 is its title, and YAML front matter is optional and minimal. Folders are real folders. Public notes live under `content/` in the user's own notes repository; private notes live in their private repository, mounted at `private/`. Future components (image, gallery) use **generic directive syntax** (`::image{…}`, `:::gallery … :::`), which stays readable as plain text anywhere. Untouched blocks are written back byte-for-byte.

## Workspace layout

Each user's workspace is **their own notes repository**, created from the Focus Notes workspace template in their GitHub account (see [Repository and publishing → Who owns what](repository-and-publishing.html#who-owns-what)):

```text
notes/                           # the user's notes repository (public, their account)
├─ content/                      # PUBLIC notes, published on their GitHub Pages
│  ├─ ideas.md
│  └─ essays/
│     └─ on-focus.md
├─ private/                      # git submodule -> their private repository
│  ├─ journal/
│  │  └─ 2026-10-13.md
│  ├─ access.json                # private share grants (never published in plaintext)
│  └─ .focus-notes/              # private-side settings (optional)
├─ .focus-notes/
│  ├─ themes/                    # custom themes (JSON)
│  └─ settings.json              # opt-in synced settings
├─ .github/workflows/publish.yml # calls the Focus Notes reusable publish workflow
├─ .gitmodules
└─ README.md
```

The app source, this documentation, and the releases live in the separate product repository, never in a user's workspace.
The two roots, `content/` and `private/`, are what the [Files panel](../experience/files-and-sharing.md) shows as *Public* and *Private*. Folder structure inside each root is entirely up to the writer.

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
| **Links between notes** | Relative Markdown links (`[see](../ideas.md)`), so they work on GitHub, in any editor, and on the published site. |
| **File name** | Follows the title until the note is first published (`On focus` → `on-focus.md`), then stays fixed so its public URL is stable, unless renamed on purpose (FIL-07, D-30). Lowercase, hyphenated, letters in any language kept, characters not allowed on Windows or macOS removed, at most 80 characters, unique within its folder (`-2`, `-3` on clashes). Renames and moves update relative links in other notes in the same commit (FIL-09). Full rules: [Files panel → Names and titles](../design/views/files.html#names-and-titles). |

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
| `content/ideas.md` | `/n/ideas` |
| `content/essays/on-focus.md` | `/n/essays/on-focus` |
| Private note shared by link | `/s/<opaque-token>/#a=<grant>.<secret>` |

Moving or renaming a public note leaves a small redirect page at its old URL, found through the note's `id` (proposed, D-08).

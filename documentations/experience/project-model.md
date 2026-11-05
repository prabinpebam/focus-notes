# One concept: Project

A project is the only place notes live together. "Workspace" leaves the app.

> [!NOTE]
> **TL;DR.** Project and workspace are one thing, so the app says **Project** everywhere and never "workspace". Every project is a folder whose history is kept with Git. A project is either **on this computer only** (local Git) or **linked to GitHub** (the same Git history, also on GitHub). The only thing outside a project is a **standalone file**: a compatible file opened once and edited in place, with no version history. Some file types, such as .txt, can't take images. Where images are allowed, they go in a folder beside the file. Settings loses its Workspace tab; the Project tab gains a "Where it's kept" section. **Approved by the owner on 5 November 2026:** "The project + Workspace design is approved. We can implement this design." Implementation changes user-facing words only; on-disk names stay until the owner decides. **Deleting a project** (also from GitHub) is a new strict design on top, waiting for the owner's approval (mocks `pnw.delete*`). Decision: D-pending in [Decisions](../plan/decisions.md#d-pending-project-replaces-workspace-everywhere).

## The owner's direction

The owner wrote, on 5 November 2026 (verbatim):

```text
Project and workspace are the same thing. Why have two separate concepts. It's confusing.
Everything unders workspace can be brought under Project.
Think this through critically from user mental model point of view and eliminate the term workspace completely from the app.
all projects have version control with git.
Projects can be completely offline or linked to a GitHub repo.
---
We do have the concept of opening and editing any file outside the conept of a project. This are just direct edit of compatible files as a one time standalone. We don't do version control, can't insert image on certain file types like txt.
Inserting image create a folder beside the file with the image file in it.
```

### What the live build shows today

The owner attached two screenshots of today's Settings.

![Settings, Project tab today: Name, Colour, Logo with Upload SVG, Watermark, Font and Theme](media/settings-project-tab-before.png "Today: Settings → Project")

**Project tab (today).** The project's identity: **Name** ("Shown on its windows. The folder and repository keep their names."), **Colour** (12 swatches), **Logo** (24 presets and **Upload SVG…**), **Watermark** (Off or On), and the **Font** and **Theme** tiles. Nothing here says where the project is kept.

![Settings, Workspace tab today: This computer, the folder path, Saved to GitHub with Git, Save to cloud, Run setup again and Remove this workspace from this computer](media/settings-workspace-tab-before.png "Today: Settings → Workspace")

**Workspace tab (today).** Where the same project is kept: the heading **This computer**, **Folder** with its path, "Saved to GitHub with Git…", **Save to cloud** and **Run setup again** with its note, and **Remove this workspace from this computer…**.

The two tabs describe one thing from two sides. A person who named and coloured "Garden notes" in Project has to know that "Workspace" is the same folder to find where it's saved or how to remove it.

## The mental model

**What people already believe.** People who write notes think in **things they work on**: a book, a job, a club. They don't think in containers that hold the things they work on. "Workspace" is a word from developer tools (VS Code, Slack). There it means the frame around the work, so it reads as a second, bigger thing that holds projects. Showing both words invites the wrong question: "is my project inside my workspace, or the other way round?" In Focus Notes they are the same folder, so the second word only adds doubt.

**The model the app teaches.**

| Thing | What it is | History | Images |
| --- | --- | --- | --- |
| **Project** | A folder of notes with its own window, name, colour and logo | Always kept with Git | In the project's `assets/` |
| ↳ on this computer only | Git history on this computer; nothing on GitHub | Local Git | As above |
| ↳ linked to GitHub | The same Git history, also on a GitHub repository; can be shared and opened on another computer | Git, pushed to GitHub | As above |
| **Standalone file** | One compatible file opened from anywhere, edited in place, one time | None | Only for types that can show them; in a folder beside the file |

**Rules this gives.**

- **One noun.** Project, in every window, menu, message, Help page and accessible name. "Workspace" is not a synonym, an alias or a heading.
- **Git is not a choice.** Making a project starts Git in its folder. Linking to GitHub is a later, optional step that adds a remote. It never changes what a project is.
- **Offline is a complete state.** A project on this computer only can be renamed, coloured, searched and given history like any other. Only sharing and opening it on another computer need GitHub. So **Link to GitHub…** is an offer, not a warning.
- **Standalone means "not in a project".** Its card says so plainly ("Not in a project · Edited in place. No version history."). The person learns from the absence what a project would add.
- **The file type decides what's possible.** A .txt file shows **Insert image…** disabled, with its reason ("Images need a Markdown file. Save as Markdown to add them.") and **Save as Markdown…** beside it. A Markdown file says where its images go before the first insert.

## Reconciling the existing specs

These pages already say part of this. Below is where they agree, and what contradicts the owner's direction and needs a decision.

| # | Where | What it says now | Against the direction | Proposal |
| --- | --- | --- | --- | --- |
| 1 | [Projects](projects.md) TL;DR | "A project is one private GitHub repository" | Contradicts: projects can be completely offline | "A project is a folder kept with Git, on this computer only or linked to a private GitHub repository." |
| 2 | [Projects → Local notes](projects.md#local-notes), DD-PROJ-04, UC-PROJ-07, SC-PROJ-04, CP-SCOPE-01 | Local notes are a third scope: no project, no Git | **Contradicts.** Standalone files are the only thing outside a project, and all projects have Git. | **Owner decision.** Recommended: Local notes becomes an ordinary project, **Local notes**, created on first use, on this computer only (local Git). Its quick-jot behaviour stays: one key and no project choice. Alternative: drop Local notes and let quick notes go to the last-used project. |
| 3 | Today's build | An offline workspace can have no Git ("This folder isn't saved to GitHub"); Remove needs Git | **Contradicts:** all projects have Git | Every project starts Git; offline means "no GitHub remote", not "no Git". |
| 4 | [Images → Assets](images.md#assets-markdown-and-encrypted-sharing) | A standalone note's images go in `<full-note-filename>.assets/images/<id>.<ext>` | Partly: the owner says "a folder beside the file with the image file in it" (one folder, the image in it) | Flatten it to `<full-note-filename>.assets/<id>.<ext>`: one folder beside the file, images directly in it. Flagged for the owner, because it changes a built path. |
| 5 | [Images](images.md), .txt rule | .txt needs Save as Markdown before media | Agrees | Kept. The mock shows the disabled insert and its reason. |
| 6 | [Projects → Meeting Project](projects.md#meeting-project-for-the-first-time), Settings and words | "Settings: Project replaces Workspace" | Agrees, but the build still has a Workspace tab | The merged Project tab mocked below is that replacement. |

## Settings → Project, merged

The Workspace tab goes. Its contents move to the end of the Project tab under **Where it's kept**, after the identity choices (name, colour, logo, watermark, font, theme) and People. The order is: what the project is, who's in it, then where it lives.

- **Linked to GitHub:** the folder path; one card, GitHub mark, "Saved to GitHub · prabin/garden-notes · History kept with Git"; **Save to cloud** and **Run setup again** with today's note; **Remove from this computer…** with "Your notes stay on GitHub."
- **On this computer only:** the folder path; one card, drive mark, "On this computer only · History kept with Git. Not on GitHub."; **Link to GitHub…** with what it adds; **Remove from this computer…** disabled, with its reason both visible and as the tooltip: "This is the only copy of this project. Link it to GitHub first."
- **Standalone file open:** Settings has no Project or Sharing tab. **This file** takes Project's place: a "Not in a project" card, its **Location**, and **Images**. For .md: "Images you add go in a folder beside this file" and the folder's name. For .txt: **Insert image…** disabled with its reason, **Save as Markdown…**, and the reason in plain text.

Spacing follows the [spacing rules](../design/foundations.md): a label sits tightest to its value, items are spaced at the medium step, and the section heading gets the largest gap. There's one enclosure per meaning: the card carries the storage state, so the path and the buttons are not boxed again. The GitHub mark appears once, on the card's icon, and not again in its detail.

### Review the mocks

The gallery from branch `vq-project-not-workspace`, at 1100 px and 320 px, in light and dark:

| Mock | Light | Dark |
| --- | --- | --- |
| 1. Project, linked to GitHub | [light](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.linked&scheme=light) | [dark](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.linked&scheme=dark) |
| 2. Project, on this computer only | [light](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.offline&scheme=light) | [dark](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.offline&scheme=dark) |
| 3. Standalone Markdown file | [light](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.fileMd&scheme=light) | [dark](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.fileMd&scheme=dark) |
| 4. Standalone .txt file, image insert disabled | [light](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.fileTxt&scheme=light) | [dark](http://127.0.0.1:5243/apps/desktop/out/gallery/index.html?f=mock.pnw.fileTxt&scheme=dark) |

The identity part of mocks 1 and 2 is the real Settings → Project view, unchanged. Only "Where it's kept" is new. The mocks are in `packages/views/mocks/project/`, and their words are the `project.home.*` and `file.settings.*` keys in `packages/views/messages/en.json`.

## Every "workspace" a person can see

This inventory covers every place the word reaches a person, plus the internal names they can see on disk or on GitHub. "Internal, keep" means no person reads it, so renaming it would add risk with no benefit. The message keys whose *name* contains `workspace` but whose *text* doesn't (56 keys, for example `settings.workspace.heading`) are internal: keep them. A later code rename can tidy them.

### Words in the app (`packages/views/messages/en.json`)

| Key | Today | Proposed |
| --- | --- | --- |
| `settings.section.workspace` | Workspace (Settings tab) | **Removed.** Its contents move to Project → Where it's kept |
| `settings.workspace.heading` | This computer | Where it's kept |
| `settings.workspace.git` / `.local` | Saved to GitHub with Git… / This folder isn't saved to GitHub… | Saved to GitHub · {repo} · History kept with Git / On this computer only · History kept with Git. Not on GitHub. |
| `settings.workspace.connect` | Connect to GitHub | Link to GitHub… |
| `command.workspace.remove`, `remove.title` | Remove this workspace from this computer… | Remove from this computer… (in Project) / Remove "{name}" from this computer? |
| `remove.notGit`, `remove.failed`, `remove.removed`, `remove.notWorkspace` | …workspace… | Same sentences with "project". `remove.notGit` goes: every project has Git. |
| `command.workspace.openFromGitHub` | Open a workspace from GitHub… | Open a project from GitHub… |
| `command.workspace.setRemoveOpen`, `command.workspace.migrate` | …workspace… | …project… |
| `firstRun.workspace.repo.instance`, `firstRun.workspace.localIntro` | …workspace… | …project… |
| `firstRun.workspace.problem.notWorkspace` | "…isn't a Focus Notes workspace (no `.focus-notes/workspace.json`)" | "This folder isn't a Focus Notes project." (the file name is internal; drop it from the message) |
| `setup.problem.notInstance`, `.linkedElsewhere`, `.locked` | …workspace… | …project… |
| `sync.problem.locked`, `sync.problem.unreadableRemote` | …workspace… | …project… |
| `toast.workspaceNewer`, `…Unreadable`, `…Older`, `…Updated`, `…UpdateFailed` | "This workspace was made by a newer Focus Notes…" etc. | "This project was made by…" etc. |
| `account.readOnlyOlder`, `account.readOnlyUnreadable`, `command.note.new.readOnly` | …workspace… | …project… |
| `newNote.workspaceFolders`, `newNote.folderUnavailable` | …workspace… | …project… |
| `project.github.notWorkspace` | …workspace… | "That repository isn't a Focus Notes project." |
| `share.manage.unavailable`, `share.manage.noSite` | "…Set that up in Workspace." | "…Set that up in Settings → Project." |
| `share.manage.note.otherDetail` | …workspace… | …project… |
| `save.backup.local`, `recovered.top` | …workspace… | …project… |
| `spotlight.reason.noFiles`, `spotlight.reason.noOtherRoot`, `command.history.open.none` | …workspace… | …project… |
| `agents.undo.locked` | …workspace… | …project… |
| `migrate.moved`, `migrate.notice` | "Your workspace is now called a project." | **Keep, once.** It is the one sentence that explains the rename to people who knew the old word. Remove it after a release cycle. |

### Words outside the message file

| Where | Today | Proposed |
| --- | --- | --- |
| `apps/desktop/src/main/main.ts`, the folder-picker titles | Choose a folder for your workspace / Open a workspace folder | Choose a folder for your project / Open a project folder |
| `apps/desktop/src/main/main.ts` and `bundled-template.ts`, thrown errors | …workspace… | Internal, keep, unless one reaches a person. Then route it through a `project.*` message. |
| Command line (`packages/cli/src/cli.ts`, `apps/desktop/src/cli/run.ts`) | `--workspace <folder>`, "No workspace: pass --workspace <folder>." | `--project <folder>`, keeping `--workspace` as a silent alias; "No project: pass --project <folder>." |
| Agent tools (`packages/mcp/src/tools.ts`) | "Workspace-relative path" | "Project-relative path" |
| Menus | No item says "workspace" (`workspace.*` commands are left out of the menu bar) | Nothing to change |
| Accessible names | Come from the keys above | Changed with them |
| Help (`documentations/help/organize.md`) | "…in this workspace…" | "…in this project…" |
| The product site (`site/`) | None | Nothing to change |
| Spec: [information architecture](../design/information-architecture.html), [foundations](../design/foundations.md) | "account, workspace…", "Open another workspace", "account and workspace parts of Settings" | Changed in this proposal |

### Names on disk and on GitHub

| Name | Who sees it | Proposed |
| --- | --- | --- |
| `.focus-notes/workspace.json` in every project | Someone browsing the folder or the repository | **Recommend renaming to `.focus-notes/project.json`**, reading both and writing the new one on the next save. This needs a migration: **a separate owner decision**, not changed here. |
| `schemas/workspace.schema.json` | Developers only | Internal, keep. Rename it with the file above if that's approved. |
| `templates/workspace/` (repository source) | Developers only | Internal, keep. |
| Template repository **focus-notes-workspace** on GitHub | Anyone setting up by hand, and GitHub's "generated from" label | **Recommend `focus-notes-project`** with a redirect (GitHub keeps one on rename). Existing projects keep working. **A separate owner decision**, not changed here. |

## What's next

Approved on 5 November 2026. Built in this order, on `wp-project-not-workspace`:

1. The word change in messages, Help and the information architecture. This is low risk: words only.
2. The merged Project tab, wired in Settings.
3. Git for every project, and Link to GitHub for offline projects.
4. The standalone-file Settings. Then, if approved separately, the on-disk and template renames with their migration.

The Local notes question (row 2 above) is answered first, because it decides whether a project-less scope with history can exist.

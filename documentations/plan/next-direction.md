# Next direction: projects, sharing and fixes

The owner's notes of 3 November 2026 on what Focus Notes does next, kept word for word, and the plan that turns each note into the spec: the chain, the views, the requirements and the decisions (D-272 to D-291).

> [!NOTE]
> **TL;DR.** The owner's notes ask for five fixes to everyday writing, a real model for **projects** (each one its own GitHub repository, opened in its own window, private until the first share), and a simpler **share** flow that starts from a file or folder and lands straight on one share dialog. This page keeps the notes as written, answers the owner's questions (projects open in their own window, *Pinned* over favourites, recent files with their place, Quick notes and a file on its own outside projects), lists the five choices that need the owner, and maps every note to the page that specifies it. Decisions D-272 to D-291 record it all.

## The owner's notes (3 November 2026)

Kept exactly as the owner wrote them. Everything below and on the linked pages interprets these notes; when they disagree, the notes win.

```text
## Improvements and bug fixes

### General

- Ctrl + shift + n creates a new file but let user select a project or a folder first
- Will need to break the forced relationship between file name and title of the doc inside the file
- Ctrl + enter should submit prompt rewrite
- It should be possible to use AI rewrite to write without selection too. In this case I would be just providing a prompt and it would respond to that.
- In spotlight, after an item has been selected and enter has been pressed, the spotlight dialog should be automatically dismissed. Currently it lingers.

## Folders and Projects

- We need more robust folder and maybe project management.

- Recent folders and files

- Recent files, maybe not folders
- Might need to show the location of the folder
- pinned folders and projects

- Pinned vs Favorites
- How should projects work? Why do we need projects?

- Projects might be a way to isolate context and scope and work in a focus mode.
- I might want to open multiple instances of focus notes with separate color theming and logo each representing a different projects.

- We can give a preset bunch of logos generic svg logos to mark different projects. Logos can be shown as a proper project logo or as watermark.
- So, if I open a Focus notes in project specific mode, I should not be able to browse outside the scope of the Project
- Projects should be separate repositories in GitHub. The user facing term will be "Project" while the underlying mechanism will be "GitHub repositories"

- That way the scope and commits are separated.
- Project should also be "Private only" by default. The public sharing has to be activated explicitly with a confirmation dialog at the time of the first share with proper clarification of what exactly happens.
- That means switching project is switching repositories. Do we switch or do we open a project. I believe we should open a Project rather than think of it as Switching.
- What about when I want to open supported files in Focus notes outside of project context?

- What're the use case?

- I love Focus notes and want to start using it as my go to not taking app

- Quick open and note a few stuff down, don't want to worry about where to save it and be able to open it back again easily.
- I've this txt file and I want to open it in Focus notes.

- Open with Focus notes
- In this case, the note will have to be opened as a standalone separate file outside the context of a repo/project.

## Sharing and publishing

- Sharing with access code as readonly

- Files are put in public repo in an encrypted manner and anyone with passcode can access
- Share workflow

- Flow 1: This should be the primary share workflow.

- start with a page or a folder
- show option for sharing in the context menu of the file in the files panel.
- The specific file or folder is already selected and you can't select other files/folders to be added for sharing other than the one we started with.
- The rest of the option for sharing is presented as part of the flow.
- Content structure within the share dialog.

- What's being shared?

- Name of the file/folder
- In case of folder, show how many files and folders within.
- Show an option to open and review all those files and folders shown as folder tree structure, scrollable, just like how it's shown in the files panel. I really don't like a dialog over a dialog but for this one we will have to do a "Dialog over a dialog" so that we don't clutter up the share dialog itself.
- Who you are sharing with?

- We actually don't have a way to track this without running a server. So we will leave this feature out.
- What are the parameters you are sharing it with?

- Expiry date
- Link, Passcode
- Passcode type
- CTA

- Share button that opens the OS share dialog
- Copy link
- Copy complete share information
- Copy access code
- Issues with the current flow

- Share is not available as an option in the menu
- there's a dialog that shows the current state and you have to click share again to land on the actual share screen. We need to not have any screen in between and directly land in the share screen directly.
- The visual distinction of selected/active state of toggles like link and passcode are not distinct and obvious. We need tom improve the design component to something like switch toggle to make it more obvious.
- Flow 2: We won't have this feature

- Pick a user and then pick the folders and pages to be shared.

- Sharing by inviting someone to the project/repo

- The other person has to be a GitHub user
- In this case the invited person can be set to the various collaboration level GitHub provides.

- Read, Write for focus notes content
- Triage, Maintain and admin for repo management
- Publishing a note

- Publishing plainly publishes a note in GitHub pages for anyone to visit and view. This is to be seen more as a website at this point.
- This would automatically take the site theme which can be different from the theme the user uses for their own app.
```

## How the notes become the spec

Each note is specified in three places, in this order, so the chain stays true:

1. **The chain:** a customer promise, a scenario and a user-can statement in [Customer promises](../product/spec/customer-promises.md), [Scenarios](../product/spec/scenarios.md) and [User can](../product/spec/user-can.md).
2. **The views and the architecture:** [Sharing](../design/views/sharing.md), [Files](../design/views/files.html), [Secondary views](../design/views/secondary-views.md), [Repository and publishing](../architecture/repository-and-publishing.html) and [Desktop and Git](../architecture/desktop-and-git.md).
3. **The plan:** requirements in [Requirements](../product/requirements.md), each in one work package of the [work graph](work-graph.json) and one stage of the [roadmap](roadmap.md), with the beliefs it rests on in [Risks](risks.md) and the choices in [Decisions](decisions.md).

The sections below answer the owner's questions, then map every note to where it's specified.

## Answers to the owner's questions

Each answer is a proposed decision: it's the plan until the owner changes it.

| Question | Answer | Why | Rejected | Decision |
| --- | --- | --- | --- | --- |
| **Why do we need projects?** | To give separate parts of a life their own scope: a job, a book, a club. A project is one GitHub repository with its own notes, history, people, sharing and site, opened in its own window, so nothing from another project shows up, gets searched, linked or committed by mistake. | It's the owner's own reason ("isolate context and scope and work in a focus mode") made concrete, and it's what GitHub already separates: commits, permissions and Pages are per repository. | Folders inside one repository (scope by convention only; one history; a collaborator sees everything). | [D-272](decisions.md#projects-sharing-and-publishing-3-november-2026) |
| **Open or switch?** | **Open.** Each project opens in its own window; several can be open at once; opening one that's open brings it forward. The word *switch* is never used. | A window per project makes the scope visible and keeps one project's unsaved work untouched by another. It matches the owner's wish for "multiple instances … each representing a different project". | Switching in place (scope invisible); projects as tabs (several scopes in one window). | D-273 |
| **Pinned or favourites?** | **Pinned.** Pin projects to the top of the Projects list and notes to a *Pinned* group at the top of Files. No stars, no second list. | *Pin* says what it does (keep it at the top) and is the word Windows, macOS and VS Code use. Favourites implies a separate collection to curate. | Favourites with a star; both. | D-277 |
| **Recent folders or files?** | **Files only**, newest first. | A note is what people return to; its folder is one step away (*Show in Files*). | Recent folders as a second list. | D-276 |
| **Show the folder's location?** | **Yes**, as muted text after the title: *⟨project⟩ · ⟨folder⟩* across projects, the folder alone inside a project. | Two notes called "Plan" are only told apart by their place. | Full paths (long and noisy). | D-276 |
| **What are the use cases for files outside a project?** | Two, each with its own home. **Quick notes**: write now, decide where later, in a plain local folder that opens in its own window and keeps every note in Recent. **A file on its own**: *Open with Focus Notes* on a `.md` or `.txt` opens it in a file window, saved in place, with no project features. | They're the owner's two use cases, and neither should pull a stray file into a project's scope. | Saving quick notes into the last project; importing an opened file into a project first. | D-278, D-279 |

## What needs the owner

These are irreversible or change an owner decision, so they're proposed, not built, until the owner says:

1. **What turning sharing on creates** (D-274): a *public* repository called *⟨project⟩-site* plus its GitHub Pages address, made the first time something in a project is shared or published. GitHub Pages needs a public repository on free accounts.
2. **Shares without names** (D-285): a share is recorded by what it opens, never for whom, and readers use the link or an *access code* (a share code plus the passcode). This replaces the owner's earlier D-41 audiences by name.
3. **Inviting people on personal accounts** (D-290): GitHub offers Read, Triage, Maintain and Admin only for repositories owned by an organization; on a personal account every collaborator can change everything. Offer invites there anyway, with that said plainly, or only for organization projects?
4. **The site's default theme** (D-291): proposed *Paper*.
5. **Moving today's workspace into the project model** (D-272): proposed as "the private repository is the project, the instance repository is its site", with nothing moved on disk.

## Where each note is specified

| Note | Specified in | Decision |
| --- | --- | --- |
| Ctrl+Shift+N with a project or folder first | [Files → Creating](../design/views/files.html), [Keyboard shortcuts](../experience/keyboard-shortcuts.md) | D-280 |
| File name apart from the title | [Files → Names and titles](../design/views/files.html#names-and-titles) | D-281 |
| Ctrl+Enter generates; writing without a selection | [Rewrite with AI](../experience/rewrite-with-ai.md) | D-282 |
| Spotlight closes after Enter | [Spotlight](../experience/spotlight.html) | D-283 |
| Projects: what, why, open, scope, look, private only | [Projects](../experience/projects.md) | D-272 to D-275 |
| Recent files and pinning | [Projects → Recent and pinned](../experience/projects.md#recent-and-pinned) | D-276, D-277 |
| Quick notes; Open with Focus Notes | [Projects → Quick notes](../experience/projects.md#quick-notes), [A file on its own](../experience/projects.md#a-file-on-its-own) | D-278, D-279 |
| Share Flow 1, the share dialog, review contents, switches, actions | [Sharing and visibility](../design/views/sharing.md) | D-284, D-286 to D-288 |
| No "who"; no Flow 2 | [Sharing → Shares without names](../design/views/sharing.md#shares-without-names), [Scenarios](../product/spec/scenarios.md) | D-285, D-289 |
| Inviting GitHub collaborators with roles | [Projects → People in a project](../experience/projects.md#people-in-a-project) | D-290 |
| Publishing as a website with its own theme | [Sharing → Publishing a website](../design/views/sharing.md#publishing-a-website) | D-291 |

All of it is planned in stage **MP: Projects and simpler sharing** of the [roadmap](roadmap.md), as work packages WP-P.1 to WP-P.12 in the [implementation plan](implementation-plan.md#mp).

# Next direction: projects, sharing and fixes

The owner's notes of 3 November 2026 on what Focus Notes does next, kept word for word, and the plan that turns each note into the spec: the chain, the views, the requirements and the decisions (D-272 to D-299).

> [!NOTE]
> **TL;DR.** The owner's notes ask for writing fixes, recognizable projects, pins and item-first sharing, with Pages as a reading website. All six follow-up decisions were **accepted by the owner on 3 November at 13:35**: keep the site repository when turning sharing off, accept retained Git history, use opaque names-free shares, permit personal-account invites, make the project migration UX-led and simplify browser retirement. This remains specification/planning, not a current-build or execution claim.

## The owner's notes (3 November 2026)

Captured from the owner's authoritative product-notes file on 3 November, including the final reread's SVG and website/preview additions. Only Focus Notes product content is present; no non-product lines were omitted. The source remains untouched. Everything below and on the linked pages interprets these notes; when they disagree, the notes win.

The relayed 12:45 source update was re-read and diffed after the corrections arrived: it matches the capture exactly. All SVG-logo, website navigation/reading and in-app site-preview additions are already in the linked specification and MP plan.

```text
# Focus notes features

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
    - Might need to show the location of the folder&#x20;
  - pinned folders and projects
    - Pinned vs Favorites
  - How should projects work? Why do we need projects?
    - Projects might be a way to isolate context and scope and work in a focus mode.
    - I might want to open multiple instances of focus notes with separate color theming and logo each representing a different projects.
      - We can give a preset bunch of logos generic SVG logos to mark different projects. Logos can be shown as a proper project logo or as watermark.
        - Users can upload their own SVGs for logos.
      - So, if I open a Focus notes in project specific mode, I should not be able to browse outside the scope of the Project
      - Projects should be separate repositories in GitHub. The user facing term will be "Project" while the underlying mechanism will be "GitHub repositories"
        - That way the scope and commits are separated.
      - Project should also be "Private only" by default. The public sharing has to be activated explicitly with a confirmation dialog at the time of the first share with proper clarification of what exactly happens.
      - That means switching project is switching repositories. Do we switch or do we open a project. I believe we should open a Project rather than think of it as Switching.
- What about when I want to open supported files in Focus notes outside of project context?
  - What're the use case?
    - I love Focus notes and want to start using it as my go to not taking app
      - Quick open and note a few stuff down, don't want to worry about where to save it and be able to open it back again easily.
    - &#x20;I've this txt file and I want to open it in Focus notes.
      - Open with Focus notes
  - In this case, the note will have to be opened as a standalone separate file outside the context of a repo/project.

## Sharing and publishing

- Sharing with access code as read-only
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

## Focus note on the web

- Originally we wanted the Focus notes app to work on browsers too. It can't be done without hosting server. Hence we have dropped that idea completely.
- Also we had the idea that we will run focus notes on the web as an instance where the content is stored in the browser index db. This mental model is complicated and hard to communicate with the user. Hence we are dropping this idea also completely and we should remove anything on this completely. We are not going to have that ease-in plan for users to try Focus Notes on web and eventually move to the desktop app. We are not going to do that.
- Instead, the GitHub pages is going to be purely a clean website.
- What will we need for the GitHub pages website.
  - A home page view that lists all the contents that are published and public.
    - The distinction to be made here is that share is always with a passcode or a link and people need to have that link/passcode to access it. Share doesn't make the share file/folder public and the shared content is kept encrypted in the public repo.
    - Published notes/folders are truly public notes which any one can view and discover. They are not encrypted.
  - The folder structure and files within can be show as a scalable navigation structure
    - Folders are always shown as sections
    - Files inside a folder are shown as a list of articles in the folder/section.
      - The title of the file and the first few lines are shown as a detail of the article item listing.
      - A folder is shown with a distinction indicating it has more files inside it. Indicate the number of files inside it.
    - Files are always shown as a web page, like a blog article
    - We need a minimal navigation bar at the top.
      - Project icons, optional depending on where the user has set it or not.
      - Top level section can be directly shown
      - Toggle for light/dark/system mode
      - Toggle for the same focus mode that our app has.&#x20;

- A "Preview site" mode in the app where user can preview what their site will look like, choose theme and default font size and fonts etc.&#x20;
```

## How the notes become the spec

Each note is specified in three places, in this order, so the chain stays true:

1. **The chain:** a customer promise, a scenario and a user-can statement in [Customer promises](../product/spec/customer-promises.md), [Scenarios](../product/spec/scenarios.md) and [User can](../product/spec/user-can.md).
2. **The views and the architecture:** [Sharing](../design/views/sharing.md), [Files](../design/views/files.html), [Secondary views](../design/views/secondary-views.md), [Repository and publishing](../architecture/repository-and-publishing.html) and [Desktop and Git](../architecture/desktop-and-git.md).
3. **The plan:** requirements in [Requirements](../product/requirements.md), each in one work package of the [work graph](work-graph.json) and one stage of the [roadmap](roadmap.md), with the beliefs it rests on in [Risks](risks.md) and the choices in [Decisions](decisions.md).

The sections below answer the owner's questions, then map every note to where it's specified.

## Answers to the owner's questions

These are the recorded design answers; the six follow-up product choices below were accepted by the owner at 13:35. Other reversible defaults remain adjustable.

| Question | Answer | Why | Rejected | Decision |
| --- | --- | --- | --- | --- |
| **Why do we need projects?** | To give separate parts of a life their own scope: a job, a book, a club. A project is one GitHub repository with its own notes, history, people, sharing and site, opened in its own window, so nothing from another project shows up, gets searched, linked or committed by mistake. | It's the owner's own reason ("isolate context and scope and work in a focus mode") made concrete, and it's what GitHub already separates: commits, permissions and Pages are per repository. | Folders inside one repository (scope by convention only; one history; a collaborator sees everything). | [D-272](decisions.md#projects-sharing-and-publishing-3-november-2026) |
| **Open or switch?** | **Open.** Each project opens in its own window; several can be open at once; opening one that's open brings it forward. The word *switch* is never used. | A window per project makes the scope visible and keeps one project's unsaved work untouched by another. It matches the owner's wish for "multiple instances … each representing a different project". | Switching in place (scope invisible); projects as tabs (several scopes in one window). | D-273 |
| **Pinned or favourites?** | **Pinned.** Pin projects in Projects, and folders or notes in the project's Files panel. Pinned folders open their existing tree, not a duplicate collection. | The actual nesting explicitly asks for pinned **folders and projects**; notes are an additional convenience, not a replacement for folders. | Favourites; notes-only pinning. | D-277, D-293 |
| **Recent folders or files?** | **Files only**, newest first. | A note is what people return to; its folder is one step away (*Show in Files*). | Recent folders as a second list. | D-276 |
| **Show the folder's location?** | **Yes**, as muted text after the title: *⟨project⟩ · ⟨folder⟩* across projects, the folder alone inside a project. | Two notes called "Plan" are only told apart by their place. | Full paths (long and noisy). | D-276 |
| **What are the use cases for files outside a project?** | Two, each with its own home. **Quick notes**: write now, decide where later, in a plain local folder that opens in its own window and keeps every note in Recent. **A file on its own**: *Open with Focus Notes* on a `.md` or `.txt` opens it in a file window, saved in place, with no project features. | They're the owner's two use cases, and neither should pull a stray file into a project's scope. | Saving quick notes into the last project; importing an opened file into a project first. | D-278, D-279 |
| **What remains on the web?** | A clean read-only website: published pages and the sealed share reader. No writing app, browser-local note store, private owner vault, demo editor or browser-to-desktop import funnel. | The owner has explicitly dropped both browser-writing models. This is a product choice, not a claim that static browser editing is technically impossible. | Rewording the browser app as a preview, offline mode or later feature. | D-292 |

## What needs the owner

**None remain for these six product decisions.** All were **ACCEPTED by the owner on 3 November 2026**, relayed at 13:35:

| Accepted choice | Specified outcome |
| --- | --- |
| Turn sharing off (D-274) | Remove shared/published content at the next successful publish; retain the repository. Never delete it. |
| Public Git history (D-274, D-299) | Indefinite plaintext/ciphertext history is accepted; first-share confirmation has one honest history sentence. |
| Shares without names (D-285) | No recipients or note-derived link/code/path/file names; opaque random identifiers only. [Leak contract](../architecture/repository-and-publishing.html#opaque-share-identifiers) and MP.14 cover this. |
| Personal-account invites (D-290) | Offer Collaborator with an explicit “can read and change everything” message; organizations get supported roles. |
| Project terminology (D-272) | [UX-led migration](../experience/projects.md#meeting-project-for-the-first-time), mostly naming; existing repositories/files stay in place. |
| Browser retirement (D-292, D-298) | Approved to plan; one-click local export of the owner's drafts, if any, before removal. No heavy inventory, byte-equivalence or 30-day gates. |

Paper, suggested site name, wording/layout and bounds are reversible defaults, not owner blockers. This task remains **specification/planning only**: no real account action, publication of notes, migration, deletion, release or implementation is performed. Product acceptance does not turn this documentation task into permission to execute those operations.

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
| Pinned folders, not only notes | [Projects → Recent and pinned](../experience/projects.md#recent-and-pinned), [Files](../design/views/files.html) | D-293 |
| Drop browser writing, browser notes and the ease-in plan; Pages is a website | [Repository and publishing](../architecture/repository-and-publishing.html), [Distribution](distribution.md), [Product site and help](../product/site-and-help.md) | D-292 |
| Upload a project SVG logo | [Projects → Telling projects apart](../experience/projects.md#telling-projects-apart) | D-294 |
| Public home, folder sections, article lists/excerpts/counts and article pages | [Published website](../experience/published-site.md) | D-295 |
| Minimal top bar, optional project icon, top-level sections, theme and focus | [Published website → Reading controls](../experience/published-site.md#reading-controls) | D-296 |
| Preview site in the app; choose site theme, fonts and default font size | [Published website → Preview site](../experience/published-site.md#preview-site) | D-297 |
| Shared ciphertext in the public repository, never a public listing | [Repository and publishing](../architecture/repository-and-publishing.html#project-model) | D-299 |

All of it is planned in stage **MP: Projects and simpler sharing** of the [roadmap](roadmap.md), as work packages WP-P.1 to WP-P.15 in the [implementation plan](implementation-plan.md#mp).

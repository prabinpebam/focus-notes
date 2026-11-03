# Next direction: projects, sharing and fixes

The owner's notes of 3 November 2026 on what Focus Notes does next, kept word for word, and the plan that turns each note into the spec: the chain, the views, the requirements and the decisions (D-272 to D-304).

**Second source:** the owner's [image notes](../experience/images.md#the-owners-image-notes-3-november-2026), kept word for word with their flows, figures and storage, sharing and editing contract on their own page (D-300 to D-304, SC-IMG-01 to SC-IMG-05, UC-IMG-01 to UC-IMG-06, IMG-01 to IMG-10).

> [!NOTE]
> **TL;DR.** The owner's notes ask for writing fixes, recognizable projects, pins and item-first sharing, with Pages as a reading website. All six follow-up decisions were **accepted by the owner on 3 November at 13:35**: keep the site repository when turning sharing off, accept retained Git history, use opaque names-free shares, permit personal-account invites, make the project migration UX-led and simplify browser retirement. This remains specification/planning, not a current-build or execution claim.

## The owner's notes (3 November 2026)

Captured from the owner's product-notes file on 3 November. Only Focus Notes product content is present and no product line is omitted. Everything below and on the linked pages interprets these notes; when they disagree, the notes win.

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

## The owner's launch notes (3 November 2026, 18:01)

Captured word for word, with their nesting, from the owner's product-notes file `focus-notes-launch.md`, relayed at 18:01. The source is never edited, moved or committed. When this page and the notes disagree, the notes win.

```text
# Focus notes launch

- Launching of focus notes immediately launches the last note was was being edited.
- Since we can have multiple instance of Focus note, the last project and file that was closed, will be considered the last edited file.

## Opening other projects

We need a shortcut to open this view.\
What are the main JTBD in this view

- Open a file in an another project
- Open a project
- Find a file/project and open it.
- Create new "Local notes"
  - "Local notes" are notes that are not part of any project.
  - Let's not call this "Quick notes", this note is not quicker than creating notes in a proper project.
- Open a file
- New project.
- We need a 2 column layout
- 1st column
  - Recent files from other projects, other local notes and files which are not from any specific projects that were opened. (While it's not just strictly recent, the term is simple to understand for users. "Recommended" sounds pretentious. So just keep the term as "recent".)
    - Combination of recency and frequency. This is a solved problem, research online for what algorithm works best for this use case and use that algo.
  - You can pin files too
    - Pinning them here is different from pinning inside a project
- 2nd Column
  - Pinned projects
  - Other projects
    - Use the same recent and frequency/quantity of engagement logic from earlier for projects too.
```

### Answers to the launch notes

| Note | Answer | Decision |
| --- | --- | --- |
| Launch opens the last note being edited | Starting Focus Notes opens the note last edited, at its caret and scroll, in its project's window, with no Projects screen first. With several windows, the last one **closed** is the last edited, because it held the last word. If that note is gone, its project opens on its missing-file recovery; never an empty note. | [D-318](decisions.md) |
| A shortcut for the view that opens other projects | **Open** (the view that was Projects) is <kbd>Ctrl+Alt+O</kbd> (<kbd>⌥⌘O</kbd>). <kbd>Ctrl+O</kbd> is Files and <kbd>Ctrl+Shift+O</kbd> is Go to heading, so the key already reserved for Open project… (D-273) moves to the whole view. | D-319 |
| Its jobs: open a file in another project, open a project, find a file or project, new Local note, open a file, New project | All six from one view: a search field across both columns, **Recent** files on the left, **Projects** on the right, and four actions on top: **New Local note**, **Open file…**, **Open from GitHub…** and **New project…** (the deliberate flow, D-315). | D-319 |
| Call them Local notes, not Quick notes | Renamed everywhere: **Local notes** are notes that aren't part of any project, saved on this computer. | D-320 |
| Two columns: Recent, then Projects | Column 1 **Recent** (the owner's word; "Recommended" rejected): files from other projects, Local notes and files opened on their own, with **pinned files** first. Column 2: **Pinned projects**, then **Other projects**. | D-319 |
| Recency and frequency combined: research the algorithm, use the best one | **Exponential-decay frecency** with a 14-day half-life, one stored number per item, for files and projects alike. Researched against Firefox's bucketed frecency and zoxide's aging; sources in the decision. | D-321 |
| Pinning here differs from pinning inside a project | Two pin scopes: **Pinned in Open** (files from anywhere, on this device) and **Pinned in Files** (folders and notes of one project, per account). Neither changes the other. | D-322 |

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
| **What are the use cases for files outside a project?** | Two, each with its own home. **Local notes**: write now, decide where later, in a plain local folder that opens in its own window and keeps every note in Recent. **A file on its own**: *Open with Focus Notes* on a `.md` or `.txt` opens it in a file window, saved in place, with no project features. | They're the owner's two use cases, and neither should pull a stray file into a project's scope. | Saving local notes into the last project; importing an opened file into a project first. | D-278, D-279 |
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

Paper, suggested site name, wording/layout and bounds are reversible defaults, not owner blockers. Everything here is specified and planned, not built; no account, publication, migration or deletion has happened.

## Where each note is specified

| Note | Specified in | Decision |
| --- | --- | --- |
| Ctrl+Shift+N with a project or folder first | [Files → Creating](../design/views/files.html), [Keyboard shortcuts](../experience/keyboard-shortcuts.md) | D-280 |
| File name apart from the title | [Files → Names and titles](../design/views/files.html#names-and-titles) | D-281 |
| Ctrl+Enter generates; writing without a selection | [Rewrite with AI](../experience/rewrite-with-ai.md) | D-282 |
| Spotlight closes after Enter | [Spotlight](../experience/spotlight.html) | D-283 |
| Projects: what, why, open, scope, look, private only | [Projects](../experience/projects.md) | D-272 to D-275 |
| Recent files and pinning | [Projects → Recent and pinned](../experience/projects.md#recent-and-pinned) | D-276, D-277 |
| Launch reopens the last note; the Open view; Local notes; frecency; two pin scopes | [Projects → Launch](../experience/projects.md#launch), [The Open view](../experience/projects.md#the-open-view), [Recent and pinned](../experience/projects.md#recent-and-pinned) | D-318 to D-322 |
| Local notes; Open with Focus Notes | [Projects → Local notes](../experience/projects.md#local-notes), [A file on its own](../experience/projects.md#a-file-on-its-own) | D-278, D-279 |
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
| Inline images: drop, three display modes and remembered/bulk switches | [Images → Display](../experience/images.md#three-display-modes), [Image menu](../experience/images.md#image-menu-and-selection) | D-300, D-302 |
| Image storage and encrypted sharing | [Images → Assets](../experience/images.md#assets-markdown-and-encrypted-sharing), [Publishing/assets](../architecture/repository-and-publishing.html#image-assets-planned) | D-301 |
| Cut/Copy/Replace/Save image and Auto caption below image | [Image menu](../experience/images.md#image-menu-and-selection), [Auto caption](../experience/images.md#auto-caption-using-ai) | D-302, D-303 |
| Crop/rotate modal and destructive-save/Git recovery boundary | [Images → Crop and rotate](../experience/images.md#crop-and-rotate-dialog) | D-304 |

The first source is planned in **MP: Projects and simpler sharing**, WP-P.1 to WP-P.15. Images extend the existing **Later: Components** stage: assets/encryption WP-9.3, inline image/display/actions WP-9.1, crop/rotate WP-9.4 and optional captions WP-9.5; gallery WP-9.2 stays separate. See [roadmap](roadmap.md), [MP plan](implementation-plan.md#mp) and [image plan](implementation-plan.md#later). All are specification/planning, not built or approved UI.

## Review, 3 November

A critique of everything above and on the linked pages, made the same afternoon: a grounding critique of the chain, a design-system audit of the view specs, and a review of fidelity, feasibility and the plan, with external facts checked against their sources. Both source captures still match the owner's files exactly, and the owner's 13:35 decisions hold everywhere. Fixes are on the pages themselves; reversible choices are [D-305 to D-314](decisions.md#review-of-the-3-november-direction-d-305-to-d-314). None needs the owner before design review.

### Critical

| Finding | Fix |
| --- | --- |
| Turning sharing off kept the site's deploy key and secret, so the public repository's workflows could still read every private note. | The desktop app now seals shares and the site never holds a private key; Turn off removes any legacy key, secret and scheduled deploy ([D-305](decisions.md#review-of-the-3-november-direction-d-305-to-d-314), R-50, MP.16). |
| Who seals committed ciphertext, and when, wasn't decided; re-sealing on every build would grow the public repository towards GitHub's 1 GB Pages limit. The visibility table also said shared content lived only in the private repository. | Sealed only when a share changes (D-305, R-54); [visibility table](../design/views/sharing.md#three-levels-of-visibility) corrected. Source: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). |
| Images were to be stored as a `::image{…}` directive, which GitHub shows as text, not a picture, breaking the ownership promise. | Standard Markdown images with an options block only when needed ([D-310](../experience/images.md#assets-markdown-and-encrypted-sharing), IMG-10, IMG.9). |
| The default site name `⟨project⟩-site` put the project's name in every share link. | Neutral, editable `notes-site`, with "This name appears in every link you share" (D-312). |
| A folder share silently included notes added later, and a second Share… changed the first recipients' access. | Folder membership is fixed unless **Include notes added later** is on (D-311); Share… always starts a new share (D-307); MP.17, MP.18. |
| The first-share confirmation stacked a second dialog and scored about 48 on the visual vs verbose score; images had no way to write a description or caption by hand. | An [in-place step](../experience/projects.md#private-only-until-the-first-share) with rows and badges (about 78); **Edit description…** and **Add caption** in the [image menu](../experience/images.md#image-menu-and-selection). |

### Major

| Finding | Fix |
| --- | --- |
| Windows has no Electron share-sheet API ([ShareMenu](https://www.electronjs.org/docs/latest/api/share-menu) is macOS only), so the owner's Share button on Windows rested on an unproven bridge. | D-308: a one-hour spike (A-SHR-01) first; until proven, the button honestly reads Copy share information (R-51, MP.19). |
| "Multiple instances" wasn't reconciled with the single-instance lock, *Open with* routing or the tray; a project window's Projects list showed other projects' files. | One running app, one window per project, paths routed to the owning window; no other project's files inside a window ([D-309](../experience/projects.md#the-open-view), MP.20). |
| Existing workspaces nest the private repository inside the public one, the opposite of new projects, and a new site's place on disk was unstated. | D-306: a new project is one folder with its site at `public\`; existing layouts don't move. |
| "Separate color theming" was narrowed to an accent; pins synced to collaborators. | Accent on the title band and Files heading plus an optional per-project Appearance; per-account pins (D-313). |
| The plan made the owner's three share-dialog fixes wait for all of projects, made inline images wait for encrypted sharing, and packed five deep requirements into WP-P.4. | D-314: Switch (WP-P.16) and the share dialog (WP-P.9) first, the terminology move (WP-P.17) early, WP-P.4 split, turn on/off as WP-P.18, image storage apart from image sharing (WP-9.6). |
| Turning sharing off had no scenario or user-can; the share and project flows had no offline, sign-in-expired, no-permission, large-folder, deleted-item or two-device conflict states. | SC-SHARE-08 and UC-SHARE-12; state tables in [Sharing](../design/views/sharing.md#states-and-evidence) and [Projects](../experience/projects.md#states-waits-and-accessibility); MP.21. |
| Unregistered beliefs: the sign-in can create repositories and enable Pages; "ready" can be detected. | R-52 (a protocol matrix per token type) and R-53 (ready = GitHub's deployment status). |
| Components named as existing weren't all built (Switch, Select, Disclosure); named-audience components remained in the catalogue. | Real statuses listed; Switch contract completed; AudienceRow retired, ShareRow added ([components](../design/system/components.md)). |

### Minor

| Finding | Fix |
| --- | --- |
| Stale or contradictory text: D-277's "folders can't be pinned", 30-day Local notes recovery, SHR-01/SHR-11 named audiences, SHR-07's 12-character passcode, Mod+Shift+N as New window, "Make public" labels, the redirect contradiction, the live demo view, retired browser packages still marked building or verifying, "workspace" in user-can rows. | Each corrected or marked superseded; retired packages marked retired; redirects come from a rename map (D-312). |
| Image details: the error didn't state the limits, crop focus was unclear, transparent images vanished in dark mode, figure corners were rounded by default, and pasting wasn't specified. | Copy with limits, focus on the Left field, a token backdrop, square figure corners, paste follows the drop path. |
| Process notes ("this task performs no…", relay times) sat in product pages. | Removed. |

**Left as is, with reasons.** Collapsing the three copy actions into a menu: the owner listed all four actions. Ctrl+Alt+O and Ctrl+Alt+N: the existing rule already lets AltGr characters win, so the menu remains the path on those layouts. "Workspace" in as-built architecture pages: WP-P.17's copy check renames it with the build. WEB-01's link to UC-SHARE-10 and the non-goal wording inside two promises are minor and left for the next chain pass.

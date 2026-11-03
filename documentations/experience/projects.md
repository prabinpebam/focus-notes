# Projects

Separate places for separate work, without making every thought choose a project first.

> [!NOTE]
> **TL;DR.** A project is one private GitHub repository, opened in its own window. Its files, search, history, people and commits never mix with another project's. Open several; identify them by name, colour and logo. Pin projects and folders, return to recent files with their place, jot in local Quick notes, or open a file on its own. A project starts **Private only**; its first share explains the public site before creating anything. This is a **planned specification**, not the current build. Source: [the owner's nested notes](../plan/next-direction.md), decisions D-272 to D-293.

## What a project is for

Work, a book and a club each need their own context. A folder groups notes inside that context; a project separates the history and permissions too. Giving someone access to a folder through a share link is read-only and limited. Inviting them to the project gives actual GitHub repository access, including private notes and sharing secrets.

<!-- Visual thesis: private project scope exists before any public site; sharing adds a separate, explicitly enabled surface. No icons are needed: containment and branching carry the meaning. -->
<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 390" role="img" aria-labelledby="fnproj-model__title fnproj-model__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnproj-model__title">One private project; a public site only when you enable sharing</title>
<desc id="fnproj-model__desc">The project window contains notes, files, search and history and saves only to its own private GitHub repository. A separate public site repository is created only after the first-share confirmation. Shared notes leave as encrypted pages; published notes are readable by anyone. Quick notes and external files stay local, outside the project.</desc>
<g id="fnproj-model__project" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnproj-model__window" x="24" y="32" width="284" height="226" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="68" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__window" data-slate-fit-padding="16">Book · project window</text>
<text x="44" y="110" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__window" data-slate-fit-padding="16">Files · Search · Recent</text>
<text x="44" y="146" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__window" data-slate-fit-padding="16">History · People · Agents</text>
<text x="44" y="220" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-model__window" data-slate-fit-padding="16">Only this project's context</text>
</g>
<g id="fnproj-model__storage" data-slate-svg-step="2" data-slate-svg-effect="fade-rise">
<path d="M308 144 H348" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<rect id="fnproj-model__private" x="348" y="32" width="278" height="226" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="368" y="68" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__private" data-slate-fit-padding="16">Private repository</text>
<text x="368" y="110" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__private" data-slate-fit-padding="16">Notes and project settings</text>
<text x="368" y="146" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__private" data-slate-fit-padding="16">Its own commits and sync</text>
<text x="368" y="220" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-model__private" data-slate-fit-padding="16">Default: Private only</text>
</g>
<g id="fnproj-model__site" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<path d="M626 144 H666" stroke="var(--color-neutral-fg-2)" stroke-width="2" stroke-dasharray="5 5" />
<rect id="fnproj-model__public" x="666" y="32" width="310" height="226" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="686" y="68" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__public" data-slate-fit-padding="16">Site · only after consent</text>
<text x="686" y="110" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__public" data-slate-fit-padding="16">Shared → encrypted pages</text>
<text x="686" y="146" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__public" data-slate-fit-padding="16">Published → anyone can read</text>
<text x="686" y="220" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-model__public" data-slate-fit-padding="16">Read-only website, own theme</text>
</g>
<g id="fnproj-model__local" data-slate-svg-step="4" data-slate-svg-effect="fade-rise">
<rect id="fnproj-model__localbox" x="24" y="294" width="952" height="64" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="333" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-model__localbox" data-slate-fit-padding="16">Outside projects: Quick notes and standalone files · saved locally · never uploaded automatically</text>
</g>
</svg>
<figcaption>Project and repository model (D-272, D-274, D-292). The dashed connection does not exist until the person enables sharing.</figcaption>
</figure>

The figure's text alternative is the model itself: a project window operates on one private repository; an optional public site receives selected plaintext publications or ciphertext shares. Local capture and external files belong to neither repository.

## Opening a project

**Open**, not switch. **Open project…** (Ctrl+Alt+O / ⌥⌘O), ⋯ → Projects, or Spotlight opens Projects. In an existing window this is a dialog; with no project open it fills the window. It offers **New project…**, existing/pinned projects, file-only Recent, **Quick notes** and **Open file…**. These entries are explicit scope exits, not another project's notes appearing in the active Files/search tree.

1. Choose a known project, a local project folder, or **Open from GitHub…**. Signed out, sign in only for the GitHub path. Existing local projects open offline.
2. If already open, bring its window forward. Do not mount another watcher or copy the working folder.
3. Otherwise prepare the new window while the old window and drafts remain usable. Only show its note when the project identity and saved appearance are ready; never a blank or wrong-project frame.
4. Restore the last note and caret for that project. If unavailable, show its missing-file recovery, never create an empty replacement silently.

<!-- Visual thesis: opening is a branch to another window, never a scope swap underneath a draft. -->
<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 350" role="img" aria-labelledby="fnproj-open__title fnproj-open__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnproj-open__title">Opening a project preserves the current window</title>
<desc id="fnproj-open__desc">Choose Book from Projects. If it is already open, focus its existing window. If not, prepare a separate Book window and restore its last note. If preparation fails, keep the current window and show Retry. Work and its draft remain untouched in every branch.</desc>
<g id="fnproj-open__choose" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnproj-open__pick" x="24" y="92" width="280" height="158" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="132" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-open__pick" data-slate-fit-padding="16">Choose Book in Projects</text>
<text x="44" y="178" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-open__pick" data-slate-fit-padding="16">Work stays open</text>
<text x="44" y="212" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-open__pick" data-slate-fit-padding="16">Its draft stays untouched</text>
</g>
<g id="fnproj-open__branches" data-slate-svg-step="2" data-slate-svg-effect="draw">
<path d="M304 166 H350 V68 H394 M350 166 H394 M350 166 V264 H394" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
</g>
<g id="fnproj-open__results" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<rect id="fnproj-open__existing" x="394" y="24" width="582" height="88" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="416" y="60" font-size="18" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-open__existing" data-slate-fit-padding="16">Already open → bring Book forward</text>
<text x="416" y="88" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-open__existing" data-slate-fit-padding="16">No duplicate window or watcher</text>
<rect id="fnproj-open__new" x="394" y="124" width="582" height="88" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="416" y="160" font-size="18" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-open__new" data-slate-fit-padding="16">Not open → prepare a separate Book window</text>
<text x="416" y="188" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-open__new" data-slate-fit-padding="16">Restore the last note only when its view is ready</text>
<rect id="fnproj-open__error" x="394" y="224" width="582" height="102" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="416" y="262" font-size="18" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnproj-open__error" data-slate-fit-padding="16">Unavailable → keep Work; explain the problem</text>
<text x="416" y="298" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnproj-open__error" data-slate-fit-padding="16">Retry, find the folder or sign in again; create nothing</text>
</g>
</svg>
<figcaption>Open-project flow (D-273). Cancel returns to Work with its note, selection and scroll unchanged.</figcaption>
</figure>

### Creating and closing

**New project…** asks **Project name**, GitHub owner (only when more than one is available) and local folder. Explain **Private only** beside the action. Validate the name/collision before creating; preserve all input on refusal. **Create project** creates only the private repository and local notes, never a site. Report any partial remote result with its link and **Continue setup**; never retry a creation blindly or delete the result automatically. Cancel before the remote request creates nothing; once accepted, leave the tracked operation visible until its outcome is known.

**Close project** flushes local saves and recovery before closing that window; offline backup may wait and must say so. Quit restores the last-open projects on next launch, not additional windows for individual notes. Existing note-window behaviour remains inside the same project identity, never an escape into another scope.

### Scope is a boundary

Files, Spotlight, find across notes, link suggestions, Recent inside Files, Move to…, Import, history, Recently deleted, backup and agents resolve only the active project. Validate canonical paths, note IDs and symlinks at the command boundary, not just by hiding rows. Cross-project relative links are not followed as project notes; external links follow the existing external-link policy. An explicitly chosen project in Projects opens separately.

## Private only until the first share

A new project has no public repository, Pages site, browser vault or share output. **Share…** and **Publish…** first ask:

> **Turn on sharing for “Book”?**  
> This creates the public GitHub repository “Book-site” and its website. Shared notes are encrypted and open with a link or access code. Published notes can be read by anyone. Your other notes stay private.  
> **Cancel** · **Turn on sharing**

Show the actual repository owner/name and Pages address before confirming, not only the example. Do not create a repository, upload content or enable Pages before confirmation. On success resume the original item and untouched share draft. If site creation fails part-way, list what was created, keep the project private-only until setup is complete, and offer **Continue setup**; never silently create another site.

**Turn off sharing** is separate from changing a note to Private. It warns that every hosted share/public page will stop after the site is removed, downloaded copies and Git history cannot be recalled, and private project notes remain intact. Proposed site deletion requires the owner's approval before implementation; do not delete any real repository during this design task.

Existing workspaces are proposed to map private repository → project and instance repository → site without moving files. Before any migration: owner approval, recoverable snapshot, explicit mapping, byte/ID/link/history inventory, rollback and supported old-grant reader. An absent private repository never becomes a new empty project silently.

## Telling projects apart

Settings → Project offers 12 contrast-safe accent presets and 24 generic preset SVG logos. Use licensed catalogue geometry in the implementation, not uploaded artwork or hand-drawn familiar icons. The choices live in `.focus-notes/project.json`. These preset counts and watermark opacity are proposed design parameters, not measured usability findings.

| Choice | Result | What never changes |
| --- | --- | --- |
| Colour | Accent tint on controls and project identity | Text contrast, personal reading theme |
| Badge | Logo in title band, Files heading and Projects | Project name and text twin remain |
| Watermark | Badge plus a 4% canvas mark outside text | No overlay on writing, pointer interception or extra motion |
| Off | No logo or watermark | Project name remains in window/task-switcher identity |

No one-sided accent stripes. Use fills, full outlines and badges. A window is named **⟨note title⟩ — ⟨project⟩ — Focus Notes**, so OS window lists and screen readers distinguish even identical notes. Appearance remains token-based in light, dark and contrast; Off does not make scope unknowable.

## Recent and pinned

**Recent** is files, never folders, newest first. In Projects a row reads **Plan** with **Book · Drafts / Chapter 1** below; in Book's Files, only **Drafts / Chapter 1**. Show **Root** for the root folder. Quick notes and standalone files have explicit **Local only** location labels. Full path is available on focus/tooltip and through **Show in folder**, not forced into the row.

**Pinned projects** lead Projects on this device. **Pinned folders and notes** lead Files inside the project, persisted in `.focus-notes/pins.json`. A pinned folder is a shortcut into its real expandable subtree, not a second copy; selecting it reveals that folder. Pin/Unpin is in row menus and Spotlight. Stable identity follows rename/move; deletion removes the shortcut, and undo restores it with the item. Missing external files offer **Locate file…** or **Remove from Recent**; removing a history row never deletes a file.

## Quick notes

**Quick notes** opens a local folder window under `Documents\Focus Notes\Quick notes`. The OS-resolved Documents location is used, not a hardcoded English directory. No sign-in, repository, share controls or implicit upload. If Documents is cloud-synced, state the detected service as the existing [notes-folder policy](notes-folder.md) does; “Local only” means no Focus Notes/GitHub backup, not a promise that another service never syncs it.

New notes autosave with the ordinary journal and appear in Recent. A failed write keeps the dirty text in recovery and says **“Couldn't save this quick note. Choose another folder or try again.”** No success state until disk confirms. Later **Import into project…** chooses a project/folder and copies the note; keep the local original until the person explicitly deletes it. A folder missing at launch uses recovery, never a silently empty replacement.

## A file on its own

**Open file…** or **Open with Focus Notes** handles `.md`, `.markdown` and `.txt`. It opens one file window and saves in place, not in the last-used project. A file already inside an open project goes to that window. If inside a closed known project, offer **Open project** or **Open file only** rather than silently cloning or importing it.

The file window keeps writing, focus, find-in-note, theme and print. It has no project Files/search, Git backup, People, Share, Publish or agent exposure. `.txt` stays plain text; formatting that would require conversion is unavailable until an explicit **Save as…** to Markdown. Preserve encoding, BOM and line endings, reject unsupported encodings explicitly, and never replace the original during conversion. Save as a taken path needs an overwrite confirmation.

Dirty recovery and external edits use the same no-loss rules as project notes. An external conflict offers both versions before any overwrite. Read-only locations keep the draft and offer **Save as…**. Status says **Saved here** or **Local only**, never **Backed up**.

## People in a project

Inviting is not sharing. Settings → Project → People lists GitHub accounts and pending invitations; **Invite…** takes a GitHub username, not email or an invented recipient record. Fetch actual permission/owner information before presenting roles.

| Repository owner | Choices | Consequence shown before invite |
| --- | --- | --- |
| Organization | Read, Triage, Write, Maintain, Admin as permitted by the caller and organization policy | Role applies to the whole repository, not a chosen folder; Read sees every private note and access record |
| Personal account | Collaborator (can read and change everything) | No Read-only/Triage/Maintain/Admin picker; GitHub does not offer that role model here |

Source: [GitHub REST collaborator permissions](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator), whose `permission` parameter is only valid on organization-owned repositories; checked for D-290. The UI must use returned permissions and display **Manage on GitHub** when the current account cannot invite or policy blocks it.

Before **Send invite**, say **“Project access includes every private note and sharing secret. It cannot be limited to a folder.”** Do not invite to the site repository automatically. Pending is not accepted; retry checks the existing invitation first. Removal confirms its scope and warns that existing clones/copies cannot be recalled. No real invite is sent by this spec.

## Settings and words

Settings → **Project** contains **Name**, **Colour**, **Logo**, **People**, **Sharing**, **Site theme** (only with sharing on) and **On GitHub**. Local **Folder** remains reachable; moves use existing lossless recovery safeguards. **Name** is a display name; repository rename is not implied. **Sharing** names Private only / On and its explicit action; **Site theme** never changes app Appearance.

| Use | Meaning | Do not use |
| --- | --- | --- |
| Project | One private scope, history and window | Workspace / repository on the main path |
| Open project | Open or focus its separate window | Switch project |
| Pinned | Shortcut kept at the top | Favourites |
| Quick notes | Local capture, no GitHub setup | Temporary / unsaved notes |
| Share | Read-only link or access code to an item | Invite people |
| Invite | Account-backed GitHub access to the project | Share a folder with Write |

## States, waits and accessibility

Project selection/pin feedback answers within 100 ms. Prepare/open/create/invite/site operations go through the task tracker; their [wait inventory](../architecture/perceived-performance.md) records pattern, status and measure before wiring. Keep the old view/draft until a complete replacement is ready; long work is leavable and never silently retried.

| State | Visible result and way forward |
| --- | --- |
| Empty | **No projects yet.** New project… and Quick notes; no sign-in wall for local capture |
| Opening / creating | **Opening “Book”…** / **Creating “Book”…** in the chosen row/task, elapsed/steps when long |
| Missing folder | Recovery names the folder, Find folder… / Download again where appropriate; no automatic creation |
| Offline | Local project opens; remote creation/invites unavailable with reason; keep all input |
| Permission refused | **“Couldn't open this project. Check your GitHub access, then try again.”** Sign in / Retry |
| Invalid/taken name | Field error and a suggested available name; retain input, no remote side effects |
| Pending invite | Named account and Pending; Cancel invite when authorized, not a success badge |

Projects/Recent rows have text names and location, keyboard arrows and Enter; Pin/Unpin is not nested inside a competing row button. Dialog focus returns to its opener on Cancel; asynchronous refresh keeps focus and scroll. At 320 px reflow location under title with no horizontal scrolling. All targets/focus/contrast use the design system and reduced motion.

## Design decisions

| ID | Choice | Serves | Why / alternative rejected |
| --- | --- | --- | --- |
| DD-PROJ-01 | One project per window; open, never replace | UC-PROJ-01, UC-PROJ-02, UC-PROJ-03 | Makes scope and history visible; tabs mix contexts |
| DD-PROJ-02 | Name plus accent and optional preset logo | UC-PROJ-04 | Colour alone excludes users; whole-project themes override personal comfort |
| DD-PROJ-03 | File-only Recent and real folder/project pins | UC-PROJ-05, UC-PROJ-06 | Return to work without another favourites collection |
| DD-PROJ-04 | Local Quick notes and standalone files are explicit non-project scopes | UC-PROJ-07, UC-PROJ-08 | No accidental import, upload or Git setup |
| DD-PROJ-05 | Fixed destination picker, private-first creation | UC-FILE-12, UC-SHARE-08 | Cancel has no effect; first share explains public footprint |
| DD-PROJ-06 | Actual GitHub roles and full-project warning | UC-SHARE-09 | Never imply folder-only or personal-account Read-only access |

**Evidence still required:** [MP done rows](../plan/definition-of-done.md#projects-and-simpler-sharing). These flow/figure specs do not substitute for approved JSON view documents or working runtime.

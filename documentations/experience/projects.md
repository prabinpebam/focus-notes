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
<figcaption>Project = private repository; its site = public repository (D-272, D-274). Existing pairs keep those repositories in place; only their on-screen names change. For new projects the dashed connection appears only after sharing is enabled.</figcaption>
</figure>

The figure's text alternative is the model itself: a project window owns one private repository and may also edit its explicitly paired site's Public notes. The site receives selected plaintext publications or ciphertext shares. This authorized pair is one project context, not permission to browse any sibling repository. Only Publish/Make private crosses its two roots, with visibility confirmation; another project's roots/IDs are always rejected. Local capture and external files belong to neither repository.

**On disk (D-306):** a new project is one folder, its private repository; once sharing is on, the site is a clone inside it at `public\`, which the private repository ignores, so the project moves as one folder. An existing workspace keeps its layout (the site repository at the root, private notes in its `private\` submodule); nothing moves.

## Meeting Project for the first time

**Accepted migration plan (owner, 3 November; D-272).** This is predominantly a vocabulary and UX change, not a storage redesign. The figure above is the explainer used by the upgrade note and Help: a project is the existing private repository; its site is the existing public repository. Existing public/private note locations, repository URLs, `.git`/submodule arrangement, IDs, relative links, credentials, commits, pending saves and publishing settings stay where they are. Never re-clone, move notes, create a replacement repository or silently turn sharing on.

| Moment | What the person sees | Behaviour |
| --- | --- | --- |
| Existing owner/user upgrades | Non-blocking one-time notice: **“Your workspace is now called a project. Your notes and files are in the same place.”** Actions **Learn about projects** / **Dismiss** | Show after restoring the same note/caret, not before saving or behind a setup wizard. Keep working; dismiss is remembered on this device. |
| First run, no existing workspace | **“Keep related notes together in a project. Each project has its own files and history.”** New project… / Open project… / Quick notes | Show the repository/site explainer in Learn more; GitHub terminology only when choosing GitHub. Quick notes needs no account. |
| Existing paired workspace | Existing project display name and **Sharing on**, with its current site address | Reuse the known private/site mapping; no new setup or public-site consent because nothing new is being created/published. If mapping is unavailable, show Find folder…; do not make an empty replacement. |
| Project picker and Files | **Projects**, **Open project…**; Files heading **⟨project⟩**, Public/Private sections keep their visibility labels | A folder is inside a project, not another project; Recent retains locations and pins. No change to note title or disk filename. |
| Settings | **Project** replaces Workspace; **Name**, **Folder**, **People**, **Sharing**, **Site theme**, **On GitHub** | Name is display-only. Folder shows the unchanged local location; site controls clearly describe the separate public surface. |
| Title bar / OS windows | **⟨note title⟩ — ⟨project⟩ — Focus Notes** | Update accessible window name at the same time; no scope reload, blank frame or lost caret. |
| Help and old links | **“A project keeps related notes, their history and GitHub access together. It is your private repository. Its site is the separate public repository used for published pages and encrypted shares.”** | Follow with **“If you used a workspace before, it is now called a project. Your files have not moved.”** Preserve old workspace Help anchors with a short terminology pointer. |

**Safety:** retain the existing configuration snapshot; rollback restores the old labels/configuration against the same unmoved files.

No automatic tour, forced sign-in or new modal for upgrading. A read-only/offline project still gets the new words; failed preference writes keep the notice dismissible for this session and report the save failure, never block writing. At narrow widths put the project name on its own line; keyboard/screen-reader labels use the same noun. Acceptance is the owner explaining Project versus its site from the figure and finding their existing note/settings without relocating anything (PRJ-11 / MP.15).

## Opening a project

**Open**, not switch. **Open project…** (Ctrl+Alt+O / ⌥⌘O), ⋯ → Projects, or Spotlight opens Projects. In an existing window this is a dialog; with no project open it fills the window. It offers **New project…**, existing and pinned projects, **Quick notes** and **Open file…**. Inside a project window it lists project names only, never another project's files: cross-project **Recent** appears only in the window shown when no project is open (D-309), because the owner's rule is that a project window can't browse outside its project. The list is a listbox of ItemCard rows (name, location, mark) with arrows, Home/End and type-ahead; Pin/Unpin is a separate menu button on each row. Opening a project from here never reveals that project's notes in this window.

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

**New project is a deliberate action of its own** (owner's correction, 3 November; D-315). It's reachable only from **New project…** in Projects (and its empty and first-run states) and from Spotlight's **> New project…**, never from New note, New note in… (which only picks a folder in this project) or Quick notes. It opens a short stepped dialog with step dots, **Back**, **Next** and **Cancel** on every step:

1. **Name:** **Project name**, then GitHub owner (only when more than one is available). Validate the name and collisions here; keep all input on refusal.
2. **Private only:** three rows, each with an icon: **Only you, and people you invite, can see it** · **No website until you turn on sharing** · **Its own folder and history**, with the local folder (**Change…**).
3. **Look:** the accent and logo pickers from Settings → Project, with the project's mark as a live preview; **You can change these later in Settings → Project.**
4. **Confirm:** the mark and name, then **Create project will make:** **A new private repository on GitHub** (⟨owner⟩/⟨name⟩) · **A folder on this computer** (its path) · **No website** (Nothing is public until you turn on sharing). Both the repository row and the folder row have **Change…** on this screen, so nothing sends the person back a step (owner, 3 November):
   - **Folder → Change…** opens the system's folder picker at the current parent. The project's folder is made *inside* the chosen place, named after the project, and the row shows the new path (**D:\Writing › Book**). Cancel keeps the old path. The choice is checked at once, not at Create project, and each problem shows on the row with its own way forward, while **Create project** stays unavailable with the reason:
     - **The folder isn't empty** (a folder of that name already holds files): **“D:\Writing › Book already has files in it. Choose another place, or Use a new folder (Book 2).”** Never adopt, overwrite or move files that are already there.
     - **The folder is already a project** (or inside one): **“D:\Writing › Book is already the project “Book”. Open it instead, or choose another place.”** with **Open project**. A project is never made inside another project.
     - **No write access:** **“Focus Notes can't write to D:\Writing. Choose another place.”** Nothing is created there, not even an empty folder.
     - A place synced by another service (OneDrive, Dropbox) is allowed and named, as the [notes-folder policy](notes-folder.md) does.
   - **Repository → Change…** chooses the GitHub owner (the same list as step 1, shown only when there's more than one). Renaming the repository itself on this screen is the next step, not yet specified: today it follows the project name, and a taken name is caught at step 1.

Nothing is created, and no request leaves the computer, until the final **Create project**. **Create project** creates only the private repository and local notes, never a site. Report any partial remote result with its link and **Continue setup**; never retry a creation blindly or delete the result automatically. Cancel before the remote request creates nothing; once accepted, leave the tracked operation visible until its outcome is known.

**Close project** flushes local saves and recovery before closing that window; offline backup may wait and must say so. Quit restores the last-open projects on next launch, not additional windows for individual notes. Existing note-window behaviour remains inside the same project identity, never an escape into another scope.

### Scope is a boundary

Files, Spotlight, find across notes, link suggestions, Recent inside Files, Move to…, Import, history, Recently deleted, backup and agents resolve only the active project. Validate canonical paths, note IDs and symlinks at the command boundary, not just by hiding rows. Cross-project relative links are not followed as project notes; external links follow the existing external-link policy. An explicitly chosen project in Projects opens separately.

## Private only until the first share

A new project has no public repository, Pages site, browser vault or share output. The first **Share…**, **Publish…** or **Turn on sharing** asks once. From Share… or Publish… it's an **in-place step inside that dialog**, not a dialog stacked on top (DD-IA-04 allows only Review contents to stack); Cancel returns to the untouched draft. From Settings → Project → Sharing it's a single alert dialog.

| Part | Content |
| --- | --- |
| Anchor | The project's mark (48 px) and the title **Turn on sharing for “Book”?** |
| One sentence | **Your other notes stay private.** |
| What's created (two rows, each with an icon) | **Public copy on GitHub** · `prabin/Book-site` · **Website** · `prabin.github.io/Book-site` (the real owner, name and address, never the example) |
| What people can see (two badge rows) | **Shared** badge: encrypted, opens only with a link or access code · **Published** badge: anyone can read it |
| History (one visible line) | **Anything you share or publish stays in GitHub's history, even after you remove it.** |
| More details (disclosure) | It's a public GitHub repository served by GitHub Pages; shared notes are kept there only as encrypted files with random names. |
| Actions | **Cancel** (initial focus) · **Turn on sharing** |

About 40 words visible; estimated VVS 78 (anchor, rows and badges carry the meaning). Focus returns to the action that started it. Do not create a repository, upload content or enable Pages before confirmation. On success resume the original item and untouched share draft. If site creation fails part-way, list what was created, keep the project private-only until setup is complete, and offer **Continue setup**; never silently create another site.

**Turn off sharing** is separate from making one note Private. Confirmation: title **Turn off sharing for “Book”?**, then two rows: **Shared notes** · their links and access codes stop working; **Published notes** · move back to your private notes and leave the website. One line: **The site and its history stay on GitHub; copies people already have can't be recalled.** Actions **Cancel** (initial focus) / **Turn off sharing**. For an existing pair it also removes the private repository's deploy key, the site's secret and its scheduled deploy, so the public repository can no longer read private notes (D-305). It runs as a long, leavable task (**Moving 120 of 480 notes…**). Withdraw every share and remove published/shared content, related assets and discoverability entries from current output; leave an empty reading-site shell/repository, never delete the repository. Until successful publish show **Turning sharing off…** or **Waiting to publish** with Retry publishing; offline/failure must not claim removal. Re-enable reuses the same site, and nothing withdrawn is republished without an explicit action.

Removing public repository content must not destroy the writer's only working copy. Preserve any public-source notes/media privately through the existing Make private copy-before-remove path before committing their public removal; resolve taken paths without overwriting. Failed preservation stops removal with an explicit error. This is the explicitly confirmed Turn off operation, not a disk move during the terminology upgrade.

Existing pairs follow the [UX-led terminology migration](#meeting-project-for-the-first-time); no disk move or new site is required.

## Telling projects apart

Settings → Project offers 12 contrast-safe accent presets, 24 generic preset SVG logos, **Upload SVG…** and an optional **Appearance** for this project (**Follow app**, Light, Dark; Follow app by default, D-313). The accent tints the title band and the Files heading as well as controls, so two windows look different at a glance; the project's Appearance lets the owner make one project dark and another light, as the owner's "separate color theming" asks, without overriding the reading theme unless chosen. The accent is a project-scope modifier on the semantic accent tokens, never per-component overrides; the watermark's opacity is a token (`opacity.watermark`) and the watermark is hidden in more-contrast, forced-colours and reduced-transparency modes. An uploaded logo is shown on a token-coloured plate, or as a single-colour `currentColor` version, and previewed in light and dark before **Apply**; one that's hard to see says **“This logo is hard to see in dark mode. Use a plate or choose another.”** Use licensed catalogue geometry for presets, not hand-drawn familiar icons. Choices live in `.focus-notes/project.json`; sanitized uploaded assets stay in the private project. Preset counts and watermark opacity are proposed design parameters, not measured usability findings.

Upload opens the OS file chooser; Cancel changes nothing. Before rendering, enforce D-294's size/node/viewBox limits and passive SVG allowlist: no scripts/events, foreignObject, HTML, external references, CSS imports, fonts or animation. Reject unsupported input explicitly (**“This SVG can't be used safely. Choose another or use a preset.”**), retaining the old logo and draft. Sanitization must not silently produce a misleading empty logo; show the exact safe result with Apply/Cancel. The untrusted original is never rendered or uploaded. Colour/Badge/Watermark/Off and accessible project-name fallback work for custom logos too. [Site preview](published-site.md#preview-site) makes a site-visible logo's public exposure explicit.

| Choice | Result | What never changes |
| --- | --- | --- |
| Colour | Accent tint on controls and project identity | Text contrast, personal reading theme |
| Badge | Logo in title band, Files heading and Projects | Project name and text twin remain |
| Watermark | Badge plus a 4% canvas mark outside text | No overlay on writing, pointer interception or extra motion |
| Off | No logo or watermark | Project name remains in window/task-switcher identity |

No one-sided accent stripes. Use fills, full outlines and badges. A window is named **⟨note title⟩ — ⟨project⟩ — Focus Notes**, so OS window lists and screen readers distinguish even identical notes. Appearance remains token-based in light, dark and contrast; Off does not make scope unknowable.

## Recent and pinned

**Recent** is files, never folders, newest first. In Projects a row reads **Plan** with **Book · Drafts / Chapter 1** below; in Book's Files, only **Drafts / Chapter 1**. Show **Root** for the root folder. Quick notes and standalone files have explicit **Local only** location labels. Full path is available on focus/tooltip and through **Show in folder**, not forced into the row.

**Pinned projects** lead Projects on this device. **Pinned folders and notes** lead Files inside the project, kept per account in `.focus-notes/pins/<account>.json`, so they follow the owner across devices but aren't imposed on collaborators (D-313). Recent keeps the 50 newest files, dropping the oldest. A pinned folder is a shortcut into its real expandable subtree, not a second copy; selecting it reveals that folder. Pin/Unpin is in row menus and Spotlight. Stable identity follows rename/move; deletion removes the shortcut, and undo restores it with the item. Missing external files offer **Locate file…** or **Remove from Recent**; removing a history row never deletes a file.

## Quick notes

**Quick notes** opens a local folder window under `Documents\Focus Notes\Quick notes`. The OS-resolved Documents location is used, not a hardcoded English directory. No sign-in, repository, share controls or implicit upload. If Documents is cloud-synced, state the detected service as the existing [notes-folder policy](notes-folder.md) does; “Local only” means no Focus Notes/GitHub backup, not a promise that another service never syncs it.

New notes autosave with the ordinary journal and appear in Recent. A failed write keeps the dirty text in recovery and says **“Couldn't save this quick note. Choose another folder or try again.”** No success state until disk confirms. Later **Import into project…** chooses a project/folder and copies the note; keep the local original until the person explicitly deletes it. A folder missing at launch uses recovery, never a silently empty replacement.

**Delete/restore without Git (D-298):** before an explicitly requested delete, keep a durable local recoverable copy with its identity/path/time. Failed retention means no delete and a Retry error. Undo/Recently deleted survive restart; no bespoke 30-day retention gate or timed purge. Restore uses the original folder, otherwise Quick notes root; number taken names, never overwrite. Confirm folders/counts as in Files. Recovery is not remote backup. Standalone windows have no Delete file; externally missing files keep journals and need an explicit restore/save destination.

## A file on its own

**Open file…** or **Open with Focus Notes** handles `.md`, `.markdown` and `.txt`. It opens one file window and saves in place, not in the last-used project. A file already inside an open project goes to that window. If inside a closed known project, offer **Open project** (the default) or **Open file only**, which says **Not backed up** while open, rather than silently cloning or importing it.

The file window keeps writing, focus, find-in-note, theme and print. It has no project Files/search, Git backup, People, Share, Publish or agent exposure. `.txt` stays plain text; formatting that would require conversion is unavailable until an explicit **Save as…** to Markdown. Preserve encoding, BOM and line endings, reject unsupported encodings explicitly, and never replace the original during conversion. Save as a taken path needs an overwrite confirmation.

Dirty recovery and external edits use the same no-loss rules as project notes. An external conflict offers both versions before any overwrite. Read-only locations keep the draft and offer **Save as…**. Status says **Saved here** or **Local only**, never **Backed up**.

## People in a project

Inviting is not sharing. Settings → Project → People lists GitHub accounts and pending invitations; **Invite…** takes a GitHub username, not email or an invented recipient record. Fetch actual permission/owner information before presenting roles.

| Repository owner | Choices | Consequence shown before invite |
| --- | --- | --- |
| Organization | Read, Triage, Write, Maintain, Admin as permitted by the caller and organization policy | Role applies to the whole repository, not a chosen folder; Read sees every private note and access record |
| Personal account | Collaborator (can read and change everything) | No Read-only/Triage/Maintain/Admin picker; GitHub does not offer that role model here |

**Personal-account message (exact UI copy):** “This project belongs to a personal GitHub account. A collaborator can read and change everything in this project, including private notes and sharing settings. GitHub does not offer read-only access here.” Actions **Cancel** / **Send invite**. The account is shown as a profile card (avatar and handle) with the project name. Do not equate this with organization Admin or promise repository-management powers GitHub has not returned.

Source: [GitHub REST collaborator permissions](https://docs.github.com/en/rest/collaborators/collaborators#add-a-repository-collaborator), whose `permission` parameter is only valid on organization-owned repositories; checked for D-290. The UI must use returned permissions and display **Manage on GitHub** when the current account cannot invite or policy blocks it.

Organization invites carry one line instead: **“They can see every private note and sharing setting in this project, not just one folder.”** Do not invite to the site repository automatically. Pending is not accepted; retry checks the existing invitation first. Removal confirms its scope and warns that existing clones/copies cannot be recalled. No real invite is sent by this spec.

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
| Empty | App mark (64 px), **No projects yet**, **New project…** (primary) and **Quick notes**; no sign-in wall for local capture. Estimated VVS 82 |
| Opening / creating | **Opening “Book”…** / **Creating “Book”…** in the chosen row/task, elapsed/steps when long |
| Missing folder | Recovery names the folder, Find folder… / Download again where appropriate; no automatic creation |
| Offline | Local project opens; remote creation/invites unavailable with reason; keep all input |
| Permission refused | **“Couldn't open this project. Check your GitHub access, then try again.”** Sign in / Retry |
| Invalid/taken name | Field error and a suggested available name; retain input, no remote side effects |
| Pending invite | Named account and Pending; Cancel invite when authorized, not a success badge |
| Loading from GitHub | Skeleton rows in **Open from GitHub…**; local projects stay listed and usable |
| GitHub unreachable or rate-limited | **“Couldn't reach GitHub. Check your connection, then try again.”** Retry; local projects stay listed |
| Sign-in expired | **“Sign in to GitHub again to continue.”** Sign in; the name, choices and draft are kept and the same operation resumes afterwards |
| Sign-in can't do this | **“Your GitHub sign-in can't create repositories here.”** Manage on GitHub; nothing is created (R-52) |
| Settings changed on two devices | Project files (`project.json`, `site.json`, `access.json`, pins) merge by record: stable IDs, union of records, last change wins per field. A true clash (the same share changed both ways) keeps both and shows **Choose which to keep** in Settings; never a silent loss |

Projects/Recent rows have text names and location, keyboard arrows and Enter; Pin/Unpin is not nested inside a competing row button. Dialog focus returns to its opener on Cancel; asynchronous refresh keeps focus and scroll. At 320 px reflow location under title with no horizontal scrolling. All targets/focus/contrast use the design system and reduced motion.

## Design decisions

| ID | Choice | Serves | Why / alternative rejected |
| --- | --- | --- | --- |
| DD-PROJ-01 | One project per window; open, never replace | UC-PROJ-01, UC-PROJ-02, UC-PROJ-03 | Makes scope and history visible; tabs mix contexts |
| DD-PROJ-02 | Name, accent (title band and Files heading), optional per-project Appearance, and a preset or passive uploaded logo (D-313) | UC-PROJ-04 | Colour alone excludes users; a forced whole-project theme would override personal comfort, so it's opt-in |
| DD-PROJ-03 | File-only Recent and real folder/project pins | UC-PROJ-05, UC-PROJ-06 | Return to work without another favourites collection |
| DD-PROJ-04 | Local Quick notes and standalone files are explicit non-project scopes | UC-PROJ-07, UC-PROJ-08 | No accidental import, upload or Git setup |
| DD-PROJ-05 | Fixed destination picker, private-first creation | UC-FILE-12, UC-SHARE-08 | Cancel has no effect; first share explains public footprint |
| DD-PROJ-06 | Actual GitHub roles and full-project warning | UC-SHARE-09 | Never imply folder-only or personal-account Read-only access |
| DD-PROJ-07 | Explain Project at upgrade/first run; leave files and repositories in place | UC-PROJ-01 | A naming change needs consistent words and a mental-model figure, not a storage migration (PRJ-11) |

**Evidence still required:** [MP done rows](../plan/definition-of-done.md#projects-and-simpler-sharing). These flow/figure specs do not substitute for approved JSON view documents or working runtime.

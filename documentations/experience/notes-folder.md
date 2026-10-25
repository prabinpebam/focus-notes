# Where your notes live

The desktop app keeps your notes in one folder on your computer. This page covers:

- how that folder is chosen;
- how it's checked every time the app starts;
- what happens when it's gone, moved, or no longer matches your notes on GitHub;
- how a folder that OneDrive, Google Drive, iCloud Drive or Dropbox keeps in sync works.

It serves [UC-SAFE-08, UC-SAFE-09, UC-SAFE-10, UC-OWN-02 and UC-OWN-03](../product/spec/user-can.md) and builds [FRE-11 to FRE-15](../product/requirements.md). The decisions are D-212 to D-215 in [Decisions](../plan/decisions.md), all proposed.

> [!NOTE]
> **TL;DR.**
>
> - **Three kinds of notes folder:** backed up to **GitHub**; **offline mode**, on this computer only; or **kept in sync by another service** (OneDrive, Google Drive, iCloud Drive or Dropbox).
> - **The folder is checked first at every start.** The app never re-creates or empties it on its own (D-212).
> - **A missing folder opens *Your notes folder is missing*.** It shows what's gone and when it was last backed up. Its option cards each say what will happen:
>   - *Download your notes again*: one press when you're signed in, or a list when your account has several sets of notes.
>   - *Sign in to GitHub again*.
>   - *Find the folder…*: for a moved folder or a Documents folder moved into OneDrive. A folder that's put back opens by itself.
>   - *Start with an empty folder*, with a name and place you choose.
> - **An account or sync problem never stops you writing** (D-213). This covers a folder that doesn't match your notes on GitHub and a sign-in that stopped working. An **alert icon** on the corner and the Files header opens a card that says what differs, with **Sync now**. Sync starts **by itself** when nothing in the folder could be lost.
> - **You choose where the folder lives**, and you can **move** it safely (D-214).
> - **A folder another service syncs works without GitHub.** The app keeps GitHub's history out of it (D-215).

## What it replaces

The owner deleted the notes folder while the app was closed, then opened the app again (24 October). Three things went wrong:

- **The folder came back empty, with no warning.** Start-up made the folder again (a `mkdir` in `app.whenReady`) and wrote a welcome note into it, so the app looked like a fresh install with the notes gone.
- **Nothing downloaded or backed up.** The app treated the new folder as a folder on this computer only: no download, no backup and no warning. The corner said *Saved on this computer*.
- **Settings said *You're signed out*.** Settings only learned the account in a GitHub workspace, so it missed that Git's sign-in still worked (DEF-33).

## Three kinds of notes folder

| Kind | What keeps it safe | The corner says | Made by |
| --- | --- | --- | --- |
| **GitHub** (`github`) | Focus Notes backs it up to your notes on GitHub. | *Backed up at 2:41 PM*, *Not backed up yet*, *Backing up…* ([D-132](../design/components/feedback-and-dialogs.md#save-and-sync-status)) | Setup's *Create my notes* or *Open*; *Open another folder…* on a downloaded copy of your notes |
| **Offline mode** (`local`) | Only this computer, as you chose. | *Offline mode · saved on this computer* | *Just use this computer for now*; *Start with an empty folder* |
| **Synced by another service** (`synced`) | OneDrive, Google Drive, iCloud Drive or Dropbox. | *Saved here · OneDrive keeps it in sync* | Choosing a folder that a service syncs ([below](#folders-another-service-keeps-in-sync)) |

**The kind is worked out again at every start, in this order:**

1. **GitHub**, if the record names notes on GitHub or the folder is a Git clone.
2. **Synced by another service**, if the folder is inside one that a service syncs.
3. **Offline mode** otherwise.

A folder the record says is GitHub but that isn't a clone of those notes stays GitHub. It's [out of sync](#out-of-sync), never quietly turned into offline mode.

## The workspace record

`workspace.json`, in the app's data folder (`%APPDATA%\Focus Notes`), names the folder and what it is. It's written atomically, like every file the app keeps.

```json
{
  "version": 1,
  "folder": "C:\\Users\\you\\Documents\\prabins-notes",
  "kind": "github",
  "repository": "you/prabins-notes",
  "privateRepository": "you/prabins-notes-private",
  "account": "you",
  "lastBackup": "2026-10-24T14:41:00Z"
}
```

- **Older builds still read it.** `version` stays 1 and every new field is optional, so an older build still opens the folder and ignores the rest.
- **When it's written:**
  - when setup finishes;
  - when the folder is chosen, moved or recovered;
  - `lastBackup` after a backup that sent changes to GitHub, at most once a minute.
- **Records from before D-212 have no `kind`.** It's filled in at the first start, in this order:
  1. A clone becomes `github`, with its `origin`.
  2. A folder that isn't a clone becomes that set of notes, [not connected](#out-of-sync), when you're signed in and its name is the name of one of your account's sets of Focus Notes. This was the owner's case on 24 October: `Documents\prabins-notes`, re-made with only the welcome note.
  3. Anything else becomes `local`, or `synced` in a synced folder.
- **What it holds.** No secret and no note's name or text: only the names of the notes on GitHub, the account and a time. The [data inventory](../architecture/security-and-privacy.md#data-inventory) lists the new fields.

## At start

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 420" role="img" aria-labelledby="fnnf-start__title fnnf-start__desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnnf-start__title">At start: the notes folder is checked before anything else, with four outcomes</title>
<desc id="fnnf-start__desc">On the left, the start-up check: read the workspace record; check the folder before Git, the file watcher or any note; then check the account in the background. It never creates or empties a folder. Four outcomes on the right. The folder is missing: the recovery view says what's missing and offers the ways back. The folder isn't connected to its notes on GitHub: writing opens, an alert icon shows, and sync starts by itself when nothing here can be lost, otherwise Sync now waits for a press. The sign-in or the account has a problem: writing opens, with an alert icon and one toast offering Sign in again. Everything is in order: writing opens and backup carries on, with offline mode or the syncing service named in the corner.</desc>
<g id="fnnf-start__check" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnnf-start__box" x="24" y="40" width="300" height="340" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="44" y="76" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">At start</text>
<text x="44" y="118" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">1  Read the workspace record</text>
<text x="44" y="142" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">folder, kind, notes on GitHub</text>
<text x="44" y="184" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">2  Check the folder</text>
<text x="44" y="208" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">before Git, the watcher, any note</text>
<text x="44" y="250" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">3  Check the account</text>
<text x="44" y="274" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">in the background, 10 s at most</text>
<text x="44" y="350" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-success-fg)" font-size="13" font-weight="600" data-slate-fit-target="fnnf-start__box" data-slate-fit-padding="16">Never creates or empties a folder</text>
</g>
<g id="fnnf-start__arrows" data-slate-svg-step="2" data-slate-svg-effect="draw">
<path d="M330 210 L370 70" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<path d="M330 210 L370 165" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<path d="M330 210 L370 260" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<path d="M330 210 L370 355" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
</g>
<g id="fnnf-start__outcomes" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<rect id="fnnf-start__missing" x="380" y="30" width="596" height="80" rx="14" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="400" y="62" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fnnf-start__missing" data-slate-fit-padding="14">The folder is missing</text>
<text x="400" y="88" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnnf-start__missing" data-slate-fit-padding="14">The recovery view: what's missing, and the ways back</text>
<rect id="fnnf-start__unlinked" x="380" y="125" width="596" height="80" rx="14" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="400" y="157" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fnnf-start__unlinked" data-slate-fit-padding="14">Not connected to its notes on GitHub</text>
<text x="400" y="183" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnnf-start__unlinked" data-slate-fit-padding="14">Writing opens. Alert icon; syncs by itself if nothing can be lost, else Sync now</text>
<rect id="fnnf-start__account" x="380" y="220" width="596" height="80" rx="14" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="400" y="252" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fnnf-start__account" data-slate-fit-padding="14">A sign-in or account problem</text>
<text x="400" y="278" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnnf-start__account" data-slate-fit-padding="14">Writing opens. Alert icon and one toast: Sign in again</text>
<rect id="fnnf-start__ok" x="380" y="315" width="596" height="80" rx="14" fill="var(--color-status-success-bg)" stroke="var(--color-status-success-stroke)" stroke-width="1.5" />
<text x="400" y="347" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fnnf-start__ok" data-slate-fit-padding="14">All in order</text>
<text x="400" y="373" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-success-fg)" font-size="13" data-slate-fit-target="fnnf-start__ok" data-slate-fit-padding="14">Writing opens. Offline mode or the syncing service is named in the corner</text>
</g>
</svg>
<figcaption>The check runs before Git, the file watcher, the recovery journal or any note. Only the first run makes a folder.</figcaption>
</figure>

1. **Read the record.** With no record, the first run starts, as before.
2. **Check the folder** before Git, the file watcher, the recovery journal or any note. It must exist and be a folder. This is one `stat`, and it takes no visible time.
   - If it's missing, or its drive isn't connected, the [recovery view](#the-recovery-view) opens in the window's first frame. The canvas never shows first (DSK-09).
3. **Open writing** with the last note, as usual.
4. **Check the rest in the background.** The app checks:
   - whether the folder is a clone of the notes the record names;
   - whether the account works and can reach those notes, with 10 s at most, like every GitHub request;
   - what GitHub has.

   Any difference becomes the [out of sync](#out-of-sync) state.

> [!IMPORTANT]
> Nothing at start creates, empties or writes into the notes folder. The only folder the app makes on its own is a new one in the first run, and that's the only time it writes the welcome note. A second window, or the welcome note's handler, never makes a missing folder again.

## The recovery view

**IA-VIEW-RECOVER.** It uses the first run's full-window layout ([D-126](../plan/decisions.md)):

- The title bar band stays, so the window still drags and shows its controls.
- The content is a 560 px column on the canvas color, with no stepper.

It's assembled from the first run's components (`StepMark`, the option cards, `FolderCard`, `ProgressBar`), as a view document.

**What it shows, from top to bottom:**

- **Mark:** the step mark with a folder and a warning badge.
- **Title:** "Your notes folder is missing", or one of the [variants](#variants).
- **One sentence:** "Focus Notes keeps your notes in this folder, and it isn't there any more."
- **The folder card:**
  - the folder icon and its path, shortened to `Documents\prabins-notes` (the full path in its tooltip);
  - where the notes are backed up, with GitHub's mark: "prabins-notes · @you · Backed up yesterday at 2:41 PM". For offline mode it says "Saved on this computer only".
- **Option cards,** one for each way back. Each has a title and one line that says exactly what will happen.
  - The first card that can work is primary and has focus, so <kbd>Enter</kbd> takes it.
  - A card that can't work right now says why on its line. Cards that can never work here aren't shown.
- **No way back:** <kbd>Esc</kbd> does nothing, because there's no screen behind this one. Closing the window quits as usual, and the view shows again next time.

| Option | Shown when | Its line | What it does |
| --- | --- | --- | --- |
| **Use this folder** (found) | The folder was found somewhere else: in the new Documents after OneDrive moved it (Known Folder Move, R-24), or on the same drive under a new letter. | "Your notes are now in `OneDrive\Documents\prabins-notes`." | Checks that it's the same notes: the same `origin`, or for offline mode the same notes by name and size. Then it updates the record and opens writing in place. |
| **Download your notes again** | The record names notes on GitHub. | "Downloads your notes from GitHub, as backed up yesterday at 2:41 PM, into `Documents\prabins-notes`." | Runs setup's *Opening* parts (Download · Get the private notes · Link them), with Git's percentage, into the same folder. If something else is there by then, it uses the next free name beside it ([D-155](../plan/decisions.md)). Then it opens the last note. While the account is checked, the card's line shows a skeleton. A quiet *Choose other notes…* under it opens the list below. |
| **Choose your notes** | No notes are recorded but you're signed in, or *Choose other notes…* was pressed. | "Choose which of your notes to download." | Opens setup's *Your notes* step on its own: *We found your notes* with *Open* on each, or *Create my notes*. |
| **Sign in to GitHub again** | The account check failed: there's no sign-in, it was rejected, Focus Notes is signed out, or the account can't reach the notes. | "Connect your GitHub account, then download your notes. It takes about a minute." | Opens setup's *Connect* step on its own, then comes back here with *Download your notes again* (or the list) as the primary card. |
| **Find the folder…** | Always. | "Moved or renamed it? Choose the folder, and Focus Notes will use it from now on." | Opens the system's folder dialog at the old folder's parent. It takes:<br>- a clone of the recorded notes, with any name, anywhere;<br>- for offline mode, a folder of notes, as it is.<br><br>Different notes ask "These are different notes (you/work-notes). Open them instead?" |
| **Start with an empty folder** | Always. | "Makes a new, empty folder on this computer. Nothing is backed up until you connect to GitHub." | Opens in place to show:<br>- *Name*: `Focus Notes`, or the next free `Focus Notes 2` in that place;<br>- *Place*: the old folder's parent if it's there, else Documents, with *Change…*.<br><br>*Create folder* makes the folder, writes the welcome note, switches to offline mode, and keeps the old notes' name in the record, so *Connect to GitHub…* offers them first. |

**Card order:** *Use this folder*, then *Download* (or *Choose your notes*), then *Sign in again*, *Find the folder…* and *Start with an empty folder*.

**Offline, the download card says** "You're offline. Connect to the internet to download your notes." with *Try again*. It becomes primary by itself once the network is back.

**The view watches for the folder.** While the view shows, the app watches the old folder's parent. If the folder comes back (restored from the Recycle Bin, a drive connected again, or the service syncing it back), the title says "Found your notes folder" for a moment and writing opens by itself. Nothing needs pressing, because it's the same folder.

**Nothing downloads at start without a press.** Removing the folder may have been on purpose, and a large download on a metered connection shouldn't be a surprise. The cost is one press: *Download your notes again* is primary and has focus.

### Variants

| Situation | Title | What changes |
| --- | --- | --- |
| The folder's drive isn't connected (`E:\` isn't there) | "Your notes are on a drive that isn't connected" | The sentence says "Connect drive E: and your notes open by themselves." The view checks every 2 s while it shows, and the other options stay. |
| The folder was inside one that a service syncs | "Your notes folder is missing" | The sentence adds: "It may have been removed on another device. OneDrive keeps removed files in its recycle bin for 30 days." The service is named. |
| Offline mode | "Your notes folder is missing" | There's no *Download* or *Sign in again*. When you're signed in, a quiet *Download notes from GitHub…* link opens *Choose your notes*. |

## Out of sync

**When the folder is there, a problem never takes the window.** Writing opens as usual, and an **alert icon** says what's wrong. This applies when:

- the folder and the notes on GitHub don't match;
- the sign-in stopped working;
- the account can't reach the notes.

The alert icon appears in three places, all with the same card:

- the corner's save state (`SaveState`, D-132);
- the Files header, after the notes' name (`vm.files.source`, D-188);
- the heading of the Files section it's about (FIL-14's icon, D-191).

The icon is `warning` in `color.warning`. Danger stays for a save that couldn't write the text.

**The card opens on hover, on keyboard focus, or when the icon is pressed.** It holds:

- the cause, in a few words;
- one sentence on what differs;
- the facts: this folder, the notes on GitHub, and the last backup;
- the primary action, and *Not now*.

While it syncs, the card shows the steps and the percentage, and the icon shows the turning ring.

| Cause | Card title · its line | Action | Starts by itself? |
| --- | --- | --- | --- |
| **Not connected, nothing of yours in the folder** (empty, or only the app's untouched welcome note) | "Not connected to your notes on GitHub" · "This folder isn't linked to prabins-notes on GitHub, backed up 3 hours ago." | *Sync now* | **Yes**, at once. The corner shows "Downloading your notes · 45%", then a toast: "Your notes are back from GitHub." |
| **Not connected, with notes written here** | "Not connected to your notes on GitHub" · "This folder has 4 notes that aren't on GitHub. Sync now adds them to your notes as private notes, keeps both where they differ, and moves this folder to the Recycle Bin." | *Sync now* | No. It combines notes, so it waits for a press. |
| **The sign-in stopped working** | "Not backed up · sign in to GitHub" · "GitHub isn't accepting the sign-in on this computer. Your notes are saved here." | *Sign in again* (Connect on its own; backup then carries on) | It tries again quietly when the network changes, with one toast per session. |
| **Signed in as another account** | "Signed in as @other" · "@other can't reach prabins-notes. Switch to the account that owns them." | *Switch account* | No |
| **The notes are gone from GitHub** | "Your notes aren't on GitHub" · "prabins-notes isn't on GitHub any more, or this account can't see it. Everything is still on this computer." | *Choose what to do…*:<br>- *Back up to new notes on GitHub* makes an empty repository, links the folder to it and backs up everything.<br>- *Use offline mode*. | No |
| **GitHub has changes that couldn't come in** | "GitHub has 3 changes this computer doesn't have" · the reason, in one sentence | *Sync now*, or *Resolve* for a conflict (D-102) | Sync already takes them in on its own schedule. This shows only when that failed. |
| **Many notes vanished from the folder** (more than 20, or more than half, removed outside Focus Notes since the last backup) | "48 notes are missing from this folder" · "They were removed outside Focus Notes. They're still on GitHub, and backup is paused so they aren't removed there too." | *Restore them*, or *Remove them from GitHub too* | Backup pauses by itself. |

**Sync starts by itself only when it's safe:**

- the sign-in works;
- the app is online;
- the notes are reachable on GitHub;
- nothing in the folder could be lost or combined.

When any of these fails, the alert waits for a press.

**Offline mode isn't out of sync.** It's your choice, so the corner says *Offline mode · saved on this computer* in the muted color, with no alert. Its card says "Your notes are saved on this computer only." and offers *Connect to GitHub…*, which opens setup's *Connect* and *Your notes*. The folder's notes are then added to the notes you pick or create, as private notes.

### Sync now for a folder that isn't connected

This is a long wait, with steps shown in the card and the corner. Writing carries on while it runs.

1. **Download your notes.** Clone into a hidden folder beside this one, on the same drive, with Git's percentage.
2. **Bring in the notes from this computer.** Each Markdown file in the folder is handled like this:
   - The same text at the same path: nothing to do.
   - A folder with the workspace layout: each file goes to the same place.
   - Otherwise: under Private notes, keeping the folders. Without a private repository, the notes are *Public · not backed up*, and the app asks once before backing them up ([D-158](../architecture/desktop-and-git.md#new-notes-without-a-private-repository)).
   - Different text at the same path: both are kept, with this computer's as "⟨title⟩ (this computer)".

   Images and other files go with their notes. Everything is one commit: "Bring in notes from this computer".
3. **Back up.** Send the commit to GitHub.
4. **Check.** Every file from the old folder must be in the new one, byte for byte.
5. **Switch.** Stop the watcher and Git, put the old folder aside, and rename the new folder into its place. Anything saved during steps 1 to 4 is copied across. The window changes in place (DSK-09).
6. **Send the old folder to the Recycle Bin** (`shell.trashItem`). Where there's no Recycle Bin, as on a network drive, it's kept as `prabins-notes (before sync)`, and a toast says where.

A step that fails leaves the folder as it was, removes the hidden copy, and says why on the card, with *Try again*.

### Account problems

- **No full-window problem while the folder is there.** One toast per session, with its actions: "Your notes aren't being backed up: GitHub sign-in stopped working." [Sign in again] [Not now]. The corner and the Files header keep the alert until it's fixed.
- **Settings → Account always shows the account Git signs in with, in any kind of folder (fixes DEF-33).** Settings reads the account's status itself and keeps it in the app's state. It no longer depends on the first run having asked. It shows signed in, signed out, or the problem with *Sign in again*.
- **Signing out of Focus Notes on purpose** (*Keep it for the terminal*, D-103) isn't a problem: Git still backs up. The corner shows the usual states.

## What the corner and the Files header say

These are added to the save state's states ([Feedback and dialogs → Save and sync status](../design/components/feedback-and-dialogs.md#save-and-sync-status)):

| State | Icon | Tooltip and name | Tone |
| --- | --- | --- | --- |
| Offline mode | a computer | "Offline mode · saved on this computer" | Muted, like *Saved on this computer* |
| Synced by another service | a folder with a cloud | "Saved here · OneDrive keeps it in sync" | Muted |
| Out of sync | warning | The cause in a few words ("Not connected to your notes on GitHub") | `color.warning` |
| Sign-in stopped working | warning | "Not backed up · sign in to GitHub" | `color.warning` |
| Downloading or syncing the folder | the cloud with an arrow, with the turning ring | "Downloading your notes · 45%", "Syncing your notes · 2 of 5" | Muted |

**The Files header names the notes and who they're backed up as:**

- **GitHub:** the notes' name with GitHub's mark, then @login.
- **Offline mode:** the folder's name with the folder icon.
- **Synced by another service:** "prabins-notes · OneDrive".

When the notes are out of sync, the alert icon follows the name, with the same card.

New icons go in `packages/ui`'s icon set if it doesn't have them yet.

## Choosing and moving the folder

### At setup

- **GitHub** (*Get started*): folders keep their names from the notes ([D-155](../plan/decisions.md)), and *More options → Folder → Choose another folder…* as now. Choosing a folder that a service syncs shows the [warning](#folders-another-service-keeps-in-sync).
- **Offline mode** (*Just use this computer for now*): a new step, **Where should your notes live?** It has:
  - a folder card showing `Documents\Focus Notes`, or the next free name;
  - a *Name* field and *Change…*;
  - a badge when a service syncs the place: "OneDrive keeps this folder in sync";
  - [Use this folder].

  You can pick a folder that already has notes: "This folder has 12 notes. Focus Notes will use them as they are."

### In Settings → Workspace

A folder card shows:

- the path;
- the kind: "Backed up to prabins-notes on GitHub", "Offline mode" or "OneDrive keeps it in sync";
- *Open folder*, *Move…* and *Open another folder…*, beside *Remove* ([D-103](../architecture/desktop-and-git.md#the-workspace-folder)).

**Move…**

1. **Choose a new place** in the system's dialog. The folder keeps its name. If the name is taken there, it gets the next free one.
2. **On the same drive:** one rename, done at once. Git and the watcher stop first and start again after.
3. **On another drive:**
   1. Count the files and check there's room ("D: needs 120 MB free").
   2. Copy, showing "Moving your notes · 120 of 480", with *Cancel* until the switch. *Cancel* removes the partial copy and changes nothing else.
   3. Copy again whatever was saved during the move.
   4. Check every file byte for byte.
   5. Switch in place.
   6. Ask: "Your notes are in `D:\Notes\prabins-notes`. Send the old folder to the Recycle Bin?" [Send to Recycle Bin] [Keep it].

- **Refused:** a place inside the notes folder itself.
- **Warned:** a GitHub folder going to a place that a service syncs.
- **Git needs nothing changed.** A GitHub folder moves with its history, because the paths inside it are relative. Other computers aren't affected.

**Open another folder…** takes any folder:

- a clone of a set of Focus Notes opens as GitHub;
- a folder of Markdown notes opens in offline mode, or as synced;
- an empty folder becomes a new offline folder with the welcome note.

The folder you were using stays on disk as it is.

## Folders another service keeps in sync

Some people already trust a sync service with their files. A folder that service syncs works as a notes folder, with **the service doing the syncing** and GitHub backup off (D-215, P1).

**How the service is recognised (Windows first, D-211):**

| Service | Recognised by |
| --- | --- |
| OneDrive (personal and work or school) | Windows' registered sync roots (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager`, each root's `UserSyncRoots`), and `%OneDrive%`, `%OneDriveConsumer%`, `%OneDriveCommercial%` |
| iCloud Drive | A registered sync root, and `%USERPROFILE%\iCloudDrive` |
| Dropbox | A registered sync root (current versions), and `%LOCALAPPDATA%\Dropbox\info.json` |
| Google Drive for desktop | Its drive (labelled *Google Drive*, `G:` by default) when streaming, or its mirrored *My Drive* folder, read from Drive for desktop's settings |

**How it behaves:**

- **The corner and the Files header name the service.** GitHub backup is off, and the app never makes `.git` there.
- **GitHub's history is kept out of synced folders (R-22).** If its internal files are synced, the service can make conflict copies of them, take them offline, or hold them locked in the middle of a save. Two computers can also end up writing the same history. So:
  - **A GitHub folder never goes in a synced place by default.** When Documents itself is synced (OneDrive's Known Folder Move), new GitHub folders go in `%USERPROFILE%\Focus Notes\<name>` instead. Offline mode keeps Documents, where it becomes *synced*.
  - **Choosing a synced place for a GitHub folder warns first:** "OneDrive keeps this folder in sync, and that can damage your notes' history on GitHub. Choose a folder OneDrive doesn't sync." [Choose another folder…] [Use it anyway].
  - **A GitHub folder already in a synced place opens as usual.** Its `.git` is pinned to the device (`attrib +P`), and Settings → Workspace says "OneDrive also syncs this folder", with *Move…*.
- **Online-only notes stay online (R-23).**
  - **Listing and searching:** the app reads a file's attributes before its contents, and never reads an online-only note to list or search it. Files and Spotlight show it by its file name, with a cloud badge, and search counts them ("12 notes are only on OneDrive").
  - **Opening one** shows "Getting this note from OneDrive…".
  - **Keeping them on the computer:** *Keep all notes on this device*, in the corner's card and in Settings, pins the folder (`attrib +P -U /s /d`).
- **Saves wait for the service.** If the service is holding a note (`EBUSY`, `EPERM`, `EACCES`), saving tries again for up to 5 s. After that, the save problem shows: "Couldn't save · OneDrive is using this note". Retries carry on, and the text stays in the editor and the recovery journal.
- **Changes from other devices arrive as [external changes](../architecture/desktop-and-git.md#external-changes).** An open note reloads in place, or the resolver opens when it has unsaved edits. The service's conflict copies (`note-LAPTOP-4F2.md`, `note (1).md`) show as ordinary notes.

## Data-safety rules

1. **Only you create, empty or overwrite the notes folder.** Nothing does it without your choice. The first run's new folder is the only one the app makes on its own.
2. **A missing or emptied folder never deletes notes on GitHub.** A folder that isn't a clone can't send anything to the notes on GitHub. When many notes are removed outside the app, backup pauses.
3. **Swaps are checked, and old folders are never deleted.**
   - Every swap checks every file first, byte for byte.
   - The old folder goes to the Recycle Bin. Where there isn't one, it's kept beside the new folder under another name, and the app says where.
4. **Notes joining from a folder that isn't connected become private notes**, or follow [D-158](../architecture/desktop-and-git.md#new-notes-without-a-private-repository) when there's no private repository.
5. **The record is written atomically and holds no secret.**
6. **No new network destination.** Everything here talks to GitHub, as setup and sync do, or to nothing.

## Waits

These rows are in [the wait inventory](../architecture/perceived-performance.md#the-wait-inventory).

| Operation | Class | Pattern and place | Words |
| --- | --- | --- | --- |
| Checking the notes folder at start | Instant | None | None |
| Checking the account for recovery | Responsive | A skeleton in the *Download your notes again* card's line, 10 s at most | "Checking your GitHub account…" after 1 s |
| Downloading your notes again | Long | Setup's *Opening* parts, with Git's percentage | "Downloading your notes · 45%" |
| Syncing a folder that isn't connected | Long | Steps in the alert's card, and the ring on the icon | "Syncing your notes · 2 of 5" |
| Moving the notes folder | Long | The count and percentage in Settings → Workspace, with *Cancel* until the switch | "Moving your notes · 120 of 480" |
| Getting a note from another service | Waiting | The note's skeleton, with a name | "Getting this note from OneDrive…" |

## Words

The main path follows the [setup word rules](../design/foundations.md#words). It never says repository, Git, clone, commit, token, credential or instance.

| Use | Say |
| --- | --- |
| The folder | "your notes folder", or its name |
| GitHub's copy | "your notes on GitHub" |
| Actions | "download", "back up", "sync", "connect" |

Technical names show only in tooltips and Settings' details.

## Acceptance checks

- **FRE-11:**
  - Quit, delete the notes folder, then start. *Your notes folder is missing* shows the path and the last backup. No folder is created, and nothing is written in the parent.
  - Quit, remove the drive, then start. The drive variant shows, and connecting the drive opens the notes.
- **FRE-12:**
  - **Signed in:** *Download your notes again* has focus. <kbd>Enter</kbd> downloads into the same folder and opens the last note.
  - **Several sets of notes in the account:** *Choose other notes…* lists them.
  - **A broken sign-in:** *Sign in to GitHub again* comes first and returns with *Download* primary.
  - **Find the folder:** a renamed folder chosen with *Find the folder…* is used from then on.
  - **Put back:** a folder restored from the Recycle Bin while the view shows opens within 2 s, with no press.
  - **Start with an empty folder:** it makes `Focus Notes 2` when `Focus Notes` is taken, in the chosen place, and the corner says *Offline mode*.
- **FRE-13:**
  - **The owner's state on 24 October** (a folder with the clone's name holding only the welcome note): signed in, the notes download by themselves.
  - **Notes written in a folder that isn't connected:** the alert shows on the Files header and the corner, and its card offers *Sync now*. Afterwards every note is in the notes as a private note, the hashes match, and the old folder is in the Recycle Bin.
  - **A rejected sign-in:** writing opens, and one toast and the alert offer *Sign in again*.
  - **Many notes removed outside the app:** removing 30 notes in Explorer pauses backup and shows *Restore them*.
  - **DEF-33:** in an offline folder with Git's sign-in working, Settings → Account shows the account, not "signed out".
- **FRE-14:**
  - Offline setup asks where.
  - *Move…* to another drive shows its progress. *Cancel* before the switch leaves everything as it was.
  - After a move, every file matches byte for byte, and the old folder goes to the Recycle Bin only after *Send to Recycle Bin*.
- **FRE-15:**
  - **In a OneDrive folder:** the corner says "Saved here · OneDrive keeps it in sync", and no `.git` is created.
  - **Online-only notes:** listing 500 of them downloads none.
  - **A held note:** a note the service holds for 3 s saves when it's released.
  - **A synced place for GitHub:** choosing one warns first.

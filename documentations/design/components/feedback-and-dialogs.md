# Feedback and dialogs

The shared components that tell people what happened and ask them before anything consequential: toasts, save and sync status, confirmations, context menus, the Move to picker, and the conflict resolver.

> [!NOTE]
> **TL;DR.** **Toasts** report what just happened and offer Undo. **Save status** stays invisible until something needs attention, and then shows as a thin arc around the trigger. **Waits** a person starts are explained by one task tracker: nothing for work under 300 ms, then a sign at the place and words that say what's happening. **Confirmations** are reserved for deletes at scale and changes of audience. They name the thing, state the consequence, and default to Cancel. **Context menus** mirror the visible actions. **Move to…** is a searchable folder picker. The **conflict resolver** shows both versions and never discards text silently. Components IA-CMP-TOAST, IA-CMP-SAVESTATE, IA-CMP-DIALOG, IA-CMP-CONTEXTMENU, IA-CMP-MOVE, and IA-CMP-CONFLICT.

<h2 id="toast" data-reader-personas="design">Toast</h2>

**IA-CMP-TOAST.** Serves UC-FILE-08.

| Part | Specification |
| --- | --- |
| Place | Bottom center, 24 px above the window edge. Above the find bar if it's open at the bottom. |
| Size and surface | Fits its content up to 480 px. Frosted, `radius.popover`, shadow 2. |
| Content | One sentence in past tense naming the object ("Moved 3 notes to drafts."), an optional action ([Undo], [Retry], [Details]), and a close button. |
| Timing | 6 s. The timer pauses while the toast is hovered or focused. Toasts with Undo stay 10 s. |
| Stacking | At most 2 visible, newest at the bottom. Older ones fade out early. |
| Keyboard | <kbd>F6</kbd> moves focus between the canvas and an open toast's action. <kbd>Esc</kbd> on a toast dismisses it. Spotlight also offers `> Undo last file change` while a toast is visible. |
| Accessibility | <code>role="status"</code>, announced politely. Errors use <code>role="alert"</code>. |

<h2 id="save-and-sync-status" data-reader-personas="design product">Save and sync status</h2>

**IA-CMP-SAVESTATE.** Serves UC-SAFE-01, UC-SAFE-03, UC-SAFE-10 and UC-OWN-03.

| State | What shows | Why |
| --- | --- | --- |
| Saved and synced | Nothing | The normal state shouldn't ask for attention (CP-CALM-01). |
| Saving or syncing | Nothing. If syncing takes longer than 5 s, a faint arc slowly turns around the frosted circle. | Normal waits stay silent, and long ones become visible. |
| Changes waiting (offline or sync paused) | A partial arc in `color.warning` around the frosted circle. Tooltip: "3 changes waiting to sync. Offline." | You can keep writing, and you can see that the work isn't on GitHub yet. |
| Sync failed | A full arc in `color.danger`. The first time, a toast: "Couldn't sync. GitHub rejected the push." [Retry] [Details]. | Needs action, but doesn't block writing. |
| Conflict | Same as failed, and the toast offers [Resolve] to open the conflict resolver. | Only the writer can decide. |

While there's a problem, opening the toolbar adds a status row at its top: "3 changes waiting · [Sync now]". The *Save* button's tooltip always shows the last sync ("Synced 2 min ago").

**As built (WP-3.3, D-97):** the desktop shows sync problems with the trigger's existing problem dot (its name says "Couldn't sync") and one toast when a problem first appears, with [Retry], which saves and syncs again. The toast says the cause in one sentence: offline, GitHub not accepting the sign-in, changes that don't fit (both versions are kept), another program changing the workspace, Git not knowing the person's name and email, a commit that couldn't be signed, or a hook that refused it. <kbd>Mod</kbd>+<kbd>S</kbd> says "Saved and synced" through the task tracker, or the reason. A conflict's toast offers [Resolve] instead of [Retry] (WP-3.5, D-102), and so does <kbd>Mod</kbd>+<kbd>S</kbd>'s when it finds one. The arcs, the toolbar's status row, the last-sync tooltip, [Details], and [Sign in again] (WP-3.2) come later.

**The save state (D-132, in place of the arcs above):** the desktop shows where saving stands as one muted icon at the leading edge of the bottom-left pill (UI-12, [Main UI](../../experience/main-ui.html)), a `SaveState` component: an icon-only quiet button with a tooltip. It never pops up and never takes focus.

| State | Icon | Tooltip and name |
| --- | --- | --- |
| Saved on this computer | check | "Saved on this computer" |
| Not backed up yet | cloud with a dot | "Saved here · not backed up yet" |
| Backing up | cloud with an arrow, rising gently; still with reduced motion | "Backing up…" |
| Backed up | cloud with a check | "Backed up at 2:41 PM" (the time of day: a relative time would need a timer at rest, PRF-04) |
| Offline | cloud with a slash | "Offline · will back up when you're back" |
| Problem | warning, in the danger color | "Couldn't back up · Try again" |

Pressing it backs up now (the retry, on a problem). After *Save to cloud* the label opens beside the icon, "Backing up…" then "Backed up", for about 2 s, and a polite live region says the result; problems are announced by their toast, and nothing else is.

**The notes folder's own states (proposed, D-213, D-215; WP-5.14, WP-5.15):** offline mode ("Offline mode · saved on this computer"), a folder another service syncs ("Saved here · OneDrive keeps it in sync"), and out of sync or a sign-in that stopped working, with an alert icon in `color.warning` on the save state and the Files header whose card says what differs and offers *Sync now* or *Sign in again* ([Where your notes live → What the corner and the Files header say](../../experience/notes-folder.md#what-the-corner-and-the-files-header-say), [Out of sync](../../experience/notes-folder.md#out-of-sync)).

**By repository (FIL-14, D-191):** each Files section's heading (Private, Public) carries its repository's own `SaveState` icon with these states, and a card like this one: the section, its state, the repository, the last backup, what waits there in counts ("2 folders, 1 note waiting for backup", empty folders included), and *Back up to GitHub* for that repository alone, which runs through the task tracker and announces "Public notes backed up" ([Files → Repository backup](../views/files.html#repository-backup)).

**Restored after a crash (QLT-03, WP-2.6, D-105):** when the app starts after a crash, the text the recovery journal kept is already back in its note, and one information toast says so, with nothing to decide: "Restored what you were writing in “⟨title⟩” before Focus Notes closed." (or "in ⟨n⟩ notes"). If the note changed while the app was closed, nothing is written over it: the text is kept beside it, and the toast says "“⟨title⟩” changed while Focus Notes was closed, so what you were writing is kept beside it, in “⟨name⟩ (recovered)”."

<h2 id="waits" data-reader-personas="design engineering">Waits</h2>

Serves UC-SAFE-01 and UC-FILE-06. Every wait a person starts (pressing a button, opening a view, moving or deleting files, <kbd>Mod</kbd>+<kbd>S</kbd>, publishing, signing in) goes through **one task tracker** in `packages/core` (PRF-08, D-69). Background saving and syncing stay silent, as [Save and sync status](#save-and-sync-status) describes, unless the person is waiting on them.

A task has a target (the node it affects, by ID), a message key that says what's happening ("Moving 3 notes…"), and a start time. The tracker drives two things:

- **A sign at the place.** The target's view-model `busy` field turns true while the task runs. The component's busy state then goes through three phases, which the primitive renders as `data-busy` and styles with its own `cmp.*.busy` tokens: `ack` at once (the press is acknowledged, nothing new is drawn), `on` after `wait.signDelay`, and `done` for `wait.doneDuration` when the task succeeds.
- **Words.** The busy component's accessible name and visible label say what's happening. After `wait.elapsedDelay` the label adds the elapsed time ("Publishing… 4 s"). When more than one task runs, the toolbar's status row counts them ("2 tasks running"). There's no status bar (DD-FB-02).

| Timing rule | Token | Value |
| --- | --- | --- |
| Work that ends sooner shows nothing extra | `wait.signDelay` | 300 ms |
| Once shown, a sign stays at least this long, so it never flickers | `wait.signMinimum` | 500 ms |
| Screen readers hear a wait only after this, and then hear its end | `wait.announceDelay` | 1 s |
| The words add the elapsed time after this | `wait.elapsedDelay` | 3 s |
| The `done` confirmation shows for | `wait.doneDuration` | 1.5 s |

| Kind of wait | Sign |
| --- | --- |
| A button's action | The button keeps its width, swaps its icon for a `Spinner`, and its label says what it's doing ("Publishing…"). Then it says "Published" for `wait.doneDuration`. |
| Rows being saved | A small `Spinner` at the end of each row (Files: moved, deleted, or created rows) until the write and commit finish ([Files](../views/files.html)) |
| A region being updated | The region keeps its content, with a thin moving line along its top. With reduced motion, the line is still. |
| A view opening | A `ProgressBar` line, then a skeleton of the view's layout. A view never opens blank. |
| Long work (over 10 s, or several steps) | The current step in words ("Downloading your notes · 3 of 9"), a step list that ticks parts off, a determinate `ProgressBar` where the work reports progress, the elapsed time, and [Cancel] where the work can stop. The window stays usable ([Perceived performance → Patterns](../../architecture/perceived-performance.md#patterns), PRF-13). |
| A swap (a view, a setup step, a workspace) | The old content stays until the new content is complete, then they swap in one frame. Nothing is ever blank or white in between (DSK-09). |
| A countable wait | The words count: "Indexing notes: 4,000 of 10,000". |
| Changes being checked | Where sync counts show, a small `Spinner` and "Checking changes…" until the [Git status](../../architecture/desktop-and-git.md#asking-git-what-changed) returns |

- **Failures** end the sign at once and hand over to the command's own error handling: a toast, or an inline error at the place.
- **Tests** wait for the tracker to report idle before navigating, so they never race a save ([Testing pitfalls](../../architecture/performance-and-quality.md#testing-pitfalls)).
- Every task records a `performance.measure` with its name, which the benchmark and the diagnostic report use ([Measuring](../../architecture/performance-and-quality.md#measuring)).

<h2 id="confirmation-dialog" data-reader-personas="design product">Confirmation dialog</h2>

**IA-CMP-DIALOG.** Serves UC-SHARE-01 and UC-FILE-04. Used **only** for changes of audience, deletes at scale (a folder with notes, or 5 or more items), deleting public notes, and discarding text in a conflict. Everything else is undoable instead (DD-FILES-06, DD-TABLE-06).

- **Anatomy:** a solid dialog, 480 px wide. The title is a question naming the object ("Make “On focus” public?"). The body has one to three short sentences of consequence. Buttons are [Cancel] and a primary button named for the action ("Make public", "Delete 12 notes"). Destructive primaries use `color.danger`.
- **Focus:** opens on [Cancel] for deletes and audience changes, so a reflexive <kbd>Enter</kbd> doesn't publish or delete. <kbd>Esc</kbd> cancels.
- **No "Don't ask again"** on audience changes.
- **In the window, never edge to edge (D-111).** Every dialog's scrim dims exactly the window as drawn (on Windows and Linux, inside its shadow margin and clipped to its 20 px corners, never the margin). The dialog keeps at least 24 px from every window edge: as its content grows, it stops at the window's height less that inset (no other cap), and only its body scrolls, with fading edges, while its title and its fixed controls stay put. Its padding is the same 24 px on every side; the title's box is trimmed to its letters, and the close button's icon lines up with the content's edge, its hit area reaching into the padding. Segmented controls, tabs, and button rows wrap or shrink inside it, never past its edge.
- **Height (D-111).** A modal dialog is at least 400 px tall, or the window's height less twice the 24 px inset where that's less, and while it's open it can grow but never shrinks: a tab or a filter that holds less leaves empty room at the bottom of its body. **Confirmations are the exception:** Delete, Sign out, Remove workspace, and Import are short alerts that fit their content (`height="content"`), still inside the inset.

| Confirmation | Body |
| --- | --- |
| Make public | "Anyone with the link will be able to read it at ⟨url⟩. It goes live within a few minutes. Making it private later won't remove copies people have already seen." [Cancel] [Make public] |
| Make private | "Its public page goes offline after the next publish. Earlier versions stay in the public repository's Git history." [Cancel] [Make private] |
| Delete folder | "Delete “drafts” and the 12 notes in it? You can restore them from Recently deleted for 30 days." [Cancel] [Delete 12 notes] |
| Delete public note | "Delete “About”? Its public page will go offline after the next publish." [Cancel] [Delete and unpublish] |

<h2 id="context-menu" data-reader-personas="design">Context menu</h2>

**IA-CMP-CONTEXTMENU.** Serves UC-FILE-05, UC-FILE-06, UC-TABLE-03, UC-FMT-08.

- Opens with right-click, <kbd>Shift</kbd>+<kbd>F10</kbd> or the Menu key (at the focused item), or a 500 ms long-press on touch screens.
- App-drawn for the app's own items (rows, tables, the title bar), so it follows the theme the same way on the web and the desktop. Right-clicking text on the desktop opens the [text menu](#text-menu): the OS spell checker's suggestions and the edit actions, drawn by the app in the theme on Windows and Linux, and the system's own menu on macOS (D-193, D-204).
- 14 px items with shortcuts right-aligned and dividers between groups. Submenus open with › on <kbd>→</kbd> or after a 200 ms hover. Destructive items come last. At most about 12 items, and the rest go into submenus.
- It holds the same actions as the visible controls for that item. It's never the only way to reach anything.
- It's the same `CommandMenu` as every app menu, in a popover at the pointer (right-click) or at the item (keyboard, ⋯). <kbd>Esc</kbd> returns focus to the item. An unavailable item stays reachable and shows why. First used for the Files rows ([Files panel → Row menu](../views/files.html#row-menu), D-162).

<h3 id="text-menu">Text menu</h3>

**TextMenu** (a host component over `CommandMenu`; D-204, EDT-14). One model (`packages/core/src/text-menu.ts`) builds the items for every platform, so the drawn menu and the system's stay in step; each item shows only when it applies and is disabled when it can't act.

| Group | Windows and Linux (drawn in the theme) | macOS (the system's menu) |
| --- | --- | --- |
| Spelling | Up to 6 suggestions, or *No suggestions* (disabled), then *Add to dictionary* | The suggestions, or *No Guesses Found*, then *Learn Spelling* |
| Look up | None | *Look Up “word”* (a selection or the misspelled word) |
| History | *Undo* <kbd>Ctrl</kbd>+<kbd>Z</kbd>, *Redo* <kbd>Ctrl</kbd>+<kbd>Y</kbd>: the editor's own history, disabled when it has nothing | *Undo* <kbd>⌘</kbd><kbd>Z</kbd>, *Redo* <kbd>⇧</kbd><kbd>⌘</kbd><kbd>Z</kbd>: the editor's own history |
| Edit | *Cut*, *Copy*, *Paste*, *Paste as plain text* <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd>, *Delete* <kbd>Delete</kbd> | *Cut*, *Copy*, *Paste*, *Paste and Match Style*, *Delete* |
| Select | *Select all* <kbd>Ctrl</kbd>+<kbd>A</kbd> | *Select All* |
| Link | *Copy link*, *Open link* (web and mail links, through the app's guarded link opening) | *Copy Link*, *Open Link* |
| Speech | None | *Speech* › *Start Speaking*, *Stop Speaking* |
| Emoji | Windows: *Emoji* <kbd>Win</kbd>+<kbd>.</kbd>; Linux: none (no system panel) | *Emoji & Symbols* |

Each item shows its keys as plain text in the interface font, as every app menu and Windows' own menus do (*Ctrl+X*, *Delete*, *Win+.*), from the command registry's key names, so a screen reader hears them the same way (*Win Period*); an unavailable item's keys dim with its label. Read-only text with a selection gets *Copy* alone. A menu opened by key (<kbd>Shift</kbd>+<kbd>F10</kbd>, the Menu key) is the block menu, not this one.

- **Drawn (Windows, Linux).** The shell sends the page the checked model (the place, at most 30 entries, at most 6 suggestions); the page shows it at the pointer within a frame, flipped or shifted to stay in the window and scrolling when it's taller. A chosen item goes back as its id, once, over a channel that checks the sender, and the shell acts: suggestions and *Add to dictionary*, the webContents' cut, copy, paste, paste-and-match-style, delete and select-all, the app's Undo and Redo, the emoji panel, and the link (whose address stays in the shell). Arrow keys, <kbd>Home</kbd>, <kbd>End</kbd>, typeahead, <kbd>Enter</kbd> and <kbd>Space</kbd> work as in every app menu; <kbd>Enter</kbd> on an unavailable item leaves the menu open. <kbd>Esc</kbd>, a click, a right-click or a wheel outside, a scroll, the window losing focus or a resize close it (a right-click outside only closes it, as a system menu does), and the caret and selection go back exactly where they were before an item acts: in a note, and in a field such as Find or a rename, its own selection and direction. When the suggestions arrive after the menu opened, they're announced ("3 spelling suggestions"), and focus moves to the first if it was on *Checking spelling…*. In forced colors the focused item is in the system's highlight and unavailable items in its gray text. The shell numbers each right-click and keeps only the latest one's answers, keeps the misspelled word with the open menu, sends only suggestions the page accepts, and forgets the menu when the page says it closed. When Windows' spell checker takes longer than a frame (its first answer), the menu opens at once with a *Checking spelling…* row and the suggestions fill in ([wait inventory](../../architecture/perceived-performance.md#the-wait-inventory)).
- **System (macOS).** The native menu, as Mac users expect, in the app's light or dark appearance (`nativeTheme.themeSource` follows Appearance; *System* follows the OS).
- **Left out, and why.** *Ignore spelling* and *Ignore all*: Electron has no session-only ignore, and adding a word then removing it at quit would leave it in the OS dictionary after a crash. Browser items (search the web, print, inspect, translate, writing direction) and the Unicode and IME items of old Win32 edit controls: no clear use in a note. *Select all* in read-only text: it would select the whole window. Emoji on Linux: there's no system panel. Look Up and Speech: macOS's services, with no Windows or Linux counterpart in Electron.

<h2 id="move-to-picker" data-reader-personas="design product">Move to picker</h2>

**IA-CMP-MOVE.** Serves UC-FILE-06.

- A dialog, 480 px wide, titled "Move 3 items to…" (or "Move “On focus” to…").
- A search field (focused) filters folders by name across both sections.
- **Recent** shows the last 3 destinations, then a folder tree of Private and Public. Folders that aren't allowed (the items' own subfolders) are disabled with a tooltip explaining why.
- [New folder] creates a folder inside the highlighted one, inline.
- [Cancel] and [Move here], disabled until a folder is chosen. <kbd>Enter</kbd> on a folder moves.
- Choosing a folder in the other section continues into the visibility confirmation.

<h2 id="conflict-resolver" data-reader-personas="design product">Conflict resolver</h2>

**IA-CMP-CONFLICT.** Serves UC-SAFE-02. It opens from the sync problem toast, from the toolbar's status row, or when the conflicting note is opened.

- **Layout:** a large dialog (90% of the window, up to 1040 px), titled "“On focus” changed on another computer". Two panes: **This computer** and **Other version** (with when it was pushed). Changed paragraphs are highlighted block by block, using the same colors as find highlights.
- **Choices:**
  - [Keep this computer's version]: pushes yours. The other version stays in Git history.
  - [Take the other version]: replaces yours. Your version is kept as "⟨title⟩ (your version, ⟨time⟩)" in Recently deleted for 30 days.
  - [Keep both]: saves yours as "⟨title⟩ (conflict copy)" next to the note and takes the other version.
- **Later:** <kbd>Esc</kbd> or [Decide later] keeps your local text. That note stops syncing, and the trigger shows the conflict state, until the conflict is resolved. Other notes keep syncing.
- Text is never discarded without one of these explicit choices (CP-SAFE-01).

**As built (WP-3.5, D-102):** the canvas view composes it from an `xl` Dialog (`layout.dialogXL`, 1040 px, inside the window's inset) and two `VersionPane` primitives side by side, which wrap one above the other in narrow windows. Each pane is a labelled region, "This computer" and "Other version, pushed ⟨date⟩ ⟨time⟩", showing the note's blocks as plain text; blocks that differ (a longest common subsequence of whole blocks) are highlighted with `color.findMatch`, marked at their start, and read as "Changed:" by screen readers. The choices sit above the panes, so they stay in view: [Keep this computer's version], [Take the other version], [Keep both], and [Decide later]. Several conflicting notes are shown one after another ("Note 1 of 2") and settled together once each has a choice. It opens from the toast's [Resolve], or when a note sync found in conflict is opened.

- **Copies.** "Take the other version" keeps yours as "⟨title⟩ (your version, ⟨date⟩ ⟨time⟩)": the copy is added in the resolving commit and deleted in the next, so it's in Recently deleted. "Keep both" keeps yours as "⟨title⟩ (conflict copy)" next to the note. A copy's H1 is its title and its file name follows it, numbered if taken.
- **Decide later** keeps your text and changes nothing. Because history stays a line, the whole repository's commits wait (they stay committed on this computer) until the conflict is settled, rather than only that note's; other notes keep saving and committing. The trigger keeps the problem dot.
- **Changed outside with unsaved edits (D-92).** When another program changes the open note while this window has unsaved edits, those edits are kept and **not saved over the file**: the toast says "“⟨title⟩” changed outside Focus Notes. Your edits are kept here, and aren't saved over it until you choose." with [Resolve], the trigger's dot says "Changed in two places", and <kbd>Mod</kbd>+<kbd>S</kbd>, opening another note, or closing the window opens the resolver (titled "… changed outside Focus Notes", the other pane "On disk, changed ⟨time⟩") instead of overwriting. Keep this computer's version saves yours and keeps the other as "⟨title⟩ (other version, ⟨date⟩ ⟨time⟩)", made and deleted at once so it's in Recently deleted (or the system trash without Git); Take the version on disk keeps yours that way as "(your version, …)"; Keep both keeps yours as the conflict copy.

<h2 data-reader-personas="product design">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-FB-01 | Prefer Undo to confirmation. Confirm only changes of audience, deletes at scale, and discarding text. | UC-FILE-08, UC-SHARE-01 | Frequent confirmations train people to click through them. Saving them for real risk keeps them meaningful. | Confirming every destructive action. |
| DD-FB-02 | Sync status is invisible when healthy and shows as an arc on the trigger when not. | UC-SAFE-01, UC-SAFE-03 | It keeps the canvas calm (CP-CALM-01) while making unsynced work visible (CP-SAFE-01), using the one element that's always on screen. | A permanent "Saved" label. A status bar. |
| DD-FB-03 | Confirmations open on Cancel and name the object and its consequence. | UC-SHARE-01 | Stops reflexive <kbd>Enter</kbd> from publishing or deleting, and shows people exactly what they're agreeing to. | Focus on the primary button. A generic "Are you sure?". |
| DD-FB-04 | The conflict resolver offers three outcomes, and "Take the other" keeps a recoverable copy of yours. | UC-SAFE-02 | No choice in the resolver can lose words. | Automatic merging (surprising in prose). Last write wins. |
| DD-FB-05 | Context menus for the app's own items are app-drawn on every platform; right-clicking text on the desktop opens the text menu with the OS spell checker's suggestions, drawn in the theme on Windows and Linux and the system's on macOS (D-193, D-204). | UC-FILE-05 | The app's menus look and behave the same everywhere and follow the theme; text gets the system's spelling and editing menu, which people already know, with the system's words and dictionary. | Native menus for everything (unthemed, and different between web and desktop); app-drawn spelling suggestions (Electron reports no misspelled word on Windows, so they'd need the same OS query anyway). |
| DD-FB-06 | One task tracker explains every wait a person starts: nothing under 300 ms, then a sign at the place and words, with timings as tokens. | UC-SAFE-01, UC-FILE-06 | Short work stays calm (CP-CALM-01), and long work is never a mystery. One tracker keeps the timing and words consistent everywhere. | A global spinner or progress bar. Each component deciding its own timing. Showing a spinner for every wait at once, which flickers. |

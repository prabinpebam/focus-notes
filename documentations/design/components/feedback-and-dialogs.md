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

**IA-CMP-SAVESTATE.** Serves UC-SAFE-01 and UC-SAFE-03.

| State | What shows | Why |
| --- | --- | --- |
| Saved and synced | Nothing | The normal state shouldn't ask for attention (CP-CALM-01). |
| Saving or syncing | Nothing. If syncing takes longer than 5 s, a faint arc slowly turns around the frosted circle. | Normal waits stay silent, and long ones become visible. |
| Changes waiting (offline or sync paused) | A partial arc in `color.warning` around the frosted circle. Tooltip: "3 changes waiting to sync. Offline." | You can keep writing, and you can see that the work isn't on GitHub yet. |
| Sync failed | A full arc in `color.danger`. The first time, a toast: "Couldn't sync. GitHub rejected the push." [Retry] [Details]. | Needs action, but doesn't block writing. |
| Conflict | Same as failed, and the toast offers [Resolve] to open the conflict resolver. | Only the writer can decide. |

While there's a problem, opening the toolbar adds a status row at its top: "3 changes waiting · [Sync now]". The *Save* button's tooltip always shows the last sync ("Synced 2 min ago").

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

| Confirmation | Body |
| --- | --- |
| Make public | "Anyone with the link will be able to read it at ⟨url⟩. It goes live within a few minutes. Making it private later won't remove copies people have already seen." [Cancel] [Make public] |
| Make private | "Its public page goes offline after the next publish. Earlier versions stay in the public repository's Git history." [Cancel] [Make private] |
| Delete folder | "Delete “drafts” and the 12 notes in it? You can restore them from Recently deleted for 30 days." [Cancel] [Delete 12 notes] |
| Delete public note | "Delete “About”? Its public page will go offline after the next publish." [Cancel] [Delete and unpublish] |

<h2 id="context-menu" data-reader-personas="design">Context menu</h2>

**IA-CMP-CONTEXTMENU.** Serves UC-FILE-05, UC-FILE-06, UC-TABLE-03.

- Opens with right-click, <kbd>Shift</kbd>+<kbd>F10</kbd> or the Menu key (at the focused item), or a 500 ms long-press on touch screens.
- App-drawn, so it follows the theme the same way on the web and the desktop. On the desktop, spelling suggestions from the OS spell checker appear at the top when right-clicking a misspelled word.
- 14 px items with shortcuts right-aligned and dividers between groups. Submenus open with › on <kbd>→</kbd> or after a 200 ms hover. Destructive items come last. At most about 12 items, and the rest go into submenus.
- It holds the same actions as the visible controls for that item. It's never the only way to reach anything.

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

<h2 data-reader-personas="product design">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-FB-01 | Prefer Undo to confirmation. Confirm only changes of audience, deletes at scale, and discarding text. | UC-FILE-08, UC-SHARE-01 | Frequent confirmations train people to click through them. Saving them for real risk keeps them meaningful. | Confirming every destructive action. |
| DD-FB-02 | Sync status is invisible when healthy and shows as an arc on the trigger when not. | UC-SAFE-01, UC-SAFE-03 | It keeps the canvas calm (CP-CALM-01) while making unsynced work visible (CP-SAFE-01), using the one element that's always on screen. | A permanent "Saved" label. A status bar. |
| DD-FB-03 | Confirmations open on Cancel and name the object and its consequence. | UC-SHARE-01 | Stops reflexive <kbd>Enter</kbd> from publishing or deleting, and shows people exactly what they're agreeing to. | Focus on the primary button. A generic "Are you sure?". |
| DD-FB-04 | The conflict resolver offers three outcomes, and "Take the other" keeps a recoverable copy of yours. | UC-SAFE-02 | No choice in the resolver can lose words. | Automatic merging (surprising in prose). Last write wins. |
| DD-FB-05 | Context menus are app-drawn on every platform, with OS spelling suggestions on the desktop. | UC-FILE-05 | They look and behave the same everywhere, follow the theme, and still offer the platform's spell checker. | Native menus (unthemed, and different between web and desktop). |
| DD-FB-06 | One task tracker explains every wait a person starts: nothing under 300 ms, then a sign at the place and words, with timings as tokens. | UC-SAFE-01, UC-FILE-06 | Short work stays calm (CP-CALM-01), and long work is never a mystery. One tracker keeps the timing and words consistent everywhere. | A global spinner or progress bar. Each component deciding its own timing. Showing a spinner for every wait at once, which flickers. |

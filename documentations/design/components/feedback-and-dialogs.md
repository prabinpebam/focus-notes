# Feedback and dialogs

The shared components that tell people what happened and ask them before anything consequential: toasts, save and sync status, confirmations, context menus, the Move to picker, and the conflict resolver.

> [!NOTE]
> **TL;DR.** **Toasts** report what just happened and offer Undo. **Save status** stays invisible until something needs attention, and then shows as a thin arc around the trigger. **Confirmations** are reserved for deletes at scale and changes of audience. They name the thing, state the consequence, and default to Cancel. **Context menus** mirror the visible actions. **Move to…** is a searchable folder picker. The **conflict resolver** shows both versions and never discards text silently. Components IA-CMP-TOAST, IA-CMP-SAVESTATE, IA-CMP-DIALOG, IA-CMP-CONTEXTMENU, IA-CMP-MOVE, and IA-CMP-CONFLICT.

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

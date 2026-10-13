# Secondary views

The views people open now and then: Settings, Share and visibility, the keyboard shortcut cheat sheet, and the public page readers see.

> [!NOTE]
> **TL;DR.** **Settings** (IA-VIEW-SETTINGS) is a dialog with eight categories. It holds the rare choices, and every change applies at once. **Share and visibility** (IA-VIEW-SHARE) is a popover with a Private/Public switch, the public link with its live status, and private links (P1). Changing the audience always asks first. The **cheat sheet** (IA-VIEW-SHORTCUTS) is a searchable, filterable dialog in the platform's own key symbols. The **public page** (IA-VIEW-PUBLIC) is a calm, read-only reading view that follows the reader's light or dark preference. Each section ends with its design decisions.

<h2 id="settings" data-reader-personas="design product">Settings</h2>

**IA-VIEW-SETTINGS.** Serves UC-KEY-03 and UC-SETUP-03, and is the home for rare preferences. It opens from ⋯ → Settings, <kbd>Mod</kbd>+<kbd>,</kbd>, or Spotlight (any setting is also reachable directly in Spotlight).

**Layout:** a centered dialog, 760 &times; up to 600 px, solid surface. A category list on the left (200 px) and the category's settings on the right. The search field at the top filters across every category and highlights matches. There's no Save button: changes apply at once, the way macOS settings do. <kbd>Esc</kbd> closes it.

| Category | Settings |
| --- | --- |
| **Account** | Avatar, name, and @login. *Signed in through:* Git Credential Manager, GitHub CLI, or a token, with what that means ("Also used by Git in your terminal"). [Switch account] and [Sign out] (signs Git out too, and says so). A link to GitHub's settings to revoke a token or authorization fully. |
| **Workspace** | Folder location ([Show in Finder/Explorer], [Change…], which moves or re-clones). The notes and private repositories in the user's account (reachable, branch, last sync). *Publishing:* the GitHub Pages address and status, with [Turn on] if it was skipped. *Private share links:* on or off, with [Set up] if skipped. *Sync:* automatically after 30 s, 60 s (default), or 5 min without typing, or only when I press <kbd>Mod</kbd>+<kbd>S</kbd>. [Sync now]. [Run setup again]. |
| **Editor** | *New notes go in:* the current folder (default) or the Private root. *Open focus mode on start* (on). *Markdown shortcuts while typing* (on). *Smart punctuation* (on: curly quotes and dashes). *Spelling:* uses the OS spell checker, with a language list. *Paste:* keep formatting (default) or always paste as plain text. |
| **Appearance** | A summary ("System · Paper / Ink · 18 px Serif") with [Open theme manager]. *Interface size:* 90–150%. *Transparency:* follow the system (default) or always solid. *Sync appearance across computers* (off). |
| **Sharing** | *All people with access*: every audience with its name, ways in, what it opens, expiry, and state, with filters and actions. The invite template. Share-link publishing status, with [Set up] if skipped. See [Sharing and visibility](sharing.md#settings-sharing). |
| **Agents** | *Agents can connect*, read and edit permissions, folder limits, *Connect an agent* snippets, *Install command-line tool*, and *Recent agent changes*. See [Agents and automation](../../architecture/agents.md#permissions). |
| **Keyboard** | Search bindings. Every command with its keys, with [Change] (P1) and per-row Reset. [Reset all]. [Open cheat sheet]. Conflicts are flagged inline ("Also used by Duplicate block"). |
| **About** | Version, update status and channel (Stable or Beta, P1), license (MIT), third-party notices, *Copy diagnostic report*, *Report a problem* (a pre-filled GitHub issue), and links to these docs and the privacy statement. |

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-SET-01 | Changes apply immediately, with no Save or Cancel. | UC-KEY-03 | Settings are reversible preferences. A Save step only adds a way to lose changes. | OK and Cancel buttons. |
| DD-SET-02 | Appearance in Settings is a summary that links to the theme manager. | UC-THEME-01 | Theme choice has one real home (DD-IA-03). Duplicating its controls here would drift. | Full theme controls inside Settings. |
| DD-SET-03 | Every setting is also a Spotlight result. | UC-FIND-03 | Most people search before they browse (CP-REACH-01). | Settings reachable only through the dialog. |
| DD-SET-04 | Account shows which of the user's own tools holds the sign-in, and that it's shared with the terminal. | UC-SETUP-01 | There's exactly one credential, in Git's helper (D-21), so signing out affects the terminal too. Saying so avoids surprises. | Hiding where the credential lives. |

<h2 id="share-and-visibility" data-reader-personas="design product">Share and visibility</h2>

**IA-VIEW-SHARE** now has its own page: [Sharing and visibility](sharing.md). It covers the three visibility levels, audiences with magic links and passcodes, the invite, withdraw and extend, and the share reader.

<h2 id="note-history" data-reader-personas="design product">Note history</h2>

**IA-VIEW-HISTORY.** Serves UC-SAFE-05 and UC-AGENT-03. Priority P1. It opens from ⋯ → Note history, a toast's [Review], or Spotlight (`> Note history`).

- **Layout:** a right side sheet, 380 px wide, like the theme manager, with the note staying visible on the left.
- **List:** every saved version from Git, newest first, grouped by day. Each row shows the time, the author (the writer, another computer, or an agent with an *Agent* badge and its name), and a one-line summary of what changed ("Edited 3 paragraphs", "Renamed from Draft").
- **Selecting a version** shows the note as it was in the canvas, read-only, with changed blocks highlighted against the current version. A banner shows "Viewing the version from 13 Oct, 14:02" with [Restore this version] and [Back to current].
- **Restore** makes a new commit with the old content (the newer versions stay in history), and announces "Restored the version from 13 Oct, 14:02" with [Undo].
- **Agent changes** can be undone right from their row ([Undo this change]), which reverts only that commit.
- **Keyboard:** <kbd>↑</kbd>/<kbd>↓</kbd> move through versions, <kbd>Enter</kbd> previews, and <kbd>Esc</kbd> returns to the current version and closes the sheet.

**Design decision**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-HIST-01 | Note history comes from Git and restoring is a new commit. | UC-SAFE-05, UC-AGENT-03 | Git already holds every version (CP-SAFE-01). Restoring forward never destroys anything. | A separate version store. Restoring by rewriting history. |

<h2 id="keyboard-shortcut-cheat-sheet" data-reader-personas="design product">Keyboard shortcut cheat sheet</h2>

**IA-VIEW-SHORTCUTS.** Serves UC-KEY-01. It opens with <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> (<kbd>⌘?</kbd> / <kbd>Ctrl+?</kbd>), ⋯ → Keyboard shortcuts, or Spotlight.

- **Layout:** a centered dialog, 760 px wide. A search field (focused on open), a layer filter (a segmented control: All, Basic, Writer, Power, Pro), and a live count ("33 shortcuts", or "No shortcuts match …" with a hint) stay put above the scrolling list. Groups follow [Keyboard shortcuts](../../experience/keyboard-shortcuts.md): App and window, Editing, Formatting, Blocks, Tables, Find, Spotlight, Files.
- **Rows:** the action name on the left, key caps on the right (12 px, `radius.small`) in the current platform's symbols, with alternates joined by "or" (<kbd>Ctrl+Shift+D</kbd> or <kbd>F8</kbd>). Screen readers hear the keys in words ("Control Shift D"). Rows follow the order of the tables in [Keyboard shortcuts](../../experience/keyboard-shortcuts.md). A platform switch ("Show keys for: macOS | Windows and Linux") helps people who use both. Commands planned for later milestones (Spotlight) aren't listed until they work.
- **Search** matches action names, synonyms, and keys (typing "⌘/" or "ctrl /" finds what uses those keys).
- **Customized bindings** (P1) are marked with a dot and "Changed". [Customize…] opens Settings → Keyboard.
- <kbd>Esc</kbd> closes it. Rows aren't actionable, because this is a reference. Spotlight is where commands are run.

**Design decision**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-KEYS-01 | A reference dialog separate from Spotlight, with layer filters. | UC-KEY-01 | Learning shortcuts is a different task from running a command. Filtering by layer lets beginners skip pro keys. | Only listing shortcuts in Spotlight. A static web page. |

<h2 id="public-note-page" data-reader-personas="design product">Public note page</h2>

**IA-VIEW-PUBLIC.** Serves UC-READ-01. It's the page readers see at `/n/<path>/`, and also the private share reader at `/s/<token>/`.

- **Look:** the same reading column, type, and default themes as the app (Paper or Ink, following the reader's `prefers-color-scheme`), with a small light/dark toggle in the top-right corner. There's no trigger, because readers can't act on the note.
- **Content:** the title, then "Updated ⟨date⟩" in muted text, then the note, then a quiet footer: "Published with Focus Notes".
- **Sizes:** readable from 320 px wide up. Tables scroll sideways inside their frame. Print styles drop the toggle and footer.
- **Private share reader states:** *Unlocking…* (a short indicator while the browser decrypts), then the note. *Link expired:* "This link has expired. Ask the person who shared it for a new one." *Link not valid:* "This link doesn't work. It may have been withdrawn or copied incompletely." No technical detail and no hints about the note's existence.
- **Accessibility:** one H1, landmarks, a skip link, and the same contrast guarantees as the built-in themes.

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-PUB-01 | Readers get the same calm reading view and follow their own light or dark preference. | UC-READ-01 | The reader's comfort decides. The writer's custom theme stays private to the writer. | Publishing with the writer's personal theme. |
| DD-PUB-02 | Share-link errors never reveal whether the note exists. | UC-SHARE-03 | It keeps private content private even when links leak or expire (CP-SAFE-01). | Detailed errors such as "Note X is private". |

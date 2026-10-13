# Secondary views

The views people open now and then: Settings, Share and visibility, the keyboard shortcut cheat sheet, and the public page readers see.

> [!NOTE]
> **TL;DR.** **Settings** (IA-VIEW-SETTINGS) is a dialog with six categories. It holds the rare choices, and every change applies at once. **Share and visibility** (IA-VIEW-SHARE) is a popover with a Private/Public switch, the public link with its live status, and private links (P1). Changing the audience always asks first. The **cheat sheet** (IA-VIEW-SHORTCUTS) is a searchable, filterable dialog in the platform's own key symbols. The **public page** (IA-VIEW-PUBLIC) is a calm, read-only reading view that follows the reader's light or dark preference. Each section ends with its design decisions.

<h2 id="settings" data-reader-personas="design product">Settings</h2>

**IA-VIEW-SETTINGS.** Serves UC-KEY-03 and UC-SETUP-03, and is the home for rare preferences. It opens from ⋯ → Settings, <kbd>Mod</kbd>+<kbd>,</kbd>, or Spotlight (any setting is also reachable directly in Spotlight).

**Layout:** a centered dialog, 760 &times; up to 600 px, solid surface. A category list on the left (200 px) and the category's settings on the right. The search field at the top filters across every category and highlights matches. There's no Save button: changes apply at once, the way macOS settings do. <kbd>Esc</kbd> closes it.

| Category | Settings |
| --- | --- |
| **Account** | Avatar, name, and @login. *Git on this computer:* "Signed in" or "Not signed in", with a [Sign in Git] fix. [Switch account], [Sign out] (asks whether to also remove Git's saved credential), and a link to GitHub → Applications to fully revoke access. |
| **Workspace** | Folder location ([Show in Finder/Explorer], [Change…], which moves or re-clones). Public and private repository status (reachable, branch, last sync). *Sync:* automatically after 30 s, 60 s (default), or 5 min without typing, or only when I press <kbd>Mod</kbd>+<kbd>S</kbd>. [Sync now]. [Run setup again]. |
| **Editor** | *New notes go in:* the current folder (default) or the Private root. *Open focus mode on start* (on). *Markdown shortcuts while typing* (on). *Smart punctuation* (on: curly quotes and dashes). *Spelling:* uses the OS spell checker, with a language list. *Paste:* keep formatting (default) or always paste as plain text. |
| **Appearance** | A summary ("System · Paper / Ink · 18 px Serif") with [Open theme manager]. *Interface size:* 90–150%. *Transparency:* follow the system (default) or always solid. *Sync appearance across computers* (off). |
| **Keyboard** | Search bindings. Every command with its keys, with [Change] (P1) and per-row Reset. [Reset all]. [Open cheat sheet]. Conflicts are flagged inline ("Also used by Duplicate block"). |
| **About** | Version, update status (P1), license (MIT), third-party notices, links to these docs and to the issue tracker. |

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-SET-01 | Changes apply immediately, with no Save or Cancel. | UC-KEY-03 | Settings are reversible preferences. A Save step only adds a way to lose changes. | OK and Cancel buttons. |
| DD-SET-02 | Appearance in Settings is a summary that links to the theme manager. | UC-THEME-01 | Theme choice has one real home (DD-IA-03). Duplicating its controls here would drift. | Full theme controls inside Settings. |
| DD-SET-03 | Every setting is also a Spotlight result. | UC-FIND-03 | Most people search before they browse (CP-REACH-01). | Settings reachable only through the dialog. |
| DD-SET-04 | Account shows Git's sign-in state separately from the app's. | UC-SETUP-01 | The owner wants commits and pushes to work from the terminal too, so a broken Git sign-in must be visible and fixable here. | A single "Signed in" status. |

<h2 id="share-and-visibility" data-reader-personas="design product">Share and visibility</h2>

**IA-VIEW-SHARE.** Serves UC-SHARE-01 to UC-SHARE-04. It opens from ⋯ → Share and visibility, Spotlight (`> Share`), or a Files row's ⋯.

**Layout:** a frosted popover, 360 px wide, anchored under the trigger. The note's title is at the top, with a **Private | Public** segmented switch under it.

| State | Contents |
| --- | --- |
| **Private** (default) | "Only you, and people with access to your private repository, can read this." **Private links** (P1): a list of active links (recipient, expires in…), each with [Copy] and [Revoke]. [Share privately…] opens a small form: *For* (a label such as "Asha, editor"), *Expires* (1 day, 1 week (default), 30 days, or a date), then [Create link]. The new link is copied straight away and the list updates. |
| **Public** | The public URL in a read-only field, with [Copy link] (UC-SHARE-02). Status: **Live** (green dot), **Publishing…** ("usually a few minutes"), or **Not published yet**. [Open page]. |
| Changing the switch | Opens the visibility confirmation (see [Feedback and dialogs](../components/feedback-and-dialogs.md#confirmation-dialog)). Nothing changes until it's confirmed. |
| The note isn't synced yet | The Public option waits: "Sync this note first to publish it." with [Sync now]. |

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-SHARE-01 | Visibility is a two-way switch at the top, and every change asks for confirmation. | UC-SHARE-01 | The audience is the most important fact about a note's sharing. It should be visible first and changed deliberately (CP-SHARE-01). | A "Publish" button hidden in a menu. Changing without confirmation. |
| DD-SHARE-02 | The public link shows when it's live, not just the address. | UC-SHARE-02 | Pages take minutes to publish. Sharing a link that doesn't work yet breaks trust. | A copy button with no status. |
| DD-SHARE-03 | Private links carry a label for who they're for, and a default expiry of one week. | UC-SHARE-03, UC-SHARE-04 | Labels make revoking the right link possible. Expiry by default limits forgotten access. | Anonymous links that never expire. |

<h2 id="keyboard-shortcut-cheat-sheet" data-reader-personas="design product">Keyboard shortcut cheat sheet</h2>

**IA-VIEW-SHORTCUTS.** Serves UC-KEY-01. It opens with <kbd>Mod</kbd>+<kbd>/</kbd>, ⋯ → Keyboard shortcuts, or Spotlight.

- **Layout:** a centered dialog, 760 px wide. A search field (focused on open) and filter chips: All, Basic, Writer, Power, Pro. Groups follow [Keyboard shortcuts](../../experience/keyboard-shortcuts.md): App and window, Editing, Formatting, Blocks, Tables, Find, Spotlight, Files.
- **Rows:** the action name on the left, key caps on the right (12 px, `radius.small`) in the current platform's symbols. A platform switch ("Show keys for: macOS | Windows and Linux") helps people who use both.
- **Search** matches action names, synonyms, and keys (typing "⌘K" or "ctrl k" finds what uses those keys).
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

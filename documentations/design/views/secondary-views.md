# Secondary views

The views people open now and then: Settings, Send feedback, Share and visibility, the keyboard shortcut cheat sheet, and the public page readers see.

> [!NOTE]
> **TL;DR.** **Settings** (IA-VIEW-SETTINGS) is a dialog with eight categories. It holds the rare choices, and every change applies at once. As built, the desktop has its **Account** and **Workspace** categories: sign out (with or without Git's sign-in), switch account, run setup again, and remove the workspace from this computer once everything is on GitHub (D-103). **Send feedback** (IA-VIEW-FEEDBACK, D-203) is a dialog for a problem or an idea: signed in on the desktop it posts a public issue to the project's repository; otherwise it continues on GitHub's new-issue form. It opens from the foot of Settings' category list, ⋯, Spotlight, and the macOS Help menu. **Share and visibility** (IA-VIEW-SHARE) is a popover with a Private/Public switch, the public link with its live status, and private links (P1). Changing the audience always asks first. The **cheat sheet** (IA-VIEW-SHORTCUTS) is a searchable, filterable dialog in the platform's own key symbols. The **public page** (IA-VIEW-PUBLIC) is a calm, read-only reading view that follows the reader's light or dark preference. Each section ends with its design decisions.

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
| **Agents** | *Agents can connect*, read and edit permissions, folder limits, a line saying the command-line tool acts as you, *Connect an agent* snippets, *Install command-line tool*, and *Recent agent changes*. See [Agents and automation](../../architecture/agents.md#permissions). |
| **Keyboard** | Search bindings. Every command with its keys, with [Change] (P1) and per-row Reset. [Reset all]. [Open cheat sheet]. Conflicts are flagged inline ("Also used by Duplicate block"). |
| **About** | Version, update status and channel (Stable or Beta, P1), license (MIT), third-party notices, *Copy diagnostic report*, *Report a problem* (opens [Send feedback](#send-feedback) with Problem chosen), and links to these docs and the privacy statement. |

**As built (WP-3.6, D-103).** On the desktop, Settings is a view document of its own (`settings.view.json`), hosted beside the canvas, with its categories as a vertical tab list (Tabs with `orientation` vertical, `layout.categoryList` wide; where there's no room for the list and a 240 px panel side by side, the tabs lay out across, above the settings, and wrap rather than reach past the dialog, D-111). Side by side, the list and the panel run the full height of the dialog's body, so the list's divider reaches from the top of the body to the bottom (D-123). So far it has **Account**, **Workspace**, and **Appearance** (WP-4.5, D-108): the summary ("System · Paper / Ink · 16 px Mono (Roboto Mono)") with [Open theme manager], *Interface size* 90–150% as a segmented control, and *Sync appearance* where there's a private repository; *Transparency* isn't built yet. Sharing (WP-5.3) and About (WP-5.7) have joined; the other categories join with the work packages that build them (Agents), and the search field comes with Spotlight. It opens from ⋯ → *Settings…* and <kbd>Mod</kbd>+<kbd>,</kbd>, at the category it was left on, with focus on that category (Tabs' `autoFocus`; until the search field arrives, it's where focus goes), so the arrow keys move between categories at once. The browser has no Settings yet: its ⋯ shows *Settings…* unavailable, saying Settings are in the desktop app.

- **Account** shows the name and @login, which helper holds the sign-in ("Signed in through Git Credential Manager. Git uses the same sign-in in your terminal."), [Switch account], [Sign out…], and *Manage access on GitHub* (GitHub's authorizations page, or its tokens page when the sign-in is a token). Signed out, it says so, names the account Git still has if Focus Notes alone signed out, and offers [Sign in…].
- **Sign in** and **Switch account** show the first run's *Sign in to GitHub* card alone over the canvas, without step numbers; the note is saved and put away until the card closes. *Continue as @login* finishes ("Signed in to GitHub as @login."), and <kbd>Esc</kbd> leaves. Switching takes the current credential out of Git's helper so the helper signs in as someone else, and puts it back if no one does.
- **Sign out of GitHub?** (from Account or the account pill) asks what happens to Git's sign-in on this computer, a radio group: *Remove it too* (the default: the terminal must sign in again) or *Keep it for the terminal* (only Focus Notes signs out and stops using the account until *Continue as @login*; Git keeps its sign-in, so `git push` and saving notes to GitHub keep working). Either way the recent note, setup's progress, and the first run's workspace identity are deleted, as the [data inventory](../../architecture/security-and-privacy.md#data-inventory) lists.
- **Workspace** shows the folder and whether it's saved to GitHub, with [Sync now], [Run setup again] (*Connect to GitHub* for a folder that isn't saved to GitHub yet: the first run's card from its Connect step, with setup's progress forgotten, so each step is checked again and only what's missing is done; <kbd>Esc</kbd> on that first step goes back to the note), [Open another workspace from GitHub…] when signed in (the first run's *Your notes* card alone: the notes the account has, each with [Open], and *Open another repository from GitHub…*; <kbd>Esc</kbd> goes back to the note, D-124), and [Remove this workspace from this computer…].
- **About** (WP-5.7, D-140), on the desktop only, is the diagnostic report for now: six item cards, each an icon, a title, and a detail (*Focus Notes 0.5.0* · *Windows · Electron 38*; *Git 2.47.1* · *Git Credential Manager*; *2 repositories* · *1 ahead · 0 behind · 0 conflicts*; *Recovery journal* · *Empty*; *Compositing* · *GPU*; *Recent problems* · *None*), the line *Never included: note text, names, paths, emails, passwords, keys, or tokens.*, and [Copy diagnostic report] (primary), [Save diagnostic report…], and [Report a problem…]. Copying says *Diagnostic report copied*; saving shows the system's save dialog and says *Diagnostic report saved*; Report a problem opens [Send feedback](#send-feedback) with *Problem* chosen and the report attached (D-203 replaces D-140 (7), which copied the report and opened GitHub's form straight away). All three are in Spotlight and the macOS Help menu. The version's update status, license, notices, and links are still to come. See [Performance and quality → Diagnostics](../../architecture/performance-and-quality.md#diagnostics).
- **Remove this workspace?** first checks both repositories. While anything isn't on GitHub (a file not committed or never added, a commit no remote has, a stash) it says how many and offers [Sync now], and checks again. Once everything is, it names the repositories the notes stay in and the folder it deletes, and [Remove] deletes the local clone and the inventory's items, then the window starts again at the first run's *Your notes*. Nothing on GitHub is touched, and a workspace that isn't saved to GitHub, or a folder that isn't a Focus Notes workspace, is never removed.

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-SET-01 | Changes apply immediately, with no Save or Cancel. | UC-KEY-03 | Settings are reversible preferences. A Save step only adds a way to lose changes. | OK and Cancel buttons. |
| DD-SET-02 | Appearance in Settings is a summary that links to the theme manager. | UC-THEME-01 | Theme choice has one real home (DD-IA-03). Duplicating its controls here would drift. | Full theme controls inside Settings. |
| DD-SET-03 | Every setting is also a Spotlight result. | UC-FIND-03 | Most people search before they browse (CP-REACH-01). | Settings reachable only through the dialog. |
| DD-SET-04 | Account shows which of the user's own tools holds the sign-in, and that it's shared with the terminal. | UC-SETUP-01 | There's exactly one credential, in Git's helper (D-21), so signing out affects the terminal too. Saying so avoids surprises. | Hiding where the credential lives. |

<h2 id="send-feedback" data-reader-personas="design product engineering">Send feedback</h2>

**IA-VIEW-FEEDBACK.** Serves UC-SAFE-07 (QLT-07, D-203). A small dialog for telling the maintainer about a problem or an idea. Signed in on the desktop, *Send* posts it as a public issue to `prabinpebam/focus-notes` without a browser. Signed out, and always in the browser app (which never writes to GitHub, D-80), *Continue on GitHub* opens GitHub's new-issue form filled in.

**Where it opens.**

| Entry point | What it shows |
| --- | --- |
| **Settings**, the foot of the category list | *Send feedback*, a subtle button with the feedback icon, under the categories. It shows on every category, including the one Settings opens on (the Tabs `footer` slot, D-203 (1)). It closes Settings, and closing the dialog goes back to Settings. Tab goes from the categories to *Send feedback*, then to the category's panel, in the order they read. |
| **⋯ menu** | *Send feedback…*, after *Settings…*, on the desktop and in the browser. |
| **Spotlight** | *Send feedback…*, found by *feedback*, *bug*, *issue*, *problem*, *idea*, *suggestion*, *report*, and *github*. |
| **macOS Help menu** | *Send Feedback…*, before the diagnostic report's items. |
| **Report a problem…** (About, Spotlight, Help) | The same dialog, with *Problem* chosen and the report attached. |

**Layout.** A dialog 640 px wide (Dialog `size` m), as tall as its content (`height` content):

1. **Kind:** a segmented control, *Problem* | *Idea*. It opens on *Problem*.
2. **Title:** a one-line field, required, at most 120 characters. Its placeholder is *What went wrong, in a few words* for a problem and *Your idea, in a few words* for an idea.
3. **Details:** a multi-line field, at most 5,000 characters. Its placeholder is *What happened, and what did you expect?* for a problem and *What would you like Focus Notes to do?* for an idea.
4. **Attach diagnostic report:** a toggle button (on the desktop only). It's on for a problem and off for an idea until the person changes it. Beside it, *Preview* (a disclosure) shows About's six cards and *Never included: note text, names, paths, emails, passwords, keys, or tokens.* The report itself stays in the main process.
5. **Who and where:** one item card. Signed in on the desktop, it shows the avatar, *@login*, and *Posts publicly to prabinpebam/focus-notes*. Signed out, or in the browser, it shows GitHub's mark, *Continues on GitHub*, and *You'll post it there with your GitHub account.*
6. **Buttons**, at the end: [Cancel] and the primary [Send] (signed in on the desktop) or [Continue on GitHub]. The primary stays disabled until the title has text: *Add a title first.*

**States and their words.**

| State | What shows |
| --- | --- |
| **Editing** | The fields above. The draft (kind, title, details, attach) stays in memory while the app runs, across closing and opening. It's never written to disk. A field past its limit says *At most 120 characters.* or *At most 5,000 characters.*, and the primary stays disabled. |
| **Sending** | [Send] is busy: *Sending…* through the task tracker (`focus-notes:feedback.send`, a [wait](../../architecture/perceived-performance.md#wait-inventory)). The fields are read-only, and Kind and Attach can't change. Closing the dialog doesn't stop it: the result arrives as a toast, *Feedback sent as issue #N.* [Open] or *Feedback not sent. Your draft is kept.* [Open]. |
| **Sent** | The form gives way to one card: the sent icon, *Feedback sent*, *Issue #N*. Then [Open on GitHub] (only when GitHub's address is an issue of `prabinpebam/focus-notes`) and [Done] (primary). The draft is cleared. For 30 seconds another send waits: *Sent just now. Wait a moment.* |
| **Couldn't reach GitHub** (offline, a timeout, GitHub's 5xx) | A danger row, *Couldn't reach GitHub. Your feedback is still here.*, and [Continue on GitHub] [Try again]. |
| **Sign-in expired** (401) | *Your GitHub sign-in has expired.*, with [Continue on GitHub] [Sign in again]. Sign in again keeps the draft and shows the account card. |
| **Refused** (403, 404, 410, 422, rate limits, abuse detection: a token that can't open issues there) | *GitHub didn't accept it from this sign-in.*, with [Continue on GitHub]. |
| **Continue on GitHub** | Opens `github.com/prabinpebam/focus-notes/issues/new` with the title, the details and a one-line app and system summary, and the labels. The report is never in the address: when attached it goes on the clipboard, *Report copied. Paste it into the issue.* Details too long for the address are cut with a note and copied whole: *Details copied. Paste the rest into the issue.*, or *Details and report copied. Paste them into the issue.* The dialog closes and keeps the draft. |

**Keyboard.** Focus goes to Title when it opens. <kbd>Tab</kbd> goes through Kind, Title, Details, Attach diagnostic report, Preview, Cancel, and the primary. <kbd>Enter</kbd> in Title presses the primary; in Details it starts a new line. <kbd>Esc</kbd> closes it and keeps the draft, with a failure's message and [Try again] (while sending, the result comes as a toast). Closed, focus goes back to Settings when it came from there, otherwise to the note. In Sent, focus goes to [Done].

**Screen readers.** The dialog is named *Send feedback*. Sending says *Sending feedback…* once it's past the tracker's announce delay. Sent says *Feedback sent as issue #N.* A failure says its row's words. The primary's disabled reason is read with it.

**Decisions.** [D-203](../../plan/decisions.md) records why: one dialog for problems and ideas, since people don't sort their feedback first (Report a problem is a way in with Problem chosen); the toggle button for the report, since the catalog has no checkbox and a pressed toggle says the same; and a fixed repository, a token that stays in the main process, and the report kept out of every address.

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
- **As built (D-175, WP-8.4):** the sheet reads the history only when it opens, 50 versions at a time with *Show older versions*, and names each wait ("Reading versions…"). A chosen version shows in the sheet, block by block against the note now, rather than in the canvas. Restoring saves the old text as the note's next version, with *Undo* on its toast. Not yet: the version in the canvas, the one-line summary of each change, and *Undo this change* on an agent's row.

**Design decision**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-HIST-01 | Note history comes from Git and restoring is a new commit. | UC-SAFE-05, UC-AGENT-03 | Git already holds every version (CP-SAFE-01). Restoring forward never destroys anything. | A separate version store. Restoring by rewriting history. |

<h2 id="keyboard-shortcut-cheat-sheet" data-reader-personas="design product">Keyboard shortcut cheat sheet</h2>

**IA-VIEW-SHORTCUTS.** Serves UC-KEY-01. It opens with <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> (<kbd>⌘?</kbd> / <kbd>Ctrl+?</kbd>), ⋯ → Keyboard shortcuts, or Spotlight.

- **Layout:** a centered dialog, 760 px wide. A search field (focused on open), a layer filter (a segmented control: All, Basic, Writer, Power, Pro), and a live count ("33 shortcuts", or "No shortcuts match …" with a hint) stay put above the scrolling list. Groups follow [Keyboard shortcuts](../../experience/keyboard-shortcuts.md): App and window, Editing, Formatting, Blocks, Tables, Find, Spotlight, Files. Its padding is the same 24 px on every side (the title's box is trimmed to its letters, so there's no extra space above it), and the list fades over 50 px at a top or bottom with more to scroll to (D-111). In a narrow window the two segmented controls wrap onto their own rows, and the dialog never reaches the window's edges.
- **Rows:** the action name on the left, key caps on the right (12 px, `radius.small`) in the current platform's symbols, with alternates joined by "or" (<kbd>Ctrl+Shift+D</kbd> or <kbd>F8</kbd>). Screen readers hear the keys in words ("Control Shift D"). Rows follow the order of the tables in [Keyboard shortcuts](../../experience/keyboard-shortcuts.md). A platform switch ("Show keys for: macOS | Windows and Linux") helps people who use both. Commands planned for later milestones (Spotlight) aren't listed until they work.
- **Search** matches action names, synonyms, and keys (typing "⌘/" or "ctrl /" finds what uses those keys).
- **Customized bindings** (P1) are marked with a dot and "Changed". [Customize…] opens Settings → Keyboard.
- <kbd>Esc</kbd> closes it. Rows aren't actionable, because this is a reference. Spotlight is where commands are run.

**Design decision**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-KEYS-01 | A reference dialog separate from Spotlight, with layer filters. | UC-KEY-01 | Learning shortcuts is a different task from running a command. Filtering by layer lets beginners skip pro keys. | Only listing shortcuts in Spotlight. A static web page. |

<h2 id="public-note-page" data-reader-personas="design product">Public note page</h2>

**IA-VIEW-PUBLIC.** Serves UC-READ-01. It's the page readers see at `/n/<path>/`, and also the private share reader at `/s/` (D-125).

- **Look:** the same reading column, type, and default themes as the app (Paper or Ink, following the reader's `prefers-color-scheme`), with a small light/dark toggle in the top-right corner. There's no trigger, because readers can't act on the note.
- **Content:** the title, then "Updated ⟨date⟩" in muted text, then the note, then a quiet footer: "Published with Focus Notes".
- **Sizes:** readable from 320 px wide up. Tables scroll sideways inside their frame. Print styles drop the toggle and footer.
- **Private share reader states:** *Opening…* (a short indicator while the browser decrypts), then the note. Anything that doesn't open, an expired, withdrawn, or mistyped link or passcode, gets one message with no technical detail and no hints about the note's existence ([Sharing and visibility → The share reader](sharing.md#the-share-reader), D-125).
- **Accessibility:** one H1, landmarks, a skip link, and the same contrast guarantees as the built-in themes.
- **As built (WP-5.1, D-114):** the view document `reader.view.json` (ReaderPage, NoteContent), rendered once by the publisher to static HTML with no script: Paper or Ink by `prefers-color-scheme`, the title, "Updated ⟨date⟩", the note, and the footer. The light/dark toggle isn't built yet, because the page has no script.
- **Index of public notes (D-139):** `/n/` lists every public note as a row, newest first: its title linking to its page, "Updated ⟨date⟩" in muted text, and its excerpt when the note's front matter gives one (`excerpt:`). The same reader layout, type, themes, and footer, from the view document `index.view.json`; it's published only when there's at least one public note.

**Design decisions**

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-PUB-01 | Readers get the same calm reading view and follow their own light or dark preference. | UC-READ-01 | The reader's comfort decides. The writer's custom theme stays private to the writer. | Publishing with the writer's personal theme. |
| DD-PUB-02 | Share-link errors never reveal whether the note exists. | UC-SHARE-03 | It keeps private content private even when links leak or expire (CP-SAFE-01). | Detailed errors such as "Note X is private". |

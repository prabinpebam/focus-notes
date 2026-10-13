# Files and sharing

This page covers the main workflows besides writing: managing notes and folders, choosing who can see a note, and sharing it with a link.

> [!NOTE]
> **TL;DR.** The **Files** panel (*Open* in the trigger toolbar, <kbd>Ctrl/⌘</kbd>+<kbd>O</kbd>) is a tree of folders and notes with create, rename, move, and delete. [Spotlight](spotlight.html) quick open (<kbd>Ctrl/⌘</kbd>+<kbd>P</kbd>) finds any note by name. Every operation is a Git commit, so nothing is lost for good. On the desktop those commits are made and pushed with the user's own `git`. Each note is **public** or **private**. Public notes get a stable read-only URL on GitHub Pages. Private notes live in the private submodule repository, are never published in plaintext, and can be shared with one person through an expiring, revocable link. Covers FIL-* and SHR-* in the [requirements](../product/requirements.md).

## The Files panel

Opened from **Open** in the [trigger toolbar](main-ui.html) (<kbd>Ctrl/⌘</kbd>+<kbd>O</kbd>). It's a transient overlay that closes after a note is opened, so the canvas stays blank. Its keyboard behavior follows Finder on macOS and Explorer on Windows ([Keyboard shortcuts → Files panel](keyboard-shortcuts.md#files-panel)).

- **Two roots:** *Public* and *Private*. They map to the two content repositories (see [Repository and publishing](../architecture/repository-and-publishing.html)). Each note's visibility is clear from which root it sits under.
- **Tree:** folders first, then notes, sorted alphabetically. Expand and collapse with the arrow keys. Typing a name jumps to it.
- **Quick open:** <kbd>Ctrl/⌘</kbd>+<kbd>P</kbd> opens [Spotlight](spotlight.html) in note mode to fuzzy-find any note by title and path (FIL-04).
- **Context menu** on each item (right-click, the item's menu button, or <kbd>Shift</kbd>+<kbd>F10</kbd>) lists the operations below.

## Operations

| Operation | How | Repository effect | Req |
| --- | --- | --- | --- |
| New note | Toolbar *New*, <kbd>Mod</kbd>+<kbd>N</kbd>, or *New note* on a folder | Nothing is written until the first character is typed. The file name follows the title until the note is published | FIL-01, FIL-07 |
| Rename note | Inline rename (<kbd>F2</kbd> on Windows, <kbd>Enter</kbd> on macOS) | Edits the title (H1). The file is renamed too unless the note is published. Links to it in other notes are updated in the same commit | FIL-01, FIL-07, FIL-09 |
| Delete note | Context menu or <kbd>Delete</kbd> / <kbd>⌘⌫</kbd>. Private: no dialog, *Undo* in the toast. Public: confirm first | Deletes the file in a commit. Recoverable from *Recently deleted* for 30 days, and from Git history after that | FIL-01, FIL-05, FIL-10 |
| New folder | *New folder* on a root or folder, named inline | Creates the folder with a `.gitkeep` file so Git can track it while it's empty | FIL-02 |
| Rename folder | Inline rename | One commit renaming every path inside it and updating links | FIL-02, FIL-09 |
| Delete folder | Context menu, then confirm, listing how many notes it holds (empty folders don't ask) | One commit deleting the subtree, with *Undo* | FIL-02, FIL-05 |
| Move | Drag-and-drop, cut and paste, or the *Move to…* picker, for one item or a multi-selection | Git rename within the same repository, links updated, one commit | FIL-03, FIL-08, FIL-09 |
| Move between Public and Private | Drag across sections, or *Make public* / *Make private* in Share, always confirmed | Delete in one repository and add in the other, plus a submodule pointer update (see below) | FIL-06, SHR-02 |
| Restore | *Recently deleted* → Restore or Restore to… | Re-adds the file from Git history in a new commit | FIL-10 |

The full interaction design (anatomy, states, naming rules, multi-select, and the reasoning behind each choice) is in [Files panel](../design/views/files.html).
Commit messages are readable and consistent. For example: `Create notes/ideas.md`, `Move drafts/a.md → archive/a.md`, `Make private: journal/2026-10-13.md`.

## Public and private

Seed: *"The content can be made public or private. Private content are hosted in a private repo which is a submodule of the parent repo."*

| | Public note | Private note |
| --- | --- | --- |
| Stored in | Public repository, `content/` | Private content repository, mounted at `private/` as a Git submodule |
| Published on GitHub Pages | Yes, as a read-only page | Never in plaintext. It only appears as sealed (encrypted) files if it's shared |
| Readable without signing in | Yes, by anyone with the URL | Only through a private share link |
| Default for new notes | No | **Yes** (SHR-01, safe by default) |

### Changing visibility

1. The user picks **Share → Make public** (or *Make private*). Making a note public asks for confirmation: *"Anyone with the link will be able to read this note."*
2. The app writes the note into the target repository and deletes it from the source repository.
3. If the private repository changed, the public repository's submodule pointer is moved to the new private commit.
4. The note keeps the same folder path inside its new root, so links between notes in the same root still work.

> [!WARNING]
> Making a note private doesn't erase it from the public repository's **Git history** or from caches and copies people already have. The confirmation dialog says this clearly. Rewriting history is a manual maintenance task, not an app feature.

## Sharing links

### Public link (SHR-03)

- **Share → Copy link** copies the note's GitHub Pages URL, for example `https://<user>.github.io/focus-notes/n/<path>`.
- The public page is a read-only rendering of the note in the reader's preferred theme, with no editing UI.
- The URL is stable for as long as the note's path doesn't change. Renames and moves leave a redirect stub at the old path (proposed; see [decisions](../plan/decisions.md) D-08).
- The public page appears after the next GitHub Pages deploy, usually within minutes. The Share panel shows *"Publishing…"* until the deploy for that commit is done.

### Private share link (SHR-05, P1)

This follows the sealed-content approach proven in the `personal-site` project:

1. **Share → Share privately…** asks for a recipient label and an expiry date.
2. The app adds a **grant** to `access.json` in the private repository (recipient, scope, expiry, random secret).
3. On the next deploy, CI encrypts the note (AES-256-GCM) and publishes only ciphertext and a keyring.
4. The app shows a link in the form `…/s/<opaque-token>/#a=<grant-id>.<secret>`. The part after `#` is never sent to the server.
5. The recipient's browser uses the fragment to unlock the keyring and decrypt the note locally.
6. **Revoke** removes the grant. Expired grants stop working at the next deploy (a nightly deploy enforces expiry).

> [!WARNING]
> Sealed sharing protects against crawlers and casual discovery. It doesn't stop a recipient from passing the link on or saving the text. The full threat model is in [Repository and publishing](../architecture/repository-and-publishing.html#threat-model).

## Conflicts and offline

- **Desktop (primary):** the app works on a local clone, so reading and writing work fully offline. Commits are made locally and pushed when the network is back. Before pushing it fetches, and if the same note changed elsewhere the writer chooses between **Keep mine**, **Take theirs**, and **Save mine as a copy**. Nothing is merged silently, and the repository is never left half-rebased ([Desktop and Git](../architecture/desktop-and-git.md#save-and-sync)).
- **Web (M6):** every save carries the version (Git blob SHA) the edit started from. If the remote file has changed since then, the save is rejected and the same three choices appear. While offline, edits are queued in IndexedDB and synced in order when the connection returns.
- In both, the trigger shows the save-problem state while changes are waiting, and *Save* (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd>) retries right away.

# Files and sharing

This page covers the main workflows besides writing: managing notes and folders, choosing who can see a note, and sharing it with a link.

> [!NOTE]
> **TL;DR.** The **Files** panel (*Open* in the trigger toolbar, <kbd>Ctrl/⌘</kbd>+<kbd>O</kbd>) is a tree of folders and notes with create, rename, move, and delete. [Spotlight](spotlight.html) quick open (<kbd>Ctrl/⌘</kbd>+<kbd>P</kbd>) finds any note by name. Every operation is a Git commit, so nothing is lost for good. Only the desktop app makes those commits, with the user's own `git` (D-90). In the browser, notes written there are kept in that browser, and the instance's notes open read-only with *Copy to my notes*. Each note is **public** or **private**. Public notes live in `notes/` of the instance repository and are published with the app on its GitHub Pages site, where anyone can read them, and from M5 each gets a stable read-only URL. Private notes live in the private submodule repository and are never published in plaintext: they're sealed into the owner's **vault**, which opens in a browser with the owner's passphrase, and can be shared with named audiences through a link or passcode. Covers FIL-* and SHR-* in the [requirements](../product/requirements.md).

## The Files panel

Opened from **Open** in the [trigger toolbar](main-ui.html) (<kbd>Ctrl/⌘</kbd>+<kbd>O</kbd>). It's a transient overlay that closes after a note is opened, so the canvas stays blank. Its keyboard behavior follows Finder on macOS and Explorer on Windows ([Keyboard shortcuts → Files panel](keyboard-shortcuts.md#files-panel)). Until Git arrives (M3), each operation is one batch the app writes at once: on the desktop, deleted items go to the system trash; in the browser, they're kept, marked deleted. [What's built](../design/views/files.html#whats-built) lists what works today (D-94).

- **Two roots:** *Public* and *Private*. They map to the two content repositories (see [Repository and publishing](../architecture/repository-and-publishing.html)). Each note's visibility is clear from which root it sits under. In the browser there's a third root for the notes written in this browser, the only ones editable there; *Public* and, once unlocked, *Private* are read-only ([Web app](../architecture/web-app.md#three-kinds-of-note)).
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

### Links that follow

Renaming or moving a note or folder rewrites the relative links that point at it, in every note the app can write, in the same batch as the rename or move (FIL-09, D-95). The batch is written all or nothing, and in a Git workspace it's one commit (D-97).

- **What's rewritten:** inline links and images (`[t](../a/b.md)`, `![p](Box/pic.png)`), reference definitions (`[id]: b.md "Title"`), angle-bracket and percent-encoded destinations (`<My Note.md>`, `My%20Note.md`), and links to anything inside a moved folder. Fragments, queries, and titles stay (`b.md#steps` → `Box/b.md#steps`).
- **The moved notes' own links** are rewritten relative to where they go, so they reach the same files. Links between notes that move together don't change.
- **What isn't:** links inside code spans and code blocks, HTML, and front matter; absolute URLs, `mailto:`, links within the note (`#…`), and site-root links (`/…`). Links that would climb out of the workspace's root are left as they are.
- **Byte for byte:** only the characters of a changed destination change. Every other byte, including the parts of a destination that didn't change and how they were spelled, stays as it was.
- **Renames by title:** renaming a note in Files, and a file name that follows its title as it's typed (FIL-07), update links the same way.
- **The open note** shows its new links at once, keeping anything typed while the batch was written.
- **In the browser,** only the notes written there are rewritten; the instance's read-only notes are never read for this, let alone written.
- **A refusal** puts the links back together with the move: nothing changes on disk or in the browser's storage.
Commit messages are readable and consistent. For example: `Create notes/ideas.md`, `Move drafts/a.md → archive/a.md`, `Make private: journal/2026-10-13.md`.

## Public and private

Seed: *"The content can be made public or private. Private content are hosted in a private repo which is a submodule of the parent repo."*

| | Public note | Shared note | Private note |
| --- | --- | --- | --- |
| Stored in | The instance repository, `notes/` | The private repository, `private/notes/` | The private repository, `private/notes/` |
| Published on GitHub Pages | Yes, as a read-only page | Only as sealed (encrypted) files | Only sealed, in the owner's vault |
| Who can read it | Anyone with the URL | Named audiences, with a magic link or their name and passcode, and you | Only you (in a browser, with your vault passphrase) |
| Default for new notes | No | No | **Yes** (SHR-01, safe by default) |
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

### Sharing with people (SHR-05)

A private note or folder can be shared with an **audience**: a person or group identified only by a **name**, using a **magic link**, a **passcode** (your own or generated), or both, until an expiry or until you withdraw it. Shared notes stay in the private repository and are published only as ciphertext that the link or the name plus passcode opens. Your own access works the same way: the **vault** is a built-in grant for "You" that opens every private note with your vault passphrase (D-90). The full design is in [Sharing and visibility](../design/views/sharing.md), and the cryptography is in [Repository and publishing → Sealing](../architecture/repository-and-publishing.html#sealing-and-share-links) and [The vault](../architecture/repository-and-publishing.html#the-vault).

## Conflicts and offline

- **Desktop:** the app works on a local clone, so reading and writing work fully offline. Commits are made locally and pushed when the network is back. Before pushing it fetches, and if the same note changed elsewhere the writer chooses between **Keep mine**, **Take theirs**, and **Save mine as a copy**. Nothing is merged silently, and the repository is never left half-rebased ([Desktop and Git](../architecture/desktop-and-git.md#save-and-sync)).
- **Browser:** notes written there live only in that browser's IndexedDB and work offline, so there's nothing to conflict with. The instance's notes are read-only copies of the last deploy. Moving notes to the instance is an explicit export and import that keeps both versions on a name clash and deletes nothing ([Web app](../architecture/web-app.md#moving-notes-between-the-browser-and-github)).
- On the desktop, the trigger shows the save-problem state while changes are waiting, and *Save* (<kbd>Ctrl/⌘</kbd>+<kbd>S</kbd>) retries right away.

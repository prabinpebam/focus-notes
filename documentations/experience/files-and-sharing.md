# Files and sharing

Manage notes inside one project, then choose deliberately whether anything leaves it.

> [!NOTE]
> **TL;DR.** Files, search, moves and history stay in the current project. New note is immediate; **New note in…** chooses the place first. Titles and file names are separate. Pin folders and notes; return to recent files with their place. **Share…** on one note/folder opens its dialog directly, with no recipient names. **Publish…** makes a plain website. Browser writing and the owner vault are retired completely. This page summarizes the planned [3 November direction](../plan/next-direction.md), not the unchanged current build.

## The Files panel

**Open** in the [trigger toolbar](main-ui.html), Mod+O or Mod+Shift+E opens the project's Files tree and reveals the current note. It closes after opening a note unless docked. Docking the panel is different from pinning a folder shortcut.

| Region | What it contains |
| --- | --- |
| Project heading | Name, logo, backup state, Open local folder |
| Pinned | Shortcuts to real folders and notes; Unpin never deletes content |
| Recent | Files only, newest first, with folder location |
| Private | The project's private notes and sealed shares |
| Public (sharing enabled) | Explicitly published source in the site's repository |
| Recently deleted / Recovered | Restore Git history or crash drafts without overwriting newer text |

See [Files panel](../design/views/files.html) for the full interaction. [Projects](projects.md) owns project selection, Local notes, standalone files and People.

## Operations

| Operation | Behaviour | Requirements |
| --- | --- | --- |
| New note | Immediate in the current private folder or Private root; set name once on first save | FIL-01, FIL-18 |
| New note in… | Mod+Shift+N picks a project and folder first; Cancel writes nothing | FIL-17, KEY-09 |
| Edit title | Changes the first H1, never the file's path | FIL-18 |
| Rename file… | Changes path, not H1; updates incoming and outgoing relative links atomically | FIL-18, FIL-09 |
| New folder | Ctrl+Alt+N / ⌥⌘N, named inline; track empty folders with `.gitkeep` | FIL-02 |
| Move | Drag, cut/paste or Move to… stays inside the project; preview collisions, never overwrite | FIL-03, FIL-08, FIL-09 |
| Delete / Restore | Existing Undo and 30-day Recently deleted; folders/public items confirm consequences | FIL-05, FIL-10 |
| Import files… | Copy supported files into the chosen project folder; keep originals, no replacement | FIL-15 |
| Pin / Unpin | Keep a project/folder/note reachable without creating another copy | PRJ-07 |

### Links that follow

Explicit file/folder rename or move rewrites only relative link destinations pointing at the moved content, including links inside moved notes, in the same recoverable batch. Preserve all unrelated bytes, fragments, titles and query strings. Do not rewrite code, front matter or external URLs. Never introduce a public-to-private link. Editing an H1 alone no longer triggers file/link operations (FIL-07 superseded).

<h2 id="changing-visibility">Private, shared and public</h2>

| State | Stored in | Readable through |
| --- | --- | --- |
| Private | Private project repository | App and authorized GitHub project accounts; no website output |
| Shared | Private project plus sealed site output | Link or access code, read-only; anyone holding it may forward it |
| Public | Site repository | Plain website and public Git history |

New projects are **Private only**, with no site. The first share/publication explains and confirms the public site repository/Pages address before creating it. Published text and old copies cannot be recalled by later making it private. See [Sharing](../design/views/sharing.md).

## Share one item

1. Files row menu → **Share…** on one note or folder.
2. See its fixed name and counts; **Review contents** opens the read-only folder tree above the unchanged draft.
3. Choose expiry, Link/Passcode and generated/custom passcode. No recipient name, multi-item picker or “who”.
4. **Share…**, **Copy link**, **Copy access code** or **Copy share information** creates/updates that share and waits honestly for publication before delivering ready information.

Settings → Sharing lists **All shares** by item/expiry/state; extend and withdraw there. No Flow 2. Existing named grants are compatibility only until they end. Inviting an account with GitHub permissions is a separate [whole-project action](projects.md#people-in-a-project).

<h2 id="conflicts-and-offline">Offline, conflicts and recovery</h2>

Project writing continues in the local clone; offline changes queue without claiming backed up. Conflicts show both versions before choosing; never silently overwrite external edits or leave half a rebase. Local notes and standalone files have local journals but no Git safety net, so their state says Saved here / Local only.

The website is read-only, with its own site theme, not a browser app or ease-in plan. Old browser-only drafts must remain recoverable before [retiring the old runtime](../architecture/web-app.md); ordinary import remains independent of that retired funnel.

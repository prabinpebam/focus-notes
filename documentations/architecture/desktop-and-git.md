# Desktop and Git

How the Electron app is put together: processes, security, signing in through Git's own sign-in tools, creating a user's workspace, and saving notes as commits and pushes with the user's own `git`. It's the only client that writes to GitHub (D-90).

> [!NOTE]
> **TL;DR.** The desktop app is **the only GitHub editor** (PKG-03, D-90): the web app keeps its own notes in the browser and only reads the deployed site. The **main process** owns windows, the file system, Git, and setup. The **renderer** runs the same web app core as the browser build, and it reaches the main process only through a small, typed **preload bridge** that offers intent-level operations (such as `workspace.save`), never raw shell or Git. **Focus Notes has no OAuth app, no client ID, and no server** (D-21). Sign-in is done by tools the user already owns: **Git Credential Manager** or the **GitHub CLI**, both with a device-code option, or a **fine-grained token** the user creates on GitHub. Whatever signs Git in also gives the app its GitHub API access, so the app stores no credential of its own. A new user's whole instance (instance repository from the template, private repository, GitHub Pages, the read-only deploy key, and the **vault passphrase**, stored only as its derived key) is created **in their own GitHub account** by the app on their computer, or found and cloned if they made it from the template first; notes **exported from a browser** can be imported, private by default. Edits are written to disk within 1 s, and a **commit and push** happens on <kbd>Mod</kbd>+<kbd>S</kbd>, on switching or closing a note, on quit, or after 60 s of no typing (D-23). Git runs as separate processes, which are slow on Windows, so the app asks each repository what changed with **one cached `git status`**, never makes a view wait for it, and shows structural changes on screen **before** they're committed (PRF-07, PRF-09, D-66, D-68). Saving with Git is built (WP-3.3, D-97): only problems are shown, as the trigger's dot and one toast.

## Processes and security

| Part | Responsibilities | Not allowed |
| --- | --- | --- |
| **Main process** | Windows (shape, resize handles, snapping, state), app menu, running sign-in helpers, file reads and writes, file watching, running `git`, workspace creation | Rendering note content |
| **Preload bridge** | A typed API: `workspace.*` (built: `info`, `scan`, `renameNote`, `writeFormat`, `apply`, `onChange`), `sync.*` (built: `now`, `status`, `onStatus`), `auth.*` (detect, sign in, status, sign out), `window.*` (minimize, maximize, snap, close, full screen), `app.*` (open a note's web link (http, https, and mailto only), copy text, show in Finder or Explorer) | Exposing `ipcRenderer`, Node, or any generic exec |
| **Renderer** | The app core: editor, focus mode, Spotlight, theming, UI | Node access, network access except to `api.github.com` |

Security settings: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a strict Content Security Policy, navigation and new windows denied (external links open in the default browser), and only the app's own local files served. Every bridge call is checked for a valid workspace-relative path, so nothing outside the workspace can be read or written.

## Nothing hosted by the project

The owner's constraint (D-21) is that each user's Focus Notes must work entirely from things that user owns, with no registration and no service run by the project. That rules out an OAuth app (it needs the developer to register it) and any token-exchange server.

| Need | Provided by | Owned by |
| --- | --- | --- |
| Signing in to GitHub | Git Credential Manager or GitHub CLI (installed by the user), or a fine-grained token the user creates | The user |
| Storing the credential | The user's Git credential helper (OS keychain, Windows Credential Manager, or libsecret) | The user |
| Notes, private notes, themes, settings | The user's own GitHub repositories | The user |
| Publishing | The user's own GitHub Pages site, built by GitHub Actions in their repository | The user |
| The app | Installers on the project's GitHub Releases page, and the source on GitHub | Downloaded once. GitHub hosts it, the project runs nothing |
| Updates | GitHub Releases, checked by electron-updater | Same as above |

The app sends no telemetry and contacts no address other than `github.com`, `api.github.com`, and the user's own Pages site.

## Sign-in

The app never runs an OAuth flow of its own. It asks **Git** for a GitHub credential, and Git asks whichever sign-in helper the user has. All three paths end with Git able to push from both the app and the terminal (the owner's "sign-in at the CLI level").

| Path | When it's offered | How it works |
| --- | --- | --- |
| **Existing sign-in** | Always checked first | `git credential fill` for `github.com` with prompts turned off. If it returns a credential that GitHub accepts, setup offers *Continue as @login*. |
| **Git Credential Manager** (default on Windows, where it comes with Git for Windows) | GCM is the configured helper | The app runs `git credential fill` with prompts allowed. GCM shows its own GitHub sign-in: a browser sign-in, or a **device code** (the app passes the device-code mode for that one call when the user picks *Use a code instead*). GCM keeps the credential in the OS's secure storage. |
| **GitHub CLI** | `gh` is installed | The app runs `gh auth login --web --git-protocol https --scopes workflow` and reads the **one-time code** it prints, shows it in the app's own screen, and opens `github.com/login/device`. When `gh` finishes, the app runs `gh auth setup-git` so Git uses it as its credential helper. |
| **Fine-grained token** | Always available as an alternative | A button opens GitHub's token page with the fields **pre-filled** (GitHub's template links for fine-grained tokens): name "Focus Notes", the user's workspace and private repositories, and the permissions in the table below. The user creates it and pastes it. The app stores it with `git credential approve` in the user's secure helper. |

If no helper is installed (common on macOS and Linux), setup shows one-line install commands: for example `brew install --cask git-credential-manager` or `brew install gh` on macOS, and the distribution's `gh` package on Linux. The token path is offered alongside so nothing has to be installed.

### Getting API access

The app needs the GitHub REST API for a few things: listing and creating repositories, GitHub Pages status, deploy keys, and repository secrets. It takes the token from Git each time it needs one: `git credential fill`, or `gh auth token` when the GitHub CLI is the helper. It keeps it **in memory only**, never on disk, and asks again after a restart. There's one place the credential lives, and it belongs to the user.

### Permissions

| Path | Scopes or permissions |
| --- | --- |
| Git Credential Manager | GCM's own defaults for GitHub (they include `repo` and `workflow`) |
| GitHub CLI | `gh`'s defaults (including `repo`) plus `workflow`, which the app requests |
| Fine-grained token | Limited to the workspace and private repositories. Contents: read and write. Metadata: read. Pages: read and write. Administration: read and write (deploy keys). Secrets: read and write. Workflows: read and write. Creating new repositories needs account-level repository creation, or the user creates the two empty repositories first. |

### Signing out

**Settings → Account → Sign out** runs `git credential reject` for `github.com` (which removes GCM's or a token's stored credential), or `gh auth logout` when the GitHub CLI is the helper. The screen says that this signs out Git in the terminal too, and links to GitHub's settings to revoke a token or authorization completely.

## Creating a workspace

A new user gets an isolated, self-owned instance in their own account (FRE-08). Everything below runs in the app on their computer, using their credential. People who already copied the template and wrote in the browser keep their instance: the app finds that repository, clones it, and does only the steps still missing (usually the private repository, the deploy key, and the vault passphrase).

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Instance repository</p>
<p>Copied from the public <strong>template repository</strong> with GitHub's "generate from template" API, named by the user (default <code>notes</code>). It's public, because GitHub Pages on free accounts needs a public repository. It contains <code>notes/</code>, <code>.focus-notes/workspace.json</code>, and the <em>Deploy app</em> workflow, which deploys the released web app at a pinned version (D-87).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Private repository</p>
<p>Created empty and private (default <code>notes-private</code>), with a starter <code>README.md</code>, <code>notes/</code>, <code>.focus-notes/</code>, and <code>access.json</code>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Link them</p>
<p>The app clones the workspace, adds the private repository as the <code>private/</code> submodule, commits, and pushes, with the submodule settings described in <a href="repository-and-publishing.html#working-with-the-submodule">Repository and publishing</a>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Share-link key</p>
<p>The app generates an SSH key pair locally, adds the public key to the private repository as a <strong>read-only deploy key</strong>, and stores the private key as the instance repository's <code>PRIVATE_CONTENT_KEY</code> Actions secret. The secret is encrypted with the repository's public key (libsodium sealed box, as GitHub requires), then the local copy is deleted. The <em>Deploy app</em> workflow uses it to seal the vault and shared notes.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Vault passphrase</p>
<p>Asks for the passphrase that opens the private notes in a browser (SEC-08). A strength meter must reach "strong" (at least 12 characters, rated by zxcvbn-ts), and one line says: "If you forget it, it can't be recovered. Your notes stay in your private repository." The app derives its key (PBKDF2-SHA256, 600,000 iterations, a fresh 16-byte salt) and commits only the owner's grant, with that key, to <code>private/access.json</code>, never the passphrase (<a href="repository-and-publishing.html#the-vault">The vault</a>). Until this setup exists, the same grant is made by <code>node packages/seal/src/cli.ts vault-init --private private</code>, which reads the passphrase from standard input (never from arguments), refuses weak ones, and writes only the derived key.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Publishing</p>
<p>Turns on GitHub Pages for the instance repository with GitHub Actions as the source, and runs the <em>Deploy app</em> workflow. The instance's site, <code>https://&lt;user&gt;.github.io/&lt;repository&gt;/</code>, then serves the web app, the public notes, and the vault, so the user can read every note in a browser and write there too (notes written in a browser stay in it).</p>
</li>
</ol>

Every step can be retried on its own, and a failed step leaves a clear message ("Couldn't add the deploy key: the token needs Administration permission"). Publishing, share links, and the vault can be skipped and turned on later in **Settings → Workspace**, where the vault passphrase can also be changed.

## Importing notes from a browser

Notes written in a browser stay in that browser until they're moved (FRE-10, PKG-11). In the browser, *Export my notes…* saves them as one file, `focus-notes-export-<date>.json` ([Web app → Moving notes](web-app.md#moving-notes-between-the-browser-and-github)). The desktop app's first run offers to import one, and *Import notes…* in its ⋯ menu does it later:

1. The system's open dialog asks for the file, and only the main process reads it: a file over 64 MB is refused unread ("That file is too large to be a Focus Notes export"), and the rest is checked as `schemas/export-bundle.schema.json` describes (format `focus-notes/export/v1`, at most 20,000 notes). The window only learns how many notes it holds.
2. A dialog says how many notes and from which file, and asks where they go: **Private** is chosen ("Only you can read them."), or Public ("Anyone with the link will be able to read them once they're published.").
3. They're written into that root keeping their folders, with names made safe for every file system (no dot folders, no names Windows reserves). Nothing is replaced: a name that's taken, ignoring case, keeps both versions (`welcome 2.md`), and a note identical to the one at its path is skipped. The import is all or nothing, and one commit in that root's repository (`Import 2 notes`, each listed below), pushed like any other change. Nothing is deleted on either side: the browser keeps its copies until the user deletes them there (D-90, D-99).

## Running git

| Rule | Detail |
| --- | --- |
| The user's own `git` | Runs the `git` found on `PATH`, at least version 2.31, checked when a workspace opens (an older or missing Git keeps saving local). Hooks, `includeIf` configuration, commit signing (GPG or SSH), and `.gitattributes` all apply exactly as in the terminal. |
| Safe launching | Started with an argument list, never through a shell, and with `-C <repo>`. For background syncs the environment sets `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`, so no hidden prompt can hang the app. Prompts are only allowed during sign-in, which the user started. `GIT_DIR` and similar variables are removed, so nothing redirects a call. |
| Nothing private in arguments | Paths are passed on standard input (`--pathspec-from-file=- --pathspec-file-nul`), read literally (`GIT_LITERAL_PATHSPECS=1`, so a name with `*` is just a name), and the commit message is a file in the Git folder that's deleted after the commit. No note name, message, or credential appears in a process's arguments, which other users of the computer can see (SEC-03). |
| Readable output | Uses machine-readable output formats (`--porcelain=v2 -z`, `--format`), with `LC_ALL=C` where messages need parsing. |
| One at a time | One queue per repository (public and private), so commands never overlap within a repository. The two queues run in parallel. Each command has a timeout and can be cancelled. |
| No optional locks for reads | Read-only commands such as `git status` run with `GIT_OPTIONAL_LOCKS=0`, so they don't rewrite the index. A rewritten index would also invalidate the status cache. |
| Never skip hooks | `--no-verify` is never used. If a hook rejects a commit, its output is shown to the writer. |
| Signing that needs input | If commit signing needs a passphrase the app can't provide, the commit fails cleanly with an explanation and a link to set up a signing agent. |
| Credential expired | If a background push is refused for authentication, sync pauses, the trigger shows the problem state, and the toast offers [Sign in again], which runs the same helper. |
| Logs | Kept per device for troubleshooting. Tokens and private note text are redacted. As built, the main process writes only counts and problem names (`git-commit repo=private files=1`, `git-sync reasons=save problem=none`) to its standard output. |

## Asking Git what changed

Each Git command is a new process, and on Windows a process costs about 80 ms. Asking Git a dozen questions in sequence on every view would make every view slow, so the app asks once, caches the answer honestly, and never makes a view wait (PRF-07, D-66).

### One call per repository

```text
git -C <repo> status --porcelain=v2 --branch -z --untracked-files=all --ignore-submodules=dirty
```

- One call returns the branch, its upstream, how many commits it's ahead and behind, the head commit, and every changed file.
- The notes repository and `private/` are asked **in parallel**, each through its own queue, with `GIT_OPTIONAL_LOCKS=0`.
- `--ignore-submodules=dirty` hides edits inside `private/` from the notes repository's answer but still reports when the **submodule pointer itself** moved. Edits to private notes come from the separate `private/` call.
- **Things that never change** during a session are asked once and kept: each repository's root, the remote's URL, and the Git version. The head commit isn't asked separately; it comes with the status.

### The cache

The answer is cached per repository, under a key made of:

| Part of the key | Why |
| --- | --- |
| The content generation | A counter the workspace model increments on every write, so the app's own edits are seen at once |
| The modification time and size of Git's own files: `index`, `HEAD`, `logs/HEAD`, `packed-refs`, `FETCH_HEAD`, and the current branch's ref and its upstream ref | Catches commits, fetches, checkouts, and staging made by any tool, including the terminal. Both the worktree's Git folder and the common Git folder are checked, because a submodule's and a worktree's files are split between them. |
| A maximum age of 30 s | A safety net for anything the key misses |

### Keeping the cache honest

1. **Store only a stable answer.** The key is read before and after the call, and the answer is stored only if they match.
2. **Share calls in flight.** Two callers asking at the same moment share one Git process.
3. **Never store a failure.** A failed or timed-out call is reported, not cached.
4. **Always ask fresh before committing,** never from the cache. This matters most for a commit that might move the `private/` pointer (D-07).
5. **Clear after the app commits, pushes, pulls, or discards.**
6. **Builds, unit tests, and integration tests never use the cache.**

As built (D-97), each repository's first status is asked when Git opens, after the caret is ready, so the key knows the branch and upstream from then on. The benchmark records the Git processes per refresh (`PRF-07.statusProcesses`, two) and a cached answer's time (`PRF-07.cachedStatusMs`, budget 5 ms).

### Views never wait for Git

A view draws at once with the cached counts. If nothing is cached yet, the place that shows them says "Checking changes…", and the counts fill in when the call returns. Opening the Files panel, Settings, or Spotlight never starts with a Git call.

## Save and sync

```text
typing ──► write file (atomic, ≤ 1 s after the last change)
          │
          ├─ Ctrl/⌘+S, switching or closing a note, quitting, or 60 s with no typing
          ▼
        commit ──► push
```

1. **Write.** Each note is saved atomically: written to a temporary file, then renamed over the original. Disk never has a half-written note. A crash loses at most about a second of typing.
2. **Commit.** Changed notes are staged by path, never with `git add -A`: only the paths the app wrote or renamed since their last commit, staged and committed on their own (`git commit --only`), so changes the person staged in a terminal and files other programs changed are left alone. The commit message follows [Files and sharing](../experience/files-and-sharing.md#operations), for example `Update essays/on-focus.md`; a file name that followed its title is `Rename …`. Several notes changed in one sync window are committed together (`Update 3 notes`, listing each). The commit always starts from a fresh `git status`, never the cache ([Keeping the cache honest](#keeping-the-cache-honest)). The main process keeps the 60-second timer, restarted by every write (writes follow typing within a second); <kbd>Mod</kbd>+<kbd>S</kbd> and switching notes first collect text the editor hasn't sent yet, so what's on screen is what's committed.
3. **Private first.** If private notes changed, the private repository is committed and pushed first. The notes repository's pointer then moves to that pushed commit (D-07): at once the first time in a session, then at most once every 5 minutes (a timer picks up the latest), in any notes commit that's happening anyway, and on quit whatever the gap. A private commit that isn't pushed is never pointed to, unless neither repository has a remote.
4. **Push.** `git push` to the tracking branch (`push.default=upstream`); a branch without one stays local. A rejected (non-fast-forward) push fetches, rebases the app's own unpushed commits, and retries once. If that conflicts, the rebase is aborted so the repository is never left mid-rebase: the app's commits and the files stay as they were, the remote's version stays in its remote-tracking branch, and the trigger shows the problem, with [Resolve] on its toast, until the person settles it ([Settling a conflict](#settling-a-conflict)). The file watcher reads nothing while a rebase runs, so the half-applied files (conflict markers) never reach the editor.
5. **Pull.** A fetch runs when the window becomes active (at most every 30 s) and every 5 minutes, for the notes repository and for `private/` separately (D-47), with `--no-recurse-submodules`. If a branch is behind and its tracked files are clean, the app pulls it with rebase (no automatic stash); saves wait while the rebase rewrites files. `private/` always stays on `main` and is never reset to the publishing pointer. Open notes reload in place, keeping the caret where possible.
6. **Offline.** Commits pile up locally and the trigger shows its problem state (D-06). A retry runs after 30 s, doubling to 5 minutes, and with every later save; everything pushes in order once the network is back.
7. **Quit.** After the window has saved, quitting commits and pushes once more, waiting at most 15 s for each network call, then releases the [lock](#one-writer-at-a-time). Unpushed commits push next time.

`Ctrl/⌘+S` runs the commit and push right away and briefly shows "Saved and synced", or the reason it couldn't. Everything else is silent unless something goes wrong: a problem shows as the trigger's dot ("Couldn't sync") and one toast when it first appears, with [Retry] ([Feedback → Save and sync status](../design/components/feedback-and-dialogs.md#save-and-sync-status)). Without a repository, or without Git, saving stays local and there's no Git UI. The delays are configurable (D-23); until Settings has them, `FOCUS_NOTES_IDLE_COMMIT_MS` and `FOCUS_NOTES_POINTER_GAP_MS` set them, which the journey tests use.

### Settling a conflict

The resolver ([Feedback → Conflict resolver](../design/components/feedback-and-dialogs.md#conflict-resolver)) asks the main process for the notes in conflict, private repository first: the paths both sides changed since they parted (`git merge-base`, then `git diff --raw` each way) to different results, plus files with uncommitted changes that the other side changed too. This computer's version is the file as it is now; the other is read from the remote-tracking branch through `git cat-file --batch`, and when it was made from that branch's log. No note name is ever a process argument (SEC-03): revisions and paths go through standard input.

Settling, in each repository with a conflict (FIL-12, D-102):

1. The app's own unsaved paths and the conflicting files are committed first (`Update …`), so this computer's version is a commit.
2. The result is built in a temporary index (`FOCUS_NOTES_RESOLVE_INDEX` in the Git folder, removed after): the other version's tree, every change only this computer made, and each conflicting path as chosen, plus the copies that keep this computer's text. It's committed on top of the other version with `git commit-tree` (signed when `commit.gpgsign` is on), said as `Resolve conflict in notes/a.md` with each choice listed. "Take the other version" adds one more commit deleting its copy (`Delete notes/a-your-version-….md`), so the copy is in [Recently deleted](#recently-deleted).
3. The branch moves there in one step with `git reset --keep`, which changes only the files that differ and refuses (changing nothing) if one of them has other edits. Writes and the watcher wait meanwhile, as for a pull.
4. Then it syncs as usual: the push is a fast-forward of the remote.

History stays a line on top of the other version, as the rebase it replaces would have left it, so the other version stays in history, and nothing is merged automatically. Like a rebase, these commits don't run the repository's commit hooks. A repository with a conflict that has no choice yet is left as it is ("Decide later"): its commits wait on this computer, and the problem stays.

### Recently deleted

Recently deleted ([Files → Deleting and restoring](../design/views/files.html#whats-built)) is found from each repository's history: `git log --diff-filter=D -M --no-merges --since=<30 days>` lists deletions of notes under `notes/`, newest first and once per path, leaving out renames, moves between Public and Private (commits said as `Make public…` or `Make private…`, D-99), and notes that are back at their path. Each note's title is read from the commit before its deletion, through `git cat-file --batch`. Restoring writes that text back, never over a file, where the note was (or in its root if the folder is gone, or in a chosen folder of the same root), numbering a taken name, and commits it as `Restore notes/a.md` (FIL-10). In a partial clone, an old note's text is downloaded when it's first read.

## Changes shown before they're saved

Moving, deleting, creating, or duplicating notes and folders changes the screen **first**, then writes the files and commits (PRF-09, D-68).

- **Only order and presence.** Optimistic updates apply to changes that add, remove, or move notes and folders in the Files panel. Edits in place and renames that need a file name check go through the normal save. Moving or duplicating blocks inside a note needs nothing extra: the editor changes the document first and writes it within 1 s.
- **"Saved" means saved.** The row's saving sign stays until the write and, in a Git workspace, the commit have really finished. The toast's Undo is offered only then.
- **The reply confirms, it doesn't redraw.** When the bridge confirms, nothing visible changes: no spinner, no flash.
- **Read the current state when the reply arrives,** not when the change was made. Focus, scroll position, selection, and expanded folders are taken from the screen as it is at that moment.
- **Refusals put everything back and say why.** If the write or commit fails, the tree returns to how it was, focus goes back to the item, and a toast gives the reason with [Details] ([Files → Errors](../design/views/files.html)).
- **Where an item went is a pure function.** The workspace model's operations keep unchanged items as the same objects, so comparing old and new trees by identity tells a move (same object), a duplicate (an equal copy), and a new item apart. It's unit-tested.
- **One batch, all or nothing.** The Files panel sends each operation, however many items it covers, as one batch (`workspace.apply`: create folder, move, write, delete). The main process checks every path (inside a writable root, never the root, no dot folders, and not a workspace it mustn't write), creates folders (with a `.gitkeep`), moves items, and writes notes in order, waiting for writes already under way, and undoes the earlier steps if a later one fails. A write replaces the text of a note that's already there (at its path after the batch's moves), atomically, and is undone by writing the old text back: it carries the link updates of a rename or move (FIL-09, D-95), and a renamed note's new title. Deletes go last, to the system trash (`shell.trashItem`), and in a Git workspace they're also commits, so they can be recovered from history (FIL-05, FIL-10). A refusal comes back as a reason (`taken`, `notFound`, `readOnly`, `invalid`, `intoItself`, `trash`, `failed`) that the panel puts into words. A move between the Public and Private roots changes who can see a note, so the panel confirms it first; the main process makes the folders it needs in the other root (taken away again if the batch is undone) and moves it there in one step, because both roots are folders of the one workspace (FIL-06, D-99). In a Git workspace each batch is one commit in each repository it touches (`Move drafts/a.md → archive/a.md`, with "Update links in 2 notes" below), made before `workspace.apply` resolves; pushing follows in the background (D-97). If that commit fails (a hook, signing, Git not knowing the person's name), the files stay as the batch made them and it's shown as a sync problem.

### Moving between Public and Private

A move between the roots is a delete in one repository and an add in the other (FIL-06, SHR-02). The private repository's commit is made first, then the notes repository's, both said as the change (`Make private: notes/journal/2026-10-13.md`, or `Make 3 items public` with each listed); pushing follows, private first, and the notes repository's pointer then moves to the pushed private commit as in [Save and sync](#save-and-sync) (D-97). Nothing private reaches the public repository on the way:

- Each repository's commit stages only its own paths: the public side of *Make private* is only the delete.
- Nothing under `private/` is ever committed to the notes repository. Where `private/` isn't a repository of its own, private notes stay uncommitted instead (D-99).
- Links are rewritten only where they stay in their note's root, so a public note never gets a link naming a private note (FIL-09, D-99).

Making a note private doesn't take it out of the public repository's history, which the confirmation says ([Files and sharing → Changing visibility](../experience/files-and-sharing.md#changing-visibility)).

### Synced settings

*Sync appearance* in the ⋯ menu's Theme group (THM-05) stores the settings that follow you, the appearance, the light and dark themes, and the content font and its size, in `private/.focus-notes/settings.json` (`schemas/settings.schema.json`, D-46). Syncing is on while that file exists: the app reads it over this device's own choices when it starts and writes changes to it, committed with the next save in the private repository like a note. Turning it off keeps the current look on this device and deletes the file. The main process writes only what the schema allows, and the menu item shows only where the workspace has `private/`. The last note, focus mode, and the interface scale always stay on the device (PRV-03, D-99).

## Clones and large workspaces

- Clones use `git clone --filter=blob:none` (a partial clone). History is complete, which Recently deleted and note history need, but old file contents download only when someone asks for them. Large workspaces open quickly.
- The private submodule is cloned the same way and checked out on `main`.
- Windows: the app sets `core.longpaths=true` in the workspace. macOS: `core.precomposeunicode=true`, so file names stay in NFC. Workspaces created from the template include `.gitattributes` with `* text=auto eol=lf`.

## One writer at a time

The app, the [command-line tool](agents.md#command-line-tool), and the [MCP server](agents.md#mcp-server) can all change a workspace. They coordinate through a lock file, `.git/focus-notes.lock`, holding the owning process ID:

- While the desktop app is running, the MCP server and the command-line tool **send their changes through the app** over a local socket (a named pipe on Windows) instead of writing files themselves. That way the editor, the Spotlight index, and sync see each change straight away.
- When the app isn't running, they take the lock, use the same core library and Git rules, and release it when they're done.
- A stale lock (from a process that no longer exists) is taken over safely.

As built (D-97), the lock is `focus-notes.lock` in the notes repository's common Git folder (`.git/` in a normal clone), holding `{"pid": …}`. The app takes it when Git opens and releases it on quit; a lock whose process is gone, or that can't be read, is replaced in one rename and read back. While another running process holds it, the app commits nothing, shows the problem, and tries again with each sync. Git's own `index.lock` (a terminal `git` at work) makes a commit fail cleanly; it's retried with the next sync.
## External changes

The main process watches the notes folder with Node's own recursive `fs.watch` (no dependency, D-92), on its real path (on Windows, a short 8.3 folder name makes the watcher report wrong names). Git's files, folders and files starting with a dot, and the app's own temporary files aren't reported; `.focus-notes/workspace.json` is. Events are batched for 30 ms, each path is checked on disk, and one report goes to the app: notes and folders that appeared (with everything inside a new folder) or went away, each note with its title (its first H1, read from the first 16 KB, so the Files panel shows titles), and format changes. Changes made outside the app (another editor, a terminal `git pull`) update the workspace tree, and a changed format file is read again ([Content model → The workspace format](content-model.md#the-workspace-format)). An open note with no unsaved edits reloads quietly. If it does have unsaved edits, they're kept and **not saved over the file**: saves to that note wait, the toast says it changed outside Focus Notes with [Resolve], and saving, opening another note, or closing opens the conflict resolver, where every choice keeps the version not kept at the note as a copy (FIL-12, D-92, D-102). The app's own saves come back from the watcher too, and change nothing.

Updates go only where they matter (PRF-11). Each view model declares the content it shows (the canvas shows one note, by path; the Files panel, while open, shows the tree), and the watcher's batched events are matched against those declarations. A change to another note does no work: nothing is read and nothing redraws. The journey test measures the open note updating within 500 ms of the watcher's report.

A note's file name follows its title (FIL-07): after a save whose title changed, the app plans the new name in the workspace model and asks the main process to rename the file in its folder. The rename waits for writes to that file already under way, refuses to replace another note, and changes only the case in two steps through a temporary name. The editor keeps the note as it is; only its path changes. Git's own files aren't watched: a commit or fetch made in the terminal changes the [status cache](#the-cache)'s key, so the next status read (when the window becomes active, or at the 5-minute fetch) asks Git again, and only the places that show sync state update.

## Libraries (all MIT-compatible, see D-20)

| Need | Choice | License |
| --- | --- | --- |
| Desktop runtime | Electron | MIT |
| Packaging and updates | electron-builder, electron-updater | MIT |
| File watching | Node.js built-in `fs.watch` (recursive) | Not applicable |
| Encrypting the Actions secret | libsodium.js (sealed box) | ISC |
| SSH key generation | Node.js built-in crypto (Ed25519) | Not applicable |
| Search across files | ripgrep | MIT / Unlicense |
| Git | The user's own `git` (not shipped) | Not applicable |

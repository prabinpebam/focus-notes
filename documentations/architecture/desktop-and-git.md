# Desktop and Git

How the Electron app is put together: processes, security, signing in through Git's own sign-in tools, creating a user's workspace, and saving notes as commits and pushes with the user's own `git`.

> [!NOTE]
> **TL;DR.** The **main process** owns windows, the file system, Git, and setup. The **renderer** runs the same web app core as the browser build, and it reaches the main process only through a small, typed **preload bridge** that offers intent-level operations (such as `workspace.save`), never raw shell or Git. **Focus Notes has no OAuth app, no client ID, and no server** (D-21). Sign-in is done by tools the user already owns: **Git Credential Manager** or the **GitHub CLI**, both with a device-code option, or a **fine-grained token** the user creates on GitHub. Whatever signs Git in also gives the app its GitHub API access, so the app stores no credential of its own. A new user's whole setup (workspace repository, private repository, GitHub Pages, share-link keys) is created **in their own GitHub account** by the app on their computer. Edits are written to disk within 1 s, and a **commit and push** happens on <kbd>Mod</kbd>+<kbd>S</kbd>, on switching or closing a note, on quit, or after 60 s of no typing (D-23).

## Processes and security

| Part | Responsibilities | Not allowed |
| --- | --- | --- |
| **Main process** | Windows (shape, resize handles, snapping, state), app menu, running sign-in helpers, file reads and writes, file watching, running `git`, workspace creation | Rendering note content |
| **Preload bridge** | A typed API: `workspace.*` (tree, read, save, move, delete, create), `sync.*` (status, sync now), `auth.*` (detect, sign in, status, sign out), `window.*` (minimize, maximize, snap, close, full screen), `app.*` (open external link, show in Finder or Explorer) | Exposing `ipcRenderer`, Node, or any generic exec |
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

A new user gets an isolated, self-owned setup in their own account (FRE-08). Everything below runs in the app on their computer, using their credential.

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Workspace repository</p>
<p>Created from the public <strong>workspace template</strong> repository with GitHub's "generate from template" API, named by the user (default <code>notes</code>). It's public, because GitHub Pages on free accounts needs a public repository. It contains <code>content/</code>, <code>.focus-notes/</code>, and a publish workflow.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Private repository</p>
<p>Created empty and private (default <code>notes-private</code>), with a starter <code>README.md</code> and <code>access.json</code>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Link them</p>
<p>The app clones the workspace, adds the private repository as the <code>private/</code> submodule, commits, and pushes, with the submodule settings described in <a href="repository-and-publishing.html#working-with-the-submodule">Repository and publishing</a>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Share-link key</p>
<p>The app generates an SSH key pair locally, adds the public key to the private repository as a <strong>read-only deploy key</strong>, and stores the private key as the workspace repository's <code>PRIVATE_CONTENT_KEY</code> Actions secret. The secret is encrypted with the repository's public key (libsodium sealed box, as GitHub requires), then the local copy is deleted.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Publishing</p>
<p>Turns on GitHub Pages for the workspace repository with GitHub Actions as the source, and runs the first publish. The public site is <code>https://&lt;user&gt;.github.io/&lt;workspace&gt;/</code>.</p>
</li>
</ol>

Every step can be retried on its own, and a failed step leaves a clear message ("Couldn't add the deploy key: the token needs Administration permission"). Publishing and share links can be skipped and turned on later in **Settings → Workspace**.

## Running git

| Rule | Detail |
| --- | --- |
| The user's own `git` | Runs the `git` found on `PATH`, at a minimum supported version checked during setup. Hooks, `includeIf` configuration, commit signing (GPG or SSH), and `.gitattributes` all apply exactly as in the terminal. |
| Safe launching | Started with an argument list, never through a shell, and with `-C <repo>`. For background syncs the environment sets `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`, so no hidden prompt can hang the app. Prompts are only allowed during sign-in, which the user started. |
| Readable output | Uses machine-readable output formats (`--porcelain=v2 -z`, `--format`), with `LC_ALL=C` where messages need parsing. |
| One at a time | One queue per repository (public and private), so commands never overlap. Each has a timeout and can be cancelled. |
| Never skip hooks | `--no-verify` is never used. If a hook rejects a commit, its output is shown to the writer. |
| Signing that needs input | If commit signing needs a passphrase the app can't provide, the commit fails cleanly with an explanation and a link to set up a signing agent. |
| Credential expired | If a background push is refused for authentication, sync pauses, the trigger shows the problem state, and the toast offers [Sign in again], which runs the same helper. |
| Logs | Kept per device for troubleshooting. Tokens and private note text are redacted. |

## Save and sync

```text
typing ──► write file (atomic, ≤ 1 s after the last change)
          │
          ├─ Ctrl/⌘+S, switching or closing a note, quitting, or 60 s with no typing
          ▼
        commit ──► push
```

1. **Write.** Each note is saved atomically: written to a temporary file, then renamed over the original. Disk never has a half-written note. A crash loses at most about a second of typing.
2. **Commit.** Changed notes are staged by path, never with `git add -A`. The commit message follows [Files and sharing](../experience/files-and-sharing.md#operations), for example `Update essays/on-focus.md`. Several notes changed in one sync window are committed together.
3. **Private first.** If private notes changed, the private repository is committed and pushed first. The public repository's pointer to it moves only as described in D-07.
4. **Push.** `git push` to the tracking branch. A rejected (non-fast-forward) push fetches, rebases the app's own unpushed commits, and retries once. If that conflicts, the rebase is aborted so the repository is never left mid-rebase, and the note-level conflict choice is shown ([Files and sharing](../experience/files-and-sharing.md#conflicts-and-offline)).
5. **Pull.** A fetch runs when the window becomes active and every 5 minutes, for the notes repository and for `private/` separately (D-47). If a branch is behind and its working tree is clean, the app pulls it with rebase. `private/` always stays on `main` and is never reset to the publishing pointer. Open notes reload in place, keeping the caret where possible.
6. **Offline.** Commits pile up locally and the trigger shows its save-problem state (D-06). Everything pushes in order once the network is back.

`Ctrl/⌘+S` runs the commit and push right away and briefly shows "Saved and synced", or the reason it couldn't.

## Clones and large workspaces

- Clones use `git clone --filter=blob:none` (a partial clone). History is complete, which Recently deleted and note history need, but old file contents download only when someone asks for them. Large workspaces open quickly.
- The private submodule is cloned the same way and checked out on `main`.
- Windows: the app sets `core.longpaths=true` in the workspace. macOS: `core.precomposeunicode=true`, so file names stay in NFC. Workspaces created from the template include `.gitattributes` with `* text=auto eol=lf`.

## One writer at a time

The app, the [command-line tool](agents.md#command-line-tool), and the [MCP server](agents.md#mcp-server) can all change a workspace. They coordinate through a lock file, `.git/focus-notes.lock`, holding the owning process ID:

- While the desktop app is running, the MCP server and the command-line tool **send their changes through the app** over a local socket (a named pipe on Windows) instead of writing files themselves. That way the editor, the Spotlight index, and sync see each change straight away.
- When the app isn't running, they take the lock, use the same core library and Git rules, and release it when they're done.
- A stale lock (from a process that no longer exists) is taken over safely.
## External changes

A file watcher (chokidar, MIT) watches the workspace, excluding `.git/`. Changes made outside the app (another editor, a terminal `git pull`) refresh the Files panel and the Spotlight index. An open note with no unsaved edits reloads quietly. If it does have unsaved edits, the writer gets the *Keep mine / Take theirs / Save mine as a copy* choice.

## Libraries (all MIT-compatible, see D-20)

| Need | Choice | License |
| --- | --- | --- |
| Desktop runtime | Electron | MIT |
| Packaging and updates | electron-builder, electron-updater | MIT |
| File watching | chokidar | MIT |
| Encrypting the Actions secret | libsodium.js (sealed box) | ISC |
| SSH key generation | Node.js built-in crypto (Ed25519) | Not applicable |
| Search across files | ripgrep | MIT / Unlicense |
| Git | The user's own `git` (not shipped) | Not applicable |

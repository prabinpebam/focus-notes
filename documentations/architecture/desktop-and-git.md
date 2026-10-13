# Desktop and Git

How the Electron app is put together: processes, security, the device-flow sign-in, sharing credentials with git, and saving notes as commits and pushes with the user's own `git`.

> [!NOTE]
> **TL;DR.** The **main process** owns windows, the file system, the sign-in, and a queue of `git` commands. The **renderer** runs the same web app core as the browser build, and it reaches the main process only through a small, typed **preload bridge** that offers intent-level operations (such as `workspace.save`), never raw shell or Git. Sign-in is GitHub's **OAuth device flow**: it needs a public client ID and no secret. The token is saved in the OS's secure storage *and* in git's credential helper, so the app and the terminal push the same way. Edits are written to disk within 1 s, and a **commit and push** happens on <kbd>Mod</kbd>+<kbd>S</kbd>, on switching or closing a note, on quit, or after 60 s of no typing (D-23).

## Processes and security

| Part | Responsibilities | Not allowed |
| --- | --- | --- |
| **Main process** | Windows (shape, resize handles, state), app menu, sign-in, credential storage, file reads and writes, file watching, running `git` | Rendering note content |
| **Preload bridge** | A typed API: `workspace.*` (tree, read, save, move, delete), `sync.*` (status, sync now), `auth.*` (start sign-in, status, sign out), `window.*` (minimize, maximize, close, full screen), `app.*` (open external link, show in Finder or Explorer) | Exposing `ipcRenderer`, Node, or any generic exec |
| **Renderer** | The app core: editor, focus mode, Spotlight, theming, UI | Node access, network access except to `api.github.com` |

Security settings: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, a strict Content Security Policy, navigation and new windows denied (external links open in the default browser), and only the app's own local files served. Every bridge call is checked for a valid workspace-relative path, so nothing outside the workspace can be read or written.

## Sign-in

A **GitHub OAuth App** named "Focus Notes", owned by the project, with **Device Flow enabled** in its settings. Its client ID ships in the app. The device flow doesn't use a client secret, so nothing secret is embedded ([D-21](../plan/decisions.md) covers the scope trade-off).

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Request a code</p>
<p><code>POST https://github.com/login/device/code</code> with <code>client_id</code> and <code>scope=repo workflow</code>. The response has <code>device_code</code>, <code>user_code</code>, <code>verification_uri</code>, <code>expires_in</code>, and <code>interval</code>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Show and open</p>
<p>The renderer shows <code>user_code</code>. The main process copies it to the clipboard and opens <code>verification_uri</code> in the default browser.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Poll</p>
<p><code>POST https://github.com/login/oauth/access_token</code> with <code>client_id</code>, <code>device_code</code>, and <code>grant_type=urn:ietf:params:oauth:grant-type:device_code</code>, every <code>interval</code> seconds. <code>authorization_pending</code> means keep waiting. <code>slow_down</code> means add 5 s to the interval. <code>expired_token</code> means get a new code. <code>access_denied</code> means stop and show the decline screen.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Verify</p>
<p><code>GET https://api.github.com/user</code> with the token returns the login, ID, name, and avatar for the confirmation screen and the identity step.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Store twice</p>
<p>Saved to the app's secure storage (Electron <code>safeStorage</code>). If the user agreed, also saved to git (see below). Then <code>git ls-remote</code> on the workspace, with prompts turned off, proves that Git can authenticate.</p>
</li>
</ol>

**Scopes.** `repo` is needed to read and write private repositories. `workflow` is also requested, because the same credential is used by the terminal, and GitHub refuses pushes that change `.github/workflows/` without it. The app's own commits never touch workflow files.

**Device flow runs only in the desktop app.** GitHub's device-flow endpoints don't send cross-origin (CORS) headers, so a browser page can't call them. The web build uses a personal access token instead (D-13).

### Sharing the credential with git

```text
git credential approve
protocol=https
host=github.com
username=<login>
password=<token>
```

- The credential is passed to `git credential approve` on standard input and never on the command line, so it doesn't show up in process lists. Git hands it to the user's configured helper: Git Credential Manager, `osxkeychain`, or `libsecret`.
- If `credential.helper` isn't set, the app offers to set a secure helper for the platform. It never sets up `store`, which saves passwords in plain text.
- **Sign out** runs `git credential reject` with the same protocol, host, and username, and deletes the app copy.
- With "Also sign in Git on this computer" off, the app passes the token to its own commands through a temporary `GIT_ASKPASS` script that reads it over IPC. Nothing is written to the user's Git configuration.

## Running git

| Rule | Detail |
| --- | --- |
| The user's own `git` | Runs the `git` found on `PATH`, at a minimum supported version checked during setup. Hooks, `includeIf` configuration, commit signing (GPG or SSH), and `.gitattributes` all apply exactly as in the terminal. |
| Safe launching | Started with an argument list, never through a shell, and with `-C <repo>`. The environment sets `GIT_TERMINAL_PROMPT=0` and `GCM_INTERACTIVE=never`, so no hidden prompt can hang the app. |
| Readable output | Uses machine-readable output formats (`--porcelain=v2 -z`, `--format`), with `LC_ALL=C` where messages need parsing. |
| One at a time | One queue per repository (public and private), so commands never overlap. Each has a timeout and can be cancelled. |
| Never skip hooks | `--no-verify` is never used. If a hook rejects a commit, its output is shown to the writer. |
| Signing that needs input | If commit signing needs a passphrase the app can't provide, the commit fails cleanly with an explanation and a link to set up a signing agent. |
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
5. **Pull.** A fetch runs when the window becomes active and every 5 minutes. If the branch is behind and the working tree is clean, the app pulls with rebase and submodules. Open notes reload in place, keeping the caret where possible.
6. **Offline.** Commits pile up locally and the trigger shows its save-problem state (D-06). Everything pushes in order once the network is back.

`Ctrl/⌘+S` runs the commit and push right away and briefly shows "Saved and synced", or the reason it couldn't.

## External changes

A file watcher (chokidar, MIT) watches the workspace, excluding `.git/`. Changes made outside the app (another editor, a terminal `git pull`) refresh the Files panel and the Spotlight index. An open note with no unsaved edits reloads quietly. If it does have unsaved edits, the writer gets the *Keep mine / Take theirs / Save mine as a copy* choice.

## Libraries (all MIT-compatible, see D-20)

| Need | Choice | License |
| --- | --- | --- |
| Desktop runtime | Electron | MIT |
| Packaging and updates | electron-builder, electron-updater | MIT |
| File watching | chokidar | MIT |
| Search across files | ripgrep | MIT / Unlicense |
| Git | The user's own `git` (not shipped) | Not applicable |

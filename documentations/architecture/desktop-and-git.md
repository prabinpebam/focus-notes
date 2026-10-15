# Desktop and Git

How the Electron app is put together: processes, security, signing in through Git's own sign-in tools, creating a user's workspace, and saving notes as commits and pushes with the user's own `git`. It's the only client that writes to GitHub (D-90).

> [!NOTE]
> **TL;DR.** The desktop app is **the only GitHub editor** (PKG-03, D-90): the web app keeps its own notes in the browser and only reads the deployed site. The **main process** owns windows, the file system, Git, and setup. The **renderer** runs the same web app core as the browser build, and it reaches the main process only through a small, typed **preload bridge** that offers intent-level operations (such as `workspace.save`), never raw shell or Git. **Focus Notes has no OAuth app, no client ID, and no server** (D-21). Sign-in is done by tools the user already owns: **Git Credential Manager** or the **GitHub CLI**, both with a device-code option, or a **fine-grained token** the user creates on GitHub. Whatever signs Git in also gives the app its GitHub API access, so the app stores no credential of its own. A new user's whole instance (instance repository from the template, private repository, GitHub Pages, the read-only deploy key, and the **vault passphrase**, stored only as its derived key) is created **in their own GitHub account** by the app on their computer, or found and cloned if they made it from the template first; notes **exported from a browser** can be imported, private by default. Edits are written to disk within 1 s, and a **commit and push** happens on <kbd>Mod</kbd>+<kbd>S</kbd>, on switching or closing a note, on quit, or after 60 s of no typing (D-23). Git runs as separate processes, which are slow on Windows, so the app asks each repository what changed with **one cached `git status`**, never makes a view wait for it, and shows structural changes on screen **before** they're committed (PRF-07, PRF-09, D-66, D-68). Saving with Git is built (WP-3.3, D-97): only problems are shown, as the trigger's dot and one toast. The setup engine that creates the instance is built too (WP-3.1, D-98): nine steps, each idempotent and retryable on its own, with progress that survives quitting.

## Processes and security

| Part | Responsibilities | Not allowed |
| --- | --- | --- |
| **Main process** | Windows (shape, resize handles, snapping, state), app menu, running sign-in helpers, file reads and writes, file watching, running `git`, workspace creation (the setup engine, the only code that calls `api.github.com`) | Rendering note content |
| **Preload bridge** | A typed API: `workspace.*` (built: `info`, `scan`, `renameNote`, `writeFormat`, `apply`, `onChange`), `sync.*` (built: `now`, `status`, `onStatus`), `setup.*` (built: `status`, `start`, `retry`, `reset`, `passphraseStrength`, `onReport`), `auth.*` (detect, sign in, status, sign out), `window.*` (built on Windows and Linux, D-104: `state`, `onState`, `onMenu`, `minimize`, `maximize`, `restore`, `close`, `snap`, `drag`, `keyboard`, `key`; full screen is `toggleFullScreen`), `app.*` (open a note's web link (http, https, and mailto only), copy text, show in Finder or Explorer) | Exposing `ipcRenderer`, Node, or any generic exec |
| **Renderer** | The app core: editor, focus mode, Spotlight, theming, UI | Node access, network access except to `api.github.com` |

Security settings: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` (and the same for the snap preview, the one other window, which loads nothing, runs no JavaScript, and never takes focus or the pointer, D-104), a strict Content Security Policy, navigation and new windows denied (external links open in the default browser), and only the app's own local files served. Every bridge call is checked for a valid workspace-relative path, so nothing outside the workspace can be read or written.

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
| **Existing sign-in** | Always checked first | `git credential fill` for `github.com` with prompts turned off. If it returns a credential that `GET /user` accepts, the first run offers *Continue as @login* and no device code. Otherwise, if the GitHub CLI is signed in (`gh auth token`), that account is offered the same way, and *Continue* runs `gh auth setup-git` so Git uses it too (FRE-04). |
| **Git Credential Manager** (default on Windows, where it comes with Git for Windows) | GCM is the configured helper (`manager`, `manager-core`, or its path) | The app runs GCM's own `git-credential-manager github login --browser`, or `--device` for *Use a code instead*. The program is found on `PATH` or in Git's own folders (`git --exec-path`, where Git for Windows keeps it). GCM signs in with its own window; when it prints a code, the app shows it, otherwise it says "Enter the code shown by Git Credential Manager". GCM keeps the credential in the OS's secure storage. |
| **GitHub CLI** | `gh` is installed and GCM isn't the helper | The app runs `gh auth login --web --hostname github.com --git-protocol https --scopes workflow` with its prompts off, reads the **one-time code** it prints, and shows it in large type with *Copy code and open GitHub* (`github.com/login/device`). When `gh` finishes, the app runs `gh auth setup-git` so Git uses it as its credential helper. |
| **Fine-grained token** | Always available as an alternative | *Create a token on GitHub* opens GitHub's token page with its fields **pre-filled** by URL: name "Focus Notes", a description, 90 days, and Contents, Administration, Pages, Secrets, and Workflows set to read and write. The user chooses the repositories (a link can't), creates it, and pastes it. The main process checks it with `GET /user`, then gives it to the user's helper with `git credential approve` on standard input. If Git doesn't answer with it afterwards (no helper keeps it), it's refused: the app never sets up the plaintext `store` helper. |

Sign-in programs are started with an argument list of fixed words (never a token, name, or path) and never through a shell; on Windows a `.cmd` shim from a package manager runs through `cmd.exe` with only those words. Their prompts are off (`GIT_TERMINAL_PROMPT=0`, `GH_PROMPT_DISABLED=1`). A sign-in that ends without an account says why: **declined** on GitHub, the code **expired** (also after 16 minutes), GitHub **offline**, the token **invalid**, **no helper** to keep a token, or **failed**. Each offers *Try again* without restarting, and *Cancel* or <kbd>Esc</kbd> stops a sign-in that's waiting (D-101).

If no helper is installed (common on macOS and Linux), setup shows one-line install commands: for example `brew install --cask git-credential-manager` or `brew install gh` on macOS, and the distribution's `gh` package on Linux. The token path is offered alongside so nothing has to be installed.

### Getting API access

The app needs the GitHub REST API for a few things: listing and creating repositories, GitHub Pages status, deploy keys, and repository secrets. It takes the token from Git when it first needs one in a session: `git credential fill` (which asks the GitHub CLI too when it's Git's helper). It keeps it **in the main process's memory only**, never on disk or in the renderer, and asks again after a restart or after GitHub refuses it. There's one place the credential lives, and it belongs to the user.

### Permissions

| Path | Scopes or permissions |
| --- | --- |
| Git Credential Manager | GCM's own defaults for GitHub (they include `repo` and `workflow`) |
| GitHub CLI | `gh`'s defaults (including `repo`) plus `workflow`, which the app requests |
| Fine-grained token | Limited to the workspace and private repositories. Contents: read and write. Metadata: read. Pages: read and write. Administration: read and write (deploy keys). Secrets: read and write. Workflows: read and write. Creating new repositories needs account-level repository creation, or the user creates the two empty repositories first. |

### Signing out

*Sign out of GitHub*, in the account pill's menu or **Settings → Account**, asks first (FRE-07, D-103). With *Remove it too* (the default) it runs `git credential reject` for `github.com` and the login (which removes GCM's or a token's stored credential), and `gh auth logout` too when the GitHub CLI is the helper; the toast says this signs Git out in the terminal too. With *Keep it for the terminal*, Git's credential stays and `account.json` in the app's data folder records only that Focus Notes is signed out: the main process then offers Git's account but doesn't use it (no API calls) until *Continue as @login*, and Git itself, which the workspace's sync runs, keeps its sign-in. Either way the main process deletes setup's progress and the first run's workspace identity and empties Chromium's caches, and the app forgets the recent note ([Data inventory](security-and-privacy.md#data-inventory)). Settings links to GitHub's settings to revoke a token or authorization completely.

*Switch account* takes the credential out of Git's helper (`git credential reject`; with the GitHub CLI as the helper nothing is taken out, since `gh auth login` adds and switches accounts itself), keeps it in memory, and shows the first run's Connect step alone; if no account signs in, it goes back with `git credential approve` on standard input.

### The workspace folder

The first run's workspace is the main process's to choose, never the renderer's (D-98): a new or cloned workspace goes in a folder named after its repository, `Documents/<name>` (the instance's name as entered in setup, or the repository opened; the first free `<name> 2`, `<name> 3` when that one has other files; trailing dots dropped and Windows device names given `-notes`; D-155), or in a folder picked with the system's dialog, which must be empty or new. Setup decides a folder it chose when *Download to this computer* runs, never a folder used on this computer only, and never renames or moves an existing folder (D-154, D-155). The notes folder of *Just use this computer for now*, which has no repository, stays `Documents/Focus Notes`; *Open a folder* picks an existing clone the same way, and it must be a clone's top folder with `.focus-notes/workspace.json`. Cloning fetches `private/` (on `main`, with `push.recurseSubmodules=check`) when the account can reach it; otherwise the workspace has public notes only, and no *Private* root. Once chosen, the folder is kept in `workspace.json` in the app's data folder, the file watcher and Git move to it, and the window changes to it in place, never by reloading the page (DSK-09, D-148).

**Removing it** (Settings → Workspace, D-103) applies only to a Focus Notes workspace (with `.focus-notes/workspace.json`). It checks both repositories with Git: `git status --porcelain --untracked-files=all` (the notes repository ignoring the submodule's own changes, which are counted in `private/`), `git log --branches --not --remotes`, and `git stash list`, and a repository with no remote. Only when all are empty does it remove anything, and the main process checks again itself, stops the watcher and Git (releasing the lock), deletes the folder, deletes `workspace.json`, `setup.json`, and `first-run.json`, and starts the window again with no workspace, at the first run's *Your notes* step. Nothing on GitHub is touched.

## Creating a workspace

A new user gets an isolated, self-owned instance in their own account (FRE-08). Everything below runs in the app on their computer, using their credential. People who already copied the template and wrote in the browser keep their instance: the app finds that repository, clones it, and does only the steps still missing (usually the private repository, the deploy key, and the vault passphrase).

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">1. Sign in</p>
<p>The token comes from Git's credential helper (<code>git credential fill</code> for <code>github.com</code>, prompts off) and stays in memory; <code>GET /user</code> gives the account. Without a credential the step fails as <em>signed out</em>, and the first run's sign-in screen takes over (WP-3.2).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">2. Copy the template</p>
<p>The instance repository, made from the public <strong>template repository</strong> <code>focus-notes-workspace</code> with GitHub's "generate from template" API, named by the user (default <code>notes</code>), public because GitHub Pages on free accounts needs it. It holds <code>notes/</code>, <code>.focus-notes/workspace.json</code>, <code>AGENTS.md</code>, a README, and the <em>Deploy app</em> workflow (D-87). If the account already has a repository by that name with <code>.focus-notes/workspace.json</code> (made in the browser first), it's used as it is; any other repository by that name is refused.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">3. Create private repository</p>
<p>Private, with a README so it has a <code>main</code> branch (default <code>notes-private</code>). An existing private repository by that name is used; a <strong>public</strong> one is refused, never used for private notes.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">4. Set up the deploy key</p>
<p>The app makes an Ed25519 key pair in memory, adds the public half to the private repository as a <strong>read-only deploy key</strong> titled "Focus Notes publishing", and stores the private half, in OpenSSH's format, as the instance repository's <code>PRIVATE_CONTENT_KEY</code> Actions secret, sealed to the repository's public key (libsodium's sealed box, as GitHub requires; tweetnacl and BLAKE2b). It's one step so the private half is never kept between steps; retrying it deletes the key an interrupted run left and makes a new pair. The <em>Deploy app</em> workflow uses it to check out <code>private/</code> and seal the vault and shared notes.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">5. Download to this computer</p>
<p>Clones the instance into the chosen folder, which must be missing, empty, or already that clone.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">6. Link them</p>
<p>Adds the private repository as the <code>private/</code> submodule tracking <code>main</code>, checks it out on <code>main</code>, sets <code>push.recurseSubmodules=check</code>, adds a starter <code>notes/</code> folder to it, and commits both (<em>Start private notes</em>, <em>Link private notes</em>), as described in <a href="repository-and-publishing.html#working-with-the-submodule">Repository and publishing</a>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">7. Save the vault's key</p>
<p>Uses the vault passphrase the person typed (SEC-08), which must be strong (<code>passphraseStrength</code> in <code>packages/seal</code>: at least 12 characters, rated strong), with one line: "If you forget it, it can't be recovered. Your notes stay in your private repository." The app derives its key (PBKDF2-SHA256, 600,000 iterations, a fresh 16-byte salt) and commits only the owner's grant, with that key, to <code>private/access.json</code> (<em>Add the vault's key</em>), never the passphrase (<a href="repository-and-publishing.html#the-vault">The vault</a>). Without a passphrase the step is <em>skipped</em> and can be run later; a private repository that already has a vault keeps it. <code>node packages/seal/src/cli.ts vault-init --private private</code> makes the same grant from a terminal, through the same code.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">8. Turn on GitHub Pages</p>
<p>Turns on Pages for the instance repository with GitHub Actions as the source (or switches an existing site to it) and records the site's address, <code>https://&lt;user&gt;.github.io/&lt;repository&gt;/</code>. Skipped when the person turns publishing off.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">9. Save to GitHub</p>
<p>Pushes the private repository, moves the instance's pointer to that commit (<em>Update private notes to …</em>), and pushes the instance, private first. Because Pages is already on, this push runs the <em>Deploy app</em> workflow, so the site then serves the web app, the public notes, and the vault.</p>
</li>
</ol>

Each step reports **pending**, **running**, **done**, **failed** with a problem code (for example *permission*: "Your sign-in doesn't allow this…"), or **skipped**, and can be retried on its own once the steps before it are done; retrying a done step changes nothing. Every step is idempotent: it looks first, then does only what's missing, so a setup that stopped anywhere runs again safely. Progress is kept in `setup.json` in the app's data folder (names, the folder, the login, the site's address, and step states, never the token, passphrase, or key), so quitting halfway resumes at the same step, and a step that was running when the app quit runs again. The engine is in the desktop's main process (`apps/desktop/src/main/setup/`), its types in `packages/core` (`setup.ts`), and the app shows it as `vm.setup` (D-98). Publishing, share links, and the vault can be skipped and turned on later in **Settings → Workspace**, where the vault passphrase can also be changed.

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
          ├─ Save to cloud (Ctrl/⌘+Shift+S or Ctrl/⌘+S), quitting, or enough change (D-133)
          ▼
        commit ──► push
```

1. **Write.** Each note is saved atomically: written to a temporary file, then renamed over the original. Disk never has a half-written note. A crash loses at most about a second of typing: unsaved text is kept in a recovery journal in the app's data folder and put back at the next launch ([Performance and quality → Reliability](performance-and-quality.md#reliability), D-105).
2. **Commit.** Changed notes are staged by path, never with `git add -A`: only the paths the app wrote or renamed since their last commit, staged and committed on their own (`git commit --only`), so changes the person staged in a terminal and files other programs changed are left alone. The commit message follows [Files and sharing](../experience/files-and-sharing.md#operations), for example `Update essays/on-focus.md`; a file name that followed its title is `Rename …`. Several notes changed in one sync window are committed together (`Update 3 notes`, listing each). The commit always starts from a fresh `git status`, never the cache ([Keeping the cache honest](#keeping-the-cache-honest)). When to commit is [the backup policy](#when-to-back-up) (D-133); *Save to cloud* and switching notes first collect text the editor hasn't sent yet, so what's on screen is what's committed.
3. **Private first.** If private notes changed, the private repository is committed and pushed first. The notes repository's pointer then moves to that pushed commit (D-07): at once the first time in a session, then at most once every 5 minutes (a timer picks up the latest), in any notes commit that's happening anyway, and on quit whatever the gap. A private commit that isn't pushed is never pointed to, unless neither repository has a remote.
4. **Push.** `git push` to the tracking branch (`push.default=upstream`); a branch without one stays local. A rejected (non-fast-forward) push fetches, rebases the app's own unpushed commits, and retries once. If that conflicts, the rebase is aborted so the repository is never left mid-rebase: the app's commits and the files stay as they were, the remote's version stays in its remote-tracking branch, and the trigger shows the problem, with [Resolve] on its toast, until the person settles it ([Settling a conflict](#settling-a-conflict)). The file watcher reads nothing while a rebase runs, so the half-applied files (conflict markers) never reach the editor.
5. **Pull.** A fetch runs when the window becomes active (at most every 30 s) and every 5 minutes, for the notes repository and for `private/` separately (D-47), with `--no-recurse-submodules`. If a branch is behind and its tracked files are clean, the app pulls it with rebase (no automatic stash); saves wait while the rebase rewrites files. `private/` always stays on `main` and is never reset to the publishing pointer. Open notes reload in place, keeping the caret where possible.
6. **Offline.** Commits pile up locally and the trigger shows its problem state (D-06). A retry runs after 30 s, doubling to 5 minutes, and with every later save; everything pushes in order once the network is back.
7. **Quit.** After the window has saved, quitting commits and pushes once more, waiting at most 15 s for each network call, then releases the [lock](#one-writer-at-a-time). Unpushed commits push next time.

The save state is an icon at the leading edge of the bottom-left pill (UI-12, D-132, [Main UI](../experience/main-ui.html), [Feedback → Save and sync status](../design/components/feedback-and-dialogs.md#save-and-sync-status)): *Saved on this computer* while a change is being written, *Saved here · not backed up yet* once it's written, *Backing up…* while a sync with something to send runs, *Backed up at ⟨time of day⟩* after, *Offline · will back up when you're back*, or *Couldn't back up · Try again*. The shell reports the changes waiting as soon as a write lands, so the icon follows typing within a second without asking Git. *Save to cloud* (`Ctrl/⌘+Shift+S`, or `Ctrl/⌘+S`) runs the commit and push right away and opens the icon's label, *Backing up…* then *Backed up*, for about 2 s, or says the reason it couldn't. A problem also shows as the trigger's dot ("Couldn't sync") and one toast when it first appears, with [Retry]. Without a repository, or without Git, saving stays local: the icon says *Saved on this computer*, and there's no other Git UI. ### When to back up

The main process decides when to commit and push from how much changed, so history stays readable and isn't a commit for every pause (D-133). Every write tells it how many characters changed: it compares the new text with the text it last wrote (or, the first time, what's on disk), counting what was inserted plus deleted between their common start and end, and keeps a running total across notes, with the time of the first change not yet backed up.

| When | Backs up if |
| --- | --- |
| 60 s with no typing | at least 200 characters changed, or the first change is more than 10 minutes old |
| 10 s with no typing | at least 2,000 characters changed, or a change has waited 30 minutes |
| Switching or closing a note | one of the thresholds above is met (the pause doesn't matter) |
| Quitting, *Save to cloud* | always |

One pure function (`backupDueAt` in `git/cadence.ts`) gives the earliest moment a backup is due, and one timer waits for it, restarted by each write; the totals start again when a backup's commit starts. The thresholds are one object (`BACKUP_POLICY`); until Settings has them, `FOCUS_NOTES_IDLE_COMMIT_MS` (the 60 s pause), `FOCUS_NOTES_BACKUP_SHORT_MS`, `FOCUS_NOTES_BACKUP_MIN_CHARS`, `FOCUS_NOTES_BACKUP_BIG_CHARS`, `FOCUS_NOTES_BACKUP_STALE_MS`, `FOCUS_NOTES_BACKUP_CEILING_MS` and `FOCUS_NOTES_POINTER_GAP_MS` set them, which the journey tests use.

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

*Sync appearance* in the ⋯ menu's Theme group (THM-05) stores the settings that follow you, the appearance, the light and dark themes, and the reading settings (the content font and its size, line spacing, reading width, paragraph spacing, and focus dim, D-108), in `private/.focus-notes/settings.json` (`schemas/settings.schema.json`, D-46). Syncing is on while that file exists: the app reads it over this device's own choices when it starts and writes changes to it, committed with the next save in the private repository like a note. Turning it off keeps the current look on this device and deletes the file. The main process writes only what the schema allows, and the menu item shows only where the workspace has `private/`. The last note, focus mode, and the interface scale always stay on the device (PRV-03, D-99).

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

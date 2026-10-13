# First run and sign-in

The first launch of the desktop app sets everything up: Git, GitHub sign-in, the writer's identity, the notes workspace, and preferences. It takes a few calm screens, and it ends with the first note open.

> [!NOTE]
> **TL;DR.** Seven steps: **Welcome → Git → Sign in → Identity → Workspace → Make it yours → Ready**, each one screen and each one undoable or resumable. Sign-in uses **GitHub's device flow**: the app shows a short code, opens github.com, and waits. The token is saved twice: in the app's encrypted storage, and in **git's own credential store**, so commits and pushes work in the app and from the terminal with that one sign-in. If Git can already reach GitHub, or the GitHub CLI is signed in, the sign-in step offers to reuse that. Covers FRE-01 to FRE-07 in the [requirements](../product/requirements.md).

## Principles

- **One decision per screen.** Every screen has one primary button and works entirely from the keyboard (<kbd>Enter</kbd> continues, <kbd>Esc</kbd> goes back).
- **Detect before asking.** Existing Git, credentials, identity, and clones are found and offered first. Nothing the computer already knows is asked again.
- **Explain once, in one line.** Each screen has a single sentence of why. Details sit behind a "Learn more" link to these docs.
- **Resumable.** Quitting halfway resumes at the same step next time. Finished steps are skipped.
- **Same look as the app.** The blank canvas with the trigger at the top. Steps appear as a centered card with progress dots.
- **No tracking.** The first-run experience sends nothing anywhere except to GitHub, and only for the steps that need it.

## The flow

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">1. Welcome</p>
<p>The blank canvas with the trigger, and one line: "A quiet place to write." [Get started]. A link to Settings is offered for proxy setups.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">2. Git</p>
<p>Runs <code>git --version</code> and checks that a credential helper is set up. If Git is missing, it shows the install path for the platform (below) and a [Check again] button. Git is required, not bundled (<a href="../plan/decisions.md">D-22</a>), so the app and the terminal share the same setup.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">3. Sign in to GitHub</p>
<p>Offers an existing sign-in if one is found. Otherwise it runs the device flow (detailed below). Ends with "Signed in as <strong>@login</strong>", the user's avatar, and the checkbox "Also sign in Git on this computer", which is on by default.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">4. Identity</p>
<p>Shows the name and email that will be on commits. If Git has none, it fills them in from GitHub, using the private <code>ID+login@users.noreply.github.com</code> address. The choice is to apply them to all repositories or only to the notes workspace.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">5. Workspace</p>
<p>Three options: open a notes repository from GitHub, open a folder already on this computer, or create a new workspace (P1). Shows clone progress, and explains if the private notes can't be reached.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">6. Make it yours</p>
<p>Theme (System, Light, Dark), content font and size, and focus mode on or off, all previewed live on a sample paragraph. Every choice can be skipped and changed later.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">7. Ready</p>
<p>Two hints, nothing more: "Click the red dot for everything" and "Press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> to search or act". [Start writing] opens a new private note (<a href="../plan/decisions.md">D-05</a>).</p>
</li>
</ol>

## Step 2: getting Git

| Platform | If Git is missing | Credential helper used |
| --- | --- | --- |
| Windows | [Install Git for Windows], or copy `winget install --id Git.Git -e` | Git Credential Manager, included with Git for Windows |
| macOS | [Install Command Line Tools] runs `xcode-select --install`. Homebrew users can copy `brew install git` | `osxkeychain` (included), or Git Credential Manager if installed |
| Linux | The package command for the detected distribution (for example `sudo apt install git`) | Git Credential Manager or `libsecret` if present. Otherwise the app offers to configure one |

The app never sets up the plaintext `store` helper. If no secure helper is available, the app keeps the token for its own Git commands only and says that terminal pushes will ask for credentials.

## Step 3: signing in

### Reusing an existing sign-in

Before showing a code, the app checks these, without any prompt appearing:

1. **Git already has a GitHub credential.** It asks git's credential helper with interactive prompts turned off. If a credential comes back and GitHub accepts it, the screen says *Continue as @login* or *Use a different account*.
2. **The GitHub CLI is signed in.** If `gh auth status` shows a session, the screen offers *Use your GitHub CLI sign-in*, which runs `gh auth setup-git` so Git uses it.

### Device flow

| Moment | What the writer sees |
| --- | --- |
| Start | A large code in a monospaced font, for example **WDJB-MJHT**, and the button [Copy code and open GitHub]. It copies the code and opens `github.com/login/device` in the default browser. |
| Waiting | "Waiting for you to approve Focus Notes on GitHub…", a quiet progress indicator, and the time left (codes last about 15 minutes). [Get a new code] and [Cancel] are always available. |
| Approved | Avatar, name, @login, and the Git checkbox. [Continue]. |
| Declined | "You declined access on GitHub." [Try again]. |
| Code expired | A new code is requested automatically, and the screen says so. |
| Offline | "Can't reach GitHub." [Retry], plus a link to the proxy settings. |
| Organization with single sign-on | After approval, a note explains how to authorize the token for that organization, with a link. |

The protocol details are in [Desktop and Git](../architecture/desktop-and-git.md#sign-in).

### Where the sign-in is stored

| Copy | Used by | Stored in |
| --- | --- | --- |
| App copy | The app's GitHub API calls (listing repositories, Pages status, share links) | The OS's secure storage, through Electron's encryption API (Keychain on macOS, DPAPI on Windows, libsecret on Linux) |
| Git copy (checkbox on) | Every `git push` and `git fetch`, in the app **and in the terminal** | git's configured credential helper (see Step 2) |

With the checkbox off, the app gives the token to its own Git commands only, through a one-off askpass helper, and the user's terminal is left alone.

## Step 5: workspace

| Option | What happens |
| --- | --- |
| **Open a notes repository from GitHub** | Search the user's repositories (the default suggestion is `<login>/focus-notes` if it exists) and choose a local folder (default `Documents/Focus Notes`). The app runs `git clone --recurse-submodules` with a progress bar. If the private submodule isn't accessible to this account, it explains: "Private notes aren't available to this account. You can still work with public notes." |
| **Open a folder on this computer** | Pick an existing clone. The app checks that it's a Git repository with the expected layout ([Content model](../architecture/content-model.md#workspace-layout)) and fetches any missing submodule. |
| **Create a new workspace** (P1) | Creates the public repository from a template and the private repository, links them as a submodule, turns on GitHub Pages, and pushes the first commit. |

After cloning, the app applies the submodule settings from `personal-site`: `submodule.recurse=true`, `push.recurseSubmodules=check`, and the private submodule checked out on `main` instead of a detached HEAD ([Repository and publishing](../architecture/repository-and-publishing.html#working-with-the-submodule)).

## Account settings later

**Settings → Account** shows the signed-in account and the workspace, with:

- **Switch account:** runs the device flow again and replaces both copies of the sign-in.
- **Sign out:** deletes the app copy and, if the user agrees, removes the Git copy for `github.com`. GitHub doesn't let a desktop app revoke its own token without its client secret, so the screen links to *GitHub → Settings → Applications* for a full revoke.
- **Run setup again:** repeats any step, for example to move the workspace.

## Acceptance checks

- **FRE-01:** On a clean computer with Git installed, a writer gets from launch to typing in a note in 7 screens or fewer, using only the keyboard.
- **FRE-02:** Declining, an expired code, and going offline each recover without restarting the app.
- **FRE-03:** After sign-in, `git push` from a separate terminal in the workspace succeeds without a prompt (with the checkbox on).
- **FRE-04:** With an existing working Git credential, no device code is shown.
- **FRE-05:** A commit made by the app has the identity confirmed in step 4.
- **FRE-06:** Cloning a workspace without access to the private repository finishes and shows public notes only.
- **FRE-07:** After *Sign out* with the Git copy removed, the next `git fetch` in the terminal asks for credentials.

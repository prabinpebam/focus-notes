# First run and sign-in

The first run depends on where you start. In the browser, the primary way to reach Focus Notes (D-80), you've already copied the template repository to make your instance and opened its site, so there's no setup at all: you read and write at once, and nothing signs in (D-90). The desktop app, the only client that saves to GitHub, sets up Git, GitHub sign-in, the writer's identity, their instance and vault passphrase, and preferences in a few calm screens. Nothing either sets up depends on any service run by the Focus Notes project.

> [!NOTE]
> **TL;DR.** **In the browser** (FRE-09): the app knows its instance from its own address. A first visit opens the newest public note, read-only, or a **welcome note kept in this browser**, which says that notes written here stay in this browser and that the desktop app saves to GitHub. There's nothing to sign in to: the bottom-left corner offers **Unlock** (when the site has private notes) and **Use this app for yourself** ([Web app](../architecture/web-app.md)). **In the desktop app**: seven steps, **Welcome → Git → Sign in → Identity → Workspace → Make it yours → Ready**, each one screen, resumable, and keyboard-operable. **Sign-in** happens through Git's own sign-in tools that the user owns: **Git Credential Manager** (included with Git for Windows) or the **GitHub CLI**, both offering a **device code**. A **fine-grained token** created on GitHub from a pre-filled link is the alternative. So one sign-in serves the app and the terminal, and Focus Notes needs no OAuth app and no server (D-21). The **Workspace** step opens the instance the user already has, or creates it in their own GitHub account (FRE-08): the instance repository copied from the template, a private repository, the read-only deploy key, the **vault passphrase** (only its derived key is stored), and GitHub Pages. **Ready** offers to **import notes exported from a browser**, private by default (FRE-10). Covers FRE-01 to FRE-10 in the [requirements](../product/requirements.md).

## The web first run

On an instance's own GitHub Pages site there's nothing to install, no Git, and nothing to sign in to (FRE-09, [D-90](../plan/decisions.md)). The app reads its instance from its own address: on `https://you.github.io/notes/` it reads that site's `/focus-notes.json`. There's no dialog:

| Situation | What opens |
| --- | --- |
| **The site has public notes** | The newest public note, read-only, with the quiet *Read only · Copy to my notes* pill in the bottom-left corner. |
| **No public notes yet** | A **welcome note kept in this browser**: "Notes you write here stay in this browser, offline, with no account. To save them to your GitHub repositories, use the desktop app." Typing in it, or pressing *New*, starts writing at once. |
| **The site has a vault** | A quiet **Unlock** link in the bottom-left corner. The owner's passphrase opens the private notes, read-only ([Web app → Unlocking private notes](../architecture/web-app.md#unlocking-private-notes)). |
| **Until a browser unlocks** | A quiet **Use this app for yourself** in the same corner, for anyone who wants their own instance ([the dialog](../design/views/get-started.md)). |

The ⋯ menu has **Export my notes…** and **Import notes…** at any time, so notes written in a browser can be moved to the desktop app or another browser (PKG-11). The browser never asks for a token or a GitHub sign-in (SEC-03).

## Principles of the desktop first run

- **One decision per screen.** Every screen has one primary button and works entirely from the keyboard (<kbd>Enter</kbd> continues, <kbd>Esc</kbd> goes back).
- **Detect before asking.** Existing Git, credentials, identity, and clones are found and offered first. Nothing the computer already knows is asked again.
- **Explain once, in one line.** Each screen has a single sentence of why. Details sit behind a "Learn more" link to these docs.
- **Resumable.** Quitting halfway resumes at the same step next time. Finished steps are skipped.
- **Same look as the app.** The blank canvas with the trigger at the top. Steps appear as a centered card with progress dots.
- **Yours, end to end.** Everything created lives in the user's own GitHub account and on their computer. The first run talks only to GitHub.

## The flow

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">1. Welcome</p>
<p>The blank canvas with the trigger, and one line: "A quiet place to write." [Get started]. A link to Settings is offered for proxy setups.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">2. Git</p>
<p>Runs <code>git --version</code> and finds the configured credential helper. If Git is missing, it shows the install path for the platform (below) and a [Check again] button. Git is required, not bundled (<a href="../plan/decisions.md">D-22</a>), so the app and the terminal share the same setup.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">3. Sign in to GitHub</p>
<p>Offers an existing sign-in if Git already has one. Otherwise it signs in through Git Credential Manager or the GitHub CLI, with a device code if wanted, or through a fine-grained token (detailed below). Ends with "Signed in as <strong>@login</strong>" and the user's avatar.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">4. Identity</p>
<p>Shows the name and email that will be on commits. If Git has none, it fills them in from GitHub, using the private <code>ID+login@users.noreply.github.com</code> address. The choice is to apply them to all repositories or only to the notes workspace.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">5. Workspace</p>
<p><strong>Create my workspace</strong> (the default for new users), open an existing workspace from GitHub, or open a folder already on this computer. It asks for the <strong>vault passphrase</strong> on the same screen, shows progress for each part, and explains if private notes can't be reached.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">6. Make it yours</p>
<p>Theme (System, Light, Dark), content font and size, and focus mode on or off, all previewed live on a sample paragraph. Every choice can be skipped and changed later.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">7. Ready</p>
<p>Two hints, nothing more: "Click the red dot for everything" and "Press <kbd>⌘/</kbd> or <kbd>Ctrl+/</kbd> to search or act". A quiet <em>Bring notes from a browser…</em> imports an exported bundle (FRE-10). [Start writing] opens a new private note (<a href="../plan/decisions.md">D-05</a>).</p>
</li>
</ol>

## Step 2: getting Git

| Platform | If Git is missing | Sign-in helper |
| --- | --- | --- |
| Windows | [Install Git for Windows], or copy `winget install --id Git.Git -e` | Git Credential Manager, included with Git for Windows |
| macOS | [Install Command Line Tools] runs `xcode-select --install`. Homebrew users can copy `brew install git` | Usually none that can sign in to GitHub. Step 3 offers `brew install --cask git-credential-manager`, `brew install gh`, or a token |
| Linux | The package command for the detected distribution (for example `sudo apt install git`) | Git Credential Manager or the GitHub CLI if installed. Otherwise step 3 offers install commands or a token |

The app never sets up the plaintext `store` helper.

## Step 3: signing in

### The sign-in screen

| Situation | What the screen offers |
| --- | --- |
| Git already has a working GitHub credential | "You're signed in to GitHub as **@login** on this computer." [Continue as @login] · *Use a different account* |
| Git Credential Manager is the helper | [Sign in with GitHub]: GCM's own sign-in window opens (browser sign-in). *Use a code instead* asks GCM for a device code. |
| GitHub CLI is installed | [Sign in with GitHub]: the app shows the CLI's **one-time code** in large type with [Copy code and open GitHub], then waits for the CLI to finish. |
| No sign-in helper | "Focus Notes signs in through Git's own sign-in tools." Copyable install commands for GCM or the GitHub CLI, with [Check again]. Or *Use a token instead*. |
| Always | *Use a token instead*: [Create a token on GitHub] opens GitHub's token page with the name, repositories, expiry, and permissions pre-filled. The user creates it, pastes it, and [Continue]. |

### Device code moments (GitHub CLI or GCM)

| Moment | What the writer sees |
| --- | --- |
| Code shown | A large code in a monospaced font, for example **WDJB-MJHT**, with [Copy code and open GitHub], which opens `github.com/login/device`. When GCM shows the code in its own window, the app says "Enter the code shown by Git Credential Manager." |
| Waiting | "Waiting for you to approve on GitHub…", a quiet progress indicator, and [Cancel]. |
| Approved | Avatar, name, and @login. [Continue]. |
| Declined or expired | "Sign-in didn't finish." [Try again]. |
| Offline | "Can't reach GitHub." [Retry], plus a link to the proxy settings. |
| Organization with single sign-on | A note explains how to authorize the credential for that organization, with a link. |

### Where the sign-in lives

In one place: **Git's credential helper**, owned by the user (the OS keychain, Windows Credential Manager, or the GitHub CLI's secure storage). The app reads it when it needs to call the GitHub API, keeps it in memory only, and never stores a copy. The terminal's `git push` uses the same credential. The details are in [Desktop and Git → Sign-in](../architecture/desktop-and-git.md#sign-in).

## Step 5: workspace

People who started in the browser already have their instance (copied from the template). The app finds it among their repositories and offers it first, then does only the steps still missing.

| Option | What happens |
| --- | --- |
| **Create my workspace** (default for new users) | Asks for two names: the instance repository (default `notes`, public, because GitHub Pages on free accounts needs it) and the private repository (default `notes-private`). Two toggles, both on: *Publish on GitHub Pages* (the web app, public notes, and the vault) and *Enable private share links*. Then the **vault passphrase** (below). [Create] then shows a checklist that ticks off as it goes: Copy the template · Create private repository · Link them · Set up the deploy key · Save the vault's key · Turn on GitHub Pages · Download to this computer (default folder `Documents/Focus Notes`). Each item can be retried on its own. When it finishes, it shows the site address, where the same instance can be read in any browser. |
| **Open my workspace from GitHub** | Search the user's repositories. Repositories copied from the Focus Notes template are listed first. Choose a local folder and clone with submodules. If the private repository isn't accessible to this account: "Private notes aren't available to this account. You can still work with public notes." If the instance has no private repository, deploy key, or vault yet, the missing steps run as above. |
| **Open a folder on this computer** | Pick an existing clone. The app checks that it's a Git repository with the expected layout ([Content model](../architecture/content-model.md#workspace-layout)) and fetches any missing submodule. |

**The vault passphrase** (SEC-08, FRE-08) opens the private notes in a browser, read-only. "Choose a passphrase to read your private notes in a browser. If you forget it, it can't be recovered. Your notes stay in your private repository." A field with a strength meter and a plain reason when it's too weak (at least 12 characters, rated strong), and a second field to confirm it. Only its derived key is saved, in `private/access.json` ([The vault](../architecture/repository-and-publishing.html#the-vault)). *Skip for now* leaves the site without a vault until it's set in **Settings → Workspace**. Before the desktop setup exists (M3), the owner runs `node packages/seal/src/cli.ts vault-init --private private` in a clone instead: it reads the passphrase from standard input, refuses weak ones, and writes only the derived key.

After cloning, the app checks out the private submodule on `main` instead of a detached HEAD and sets `push.recurseSubmodules=check`. It leaves `submodule.recurse` off and syncs `private/` as its own repository, so a recursive pull can't reset it to the older publishing pointer (D-47, [Repository and publishing](../architecture/repository-and-publishing.html#working-with-the-submodule)).

**Writing starts before setup finishes.** As soon as the workspace is on this computer, [Start writing] is available. Turning on GitHub Pages, the first deploy (which can take a few minutes), and the deploy key carry on in the background, with progress in **Settings → Workspace**. A failure there never blocks writing.

## Bringing notes from a browser

Notes written in a browser stay there until they're moved (FRE-10). In the browser, ⋯ → **Export my notes…** saves them as one file. On the desktop, **Ready**'s *Bring notes from a browser…*, or ⋯ → **Import notes…** later, opens that file, lists its notes, and adds them to the instance: **private** by default, or public if chosen, as ordinary commits. A name that's taken keeps both versions. The browser keeps its copies until they're deleted there ([Desktop and Git → Importing notes from a browser](../architecture/desktop-and-git.md#importing-notes-from-a-browser)).

## Account settings later

**Settings → Account** (desktop) shows the signed-in account, which helper holds the credential, and the workspace, with:

- **Switch account:** signs in again through the same helper.
- **Sign out:** removes the GitHub credential from Git's helper (`git credential reject`, or `gh auth logout`), which signs out the terminal too. The screen says so, and links to GitHub's settings to fully revoke a token or authorization.
- **Run setup again:** repeats any step, for example to move the workspace or turn on publishing later.

## Acceptance checks

- **FRE-01:** On a clean Windows computer with Git for Windows, a writer gets from launch to typing in their own new workspace in 7 screens or fewer, using only the keyboard.
- **FRE-02:** Sign-in works through Git Credential Manager (browser and device code), through the GitHub CLI (device code shown in the app), and with a pasted fine-grained token. Declining, expiry, and going offline each recover without restarting the app.
- **FRE-03:** After sign-in, `git push` from a separate terminal in the workspace succeeds without a prompt.
- **FRE-04:** With an existing working Git credential, no sign-in step is shown beyond *Continue as @login*.
- **FRE-05:** A commit made by the app has the identity confirmed in step 4.
- **FRE-06:** Cloning a workspace without access to the private repository finishes and shows public notes only.
- **FRE-07:** After *Sign out*, the next `git fetch` in the terminal asks for credentials.
- **FRE-08:** *Create my workspace* leaves two repositories, a linked submodule, a read-only deploy key, the Actions secret, the owner's grant in `private/access.json` holding only the passphrase's derived key, and a live Pages site whose vault opens with that passphrase, all in the user's account, and the app made no network request except to GitHub.
- **FRE-09:** A first visit to an instance's site opens the newest public note or the welcome note, with no sign-in, and a network capture shows no request except to the site itself.
- **FRE-10:** Importing an exported bundle adds its notes to the private repository by default in ordinary commits, keeps both versions on a name clash, and deletes nothing in the browser.

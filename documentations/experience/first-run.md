# First run and sign-in

The first run depends on where you start. In the browser, the primary way to reach Focus Notes (D-80), you've already copied the template repository to make your instance and opened its site, so there's no setup at all: you read and write at once, and nothing signs in (D-90). The desktop app, the only client that saves to GitHub, sets itself up in three short screens and a fourth that says it's ready, in words anyone understands, even someone who has never heard of GitHub (D-124). Nothing either sets up depends on any service run by the Focus Notes project.

> [!NOTE]
> **TL;DR.** **In the browser** (FRE-09): the app knows its instance from its own address. A first visit opens the newest public note, read-only, or a **welcome note kept in this browser**, which says that notes written here stay in this browser and that the desktop app saves to GitHub. There's nothing to sign in to: the bottom-left corner offers **Unlock** (when the site has private notes) and **Use this app for yourself** ([Web app](../architecture/web-app.md)). **In the desktop app**: four steps, **Welcome → Connect → Your notes → Ready**, each one screen, resumable, and keyboard-operable (D-124). **Welcome** offers *Get started*, or *Just use this computer for now* with no account. **Connect** checks Git silently (it shows only when Git is missing or too old) and connects the person's GitHub account through Git's own sign-in tools that the user owns, **Git Credential Manager** (included with Git for Windows) or the **GitHub CLI**, so one sign-in serves the app and the terminal and Focus Notes needs no OAuth app and no server (D-21). *Connect to GitHub* is a **device code** from that helper, shown large in the app with *Copy code and open GitHub* (D-142); the helper's browser sign-in, a **fine-grained token**, and other tools sit under *Having trouble?*. The name and email on saved changes come from the account, with GitHub's private noreply address, for the notes only. **Your notes** shows the notes the account already has (*We found your notes*, each with *Open*), or *Create my notes* in the person's own GitHub account (FRE-08) with sensible defaults; names, the folder, publishing, the browser passphrase, and opening any other repository sit under *More options*. **Ready** features focus mode with its keys, offers the theme, and offers to **import notes exported from a browser**, private by default (FRE-10). Covers FRE-01 to FRE-10 in the [requirements](../product/requirements.md).

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

- **Words anyone understands.** The main path says *your GitHub account*, *your notes*, *connect*, *save*, and *back up*. It never says repository, Git, commit, token, credential, CLI, instance, or Pages; those words appear only under *More options* and *Having trouble?*, each with a one-line plain explanation ([Foundations → Words](../design/foundations.md#words), D-124).
- **One decision per screen.** Every screen has one primary button and works entirely from the keyboard (<kbd>Enter</kbd> continues, <kbd>Esc</kbd> goes back).
- **Detect before asking.** Git, an existing sign-in, and notes the account already has are found and offered first. Nothing the computer or the account already knows is asked: the name and email on saved changes come from the account.
- **Explain once, in one line.** Each screen has a single sentence of why. Every problem says what happened and the one thing to do.
- **An error belongs to what caused it (D-154).** A problem shows only on the screen of the action that had it, and clears when that action is tried again, works, or the step changes; a screen that went well never shows an earlier error.
- **No dead ends ([D-154](../plan/decisions.md)).** Every problem on every step offers at least one action that changes what happens next, not only the same thing again, and a way back (*Back*, or <kbd>Esc</kbd>). [Try again] stays for what can pass on its own (GitHub out of reach, the sign-in, too many requests), always beside something else. Nothing the app chose for the person (a folder, a default name) is ever the reason it stops: it picks again.
- **Show, don't describe ([D-127](../plan/decisions.md), the visual score).** Each step has a visual anchor and as few words as it can: the account is a profile card (its picture, or initials offline, the name large, @login with GitHub's mark), the notes found are rows (an icon, the name, "Updated 3 days ago", a *Public* or *Private* badge), *Create my notes* is an option card, and Ready's hints have pictures (the focus icon with the toggle's key caps, the red dot; D-144). Each step scores 80 or more, no criterion under 10; the journeys measure the anchor and the words (`e2e/visual-score.ts`).
- **Resumable.** Quitting halfway resumes at the same step next time, which checks again what it needs. Steps before it aren't shown again unless the person goes back.
- **A full window, not a dialog ([D-126](../plan/decisions.md)).** Setup is the whole window below the title bar band, on the canvas color with no card, border or shadow: one onboarding experience. Its content is a 560 px column in the middle of the window (centred in the height too while it fits; taller, it scrolls inside, D-111), with the step it's on as a compact stepper (four dots, the current one a longer segment, named "Step 2 of 4", D-142), a display-size title that names the state, not just the step ("You're connected", "Install the helper app", "Your notes are ready") (`font.uiDisplay`, 40 px) and large main actions. **Welcome** is the hero: the app's icon at 112 px (`AppMark`) with the app's name, "Focus Notes", under it as a quiet wordmark (D-144), the title and its one sentence centred; its two buttons are one group, `space.m` apart and `space.xxl` below the sentence, so neither focus ring touches the other button. The title bar band stays the window's, so the window still drags and shows its controls, on every step, its problems and while setup runs (D-147). Each step's primary button has focus when it appears, so <kbd>Enter</kbd> continues from anywhere that isn't another control. **Action rows line up with the content column (D-131):** after Welcome, whose hero is centred, every step's primary button is first in its row at the column's start edge, then any other action, then *Back*; nothing is right-aligned. **A short window gets the compact setup (D-131):** below `breakpoint.short` (560 px tall) the hero icon is `size.appMarkM` (48 px), the title is `font.uiTitle`, and the window's padding and the gaps step down, so Welcome and Ready fit a 480 × 360 window without scrolling where they can, and the hero is in view when a step first shows.
- **Nothing else until it's done (D-126).** While setup is open, the trigger, its toolbar, the account pill and the note aren't there, and every app command is held at the command layer: disabled with "Finish setting up first." in menus (the macOS menu bar too) and Spotlight, its keys do nothing (<kbd>Ctrl+K</kbd>, <kbd>Ctrl+/</kbd>, <kbd>Ctrl+O</kbd>, <kbd>Ctrl+N</kbd>, <kbd>Ctrl+S</kbd>, find, themes, focus mode, the cheat sheet), and running it does nothing. Only setup's own commands, the window's, zoom, and what its steps run (Ready's look and import) work.
- **Yours, end to end.** Everything created lives in the user's own GitHub account and on their computer. The first run talks only to GitHub.

The first run shows on a new install of the desktop app: when the app's state has no finished first run and no note opened before, so people who wrote with an earlier version keep writing (D-101). Nothing opens behind it; the first note opens with *Start writing*: a new note under *Private*, or, in a workspace without a private repository, under *Public* and held out of backups (D-158, D-171). A first run left halfway by an earlier version, at a step that no longer exists, resumes at the step that holds it now: Git, Sign in, and Identity at **Connect**, Workspace at **Your notes**, and Make it yours at **Ready**.

## The flow

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">1. Welcome</p>
<p>The app's icon, large, with "Focus Notes" under it; "A quiet place to write"; and one sentence beside GitHub's mark: "Your notes are saved online for free using GitHub." [Get started], large. A quiet <em>Just use this computer for now</em> skips the account: notes are saved in <code>Documents/Focus Notes</code> on this computer only, and <strong>Settings → Workspace</strong> → <em>Connect to GitHub</em> sets up the rest later.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">2. Connect your GitHub account</p>
<p>If this computer is already connected, the account's <strong>profile card</strong> (its picture, fetched by the app and kept for offline, or its initials; the name; @login with GitHub's mark) and [Continue as <em>first name</em>]. Otherwise a <em>GitHub</em> card with GitHub's mark, "Free. Keeps your notes backed up." and <em>Create a free GitHub account</em>, and [Connect to GitHub] (with GitHub's mark) starts a device code: the code shows large in the app with [Copy code and open GitHub], then the step waits for the approval (D-142). Git is checked silently on arrival and shows only when it's missing or too old (<a href="#getting-git">below</a>). Everything else is under <em>Having trouble?</em> (<a href="#connecting">below</a>). Continuing sets the name and email on saved changes from the account, for the notes only.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">3. Your notes</p>
<p>If the account already has Focus Notes notes, <strong>We found your notes</strong> lists them as rows, each with an icon, its name, when it was updated, a <em>Public</em> or <em>Private</em> badge, and [Open]. Otherwise a <em>Create my notes</em> option card ("Private unless you share. Backed up to GitHub."), which is itself the button: one tab stop with its focus ring, and it creates the notes with sensible defaults (D-131). Everything else is under <em>More options</em> (<a href="#your-notes">below</a>).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">4. Ready</p>
<p>The app's icon, and two hints with pictures, nothing more. First the app's signature, focus mode (D-144): the focus icon, "Focus mode keeps only your current line bright.", and its toggle's keys as key caps, read from the keymap (<kbd>⇧⌘D</kbd> on macOS, <kbd>Ctrl+Shift+D</kbd> on Windows and Linux). Then the red dot, "Click the red dot for everything". The look (System, Light, Dark) applies at once, so the setup screen is the preview; fonts, text size, and focus mode are in the ⋯ menu. A quiet <em>Bring notes from a browser…</em> imports an exported bundle (FRE-10); it shows once the desktop can import (WP-3.4). [Start writing] opens a new private note (<a href="../plan/decisions.md">D-05</a>), or a public one in a workspace whose private notes this account can't reach.</p>
</li>
</ol>

<h2 id="getting-git">Getting Git</h2>

The installer and the portable use the system's Git ([D-22](../plan/decisions.md)), so the app and the terminal share the same setup. The Microsoft Store package brings its own Git and sign-in helper and always uses them, so there's nothing to install (PKG-13, [D-228](../plan/decisions.md)); [below](#git-in-the-store-package) is how its screens differ. *Connect* runs `git --version` on arrival. When Git is ready, nothing about it shows. When it's missing or older than 2.31, the screen shows the helper app's card ("One free helper app", "Focus Notes needs it to save your notes.") with [Install the helper app] and [Check again]; *Having trouble?* names it (Git), the version found, and the command to copy (D-135):

| Platform | If Git is missing | Sign-in helper |
| --- | --- | --- |
| Windows | [Install the helper app] opens Git for Windows' download, or copy `winget install --id Git.Git -e` | Git Credential Manager, included with Git for Windows |
| macOS | `xcode-select --install` installs the Command Line Tools. Homebrew users can copy `brew install git` | Usually none that can sign in to GitHub: *Connect* offers to install Git Credential Manager, and *Having trouble?* the GitHub CLI or a token |
| Linux | The package command for the detected distribution (for example `sudo apt install git`) | Git Credential Manager or the GitHub CLI if installed. Otherwise as on macOS |

The app never sets up the plaintext `store` helper.

<h3 id="git-in-the-store-package">Git in the Store package</h3>

The Store package's Git is GitHub Desktop's build of Git for Windows, with Git Credential Manager, at `resources\git` in the package. Its screens never offer other software, because the Store doesn't allow an app to promote software from outside it (policy 10.1.5, D-228):

| Situation | Installer and portable | Store package |
| --- | --- | --- |
| Git missing or too old | The helper app's card, [Install the helper app] or [Update the helper app], [Check again], and the winget command under *Having trouble?* | Can't happen while the package is whole. If its Git won't start: "Focus Notes can't start Git", a card saying "Git comes with Focus Notes." and "Repair Focus Notes in Windows Settings → Apps → Installed apps, then check again.", with [Check again] and [Back]. No install button, no command |
| No sign-in helper | "To connect, Focus Notes needs GitHub's free sign-in helper." [Install the sign-in helper] | The helper comes with the package, so this shows only when the person's own Git settings turn it off: "Git's sign-in helper is turned off in your Git settings. Turn it back on, then check again." with [Check again] and [Back]. The app never changes those settings |
| *Having trouble?* | … *Get the GitHub CLI* … | The same rows without *Get the GitHub CLI*. A GitHub CLI that's already installed is still offered and used |

The shell refuses to open the `git`, `gcm` and `gh` pages in the Store package, whatever asks.

<h2 id="connecting">Connecting</h2>

### The Connect screen

| Situation | What the screen offers |
| --- | --- |
| Git already has a working GitHub sign-in | "This computer is connected to GitHub as **@login** (Name)." [Continue as @login]. *Having trouble?* → *Use a different account* |
| The GitHub CLI is signed in, but Git doesn't use it yet | The same, and [Continue as @login] runs `gh auth setup-git` |
| Git Credential Manager or the GitHub CLI can sign in | [Connect to GitHub] starts the helper's **device code** (`git credential-manager github login --device`, or `gh auth login --web`): the app shows the **one-time code** large with [Copy code and open GitHub], then waits. Where GCM shows the code in its own window instead of printing it, the app says to finish there (D-142) |
| No sign-in helper | "To connect, Focus Notes needs GitHub's free sign-in helper." [Install the sign-in helper] (Git Credential Manager) and [Check again] |
| *Having trouble?* (always) | *Sign in in the browser instead* (GCM's browser sign-in), *Use a token instead*, *Get the GitHub CLI*, *About single sign-on*, and, when an account was found, *Use a different account*: compact rows, each an icon and a one-line label (D-135). |

*Use a token instead*: [Create a token on GitHub] opens GitHub's token page with the name, expiry, and permissions pre-filled (repositories can't be pre-filled: the page asks). The user creates it, pastes it, and [Continue]. The app checks it with GitHub and hands it to Git's credential helper. If GitHub rejects it, or there's no helper to keep it, the form stays: the field is marked invalid, says why and that the token was cleared (the app never keeps one), and takes focus (D-135).

### Device code moments (GitHub CLI or GCM)

| Moment | What the writer sees |
| --- | --- |
| Code shown | GitHub's mark, ringed while it waits; "Enter this code on GitHub" above the code, large and monospaced, for example **WDJB-MJHT**, with [Copy]; below it [Copy code and open GitHub], which opens `github.com/login/device`; then "Waiting for you to approve on GitHub…" (D-142). |
| A window or the browser | "Finish connecting in your browser, or in the window that opened." |
| Waiting | GitHub's mark in a large round tile with a turning ring (the step mark, D-135), "Waiting for you to approve on GitHub…", and [Cancel]. |
| Approved | "This computer is connected to GitHub as **@login** (Name)." [Continue as @login]. |
| Declined or expired | "Connecting didn't finish. Try again when you're ready." [Connect to GitHub]. |
| Offline | "Can't reach GitHub. Check your internet connection, then try again." [Try again]. |

### The name on saved changes

Continuing sets the name and email Git puts on every saved change (FRE-05) without a step: the account's name and GitHub's private `ID+login@users.noreply.github.com` address, for the notes only (the workspace's own settings and `private/`'s; setup's own commits use them before that). Git's global settings are never changed, so other projects keep theirs.

### Where the sign-in lives

In one place: **Git's credential helper**, owned by the user (the OS keychain, Windows Credential Manager, or the GitHub CLI's secure storage). The app reads it when it needs to call the GitHub API, keeps it in memory only, and never stores a copy. The terminal's `git push` uses the same credential. The details are in [Desktop and Git → Sign-in](../architecture/desktop-and-git.md#sign-in).

<h2 id="your-notes">Your notes</h2>

On arrival the screen shows three skeleton rows and "Looking for your notes on GitHub…", with a count once it's known ("12 of 30"), while it lists the account's repositories and checks which ones are Focus Notes workspaces (those copied from the template, with `.focus-notes/workspace.json`). The listing starts as soon as *Connect* has the account, so it's usually done when this step appears (prefetch on intent, PRF-13). A template repository (GitHub's *Template repository* setting) and the template itself are never listed, here or in *Open from GitHub* (D-147). People who started in the browser already have theirs.

| Situation | What the screen offers |
| --- | --- |
| **The account has notes** | **We found your notes**: each workspace's name, when it was last updated, and whether it's *Public* or *Private*, with [Open] on each. It goes in a folder named after the repository, `Documents/<name>` (or the first free `<name> 2`, `<name> 3` beside it; D-155), with its private notes when this account can reach them; if it can't: "Private notes aren't available to this account. You can still work with public notes." A new note there is marked *Public · not backed up*, and before its first backup the app asks once: *Make it public* or *Keep it on this computer only* (D-158). A quiet *Create new notes instead* goes to *Create my notes*. |
| **No notes yet** | **Create my notes**: "Your notes stay private unless you choose to share one. They're saved on this computer and backed up to your GitHub account." [Create my notes], with the defaults: `notes` and `notes-private`, `Documents/notes` (the folder is named after the notes' repository, D-155), and publishing on (the browser app reads it). |
| **Creating** | The step mark (a rising cloud with a turning ring) and "This takes about a minute." Under it, always shown, the part it's on in words with its number and the elapsed time ("Making your notes on GitHub · 2 of 9 · 14 s"), and the list of parts in plain words (D-124, D-149), each ticking off as it finishes, in this order: Sign in to GitHub · Make your notes on GitHub · Make a place for private notes · Let your website read them · Download to this computer · Link them · Save the browser key · Turn on your website · Save to GitHub. *Download to this computer* shows its percentage from Git's progress (PRF-13). When the notes are on this computer: "Your notes are ready. Backing up carries on in the background." [Continue]. A part that fails turns the mark to a warning and says why in one sentence, with its actions in one row, then *Back* (D-154): [Try again], which runs that part again and then the rest to the end (D-135), and [Start over], which forgets setup's progress (nothing on GitHub or on this computer is removed) and brings back *Create my notes*; names GitHub can't use offer [Start over] alone. *Download to this computer* checks its folder again when it runs: a folder the app chose that has other files by then (and isn't already these notes) is swapped for the next free one beside it, and setup carries on. A folder the person chose that has other files says "That folder already has other files, so your notes can't go there." with [Choose another folder…] (the system's dialog; the part then runs there) and [Use a new folder] (the next free folder beside `Documents/Focus Notes`). *Make your notes on GitHub* starts them from the template inside the app, so it works even when the public template is unreachable (DST-08, D-201); when the sign-in can't add workflows it stops before making anything: "Your GitHub sign-in can't add workflows. Sign in again and allow them." Quitting resumes at the same part ([Desktop and Git → Creating a workspace](../architecture/desktop-and-git.md#creating-a-workspace), D-98). With publishing on, it ends with the site's address. |
| **Opening** (after [Open]) | The same pattern for the parts opening takes: Download to this computer (with its percentage) · Get the private notes · Link them, the part it's on in words, and the elapsed time. |

**More options** (a quiet disclosure under the primary button) holds the rest, where technical words are allowed, each with one plain line:

- **Names in your GitHub account.** "Your notes are kept in two repositories (folders on GitHub): a public one for notes you publish, and a private one." *Public repository* (default `notes`, public because GitHub Pages on free accounts needs it) and *Private repository* (default `notes-private`).
- **Folder.** "Saved on this computer in `Documents/<name>`", with the real folder for the name typed above (`Documents/prabins-notes` for `prabins-notes`; the next free `<name> 2` when that one has other files), following the name as it's typed. The folder is decided again when *Download to this computer* runs, so changing the name changes the folder. A name Windows can't use as a folder is adjusted: trailing dots go (`notes.` → `notes`) and device names get `-notes` (`con` → `con-notes`). [Choose another folder…] (it must be empty or new). No existing folder is ever renamed or moved (D-155). *Just use this computer for now* has no repository, so it keeps `Documents/Focus Notes`. Proposed: that path asks *Where should your notes live?* first, and Settings → Workspace can move the folder later ([Where your notes live → Choosing and moving the folder](notes-folder.md#choosing-and-moving-the-folder), D-214).
- **Publish a website** (GitHub Pages), on or off: "A website for the notes you make public, where you can also read and write in any browser."
- **Read private notes in a browser** (optional): "Choose a passphrase to read your private notes on your website. It can't be recovered if you forget it." *Passphrase* and *Confirm passphrase*, below.
- [Open another repository from GitHub…]: search every repository in the account, Focus Notes workspaces first, and open one (it must be a workspace). If it has no private repository, deploy key, or vault yet, *Run setup again* does the missing parts. Opening into a folder chosen under *More options* that already has other files says so, with [Choose another folder…], [Use a new folder] and *Back* (D-154).
- [Open a folder on this computer…]: pick an existing clone. The app checks that it's a Git repository with the expected layout ([Content model](../architecture/content-model.md#workspace-layout)) and fetches any missing submodule.
- **A template is never your notes (D-147, D-157).** A template repository (GitHub's `is_template`, or the Focus Notes template by name, in any letter case) has a workspace file but is something to copy. It's never listed, and every other way in refuses it too: opening or downloading it from GitHub, a folder on this computer whose `origin` is one, switching to it, and each setup part that makes, downloads, or saves to a repository by that name. Each says "That's a template repository, not your notes." and offers your own notes or *Create my notes*. Saving never pushes to one either ([Desktop and Git → Save and sync](../architecture/desktop-and-git.md#save-and-sync)).

**The browser passphrase** (the vault, SEC-08, FRE-08) opens the private notes in a browser, read-only. It's optional and never on the main path: leaving it empty skips the *Save the vault's key* part, so the site publishes public notes only until it's set. When typed, it must be strong (at least 12 characters, rated strong, with a plain reason when it's too weak) and confirmed. Only its derived key is saved, in `private/access.json` ([The vault](../architecture/repository-and-publishing.html#the-vault)). The strength check is `passphraseStrength` from `packages/seal`. People who set up in a terminal can run `node packages/seal/src/cli.ts vault-init --private private` in a clone instead: it reads the passphrase from standard input, refuses weak ones, and writes only the derived key, through the same code as the app. Asking for it the first time the person turns on reading private notes in a browser, in Settings, is planned (D-124).

After cloning, the app checks out the private submodule on `main` instead of a detached HEAD and sets `push.recurseSubmodules=check`. It leaves `submodule.recurse` off and syncs `private/` as its own repository, so a recursive pull can't reset it to the older publishing pointer (D-47, [Repository and publishing](../architecture/repository-and-publishing.html#working-with-the-submodule)).

**Writing starts before setup finishes.** As soon as the workspace is on this computer and linked (*Download to this computer* and *Link them* are done), [Continue] opens it, even if a later part failed: a failed *Turn on GitHub Pages* or *Save to GitHub* can be retried from the details, and saving pushes anyway. The first deploy (which can take a few minutes) carries on on GitHub. A failure there never blocks writing. The workspace opens only once linking is done, so setup's own commits never meet the app's (D-101). Later, **Settings → Workspace** → *Run setup again* walks these steps again and repeats only what's missing (D-103).

Opening a workspace (made, cloned, or chosen) keeps its folder in the app's data folder, moves the file watcher and Git to it, and changes the window to it **in place** at *Ready*: the app builds the new workspace's views behind setup and swaps them in one frame, without reloading the page, so the window never flashes blank or white (DSK-09, D-148; [Desktop and Git → The workspace folder](../architecture/desktop-and-git.md#the-workspace-folder)).

**No step is ever silent (PRF-13, D-149).** Every step that waits names the work where it happens: *Connect to GitHub* says "Getting a code from GitHub…" until the code shows, the code card counts the time it has waited and offers [Cancel], the profile card shows its skeleton while the account is read, and opening a folder says "Checking this folder…" past a second. A single unnamed "busy" state for a whole step is a defect ([Perceived performance → The wait inventory](../architecture/perceived-performance.md#the-wait-inventory)). The title bar band stays the window's throughout, so the window can always be moved.

## Bringing notes from a browser

Notes written in a browser stay there until they're moved (FRE-10). In the browser, ⋯ → **Export my notes…** saves them as one file. On the desktop, **Ready**'s *Bring notes from a browser…*, or ⋯ → **Import notes…** later, opens that file, lists its notes, and adds them to the instance: **private** by default, or public if chosen, as ordinary commits. A name that's taken keeps both versions. The browser keeps its copies until they're deleted there ([Desktop and Git → Importing notes from a browser](../architecture/desktop-and-git.md#importing-notes-from-a-browser)).

## Account settings

The account pill's menu has the save state, *Save to cloud* (D-132), and *Sign out of GitHub* ([Main UI](main-ui.html), D-101). **Settings → Account** and **→ Workspace** (desktop, [Secondary views → Settings](../design/views/secondary-views.md#settings), D-103) show the signed-in account, which helper holds the credential, and the workspace, with:

- **Switch account:** signs in again through the same helper, on this first run's *Connect* card shown alone. The current credential leaves Git's helper first, and comes back if no one signs in.
- **Sign out:** asks first. By default it removes the GitHub credential from Git's helper (`git credential reject`, or `gh auth logout`), which signs out the terminal too; *Keep it for the terminal* signs out only Focus Notes, and *Sign in…* then offers *Continue as @login*. Either way the recent note and setup's progress are deleted ([Data inventory](../architecture/security-and-privacy.md#data-inventory)). The screen links to GitHub's settings to fully revoke a token or authorization.
- **Run setup again** (*Connect to GitHub* when the folder isn't saved to GitHub yet): forgets setup's progress and walks these steps from *Connect*, so any step can be repeated, for example to turn on publishing later. <kbd>Esc</kbd> on *Connect* goes back to writing. A folder that was used on this computer only stays where it is and is never where setup downloads to: the new notes go in a free folder beside it, chosen by the app (D-154); bringing its notes in is planned (D-124).
- **Open another workspace from GitHub…** (when signed in): this first run's *Your notes* card shown alone, with the notes the account has and *Open another repository from GitHub…*, so a signed-in person can switch to an existing workspace without running setup again. <kbd>Esc</kbd> goes back to writing (D-124).
- **Remove this workspace from this computer:** only once everything in both repositories is on GitHub (otherwise it offers *Sync now* first); it deletes the local clone and what the data inventory lists, and the first run starts again at *Your notes*.

## Acceptance checks

- **FRE-01:** On a clean Windows computer with Git for Windows, a writer gets from launch to typing in their own new workspace in 4 screens or fewer (Welcome, Connect, Your notes, Ready), using only the keyboard, and the main path never shows the words repository, Git, commit, token, credential, CLI, instance, or Pages.
- **FRE-02:** *Connect to GitHub* signs in with a device code through Git Credential Manager or the GitHub CLI, the code shown in the app whenever the helper prints it (D-142); Git Credential Manager's browser sign-in (*Having trouble?* → *Sign in in the browser instead*) and a pasted fine-grained token also work. Declining, expiry, and going offline each recover without restarting the app.
- **FRE-03:** After sign-in, `git push` from a separate terminal in the workspace succeeds without a prompt.
- **FRE-04:** With an existing working Git credential, no sign-in step is shown beyond *Continue as @login*.
- **FRE-05:** A commit made by the app in the notes has the account's name and its noreply address, without a step, and Git's global name and email are unchanged.
- **FRE-06:** An account with a Focus Notes workspace sees *We found your notes* and opens it with one press; cloning a workspace without access to the private repository finishes and shows public notes only; a new note there shows *Public · not backed up*, and nothing of it is committed or pushed until the writer answers *Make it public* (D-158).
- **FRE-07:** After *Sign out*, the next `git fetch` in the terminal asks for credentials.
- **FRE-08:** *Create my notes* leaves two repositories, a linked submodule, a read-only deploy key, the Actions secret, and a live Pages site, all in the user's account; with a passphrase under *More options*, also the owner's grant in `private/access.json` holding only its derived key, and a vault that opens with it; and the app made no network request except to GitHub.
- **FRE-09:** A first visit to an instance's site opens the newest public note or the welcome note, with no sign-in, and a network capture shows no request except to the site itself.
- **FRE-10:** Importing an exported bundle adds its notes to the private repository by default in ordinary commits, keeps both versions on a name clash, and deletes nothing in the browser.

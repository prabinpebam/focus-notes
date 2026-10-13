# Web app

How Focus Notes runs from your own GitHub Pages site: one repository is your whole instance, the app writes locally first in the browser, public and private notes sync to your repository and its private submodule, and visitors see only your public notes. Nothing runs on a server.

> [!NOTE]
> **TL;DR.** One repository is a whole instance ([D-84](../plan/decisions.md), [D-87](../plan/decisions.md)): **public notes in `notes/`**, a **private repository linked at `private/`** as a submodule (as in the owner's personal-site), and a *Deploy app* workflow that publishes the app to **its own GitHub Pages site**. People who just want to use Focus Notes copy the small **template repository** (not the source repository) to make their instance; its workflow deploys the released app, so they never build it or download the desktop app from GitHub Releases; people who want to improve it fork the project repository, which is also the owner's own instance. Anyone without the owner's token is a **visitor**: they see only public notes, plus **Use this app for yourself**. The app knows its repository from its own address. The owner connects once, and from then on notes live in that browser's **IndexedDB** and work offline. **Connect GitHub**: make the private repository and one **fine-grained token** for both repositories from pre-filled GitHub pages, and paste the token ([D-81](../plan/decisions.md)). The app then commits public notes to your repository and private notes to the private one through the **GitHub REST API**, and pulls changes made elsewhere; a note changed in two places keeps both versions ([D-82](../plan/decisions.md)). Covers PKG-05, PKG-07, PKG-08, DST-02, and FRE-09.

## The picture

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **Your repository** | `github.com/you/notes`, made from the template (public: GitHub Pages on free plans needs it) | Your **public notes** in `notes/` and the *Deploy app* workflow, which deploys the released app at a pinned version. The project repository is the same shape plus the app's source, and it builds the app from source. |
| **Your private repository** | `github.com/you/notes-private` (private), linked at `private/` | Your **private notes** in `notes/`, and synced settings in `.focus-notes/`. Never deployed. |
| **Your site** | `https://you.github.io/notes/` | Serves the app and your public notes (for visitors, and from M5 as read-only pages too). Static files only. |
| **Your browser** | IndexedDB, per site | Notes, settings, unsynced changes, and the encrypted token. |
| **GitHub's API** | `api.github.com` | The only place the app sends anything. It accepts calls from web pages (CORS) with a token. |

The project runs nothing and registers nothing: no OAuth app, no server, no telemetry (D-21, PKG-06). The only hosting is GitHub Pages (each instance's own site) and GitHub Releases (the desktop app and the web app bundle). The owner's Pages site is the owner's own app; others use their own instances (D-87).

## Getting your own instance

1. Copy the Focus Notes **template repository** into your account (**Use this template**, or clone it and push it to a new repository); this copy is your instance. You don't need the source repository. Keep it public.
2. In your instance, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Run the **Deploy app** workflow (it also runs on every push to `main`). It downloads the released web app at the version it pins, checks its checksum and attestation, and deploys it with your public notes. When it finishes, open `https://<you>.github.io/<repository>/`.

Prefer the desktop app? Download it from the latest GitHub Release instead (or as well); it opens the same instance. Want to change the app itself? Fork the project repository; its *Deploy app* workflow builds the app from source. The *Use this app for yourself* dialog and the README give these same steps (DST-01). The app is built with relative paths, so it works under any repository name. Updates arrive as pull requests that move the pinned version (DST-06); merging one redeploys.

## Connecting GitHub

The app reads its repository from its address: on `https://you.github.io/notes/` it's `you/notes`. A browser that hasn't connected opens in **visitor mode** (D-88), so the first screen is the same for the owner and for anyone else (FRE-09):

| Choice | What happens |
| --- | --- |
| **I own this site: Connect GitHub** | Three short steps, each opening a pre-filled GitHub page in a new tab and coming back. Once the token can write to this repository, this browser is the owner's, and writing starts. |
| **Use this app for yourself** | Explains how Focus Notes works and how to get your own instance or the desktop app (DST-01). |
| *Close* | Keeps reading the public notes, read-only. |

1. **Your private repository.** Opens `github.com/new` pre-filled: `<repository>-private`, private. Already have one? Type its name instead.
2. **Your token.** Opens `github.com/settings/personal-access-tokens/new` pre-filled: name *Focus Notes*, a description, **Contents: read and write**, and a one-year expiry. GitHub's form can't pre-select repositories, so the step says: choose **Only select repositories**, then your instance repository and your private repository.
3. **Paste and check.** The app checks the token against both repositories and shows who you're signed in as. If `private/` isn't linked yet, it links it (one commit adding `.gitmodules` and the submodule entry). Errors say what to fix: a wrong name, a token without access to one of the repositories, a read-only token, an expired token, or being offline.

Why a token rather than *Sign in with GitHub*: GitHub's sign-in endpoints don't accept calls from web pages, so a static site could only use them through a server or a registered app, both ruled out (D-21). github.dev and Codespaces can't be driven from another site either, so the app links to them (*Open in github.dev*) rather than writing through them.

**After connecting:** the trigger's ⋯ menu has **Sync now** and **Sign out of GitHub** (deletes the token from this browser; notes stay). When the token is about to expire, the trigger offers **Renew token**, which opens the same pre-filled link.

## Visitors and the owner

Whoever opens an instance's site without its owner's token is a **visitor** (PKG-09). Visitors see the instance's public notes, read-only: the canvas shows a note, and *Open…* lists the public notes. They never see private notes (those aren't on the site at all), can't edit, and nothing syncs. The trigger's toolbar has **Use this app for yourself** (DST-01), a dialog that says:

- Focus Notes is a writing app you run yourself: your notes live in your own GitHub repositories, your app runs on your own GitHub Pages site, and nothing goes through a server, including the person whose site you're on.
- **Get your own:** create a GitHub account (if you don't have one), make your instance from the template, turn on GitHub Pages, open your site, and connect. Each step links to GitHub's own page.
- **Or download the desktop app** for Windows, macOS, or Linux from the latest GitHub Release.

The **owner** is whoever has connected with a token that can write to the instance repository, in this browser. The deploy publishes public notes with the site (a `notes/` folder and an index), so visitors read them without calling GitHub's API.

## Public and private notes

Every note is private or public (SHR-01, SHR-02); new notes are private. A private note is stored as `notes/<path>` in the private repository; a public note as `notes/<path>` in your repository. Changing a note's visibility moves it between the two in one sync (FIL-06). The Files panel shows one tree, with a mark on public notes. Outside an instance's Pages site (desktop, local development), notes written before connecting keep their visibility and go to the right repository on the first sync.

## Storage and sync

**IndexedDB** (database `focus-notes`):

| Store | Holds |
| --- | --- |
| `notes` | One record per note: path, visibility, text, the Git blob SHA it was last synced at, whether it changed here, and when. |
| `meta` | App state (last note, appearance), each repository's last synced commit and tree, and the encrypted token. |

Unsynced changes are the notes marked as changed, plus deletion markers. The app asks the browser to keep its storage (`navigator.storage.persist()`), so it isn't cleared under storage pressure.

**Pushing** (after a short pause in typing, on *Save*, and when going back online): each repository's changes are folded into one commit through the Git Data API: blobs, a tree on top of the last synced tree, a commit, then a fast-forward update of the branch. If the branch moved, the app pulls and retries. A push that changes nothing makes no commit.

**Pulling** (on open, when the page becomes visible, and every five minutes): the app compares each repository's current tree with the last synced one and fetches only changed notes. An open note that changed elsewhere reloads, unless it has unsynced changes here.

**Conflicts:** a note changed both here and on GitHub keeps the text from here, and the GitHub version is saved beside it as `Name (conflict 2026-10-13).md`, with a toast. No text is ever lost (PKG-08).

**Limits:** the REST API allows 5,000 requests an hour per token, and a sync of a few notes costs a handful. Files over 1 MB aren't synced from the browser.

## Security

- **The token** is encrypted at rest with an AES-GCM key that WebCrypto creates as **non-extractable**, kept in IndexedDB. It's decrypted only in memory, sent only to `https://api.github.com`, and never logged. It can reach only the two repositories you select.
- **The page** has a strict Content Security Policy: scripts and styles only from the site itself, `connect-src` only `'self'` and `https://api.github.com`, no inline scripts, and no third-party code. Markdown is never rendered as raw HTML (SEC-02). Trusted Types follow with sanitized paste (WP-1.3).
- **Private notes** are never part of the deployed site. Only public notes are published, and from M5, sealed share pages (SHR-04).

## What the desktop app adds

The desktop app ([Desktop and Git](desktop-and-git.md)) is the second way to use your instance: you download it from the latest GitHub Release (or build it, if you've forked the source). It clones the same repository with its `private/` submodule, runs real Git, signs in through Git's own helpers, and has its own window. Both work on the same repositories, so you can use either. Outside an instance's Pages site (the desktop app, or the app served locally while developing), there are no visitors, and you can write at once and connect later.

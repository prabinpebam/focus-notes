# Web app

How Focus Notes runs from your own GitHub Pages site: one repository is your whole instance, the app writes locally first in the browser, and public and private notes sync to your repository and its private submodule. Nothing is hosted by anyone else.

> [!NOTE]
> **TL;DR.** Your copy of the Focus Notes repository is your instance ([D-84](../plan/decisions.md)): the app's source, its *Deploy app* workflow, the docs, **public notes in `notes/`**, and a **private repository linked at `private/`** as a submodule, as in the owner's personal-site. The workflow deploys the app to **your own GitHub Pages site**; nobody hosts anything for anyone else, and the owner's site is just the owner's own app ([D-86](../plan/decisions.md)). The app knows its repository from its own address. You can write at once: notes live in your browser's **IndexedDB** and work offline. **Connect GitHub** once: make the private repository and one **fine-grained token** for both repositories from pre-filled GitHub pages, and paste the token ([D-81](../plan/decisions.md)). The app then commits public notes to your repository and private notes to the private one through the **GitHub REST API**, and pulls changes made elsewhere; a note changed in two places keeps both versions ([D-82](../plan/decisions.md)). Covers PKG-05, PKG-07, PKG-08, DST-02, and FRE-09.

## The picture

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **Your repository** | `github.com/you/focus-notes` (public: GitHub Pages on free plans needs it) | The app's source, the *Deploy app* workflow, the docs, and your **public notes** in `notes/`. |
| **Your private repository** | `github.com/you/focus-notes-private` (private), linked at `private/` | Your **private notes** in `notes/`, and synced settings in `.focus-notes/`. Never deployed. |
| **Your site** | `https://you.github.io/focus-notes/` | Serves the app, and (from M5) your public notes as read-only pages. Static files only. |
| **Your browser** | IndexedDB, per site | Notes, settings, unsynced changes, and the encrypted token. |
| **GitHub's API** | `api.github.com` | The only place the app sends anything. It accepts calls from web pages (CORS) with a token. |

The project runs nothing, registers nothing, and distributes nothing: no OAuth app, no server, no product site, no downloads for others, no telemetry (D-21, PKG-06, D-86). The owner's own repository is simply one more instance.

## Getting your own instance

1. On the Focus Notes repository, choose **Use this template** (or fork it) into your account. Keep it public.
2. In your copy, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Run the **Deploy app** workflow (it also runs on every push to `main`). When it finishes, open `https://<you>.github.io/<repository>/`.

The README says exactly this; there's no other getting-started page (DST-01). The app is built with relative paths, so it works under any repository name. Updating is bringing your copy up to date with upstream Focus Notes (*Sync fork*, or a pull request for template copies); the app's code, workflows, and docs never touch `notes/` or `private/`, so updates can't change your notes (DST-06). The workflow then redeploys.

## Connecting GitHub

The app reads its repository from its address: on `https://you.github.io/focus-notes/` it's `you/focus-notes`. The first run offers two ways to start (FRE-09):

| Choice | What happens |
| --- | --- |
| **Start writing** | Opens the canvas at once. Notes stay in this browser until you connect. |
| **Connect GitHub** | Three short steps, each opening a pre-filled GitHub page in a new tab and coming back. |

1. **Your private repository.** Opens `github.com/new` pre-filled: `<repository>-private`, private. Already have one? Type its name instead.
2. **Your token.** Opens `github.com/settings/personal-access-tokens/new` pre-filled: name *Focus Notes*, a description, **Contents: read and write**, and a one-year expiry. GitHub's form can't pre-select repositories, so the step says: choose **Only select repositories**, then your Focus Notes repository and your private repository.
3. **Paste and check.** The app checks the token against both repositories and shows who you're signed in as. If `private/` isn't linked yet, it links it (one commit adding `.gitmodules` and the submodule entry). Errors say what to fix: a wrong name, a token without access to one of the repositories, a read-only token, an expired token, or being offline.

Why a token rather than *Sign in with GitHub*: GitHub's sign-in endpoints don't accept calls from web pages, so a static site could only use them through a server or a registered app, both ruled out (D-21). github.dev and Codespaces can't be driven from another site either, so the app links to them (*Open in github.dev*) rather than writing through them.

**After connecting:** the trigger's ⋯ menu has **Sync now** and **Sign out of GitHub** (deletes the token from this browser; notes stay). When the token is about to expire, the trigger offers **Renew token**, which opens the same pre-filled link.

## Public and private notes

Every note is private or public (SHR-01, SHR-02); new notes are private. A private note is stored as `notes/<path>` in the private repository; a public note as `notes/<path>` in your repository. Changing a note's visibility moves it between the two in one sync (FIL-06). The Files panel shows one tree, with a mark on public notes. Before connecting, notes keep their visibility in the browser and go to the right repository on the first sync.

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

The desktop app ([Desktop and Git](desktop-and-git.md)) is the second way to use your instance: it clones the same repository with its `private/` submodule, runs real Git, signs in through Git's own helpers, and has its own window. You build it from your copy (DST-03, DST-04). Both work on the same repositories, so you can use either.

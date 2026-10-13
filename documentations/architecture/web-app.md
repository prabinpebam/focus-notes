# Web app

How Focus Notes runs from each user's own GitHub Pages site: local first in the browser, synced to the user's own repository, with no server and no app registration anywhere.

> [!NOTE]
> **TL;DR.** The web app is the primary way to use Focus Notes ([D-80](../plan/decisions.md)). You make your own copy of the Focus Notes repository (*Use this template* or fork) and turn on GitHub Pages; GitHub Actions builds the app and deploys it to your site. You can write at once: notes live in your browser's **IndexedDB** and work offline. **Connect GitHub** once by pasting a **fine-grained token** made from a pre-filled GitHub link and limited to your notes repository ([D-81](../plan/decisions.md)). The app then commits changes through the **GitHub REST API** (several files per commit) and pulls changes made elsewhere; a note changed in two places keeps both versions ([D-82](../plan/decisions.md)). Notes go to a separate **notes repository**, private by default, because Pages on free plans needs the app's repository to be public. Covers PKG-05, PKG-07, PKG-08, DST-02, and FRE-09.

## The picture

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **Your app repository** | `github.com/you/focus-notes` (public), your copy of this repository | Holds the app's source. Its *Deploy app* workflow builds the web app and publishes it to your Pages site on every push to `main`. |
| **Your site** | `https://you.github.io/focus-notes/` | Serves the app: static files only. Nothing on it can see your notes. |
| **Your browser** | IndexedDB, per site | Notes, settings, the outbox of unsynced changes, and the encrypted token. |
| **Your notes repository** | `github.com/you/notes` (private by default) | Every note as a Markdown file, with history. The same repository the desktop app uses. |
| **GitHub's API** | `api.github.com` | The only place the app sends anything. It accepts calls from web pages (CORS) with a token. |

The project runs nothing and registers nothing: no OAuth app, no client ID, no server, no telemetry (D-21, PKG-06).

## Running on your own Pages

1. On the Focus Notes repository, choose **Use this template** (or fork it) into your account. Keep it public: free GitHub plans serve Pages only from public repositories.
2. In your copy, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Run the **Deploy app** workflow (it also runs on every push to `main`). When it finishes, open `https://<you>.github.io/<repository>/`.

The workflow builds with the site's path as the base, so the app works under any repository name. Updating is pulling the latest Focus Notes into your copy (a fork's *Sync fork* button, or a pull request); the workflow redeploys.

## Connecting GitHub

The first run offers two ways to start (FRE-09):

| Choice | What happens |
| --- | --- |
| **Start writing** | Opens the canvas at once. Notes stay in this browser until you connect. |
| **Connect GitHub** | Three short steps, each opening a pre-filled GitHub page in a new tab and coming back. |

The three steps:

1. **Your notes repository.** Opens `github.com/new` pre-filled (name `notes`, private, with a README). Or type the name of one you already have.
2. **Your token.** Opens `github.com/settings/personal-access-tokens/new` pre-filled: name *Focus Notes*, a description saying what it's for, **Contents: read and write**, and a one-year expiry. GitHub's form can't pre-select repositories, so the step says: under *Repository access*, choose **Only select repositories** and pick your notes repository.
3. **Paste and check.** The app calls `GET /user` and `GET /repos/{owner}/{repo}` with the token and shows who you're signed in as and which repository it reaches. It refuses a token that can write to more than the chosen repositories when GitHub reports that, and explains how to fix it.

Why a token rather than *Sign in with GitHub*: GitHub's sign-in endpoints (`github.com/login/oauth/access_token` and the device-code endpoints) don't accept calls from web pages, so a static site can only use them through a server or a registered app, both ruled out (D-21). github.dev and Codespaces can't be driven from another site either, so the app links to them (*Open in github.dev*) rather than writing through them.

**After connecting:** Settings → Account shows the account, repository, branch, and when the token expires, with **Sign out** (deletes the token from this browser) and **Change repository**. Two weeks before expiry, the trigger's status row offers **Renew token**, which opens the same pre-filled link.

## Storage and sync

**IndexedDB** (database `focus-notes`):

| Store | Holds |
| --- | --- |
| `notes` | One record per note: path, text, the Git blob SHA it was last synced at, and when it changed. |
| `outbox` | Unsynced changes in order: write or delete, with the text. Survives reloads and offline time. |
| `meta` | App state (last note, appearance), the connection (owner, repository, branch, the last synced commit and tree), and the encrypted token. |

The app asks the browser to keep this storage (`navigator.storage.persist()`), so it isn't cleared under storage pressure. Until you connect, *Settings → Export notes* downloads them as a ZIP.

**Pushing** (after a short pause in typing, on *Save*, and when going back online): the outbox is folded into one commit through the Git Data API:

1. Create a blob for each changed note.
2. Create a tree on top of the last synced tree, with the new blobs and any deletions.
3. Create a commit with that tree and the last synced commit as its parent.
4. Move the branch to it with a fast-forward update.

If GitHub refuses the update because the branch moved, the app pulls, then retries the push. A commit's message names the notes it changes ("Update On focus").

**Pulling** (on open, when the window regains focus, and every five minutes while visible): the app reads the branch head; if its tree differs from the last synced one, it compares the two trees and fetches only the blobs that changed.

**Conflicts:** a note changed both here and on GitHub since the last sync keeps the text from here, and the GitHub version is saved beside it as `Name (conflict 2026-10-13).md`, with a toast that names both. No text is ever lost (PKG-08).

**Limits:** the REST API allows 5,000 requests an hour per token; a sync of a few changed notes costs four to six. Files over 1 MB aren't synced from the browser in this stage and are left alone.

## Security

- **The token** is encrypted at rest with an AES-GCM key generated by WebCrypto as **non-extractable** and kept in IndexedDB, so it can't be read from the browser's files without the browser itself. It's decrypted only in memory, sent only in the `Authorization` header to `https://api.github.com`, and never logged.
- **The page** has a strict Content Security Policy: scripts only from the site itself, `connect-src` only `'self'` and `https://api.github.com`, no inline scripts, no third-party code, and Trusted Types where the browser supports them. Markdown is never rendered as raw HTML (SEC-02).
- **Scope:** the token can read and write only the repositories you select. Losing it means someone could change those notes until you revoke it on GitHub, which *Sign out* links to.

## What the desktop app adds

The desktop app ([Desktop and Git](desktop-and-git.md)) runs real Git on a local folder: full history, the private submodule, signing in through Git's own helpers, and the custom window. The web app and the desktop app read and write the same notes repository, so you can use both.

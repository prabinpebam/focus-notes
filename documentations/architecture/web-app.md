# Web app

How Focus Notes runs from your own GitHub Pages site: notes you write are kept in this browser, your instance's public notes open read-only, and your private notes open read-only once you unlock them with your passphrase. The browser never signs in to GitHub and never writes to a repository; the desktop app does that. Nothing runs on a server.

> [!NOTE]
> **TL;DR.** One repository is a whole instance ([D-84](../plan/decisions.md), [D-87](../plan/decisions.md)): **public notes in `notes/`**, a **private repository linked at `private/`** as a submodule, and a *Deploy app* workflow that publishes the app to **its own GitHub Pages site**. The web app there does three things ([D-90](../plan/decisions.md)): it keeps **your notes in this browser** (IndexedDB, no account, offline, never sent anywhere); it shows the instance's **public notes**, read-only; and after **Unlock** with the owner's vault passphrase it shows the instance's **private notes**, read-only, decrypted in the browser. *Copy to my notes* makes an editable copy of any read-only note. The browser **never signs in to GitHub, holds no GitHub credential, and never writes to a repository**: the [desktop app](desktop-and-git.md) is the only client that does. *Export my notes* saves the browser's notes as one bundle that the desktop app imports into the instance. Until a browser unlocks, it shows the **visitor view**: public notes, the browser's own notes, and **Use this app for yourself**. Covers PKG-05, PKG-07 to PKG-11, FRE-09, DST-01, and DST-02.

## The picture

| Piece | Where it lives | What it does |
| --- | --- | --- |
| **Your repository** | `github.com/you/notes`, made from the template (public: GitHub Pages on free plans needs it) | Your **public notes** in `notes/` and the *Deploy app* workflow, which deploys the released app at a pinned version. The project repository is the same shape plus the app's source, and it builds the app from source. |
| **Your private repository** | `github.com/you/notes-private` (private), linked at `private/` | Your **private notes** in `notes/`, synced settings in `.focus-notes/`, and `access.json`: share grants and the vault's grant for you. Never deployed in plaintext. |
| **Your site** | `https://you.github.io/notes/` | Serves the app, your public notes (`/notes/`), and your private and shared notes **as ciphertext only** (`/_access/`, `/_sealed/`). Static files only. |
| **Your browser** | IndexedDB, per site | The notes you wrote in this browser, the app's state, and, only if you choose *Remember on this browser*, a non-extractable key that opens the vault. |
| **GitHub** | `github.com` | The browser never calls it. Only the desktop app (with Git's own sign-in, D-21) and the instance's *Deploy app* workflow reach your repositories. |

The project runs nothing and registers nothing: no OAuth app, no server, no telemetry (D-21, PKG-06). The only hosting is GitHub Pages (each instance's own site) and GitHub Releases (the desktop app and the web app bundle). The owner's Pages site is the owner's own app; others use their own instances (D-87).

## Getting your own instance

1. Copy the Focus Notes **template repository** (`focus-notes-workspace`) into your account (**Use this template**, or clone it and push it to a new repository); this copy is your instance. You don't need the source repository. Keep it public.
2. In your instance, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Run the **Deploy app** workflow (it also runs on every push to `main`). It downloads the released web app at the version it pins, checks its checksum and attestation, and deploys it with your public notes. When it finishes, open `https://<you>.github.io/<repository>/` and start writing: what you write stays in that browser.

To save notes to your repositories, **download the desktop app** from the latest GitHub Release. Its setup finds this instance, makes the private repository and links it, sets up the read-only deploy key that lets the *Deploy app* workflow seal your private notes, asks for your **vault passphrase**, and imports what you wrote in the browser (FRE-08, FRE-10). Until the desktop setup arrives (M3), the vault can be created from a clone with `node packages/seal/src/cli.ts vault-init --private private`, which reads the passphrase from standard input, refuses weak ones, and writes only its derived key ([The vault](repository-and-publishing.html#the-vault)). Without either, the site has public notes only and no vault. Want to change the app itself? Fork the project repository; its *Deploy app* workflow builds the app from source. The *Use this app for yourself* dialog and the README give these same steps (DST-01, DST-02). The app is built with relative paths, so it works under any repository name. Updates arrive as pull requests that move the pinned version (DST-06); merging one redeploys.

## Three kinds of note

The app reads its instance from its own address: on `https://you.github.io/notes/` it reads `/focus-notes.json` from that site (see [The vault](repository-and-publishing.html#the-vault) for every format). It reads strictly: the public index only at `notes/index.json`, and nothing over its size cap (the site manifest 64 KB, the index 8 MB, each note 8 MB). The Files panel and *Open…* list three kinds of note, under separate roots, so it's always clear which ones you can edit here.

| Kind | Where it comes from | In this browser |
| --- | --- | --- |
| **Your notes** | This browser's IndexedDB | Editable. They never leave this browser, except in a file you export (PKG-07). |
| **Public notes** | The site's `/notes/index.json` and `/notes/<path>`, published by the last deploy | Read-only, marked, with *Copy to my notes* (PKG-08). |
| **Private notes** | The site's vault, after *Unlock* | Read-only, marked, with *Copy to my notes* (PKG-08, PKG-10). |

A read-only note shows a quiet pill in the bottom-left corner, *Read only · Copy to my notes* ([Main UI](../experience/main-ui.html)). Pressing it copies the note into your notes in this browser, with the same title, and opens the copy; if the name is taken, both are kept. The instance's notes are as current as the last deploy, and the browser never changes them.

### Your notes in this browser

- Typing is saved to IndexedDB within a second. Notes survive reloads, work offline, and need no account (PKG-07).
- A note's name follows its title, as on the desktop (FIL-07): typing *Offline thoughts* into a new note keeps it as `offline-thoughts.md`. The browser's notes are never published, so their names always follow (a name chosen by hand, like `Welcome.md`, is kept).
- The browser's notes, with the instance's read-only ones, are one workspace ([Content model → The workspace model](content-model.md#the-workspace-model)). Their format is kept in IndexedDB, and notes saved by a newer Focus Notes open read-only here (DST-05).
- The app asks the browser to keep its storage (`navigator.storage.persist()`), so it isn't cleared under storage pressure. It says plainly that clearing the site's data in the browser deletes these notes, and points to *Export my notes* and the desktop app.
- Each browser and each site keeps its own notes: what you write in one browser isn't in another.
- On a first visit the app opens the newest public note, if there is one, or a welcome note kept in this browser, which says that notes written here stay in this browser and that the desktop app saves to GitHub (FRE-09). There's nothing to sign in to.

### Unlocking private notes

When `/focus-notes.json` says the site has a vault, the account pill shows a quiet **Unlock** link (UI-12), and the ⋯ menu has **Unlock private notes…** (PKG-10).

| Step | What happens |
| --- | --- |
| **Ask** | A small dialog: a passphrase field, ☐ **Remember on this browser**, and [Unlock], with the shared-origin warning **always** shown: "Other pages at `<you>.github.io` can run code on this page, so they could capture this passphrase or read your unlocked notes. A custom domain for your site prevents this." |
| **Open** | The app reads the vault's keyring for the current build, checks it strictly (only `pbkdf2-sha256` at exactly 600,000 iterations, a 16-byte salt, a 12-byte IV, under 64 KB), derives the key (about half a second on a phone), and opens the keyring, then the sealed manifest it points to. |
| **Read** | The private notes appear under their own root with their titles and folders. Each one is fetched and decrypted when it's opened, and shown read-only. |
| **Wrong passphrase** | One generic message: "That passphrase doesn't open this site's private notes." Nothing else is revealed. |

- **Locked by default.** The key lives only in memory, so the vault locks when the page closes or reloads.
- **Remember on this browser** imports the derived key as a **non-extractable** AES-GCM `CryptoKey` and stores it in IndexedDB with its salt. It opens every later build's keyring until the passphrase changes. Next to it, the warning adds: "Every site at `<you>.github.io` shares this browser's storage, so a script on any of them could use this key. Remember only on a browser you trust." (SEC-08)
- Once unlocked, the account pill shows the owner's name, and its menu offers **Lock** (forgets the key and the decrypted notes in this tab) and **Forget this browser** (also deletes the remembered key).
- After a deploy the build ID changes; the app reads `/focus-notes.json` again and opens the new keyring with the key it holds.
- **A forgotten passphrase can't be recovered.** The notes stay in the private repository, where the desktop app reads them; setting a new passphrase there (**Settings → Workspace**) makes the next deploy seal with it.

### Moving notes between the browser and GitHub

| Action | Where | What it does |
| --- | --- | --- |
| **Export my notes…** | ⋯ menu, in any browser | Saves every note written in this browser as one file, `focus-notes-export-<date>.json` (PKG-11). |
| **Import notes…** | ⋯ menu, in any browser | Adds a bundle's notes to this browser. A name that's taken keeps both versions. A file over 64 MB or with more than 20,000 notes is refused unread. |
| **Import notes** | The desktop app's first run, and later from its ⋯ menu | Adds a bundle's notes to the instance, **private by default** (or public if you choose), as ordinary commits (FRE-10). |

Nothing is deleted on either side: the browser keeps its notes until you delete them. The bundle is checked against `schemas/export-bundle.schema.json`:

```json
{
  "format": "focus-notes/export/v1",
  "exported": "2026-10-14T09:30:00Z",
  "notes": [{ "path": "Ideas/Hello.md", "text": "# Hello\n…", "updated": "2026-10-13T18:02:11Z" }]
}
```

## The visitor view

Until a browser unlocks the instance's private notes, it shows the **visitor view**, for everyone, the owner included (PKG-09): the public notes, read-only; the notes written in this browser; and a quiet **Use this app for yourself** in the bottom-left corner (also in Spotlight). There's no owner sign-in: the passphrase is the only thing that sets the owner apart, and private notes stay ciphertext for everyone else. Anyone can still write their own notes, kept only in their own browser.

**Use this app for yourself** opens [a dialog](../design/views/get-started.md) (DST-01) that says:

- Focus Notes is a writing app you run yourself: your notes live in your own GitHub repositories, your app runs on your own GitHub Pages site, and nothing goes through a server, including the person whose site you're on.
- **Get your own:** create a GitHub account (if you don't have one), make your instance from the template, turn on GitHub Pages, and write in your site's browser (kept in that browser). Each step links to GitHub's own page.
- **Download the desktop app** for Windows, macOS, or Linux from the latest GitHub Release to save your notes to your repository.

## What the browser never does

- It never signs in to GitHub, never asks for or holds a token or any other GitHub credential, never calls GitHub's API, and never writes to a repository (PKG-05, SEC-03).
- It never sends your notes anywhere. Its only requests go to its own site: the app's files, `/focus-notes.json`, `/notes/`, `/_access/`, and `/_sealed/`.
- It never stores the vault passphrase, or a private note's path or text. With *Remember on this browser* it stores a non-extractable key derived from the passphrase, and nothing else (SEC-08).
- It never shows the instance's notes as editable. To edit one here, copy it; to change the instance, use the desktop app.

Why: a static site has no simple, consumer-grade way to save to GitHub. A token pasted into a page is hard to make, can't be limited to the right repositories from a link, expires, and would sit on an origin (`<user>.github.io`) shared by every Pages site the user has. GitHub's sign-in can't be used from a static page without a server or a registered app, both ruled out (D-21). So the browser keeps its own notes, and the desktop app is the one GitHub editor (D-90).

## Storage

**IndexedDB** (database `focus-notes`):

| Store | Holds |
| --- | --- |
| `notes` | One record per note written in this browser: path, text, and when it changed. |
| `meta` | `workspaceFormat` (the format of the notes in this browser, as the text of a `workspace.json`, DST-05), `appState` (the last note, appearance, and other per-device state; `schemas/app-state.schema.json`). Its `lastNotePath` is saved only for the browser's own notes and public notes, never a private note's path, so a reload doesn't reopen a private note and, only with *Remember on this browser*, the vault key (a non-extractable `CryptoKey`) and its salt. |

The instance's notes aren't stored in IndexedDB: public notes are read from the site, and decrypted private text is held only in memory while unlocked. The code is `apps/web` (the same app on a browser bridge) and `packages/seal` (the vault's format and reader); `packages/github` keeps the REST client that the desktop setup uses (D-83).

## Security

- **The page** has a strict Content Security Policy: scripts and styles only from the site itself, `connect-src 'self'` only, no inline scripts, and no third-party code. Markdown is never rendered as raw HTML (SEC-02). Trusted Types follow with sanitized paste (WP-1.3).
- **The vault** is sealed by the instance's own *Deploy app* workflow, with fresh keys every build. Its passphrase key is derived with PBKDF2-SHA256 at 600,000 iterations, the desktop setup requires a strong passphrase, and the browser accepts no other parameters, which slows offline guessing of the published keyring (SEC-08).
- **Private notes** are never in the deployed site in plaintext: the leak check fails the deploy if a private note's path (12 characters or more) or a line of its text (24 or more) appears in the output, and never prints what matched (SEC-06).
- **The shared origin.** Every Pages site of one user is the same origin, `<user>.github.io`, so they share the browser's storage, and any page there can script this one: it could capture the passphrase as it's typed or read decrypted notes while the vault is open. That's why the browser holds no credential, why the unlock dialog always shows a warning, why remembering the vault key is opt-in, and why a **custom domain** is the real fix.
- **What stays visible:** that a site has a vault, the size of sealed files, and when deploys happen. Details are in [Security and privacy](security-and-privacy.md).

## What the desktop app adds

The desktop app ([Desktop and Git](desktop-and-git.md)) is the only client that writes to GitHub (PKG-03, D-90). You download it from the latest GitHub Release (or build it, if you've forked the source). It signs in through Git's own helpers (D-21), clones the instance with its `private/` submodule, and edits, commits, and pushes both repositories, so public and private notes are editable there. Its setup asks for the vault passphrase and stores only its derived key in `private/access.json`, and it imports the bundles you export from a browser. The desktop app has no visitor view: it opens your own instance.

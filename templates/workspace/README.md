# My notes

A [Focus Notes](https://github.com/prabinpebam/focus-notes) workspace: plain Markdown notes in my own GitHub account, with an app on my own GitHub Pages site.

- **Public notes** are in `notes/` and are published on this repository's Pages site.
- **Private notes** are in a separate private repository, linked here at `private/`. They're published only as ciphertext, which the vault passphrase opens in a browser, read-only.

## Getting started

1. Keep this repository public: GitHub Pages on free plans serves only public repositories.
2. **Settings → Pages → Source: GitHub Actions**, then **Actions → Deploy app → Run workflow**. It deploys the released app at the version pinned in `.focus-notes/app.json`, after checking its checksum and attestation.
3. Open `https://<your-username>.github.io/<this-repository>/`. Notes written there stay in that browser.
4. To save notes to GitHub, use the Focus Notes desktop app from the [releases page](https://github.com/prabinpebam/focus-notes/releases/latest). Its setup makes the private repository, links it at `private/`, adds a read-only deploy key, and sets your vault passphrase.

## Updates

**Actions → Update app** runs once a week (or **Run workflow** any time). When there's a newer Focus Notes release, it checks the release's checksums and attestation and opens one pull request that changes `.focus-notes/app.json` and the other files listed in `.focus-notes/managed.json`, never your notes. Review it and merge it to deploy the new version; nothing changes until you do.

- Turn on **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**, or the workflow can't open the pull request.
- A workflow's own token can't change workflow files, so when `.github/workflows/` changes, the pull request lists those files for you to copy from the [template repository](https://github.com/prabinpebam/focus-notes-workspace).

## Using Git yourself

```sh
git clone --recurse-submodules https://github.com/<you>/<this-repository>.git
git -C private checkout main
git -C private pull        # pull private/ on its own, never recursively
```

Commit and push in `private/` first, then commit the pointer here. More in [AGENTS.md](AGENTS.md).

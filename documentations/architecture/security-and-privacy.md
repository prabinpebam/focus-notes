# Security and privacy

What Focus Notes protects, from whom, and how. It also covers what's stored where, and the privacy commitments the product makes.

> [!NOTE]
> **TL;DR.** The product runs **no servers and collects nothing**: no telemetry, no analytics, and no third-party requests in the app, the users' sites, or these docs (PRV-01). Each user's data lives on their computer, in their browser, and in their own GitHub repositories. Credentials live only in Git's credential helper, used by the desktop app; **the browser holds no GitHub credential at all** and never writes to GitHub (D-90). The main risks are **leaking private notes** (through publishing, an XSS bug, an agent, or a malicious dependency), **weak passcodes or a weak vault passphrase** facing offline guessing, the **shared `github.io` origin** that every Pages site of a user shares, and the **supply chain** behind code that runs with users' secrets. Controls follow established checklists: OWASP ASVS Level 2, Electron's security checklist, GitHub's Actions hardening guide, and OWASP's guidance on LLM prompt injection for agents.

## What we protect

| Asset | Where it lives | Worst case |
| --- | --- | --- |
| Private and shared notes | `private/` on disk, the private repository, sealed copies on Pages (the vault and share grants) | Published or read by the wrong person |
| GitHub credential (desktop only) | Git's credential helper (OS keychain or Credential Manager) | Account takeover of repositories |
| Share secrets and passcodes | `private/access.json` (private repository) | Shared notes opened by people who weren't given access |
| The vault passphrase | Only in the owner's head. `private/access.json` holds its derived key; a browser holds that key only with *Remember on this browser* (a non-extractable `CryptoKey`) | Every private note readable from the public site |
| Share-link deploy key | The notes repository's Actions secret | Private repository read by a malicious workflow |
| Notes written in a browser | That browser's IndexedDB, on the site's origin | Lost when the site's data is cleared, or read by a script on the same origin |
| The writer's identity | Commit author (the noreply address by default) | Personal email exposed in public history |

## Threats and controls

| Threat | Controls | Requirements |
| --- | --- | --- |
| **Malicious content in a note or pasted HTML** (XSS in the editor or on public pages) | Raw HTML is shown as text in notes. The public renderer sanitizes with an allow-list. Only safe link schemes (`https`, `http`, `mailto`, relative) are allowed. A strict CSP everywhere, with no inline scripts, and Trusted Types in the app. | SEC-02 |
| **Compromised renderer gets system access** (Electron) | `contextIsolation`, `sandbox`, no `nodeIntegration`, a narrow typed preload bridge with validated arguments. Navigation, new windows, and `webview` are denied. A note's links open only through the bridge (`link:open`), which the main process re-checks for `http`, `https`, or `mailto` before handing them to the default browser; the clipboard bridge (`clipboard:write`) writes text and never reads it (D-91). Permission requests are denied by default. No remote content is loaded. Electron fuses: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `OnlyLoadAppFromAsar` on, embedded ASAR integrity validation on. | SEC-01 |
| **Private notes published by mistake** | Private by default. Moving to Public needs confirmation. The pipeline seals the vault and shared notes and **fails the deploy if any private note's path of 12 characters or more, or any line of private text of 24 characters or more, appears** in the output (the leak check). It reports only the file and whether a path or text matched, never the text, because the Actions log is public. The publisher skips symbolic links, and its errors never quote private file names or `access.json` content. | SEC-06 |
| **Guessing share passcodes offline** | Generated passcodes of about 52 bits, a strength check for custom ones, PBKDF2-SHA256 at 600,000 iterations, a salt per grant, and keyrings that refuse other parameters | SHR-07 |
| **Guessing the vault passphrase offline** (its keyring is published with every deploy) | The desktop setup requires a strong passphrase. PBKDF2-SHA256 at 600,000 iterations with a salt per grant, and the browser accepts no other parameters. Only the derived key is stored, in the private repository; the passphrase is never stored or sent. | SEC-08 |
| **Another page on the same `github.io` origin** (every Pages site of one user is the origin `<user>.github.io`: it shares the storage and can script this page, so it could capture the vault passphrase as it's typed, read decrypted notes while unlocked, or use a remembered key) | Only a **custom domain** for the instance's site removes this; the app reduces it. The browser holds no GitHub credential. The unlock dialog **always** shows the shared-origin warning. *Remember on this browser* is opt-in and stores only a non-extractable key; *Forget this browser* deletes it. No private note's path is stored: `lastNotePath` is kept only for the browser's own and public notes. | SEC-03, SEC-08 |
| **Forgotten vault passphrase** | Setup says plainly that it can't be recovered. The notes stay in the private repository, readable in the desktop app, which can set a new passphrase. | SEC-08 |
| **Forwarded links, or access that outlives its welcome** | Expiry by default, withdraw, and fresh keys every build. It's documented honestly that what was read can't be taken back. | SHR-08, SHR-11 |
| **Compromised dependency or release** | Lockfiles, Dependabot, CodeQL, secret scanning with push protection, an SBOM, GitHub artifact attestations, signed installers (DSK-07), and actions pinned by commit SHA | SEC-04, DSK-07 |
| **Compromised Deploy app workflow or web app bundle stealing users' private content** (the workflow runs with their deploy key) | Template instances pin every action by commit SHA and deploy the released web app bundle only at a pinned version, after checking its SHA-256 and attestation (D-48). Updates arrive as pull requests they merge themselves. The workflow checks out `private/` only after every third-party build step (install, tokens, the Vite build), right before publishing, deletes it straight after, uses `persist-credentials: false`, and removes the deploy key with a shell `trap`. | SEC-05 |
| **Stolen or lost laptop** | Notes on disk are protected by the OS account and disk encryption (recommended in the docs). Credentials are in the OS keychain. Sign out clears the app's caches. | PRV-02 |
| **Script injection in the web app** | Strict CSP (`connect-src 'self'` only), no third-party scripts, Markdown never rendered as raw HTML. There's no token to steal, and decrypted private notes exist only in memory while unlocked. | SEC-02, SEC-03 |
| **Hostile or oversized site files or import bundles** (exhausting the browser) | The browser accepts the public index only at `notes/index.json` and caps sizes: the site manifest 64 KB, the index 8 MB, each note 8 MB, a sealed manifest 4 MB, a keyring 64 KB. Import bundles over 64 MB or 20,000 notes are refused unread. | PKG-08, PKG-11 |
| **The vault passphrase seen while typed at a terminal** (`vault-init`, before the desktop setup exists) | It's read from standard input, never from arguments, and not echoed. Weak passphrases are refused. | SEC-08 |
| **Agent misuse or prompt injection** | See [Agents → Risks](agents.md#risks-specific-to-agents) | AGT-03, AGT-09 |
| **Malicious theme or settings file** | Validated against schemas. Values only, never CSS or URLs. | UNSUP-THEME-01 |

## Data inventory

| Data | Location | Who can read it | Removed by |
| --- | --- | --- | --- |
| Public notes | `notes/` in the instance repository, and the instance's Pages site | Anyone | Deleting the note (it stays in public Git history) |
| Private notes | `private/notes/`, the private repository | The user and anyone they gave repository access | Deleting the note (it stays in private history) |
| Shared notes | As private, plus sealed copies on Pages | Audiences with a link or passcode | Withdrawing, then the next deploy |
| The vault (every private note, sealed) | The instance's Pages site only, never Git history; fresh keys every build | Whoever has the vault passphrase | Deleting the note or making it public, then the next deploy |
| Notes written in a browser | That browser's IndexedDB (store `notes`) | The local user, in that browser | Deleting them, or clearing the site's data in the browser |
| Browser app state and the remembered vault key | That browser's IndexedDB (store `meta`: `workspaceFormat`, the notes' format version; `appState`, whose `lastNotePath` never holds a private note's path, and the non-extractable key and its salt only with *Remember on this browser*) | The local user, and scripts on the same origin can use (not read) the key | *Lock* / *Forget this browser*, or clearing the site's data |
| Synced settings and custom themes | `private/.focus-notes/` (D-46), or the notes repository if there's no private repository | As above | Deleting the files |
| Device settings | The app's data folder | The local user | Uninstalling, or Settings → Reset |
| Search index, recent notes, logs | The app's data folder (logs are redacted, rotated, and kept 7 days) | The local user | Sign out, removing the workspace, or uninstalling |
| GitHub credential (desktop only) | Git's credential helper | The local user | Sign out (and revoking it on GitHub) |

## Privacy commitments

1. **No telemetry.** No usage analytics, crash reporting services, or error trackers, in any product surface (PRV-01). Problems are reported by the user: *Copy diagnostic report* puts a redacted report on the clipboard, and *Report a problem* opens a pre-filled GitHub issue that the user reviews before sending (QLT-04). Performance measurements stay on the computer too: the app's timings appear only in the diagnostic report, and published pages are measured in CI lab runs, never in readers' browsers (D-65).
2. **No third-party requests.** The app, the instances' sites (including the owner's, with these docs), and the published pages load nothing from other origins: fonts are self-hosted, and there are no CDNs, embeds, or trackers.
3. **Readers aren't tracked.** Public and shared pages set no cookies. The only browser storage is a share reader's own key, and only if they ask to be remembered. In the app, the browser keeps only the notes written there, its state, and a remembered vault key if the owner chose it, and sends none of it anywhere.
4. **Private by default.** New notes are private (D-05). Agents start with no private access (D-45). Synced preferences live in the private repository (D-46). Notes imported from a browser are private unless the user chooses public (FRE-10).
5. **What a public notes repository and its site reveal,** listed so users can decide: the names of their two repositories (including the private one, in `.gitmodules`), the full history of public notes (including deleted ones), the time of each publishing commit and deploy, that the site has a vault, and the existence and size of sealed files. The private repository can be given any name.
6. **Commits use the noreply address** by default (first run, identity step).

## Supply chain and releases

- Dependencies are pinned by lockfile and updated by Dependabot pull requests that must pass CI. The license check (D-20) runs on every change.
- Every GitHub Action is pinned to a full commit SHA.
- Releases are built in GitHub Actions only, never on a developer's computer. Each one has SHA-256 checksums, a CycloneDX SBOM, and GitHub artifact attestations (build provenance). Installers are code-signed and macOS builds are notarized once signing is in place (DSK-07, D-51). Until then, the release notes say the build is unsigned and show the checksum to verify.
- Updates are checked by electron-updater against GitHub Releases and verified before installing.
- Repository settings: branch protection on `main` (pull request and passing checks), secret scanning with push protection, CodeQL, and the OpenSSF Scorecard.

## Vulnerability reporting and response

- `SECURITY.md` explains how to report privately through GitHub's private vulnerability reporting. We aim to acknowledge within 7 days.
- **A share secret leaks:** withdraw the audience. It stops opening at the next deploy.
- **The share-link key leaks:** Settings → Workspace → *Rotate share-link key* replaces the deploy key and the secret.
- **The vault passphrase leaks:** set a new one in the desktop app; the next deploy seals with fresh keys under it, and remembered keys stop working.
- **A token leaks** (desktop): revoke it on GitHub, then sign in again.
- **A bad release:** template instances, which pin the web app's version, aren't affected until they merge an update. A fixed release supersedes it, and the advisory is published on GitHub.

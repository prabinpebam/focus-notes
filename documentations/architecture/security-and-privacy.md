# Security and privacy

What Focus Notes protects, from whom, and how. It also covers what's stored where, and the privacy commitments the product makes.

> [!NOTE]
> **TL;DR.** The product runs **no servers and collects nothing**: no telemetry, no analytics, and no third-party requests in the app, the users' sites, or these docs (PRV-01). Each user's data lives on their computer and in their own GitHub repositories. Credentials live only in Git's credential helper. The main risks are **leaking private notes** (through publishing, an XSS bug, an agent, or a malicious dependency), **weak share passcodes** facing offline guessing, and the **supply chain** behind code that runs with users' secrets. Controls follow established checklists: OWASP ASVS Level 2, Electron's security checklist, GitHub's Actions hardening guide, and OWASP's guidance on LLM prompt injection for agents.

## What we protect

| Asset | Where it lives | Worst case |
| --- | --- | --- |
| Private and shared notes | `private/` on disk, the private repository, sealed copies on Pages | Published or read by the wrong person |
| GitHub credential | Git's credential helper (OS keychain or Credential Manager) | Account takeover of repositories |
| Share secrets and passcodes | `private/access.json` (private repository) | Shared notes opened by people who weren't given access |
| Share-link deploy key | The notes repository's Actions secret | Private repository read by a malicious workflow |
| Browser token (web, M6) | The browser, encrypted (see below) | Same as the GitHub credential, limited to two repositories |
| The writer's identity | Commit author (the noreply address by default) | Personal email exposed in public history |

## Threats and controls

| Threat | Controls | Requirements |
| --- | --- | --- |
| **Malicious content in a note or pasted HTML** (XSS in the editor or on public pages) | Raw HTML is shown as text in notes. The public renderer sanitizes with an allow-list. Only safe link schemes (`https`, `http`, `mailto`, relative) are allowed. A strict CSP everywhere, with no inline scripts, and Trusted Types in the app. | SEC-02 |
| **Compromised renderer gets system access** (Electron) | `contextIsolation`, `sandbox`, no `nodeIntegration`, a narrow typed preload bridge with validated arguments. Navigation, new windows, and `webview` are denied. Permission requests are denied by default. No remote content is loaded. Electron fuses: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `OnlyLoadAppFromAsar` on, embedded ASAR integrity validation on. | SEC-01 |
| **Private notes published by mistake** | Private by default. Moving to Public needs confirmation. The pipeline seals shared notes and **fails the deploy if any private text or file names appear** in the output (the leak check). | SEC-06 |
| **Guessing share passcodes offline** | Generated passcodes of about 52 bits, a strength check for custom ones, PBKDF2-SHA256 at 600,000 iterations, a salt per grant, and keyrings that refuse other parameters | SHR-07 |
| **Forwarded links, or access that outlives its welcome** | Expiry by default, withdraw, and fresh keys every build. It's documented honestly that what was read can't be taken back. | SHR-08, SHR-11 |
| **Compromised dependency or release** | Lockfiles, Dependabot, CodeQL, secret scanning with push protection, an SBOM, GitHub artifact attestations, signed installers (DSK-07), and actions pinned by commit SHA | SEC-04, DSK-07 |
| **Compromised publish workflow stealing users' private content** (it runs with their deploy key) | Users pin the reusable workflow by commit SHA and verify the release bundle by SHA-256 and attestation. Updates arrive as pull requests they merge themselves. | SEC-05 |
| **Stolen or lost laptop** | Notes on disk are protected by the OS account and disk encryption (recommended in the docs). Credentials are in the OS keychain. Sign out clears the app's caches. | PRV-02 |
| **Leaked browser token (web)** | Fine-grained, limited to two repositories, with an expiry. Stored encrypted with a non-extractable WebCrypto key in IndexedDB, or kept for the session only. Strict CSP and no third-party scripts reduce XSS risk. | SEC-03 |
| **Agent misuse or prompt injection** | See [Agents → Risks](agents.md#risks-specific-to-agents) | AGT-03, AGT-09 |
| **Malicious theme or settings file** | Validated against schemas. Values only, never CSS or URLs. | UNSUP-THEME-01 |

## Data inventory

| Data | Location | Who can read it | Removed by |
| --- | --- | --- | --- |
| Public notes | Workspace folder `content/`, the notes repository, the user's Pages site | Anyone | Deleting the note (it stays in public Git history) |
| Private notes | `private/`, the private repository | The user and anyone they gave repository access | Deleting the note (it stays in private history) |
| Shared notes | As private, plus sealed copies on Pages | Audiences with a link or passcode | Withdrawing, then the next deploy |
| Synced settings and custom themes | `private/.focus-notes/` (D-46), or the notes repository if there's no private repository | As above | Deleting the files |
| Device settings | The app's data folder | The local user | Uninstalling, or Settings → Reset |
| Search index, recent notes, logs | The app's data folder (logs are redacted, rotated, and kept 7 days) | The local user | Sign out, removing the workspace, or uninstalling |
| GitHub credential | Git's credential helper | The local user | Sign out (and revoking it on GitHub) |

## Privacy commitments

1. **No telemetry.** No usage analytics, crash reporting services, or error trackers, in any product surface (PRV-01). Problems are reported by the user: *Copy diagnostic report* puts a redacted report on the clipboard, and *Report a problem* opens a pre-filled GitHub issue that the user reviews before sending (QLT-04).
2. **No third-party requests.** The app, the user's sites, and the product site load nothing from other origins: fonts are self-hosted, and there are no CDNs, embeds, or trackers.
3. **Readers aren't tracked.** Public and shared pages set no cookies. The only browser storage is a share reader's own key, and only if they ask to be remembered.
4. **Private by default.** New notes are private (D-05). Agents start with no private access (D-45). Synced preferences live in the private repository (D-46).
5. **What a public notes repository reveals,** listed so users can decide: the names of their two repositories (including the private one, in `.gitmodules`), the full history of public notes (including deleted ones), the time of each publishing commit, and the existence and size of sealed files. The private repository can be given any name.
6. **Commits use the noreply address** by default (first run, identity step).

## Supply chain and releases

- Dependencies are pinned by lockfile and updated by Dependabot pull requests that must pass CI. The license check (D-20) runs on every change.
- Every GitHub Action is pinned to a full commit SHA.
- Releases are built in GitHub Actions only, never on a developer's computer. Each one has SHA-256 checksums, a CycloneDX SBOM, and GitHub artifact attestations (build provenance). Installers are code-signed and macOS builds are notarized once signing is in place (DSK-07, D-51). Until then, the download page says the build is unsigned and shows the checksum to verify.
- Updates are checked by electron-updater against GitHub Releases and verified before installing.
- Repository settings: branch protection on `main` (pull request and passing checks), secret scanning with push protection, CodeQL, and the OpenSSF Scorecard.

## Vulnerability reporting and response

- `SECURITY.md` explains how to report privately through GitHub's private vulnerability reporting. We aim to acknowledge within 7 days.
- **A share secret leaks:** withdraw the audience. It stops opening at the next deploy.
- **The share-link key leaks:** Settings → Workspace → *Rotate share-link key* replaces the deploy key and the secret.
- **A token leaks:** revoke it on GitHub, then sign in again.
- **A bad release:** users who pin by SHA aren't affected until they merge an update. A fixed release supersedes it, and the advisory is published on GitHub.

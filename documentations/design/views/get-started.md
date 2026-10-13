# Get started

The product site's front door: download the desktop app (the main path) or start in the browser. Both lead to a workspace in the person's own GitHub account.

> [!NOTE]
> **TL;DR.** A calm, single page on the product's GitHub Pages site (IA-VIEW-GETSTARTED). It detects the visitor's OS and offers one primary button, **Download for Windows** (or macOS or Linux), linking straight to the latest GitHub Release. **Superseded in part by D-80:** the primary path is now **Start in your browser**: *Use this template*, turn on GitHub Pages, and open your own site, where the app's first run does the rest ([Web app](../../architecture/web-app.md)). The desktop download is the secondary path. Below that: how it works in three steps, what Focus Notes does and doesn't do with your data, system requirements, and links to the source and docs. Serves UC-SETUP-06 and SC-SETUP-05.

## Page anatomy

| Section | Content |
| --- | --- |
| **Hero** | The trigger motif (red dot in a frosted circle), the name, one line: "A calm place to write. Your notes stay in your own GitHub." |
| **Primary action** | **Download for ⟨detected OS⟩**, with the version and size under it ("v1.2.0 · 112 MB · Windows 10 and 11"). Detection uses `navigator.userAgentData` where available, otherwise the user agent. Links are GitHub's stable `releases/latest/download/<asset>` URLs, so the page never needs updating for a release. |
| **Other downloads** | macOS (universal), Windows (x64 and Arm), Linux (AppImage and .deb), checksums, and *All releases* |
| **Secondary action** | *Download the desktop app* (D-80 makes the browser the primary path). |
| **How it works** | 1. Install the app. 2. Sign in with GitHub (through Git's own sign-in, with a code). 3. The app creates your notes in your GitHub account, and you write. |
| **Your data** | "Focus Notes never sees your notes. They're Markdown files in your GitHub repositories. Public notes go on your own GitHub Pages site. Shared notes are encrypted. There's no account with us, no tracking, and no server." Links to the privacy statement and [Security and privacy](../../architecture/security-and-privacy.md). |
| **Requirements** | Supported OS versions, Git (the app helps install it), a GitHub account (free works) |
| **Footer** | Docs, source, releases, security policy, license |

Mobile visitors get "Read notes on any device. Writing is on desktop and in the browser" with the browser path once it exists, and a "Send this page to my computer" share button (the system share sheet, with no service involved).

## Starting in the browser (MW)

The same setup engine as the desktop app (`packages/github`), driven through the GitHub API instead of local Git:

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Create the repositories</p>
<p>Two buttons open GitHub in a new tab: <em>Create notes repository</em> (GitHub's "use this template" page for <code>focus-notes-workspace</code>) and <em>Create private repository</em> (GitHub's new-repository page pre-filled with the name <code>notes-private</code> and private visibility). Using GitHub's own pages means the token never needs permission to create repositories.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Create a token</p>
<p>[Create a token on GitHub] opens the fine-grained token page pre-filled: name, expiry, and the two repositories with the permissions from <a href="../../architecture/desktop-and-git.md#permissions">Desktop and Git → Permissions</a>. The person pastes it back.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Finish setup</p>
<p>The web app links the private repository as the submodule, adds the read-only deploy key and the Actions secret (key generated in the browser with Web Crypto and encrypted with libsodium), and turns on GitHub Pages, with the same checklist as the desktop app.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Write</p>
<p>The editor opens in the browser. A banner suggests the desktop app for offline use and terminal Git, and the app finds this workspace on first run.</p>
</li>
</ol>

The token stays in the browser (encrypted in IndexedDB with a non-extractable key, or for the session only) and is sent only to `api.github.com`. The page's Content Security Policy allows no other origin.

## Design decisions

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-GS-01 | One primary download button for the detected OS. The browser path is secondary. | UC-SETUP-06 | The owner prefers the desktop app guiding setup. One obvious action keeps the page calm. | Equal-weight choices, or a long platform table first. |
| DD-GS-02 | Download links use GitHub's latest-release URLs. | UC-SETUP-06 | The page never goes stale, and it's still GitHub hosting only (D-21). | Version-specific links updated on every release. |
| DD-GS-03 | Browser setup creates repositories through GitHub's own pages, then uses a token for just those two repositories. | UC-SETUP-06, UC-SETUP-05 | Least privilege: the token never needs account-wide permissions. | A token allowed to create repositories. |
| DD-GS-04 | The page states plainly what Focus Notes does and doesn't do with data. | UC-SETUP-06 | Trust is the first question for a tool that touches your GitHub. | Burying it in a privacy policy. |

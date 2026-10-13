# Distribution and release

How this repository becomes what people use: the repository layout, what gets built, how releases are made, signed, and delivered, and how users' instances stay in step, with nothing hosted beyond GitHub Pages and GitHub Releases.

> [!NOTE]
> **TL;DR.** This repository (`focus-notes`) is a **monorepo**: desktop app, web app, shared core, publishing tools, MCP server and command-line tool, the template's source, JSON Schemas, and these docs. It's also **the owner's own instance**: its *Deploy app* workflow builds the web app from source and publishes it, the owner's public notes, and these docs to its own GitHub Pages (D-87). People who want to improve Focus Notes fork it. People who just want to use it copy the small **template repository** (not this one) to make their instance; its *Deploy app* workflow deploys the released **web app bundle** at a pinned version, checked by checksum and attestation, so they never build the app themselves (D-48, DST-06). They can also download the **desktop app** from **GitHub Releases**, winget, or Homebrew (D-51). A tagged release builds the desktop installers, the web app bundle, **checksums**, an **SBOM**, and **attestations** into a GitHub Release, and regenerates the template repository. Desktop apps update themselves; instances get pull requests that move the pinned version. The layout and toolchain are D-49.

## Repositories

| Repository | Visibility | Purpose |
| --- | --- | --- |
| `prabinpebam/focus-notes` (this one) | Public, MIT | Source, docs, releases, and the template's source (`templates/workspace/`). Also the owner's own instance: public notes in `notes/`, the owner's private repository at `private/`, and a *Deploy app* workflow that builds the app from source. Fork it to improve Focus Notes. |
| `prabinpebam/focus-notes-workspace` | Public, marked as a **template** | The template repository people copy (*Use this template*) to make their instance: `notes/`, the `private/` link, `.focus-notes/workspace.json`, `AGENTS.md`, a README, and the *Deploy app* workflow that deploys the released web app bundle. Generated from `templates/workspace/` in this repository at each release (DST-06). |
| A user's instance and private repositories | In the user's account | Their instance (see [Who owns what](../architecture/repository-and-publishing.html#who-owns-what)) |

## Layout of this repository

```text
focus-notes/
├─ apps/
│  ├─ desktop/        # Electron main process, preload bridge, window management, installers
│  └─ web/            # Static web app, deployed to each instance's own Pages (MW, D-80)
├─ packages/
│  ├─ core/           # Commands, keybindings, focus mode, themes, Spotlight index, workspace model
│  ├─ tokens/         # Design tokens (DTCG source) and the generated CSS, types, and schema
│  ├─ ui/             # Design system: primitives, layouts, host and block components, compounds, contracts
│  ├─ ui-runtime/     # Renderer: maps view documents to components, bindings, and commands
│  ├─ views/          # View and fragment documents (JSON) for the app; the only UI the app defines
│  ├─ editor/         # Tiptap extensions and block registry (node views come from packages/ui)
│  ├─ markdown/       # Markdown bridge and round-trip corpus
│  ├─ git/            # Local Git adapter (desktop)
│  ├─ github/         # GitHub API adapter and setup engine (shared by desktop and web setup)
│  ├─ publish/        # Static renderer, sealer, leak check (run by the Deploy app workflow)
│  ├─ mcp/            # MCP server
│  └─ cli/            # focus-notes command-line tool
├─ templates/workspace/   # Source of the template repository (AGENTS.md, README, Deploy app workflow, .gitattributes)
├─ notes/                 # The owner's public notes (this repository is the owner's instance, D-87)
├─ private/               # The owner's private repository (submodule)
├─ schemas/               # JSON Schemas (front matter, settings, themes, keybindings, access)
├─ tools/                 # Repository checks (plan, chain, boundaries, licenses) and the benchmark, tools/bench/ with its budgets file
├─ .github/workflows/     # ci.yml, codeql.yml, release.yml, pages.yml (Deploy app: builds from source)
├─ documentations/        # This Slate documentation host
├─ slate/                 # Slate (submodule)
├─ AGENTS.md  SECURITY.md  LICENSE  README.md
```

Parts not built yet arrive stage by stage ([Roadmap](roadmap.md)).

## Toolchain (all permissively licensed)

| Need | Choice |
| --- | --- |
| Package manager and workspaces | pnpm workspaces (MIT) |
| Language and build | TypeScript (Apache-2.0), Vite (MIT) |
| Desktop packaging and updates | electron-builder, electron-updater (MIT) |
| Interface | React (MIT), React Aria Components (Apache-2.0), vanilla-extract (MIT), Style Dictionary (Apache-2.0), Ajv (MIT) |
| Component gallery | Storybook (MIT) |
| Tests | Vitest (MIT), Playwright (Apache-2.0), axe-core (MPL-2.0, tests only) |
| Lint and format | ESLint (MIT), Prettier (MIT) |
| Versions and changelog | Changesets (MIT), Conventional Commits |
| Node.js | The current LTS version, pinned in `.nvmrc` and `package.json` `engines` |

CI installs from lockfiles with frozen versions.

## What a release produces

| Output | Format | Where it goes |
| --- | --- | --- |
| Windows installer | NSIS `.exe` (x64, arm64) | GitHub Releases, winget (P1) |
| macOS app | Universal `.dmg` and `.zip` (for updates), notarized | GitHub Releases, Homebrew cask (P1) |
| Linux app | AppImage and `.deb` (x64, arm64) | GitHub Releases, Flathub (later) |
| Update metadata | `latest*.yml` files | GitHub Releases (read by electron-updater) |
| Web app bundle | The static web app plus its publish tools (renderer, sealer, leak check, reader assets) | GitHub Releases. Template instances' *Deploy app* workflows download it at their pinned version, check its SHA-256 and attestation, and deploy it to their own Pages (D-48, SEC-05). The project repository builds the same app from source (MW, D-80). |
| Command-line tool and MCP server | Inside the desktop app. Also `@focus-notes/cli` on npm (P1). | Installers, npm |
| Integrity | `SHA256SUMS`, CycloneDX SBOM, GitHub artifact attestations | GitHub Releases |

## Release process

<ol class="slate-steps">
<li class="slate-step">
<p class="slate-step__title">Prepare</p>
<p>Changes land on <code>main</code> through pull requests with passing CI (tests, budgets, license check, CodeQL). Each user-visible change carries a Changeset entry.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Version</p>
<p>The Changesets pull request bumps versions (SemVer) and writes the changelog. Merging it tags <code>vX.Y.Z</code>.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Build</p>
<p><code>release.yml</code> builds on Windows, macOS, and Linux runners, signs and notarizes, and produces the outputs above with checksums, the SBOM, and attestations, into a <strong>draft</strong> release.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Verify</p>
<p>Automated smoke tests install each build, then run first run against a test account and a publish against a test workspace. A person checks the draft.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Publish</p>
<p>The release goes public. Workflows then regenerate the template repository from <code>templates/workspace/</code> with the new version and the web app bundle's checksum, and open winget and Homebrew update pull requests (P1).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Reach users</p>
<p>Desktop apps update on quit, from GitHub Releases on their channel. Instances made from the template receive a pull request that moves their <em>Deploy app</em> workflow to the new version and checksum (Dependabot, or <em>Update publishing</em> in Settings → Workspace); merging it redeploys. Nothing changes in a user's repository until they merge it (DST-06).</p>
</li>
</ol>

## Versions and compatibility

- **App:** SemVer. A major version may change behavior, but never the user's files without a migration.
- **Workspace format:** `.focus-notes/workspace.json` holds `formatVersion` (an integer) and the template version it came from. A newer app migrates older workspaces in one commit, after asking. An older app refuses to write to a newer workspace format and offers to update itself (DST-05).
- **Publishing:** the template's *Deploy app* workflow and the web app bundle share the app's version. Within a major version, newer publish tools read every older workspace format.
- **Channels:** *Stable* by default, and *Beta* (GitHub pre-releases) can be chosen in Settings → About (DST-07).

## Signing

| Platform | Approach | Without it |
| --- | --- | --- |
| macOS | Apple Developer ID certificate and notarization (needs an Apple Developer membership) | Gatekeeper blocks the app until the user explicitly allows it |
| Windows | An Authenticode certificate: a cloud signing service, or a free open-source signing program if the project qualifies | SmartScreen warns on download until the app builds a reputation |
| Linux | Checksums and attestations. Packages signed where the channel supports it. | Unaffected |

Signing secrets live only in the release workflow's protected environment, which requires approval to run.

<h2 id="the-product-site">The project's own site</h2>

There's no separate product site (D-54 is superseded). The project repository's GitHub Pages site is the owner's own instance (D-87), with these docs beside it (D-40):

| Path | Serves |
| --- | --- |
| `/` | The owner's Focus Notes. Visitors see only the owner's public notes, read-only, and [Use this app for yourself](../design/views/get-started.md) (DST-01). |
| `/documentations/` | This documentation |
| `/schemas/` | The JSON Schemas, at stable `$id` URLs |
| `/llms.txt` | A map of these docs for language models |
| `/privacy/` | The privacy statement (no data collected) |

## Repository hygiene

`README.md`, `LICENSE` (MIT), `SECURITY.md`, `AGENTS.md`, `CONTRIBUTING.md`, a code of conduct, issue forms (bug report with a diagnostic report field, feature request), a pull request template, `CODEOWNERS`, branch protection on `main`, Dependabot, CodeQL, secret scanning with push protection, and an OpenSSF Scorecard badge.

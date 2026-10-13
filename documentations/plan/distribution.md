# Distribution and release

How this repository becomes the product people install: the repository layout, what gets built, how releases are made, signed, and delivered, and how users' workspaces stay in step, all without hosting anything beyond GitHub.

> [!NOTE]
> **TL;DR.** This repository (`focus-notes`) becomes a **monorepo**: desktop app, web app, shared core, publishing tools, MCP server and command-line tool, the workspace template's source, JSON Schemas, and these docs. A tagged release builds **signed installers** (Windows, macOS, Linux), the **web app**, the **reader bundle** used by users' publish workflows, **checksums**, an **SBOM**, and **attestations**, then publishes them to **GitHub Releases**. The **product site** on GitHub Pages hosts the Get started page, the web app (`/app/`), these docs (`/docs/`), and the schemas. The **workspace template** repository is updated from the same release. Users get updates through the app's updater, and publish-workflow updates as pull requests they approve (D-48). The layout and toolchain are D-49; channels and signing are D-51.

## Repositories

| Repository | Visibility | Purpose |
| --- | --- | --- |
| `prabinpebam/focus-notes` (this one) | Public, MIT | Source, docs, releases, reusable publish workflow, product site |
| `prabinpebam/focus-notes-workspace` | Public, marked as a **template** | Starting layout for users' notes repositories. Generated from `templates/workspace/` in this repository by the release workflow. |
| A user's notes and private repositories | In the user's account | Their instance (see [Who owns what](../architecture/repository-and-publishing.html#who-owns-what)) |

## Layout of this repository

```text
focus-notes/
├─ apps/
│  ├─ desktop/        # Electron main process, preload bridge, window management, installers
│  ├─ web/            # Static web app: editor (M6) and web setup (/app/)
│  └─ site/           # Product site: Get started, download page, privacy statement, schema hosting
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
│  ├─ publish/        # Static renderer, sealer, leak check (used by the reusable workflow)
│  ├─ mcp/            # MCP server
│  └─ cli/            # focus-notes command-line tool
├─ templates/workspace/   # Source of the workspace template (AGENTS.md, workflow, .gitattributes)
├─ schemas/               # JSON Schemas (front matter, settings, themes, keybindings, access)
├─ .github/workflows/     # ci.yml, release.yml, publish.yml (reusable), site.yml
├─ documentations/        # This Slate documentation host
├─ slate/                 # Slate (submodule)
├─ AGENTS.md  SECURITY.md  LICENSE  README.md
```

Today the repository holds the documentation only. Code arrives milestone by milestone ([Roadmap](roadmap.md)).

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
| Reader bundle | `reader-<version>.tgz`: static renderer, sealer, and reader assets | GitHub Releases (downloaded by users' publish workflows) |
| Web app | Static files | Product site `/app/` (M6) |
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
<p>The release goes public. Workflows then update the template repository, record the new reusable-workflow commit SHA and reader-bundle checksum, deploy the product site, and open winget and Homebrew update pull requests (P1).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Reach users</p>
<p>Desktop apps update on quit. Workspaces receive a pull request to move their publish workflow to the new SHA (Dependabot, or <em>Update publishing</em> in Settings → Workspace). Nothing changes in a user's repository until they merge it.</p>
</li>
</ol>

## Versions and compatibility

- **App:** SemVer. A major version may change behavior, but never the user's files without a migration.
- **Workspace format:** `.focus-notes/workspace.json` holds `formatVersion` (an integer) and the template version it came from. A newer app migrates older workspaces in one commit, after asking. An older app refuses to write to a newer workspace format and offers to update itself (DST-05).
- **Publishing:** the reusable workflow and the reader bundle share the app's version. Within a major version, newer publish tools read every older workspace format.
- **Channels:** *Stable* by default, and *Beta* (GitHub pre-releases) can be chosen in Settings → About (DST-07).

## Signing

| Platform | Approach | Without it |
| --- | --- | --- |
| macOS | Apple Developer ID certificate and notarization (needs an Apple Developer membership) | Gatekeeper blocks the app until the user explicitly allows it |
| Windows | An Authenticode certificate: a cloud signing service, or a free open-source signing program if the project qualifies | SmartScreen warns on download until the app builds a reputation |
| Linux | Checksums and attestations. Packages signed where the channel supports it. | Unaffected |

Signing secrets live only in the release workflow's protected environment, which requires approval to run.

## The product site

The product's own GitHub Pages site (D-40, D-54):

| Path | Serves |
| --- | --- |
| `/` | [Get started](../design/views/get-started.md): downloads, how it works, privacy |
| `/app/` | The web app: web setup and browser editing (M6) |
| `/docs/` | This documentation |
| `/schemas/` | The JSON Schemas, at stable `$id` URLs |
| `/llms.txt` | A map of these docs for language models |
| `/privacy/` | The privacy statement (no data collected) |

## Repository hygiene

`README.md`, `LICENSE` (MIT), `SECURITY.md`, `AGENTS.md`, `CONTRIBUTING.md`, a code of conduct, issue forms (bug report with a diagnostic report field, feature request), a pull request template, `CODEOWNERS`, branch protection on `main`, Dependabot, CodeQL, secret scanning with push protection, and an OpenSSF Scorecard badge.

# Distribution and release

How this repository becomes what people use: the repository layout, what gets built, how releases are made, signed, and delivered, and how users' instances stay in step, with nothing hosted beyond GitHub Pages and GitHub Releases.

> [!NOTE]
> **TL;DR.** This repository (`focus-notes`) is a **monorepo**: desktop app, web app, shared core, publishing tools, MCP server and command-line tool, the template's source, JSON Schemas, and these docs. It's also **the owner's own instance**: its *Deploy app* workflow builds the web app from source and publishes it, the owner's public notes, and these docs to its own GitHub Pages (D-87). People who want to improve Focus Notes fork it. People who just want to use it copy the small **template repository** (not this one) to make their instance; its *Deploy app* workflow deploys the released **web app bundle** at a pinned version, checked by checksum and attestation, so they never build the app themselves (D-48, DST-06). They can also download the **desktop app** from **GitHub Releases**, winget, or Homebrew (D-51). A tagged release builds the desktop installers, the web app bundle, **checksums**, an **SBOM**, and **attestations** into a GitHub Release, from which the owner republishes the template repository. Desktop apps update themselves; instances get pull requests that move the pinned version. The layout and toolchain are D-49.

## Repositories

| Repository | Visibility | Purpose |
| --- | --- | --- |
| `prabinpebam/focus-notes` (this one) | Public, MIT | Source, docs, releases, and the template's source (`templates/workspace/`). Also the owner's own instance: public notes in `notes/`, the owner's private repository at `private/`, and a *Deploy app* workflow that builds the app from source. Fork it to improve Focus Notes. |
| `prabinpebam/focus-notes-workspace` | Public, marked as a **template** | The template repository people copy (*Use this template*) to make their instance: `notes/`, the `private/` link, `.focus-notes/workspace.json`, `AGENTS.md`, a README, and the *Deploy app* workflow that deploys the released web app bundle. Generated from `templates/workspace/` in this repository at each release, and pushed there from the release by `tools/release/publish-template.mjs` (DST-06, D-137). |
| A user's instance and private repositories | In the user's account | Their instance (see [Who owns what](../architecture/repository-and-publishing.html#who-owns-what)) |

## Layout of this repository

```text
focus-notes/
├─ apps/
│  ├─ desktop/        # Electron main process, preload bridge, window management, installers
│  └─ web/            # Static web app, deployed to each instance's own Pages: browser notes, read-only instance notes, the vault reader (MW, D-80, D-90)
├─ packages/
│  ├─ core/           # Commands, keybindings, focus mode, themes, Spotlight index, workspace model
│  ├─ tokens/         # Design tokens (DTCG source) and the generated CSS, types, and schema
│  ├─ ui/             # Design system: primitives, layouts, host and block components, compounds, contracts
│  ├─ ui-runtime/     # Renderer: maps view documents to components, bindings, and commands
│  ├─ views/          # View and fragment documents (JSON) for the app; the only UI the app defines
│  ├─ editor/         # Tiptap extensions and block registry (node views come from packages/ui)
│  ├─ markdown/       # Markdown bridge and round-trip corpus
│  ├─ git/            # Local Git adapter (desktop)
│  ├─ github/         # GitHub REST client and setup engine (desktop only; the browser never calls GitHub, D-90)
│  ├─ seal/           # Vault and share sealing format, sealer, reader, and leak check; its CLI runs in the Deploy app workflow (D-90)
│  ├─ publish/        # Static renderer for public pages (run by the Deploy app workflow)
│  ├─ mcp/            # MCP server
│  └─ cli/            # focus-notes command-line tool
├─ templates/workspace/   # Source of the template repository (notes/, .focus-notes/, AGENTS.md, README, Deploy app workflow, .gitattributes; built in WP-3.1)
├─ site/                  # The product site's content: the landing page, download, privacy, demo, the help centre's categories and articles, media/ (D-167, WP-10.1)
├─ notes/                 # The owner's public notes (this repository is the owner's instance, D-87)
├─ private/               # The owner's private repository (submodule)
├─ schemas/               # JSON Schemas (front matter, settings, themes, keybindings, access, app state, export bundle)
├─ tools/                 # Repository checks (plan, chain, boundaries, licenses), the benchmark (tools/bench/ with its budgets file), and the product site's builder (tools/site/)
├─ .github/workflows/     # ci.yml, codeql.yml, nightly.yml, release.yml, preview-channel.yml, pages.yml (Deploy app: builds from source)
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
| Web app bundle | The static web app plus its publish tools (renderer, sealer, leak check, reader assets): `focus-notes-web-<version>.tgz`, with the app in `app/` and `packages/seal`'s command line bundled as `publish/cli.mjs` (D-98) | GitHub Releases, tag `v<version>`. Template instances' *Deploy app* workflows download it at their pinned version (`version` and `sha256` in `.focus-notes/app.json`, D-137), check its SHA-256 and attestation, and deploy it to their own Pages (D-48, SEC-05). Until a release has one, `templates/workspace/` pins a placeholder (`0.0.0`) and its workflow refuses to run; the release workflow fills both values in the template it attaches. The project repository builds the same app from source (MW, D-80). |
| Command-line tool and MCP server | Inside the desktop app: the app's executable runs them with `--cli` (released builds can't run Electron as Node), through a launcher in its resources, `bin/focus-notes.cmd` (Windows) or `bin/focus-notes` (macOS, Linux). Settings → Agents → *Install command-line tool* puts it on the `PATH`: the launcher's folder in the user's own `Path` on Windows, or a link at `~/.local/bin/focus-notes` on macOS and Linux; nothing at install time (D-165). Also `@focus-notes/cli` on npm (P1). | Installers, npm |
| Integrity | `SHA256SUMS`, CycloneDX SBOM, GitHub artifact attestations | GitHub Releases |

**As built (WP-5.5, D-128).** `release.yml` attaches the Windows NSIS installer (x64), the macOS `.dmg` and `.zip` and the Linux AppImage and `.deb` (x64), `focus-notes-web-<version>.tgz`, `focus-notes-workspace-<version>.tgz` (the workspace template with `.focus-notes/app.json` pinned to that bundle's version and SHA-256), `focus-notes-<version>.cdx.json` (the SBOM, made by `tools/release/sbom.mjs` from the same package list as `THIRD_PARTY_NOTICES`), and `SHA256SUMS`, each with a build-provenance attestation. Not yet: arm64 builds, signing and notarization, and the `latest*.yml` update metadata, which arrive with signed, self-updating builds (DSK-07). The bundle also holds `bundle.json` (its name, version and commit), `LICENSE` and `THIRD_PARTY_NOTICES.md`, and `publish/` holds the page renderer (`render.mjs` and `assets/`) beside `cli.mjs`, so a template instance renders public pages with `--reader`.

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
<p><code>release.yml</code> builds on Windows, macOS, and Linux runners, signs and notarizes, and produces the outputs above with checksums, the SBOM, and attestations, into a <strong>draft</strong> release. As built (D-128): a <code>v&lt;x.y.z&gt;</code> tag starts it; only the Windows build must pass, and macOS and Linux report without blocking (D-112); nothing is signed until DSK-07; versions below 1.0.0 and suffixed versions are drafted as pre-releases; the notes list the commits since the previous release tag. A manual run, or a tag <code>v&lt;x.y.z&gt;-dryrun[.n]</code>, builds, smoke-tests and checksums everything but attests nothing and drafts nothing, so no dry run's files can pass a check; other tags that read like a dry run are refused. Before drafting, the release job checks the tag (peeled, if annotated) still names the commit that was built. Each file is checked with <code>gh attestation verify &lt;file&gt; --repo prabinpebam/focus-notes --signer-workflow prabinpebam/focus-notes/.github/workflows/release.yml --source-ref refs/tags/v&lt;x.y.z&gt;</code>, which accepts only this workflow's attestation for that tag; a template instance's <em>Deploy app</em> workflow checks its bundle the same way.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Verify</p>
<p>Automated smoke tests install each build, then run first run against a test account and a publish against a test workspace. A person checks the draft. As built (D-128): the Windows build's fuses are read back and the packaged app starts and shows a note, and the web app bundle is unpacked and its own publisher publishes a sample note with nothing else installed. Installing on clean machines and the test-account runs are the release checklist's, by hand, until they're automated.</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Publish</p>
<p>The release goes public. The owner then publishes the template repository from it with their own <code>gh</code> login: <code>node tools/release/publish-template.mjs --version &lt;x.y.z&gt;</code> downloads the release's <code>focus-notes-workspace-&lt;x.y.z&gt;.tgz</code>, checks it against <code>SHA256SUMS</code> and its attestation for that tag, reads it in memory (refusing links and <code>.git</code>), and commits exactly its files to <code>focus-notes-workspace</code> from a separate staging folder with no hooks (<code>--dry-run</code> stops before the push; <code>--allow-older</code> allows a version older than the newest release). The <code>attest</code> job runs in the <code>release</code> environment, so nothing is attested until the owner approves the release. It's a manual step so that no workflow holds a token that writes to another repository (PKG-04, D-137). Workflows open winget and Homebrew update pull requests (P1).</p>
</li>
<li class="slate-step">
<p class="slate-step__title">Reach users</p>
<p>Desktop apps update on quit, from GitHub Releases on their channel. Instances made from the template run <em>Update app</em> (<code>.github/workflows/update.yml</code>) weekly and on demand: it finds the newest release tagged exactly <code>v&lt;x.y.z&gt;</code> (never <code>preview</code>, a dry run, a draft or a suffixed tag), checks its bundle and template against <code>SHA256SUMS</code> and the release workflow's attestation for that tag, and opens one pull request from the <code>focus-notes/update</code> branch that moves <code>.focus-notes/app.json</code> (the version and the bundle's SHA-256 that <em>Deploy app</em> reads) and any other template-managed file listed in <code>.focus-notes/managed.json</code>, never <code>notes/</code> or <code>private/</code>. Workflow files can't be changed with a workflow's own token, so the pull request lists those to copy by hand (or, later, <em>Update publishing</em> in Settings → Workspace). Merging it redeploys. Nothing changes in a user's repository until they merge it (DST-06, D-137). After the security review: a release is offered only once it's been out for 3 days (a typed <code>skip-wait</code> input skips the wait), and deleting a release is the kill switch, since a <em>Deploy app</em> pinned to it then fails safe at the download; archives are read in memory and refused if they hold links or <code>.git</code>; only an allow-list of files can change; attestations are checked with <code>--cert-identity https://github.com/prabinpebam/focus-notes/.github/workflows/release.yml@refs/tags/v&lt;x.y.z&gt; --source-ref refs/tags/v&lt;x.y.z&gt; --deny-self-hosted-runners</code>; a pull request that needs workflow files copied says <em>action needed</em> and gives their SHA-256, which <code>app.json</code> records and <em>Deploy app</em> checks against itself; and <em>Deploy app</em> refuses a pin below <code>FOCUS_NOTES_MIN_VERSION</code>.</p>
</li>
</ol>

## Release qualification

Every release is tested on the [support matrix](../architecture/performance-and-quality.md#support-matrix-tested-each-release) before it's published (QLT-02). The checklist below is the release checklist issue's body: the owner opens it from the draft release, each row is ticked with its evidence, and the release is published only when every row for the platforms it ships is ticked. It's specified and ready, and runs first with the first real release; until then it's open in [Gate evidence](gate-evidence.md#open-gaps-across-stages) (WP-5.7, D-140). Windows comes first; macOS and Linux rows apply only after the platform parity pass (D-112).

| # | Check | How | Evidence in the issue |
| --- | --- | --- | --- |
| 1 | The draft's files verify | `gh attestation verify` for every file (the command in *Build* above), and `SHA256SUMS` matches | The command's output |
| 2 | The release build passes the whole suite | **Hook:** the journeys against the draft's installed app, `FOCUS_NOTES_E2E_EXE=<installed exe> pnpm test:e2e` (the packaged harness `packaged.spec.ts` already uses), on the release workflow's Windows runner | The run's link |
| 3 | Budgets hold on reference hardware | `pnpm bench --check` on the release build, three runs in a row (Release definition of done → Fast) | The three reports |
| 4 | Clean install on each desktop OS in the matrix | Install from the draft on a clean virtual machine (Windows 11, Windows 10 22H2; macOS and Ubuntu after D-112), run the first run against the test account, write and back up a note, then **Settings → About → Save diagnostic report…** | The diagnostic report from each machine: it names the version, the OS, Git, and the workspace's health, and nothing private |
| 5 | Update keeps everything | Install the previous release, write notes and change settings, update to the draft, check every note and setting; then uninstall and check only what the [data inventory](../architecture/security-and-privacy.md#data-inventory) says is left | A checked list, and the diagnostic report after the update |
| 6 | The web app in each browser in the matrix | **Hook:** the web journeys with `--project` per browser (Chromium, Edge, Firefox, WebKit) against the draft's web bundle published by its own publisher; Safari on iPadOS by hand | The run's link; a note for iPadOS |
| 7 | Screen readers | The scripted passes in [Accessibility](../architecture/performance-and-quality.md#accessibility) with NVDA and Narrator (and VoiceOver after D-112) | A recorded pass per reader |
| 8 | Keyboard layouts and input methods | **Hook:** the keyboard journeys with each layout's key map (`m1-keys.spec.ts`, `m4-power-keys.spec.ts`); the IME rows (Japanese, Chinese Pinyin, Korean) by hand on Windows | The run's link; a recorded IME pass |
| 9 | The template and an instance update | Publish the template from the draft with `--dry-run`, then an instance's *Update app* pull request (DST-06) | The dry run's output and the pull request |
| 10 | Nothing is sent | With a network monitor on the clean machine, the app makes only the requests [Security and privacy](../architecture/security-and-privacy.md#privacy-commitments) lists | The monitor's list of hosts |

The hooks marked above are to build with the first release: the journeys today run against the development build and the packaged smoke test, and the release workflow doesn't yet install the draft on a clean runner or run the web journeys in more than Chromium.
## Versions and compatibility

- **App:** SemVer. A major version may change behavior, but never the user's files without a migration.
- **Workspace format:** `.focus-notes/workspace.json` holds `formatVersion` (an integer) and the template version it came from. A newer app migrates older workspaces in one commit, after asking. An older app refuses to write to a newer workspace format and offers to update itself (DST-05).
- **Publishing:** the template's *Deploy app* workflow and the web app bundle share the app's version. Within a major version, newer publish tools read every older workspace format.
- **Channels:** *Stable* by default, and *Beta* (GitHub pre-releases) can be chosen in Settings → About (DST-07).

## The rolling preview

Besides tagged releases, every push to `main` whose Windows CI passed replaces one pre-release, named `preview`, with that commit's Windows build: the installer, the unpacked app zipped, `commit.txt`, and `SHA256SUMS`, each attested (`preview-channel.yml`, D-129). Check a download with `gh attestation verify <file> --repo prabinpebam/focus-notes --signer-workflow prabinpebam/focus-notes/.github/workflows/preview-channel.yml --source-ref refs/heads/main`. It runs only for `ci`'s push runs on this repository's own `main`, only while the commit `ci` tested is still `main`'s tip (the commit an attestation names; when `main` has moved on, the newer commit's run publishes), reads the Windows jobs' results itself, builds exactly the commit `ci` tested, and never replaces a newer commit's preview with an older one. Its version is `<app version>-preview.<run number>`, so it always rises. The owner's Preview can download it instead of building locally (D-122); it isn't an update channel for anyone else.

## Signing

| Platform | Approach | Without it |
| --- | --- | --- |
| macOS | Apple Developer ID certificate and notarization (needs an Apple Developer membership) | Gatekeeper blocks the app until the user explicitly allows it |
| Windows | An Authenticode certificate: a cloud signing service, or a free open-source signing program if the project qualifies | SmartScreen warns on download until the app builds a reputation |
| Linux | Checksums and attestations. Packages signed where the channel supports it. | Unaffected |

Signing secrets will live only in the release workflow's `release` environment, once the owner has protected it: a required reviewer and a deployment policy that admits only `v*` tags, which are repository settings, not files (D-128). Until then (DSK-07), every build is unsigned and says so in its release notes; the repository holds no secrets (PKG-04).

<h2 id="the-product-site">The project's own site</h2>

The project repository's GitHub Pages site is the **product site** (D-167): the landing page, the help centre and the demo, with the owner's own Focus Notes moved to `/app/` and these docs beside it (D-40). It still hosts nothing for anyone else (D-86). See [Product site and help](../product/site-and-help.md).

| Path | Serves |
| --- | --- |
| `/` | The landing page: what Focus Notes is, how it works, who it's for, downloads and *Try the demo* (HLP-01) |
| `/help/` | A redirect to Help, a section of these docs at `/documentations/#help/index.md` (HLP-02, D-181) |
| `/demo/` | The demo: the web app with sample notes, kept in the visitor's browser (HLP-05) |
| `/download/` | Downloads for each system from the latest GitHub Release, with checksums |
| `/app/` | The owner's Focus Notes. Until a browser unlocks the owner's private notes, it shows the visitor view (PKG-09, DST-01) |
| `/n/` | The owner's public note pages, at unchanged addresses (D-139) |
| `/s/` | The share reader, at the address share links have always used |
| `/documentations/` | This documentation |
| `/schemas/` | The JSON Schemas at stable `$id` URLs, and the design-system catalogue (DSY-13) |
| `/llms.txt` | A map of these docs for language models |
| `/privacy/` | The privacy statement (no data collected) |

**As built (WP-10.1).** *Deploy app* builds the web app, which also makes `apps/web/dist-app/`: the app built to read the notes and sealed files from the folder above it. It then copies the docs, and runs `tools/site/build.mjs`, which renders `site/` through the design system, puts `dist-app/` at `/app/`, and keeps the share reader at `/s/`. The builder fails on a broken link or anything from another origin. The publisher then adds the notes, `/n/` and the sealed files at the root as before, and the leak check covers the whole site. Template instances are unchanged: their app is still their whole site. See [Product site and help → How the site is built](../product/site-and-help.md#how-the-site-is-built).

## Repository hygiene

`README.md`, `LICENSE` (MIT), `SECURITY.md`, `AGENTS.md`, `CONTRIBUTING.md`, a code of conduct, issue forms (bug report with a diagnostic report field, feature request), a pull request template, `CODEOWNERS`, branch protection on `main`, Dependabot, CodeQL, secret scanning with push protection, and an OpenSSF Scorecard badge.

# Product site and help

The public face of Focus Notes: the page a person lands on before they install anything, the help centre the app links to when something needs more than a sentence, and a demo they can try in the browser. All three are written for people who write, not for people who build software.

> [!NOTE]
> **TL;DR.** The project repository's GitHub Pages site becomes the product site (D-167).
> - **`/` is the landing page,** visual first (D-174): a headline of a few words, a large scene of the app with a real note, up to five featured sections with a screenshot each, a grid of small tiles, downloads and *Try the demo*. The explanations live in the help centre.
> - **Help is a section of these docs** (D-181): [Help](../help/index.md), about 40 articles in eight sections named by what the reader wants to do, each one a single content type from the [writing guide](../design/help-writing.md). `/help/` on the site sends visitors there.
> - **`/demo/` is the web app** with sample notes, kept in the visitor's browser, with no sign-in.
> - **The app links into the help centre** by article ID (*Learn more*, *How to fix this*). CI fails on any ID or anchor that doesn't exist.
> - **Screenshots are captured from the release build in CI** with the demo workspace, in light and dark (D-169).
> - **The site follows the app's rules:** the design system's tokens and components, no tracking, no requests to other sites, WCAG 2.2 AA.
>
> Built as stage MH ([implementation plan](../plan/implementation-plan.md#mh)). Requirements HLP-01 to HLP-09. The site's build and addresses are built (WP-10.1, [How the site is built](#how-the-site-is-built)); its words, articles, screenshots and demo come next.

## Who it's for

| Reader | Arrives from | Wants |
| --- | --- | --- |
| **Visitor** | A search, a shared link, the repository on GitHub | To know what it is, whether it suits them, and to try it before installing |
| **New writer** | The downloads, the installer, the first run | To get set up without knowing what Git is |
| **Writer** | *Learn more* in the app, a problem message, the Help menu | A plain answer for the thing in front of them, then back to writing |
| **Power user** | The README, the help centre's *For developers and agents* | The CLI, the MCP server and keyboard reference, kept apart from the main path |

The specification under `/documentations/` stays for people building Focus Notes. The help centre never links to it for a task; a concept article may link to it at the end, as *For the curious*.

## The site's addresses

| Address | Serves | Notes |
| --- | --- | --- |
| `/` | [The landing page](#the-landing-page) | Was the owner's Focus Notes app until D-167 |
| `/help/` | A redirect to [Help](../help/index.md) in these docs, at `/documentations/#help/index.md` (D-181) | `/help/<section>/` redirects to that section's page |
| `/demo/` | [The demo](#the-demo) | The web app with sample notes |
| `/#download` | Downloads for each system: the landing page's last section (D-184) | Links to the latest GitHub Release, with its checksums; the old `/download/` redirects here |
| `/app/` | The owner's own Focus Notes, as `/` served before D-167 | Public note pages stay at `/n/` so their addresses don't change |
| `/n/` | The owner's public notes (D-139) | Unchanged |
| `/s/` | The share reader, where share links point | Unchanged: it reads the sealed files from the site's root, as before |
| `/documentations/`, `/schemas/`, `/llms.txt` | The specification, the JSON Schemas, the map for language models | Unchanged |
| `/privacy/` | The privacy statement: nothing is collected | Linked from every page's footer |

<h2 id="the-landing-page">The landing page</h2>

Visual first, in the manner of apple.com's product pages (D-174). Pictures carry the page, and the words are few. If something can be shown, it's shown.

| # | Section | Content |
| --- | --- | --- |
| 1 | **Hero** | One headline of at most 6 words in large display type ("Write. Nothing else."), one line of at most 14 words, *Download* and *Try the demo*, and a large scene of the app with a real note open, in light mode, with focus mode off so the whole note reads at full contrast. |
| 2 | **Featured sections** | At most 5, the strongest first: focus mode, Spotlight, files and folders, private notes and sealed sharing, light and dark. Each has an optional eyebrow, a headline of at most 5 words, one line of at most 14 words, and a large screenshot, or a short loop if motion sells it. |
| 3 | **Tiles** | One grid of small tiles, an icon and at most 4 words each: plain Markdown files, works offline, free and open source (MIT), private notes stay private, light and dark, nothing tracked, MCP for AI agents. |
| 4 | **Closing** | One line, the downloads again, *Try the demo*, and one small *Learn how it works* link to the help centre. |
| 5 | **Download** (`#download`, D-184) | An eyebrow, a headline, one tile per system (Windows, macOS, Linux) with its file, *Download from GitHub* to the latest release, and a caption that the builds aren't signed yet and list their checksums. Every *Download* on the site goes here. |

**Not on the landing page:** prose paragraphs and bulleted prose. The questions people ask before installing, *Is it for you?* and how it works are help centre articles, reached through *Learn how it works*.

**Limits, checked when the site is built:** at most about 120 words of visible text outside the navigation and footer, no text block over 20 words, and VVS ≥ 80 (D-127). Every image has alt text, a width and a height. The type is the system's display sans, never the note font. Every claim is true of the release it links to.
<h2 id="the-help-centre">The help centre</h2>

Help is a section of these docs, built with Slate like every other page (D-181): [Help](../help/index.md), one page per section in `documentations/help/`, each registered in the docs' manifest. Its articles are written for people who write, in the [writing guide's](../design/help-writing.md) voice, and live beside their section's page.

### Categories

Eight categories, named by what the reader is trying to do (NN/g: five to eight top-level groups by user goal):

| Category | Articles (first set) |
| --- | --- |
| **Get started** | Get started with Focus Notes · Install Focus Notes on Windows, macOS or Linux · Connect your GitHub account · Try Focus Notes in your browser · Is Focus Notes right for me? |
| **Write** | Write and format with Markdown shortcuts · Use focus mode · Make tables · Find and replace · Use Spotlight to find anything · Change text size, theme and font |
| **Organize your notes** | Create, rename, move and delete notes and folders · Pin the Files panel · Duplicate a note · Restore a deleted note |
| **Save and back up** | How saving and backing up work · Save to cloud now · Work offline · Use your notes on another computer · Resolve a conflict |
| **Private notes and sharing** | Public and private notes · Make a note public or private · Share a private note with a passcode · Read your private notes in a browser · What Focus Notes can and can't see |
| **Fix a problem** | Git isn't installed or is too old · Can't connect to GitHub · The sign-in code doesn't appear · Couldn't back up to GitHub · That folder already has other files · Windows SmartScreen or macOS warns about the download · My notes look different on another computer · Report a problem |
| **Reference** | Keyboard shortcuts · Where Focus Notes keeps your files · Settings explained |
| **For developers and AI agents** | Connect an AI agent (MCP) · Use the command-line tool · Open notes with `focus-notes://` links · Edit your notes with other tools |

Plus **What's new** (release notes) and the FAQ, linked from every page's footer.

### Pages

- **The help centre's home:** [Help](../help/index.md), the eight sections, with *Fix a problem* placed prominently.
- **An article:** breadcrumbs, the title, *Applies to*, the body in its content type's shape, then *Related articles*, *Was this helpful?*, the last-updated date and the release it describes.
- **Search:** the docs' own search, in the browser (HLP-09).

<h2 id="learn-more-links">Learn more links</h2>

The app links into the help centre wherever a setting, a step or a message needs more than its one line:

- **The link names an article ID,** for example `help:connect-github#device-code`, in the view document. `packages/views/help-links.json` maps each ID to its page in the docs, and the app turns it into `https://prabinpebam.github.io/focus-notes/documentations/#help/<page>.md#<anchor>` (D-181; `helpDocsPath` in `packages/core/src/site.ts`).
- **Desktop:** links open in the system browser. **In the browser:** links open in a new tab. Both carry no query string, no referrer and no identifier.
- **Every problem message** the app can show gets a *How to fix this* link to its troubleshooting article (HLP-06).
- **Help → Help centre** in the ⋯ menu and Spotlight opens the help centre's home.
- **The check:** CI fails when a view document names an ID that isn't in the registry, the registry names an article or anchor that doesn't exist, or a link anywhere on the site is broken (HLP-03).

<h2 id="the-demo">The demo</h2>

- **What it is:** the web app built for the demo: the template's starting notes plus about ten sample notes that show focus mode, formatting, a table, folders, a public and a private note, and links between notes.
- **Kept in the browser:** everything stays in the visitor's browser. Nothing is sent anywhere, and nothing needs signing in. *Save to GitHub*, sharing and the vault are shown as they are in the desktop app, but they explain what they'd do there instead of acting.
- **Clearly a demo:** a quiet banner says it's a demo, with *Download* and *Reset demo*. *Reset demo* restores the sample notes.
- **Built from the same code:** the demo is built from the same commit as the release it links to, so it never shows features the release doesn't have.
- **As built (D-177):** the web app's demo build (`vite build --mode demo`, `apps/web/dist-demo/`), which the site's builder places at `/demo/` (`--demo`) in place of the placeholder page, in the same Pages run as `/app/`. Its notes live in their own IndexedDB database (`focus-notes-demo`), never the web app's, and it reads nothing from the site: no `/n/`, no vault. On the first visit it writes the sample notes (`apps/web/src/demo/notes.ts`: the screenshots' essay, garden, journal, project and recipe notes, a welcome note and a formatting tour) under a **Private** and a **Public** root, and opens on the welcome note at its top, the caret at the start of its title, so focus mode shows its first lines at full contrast (again after *Reset demo*). It opens light, whatever the system's setting, until the visitor chooses. The banner is three of the design system's small buttons in the bottom corner: *Download* (primary, to the site's downloads), *Reset demo* and a quiet *Demo: notes stay in this browser* (it says what the desktop app does instead). *Reset demo* empties the demo's database, writes the sample notes again, and starts the app again. A new note goes in the Private root (D-171).
- **Not yet (D-177):** *Save to GitHub*, sharing and the vault shown as in the desktop app with their explanations; until then the banner's *Demo* pill explains them.

## Screenshots

Desktop scenes of the app with the demo workspace (D-169, D-176):

- **The window alone:** the app's own window at its real size, its rounded corners kept, shown large, with a soft shadow under it, or a soft glow for a dark window on a dark page (D-176).
- **No banding:** served as AVIF 4:4:4 with a WebP fallback, at 1440 and 720 pixels wide, with width and height set. Quality wins over size.
- **Light mode,** in every scene but the themes.
- **The scenes:** the hero (an essay open in the editor, focus mode off), Spotlight finding a folder as you type, the Files panel, and the same note in every built-in theme, chosen by swatches and a *Light / Dark* switch under it, with no script.
- **No scrollbar** in any scene: each is captured at rest, the pointer away and nothing scrolling, when the app's minimal scrollbar is hidden.
- **The same sample notes** throughout: an essay, a reading list, a garden, a journal, projects and recipes, written for the demo and never anyone's own.
- **At most one highlight** where the reader must look.
- **Alt text** that says what the image shows, and a caption when it adds something.
- **Kept current:** `apps/desktop/e2e/site-catalog.spec.ts` captures the window (`webContents.capturePage`, never the screen) and `tools/site/scenes.py` cuts it out and encodes it. On CI the screenshot catalogue can regenerate them for each release (`tools/review/catalogs.mjs`, a `site` catalogue). A check will fail if a view a screenshot shows changed after the screenshot was taken.

<h2 id="how-the-site-is-built">How the site is built</h2>

As built in WP-10.1 (HLP-08). The landing page's words are a draft for WP-10.5, the help centre has its categories but no articles yet (WP-10.2, WP-10.3), and `/demo/` is a placeholder until WP-10.6.

- **Content in `site/`:** `landing.json` is the landing page (D-174): the headline, its line, the hero's screenshot, the featured sections with their stable anchors (`start`, then each feature's ID, then `get-focus-notes`, then `download`), and the closing line. The tiles, buttons and downloads are in its view document. `privacy.md` and `demo.md` are plain pages; downloads are the landing page's last section, not a page (D-184). Help isn't here: it's a section of the Slate docs, in `documentations/help/` (D-181). Screenshots go in `media/`, from the `site` catalogue (`apps/desktop/e2e/site-catalog.spec.ts`): a curated demo workspace, the app's own window captured with `webContents.capturePage`, light and dark, as WebP.
- **The design system, as the public pages use it (D-114):** core turns the Markdown into view models (`packages/core/src/site.ts`), and two view documents render them: `siteLanding` and `sitePage` (IA-VIEW-SITE). Their components are **SitePage**, **SiteSection**, **SiteLink**, **SiteText**, **SiteFigure** and **SiteGrid**, with **NoteContent** for the plain pages' words, and their words outside the content are messages. There's no hand-written HTML or CSS.
- **The renderer and the builder:** `apps/web/site/render.ts` is built to `apps/web/dist-site/` with the site's stylesheet and fonts. `tools/site/build.mjs` renders every page at its address, writes the redirects from `/help/` to the docs' Help pages (from the docs' manifest), copies `media/`, and places the owner's app at `/app/` and the share reader at `/s/`.
- **The owner's app at `/app/`:** the web app's build also makes `dist-app/`, the same app reading the notes and sealed files from the folder above it. They stay at the site's root, where `/n/` and `/s/` have always found them, so no published address changes. Notes written in the browser stay too, because the site's origin is the same. The app never had addresses of its own below `/` (no routes, no service worker), so nothing needs a redirect: a bookmark of `/` opens the landing page, whose footer links to `/app/`.
- **Light and dark** follow the visitor's setting, and every page is readable at 320 px.
- **Nothing from another origin:** the pages have no script, and their Content-Security-Policy allows only the site's own styles, fonts and pictures. The builder fails when a page links to an address the site doesn't have, to a missing anchor, or to any other site than GitHub, or names another origin anywhere else.
- **Checked in CI:** the builder's tests (`tools/test/site-build.test.mjs`, `packages/core/test/site.test.ts`) and the site journey (`apps/web/e2e/site.spec.ts`). The journey builds the site with a fixture instance and checks every page with axe in light and dark, with no request to another origin. It also checks the landing page's LCP, INP and CLS on a throttled profile (PRF-12), and that the app at `/app/`, `/n/` and `/s/` still work.

## Quality and done

Each article meets the [help article definition of done](../plan/definition-of-done.md#help-article-definition-of-done) before it's published. The site as a whole meets HLP-01 to HLP-09, PRV-01, A11Y-01 and PRF-12 in CI. A usability check with five people who have never used Git, who must complete *Get started* and *Can't connect to GitHub* using only the articles, closes the stage.

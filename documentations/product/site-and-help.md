# Product site and help

The public face of Focus Notes: the page a person lands on before they install anything, the help centre the app links to when something needs more than a sentence, and a demo they can try in the browser. All three are written for people who write, not for people who build software.

> [!NOTE]
> **TL;DR.** The project repository's GitHub Pages site becomes the product site (D-167).
> - **`/` is the landing page:** a one-sentence pitch, how it works in three steps, focus mode first, real screenshots, an honest *Is it for you?*, a short FAQ, downloads for each system, and *Try the demo*.
> - **`/help/` is the help centre:** about 40 articles in eight categories named by what the reader wants to do, each one a single content type from the [writing guide](../design/help-writing.md) (D-168).
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
| **New writer** | The download page, the installer, the first run | To get set up without knowing what Git is |
| **Writer** | *Learn more* in the app, a problem message, the Help menu | A plain answer for the thing in front of them, then back to writing |
| **Power user** | The README, the help centre's *For developers and agents* | The CLI, the MCP server and keyboard reference, kept apart from the main path |

The specification under `/documentations/` stays for people building Focus Notes. The help centre never links to it for a task; a concept article may link to it at the end, as *For the curious*.

## The site's addresses

| Address | Serves | Notes |
| --- | --- | --- |
| `/` | [The landing page](#the-landing-page) | Was the owner's Focus Notes app until D-167 |
| `/help/` | [The help centre](#the-help-centre): categories, search and articles at `/help/<category>/<article>/` | Stable addresses (HLP-03) |
| `/help/whats-new/` | Release notes, newest first | From each release's notes, in user-benefit words |
| `/demo/` | [The demo](#the-demo) | The web app with sample notes |
| `/download/` | Downloads for each system, with checksums | Links to the latest GitHub Release's assets |
| `/app/` | The owner's own Focus Notes, as `/` served before D-167 | Public note pages stay at `/n/` so their addresses don't change |
| `/n/` | The owner's public notes (D-139) | Unchanged |
| `/s/` | The share reader, where share links point | Unchanged: it reads the sealed files from the site's root, as before |
| `/documentations/`, `/schemas/`, `/llms.txt` | The specification, the JSON Schemas, the map for language models | Unchanged |
| `/privacy/` | The privacy statement: nothing is collected | Linked from every page's footer |

<h2 id="the-landing-page">The landing page</h2>

One page, in this order. Each section has one job, and nothing on it is written for developers except the last feature section, which says so.

| # | Section | Content |
| --- | --- | --- |
| 1 | **Hero** | One sentence that says what it is and what makes it different ("A calm place to write, with your notes kept in your own GitHub account"), a short line about focus mode, the primary action *Download for ⟨your system⟩* (detected from the browser, with the others one click away), and *Try the demo*. Beside it, a screenshot of focus mode on a real note, in the visitor's light or dark. |
| 2 | **Trust strip** | Four short facts, each linking to proof: *Free and open source (MIT)* to the repository, *No Focus Notes account or server* to how it works, *Nothing tracked* to the privacy statement, *Your notes are plain Markdown files* to the concept article. |
| 3 | **How it works, in three steps** | Connect your GitHub account → write, with focus mode → your notes are saved on your computer and backed up to your own repositories. One screenshot each, in plain words, linked to the getting-started article. |
| 4 | **Features** | Focus mode (a short looping capture of the band following the caret, still with reduced motion), the calm canvas and Spotlight, files and folders, private notes and sharing with a passcode, themes. Each with one screenshot and one paragraph, linking to its how-to. |
| 5 | **Is it for you?** | Honest lists. *It's for you if* you want plain files you own, a quiet editor, and don't mind a free GitHub account. *Look elsewhere if* you need real-time collaboration with others, want nothing to do with GitHub, or want databases and rich media; with alternatives named. |
| 6 | **Built in the open** | No invented testimonials: the repository, the latest release and its date, the change log, and how to report a problem. |
| 7 | **For developers and AI agents** | Clearly labelled and last among the features: Markdown and Git underneath, the MCP server, the command-line tool, `focus-notes://` links. Links to the developer category. |
| 8 | **Questions** | Five to eight questions people ask before installing, each answered in one to three sentences with a link to the full article. Is it free? Do I need to know Git? Where are my notes kept? Can anyone read my private notes? Does it work offline? What about my phone? |
| 9 | **Get Focus Notes** | The downloads again, *Try the demo*, and the help centre. |

**Words:** the [writing guide's](../design/help-writing.md) voice. No "revolutionary", "seamless" or "blazing fast". Name what it does, not how it feels to build. Every claim on the page is true of the release it links to.

<h2 id="the-help-centre">The help centre</h2>

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

- **The help centre's home:** a search field, the eight categories with two or three popular articles each, and *Fix a problem* placed prominently.
- **An article:** breadcrumbs, the title, *Applies to*, the body in its content type's shape, then *Related articles*, *Was this helpful?*, the last-updated date and the release it describes.
- **Search:** a field on every help page that searches titles, headings, summaries and synonyms in the browser (HLP-09). It shows results as you type, with the article's category and the matched heading.

<h2 id="learn-more-links">Learn more links</h2>

The app links into the help centre wherever a setting, a step or a message needs more than its one line:

- **The link names an article ID,** for example `help:connect-github#device-code`, in the view document. `packages/views/help-links.json` maps each ID to its address, and the app turns it into `https://prabinpebam.github.io/focus-notes/help/…` (D-168).
- **Desktop:** links open in the system browser. **In the browser:** links open in a new tab. Both carry no query string, no referrer and no identifier.
- **Every problem message** the app can show gets a *How to fix this* link to its troubleshooting article (HLP-06).
- **Help → Help centre** in the ⋯ menu and Spotlight opens the help centre's home.
- **The check:** CI fails when a view document names an ID that isn't in the registry, the registry names an article or anchor that doesn't exist, or a link anywhere on the site is broken (HLP-03).

<h2 id="the-demo">The demo</h2>

- **What it is:** the web app built for the demo: the template's starting notes plus about ten sample notes that show focus mode, formatting, a table, folders, a public and a private note, and links between notes.
- **Kept in the browser:** everything stays in the visitor's browser. Nothing is sent anywhere, and nothing needs signing in. *Save to GitHub*, sharing and the vault are shown as they are in the desktop app, but they explain what they'd do there instead of acting.
- **Clearly a demo:** a quiet banner says it's a demo, with *Download* and *Reset demo*. *Reset demo* restores the sample notes.
- **Built from the same code:** the demo is built from the same commit as the release it links to, so it never shows features the release doesn't have.

## Screenshots

Captured from the release build in CI with the demo workspace (D-169):

- **Light and dark,** at 2× scale, cropped to the window with the window's own corners and shadow on a neutral background, with no desktop or taskbar.
- **The same sample notes** throughout, with consistent window sizes (1280 × 800 for the full window, 720 × 480 for details).
- **At most one highlight** where the reader must look.
- **Alt text** that says what the image shows, and a caption when it adds something.
- **Kept current:** regenerated for each release by the screenshot catalogue (`tools/review/catalogs.mjs`, a `site` catalogue). A check fails if a view a screenshot shows changed after the screenshot was taken.

<h2 id="how-the-site-is-built">How the site is built</h2>

As built in WP-10.1 (HLP-08). The landing page's words are a draft for WP-10.5, the help centre has its categories but no articles yet (WP-10.2, WP-10.3), and `/demo/` is a placeholder until WP-10.6.

- **Content in `site/`:** `index.md` is the landing page, one level-2 heading per section in the order above, with stable anchors (`start`, `trust`, `how-it-works`, `features`, `is-it-for-you`, `built-in-the-open`, `developers`, `questions`, `get-focus-notes`). `download.md`, `privacy.md` and `demo.md` are plain pages. `help/categories.json` lists the eight categories in order, and each article is `help/<category>/<id>.md` with the [writing guide's](../design/help-writing.md#every-article) front matter. Pictures go in `media/`.
- **The design system, as the public pages use it (D-114):** core turns the Markdown into view models (`packages/core/src/site.ts`), and five view documents render them: `siteLanding`, `sitePage`, `helpHome`, `helpCategory` and `helpArticle` (IA-VIEW-SITE, IA-VIEW-HELP). Their components are **SitePage**, **SiteSection** and **SiteLink**, with **NoteContent** for the words, and their words outside the content are messages. There's no hand-written HTML or CSS.
- **The renderer and the builder:** `apps/web/site/render.ts` is built to `apps/web/dist-site/` with the site's stylesheet and fonts. `tools/site/build.mjs` renders every page at its address, copies `media/`, and places the owner's app at `/app/` and the share reader at `/s/`.
- **The owner's app at `/app/`:** the web app's build also makes `dist-app/`, the same app reading the notes and sealed files from the folder above it. They stay at the site's root, where `/n/` and `/s/` have always found them, so no published address changes. Notes written in the browser stay too, because the site's origin is the same.
- **Light and dark** follow the visitor's setting, and every page is readable at 320 px.
- **Nothing from another origin:** the pages have no script, and their Content-Security-Policy allows only the site's own styles, fonts and pictures. The builder fails when a page links to an address the site doesn't have, to a missing anchor, or to any other site than GitHub, or names another origin anywhere else.
- **Checked in CI:** the builder's tests (`tools/test/site-build.test.mjs`, `packages/core/test/site.test.ts`) and the site journey (`apps/web/e2e/site.spec.ts`). The journey builds the site with a fixture instance and checks every page with axe in light and dark, with no request to another origin. It also checks the landing page's LCP, INP and CLS on a throttled profile (PRF-12), and that the app at `/app/`, `/n/` and `/s/` still work.

## Quality and done

Each article meets the [help article definition of done](../plan/definition-of-done.md#help-article-definition-of-done) before it's published. The site as a whole meets HLP-01 to HLP-09, PRV-01, A11Y-01 and PRF-12 in CI. A usability check with five people who have never used Git, who must complete *Get started* and *Can't connect to GitHub* using only the articles, closes the stage.

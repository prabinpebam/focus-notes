# Published website

A public home, sections and articles, not the writing app on the web.

> [!NOTE]
> **TL;DR.** Published notes are discoverable plaintext pages; shared notes remain encrypted and absent from the public index. Folders become sections, files become articles. A minimal top bar offers sections, optional project logo, theme and paragraph focus. **Preview site…** changes the local website preview without publishing. **What's built, 7 November:** visibility moves, the `/n/<path>/` renderer, Pages API setup and local preview/drafts exist. Production Publish/Unpublish, exact-commit deployment status, live site theme and public home remain partial. [G3](../plan/definition-of-done.md#g3-publish-and-unpublish-for-real) and the production contract below govern safe fake-backed implementation (D-379/D-382); the owner performs the first actual publication. A draft is never a live page.

## What belongs on the site

Turning sharing off removes current shared and published content at the next successful publish, but keeps the repository and its Git history (D-274, accepted by the owner on 3 November).

| Kind | Stored/output | Discoverable here? |
| --- | --- | --- |
| Published note/folder | Plaintext in the paired public repository and website | Yes: home, section navigation, search/index, article title/excerpt/count |
| Shared-only note/folder | Private source; opaque authenticated ciphertext in public repository/site | No: only the reader opened with a link/access code; never public titles, excerpts, paths or counts |
| Private unshared note | Private project only | No output at all |

Public Git history retains earlier plaintext and encrypted builds. A later unpublish/withdraw cannot recall copies, old ciphertext or keys someone already has. Explain this before first publication; do not imply that hiding an item from home withdraws an existing share.

## Production publishing contract

SHR-20/25/26, SHR-04 and SEC-06 deliver UC-SHARE-02/10. WP-P.22 owns both live publication and its leak gate (D-382); WP-P.12/14 retain the independent site theme and home. This is the durable F5/S2 contract, not permission for an agent to press Publish.

| Step / case | Required behavior |
| --- | --- |
| Availability | Without a working production publish path, say Publishing isn't available yet, never "local only in this preview" or fake success. Local Preview site remains explicitly non-publishing. |
| First publication | Use the approved item-first dialog. Confirm the exact public site repository/Pages URL, Will be public, plaintext versus sealed output and retained history. Cancel creates or pushes nothing. New-project folders use PRJ-10 pairing; existing paired projects may use their current site without storage migration. |
| Preflight and leak gate | Recheck the confirmed note/folder contents; new contents never silently widen the selection. Before public commit/push/deploy, reject private plaintext, access secrets, source-derived private/share names and unsealed media. Use normalized/encoded/Unicode provenance checks, report a recoverable cause without quoting private content, and make no public write on failure. |
| Save and deploy | Use the signed-in GitHub client with candidate variables absent. Commit/push only approved public output; track that exact commit's Pages deployment. Published requires deployment success and the page answering, not draft persistence, a timer, or a successful push alone. `/n/<path>/` remains the existing published-note route; links to unpublished notes become plain text. |
| Images | Only exactly referenced, supported media may publish; missing images require Locate image. Do not publish unstripped originals or silently omit images. The remaining IMG-13 media implementation stays its own work package; until ready, refuse affected publication honestly. |
| Unpublish | Preserve the private working note/media first, then deploy removal of current public output. Failed preservation stops removal. Past Git history, copied notes and reader-held keys remain; no promise of erasing them. |
| Offline / denied / rate limit / failed deployment | Notes remain, no automatic duplicate commits/deploys or false Live state. One task names Not live yet and explicit Retry, reconciling the actual commit/deployment; leave the dialog and continue writing. Honor the service's wait rather than blindly retrying a write. |
| Wait and completion | Saving to GitHub → Publishing → Published with Copy link, or Removing from your site → Removed. Above 100 ms, a wait-inventory row names the step, feedback, fn: measure and leavable progress. Above 10 minutes, say Still publishing and keep tracking the real deployment, never time out into success. |

Units and a built journey exercise production selection, leak rejection with zero push/deploy, exact-commit queued/failed/succeeded Pages responses, leave/return, retry and Unpublish against loopback fakes. The runtime head's seven-job gate and leak check are recorded before landing. The owner's first real Publish/Unpublish from Preview are G3.7/G3.8; the owner alone chooses the actual first target and presses the button. No private note is copied into public evidence.

<!-- Visual thesis: a public folder becomes a section, and each public file becomes an article. The reader controls persist, but no editor controls appear. -->
<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 390" role="img" aria-labelledby="fnsite-flow__title fnsite-flow__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnsite-flow__title">Home to a section to an article, with reading controls</title>
<desc id="fnsite-flow__desc">A minimal top bar names Book and its public Essays section, followed by theme and focus controls. The home lists Essays with two public articles. The Essays section lists Focus with its opening lines. Opening Focus shows a read-only article with a breadcrumb. Shared-only and private notes are absent from this navigation.</desc>
<g id="fnsite-flow__nav" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnsite-flow__bar" x="24" y="24" width="952" height="62" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="62" font-size="18" fill="var(--color-neutral-fg-1)">Book · Home · Essays · Focus: Off</text>
<g fill="none" stroke="var(--color-neutral-fg-1)" stroke-width="2">
<g role="img" aria-label="Light"><title>Light</title><circle cx="804" cy="55" r="7"/><path d="M804 40v4m0 22v4m-15-15h4m22 0h4m-26-11 3 3m16 16 3 3m0-22-3 3m-16 16-3 3"/></g>
<g role="img" aria-label="Dark"><title>Dark</title><path d="M851 41a14 14 0 1 0 14 20 13 13 0 0 1-14-20Z"/></g>
<g role="img" aria-label="System"><title>System</title><rect x="888" y="43" width="28" height="19" rx="2"/><path d="M902 62v6m-8 0h16"/></g>
</g>
</g>
<g id="fnsite-flow__home" data-slate-svg-step="2" data-slate-svg-effect="fade-rise">
<rect id="fnsite-flow__homebox" x="24" y="118" width="290" height="208" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="157" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__homebox" data-slate-fit-padding="16">Book · Home</text>
<text x="44" y="203" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__homebox" data-slate-fit-padding="16">Essays / · 2 articles</text>
<text x="44" y="246" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__homebox" data-slate-fit-padding="16">All published content</text>
<text x="44" y="286" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__homebox" data-slate-fit-padding="16">No shared-only entries</text>
</g>
<g id="fnsite-flow__section" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<path d="M314 220 H350" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<rect id="fnsite-flow__sectionbox" x="350" y="118" width="300" height="208" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="370" y="157" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__sectionbox" data-slate-fit-padding="16">Essays</text>
<text x="370" y="203" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__sectionbox" data-slate-fit-padding="16">Focus</text>
<text x="370" y="240" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__sectionbox" data-slate-fit-padding="16">Writing needs room to think…</text>
<text x="370" y="286" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__sectionbox" data-slate-fit-padding="16">Next article…</text>
</g>
<g id="fnsite-flow__article" data-slate-svg-step="4" data-slate-svg-effect="fade-rise">
<path d="M650 220 H686" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<rect id="fnsite-flow__articlebox" x="686" y="118" width="290" height="208" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="706" y="157" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__articlebox" data-slate-fit-padding="16">Home / Essays</text>
<text x="706" y="203" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__articlebox" data-slate-fit-padding="16">Focus</text>
<text x="706" y="246" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__articlebox" data-slate-fit-padding="16">Writing needs room to think…</text>
<text x="706" y="286" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnsite-flow__articlebox" data-slate-fit-padding="16">Read-only article page</text>
</g>
</svg>
<figcaption>One public information structure, from home to folder section to file article. Text alternative: the steps above; no shared-only material enters the index.</figcaption>
</figure>

## Home, sections and articles

### Owner corrections, 5 November: article entries and reading controls

Owner source, verbatim:

> "On the actual published site and that means preview too, articles/notes should not have a chevron right."
>
> "Font and size don't work in site preview mode."
>
> "Light/dark/system should be just icon in the actual site."

| Surface | Rule |
| --- | --- |
| Public home/section article entries and desktop preview | No trailing chevron on articles. Section navigation and unrelated app cards keep their existing cues. |
| Desktop preview's article titles, excerpts and body | The selected reading font and size apply immediately, within the preview only. Article headings use the same sanitized title blocks as the published renderer. Nested size scopes rebind dependent component tokens rather than inheriting the app root's resolved sizes. |
| Existing desktop preview and published-site design | Light, dark and system are icon-only radio choices, each with an accessible name and tooltip. The selected choice is visible and keyboard-operable. Preview changes remain device-local and never publish. The existing share/publish mocks show the same icons without wiring publication. |
| Generated note/index pages | There is no theme switch in the current generator. Keep its script-free CSP and device light/dark preference; do not add the planned control until approved for implementation. Its future design is icon-only. |

**Implementation boundary, owner direction via main, 5 November:** "implement it in the generator only if that design is already approved for implementation — otherwise just the design change." No live-control implementation approval is recorded; the initial control addition was removed. Persistent reader overrides and applying saved site defaults to a real publish remain later wiring.

**Actual generator trace:** the template's [Deploy app workflow](../../templates/workspace/.github/workflows/pages.yml) calls the release bundle's `publish/cli.mjs publish --reader .../publish`. That bundle contains [the seal publisher](../../packages/seal/src/publish.ts), which loads [the public-page renderer](../../apps/web/reader/render.ts); it renders the reader/index view documents through the app's UI runtime. This is not the product landing-page builder. Its public index already uses plain title links with no article chevrons.

**Focused verification, 5 November:** the rebuilt production preview view, driven through its controls over synthetic notes, applies all three fonts at 16/18/20 px to excerpts and article bodies; entry titles scale to 32/36/40 px and article H1s to 40/45/50 px. Both preview and generated public pages use paper (`rgb(251, 250, 247)` / `rgb(31, 29, 26)`) or ink (`rgb(26, 26, 28)` / `rgb(236, 234, 230)`) and fit at 320 px. Thirty focused unit tests and the three public-page journeys pass; the live generator still has no theme switch or scripts. The unrelated stale third-party notice blocks the aggregate check; no dependency changes were made.

Home names the project and lists its published top-level folders as sections and root files as article entries. Every public descendant is reachable through those sections, not flattened into a giant feed. A folder always looks like a section with a folder cue and **⟨count⟩ articles**; the count is descendant published files, not folders or private/shared-only notes.

A section lists its child sections and direct articles. An article entry shows the first H1 (otherwise file name) and the first readable body lines, clamped to two rendered lines with an ellipsis. Derive excerpts only from sanitized public source, skipping front matter/code/hidden metadata; no excerpt is a valid state. Selecting the title opens the article's canonical `/n/…/` page with breadcrumb, readable body, media and scope-safe Markdown links. Folders have stable section addresses; preserve old article URLs/redirects on explicit rename.

Navigation uses semantic links and disclosures, not a writing-app FileTree with editing menus. Deep paths use breadcrumbs and expandable branches. Proposed scale bound: 50 direct entries per page with Next/Previous links and a stable page URL; never download/render an unbounded note body/tree to show home. Every public item stays reachable. Long titles wrap; sections with no published descendants are omitted unless explicitly published as an empty section, which says **No articles yet**.

A live site with nothing published (for example after Turn off sharing) shows the site name, the project mark or a 64 px illustration and **Nothing published yet**; the same empty state appears in an unpublished local preview, with Return to notes, never an invitation to start a browser note. Counts use plural rules: **1 article**, **12 articles**. A missing public page shows **This page isn't available** and Home; a section/page load failure keeps its prior content with Retry, not an empty success state. No private item names appear in errors.

## Reading controls

The minimal top bar has:

- Optional project icon, only when explicitly selected for the website; a text site name remains and links Home. App Watermark is not automatically a site background. A chosen sanitized logo is a public asset, never a private path.
- Direct links to top-level public sections; overflow collapses into **Sections**, preserving link labels, count cues and keyboard order at 320 px. No horizontal-only scrolling menu.
- **Theme** with Light / Dark / System, a single-choice control, not three unrelated on/off switches. Default System follows the device; a saved reader override stays on this site.
- **Focus** On/Off, using the same paragraph-focus tokens and fading rules as the desktop app, but read-only. Focus defaults Off. Clicking/focusing an article paragraph chooses it; scrolling follows the paragraph nearest the reading line. Keyboard paragraph navigation remains available and does not hijack text selection, browser find or screen-reader reading.

Focusing text never makes it editable or creates a caret/document journal. The top bar stays reachable, reduced motion removes transitions, and active paragraph identity never depends only on colour. Keep screen-reader content in the accessibility tree. Without script, public home/sections/articles and normal theme reading still work; enhanced focus controls are not fake working buttons.

Public navigation never lists a share. The sealed reader uses these site typography/theme controls but gets its navigation only from the opened grant, with no doorway into other private content. Optional remembered reader keys are not a browser note store.

## Preview site

**Approved design (3 November 19:39, D-335, D-337):** Settings → Sharing → **Preview site…** fills the project window with the site in its own theme; the app's look returns unchanged when it closes. A plain top band holds **Preview site**, **Close preview**, **Apply**, **Site theme** (Paper, Sepia, Ink, Dusk), **Font** (Serif, Sans, Hyperlegible), **Default size** (Small, Medium, Large) and *Changes only the website. Your app's appearance stays the same.* Below it is the site as readers see it: the site name and top-level sections, **Theme** (Light, Dark, System) and a **Focus** switch; home with the tagline and section cards with counts; a section with *Home /*, its count and article cards with two-line excerpts; an article with its breadcrumb and *Updated ⟨date⟩*. Close preview and Apply return to Settings → Sharing. See [Sharing → Approved design](../design/views/sharing.md#approved-design).

**Local review implementation (`vq-share-rest`, 3 November):** Preview site fills the window below its draggable title-bar band. It reads the public-root notes and the notes explicitly selected for the device-local Publish draft, using their actual headings, excerpts and modification dates. It has one scoped theme/font/size context, home/section/article navigation and paragraph focus; focus follows a chosen block or Up/Down while the article has keyboard focus. Close leaves the app appearance untouched; Apply saves only the device-local site draft. Publish… from Files or ⋯ → Note opens the approved confirmation and records the selected note or folder in that local draft: it does not move note files, upload plaintext or call GitHub. The completion toast says **Saved to the local site preview.**, not that a real publication succeeded. No invented tagline, sample content, gallery controls, empty-site design or first-site setup ships in these views. Actual publishing and site settings transport remain outside this review increment.

**Not in the approved mocks yet (design before building):** opening from ⋯ or Spotlight, the **Unpublished preview** label, **Show sample**, the desktop/narrow width choice, the Keep editing / Discard changes choice, and the empty, failure and missing-font states below. The steps below remain the intended behaviour behind the approved surface.

Settings → Project → **Preview site…**, ⋯ → Preview site… and Spotlight open IA-VIEW-SITEPREVIEW inside the project window, leaving its note and caret intact. The website preview is a separate read-only view, labelled **Unpublished preview**; Return to notes restores the exact note/caret. No browser writing surface, external server or remote upload is involved.

1. Prepare the current project's **public** inventory and website renderer locally. With nothing published, show the empty state; **Show sample** swaps in synthetic sample pages, each marked with a **Sample** badge. Never choose real private notes as samples.
2. Show Home / a section / an article with the exact production renderer, navigation, sanitized logo and desktop/narrow width choice. If entered from a prepared Publish action, the explicitly chosen prospective-public target may be included with **Not published**; do not include any other private content.
3. Offer Site theme (Paper by default), approved bundled font families and default size presets from reading tokens. This reversible default is chosen, not an owner blocker. Live preview changes the local draft only, not personal app Appearance or another project's settings. No remote font URL, CSS, arbitrary script or third-party asset fetch.
4. **Apply** atomically saves the validated site settings in the private project's `.focus-notes/site.json`; only allowlisted appearance fields/assets reach the public build. It does not publish or create a site/share. **Cancel**/Return with dirty settings offers Keep editing / Discard changes. Saved settings remain until an explicit Publish applies them to the live site.
5. Saving/render failure keeps the last good preview and controls/draft with Retry. Missing/invalid fonts show the named bundled fallback, not an invisible page. Theme/size controls answer within a frame; slow rendering has one named wait and cannot eat input.

Initial focus is the preview heading, then controls, navigation, content and Return to notes in ordinary Tab order. Escape returns when clean, or opens the dirty-settings choice. Pending save retains focus and the previous persisted values. Preview has no live credential-bearing navigation; Markdown links stay within the local public preview or open as explicit normal external links through the desktop's existing allowlist.

## Publishing a note

Proposed for today's workspace (D-349, SHR-25, SHR-26), so publishing works before projects exist. It needs the owner's yes to P1 below. Nothing is added to the writing window (Rule 7); the status shows in the bottom pill and in the Share dialog.

1. ⋯ → Note → **Publish…** or Files → **Publish…** opens the approved confirmation. Notes are private by default; the first publish states *Anyone with the link will be able to read {what} once it's published. It moves to your public notes.* **Publish** is the only commit; Cancel changes nothing.
2. Publish moves the note into the public notes (the built Make public move), saves it to GitHub, and starts one task in the bottom pill: *Saving to GitHub…* → *Publishing… usually about a minute* → **Published.** with **Copy link** (D-351). The person can keep writing or close the window; the task carries on.
3. The page is `https://<owner>.github.io/<repository>/n/<path>/` (the root holds the product site, so notes sit under `/n/`; P2). It takes the site theme, not the app's (WP-P.12, slice 3); until then it uses the built reader style.
4. Links to notes that aren't published show as plain text on the site (D-350); nothing private is uploaded, and the dialog adds no warning. Help gets that line.
5. **Copy public link** before the page is live copies it and says *Copied. The page will open once publishing finishes.*
6. **Unpublish** (⋯ → Note, or the Share dialog) asks once, moves the note back to private, and shows *Removing from your site…* → *Removed from your site.* Past Git history and copies people saved remain (D-274).

| State | What the person sees |
| --- | --- |
| Publishing | Bottom pill: *Publishing… usually about a minute*; Share status *Publishing…* |
| Live | *Published.* with Copy link; Share status *Live* |
| Failed | *Not live yet.* with **Retry**; the note stays in the public notes and nothing is lost |
| Slow (over 10 minutes) | *Still publishing. GitHub is taking longer than usual.* |
| Signed out or no Pages | The ordinary sign-in or Pages setup step (built, `packages/github`), then the publish continues |
| Site with nothing published | The site's empty home (designed in slice 1) |
| A page that was unpublished | The site's missing page with a link home (designed in slice 1) |

Template workspaces deploy a pinned web bundle, so site theme and home changes reach them only after a web release and the Update app pull request; this repository's own site builds from source and gets them when `main` lands.

## Publishing design review (5 November)

The owner asked: “I need to see the review design for publishing feature.” Gallery entries **16–29**, on `vq-publish-mocks`, extend the approved sharing mocks with fake publishing states. The [local gallery](http://127.0.0.1:5242/) is a detached static build; the earlier approved gallery at port 5241 remains available. These are review designs, not runtime wiring or permission to publish.

| Open the design | What it shows |
| --- | --- |
| [Entry points](http://127.0.0.1:5242/?f=mock.publish.entry) | Files row context menu and ⋯ → Note, plus separate, labelled review controls |
| [First publish](http://127.0.0.1:5242/?f=mock.publish.confirm) | The approved item card, **Will be public**, GitHub-history consequence, Cancel and Publish |
| [Saving](http://127.0.0.1:5242/?f=mock.publish.saving), [publishing](http://127.0.0.1:5242/?f=mock.publish.publishing), [live](http://127.0.0.1:5242/?f=mock.publish.live) | One bottom notification pill; Share shows **Live** with Copy public link and Open site |
| [Slow](http://127.0.0.1:5242/?f=mock.publish.slow), [failure](http://127.0.0.1:5242/?f=mock.publish.failed), [copied early](http://127.0.0.1:5242/?f=mock.publish.copied) | The specified status words; Retry returns the fake deployment to Saving |
| [Unpublish](http://127.0.0.1:5242/?f=mock.publish.unpublish), [removing](http://127.0.0.1:5242/?f=mock.publish.removing), [removed](http://127.0.0.1:5242/?f=mock.publish.removed) | Confirmation explains return to private notes and retained Git history/copies; removal has pending and confirmed pills |
| [Images](http://127.0.0.1:5242/?f=mock.publish.images) | The note card says its images become public with location and camera data removed |
| [Empty home](http://127.0.0.1:5242/?f=mock.publish.empty), [missing page](http://127.0.0.1:5242/?f=mock.publish.missing) | Public-reader empty states; Go home returns from the missing page to the empty home |

Every new screen labels the **recommended, unapproved** P1–P3 answers: this repository’s Pages site; `https://<owner>.github.io/<repo>/n/<path>/`; images public with location/camera metadata removed. Append `&scheme=dark` to a direct mock link for its dark context. P4 remains a future, owner-operated publication decision.

**Try it:** start at **Entry points** for the clickable flow. Choose Publish… from a note’s Files context menu or ⋯ → Note, then Publish. Use the separate review controls to show publishing, live, slow or failed; Retry returns to Saving. Open Share to see Live, Copy public link, Open site and Unpublish. Direct links that start with an already-open modal are visual snapshots: the gallery’s initial modal mount leaves its root inert, so pointer interaction there is unavailable. Opening that modal through Entry points avoids this gallery limitation; no production component is changed to work around it.

Publish and Unpublish only change local mock state. Deployment steps advance with the visibly separate **Review controls**, never a timer pretending a remote task succeeded. Copy does not touch the clipboard; Open site opens the existing synthetic Preview site, including its unchanged Paper, Sepia, Ink and Dusk choices. The existing single-action notification pill exposes Copy link; Open site remains in Share. Pills are shown on the review canvas, not over an open modal; close Share to return to the current pill. No element is added to the writing window, and no private content or account is read. The new views reuse the existing layouts, item card, dialogs, menu, notification pill and empty state unchanged; scrolling belongs to the outer surface and insets to its content stack.

**Review evidence:** `pnpm check`, `pnpm --filter @focus-notes/views run typecheck` and `pnpm --filter @focus-notes/desktop run gallery:build` passed. Owner-requested headless Playwright review opened all 14 states in light and dark with no page errors or document overflow, inspected the dialogs and pills, followed both Publish menu paths and the Share → Unpublish flow, and checked the confirmation, images, failure and site states at 320 px in both contexts. No test suite, journey, catalogue or CI run was started. This is design review evidence, not publication readiness or owner approval.

## Readiness assessment (5 November)

The owner asked (5 November) what is done and pending for publishing notes as public web pages on GitHub Pages, and whether the spec is enough to build it. Their earlier words: publishing "plainly publishes a note in GitHub pages for anyone to visit… seen more as a website… automatically take the site theme which can be different from the theme the user uses for their own app."

**Built on `main`** (the instance model: a public repository with `notes/` and a `private/` submodule):

| What | Where | Requirements | Tests |
| --- | --- | --- | --- |
| Make public / Make private with the first-publish confirmation; private by default | `packages/core` visibility move, `packages/views` confirmation | SHR-01, SHR-02 | core units, `m5-public-link.spec.ts` |
| A page per public note at `/n/<path>/`; links to private or missing notes become plain text | `apps/web` `public-page.ts`, `packages/seal/src/publish.ts` (with an index at `/n/`, D-139) | SHR-03 | seal and web units |
| Pages setup through the GitHub API | `packages/github/src/api.ts` | PKG-02 | `setup.test.ts` |
| Copy public link | Share dialog | SHR-03 | `m5-public-link.spec.ts` |
| Preview site and a local Publish… draft (*Saved to the local site preview.*, nothing sent to GitHub) | `vq-share-rest` review slice | SHR-20, SHR-21 | local review only |
| This repository's Pages workflow builds from source; templates deploy a pinned web bundle | `.github/workflows/pages.yml`, `templates/workspace/.github/workflows/pages.yml` | PKG-02 | CI |

**Pending:** real Publish and Unpublish from the approved dialog; the deploy status (UC-SHARE-02's *Live / Publishing… / Not published yet* has no strings yet); the site theme on the live site (WP-P.12); the home with sections and counts (WP-P.14); the site's empty, missing-page and failure states; published images (IMG-13).

**Gaps found and filled here:** the approved project model (D-312, a separate `notes-site` repository per project, WP-P.4) conflicts with the built instance model, so nothing could ship until projects land; this page now proposes publishing on today's workspace first (D-349, SHR-25, P1). There was no deploy status (D-351, SHR-26), no unpublish flow, no rule for links to unpublished notes (D-350) and no Definition of Done rows with a Try it (MP.32, MP.33). The risk that matters is real accounts: an agent never publishes to the owner's real site (D-343); every agent test uses GitHub protocol fakes.

**Current verdict, 7 November (D-379/D-382):** specified enough for production wiring and negative-case proof against protocol fakes, using [G3](../plan/definition-of-done.md#g3-publish-and-unpublish-for-real). The prior P1–P4 proposals below remain historical context, not a blanket implementation hold. This does not choose the owner's first real site, approve broader media publication, or authorize an agent to publish. First real output remains owner-dependent and explicitly confirmed.

**Slices, smallest visible first (D-349):**

1. **Mocks** in the gallery for the publish states, Unpublish, and the site's empty and missing pages. Small.
2. **Publish and Unpublish on today's workspace** with the deploy status (WP-P.22, MP.32, MP.33). About two days.
3. **The site theme** on the live site (WP-P.12). About a day.
4. **The public home with sections and counts** (WP-P.14). About a day.
5. **Images in published notes** (WP-9.9, IMG-13). About a day.

**Historical owner questions, 5 November:** the actual first site remains the owner's dependency; the existing `/n/` renderer and missing-media safeguards govern fake-backed work in the meantime.

- **P1.** Publish on today's workspace now (this repository's Pages site, through the built Make public move), rather than wait for projects and a separate `notes-site` repository? Recommended: yes. If yes, WP-P.12 and WP-P.14 no longer wait for WP-P.4.
- **P2.** Published notes live under `/n/` (the product site keeps the root), or should the notes take the root? Recommended: `/n/`.
- **P3.** A note with images publishes its images as public files with location and camera metadata removed (yes), or such notes can't be published yet (no)? Recommended: yes.
- **P4.** For the first live publish, which you do by hand (D-343): (a) this repository's real site, or (b) a throwaway test repository?

## Site components

The website extends the existing ReaderPage layout with site components specified with WP-P.14, read from the public index only: **SiteNav** (name, optional mark, top-level sections, Sections overflow), **SiteThemeChoice** (Light / Dark / System radio group), **SiteFocusToggle** (a checkbox with the switch role, shown only when scripts run), **SiteBreadcrumb**, **SiteSectionList** (ItemCard rows with a 48 px folder cue on the home page and a count badge) and **SitePager** (Next / Previous). A grouped control rounds only its outer corners.

## Design and future evidence

| ID | Choice | Serves | Why |
| --- | --- | --- | --- |
| DD-PUB-01 | Public-only home/sections/article index; shared counts absent | UC-SHARE-10 | Discovery is publication, not access-code sharing |
| DD-PUB-02 | Minimal semantic navigation; Theme choice plus Focus switch | UC-SHARE-10 | Same reading comfort without a disguised editor |
| DD-PUB-03 | Exact renderer and local draft controls before explicit Apply/Publish | UC-SHARE-11 | See the outcome without accidental publication |
| DD-PUB-04 | Passive logo and bundled token fonts only | UC-PROJ-04, UC-SHARE-11 | Uploaded artwork and typography cannot become code/network access |

After design approval: public/private/shared fixture index and leak checks; 1,000 public articles over a deep tree, ensuring every article reachable and no page exceeds 50 direct entries; 320 px/light/dark/contrast/reduced-motion visual review; keyboard/reading-focus checks; preview/app typography isolation; failed Apply/Cancel/no-network and prospective-public-target checks. These are future evidence, not tests run or approval claimed by this spec.

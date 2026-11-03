# Published website

A public home, sections and articles, not the writing app on the web.

> [!NOTE]
> **TL;DR.** Published notes are discoverable plaintext pages; shared notes remain encrypted and absent from the public index. Folders become sections, files become articles. A minimal top bar offers sections, optional project logo, theme and paragraph focus. **Preview site…** in the desktop app shows that same website and changes its theme, fonts and default size without publishing. This is planned, not built: D-295 to D-297 / D-299, UC-SHARE-10 / UC-SHARE-11, SHR-20 to SHR-22.

## What belongs on the site

Before any real publication, public ciphertext commit, account/repository operation or browser retirement, obtain the owner's explicit decision through the original main chat. This page specifies the intended outcome only; choosing a reversible theme/font/layout in a local preview does not authorize deployment or data changes.

| Kind | Stored/output | Discoverable here? |
| --- | --- | --- |
| Published note/folder | Plaintext in the paired public repository and website | Yes: home, section navigation, search/index, article title/excerpt/count |
| Shared-only note/folder | Private source; opaque authenticated ciphertext in public repository/site | No: only the reader opened with a link/access code; never public titles, excerpts, paths or counts |
| Private unshared note | Private project only | No output at all |

Public Git history retains earlier plaintext and encrypted builds. A later unpublish/withdraw cannot recall copies, old ciphertext or keys someone already has. Explain this before first publication; do not imply that hiding an item from home withdraws an existing share.

<!-- Visual thesis: a public folder becomes a section, and each public file becomes an article. The reader controls persist, but no editor controls appear. -->
<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 390" role="img" aria-labelledby="fnsite-flow__title fnsite-flow__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnsite-flow__title">Home to a section to an article, with reading controls</title>
<desc id="fnsite-flow__desc">A minimal top bar names Book and its public Essays section, followed by theme and focus controls. The home lists Essays with two public articles. The Essays section lists Focus with its opening lines. Opening Focus shows a read-only article with a breadcrumb. Shared-only and private notes are absent from this navigation.</desc>
<g id="fnsite-flow__nav" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnsite-flow__bar" x="24" y="24" width="952" height="62" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="44" y="62" font-size="18" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnsite-flow__bar" data-slate-fit-padding="16">Book · Home · Essays · Theme: System · Focus: Off</text>
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

Home names the project and lists its published top-level folders as sections and root files as article entries. Every public descendant is reachable through those sections, not flattened into a giant feed. A folder always looks like a section with a folder cue and **⟨count⟩ articles**; the count is descendant published files, not folders or private/shared-only notes.

A section lists its child sections and direct articles. An article entry shows the first H1 (otherwise file name) and the first readable body lines, clamped to two rendered lines with an ellipsis. Derive excerpts only from sanitized public source, skipping front matter/code/hidden metadata; no excerpt is a valid state. Selecting the title opens the article's canonical `/n/…/` page with breadcrumb, readable body, media and scope-safe Markdown links. Folders have stable section addresses; preserve old article URLs/redirects on explicit rename.

Navigation uses semantic links and disclosures, not a writing-app FileTree with editing menus. Deep paths use breadcrumbs and expandable branches. Proposed scale bound: 50 direct entries per page with Next/Previous links and a stable page URL; never download/render an unbounded note body/tree to show home. Every public item stays reachable. Long titles wrap; sections with no published descendants are omitted unless explicitly published as an empty section, which says **No articles yet**.

An unpublished local preview says **No published articles yet** with Return to notes, not an invitation to start a browser note. A missing public page shows **This page isn't available** and Home; a section/page load failure keeps its prior content with Retry, not an empty success state. No private item names appear in errors.

## Reading controls

The minimal top bar has:

- Optional project icon, only when explicitly selected for the website; a text site name remains and links Home. App Watermark is not automatically a site background. A chosen sanitized logo is a public asset, never a private path.
- Direct links to top-level public sections; overflow collapses into **Sections**, preserving link labels, count cues and keyboard order at 320 px. No horizontal-only scrolling menu.
- **Theme** with Light / Dark / System, a single-choice control, not three unrelated on/off switches. Default System follows the device; a saved reader override stays on this site.
- **Focus** On/Off, using the same paragraph-focus tokens and fading rules as the desktop app, but read-only. Focus defaults Off. Clicking/focusing an article paragraph chooses it; scrolling follows the paragraph nearest the reading line. Keyboard paragraph navigation remains available and does not hijack text selection, browser find or screen-reader reading.

Focusing text never makes it editable or creates a caret/document journal. The top bar stays reachable, reduced motion removes transitions, and active paragraph identity never depends only on colour. Keep screen-reader content in the accessibility tree. Without script, public home/sections/articles and normal theme reading still work; enhanced focus controls are not fake working buttons.

Public navigation never lists a share. The sealed reader uses these site typography/theme controls but gets its navigation only from the opened grant, with no doorway into other private content. Optional remembered reader keys are not a browser note store.

## Preview site

Settings → Project → **Preview site…**, ⋯ → Preview site… and Spotlight open IA-VIEW-SITEPREVIEW inside the project window, leaving its note and caret intact. The website preview is a separate read-only view, labelled **Unpublished preview**; Return to notes restores the exact note/caret. No browser writing surface, external server or remote upload is involved.

1. Prepare the current project's **public** inventory and website renderer locally. With no site enabled, allow a synthetic sample or empty state; never choose real private notes as samples.
2. Show Home / a section / an article with the exact production renderer, navigation, sanitized logo and desktop/narrow width choice. If entered from a prepared Publish action, the explicitly chosen prospective-public target may be included with **Not published**; do not include any other private content.
3. Offer Site theme (Paper by default), approved bundled font families and default size presets from reading tokens. This reversible default is chosen, not an owner blocker. Live preview changes the local draft only, not personal app Appearance or another project's settings. No remote font URL, CSS, arbitrary script or third-party asset fetch.
4. **Apply** atomically saves the validated site settings in the private project's `.focus-notes/site.json`; only allowlisted appearance fields/assets reach the public build. It does not publish or create a site/share. **Cancel**/Return with dirty settings offers Keep editing / Discard changes. Saved settings remain until an explicit Publish applies them to the live site.
5. Saving/render failure keeps the last good preview and controls/draft with Retry. Missing/invalid fonts show the named bundled fallback, not an invisible page. Theme/size controls answer within a frame; slow rendering has one named wait and cannot eat input.

Initial focus is the preview heading, then controls, navigation, content and Return to notes in ordinary Tab order. Escape returns when clean, or opens the dirty-settings choice. Pending save retains focus and the previous persisted values. Preview has no live credential-bearing navigation; Markdown links stay within the local public preview or open as explicit normal external links through the desktop's existing allowlist.

## Design and future evidence

| ID | Choice | Serves | Why |
| --- | --- | --- | --- |
| DD-PUB-01 | Public-only home/sections/article index; shared counts absent | UC-SHARE-10 | Discovery is publication, not access-code sharing |
| DD-PUB-02 | Minimal semantic navigation; Theme choice plus Focus switch | UC-SHARE-10 | Same reading comfort without a disguised editor |
| DD-PUB-03 | Exact renderer and local draft controls before explicit Apply/Publish | UC-SHARE-11 | See the outcome without accidental publication |
| DD-PUB-04 | Passive logo and bundled token fonts only | UC-PROJ-04, UC-SHARE-11 | Uploaded artwork and typography cannot become code/network access |

After design approval: public/private/shared fixture index and leak checks; 1,000 public articles over a deep tree, ensuring every article reachable and no page exceeds 50 direct entries; 320 px/light/dark/contrast/reduced-motion visual review; keyboard/reading-focus checks; preview/app typography isolation; failed Apply/Cancel/no-network and prospective-public-target checks. These are future evidence, not tests run or approval claimed by this spec.

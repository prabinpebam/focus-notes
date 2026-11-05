# Published website

A public home, sections and articles, not the writing app on the web.

> [!NOTE]
> **TL;DR.** Published notes are discoverable plaintext pages; shared notes remain encrypted and absent from the public index. Folders become sections, files become articles. A minimal top bar offers sections, optional project logo, theme and paragraph focus. **Preview site…** in the desktop app shows that same website and changes its theme, fonts and default size without publishing. This is planned, not built: D-295 to D-297 / D-299, UC-SHARE-10 / UC-SHARE-11, SHR-20 to SHR-22. **Status, 5 November:** Make public, the `/n/<path>/` page renderer, Pages setup and the local Preview site are built; real Publish, unpublish, the site theme on the live site and the deploy status are not. [Publishing a note](#publishing-a-note) and the [readiness assessment](#readiness-assessment-5-november) bring it to execution readiness, pending four owner answers.

## Owner source: publishing is a process (5 November, 14:29)

**Strict design: proposed specification and mock screens only.** The direction below supersedes the earlier ongoing bottom-pill design in D-351 and the 14-state review. Only success is a bottom notification. Ongoing work lives on the existing bottom-left status cluster and in its detail card. The owner explicitly authorizes this cluster change; it is not permission to add anything else to the writing window or to make publishing functional.

The owner’s words, verbatim:

> Publish is not that simple. Publish is a long running task with multi steps and a time taking github actions part also. This has to be clearly communicated and the steps involved and their progress has to be transparently shown.
> - The success notification can be shown at the bottom.
> - Ongoing process can now be indicated at the bottom left corner icon for backing up to cloud
>   - The detail card can show the publish progress along with a link to open the actions page to view how the actions is doing.
> - We would ideally want to reflect back any failure in actions with ways to troubleshoot and recover.
> - Now we also have a situation where we will have a published version and a draft version locally. Users should be able to clearly tell which one is which. They should have a way to switch between the 2, compare the 2.
> - A published note should also have the globe icon indicating that note is live. The globe icon should be beside and before the "Backup to cloud icon". Clicking the globe icon should open the actual site with default browser. Tooltip to be shown showing the address of the page.
> - The backup to cloud icon btn should become a publish icon. Now save to cloud means publish for a public note. Publish icon should not immediately publish but opens the same card for back up to cloud but now adapted for publishing, and updating already published notes and keeping track of ongoing published process.
> - Beside the publish icon, there should be a hard drive icon button that indicates that everything is saved locally.
> I've given you the general core thinking. You need to detail this out in spec and flows and UI and UX and show me the UI design first for me to approve before making it functional.

The accompanying [first-publish confirmation screenshot](../assets/publishing-first-confirmation.png) is the owner’s reference: **Publish “On focus”?**, the existing item card and **Will be public** badge, the public-website/Git-history consequence and Cancel/Publish. The source attachment was **Pasted Image 2.png**, supplied with this direction. Keep that confirmation unchanged; the long-running process begins only after Publish.

## Publishing process: proposed design

The chain is CP-SHARE-01 → SC-SHARE-09 → UC-SHARE-13 to UC-SHARE-16 → IA-CMP-PUBLISHSTATUS / IA-CMP-PUBLISHCARD / IA-CMP-PUBLISHVERSIONS → SHR-25 / SHR-26. These additions are proposed under the D-pending decisions; the orchestrator assigns their numbers. Existing sharing and private-backup behavior is otherwise unchanged.

### The only writing-window change

Bottom left, in reading order: **globe → publish → local disk**. The private-note baseline keeps its existing cloud-backup control; it does not gain a globe. A public-intended note replaces that cloud control with **Publish**. The local-disk control alongside it says **Saved on this computer** only after the current draft is actually stored. No note title, persistent sentence, progress bar, version switcher or new toolbar is added beside this cluster.

| State | Globe | Publish / cloud control | Local disk |
| --- | --- | --- | --- |
| Private note | Absent | Existing cloud backup, unchanged | Existing local-save indication; same saved/error truth |
| Public, never live | Absent | Publish icon; opens ready-to-publish card, never starts a publish | Saved locally, saving or failed, independently |
| Live, no newer draft | Present | Publish icon; opens current published details, no unnecessary Update action | Saved locally |
| Draft ahead of published | Present, opens last verified live version | Publish icon; card says **Draft has unpublished changes**, offers Update published | Saved locally |
| Publishing | Keep the globe if an older revision is still live | Same icon’s own-border pending arc; remains openable to inspect progress, never a disabled dead end | Keeps tracking the changing draft |
| Publish failed | Keep an older verified-live globe; absent on first-publish failure | Same control’s danger feedback and accessible failure name; opens cause/recovery | Draft still saved locally, unless its own save failed |

The globe’s tooltip is the exact canonical page address. Activating it opens that address in the default browser, not the editor or site preview, and never starts a publish. Until the first live check succeeds there is no globe. After an update failure it still opens the last good published page, never the failed draft. First-publication failure leaves a **public-intended, not live** state; do not silently make it private or claim it published.

Hovering the publish control previews the existing backup detail card without taking focus; pressing it opens the same card for keyboard/pointer use. Esc closes it and returns focus to the control, not a new location. The pending icon stays operable: use its existing feedback state without making inspection inert. Tooltips, accessible names and the card provide the non-colour meaning; no second resting badge is added to the cluster.

### One long task, with evidence for every step

**Publish** and **Update published** capture one explicit, locally saved revision. Subsequent typing produces a newer local draft; it is never swept into the in-flight public revision. The writer may close the detail card, switch notes or keep writing. The card can be reopened on the current task with its completed steps intact. A push alone is not publication.

| Step | Visible progress | Completion evidence | Actions link |
| --- | --- | --- | --- |
| Save locally | **Saving on this computer…**; determinate file/asset count only if known | Atomic local-save receipt for the selected revision | **Run not started** |
| Commit | **Committing revision…**; pending, then Done | Commit identity matches the captured revision and permitted public assets | **Run not started** |
| Push | **Pushing to GitHub…**; real transferred/total bytes if available, otherwise indeterminate | GitHub acknowledges that commit; failed network/auth retains local draft and commit | **Waiting for run** until a matching run exists |
| GitHub Actions build | **Building site…**; queued/running, named job and completed/known job count; elapsed time | The run for that exact commit reports the build result | **Open Actions run**, scoped to that run |
| Deploy | **Deploying site…**; current job and elapsed time, not an invented percentage | Pages deployment environment reports success for the same commit | Same run link |
| Live check | **Checking live page…**; awaiting verification, with elapsed time | Correct page/revision is observable at its canonical address; a cached old page is insufficient | Same run link remains available |

Every step remains visible as **Waiting**, **In progress**, **Done**, **Failed** or **Cancelled**, with the current step named. The card shows completed steps out of the known six and elapsed time, not “67% published” as if steps took equal time. If GitHub exposes only queued/running, show exactly that; no synthetic build percentage. When a matching Actions run exists its link is available beside the pipeline, including after failure. Before then, explicitly say the run has not started rather than offering a broken or unrelated run link.

This is a **long, leavable background wait**. Within the next frame the publish icon acknowledges the action; pending and confirmation each hold at least the existing 200 ms token beat. After 3 s the card shows elapsed time. After 10 minutes it says **Still publishing. GitHub is taking longer than usual.** and identifies the still-running step, preserving the run link and **Keep writing**. Closing the card never cancels a remote Actions job or reports success. There is no fake Cancel after a push: use Open Actions run for any GitHub-side cancellation; later observation must reflect cancellation explicitly.

After live verification, the globe appears or advances to the new revision. The current task becomes **Published**; the bottom pill says **Published.** with **Open site**. If typing continued, the card also says **Newer draft saved locally** and leaves **Update published** available for a separate, explicit action. Do not claim that the current draft is live merely because the older captured revision succeeded.

### Failure, troubleshooting and recovery

Failure stays in the publish card and on its control; the writing surface and local-save indicator continue independently. Keep the last known live revision and local draft. Show **what failed**, **the cause reported by GitHub**, **what is still safe**, then recovery. Never fabricate a diagnosis from a timeout; **Couldn’t check the run** is not **Build failed**.

| Failure | Card and troubleshooting | Recovery |
| --- | --- | --- |
| Local save failed | **Couldn’t save this draft. Nothing was sent.** Check free space/folder access; keep unsaved text in the editor | **Retry save**; publishing cannot advance before save succeeds |
| Commit or push failed | Name the failing step; distinguish sign-in, permission, offline and conflict causes; retain any completed local commit | **Retry**, the existing sign-in/conflict recovery as applicable; no Actions link before a run exists |
| Actions build failed | Named failed job and GitHub cause; for a missing asset, name only the selected public note’s missing asset. Troubleshoot: open the failed job, fix the draft/asset, then explicitly update | **Open Actions run**, **Retry build** for the same captured revision, or **Update published** for the corrected draft |
| Deploy failed | Explain the reported Pages permission/configuration cause, with the failed job; check the run’s Pages setup instructions | **Open Actions run**, **Retry deploy** only where supported, otherwise **Retry publish** |
| Run cancelled | **Publishing was cancelled in GitHub. Your draft is saved locally.** Older live page, if any, remains | **Open Actions run**, **Retry publish** |
| Live check failed / status unavailable | **Deploy finished; the new page isn’t verified yet.** Or **Couldn’t check GitHub.** Keep known run result and old live identity separate | **Check again**, **Open Actions run**; do not rerun an already-successful build just to retry observation |
| A bad update is already live | Name the last good revision and current live revision; keep the local draft | **Revert published…** → confirmation → a new deployment of the last good public revision, with the same six-step tracking; never reset local text or force-push history |

Every Actions failure includes the run link, cause/troubleshoot section and the applicable Retry action. **Revert published…** is offered only when a previous verified-live revision exists; for first publication say **No earlier published version** rather than offering an impossible revert. Revert always confirms which version will become public, leaves the current draft untouched and is not instant Undo. A failure before deploy does not imply the old live site needs reverting; explain that it remains live.

### Draft, published and compare

The publish card is the entry point; no switcher is added permanently to the writing window. It shows a paired summary: **Draft · saved locally** and **Published · live at 14:02**, plus **Unpublished changes** when their revision identities differ. **View draft**, **View published** and **Compare versions** open a separate version-review surface. The selected version is named above the content, never inferred from colour. Published is read-only and pinned to the verified-live revision; **Return to draft** restores the exact note, caret and scroll. If no version is live, Published/Compare are unavailable with **Publish this note first**.

The compare view reuses the existing version-diff renderer: **Published** is the base, **Draft** is the newer local snapshot; additions and removals have words/marks, not colour alone. Both sides identify their revision/time. At 320 px use the existing stacked/unified representation, not shrunken side-by-side columns. Comparing never mutates either version. If the draft changes while comparison is open, keep the reviewed snapshot and show **Newer draft available** with **Refresh comparison**; never replace the text being inspected underneath the person.

**Update published** names the action explicitly and captures the reviewed draft revision. If it changed since review, show the newer revision before allowing the publish; no silent publication of unreviewed text. One task per note at a time: an in-flight publish is inspectable, with **Keep writing**, not a second Update action. Other notes’ independent tasks remain usable. This slice is one note at a time; it does not invent bulk publishing, cross-note selection or automatic publication of later saves.

### Task flows: publish, keep writing, recover and review

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 740" role="img" aria-labelledby="publish-process__title publish-process__desc" data-slate-safe-margin="24">
<title id="publish-process__title">One captured revision, six publish steps, a separate local draft</title>
<desc id="publish-process__desc">First publish goes through the approved confirmation; Update published reviews the draft and differences. Both capture one saved revision, then save locally, commit, push, build in GitHub Actions, deploy and verify live. The writer keeps drafting independently and reopens progress from the publish icon. A failed Actions job offers its cause, troubleshooting, the run link and Retry; a confirmed revert redeploys a previous live revision without changing the draft. Verified success shows the bottom pill and globe; the globe opens the exact live page in the default browser. Draft and Published switch in a separate review, with Compare versions between them.</desc>
<g fill="none" stroke="var(--color-neutral-fg-3)" stroke-width="2">
<path d="M164 132 V160 H796 V132 M612 88 H664 M796 132 V184 H104 V212"/>
<path d="M168 254 H184 M320 254 H336 M472 254 H488 M624 254 H640 M776 254 H792"/>
<path d="M556 296 V358 M860 296 V358 M104 296 V358"/>
<path d="M480 452 V500 M796 452 V500 M164 452 V500"/>
<path d="M348 604 H296 M612 604 H664"/>
<path d="M480 358 V328 H556 V296" stroke-dasharray="6 5"/>
</g>
<g font-family="var(--font-family-base)">
<g fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)">
<rect id="publish-process__first" x="32" y="40" width="264" height="92" rx="12"/>
<rect id="publish-process__update" x="348" y="40" width="264" height="92" rx="12"/>
<rect id="publish-process__capture" x="664" y="40" width="264" height="92" rx="12"/>
<rect x="32" y="212" width="136" height="84" rx="10"/><rect x="184" y="212" width="136" height="84" rx="10"/>
<rect x="336" y="212" width="136" height="84" rx="10"/><rect x="488" y="212" width="136" height="84" rx="10"/>
<rect x="640" y="212" width="136" height="84" rx="10"/><rect x="792" y="212" width="136" height="84" rx="10"/>
<rect id="publish-process__write" x="32" y="358" width="264" height="94" rx="12"/>
<rect id="publish-process__fail" x="348" y="358" width="264" height="94" rx="12"/>
<rect id="publish-process__live" x="664" y="358" width="264" height="94" rx="12"/>
<rect id="publish-process__versions" x="32" y="500" width="264" height="172" rx="12"/>
<rect id="publish-process__recover" x="348" y="500" width="264" height="172" rx="12"/>
<rect id="publish-process__globe" x="664" y="500" width="264" height="172" rx="12"/>
</g>
<g fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600">
<text x="48" y="72">First publish</text><text x="364" y="72">Update published</text><text x="680" y="72">Capture saved revision</text>
<text x="48" y="242">1 · Save locally</text><text x="200" y="242">2 · Commit</text><text x="352" y="242">3 · Push</text>
<text x="504" y="242">4 · Build</text><text x="656" y="242">5 · Deploy</text><text x="808" y="242">6 · Live check</text>
<text x="48" y="390">Keep writing</text><text x="364" y="390">Actions failed</text><text x="680" y="390">Verified live</text>
<text x="48" y="534">Draft / Published</text><text x="364" y="534">Recover deliberately</text><text x="680" y="534">Open the live page</text>
</g>
<g fill="var(--color-neutral-fg-2)" font-size="16">
<text x="48" y="104">Confirm audience → Publish</text><text x="364" y="104">Review draft / compare first</text><text x="680" y="104">Later edits stay in draft</text>
<text x="48" y="272">Local receipt</text><text x="200" y="272">Exact revision</text><text x="352" y="272">Acknowledged</text>
<text x="504" y="272">Actions job</text><text x="656" y="272">Same commit</text><text x="808" y="272">Verify revision</text>
<text x="48" y="420">Reopen the corner detail card</text><text x="364" y="420">Cause + steps + run link</text><text x="680" y="420">Success pill; globe appears</text>
<text x="48" y="570">Switch in a separate review</text><text x="48" y="602">Compare pinned revisions</text><text x="48" y="634">Return to exact draft / caret</text>
<text x="364" y="570">Retry failed step or check</text><text x="364" y="602">Revert: confirm → deploy old</text><text x="364" y="634">Never overwrite local draft</text>
<text x="680" y="570">Globe → default browser</text><text x="680" y="602">Tooltip: exact page address</text><text x="680" y="634">Old live stays during update</text>
<text x="32" y="180">One task; named progress and elapsed time. Run link once a matching Actions run exists.</text>
<text x="32" y="710">Closing progress keeps the task running. No ongoing bottom pill; only verified success uses it.</text>
</g>
</g>
</svg>
<figcaption>First publish and explicit updates share one evidence-based pipeline. The local draft continues independently; recovery never erases it, and only the verified-live revision earns the globe.</figcaption>
</figure>

### Design acceptance, not implementation evidence

The review must show: private/public/live/in-progress/failed/draft-ahead clusters; first Publish and Update cards; six current-step cards with truthful progress and matching-run link availability; slow, failed/cause/troubleshooting, success/pill; Draft/Published switching and a real visual diff of synthetic text. Light, dark and 320 px are part of the design. No GitHub writes, real network actions, clipboard, browser launch, task engine, file writes or tests are implemented by the mocks.

### Current P-state review

These are synthetic gallery view documents, not functional publishing. The private backup control is unchanged. Public publishing reuses `SaveState` with an optional upload glyph so the progress ring stays **inspectable**, rather than using a commit button that announces itself disabled. Existing callers retain the default glyphs. The existing detail popover gains an opt-in scrolling variant: the scrollbar reaches the panel edge and the inner content owns its inset, including room for focus rings. Existing popovers retain their current layout.

The success pill stacks above the corner controls, so it never covers the globe, publish or disk at 320 px. Draft-ahead has the existing pending dot plus its accessible name; no extra writing-window label is added. The version review reuses the existing labelled `VersionPane`, with changed text and screen-reader Added/Removed prefixes, and responsive columns that stack at narrow widths.

| P-state | Shows | Light | Dark |
| --- | --- | --- | --- |
| P00 | Recommended, unapproved P1–P3 answers; mock safety | [Open](http://127.0.0.1:5242/?f=mock.publishP.choices&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.choices&scheme=dark) |
| P01 | Private note; existing cloud backup | [Open](http://127.0.0.1:5242/?f=mock.publishP.private&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.private&scheme=dark) |
| P02 | Public-intended; publish → disk, not yet live | [Open](http://127.0.0.1:5242/?f=mock.publishP.public&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.public&scheme=dark) |
| P03 | Live globe → publish → disk; exact-URL tooltip | [Open](http://127.0.0.1:5242/?f=mock.publishP.live&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.live&scheme=dark) |
| P04 | Ongoing publish ring; open progress while pending | [Open](http://127.0.0.1:5242/?f=mock.publishP.pending&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.pending&scheme=dark) |
| P05 | Failed publish control; prior live globe retained | [Open](http://127.0.0.1:5242/?f=mock.publishP.error&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.error&scheme=dark) |
| P06 | Draft ahead; pending dot and explanatory details | [Open](http://127.0.0.1:5242/?f=mock.publishP.ahead&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.ahead&scheme=dark) |
| P07 | Ready for first publish; approved confirmation remains next | [Open](http://127.0.0.1:5242/?f=mock.publishP.ready&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.ready&scheme=dark) |
| P08 | Ready to update; compare before committing | [Open](http://127.0.0.1:5242/?f=mock.publishP.update&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.update&scheme=dark) |
| P09 | Save locally; Actions run not started | [Open](http://127.0.0.1:5242/?f=mock.publishP.save&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.save&scheme=dark) |
| P10 | Commit exact captured revision | [Open](http://127.0.0.1:5242/?f=mock.publishP.commit&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.commit&scheme=dark) |
| P11 | Push; not yet published | [Open](http://127.0.0.1:5242/?f=mock.publishP.push&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.push&scheme=dark) |
| P12 | Actions build; exact run link and elapsed time | [Open](http://127.0.0.1:5242/?f=mock.publishP.build&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.build&scheme=dark) |
| P13 | Deploy same commit | [Open](http://127.0.0.1:5242/?f=mock.publishP.deploy&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.deploy&scheme=dark) |
| P14 | Verify live page, not just Actions success | [Open](http://127.0.0.1:5242/?f=mock.publishP.check&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.check&scheme=dark) |
| P15 | Slow Actions; check existing run, keep writing | [Open](http://127.0.0.1:5242/?f=mock.publishP.slow&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.slow&scheme=dark) |
| P16 | Build failure; cause, troubleshoot, retry and revert | [Open](http://127.0.0.1:5242/?f=mock.publishP.failed&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.failed&scheme=dark) |
| P17 | Success pill; globe available, newer draft retained | [Open](http://127.0.0.1:5242/?f=mock.publishP.success&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.success&scheme=dark) |
| P18 | Local draft review, not published | [Open](http://127.0.0.1:5242/?f=mock.publishP.draft&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.draft&scheme=dark) |
| P19 | Published snapshot, read-only | [Open](http://127.0.0.1:5242/?f=mock.publishP.published&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.published&scheme=dark) |
| P20 | Pinned text diff; switch, refresh draft, review update | [Open](http://127.0.0.1:5242/?f=mock.publishP.compare&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.compare&scheme=dark) |
| P21 | Confirm earlier-live revert without changing draft | [Open](http://127.0.0.1:5242/?f=mock.publishP.revert&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.revert&scheme=dark) |
| P22 | Success details; all six steps completed | [Open](http://127.0.0.1:5242/?f=mock.publishP.complete&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.complete&scheme=dark) |
| P23 | Deployment permission failure; retry same commit | [Open](http://127.0.0.1:5242/?f=mock.publishP.deployFailed&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.deployFailed&scheme=dark) |
| P24 | Verification timeout; retry check, no duplicate deployment | [Open](http://127.0.0.1:5242/?f=mock.publishP.checkFailed&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.checkFailed&scheme=dark) |
| P25 | First-publish failure; no globe, no nonexistent rollback | [Open](http://127.0.0.1:5242/?f=mock.publishP.firstFailed&scheme=light) | [Open](http://127.0.0.1:5242/?f=mock.publishP.firstFailed&scheme=dark) |

**Try it:** open a closed cluster state, hover or press Publish, inspect the card, and choose Keep writing. The ongoing control stays keyboard-operable. Compare versions opens the separate version review; Draft / Published / Compare switch locally. Return to draft opens the synthetic note again; real caret/scroll restoration is specified, not implemented. Publish, Actions, Retry and Revert only explain the intended action; they never start it. Globe and Open site show the existing sample-site preview in this gallery, never the default browser. Each pipeline state has its own URL; no timer simulates remote progress.

**Design evidence (5 November):** `pnpm check` passed, including the chain, component inventory, token boundaries, spacing and `ui:check` (842 documents, 83 components, 727 commands). `pnpm --filter @focus-notes/ui --filter @focus-notes/views run typecheck`, `pnpm --filter @focus-notes/desktop run gallery:build` and `node .\slate\scripts\runtime-host.mjs check --repo . --host documentations` passed. UI schemas, the component inventory and tokens were regenerated with the view/contract changes. The owner-requested headless visual review opened all 26 P-states in light/dark at 1100 and 320 px (104 pages), with no page errors, horizontal document overflow or off-screen popover bounds. Failure, revert and verification cards also scroll at 320 × 568 in both themes; focusing their final action scrolls it into view with its full focus ring inside the content inset. The pending publish trigger is not disabled and opens with Enter. The token-based flow fits in light and dark. No tests, journeys, catalogues, CI waits, real publishing or account actions ran; this is not owner approval.

## What belongs on the site

Turning sharing off removes current shared and published content at the next successful publish, but keeps the repository and its Git history (D-274, accepted by the owner on 3 November).

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

**Historical proposal, superseded in part by the 14:29 owner source above.** Kept to explain the earlier review links, not as the current implementation brief. The new corner cluster/card replaces ongoing and failed bottom pills; only verified success uses the bottom pill. Draft/published review and the six-step pipeline above take precedence. P1–P3 below remain recommended, unapproved choices.

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

**Earlier 14-state review, before the 14:29 direction.** These snapshots remain available for the approved first-publish confirmation and unpublish/site states. Their ongoing bottom pills and absence of the requested status cluster are superseded; use the new P-state review for the current design.

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

**Recorded before the 14:29 direction.** The built inventory below remains useful; its implementation gap is now expanded by the proposed pipeline, cluster, failure recovery and draft/published review above. No publishing design approval or runtime readiness is claimed.

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

**Verdict: specified enough to build once the owner answers P1 to P4.** Before this review it was not: the model conflict and the missing status and unpublish flow blocked any build.

**Slices, smallest visible first (D-349):**

1. **Mocks** in the gallery for the publish states, Unpublish, and the site's empty and missing pages. Small.
2. **Publish and Unpublish on today's workspace** with the deploy status (WP-P.22, MP.32, MP.33). About two days.
3. **The site theme** on the live site (WP-P.12). About a day.
4. **The public home with sections and counts** (WP-P.14). About a day.
5. **Images in published notes** (WP-9.9, IMG-13). About a day.

**Owner questions:**

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
| DD-PUB-05 | Globe → publish → disk; existing card owns ongoing progress, success-only bottom pill | UC-SHARE-13, UC-SHARE-16 | Only the owner's explicitly requested writing-window additions; progress stays inspectable |
| DD-PUB-06 | One captured publish revision; separate Draft / Published / Compare review | UC-SHARE-14 | Typing never silently changes an in-flight publish or erases a local draft |
| DD-PUB-07 | Named step failure, exact Actions link, retry observation/job and confirmed revert | UC-SHARE-15 | Recovery states what failed and preserves local work and the last verified-live page |

After design approval: public/private/shared fixture index and leak checks; 1,000 public articles over a deep tree, ensuring every article reachable and no page exceeds 50 direct entries; 320 px/light/dark/contrast/reduced-motion visual review; keyboard/reading-focus checks; preview/app typography isolation; failed Apply/Cancel/no-network and prospective-public-target checks. These are future evidence, not tests run or approval claimed by this spec.

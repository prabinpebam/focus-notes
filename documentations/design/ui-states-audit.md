# UI states audit

> [!NOTE]
> **TL;DR.** This audit checks the design system and every surface of the app against the `ui-states` skill: every change confirmed where it happened, every failure recoverable, every empty space explained. The `design-system`, `perceived-performance` and `ui-copy` skills apply alongside it. The waits the app was built around are strong: the note save, conflicts, the AI rewrite and Spotlight. What's weak is what happens after a person changes something. The three biggest improvements:
> 1. Stop silent failures. A failed setting or project change today says nothing, or keeps a value that wasn't saved (F1).
> 2. Confirm every change on the control itself: a tick on a field, a spinner in a switch, a Retry when it fails. Add a commit track to the task tracker to drive it (F2).
> 3. Make error notifications stay until they're dealt with, and queue three instead of dropping all but two (F3).
>
> Fifteen findings are ranked below, with the missing tokens and primitives and an order of work: eight design slices for the gallery first, then nine wiring slices.

## Visual review and approval

**Owner direction, 4 November 13:01:** implement this audit in two phases. First show every proposed state in the gallery for visual approval; only then implement the approved slices against their Definition of Done. No tests, journeys, captures, benchmarks, CI waits or app wiring before approval. Phase 1 permits only typecheck, `ui:check` and gallery builds.

**[Open the review hub](http://127.0.0.1:5231/?f=mock.uistates.hub).** Compare Before and After, then Play. Each slice offers light, dark and reduced motion. All data and timing demos are local simulations; none changes notes, settings or accounts. Reply, for example, “approve 2, 3; change 1: …”. Approval is explicit, per slice; the table below is the record.

| Slice | Findings | Review link | Availability | Approval |
| --- | --- | --- | --- | --- |
| D1 · Notifications | F3, F4, F10 | [Open slice 1](http://127.0.0.1:5231/?f=mock.uistates.d1) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D2 · Fields | F1, F2, F12 | [Open slice 2](http://127.0.0.1:5231/?f=mock.uistates.d2) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D3 · Switches | F2 | [Open slice 3](http://127.0.0.1:5231/?f=mock.uistates.d3) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D4 · Choices | F2, F14 | [Open slice 4](http://127.0.0.1:5231/?f=mock.uistates.d4) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D5 · Empty spaces | F6 | [Open slice 5](http://127.0.0.1:5231/?f=mock.uistates.d5) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D6 · Recovery | F4, F5, F11, F15 | [Open slice 6](http://127.0.0.1:5231/?f=mock.uistates.d6) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D7 · Long operations | F7, F8, F13 | [Open slice 7](http://127.0.0.1:5231/?f=mock.uistates.d7) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D8 · Section loading | F9 | [Open slice 8](http://127.0.0.1:5231/?f=mock.uistates.d8) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |

Approval values are **Awaiting review**, **Approved** and **Changes requested**. The gallery index distinguishes an unfinished design from one available to review. The [phase-2 DoD](../plan/definition-of-done.md#ui-states-after-visual-approval) records future wiring, unit and journey evidence only; none is run in phase 1.

**Approved field treatment:** the field border uses the commit colour while pending and returns to rest with the confirmed circle tick, rather than retaining a confirmed border.

**Phase-2 authorization (owner, 4 November 14:06):** “These look good, implement it and make it functional.” Approval covers all eight slices and the compact border-spinner rule. Wiring proceeds with silent failures first, then commit states, on `vq-ui-states`; implementation and exact-head evidence remain outstanding until recorded in the DoD.

### Functional review increment, 4 November

| Work | Implementation | Verified scope |
| --- | --- | --- |
| Integrated project prerequisite | `36e93da4`, merge from `vq-open-cards` | Combined monorepo typecheck passes; project settings are present |
| Modal notification recovery | `5251ef0d` | Existing `layer.toast` plus React Aria's top-layer marker; F6 and pointer Retry work while Settings remains open |
| Notification host | `414b9341` | Three visible, retained error-first queue, repeated subjects coalesced with latest Retry arguments; hard-dismiss errors/actions; visible-only clocks pause on hover/focus/window inactivity |
| Commit infrastructure and first controls | `bf1c5afd` | `vm.commits`; immediate pending and separate 200 ms pending/confirmed minimums; field-local lock, failed drafts and Retry/Revert; project name blur/Enter and scale; segmented keyboard changes wait 500 ms or blur; project writes compose independent fields in order |
| Project colour and preset logo | `78d0a335`, pushed | Attempted mark's own border; focusable pending group; retained failed choice without changing saved identity; latest-choice Retry and write-free Revert |
| Project font/theme triggers | `c766d793`, pushed | Persistent trigger feedback after the popover closes, retained attempted name, cleared failed preview, Retry/Revert and Use app default; keyboard theme browsing does not save |
| Watermark refusal proof | `fd5252ee`, pushed | Failed On does not add a writing-surface mark; Retry persists before the mark appears; failed Off/Revert leaves the stored mark intact without writing |
| App appearance/paragraph choices | `9132ff95`, pushed | Local failure and Retry, independent choice groups, persistence after reopening; tabs and explicit-save colour drafts stay outside the commit lane |
| Polite commit outcomes | `b7f54383`, pushed | One named confirmation after successful storage; no new success on pending, failure, Revert or expiry; retained draft values are never announced |
| Reading sliders | `7d8811e3`, pushed | Immediate transient note preview; one save on pointer release, blur or 500 ms keyboard pause; local pending/confirmed marks, retained formatted failures and Retry/Revert |
| SVG logo upload | `6a217238`, pushed | Own-border upload feedback; rejected storage keeps the sanitized source and the old writing-surface mark; Retry does not reopen the picker; cancel never claims Saved; Revert writes nothing |
| Known-empty wrappers and static gates | `7d8f98fd`, pushed | Open/recent, Files, AI, Sharing and site-preview lists use approved wrappers; AI waits for a successful load; filtered Open clears its query; first actions route to existing creation or Files flows. Sharing menus remain focusable/inert with own-border progress. All inherited static gate findings are cleared |
| Independent section loading | `47101d57`, pushed | Agents/history/share use approved row shapes after 300 ms, held for at least 500 ms on success or failure; refresh keeps existing content; local Retry retains sharing choices. Late Agents/history replies cannot replace newer reads |
| App theme and Reading font | `e643bd48`, pushed | Theme tiles and the closed font trigger retain failed choices and offer scoped Retry/Revert. Keyboard theme browsing remains preview-only. Choosing an opposite-scheme theme stores slot and scheme in one write; failure keeps the acknowledged note appearance |
| Compact focus and docking | `b6375b3a`, pushed | Existing Focus mode, Files pin and contents pin use own-border feedback; roomy menu rows use inline marks. Failed writes leave the acknowledged value unchanged. Retry remembers the exact intended value rather than toggling again |
| Reading size | `399bd9c9`, pushed | One inline mark beside the retained size output; Smaller/Larger lock only their group while pending. Failed storage leaves the note unchanged; scoped Retry and write-free Revert preserve other reading choices. Menu and shortcut actions use the same lane |
| Notification acceptance increment | `0db24cb0`, pushed | Four real writing outcomes queue/reveal without stealing focus. Failed Retry stays available, coalesces on the original subject and locks only its action. F6 targets a captured pill ID. Actually wrapped notices get eight visible seconds; success/warning/progress tones reach the host |
| Overlapping notification pauses | `b68775f8`, pushed | Hover and focus are independent causes. Ending either cannot resume the lifetime while the other remains; moving between buttons does not resume it. Two real-window clock journeys prove the retained remainder in both orders |
| Irreversible withdrawal | `46c0cb31`, pushed | The access format refuses reactivation; sharing again generates a new identity/link. Both existing confirmation surfaces now explain this before acting. Cancel keeps the grant active; confirmed withdrawal preserves notes and rejects the old link after synthetic publication |
| Independent AI details and checked key | `42e06fc0`, pushed | Details commit on blur/Enter with retained failures and scoped Retry/Revert; provider-only and discovered connections remain usable without a second form Save. The separate key Save checks synthetic text before persistence, retains same-destination failures locally, preserves the old key on refusal and rejects changed-destination results |
| Scoped Open recovery | `cf5859a2`, pushed | The local error row keeps its Details and only Retry becomes inert. Failed list/open/pin/reveal actions keep their exact recovery target; query and old content remain mounted. A completed pin followed by a failed list retries only the list, never the toggle |
| New project / Local import recovery | `651b1340`, pushed | Opening a completed project retries only Open. Uncertain partial setup offers a location change, never blind creation Retry. Local imports retain one request receipt and publish only a complete no-clobber copy; a lost reply cannot duplicate a completed import |
| Same-project Open acceptance and waits | `8f1fb690`, pushed | A rejected note read keeps the acknowledged note and Open mounted; only an accepted Retry closes it. Named list/open/pin/reveal tasks supply measures and elapsed labels. Lists wait 300 ms before shapes and hold them 500 ms; obsolete actions cannot close or replace a reopened Open |
| History recovery and D8 journey | `ef03a581`, pushed | Retry targets the failed list, older page, version or restore. Failed reads retain the previous list/preview; a failed write retains the sheet and original Undo receipt. Restore/Undo announce success only after disk acknowledgement. Real delayed/failed history reads and saves passed independently of Agents |
| Broken-image recovery | `cd0cede9`, pushed | The approved ImageFrame now shows actual read/decode failures, alt text and a scoped Retry. Retry retains that frame and focus while pending; distinct failures coalesce per note and repeated refusals do not spam. Same-path document generations and read tokens reject obsolete responses |
| Share-item independent section | `2ce9b22d`, pushed | Actual delayed/failed sharing-list reads now have their independent desktop journey. Retry keeps its error row and editable choices mounted, locks only its own action and never writes a grant. A failed refresh retains acknowledged sharing history |
| Files known-empty and first action | `6218b99d`, pushed | Collapsed content is not empty; a query is checked independently of collapsed roots. Initial listing is a named section read with explicit failure and scoped Retry, not empty success. Watcher changes and acknowledged saves survive its snapshot. The empty wrapper's New note replaces it within the same Files body |
| Recently deleted honest states and good news | `71e94423`, pushed | Failed history never becomes an empty success. Read-only Retry retains its error and acknowledged rows; closed/reopened reads reject stale results. Known-empty history and All colours pass reuse the approved success StatusRow |
| Independent initial Files scan acceptance | `b830a17c`, pushed | A held/refused first-ever scan shows bounded/reduced-motion shapes, never false empty; scoped read-only Retry keeps the editor, filter and connected Files body, then reveals real notes and records both named measures |
| Honest Sharing settings list | `e1ce6940`, pushed | Unknown/refused reads cannot claim Nothing shared yet. A named section read retains acknowledged rows and local Retry; filtered emptiness says No matches and clears only filters. Known-empty Open Files remains a read-only route |
| New project streamed setup | `77abe28a`, pushed | Real backend step receipts, completed/total progress and elapsed after 3 seconds; Cancel stops at the next safe boundary, keeps partial files and never replays uncertain creation. A completed receipt retries only Open |
| Local Publish, Apply and site-preview work | `b70e3334`, pushed | Actual per-note preparation receipts and completed/total progress; elapsed after 3 seconds, safe-boundary Cancel and scoped read Retry keep the previous preview. Local draft/settings writes show their actual collection/save steps, retain failed choices and cannot be cancelled mid-write. No remote deployment is claimed |

**Worker 6 increments:** [theme/font evidence](../plan/definition-of-done.md#phase-2-theme-and-reading-font-e643bd48) and [compact-control evidence](../plan/definition-of-done.md#phase-2-compact-focus-and-docking-b6375b3a) include scoped typechecks, units, static gates and invisible real-write-refusal journeys. MenuButton and IconButton reuse the approved own-border treatment; no new writing-window element was added. The toolbar stays open after these compact setting actions so their feedback remains visible; normal outside dismissal still works. Files docking now awaits storage instead of silently discarding its write promise.

**Earlier inspected candidate:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\e1ce6940\Open review build.cmd`. Built from the exact pushed head and inspected invisibly through normal project choices, SVG upload/refusal/Retry, app and Reading choices, compact Focus/Files/contents controls, retained notification recovery/focus, AI connection groups, actual Agents settings, filtered Open/Clear search, collapsed/filtered Files, Recently deleted good news and Sharing first-action/filter treatment; inspection closed with own-PID cleanup. Its launcher retains the local-only GitHub stand-in. The synthetic inspection workspace has a valid format and a local-only Git history so Recently deleted is genuinely available. Controlled key checks, withdrawal, Open, New/Local, initial Files, history, sharing and image failures have their separate scoped journeys in the evidence below, not live-account claims. Earlier candidates and the owner's visible `6218b99d` and `cd0cede9` instances remain untouched. The [5231 gallery](http://127.0.0.1:5231/?f=mock.uistates.hub) runs from fresh `vq-ui-states-10`; its process, socket and HTTP 200 were verified after migrating only folder 9's gallery.

**Owner-requested visible review, 4 November 19:53:** [launch evidence](../plan/definition-of-done.md#phase-2-owner-review-launch-cd0cede9) confirms the still-open `cd0cede9` already contains latest `vq-open-cards` (`34fa5dea`), including Open file and Open from GitHub. Its launcher now supplies a loopback-only GitHub stand-in and a synthetic local bare repository. A new invisible inspection reached Project/AI settings, the real Open surface, the local repository list and Open file with a synthetic picker selection; that inspection closed with own-PID cleanup. A separate fresh owner-review profile was then opened visibly at the owner's request and deliberately left open. It uses only sample notes, not the owner's notes or Preview. No app consolidation merge or additional tests were needed for this launch; phase 2 remains in progress.

**Priority visible refresh, 4 November 20:23 direction:** [latest launch evidence](../plan/definition-of-done.md#phase-2-owner-review-refresh-6218b99d) records a fresh fetch and an empty exact `git log vq-ui-states..origin/vq-open-cards`. The complete `6218b99d` candidate was inspected invisibly again and closed, then a separate fresh owner-review profile was launched visibly and left open. It includes the newer sharing and Files slices as well as Open cards and image recovery. The earlier owner instance was preserved, not silently replaced.

**Push blocker resolved:** GitHub rejected two ordinary branch updates with `Internal Server Error`. The subsequent `git push --no-thin origin vq-ui-states` succeeded at `b6375b3a`, including both worker-6 commits, without rebasing or force-pushing.

**Latest follow-ups:** [Reading-size evidence](../plan/definition-of-done.md#phase-2-reading-size-399bd9c9) records 33 focused unit cases and a real-write-refusal journey. [Notification evidence](../plan/definition-of-done.md#phase-2-notification-acceptance-increment-0db24cb0) records 25 focused unit cases and three invisible journeys, including the exact eight-second lifetime of an actually wrapped notice. Both follow-ups are in the candidate above.

**Still partial:** remaining recovery, complete empty-state acceptance and streamed operations. At `2ce9b22d`, `pnpm check` and `ui:check` pass: the inherited static findings are repaired without changing approved visual values. [AI group evidence](../plan/definition-of-done.md#phase-2-independent-ai-details-and-checked-key-42e06fc0) adds real provider/storage refusal and first-action replacement, not complete D5 acceptance. [Open recovery](../plan/definition-of-done.md#phase-2-scoped-open-recovery-cf5859a2) covers retained errors, query, safe Details and non-repeated completed pins; [same-project acceptance and waits](../plan/definition-of-done.md#phase-2-same-project-open-acceptance-and-waits-8f1fb690) add actual read rejection, exact list timing and tracked action measures. [New/Local recovery](../plan/definition-of-done.md#phase-2-partial-safe-newlocal-recovery-651b1340) proves in-session receipt safety; crash-persistent receipts, resuming uncertain project setup and remaining tracker coverage remain unaccepted. [History recovery](../plan/definition-of-done.md#phase-2-history-recovery-and-independent-section-ef03a581), [broken-image recovery](../plan/definition-of-done.md#phase-2-broken-image-recovery-cd0cede9) and [share-item loading](../plan/definition-of-done.md#phase-2-share-item-independent-section-2ce9b22d) now have their independent delayed/failed desktop journeys. This closes the missing share-item journey, not blanket phase-2 acceptance. Older broad menu-inventory assertions and empty-start toolbar journeys retain unrelated baseline failures, recorded in the compact-control evidence rather than expanded into this slice. Empty-state Add link/Add section/Choose note lead to Files, where publishing already happens; no new configuration workflow is claimed. No complete phase-2 acceptance or app merge is claimed. See [section-loading evidence](../plan/definition-of-done.md#phase-2-independent-section-loading-47101d57), [overlapping-pause evidence](../plan/definition-of-done.md#phase-2-overlapping-notification-pauses-b68775f8) and [withdrawal evidence](../plan/definition-of-done.md#phase-2-irreversible-withdrawal-46c0cb31).

**Files D5 increment:** [known-empty evidence](../plan/definition-of-done.md#phase-2-files-known-empty-and-first-action-6218b99d) adds collapsed/filter/failed-read truthfulness, queued watcher/save preservation and a normal first-action journey. It is not complete D5 acceptance: recently-deleted read failures/good-news treatment, other first actions and all-done variants remain open. The owner's `cd0cede9` instance was left untouched while `6218b99d` was inspected and closed.

**Recently deleted D5 increment:** [honest-history evidence](../plan/definition-of-done.md#phase-2-recently-deleted-honest-states-71e94423) closes the read-failure/good-news gap above. Real delayed/refused history, retained Retry, actual restoration and then acknowledged empty history passed in the same Files wrapper; existing note bytes stayed unchanged. A failed Git log now propagates failure instead of silently omitting a repository. The colour editor's existing all-pass branch uses the same success row. [Independent initial Files evidence](../plan/definition-of-done.md#phase-2-independent-initial-files-scan-b830a17c) now closes the separate first-scan delay/failure journey gap without renderer reloads or production test hooks. Other D5 first actions, D7 and hover/static acceptance remain outstanding.

**Sharing D5 increment:** [honest-list evidence](../plan/definition-of-done.md#phase-2-honest-sharing-settings-list-e1ce6940) closes unknown/refused and filtered false-empty behavior in Settings, including read-only Retry, retained acknowledged rows, newer-change protection and exact section timing. The normal known-empty Open Files route is proven, not a claim that every site-preview first action creates replacement content. The exact candidate above includes all worker-10 slices; the current visible owner builds were not replaced.

**Owner review feedback, 4 November 20:15; fixed in visible review `f2127c67`:** project theme/scheme now reaches Settings and overlays; the `7a0f5e54` docking change narrowed the scroller but left its blur bands spanning both panels, now restored to the note's bounds (headless `before.png` / `after.png` in `focus-notes-work\review\ui-states-owner-feedback`). Desktop typecheck, `ui:check`, 10 project-setting units and the focused invisible feedback journey passed; both distinct local sample repositories and their actual Settings/Open/GitHub-list surfaces were inspected invisibly and closed before replacing only the authorized old review windows. Open `preview\candidates\f2127c67\Open review build.cmd`; in Field notes (blue rocket), press **Ctrl+Alt+O → Garden notes** (green leaf) for its separate window. The fixed review is left open; phase 2 remains incomplete.

**Owner's compact-feedback rule (4 November, 13:58):** when there is room, keep the inline spinner, tick or error icon; when there is no room, the element's own border becomes the spinner. Compact segments, buttons, pills, tiles and switch tracks use a travelling arc following their shape, a success-coloured border for the confirmation minimum (with a brief draw-in), and a danger-coloured border on error; Retry stays in the nearest helper row. Reduced motion holds a dashed pending border, never a sweep. The hub shows both cases side by side with Play. This supersedes the earlier thumb-spinner proposal, not the requirement for visual approval of each slice.

### What phase 1 shows, and what it does not

| Slice | Visual proposal now available | Deliberately deferred |
| --- | --- | --- |
| D1 | Success, warning, progress and sticky-error pills; 3 visible with a queued count; coalesced image failure; bottom-pill Play at 6 s and 8 s, Retry and Dismiss; conditional withdrawal Undo | Actual priority queue, coalescing, visible-only clocks and pause on hover/focus/window blur. Undo requires proof that the same link can be restored. |
| D2 | Name and colour idle/pending/confirmed/error/empty-value states, retained input and Retry/Revert; separate AI connection-details and access-key groups | Real storage, provider checking and rejected-setter reporting. The key field contains no real key. |
| D3 | Idle/pending/confirmed/error borders on the same switch track; Play holds the simulated stored value after confirmation | Commit tracker, real persistence, rollback and focus/announcement evidence. Off is a value, not an empty state. |
| D4 | Existing segments, theme tiles and font tiles with border feedback on the selected option, pending group lock and scoped failure; theme hover is restricted to hover-capable pointers, with pressed feedback | The 500 ms key pause, blur/release commits, remaining hover sites and the enforcement rule; no keyboard/device test claim. |
| D5 | The same wrapper across Open's states; empty Files, Open, AI connections, sharing and all 4 site-preview lists; component-sized search empty and good-news examples | Real first actions and populated lists. Gallery actions only replace fake content. |
| D6 | Retry and optional Details in Open, New project, Local import, history and the save menu; plain-language safety clauses; broken-image alt and local Retry | Real failed-command targets, partial-result safety and image reading. |
| D7 | New project and Publish step lists, known-total progress, elapsed-time example and Cancel; success, failed step, cancelled and crashed-panel recovery; themed first-view appearance | Actual streamed steps, elapsed clocks, cancellation and crash recovery. The themed mock does not prove native first-paint timing. |
| D8 | Idle content, in-shape section skeletons, content, error and empty; Play uses the 300 ms delay and 500 ms minimum; shimmer stops after 3 passes and is static with reduced motion | Real independent section loads, refresh retention, timeout and announcement behavior. |

The new presentation pieces are `EmptyState` (compound) and `NotificationRegion` (layout). Existing components gain optional visual-state props; no normal app view opts into them yet. All UI is assembled in gallery view documents, and the writing window is unchanged. Token-based gallery timing is simulation, not production behavior. The developer gallery uses a nonce for Vite's development style injection; the app's and built gallery's content-security policies are unchanged.

**Phase-1 evidence only:** the UI, views, runtime and desktop typechecks, `pnpm ui:check`, and the gallery-only Vite build passed. The hub and slices were opened for inspection without captures. No unit tests, journeys, benchmarks or CI waits were run; phase-2 evidence remains outstanding.

The hub and all eight slices scroll vertically inside the existing token-based `Surface` wrapper, without changing the writing window. After the owner's scrolling feedback (4 November, 13:56), headless inspection at 1280 × 720 and 360 × 640 confirmed that every page's scroll height exceeds its viewport height and its final section can be reached.

## Scope, sources and method

**Assessment date:** 4 November 2026. This is the owner's requested audit (4 November, 12:19), not an accepted decision: every fix below is a proposal until the owner picks it.

<div class="slate-compare">
  <div class="slate-compare__col">
    <p class="slate-compare__head">Code audited</p>
    <ul>
      <li><strong>Main</strong> at <code>25b87f07</code>: what the owner's Preview runs.</li>
      <li><strong>Branch</strong> <code>vq-open-cards</code> at <code>f636e524</code>: the newest work. It contains <code>vq-review</code> <code>53f8d879</code> (Files, the location pill, images, sharing, Invite, Publish, projects, New project, Local notes) plus the Open cards.</li>
      <li>Each finding says which code it comes from: <span class="slate-badge">Main</span> <span class="slate-badge slate-badge--info">Branch</span> or both.</li>
    </ul>
  </div>
  <div class="slate-compare__col">
    <p class="slate-compare__head">Rules applied</p>
    <ul>
      <li><code>ui-states</code>: scopes, the commit, load and outcome tracks, component states, the notification pill, errors, empty states, focus and announcements.</li>
      <li><code>design-system</code> and the <code>design-system-auditor</code> checklist: tokens only, the six layers, states in every context.</li>
      <li><code>perceived-performance</code> and the project's <a href="../architecture/perceived-performance.md">wait inventory</a>; <code>ui-copy</code> and the Words section of <a href="foundations.md">foundations</a>.</li>
    </ul>
  </div>
</div>

### Areas

| Layer | What was read |
| --- | --- |
| Design system | `packages/tokens` (semantic, component, modes, themes), `packages/ui` (primitives, layouts, compounds, host), `packages/ui-runtime`, against [the design system](system/overview.html) and the [visual vs verbose score](visual-score.html) |
| App, by scope | The writing window, Files, Open, Settings (every section), Share, the first-share step, Invite, Publish and the site preview, New project, Local notes, the AI rewrite, Spotlight, conflicts, sync and Git, images, first run and the Store build |
| Per operation | What it shows while it waits, when it's done and when it fails; how a person recovers; what fills the space when there's nothing to show |

### Method and limits

- **Read, not run.** Evidence is the code, the view documents, the message catalogue and the gallery mocks. No tests, journeys or app instances were run (the owner's rule for unapproved designs, and this is an audit).
- **Scope levels** follow `ui-states`: field, component, section, view, app, and background.
- **Impact** ranks findings by what the owner feels while writing: losing or doubting a note first, then not knowing whether a change took, then a dead end after a failure, then empty or jumpy layouts, then polish.
- **Effort** is S (under an hour, one component or view), M (a few hours, a primitive plus its uses) or L (a day or more, a shared mechanism across surfaces).
- This page replaces nothing: the earlier [design-system audit](system/audit.md) of 19 October covers architecture and enforcement; this one covers states.

## Scorecard

<div class="slate-metrics">
  <div class="slate-metric"><span class="slate-metric__value">19</span><span class="slate-metric__label">areas scored</span></div>
  <div class="slate-metric"><span class="slate-metric__value">4</span><span class="slate-metric__label">strong</span></div>
  <div class="slate-metric"><span class="slate-metric__value">12</span><span class="slate-metric__label">partial</span></div>
  <div class="slate-metric"><span class="slate-metric__value">3</span><span class="slate-metric__label">missing the core rule</span></div>
</div>

The waits the app was designed around are handled well: the note save, conflicts, the AI rewrite and Spotlight. What's weak is everything **after** a person changes a value: settings and project choices apply with no confirmation, and when they fail nothing says so. Errors that do surface mostly go to a toast that disappears on its own.

| Area | Code | Rating | What's there | The main gap |
| --- | --- | --- | --- | --- |
| Tokens and timing | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Light, dark, contrast light and dark, more contrast, forced colours and reduced motion as modes; `wait.signDelay` 300 ms, `wait.signMinimum` 500 ms, `wait.doneDuration` 1.5 s, `motion.shimmer` | No confirm minimum (200 ms), commit pause (500 ms), long-notice time (8 s), commit colour, or empty-wrapper minimum sizes |
| Component state sets | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Button and IconButton busy with `aria-busy`, `aria-disabled` and a delayed spinner (D-199); ItemCard and FileTree busy borders | Switch, SegmentedControl, ThemeGallery, TextField, Slider, ColorField and PickerButton have no pending, confirmed or failed state; `useBusy` has no failed phase |
| The note save | Main | <span class="slate-badge slate-badge--success">Strong</span> | SaveState with saved locally, pending, syncing, synced, offline and error; the text is kept; Retry on failure; a problem mark on the trigger | The failure toast still disappears after 10 s |
| App settings (appearance, fonts, scale, focus, outline, Files options) | Main | <span class="slate-badge slate-badge--danger">Missing</span> | The value changes on screen at once | No confirmation; a failed save is silent and the screen keeps a value that wasn't kept |
| Project settings (name, colour, logo, watermark, font, theme) | Branch | <span class="slate-badge slate-badge--danger">Missing</span> | Saves on change; a bad logo says why under the field | No confirmation; a failed save silently snaps the value back |
| Sharing: share item, first share, Invite, Publish, site preview | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Invite runs through the task tracker; the share list and history have empty text | Withdraw asks first instead of offering Undo; the site preview's four lists have no empty state; Publish and Apply have no steps or progress |
| Open | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Placeholders on the first load, the old list kept while it reloads, "Opening project…", a danger StatusRow | No Retry ("Close Open and try again"); one generic failure for open, pin and choose; empty text with no action |
| New project and Local notes | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Pending and error states; import says what it copied | No Retry, no steps for repository creation, no Cancel |
| Files | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Inline rename errors on the field; move and delete ask; recently deleted can restore | Failures are toasts; move and rename have no confirmed beat and no Undo; "Your notes will appear here." has no action |
| Spotlight | Main | <span class="slate-badge slate-badge--success">Strong</span> | Results at once; "Nothing matches “…”" names the query | Could offer "New note named …" from the empty result |
| AI rewrite | Main | <span class="slate-badge slate-badge--success">Strong</span> | Streams, Stop, Cancel restores the original | The no-provider and failed-provider paths don't say the original is kept |
| Images | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Edit has saving and error states | A read failure is a toast with no Retry; the frame shows no broken-image state |
| Sync and Git | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Every sync problem has words and an action (sign in, resolve, retry) | Clone, first push and pull show no steps or progress; errors leave with the toast |
| Conflicts | Main | <span class="slate-badge slate-badge--success">Strong</span> | The note is held, nothing is overwritten, the resolver opens with both versions | None at this level |
| First run and startup | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Setup steps with error and fail actions, pending part states | The first-run white frame (in the wait inventory); a view that crashes shows its fallback with no Reload or Report |
| Notifications | Main | <span class="slate-badge slate-badge--danger">Missing</span> | One toast host, an action, Close, a pause on hover and focus, F6 to reach it | At most 2 shown, older ones dropped; errors auto-dismiss; info and error tones only; no queue, coalescing or landmark |
| Empty states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | 44 lists declare an empty branch | Every one is a muted sentence in no wrapper, with no action and no minimum size |
| Loading (shimmer) | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | A Skeleton primitive (line, tile, avatar) with finite passes; used in the canvas and Open | Settings sections, the share item and history load with words ("Loading…", "Preparing…") instead of shimmer |
| Accessibility of states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | `aria-busy`, `aria-disabled` instead of `disabled`, a polite live region, `role="alert"` for error toasts | No Notifications landmark; 9 bare `:hover` rules outside `(hover: hover)`; confirmations aren't announced because none exist |

## Findings, ranked by impact

Ranked by what the owner feels while writing (see [Method and limits](#method-and-limits)). Paths are under `packages/` unless they start with `apps/`; line numbers are at the commit named in the Code column.

| # | Finding | Scope | Code | Effort |
| --- | --- | --- | --- | --- |
| [1](#f1-failures-from-controls-are-silent) | Failures from controls are silent | App | Main, Branch | M |
| [2](#f2-a-changed-value-is-never-confirmed) | A changed value is never confirmed | Field, component | Main, Branch | L |
| [3](#f3-error-notifications-disappear-and-are-dropped) | Error notifications disappear and are dropped | App | Main | M |
| [4](#f4-a-broken-image-cant-be-retried) | A broken image can't be retried | Component | Branch | S |
| [5](#f5-errors-in-open-new-project-and-local-notes-have-no-retry) | Errors in Open, New project and Local notes have no Retry | Section | Branch | S |
| [6](#f6-empty-states-are-passive-sentences) | Empty states are passive sentences | Section, view | Main, Branch | M |
| [7](#f7-long-operations-have-no-steps-progress-or-cancel) | Long operations have no steps, progress or Cancel | View | Main, Branch | M |
| [8](#f8-a-crashed-panel-is-a-dead-end) | A crashed panel is a dead end | View | Main | S |
| [9](#f9-sections-load-with-words-not-shimmer) | Sections load with words, not shimmer | Section | Main, Branch | S |
| [10](#f10-withdraw-asks-first-instead-of-offering-undo) | Withdraw asks first instead of offering Undo | Component | Branch | S |
| [11](#f11-history-and-sync-failures-have-no-retry-in-place) | History and sync failures have no Retry in place | Section | Main | S |
| [12](#f12-two-save-models-in-one-settings-section) | Two save models in one Settings section | Section | Main | S |
| [13](#f13-the-first-run-white-frame) | The first-run white frame | App | Main | S |
| [14](#f14-hover-sticks-on-touch-in-nine-components) | Hover sticks on touch in nine components | Component | Main, Branch | S |
| [15](#f15-failure-copy-doesnt-always-say-whats-safe) | Failure copy doesn't always say what's safe | Field, section | Main, Branch | S |

### F1. Failures from controls are silent

- **Today.** A view's bound control runs its setter as `void deps.app.commands.run(setter, …)` and its actions as `void r.runActions(…)` (`ui-runtime/src/render.ts:173`, `:183`). Nothing catches the rejection, the renderer has no `unhandledrejection` reporter, and the view boundary only logs (`ui-runtime/src/mount.ts:39`). So:
  - App settings change the store first and then `await persistAppState` (`core/src/app.ts:719-737`, `:757-759`, `:789-791`): if the write fails, the screen keeps a value that was never kept, and it's gone at the next launch.
  - Project settings write first and change the view after (`core/src/project-app.ts:46-49`, Branch): if the write fails, the field snaps back with no word.
  - Only *Where appearance is kept* catches its failure (`core/src/app.ts:1283-1286`).
- **Rule broken.** `ui-states` errors: never silent, keep the person's input, say what happened where it happened, offer a recovery. The commit track's *failed* state.
- **Fix.** One mechanism in the runtime, not one per setting: `render.ts` catches a setter's or action's rejection and (a) puts the control into its failed state when its contract has one (F2), otherwise (b) raises one error notification with **Retry**, which reruns the same command with the same arguments. Add a renderer `unhandledrejection` reporter that raises the same notification and logs the cause. Store updates that run before a write roll back on failure.
- **Files.** `ui-runtime/src/render.ts`, `core/src/app.ts`, `core/src/project-app.ts`, `apps/desktop/src/renderer/`.

### F2. A changed value is never confirmed

- **Today.** Everything in Settings saves on change, and nothing says it took:
  - the AI fields, Scale, Settings sync and the other switches (`views/views/settings.view.json`, Main);
  - project name, colour, logo, watermark, font and theme (Branch).
  - The task tracker runs only the load track: the first 300 ms is an `ack` phase, and a task that ends inside it "leaves no trace" (`core/src/tasks.ts`, about line 101). The shared busy policy has only `on` and `done` (`ui/src/behaviors/busy.ts`), and Button's spinner appears only after `wait.signDelay` (`ui/src/primitives/Button/Button.css.ts:82-88`). So an instant commit shows nothing, and a failed one leaves no mark on the control.
  - Switch, SegmentedControl, ThemeGallery, TextField, ColorField, Slider, PickerButton and FontChoice declare no pending, confirmed or failed state in their contracts.
- **Rule broken.** `ui-states` commit track: pending at once, held at least 200 ms, then confirmed for at least 200 ms where the change happened. A field shows a success border and a tick in its trailing slot; a switch shows a spinner in its thumb, then settles; a failed commit keeps the value and offers Retry on the control.
- **Fix.**
  - Add a commit track to the tracker: `tracker.commit(key, fn)` with pending at once, a 200 ms minimum, confirmed for `wait.doneDuration`, and failed (the value kept, Retry). A per-control `commitState` read (`vm.commits.<key>`) drives the view.
  - Give the primitives the states: TextField and ColorField a trailing Spinner, then a tick, with a success border; Switch a Spinner in the thumb; SegmentedControl and ThemeGallery a tick on the chosen option; all with `failed` plus a Retry. Reuse `Spinner`, `Icon` (`checkmark`) and `color.success`.
  - Announce "Saved" politely through the existing LiveRegion.
- **Files.** `core/src/tasks.ts`, `ui/src/behaviors/busy.ts`, the primitives above and their contracts, `views/views/settings.view.json`.

### F3. Error notifications disappear and are dropped

- **Today.** The toast host (`core/src/app.ts:357-372`) shows at most two and dismisses older ones early, so the third toast removes the first. Every toast is armed with a timer: 6 s, or 10 s with an action. That includes errors, such as *Couldn't save your latest changes. Your text is still here.* with Retry. Toast has only the info and error tones (`ui/src/primitives/Toast/Toast.tsx`). The toast layer has no Notifications landmark (`views/views/canvas.view.json`, about line 9277). The good parts:
  - one host and one action per toast;
  - Close, a pause on hover and focus, and F6 to reach it;
  - `role="alert"` for errors.
- **Rule broken.** The notification pill: an error that needs a choice is hard-dismissed; at most three show at once, and the rest queue with errors first; notices about the same subject coalesce; timers pause while the window is in the background; the stack is a labelled region.
- **Fix.**
  - Errors are sticky until Close or their action.
  - The host keeps a queue with three visible, errors first, and coalesces by a `subject` key ("3 images couldn't load").
  - Pause the timers on window blur.
  - Wrap the stack in a region named "Notifications".
  - Add the success, warning and progress tones to Toast.
  - Add the long-notice token (8 s) for notices that have an action.
- **Files.** `core/src/app.ts`, `ui/src/primitives/Toast/`, `views/views/canvas.view.json`, `tokens/src/semantic/structure.json`.

### F4. A broken image can't be retried

- **Today.** When reading an image fails, its source is stored as empty and a toast is shown for each image (`core/src/images-app.ts:40-52`, Branch). The guard at the top of `image.read` then sees an entry for that source and never reads it again until the note changes. A note with several missing images raises several toasts, and F3 drops all but two.
- **Rule broken.** A component-scope error is shown on the component and recovers there. It isn't a stream of app-scope toasts.
- **Fix.**
  - ImageFrame gets a broken state: an icon, the image's alt text, and **Retry**, which clears the entry and reads the image again.
  - One coalesced notification for the note.
  - Add a row for image reads to the wait inventory.
- **Files.** `core/src/images-app.ts`, `ui/src/primitives/ImageFrame/`, `documentations/architecture/perceived-performance.md`.

### F5. Errors in Open, New project and Local notes have no Retry

- **Today.** Open shows a danger StatusRow (`views/views/projects.view.json:69`, Branch).
  - A failed list says *Your projects couldn't be listed. Close Open and try again.* (`core/src/project-open-app.ts:19`).
  - Opening, pinning and choosing a project all fail with the same *The project couldn't be opened…*, pinning included.
  - StatusRow has no action (`ui/src/primitives/StatusRow/contract.ts`).
  - New project and Local import show their error the same way, with no way to try again.
- **Rule broken.** Every error offers a recovery where it's shown, and names its cause.
- **Fix.**
  - Give StatusRow an optional action: one tertiary Button, reused.
  - Retry reruns the failed command: `projects.open`, `projects.launch` with the same id, `local.copyTo` or the New project step.
  - Give pinning its own message, and say what's safe: *Your notes weren't changed.*
- **Files.** `ui/src/primitives/StatusRow/`, `core/src/project-open-app.ts`, `core/src/project-new-app.ts`, `views/views/projects.view.json`, `projectNew.view.json`, `localImport.view.json`, `views/messages/en.json`.

### F6. Empty states are passive sentences

- **Today.** 44 lists in the views declare an empty branch, and every one is a muted Text with no wrapper, no minimum size and no action. Examples:
  - Files: *Your notes will appear here.*
  - Open: *No projects yet. Choose Open project… or New project… above.* It points at a button instead of being one.
  - AI connections, the share list and recently deleted.
  - The site preview's four lists have no empty branch at all (`views/views/sitePreview.view.json`, Branch).
  - Some "empty" lists are good news, such as *No conflicts* and *All colours pass*, but they're styled like a missing state.
- **Rule broken.** `ui-states` empty states: in the content's own wrapper, at the content's minimum size, saying why it's empty and what to do, with the action right there. VVS ≥ 80 for empty states.
- **Fix.**
  - An `EmptyState` compound: an icon, one line of why, an optional detail and one primary Button, inside a wrapper with min-size tokens.
  - Adopt it in Files (*New note*), Open (*Open project…*, *New project…*), AI connections (*Add a connection*), the share list and the site preview.
  - Good-news lists use a success StatusRow instead.
- **Files.** `ui/src/compounds/` (new), `tokens/src/component/` (new), the views named.

### F7. Long operations have no steps, progress or Cancel

- **Today.** These show one pending line, or a busy button:
  - New project's repository creation (`core/src/project-new-app.ts:9-75`, Branch);
  - Publish and Apply in the site preview (Branch);
  - the first clone, first push and pull (Main).
  None names its steps, shows progress, shows the elapsed time after `wait.elapsedDelay`, or offers Cancel. First-run setup already does all of this with its parts list (`vm.firstRun.parts`).
- **Rule broken.** The long track and steps and progress: name the steps, show where it is, offer Cancel when it's safe, never a single unnamed busy (AGENTS.md rule 6).
- **Fix.** Reuse first run's pattern: a StepMark list with ProgressBar, driven by tracker steps, with Cancel where the bridge can stop. Add each operation to the wait inventory.
- **Files.** `core/src/project-new-app.ts`, `core/src/sharing-*.ts`, `core/src/sync-app.ts`, `views/views/projectNew.view.json`, `sitePreview.view.json`.

### F8. A crashed panel is a dead end

- **Today.** When a view throws, its boundary renders a single Text, *This panel couldn't load.*, and logs to the console (`ui-runtime/src/mount.ts:38-39`). It offers no Reload, no Report and no detail.
- **Rule broken.** A view-scope error says what's safe and offers a recovery.
- **Fix.** The fallback becomes a danger StatusRow, *This panel couldn't load. Your notes are safe.*, with **Reload panel** (remount by key) and **Report problem**, which opens Feedback with the error filled in. Feedback already keeps its draft and retries (`core/src/feedback-app.ts:180-217`).
- **Files.** `ui-runtime/src/mount.ts`, `ui-runtime/src/render.ts` (ViewBoundary).

### F9. Sections load with words, not shimmer

- **Today.**
  - Agents' switches and snippets show *Loading…* in their empty branch (`views/views/settings.view.json`).
  - The share item shows *Preparing…* (`views/views/shareItem.view.json`, Branch).
  - History shows a status line while versions load.
  Open (Branch) and the canvas already use Skeleton.
- **Rule broken.** Views and sections that load show shimmer in the shape of what's coming, with the container marked `aria-busy`. Words are for the long track.
- **Fix.** Skeleton rows in each section's shape, behind `wait.signDelay`, as Open does with `ItemCard skeleton`.
- **Files.** `views/views/settings.view.json`, `shareItem.view.json`, `history.view.json`.

### F10. Withdraw asks first instead of offering Undo

- **Today.** Withdrawing a share opens a confirmation (`core/src/share-item.ts:360-386`, `views/views/shareItem.view.json:244-302`, Branch).
- **Rule broken.** A reversible action acts at once and offers Undo. Confirmation is for what can't be undone.
- **Fix.** If sharing again restores the same link, withdraw at once and show a notification with **Undo**, reusing the pattern of history's restore and Undo (`core/src/note-history-app.ts:115-128`). If the link can't come back, keep the confirmation and say so in it.
- **Files.** `core/src/share-item.ts`, `views/views/shareItem.view.json`.

### F11. History and sync failures have no Retry in place

- **Today.**
  - History says *couldn't load* in its status line, with no Retry (`core/src/note-history-app.ts:178-179`). Restoring a version does offer Undo, which is good.
  - Every sync problem has its words and action (sign in, resolve, retry), but they appear only in a toast, which then disappears (F3).
- **Rule broken.** An error is shown where it happened and stays until it's resolved.
- **Fix.** Give history's status line a Retry, using the StatusRow action from F5. Have the save pill's menu keep the last sync problem and its action until the next success.
- **Files.** `core/src/note-history-app.ts`, `views/views/history.view.json`, `core/src/sync-app.ts`.

### F12. Two save models in one Settings section

- **Today.** The AI section saves its fields on change but its key with an explicit **Save** (`views/views/settings.view.json`, about lines 620-646, Main).
- **Rule broken.** One commit model per section, so a person knows whether to look for a button.
- **Fix.** Keep the explicit Save for the key, because it's checked against the provider, but put it in its own group with its own heading, and give Save a confirmed beat (F2). The rest of the section confirms on each field.
- **Files.** `views/views/settings.view.json`.

### F13. The first-run white frame

- **Today.** The wait inventory already lists a white frame before the first view on first run (`documentations/architecture/perceived-performance.md`, about line 332).
- **Rule broken.** No blank, white or unstyled frame (DSK-09).
- **Fix.** Give the window the resolved scheme's background token before the first paint, and show it on ready-to-show.
- **Files.** `apps/desktop/src/main/`.

### F14. Hover sticks on touch in nine components

- **Today.** These style `&:hover` outside `(hover: hover)`:
  - `ui/src/host/BlockHandle/BlockHandle.css.ts:42` and `ui/src/host/TableControls/TableControls.css.ts:143`;
  - `Heading.css.ts:26`, `FileTree.css.ts:40` and `:94`, `ThemeGallery.css.ts:47` and `Text.css.ts:48`;
  - `OpenItem.css.ts:41` and `:66` (Branch).
  ProjectPill does it right.
- **Rule broken.** States in every context: on touch, hover sticks after a tap.
- **Fix.** Wrap each one in the media query, or use React Aria's `data-hovered` as Button does, and add a `pnpm check` rule that rejects a bare `&:hover` in `*.css.ts`.
- **Files.** The nine files above and `tools/`.

### F15. Failure copy doesn't always say what's safe

- **Today.** The best messages say what's safe: *Your text is still here.*, *Your note is still saved.* Others don't:
  - *Couldn't change where appearance is kept.*
  - *The project couldn't be opened. Check its folder and try again.*
  - *Couldn't copy this local note. Try again.*
  - the AI rewrite's provider failures.
- **Rule broken.** `ui-copy` errors: what happened, what's safe, what to do.
- **Fix.** Add the safe clause to each one, such as *Your notes weren't changed.* or *Your original text is kept.*, and name the action the Retry button runs.
- **Files.** `views/messages/en.json`.

## Missing primitives and tokens

Most of what's needed already exists: Spinner, Icon, StatusRow, Skeleton, StepMark, ProgressBar, LiveRegion, Toast and the `wait.*` timings. The gaps are **states on existing primitives** and three new pieces.

### Tokens

| Token | Value | For | Today |
| --- | --- | --- | --- |
| `wait.confirmMinimum` | 200 ms | The least time pending and confirmed each show on a commit (F2) | Missing; `wait.signMinimum` (500 ms) is the load track's |
| `wait.commitPause` | 500 ms | A segmented choice, a radio or a slider commits after the hand stops, not on each step | Missing |
| `wait.noticeLong` | 8 s | A notice with an action, read and acted on (F3) | `wait.toastUndoDuration` 10 s does this for Undo only |
| `color.commit` and `color.commitBorder` | The success hue, quiet | A field's confirmed border and tick, in light, dark, contrast and forced colours | Reuse `color.success` and `successMuted`; one alias keeps the meaning clear |
| `size.empty.section`, `size.empty.view` | Per layout | The minimum block size of an empty wrapper, so a list doesn't collapse to one line (F6) | Missing |
| `cmp.toast.*` tones | success, warning, progress | The new Toast tones (F3) | Only info and error |
| `cmp.statusRow.action*` | Gap and alignment | The StatusRow action (F5) | Missing |

### States on existing primitives

| Primitive | Add | Reuses |
| --- | --- | --- |
| `useBusy` (behaviour) | `ack`, `failed` and a 200 ms confirm floor | `wait.signDelay`, `wait.confirmMinimum` |
| TextField, ColorField | `pending`, `confirmed`, `failed` in the trailing slot; a confirmed border | Spinner, Icon `checkmark`, `color.commit` |
| Switch | `pending` (a Spinner in the thumb), `confirmed`, `failed` with Retry; still `aria-disabled` while pending, never native `disabled` | Spinner, the Switch's own on and off words |
| SegmentedControl, ThemeGallery, FontChoice, PickerButton | `pending` and `confirmed` on the chosen option; the group locked while pending; `wait.commitPause` | Spinner, Icon |
| Slider | Commit on release, with `confirmed` | `wait.commitPause` |
| ImageFrame | `broken` with alt text and Retry | Icon, Button |
| StatusRow | An optional action (one Button) and an optional **Details** disclosure | Button, the disclosure in Settings |
| Toast | `success`, `warning`, `progress` tones; `sticky` | Spinner, ProgressBar |
| Skeleton | A row and a card shape matching ItemCard and OpenItem, so sections shimmer in their own shape | Skeleton's existing shapes |

### New pieces

| Piece | Layer | What it is |
| --- | --- | --- |
| `EmptyState` | Compound | An icon, one line of why, an optional detail and one primary Button, in a wrapper with the empty min-size tokens; `tone` for good news (F6) |
| `NotificationRegion` | Layout | The labelled "Notifications" region around the toast stack, with the queue's visible limit of three (F3) |
| A commit track in the task tracker | Core (not UI) | `tracker.commit(key, fn)` and `vm.commits`, the source of every control's pending, confirmed and failed state (F2) |
| A gallery fixture for every state | Gallery | Each new state as a contract fixture, so the gallery shows it in light, dark and contrast before any wiring |

## Proposed order of work

UI first, in the owner's strict-design mode: each state is drawn as a contract fixture or a gallery mock with the real design system, and the owner approves the look before anything is wired. Every slice is small enough to review within an hour. Wiring follows only after sign-off, one slice at a time.

<div class="slate-callout slate-callout--tip">
  <p class="slate-callout__title">Where to look</p>
  <p>Design slices land in the <a href="http://127.0.0.1:5231/?f=mock.uistates.hub">UI states review hub</a>, under <code>packages/views/mocks/ui-states/</code>, with light, dark and reduced-motion review controls. Each slice names the findings it answers.</p>
</div>

### Design (gallery only, no wiring)

| Slice | What the owner reviews | Findings | Effort |
| --- | --- | --- | --- |
| D1 | The notification stack: sticky error with Retry, success, warning and progress tones, three visible, a coalesced *3 images couldn't load*, inside the Notifications region | F3, F4 | S |
| D2 | A field's commit: TextField and ColorField pending, confirmed (border and tick) and failed with Retry | F2 | S |
| D3 | A switch's commit: Switch pending (spinner in the thumb), confirmed and failed with Retry | F2 | S |
| D4 | A choice's commit: SegmentedControl, ThemeGallery and FontChoice pending and confirmed, the group locked | F2 | S |
| D5 | `EmptyState` in Files, Open, AI connections, the share list and the site preview, plus a good-news StatusRow | F6 | M |
| D6 | StatusRow with an action and Details, used in Open, New project, Local import and history; ImageFrame broken with Retry | F5, F4, F11 | S |
| D7 | Long operations: New project and Publish with a step list, progress, elapsed time and Cancel; the crashed-panel fallback | F7, F8 | S |
| D8 | Sections loading in their shape: Agents, the share item, history | F9 | S |

### Wiring (after the owner approves each design)

| Slice | What lands | Findings | Effort |
| --- | --- | --- | --- |
| W1 | Notification host: sticky errors, a queue of three with errors first, coalescing, pause on blur, the region | F3 | M |
| W2 | No silent failures: `render.ts` routes a rejected setter or action to the control's failed state or an error with Retry; renderer `unhandledrejection` reporter; roll back store updates whose write fails | F1 | M |
| W3 | The commit track in the task tracker and `vm.commits` | F2 | M |
| W4 | App settings confirm through the commit track (appearance, fonts, scale, focus, outline, Files options, AI fields) | F2, F12 | M |
| W5 | Project settings confirm through the commit track | F2 | S |
| W6 | Retry in place: Open, New project, Local import, history, image reads | F4, F5, F11 | M |
| W7 | Empty states adopted | F6 | S |
| W8 | Steps and Cancel for New project, Publish and the first clone and push | F7 | L |
| W9 | Small fixes: Withdraw with Undo, the crashed-panel fallback, section shimmer, copy that says what's safe, the first-run frame, the hover check in `pnpm check` | F8, F9, F10, F13, F14, F15 | S each |

Each wiring slice also adds its rows to the [wait inventory](../architecture/perceived-performance.md), and runs the checks its risk calls for once it's out of design mode.

**Phase-2 implementation, 4 November:** W2's result-aware action handling and confirmed-settings persistence are pushed to `vq-ui-states` at `dbf53479`; see the [scoped evidence and remaining gaps](../plan/definition-of-done.md#phase-2-evidence-4-november). W3/W4 still supply the approved commit states and retained drafts. W1 must also place actionable notifications above modal scrims: the focused journey could use Retry only after closing Settings. W5 depends on the project-settings implementation, which is not present on this branch. These are implementation gaps, not changes to the owner's design approval.
**New project D7 increment:** [streamed-setup evidence](../plan/definition-of-done.md#phase-2-streamed-new-project) covers actual backend steps/counts, elapsed at 3 seconds, safe-boundary Cancel, retained partial files and completed-create/Open-only receipts. Latest exact pushed candidate: `preview\candidates\65f42cfc\Open review build.cmd`; both distinct sample projects and the real creation/cancellation UI were inspected invisibly, then closed. The owner's visible `f2127c67` remains open; Publish, first clone/push and W9 remain in progress.

**Site D7 increment:** [local-publication evidence](../plan/definition-of-done.md#phase-2-local-site-operations-b70e3334) covers real preview reads, cancelled/rejected preparation, retained previous articles, atomic Apply and local-publication receipts. Publish here saves local draft paths; its copy now says nothing is sent to GitHub. Cancellation is available for preparation, not in the middle of an acknowledged atomic settings write. Exact-head candidate `preview\candidates\b70e3334\Open review build.cmd` retains both sample projects; the visible `f2127c67` stays open. First clone/push, W9 and remaining acceptance are still in progress.

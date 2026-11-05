# Perceived performance: no frozen waits, no glitches

## Files item pin acknowledgement

The exact-brief candidate at `26c3bd1f` preserves these timings and adds row-named tooltips plus a visible resting pin. Native proof covers actual persistence/Retry and unchanged row-relative icon alignment, not an asserted latency improvement.

The existing Files pin write now uses a per-row commit target. The acknowledged pin and selection remain unchanged until storage succeeds; independent rows remain usable and writes serialize without dropping another pin. Retry retains the original row and intended value, including from the existing menu. No performance improvement is claimed.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Pin/unpin a Files note or folder | Responsive; per-row commit track | Same-slot Pin/Unpin button; own-border pending, confirmed or failed; retained error with exact Retry | `fn:files.pin`; immediate local pending, existing 200 ms pending/confirmed floors; no acknowledged pin before persistence |

The [Close-hover correction](../plan/definition-of-done.md#phase-2-close-hover-and-files-pin) changes semantic slot spacing only; it introduces no save, load or wait. Every-frame native checks cover all dialog height variants rather than claiming faster tooltips.

## Themes: scope and acknowledgement

The [structural overlay correction at b031948f](../plan/definition-of-done.md#phase-2-structural-overlay-layers-b031948f) changes paint ownership only: no load, save, reload, unmount or new wait is introduced. Dialogs/full-app steps portal above panels; the existing window band remains draggable and notifications keep their top-level role.

Theme choices retain the existing responsive commit track and its pending/confirmed minimum beats; no new wait or latency claim is introduced. In a fixed-theme project, the acknowledged project theme remains applied until its own write succeeds, with retained attempted choice and scoped Retry on failure. In an App-default project, the existing app slot owns the write. Keyboard previews apply through the same root token resolver without a nested writing scope masking them. [Built-app evidence at bc45a4e1](../plan/definition-of-done.md#phase-2-themes-project-scope-bc45a4e1) covers actual root/editor tokens and restart, not only a selected control.

## Notification outcome lifetime

The UI-states candidate uses the existing notification host, not a blocking wait: ordinary information/success notices get 6 visible seconds; actual multi-line geometry extends that total to `wait.noticeLong` (8 seconds), without restarting elapsed time. The queue's clock runs only for visible pills and pauses on interaction/window inactivity. Errors, recovery actions and explicit decision warnings require dismissal or resolution; progress stays until replaced by its outcome. Retry keeps its original error mounted and makes only its own action inert while the original operation runs. The [notification evidence](../plan/definition-of-done.md#phase-2-notification-acceptance-increment-0db24cb0) records exact clock and focus checks. [Overlapping hover/focus evidence](../plan/definition-of-done.md#phase-2-overlapping-notification-pauses-b68775f8) proves that ending one cause cannot resume the timer while the other remains. [Withdrawal evidence](../plan/definition-of-done.md#phase-2-irreversible-withdrawal-46c0cb31) verifies the existing irreversible confirmation instead of offering a misleading Undo.

## Independent AI connection commits

The [AI group evidence](../plan/definition-of-done.md#phase-2-independent-ai-details-and-checked-key-42e06fc0) covers actual storage and synthetic-provider refusals. These are feedback targets, not a provider-latency improvement claim.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Save one connection detail or provider choice | Responsive; existing commit track, no provider request | Committing field/trigger; retained attempted value with Retry/Revert | `fn:ai.saveDetail`; immediate pending, pending/confirmed each at least 200 ms; independent fields remain usable |
| Check and save an access key | Responsive → waiting; explicit Save, synthetic provider check before sealed storage | Access-key group: Checking key… → Access key saved; local failure and Retry/Revert | `fn:ai.saveKey`; immediate local pending, same 200 ms floors, no Saved before both provider and storage accept |

The key stays only in its password component and the in-flight check closure, never a generic retained command value. A failed same-destination check keeps the entry and old saved key; a changed destination clears the entry and requires it again. A configuration changed during the check rejects the old result instead of attaching it to the new destination. A name can persist independently during checking. The old note and all other settings remain mounted.

## Open action recovery

The [Open recovery evidence](../plan/definition-of-done.md#phase-2-scoped-open-recovery-cf5859a2) covers retained content and exact recovery targets, not a latency improvement. Retry keeps the existing error and expanded Details mounted, shows “Trying again…” on its own inert action and returns focus to search only after successful recovery. The query remains editable; a list refresh does not clear old entries. A completed pin is never replayed just because the next list read failed. [Same-project acceptance and timing evidence](../plan/definition-of-done.md#phase-2-same-project-open-acceptance-and-waits-8f1fb690) adds named tracker measures, exact list-shape timing and actual note-read acceptance before dismissal.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Read/refresh Open entries | Responsive → waiting; named section task, existing entries retained | Existing list wrapper; shapes only after 300 ms and for at least 500 ms; local Retry | `fn:project.list`; exact boundary/fast-read units and held-list journey passed |
| Launch/pick a project or file | Responsive → waiting; named action task, acknowledged note retained | Opening project…; elapsed after 3 s; scoped Retry on failure | `fn:project.open`; same-project read must succeed before Open closes |
| Pin/reveal an Open entry | Responsive → waiting; named action task | Saving pin… / Showing project folder…; scoped Retry | `fn:project.pin`, `fn:project.reveal`; completed pin never replayed for a failed follow-up list |
| Count a project's size (planned, D-346) | Responsive → waiting; stale while updating, never blocking; async walk in the main process, cached per folder | The card's size line: the cached line at once, or a short placeholder line after 300 ms (at least 500 ms once shown); the count swaps in complete; a failed count leaves the line out | `fn:project.stats`; card and open action usable throughout; target 1 s for 5,000 files |

## New project and Local import recovery

The [partial-safe recovery evidence](../plan/definition-of-done.md#phase-2-partial-safe-newlocal-recovery-651b1340) proves recovery targets and data safety, not a latency improvement or complete long-operation timing.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Create/open a new project | Responsive → long; named whole-operation task and actual backend step receipts | Existing New project dialog; completed/total ProgressBar, current StepMark, elapsed after 3 s, Cancel → Stopping after this step…; completed files retained | `fn:project.create`; active-request filtering, exact 2999/3000 ms elapsed and completed-receipt units; real held loopback repository/cancellation and Open-only Retry journeys passed |
| Retry Local import | Responsive → waiting; retain source, target and request receipt | Import sheet's error row: Retry → Trying again…; list/input remain mounted; one complete copy | Planned `fn:local.import` / tracker coverage; actual destination-refusal journey and partial-write units prove safety only |

Completed Local import receipts live for the current desktop process. Crash-persistent recovery and streaming remain unaccepted. If setup failed without returning a created-project receipt, the UI offers a location change rather than replaying uncertain creation.

The [New project stream evidence](../plan/definition-of-done.md#phase-2-streamed-new-project) adds real check/folder/profile receipts, an actual repository step only when that backend work runs, and the final Open step. Cancel waits for the current atomic step, aborts before the next, and never deletes partial files. Cancellation after a completed profile retains its receipt and skips Open; Retry opens it once without creating again. Screen readers hear Stopped, not a false failure. This does not claim crash-resumable setup, Publish or first-clone/push streaming.

## Local site operations

The [local-site operation evidence](../plan/definition-of-done.md#phase-2-local-site-operations-b70e3334) distinguishes local preview persistence from remote publication. No upload or deployment step is invented.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Prepare site preview | Responsive → long; actual per-note preparation and final acceptance | Settings/preview retain old content; real completed/total StepMarks and progress, elapsed after 3 s, Cancel stops before accepting the next preview; read-only Retry retains its error | `fn:site.preview`; exact elapsed/count and retained-content units, real delayed/refused read journey |
| Apply site appearance | Responsive → waiting; atomic local save | Existing preview shows collection/save steps; failed choices remain editable with Retry; cancellation is unavailable during the write | `fn:site.settings`; actual state-write refusal/Retry, real 50% receipt count |
| Publish to local draft | Responsive → waiting; collect actual selected paths, then atomic save | Publish dialog explicitly says local only; steps never claim remote deployment; no repeated in-flight save | `fn:sharing.publishDraft`; actual persisted paths and unchanged note bytes |

## First setup cancellation

The [first-setup evidence](../plan/definition-of-done.md#phase-2-first-setup-cancellation-a9425fee) adds actual completed/total receipts to `firstRun.create` and keeps the existing `firstRun.clone` download/part reports. Setup waits retain their existing tracker elapsed threshold at 3 seconds. Cancel changes to “Stopping after this step…” while the current atomic API/Git step finishes; only then does a persisted stopped receipt offer Resume. Completed files are kept and acknowledged steps are skipped, not blindly replayed. A final push that finishes still reports completion; a refused push reports failure. The separate Open-from-GitHub clone path still needs its own cancellation increment.

## Existing-project download cancellation

The [retained-folder evidence](../plan/definition-of-done.md#phase-2-existing-project-download-025fe72f) extends `firstRun.clone` with actual discovered totals and acknowledged download/private/link receipts. The existing download percentage remains Git's own; elapsed still appears after 3 seconds. Cancel never kills a Git command or removes its files: it stops before the next safe step. Resume checks the same in-process folder receipt instead of cloning again. A late stop on completed work offers Open, and a stop before download says nothing was downloaded. After restart the existing Open-a-folder route checks the retained files; there is no invented durable resume receipt.

## Panel recovery and first-frame checks

The [W9 evidence](../plan/definition-of-done.md#phase-2-panel-recovery-and-hover-afbd3c3c) adds immediate, view-local Reload: the failed boundary remounts without a page reload or restarting the app. Sibling views, note state and editor identity remain intact. Report problem opens the existing Feedback draft; a new panel report contains only fixed copy, starts with diagnostics off and sends nothing. An existing draft keeps its kind and words. Other failed-panel surfaces yield while Feedback is open so they cannot cover the reporting path. This introduces no asynchronous storage or network wait.

The existing `fn:window.firstFrame` handshake was checked at native first run in both light and dark, with the system deliberately set to the opposite scheme: the window was still hidden when the report arrived, and the resolved themed app root had nonzero geometry and an opaque canvas. Both runs reported the first-frame path, not the timeout. The intentional transparent custom-frame margin remains unchanged. This scoped check does not claim the full frame-integrity corpus, all startup delays or a performance-budget improvement.

The [native acceptance increment](../plan/definition-of-done.md#phase-2-native-recovery-and-empty-first-actions-12834be2) additionally injects an actual Settings-panel render failure in Electron, repeats local Reload, opens safe Feedback and then recovers the panel. The existing editor node, page time origin, note bytes and one-window count remain unchanged. The fault is test-only; recovery adds no reload, process restart or new network destination.

The [site empty-variant evidence](../plan/definition-of-done.md#phase-2-site-empty-variants-20406d26) verifies known-empty results after actual public content is cleared and the real watcher acknowledges removal. Each reachable section keeps the 160 px token minimum. The fourth list's defensive empty-section route is client-tested separately because normal section navigation is derived from nonempty articles. These checks add no wait, network destination or latency claim.

The [startup-pixel and sizing evidence](../plan/definition-of-done.md#phase-2-cleared-ai-and-startup-pixels-cf63f90d) requests actual native pixels at the first-frame report in light and dark. The existing frame classifier finds no blank, substantially transparent or wrong-scheme drawn window in those captures; the report still observes the window hidden and never takes the timeout path. Capture completion is asynchronous, so this is not a continuous pre-show frame stream. Cleared AI/Files and existing-gallery minimum-size checks add no runtime wait or speed claim.

The [next D7 increment](../plan/definition-of-done.md#phase-2-single-outcomes-and-startup-frame-stream-a7363402) adds a native frame subscription before page loading and checks every delivered shown-window frame through the ready screen plus 300 ms: 7 light and 7 dark frames in the final run. Hidden frames remain excluded from visible-window failures. It also makes outcome ownership explicit without changing wait timing: local recovery rows/notifications and interpreted setup/download receipts no longer compete with generic task endings. Other tracker callers retain the default announcements. These are scoped integrity/announcement checks, not a latency or broad-corpus claim.

The [colour all-done evidence](../plan/definition-of-done.md#phase-2-reachable-colour-all-done-state-a055bbe8) moves the already-approved good-news treatment from an unreachable empty-row fallback to the actual contrast summary. The edit/fix preview remains synchronous and write-free; the same wrapper changes between a failure summary and one polite success row. No asynchronous wait, new timing or latency claim is introduced.

The [retained-outcome follow-up](../plan/definition-of-done.md#phase-2-repeated-retained-outcomes-06d4f939) also checks another refusal while the original recovery row remains mounted. A repeated identical result gets one explicit live announcement; a new local message is not duplicated. Actual operation work, progress, measures and cancellation are unchanged. That D7-only claim does not cover the separate D8 section-tracker/local-error overlap.

The [D8 section-outcome follow-up](../plan/definition-of-done.md#phase-2-section-outcome-ownership-1d3deccf) now closes that separate overlap for Agents, item sharing and history reads. The tracker keeps its delayed wait and successful completion; the local live failure row owns refusal, and only an unchanged retained refusal gets an explicit repeated announcement. Agents retains its error row with busy Retry rather than showing first-load shapes again. Exact 300 ms delay/500 ms hold, finite/reduced-motion shimmer, existing content and stale-read guards remain unchanged. Native 1,100 ms refusals and connected live-region mutations prove initial/repeated outcome ownership; they are not latency or screen-reader certification claims. No new wait or network destination is introduced.

The [named field/switch contract proof](../plan/definition-of-done.md#phase-2-named-field-and-switch-contracts-9c512e40) reuses the existing 200 ms pending/confirmed commit lane when a field is explicitly declared persisted. It adds no wait to actual colour-copy or sharing/site draft controls. Native colour edits/Fix and reader Focus changes perform zero early settings writes; their existing explicit Save/Share/Apply boundaries remain intact. This is state/acknowledgement proof, not a performance improvement claim.

## History recovery

The [history recovery evidence](../plan/definition-of-done.md#phase-2-history-recovery-and-independent-section-ef03a581) covers actual local Git reads and disk acknowledgements with controlled delay/refusal, not a latency improvement. Existing entries and previews remain mounted. Initial list and first-version shapes appear only after 300 ms and stay at least 500 ms; older-page Retry keeps all already-loaded versions. Restore/Undo success means the disk accepted the text, not remote backup completion.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Read initial/older history page | Responsive → waiting; independent section task | Existing history wrapper; Reading versions… / Reading older versions…; scoped Retry | `fn:history.list`; shared 300/500 ms shape timing; failed read retains content |
| Read selected version | Responsive → waiting; independent preview task | Reading that version…; shapes only without an acknowledged preview; retained old preview on failure | `fn:history.version`; exact 300/500 ms first-preview units and real delayed/failed journey |
| Restore selected version | Responsive → waiting; named save task | Restore this version → Restoring version…; retained error and scoped Retry | `fn:history.restore`; current draft saved first; no success or dismissal before restored write acknowledgement |
| Undo restored text | Responsive → waiting; named save task | Existing notification action, retained failure and Retry | `fn:history.undo`; original Undo text survives refusal; no success announcement before write acknowledgement |

## Share-item section recovery

The [independent sharing evidence](../plan/definition-of-done.md#phase-2-share-item-independent-section-2ce9b22d) uses held/refused local reads, not a latency improvement claim. Preparation is a named section task: no shape before 300 ms, at least 500 ms once visible, three shimmer passes then still, static with reduced motion. A refresh keeps acknowledged sharing history. Retry retains its error and the editable choices, makes only its own action inert and never creates or replays a grant.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Prepare/retry an item's sharing list | Responsive → waiting; independent section | Existing Share dialog row; Preparing sharing… / scoped Retry → Trying again… | `fn:share.item.prepare`; exact 300/500 ms units and independent held/refused desktop journey |

## Files initial listing

The [Files known-empty evidence](../plan/definition-of-done.md#phase-2-files-known-empty-and-first-action-6218b99d) separates a successful empty scan from unknown or failed content. Initial listing and its scoped read-only Retry use a named section task. A first-load shape is delayed 300 ms and, once shown, held at least 500 ms by the shared tracker. Retry retains its error row; snapshot completion reapplies queued watcher events and acknowledged saves. This is no speed claim and does not claim an independent delayed initial-scan desktop journey.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Initial/retry Files scan | Responsive → waiting; independent section | Existing Files body; Reading your notes…; failure says notes weren't changed, Retry → Trying again… | `fn:workspace.list`; shared 300/500 ms task units, read/write-queue safety units, real known-empty first-action journey and [independent held/refused first-scan journey](../plan/definition-of-done.md#phase-2-independent-initial-files-scan-b830a17c) |

## Recently deleted history

The [honest-history evidence](../plan/definition-of-done.md#phase-2-recently-deleted-honest-states-71e94423) distinguishes a failed read from good news. The first-read shape is absent before 300 ms and, once shown, held at least 500 ms. Refresh keeps acknowledged rows; scoped Retry retains its error and never changes notes. A failed Git log propagates failure, not a partial empty result. This is feedback correctness, not a speed improvement.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Read/retry Recently deleted | Responsive → waiting; independent named section task | Existing Files history wrapper; Looking through history…; local Retry → Trying again… | `fn:history.deleted`; exact 300/500 ms units and held/refused real-history journey; good news only after successful empty read |

## Sharing settings list

The [honest-list evidence](../plan/definition-of-done.md#phase-2-honest-sharing-settings-list-e1ce6940) covers this separate listing, not only the Share item. Unknown and failed lists are not empty. Refresh keeps acknowledged rows, Retry keeps its error, and an older read cannot replace a newer acknowledged change. Filter clearing reads and writes nothing. This is feedback correctness, not a speed improvement.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Initial/retry Sharing settings list | Responsive → waiting; independent section | Existing Settings content; Loading who has access…; safe local failure, Retry → Trying again… | `fn:sharing.list`; exact 300/500 ms units, three approved ItemCard shapes, finite/reduced-motion shimmer and independent delayed/refused desktop journey |

## Image read recovery

The [broken-image evidence](../plan/definition-of-done.md#phase-2-broken-image-recovery-cd0cede9) covers actual missing-file and native decode refusal, retained layout/alt/Retry and unchanged note bytes. It makes no speed claim. The read task includes the shared 300 ms sign delay and 500 ms minimum once shown; an existing broken frame stays mounted throughout Retry. Distinct failures coalesce per note, never one interrupting notice per Retry.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Read/retry one note image | Responsive → waiting; named image task, exact source and document identity | Existing image wrapper; alt and error remain, Retry → Trying again…; other images stay usable | `fn:image.read`; exact 300/500 ms task units and held/refused real-image journey |
| Browser decode refusal | Responsive/waiting; explicit component failure, no blank success-shaped fallback | Approved broken ImageFrame and scoped Retry | Correctness journey passed; end-to-end native decode duration remains unmeasured |

## Other image waits (planned)

IMG-01 to IMG-10 adds no measured performance claim. Use the existing tracker and 300 ms delay/500 ms minimum visible indicator; acknowledge within 100 ms. Keep input, old pixels and the caption draft mounted; only the destructive commit briefly prevents duplicate image saves. Bounded decode/encode runs outside the main process.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Validate/copy dropped images | Responsive → waiting; reserved-aspect placeholder, batch count | Insertion marker/task: Adding ⟨count⟩ images…; Retry/Choose images | `fn:image.import`; acknowledgement ≤100 ms, no partial-success batch |
| Decode/load image | Responsive/waiting; exact aspect box, previous complete pixels on replacement | Image: Preparing image… / Image unavailable | `fn:image.decode`; no layout-shift/blank replacement |
| Prepare/update crop preview | Responsive/waiting; old preview until new one ready, latest transform wins | Dialog: Preparing image… / Updating image… | `fn:image.preview`; control feedback ≤100 ms, no queued drag updates |
| Encode/save edited pixels | Waiting/long; leavable preparation, guarded commit with truthful state | Dialog: Saving image…; explicit retry/reopen error, no saved claim early | `fn:image.save`; original retained on failure, main process stays usable |
| Save image defaults | Responsive; keep saved default until durable write | Menu/status: Saving image options…; retained old value on error | `fn:image.defaults`; no focus/selection reset |
| Generate caption | Waiting/long; selected image and editable context retained, Stop | Caption surface: Writing caption…; progress through existing AI task | `fn:image.caption`; only explicit Generate sends; Stop/error changes no caption |
| Seal/publish referenced media | Long; existing publish task steps, not a second spinner | Share status: Preparing images… → Waiting to publish | `fn:image.publish`; no Ready until full authorized media output succeeds |
| Prepare images for print (D-348) | Responsive → waiting; the print dialog opens only when every image is decoded | Bottom pill: Preparing images for print…; Cancel keeps the note | `fn:image.print`; no blank image in the printed page |

## Project and sharing waits (planned)

The MP flows are specified, not implemented or measured except for the candidate increments identified below. These rows extend the wait inventory before wiring; targets are feedback budgets, not claims that GitHub finishes within them. Use the existing task tracker, keep the old view/draft, delay a responsive indicator 300 ms and keep it visible at least 500 ms once shown. Acknowledge within 100 ms; long remote work is leavable and steps have elapsed time, never an unnamed busy flag.

The `vq-share-rest` review slice runs Settings copy, expiry changes, withdrawal and deletion through tracker target `sharing.change` (`focus-notes:sharing.change`): responsive through waiting, or long when copy waits for publication. The list stays visible with disabled affected controls, a preparing status and an explicit retryable error. Turn off is an instant candidate-only local preview, not a note move or a real publication.

Local invitation draft saves use tracker target `sharing.invite` (`focus-notes:sharing.invite`), a responsive save with the Send invite button busy, input retained on failure, and the Pending card only after the device-local state write succeeds. No remote invitation wait or claim is made.

The local Publish draft uses `sharing.publishDraft` (`focus-notes:sharing.publishDraft`), responsive save with a busy Publish button and a completion toast only after the local write. Site preview preparation uses `sharing.preview` (`focus-notes:sharing.preview`), responsive through waiting while it reads current notes, retaining Settings until the full preview is ready. Apply uses `sharing.previewSave` (`focus-notes:sharing.previewSave`), responsive save with its busy button and retained choices on failure. Errors remain in the dialog or Settings status. These are local operations, not remote publishing budgets.

The 3 November owner-review Open slice keeps the source window and draft intact while starting a local project in its own process/profile. The dialog names the opening operation and retains search input on refusal; without a note, the same choices fill the window. Launch resumes the last closed project and its remembered note. Tracker timing and restoring every previously open project/window remain production work; no remote operation is wired.

| Operation | Class / pattern | Place and words | Measure / target |
| --- | --- | --- | --- |
| Open local project | Responsive → waiting; keep old window, prepare complete replacement | Project row: Opening “⟨project⟩”…; Retry on failure | `fn:project.open`; acknowledgement ≤100 ms, indicator after 300 ms |
| Create/download project | Long; background steps Checking / Creating / Downloading / Opening | Projects task row, elapsed; leave without losing input, no blind duplicate creation | `fn:project.create`; UI stays usable; no remote-completion deadline claim |
| Candidate New project (local GitHub fake) | Waiting; existing "Creating project…" line, preserved dialog/input, Create disabled until confirmation | Loopback-only metadata creation and privacy confirmation; each request bounded at five seconds; exclusive folder prevents blind duplicate creation | `fn:project.create`; UX-sooner slice, not the production background tracker or measured budget |
| Save project look/pins | Responsive; persisted state retained while writing | Chosen control: Saving project look… / Saving pins…; explicit error/retry | `fn:project.settings`; acknowledgement ≤100 ms |
| Review folder contents | Waiting for large trees; chrome now, existing counts retained while updating | Review dialog: Reading ⟨count⟩ items…; refresh/changed-scope notice | `fn:share.reviewContents`; result before claiming reviewed |
| Item-dialog folder count (WP-P.9 candidate) | Responsive → waiting; draft chrome immediately, stream counts/review rows and yield every 200 items; stale results discarded on close/reopen | Item card: Counting notes… after the task tracker's sign delay; the nested review keeps the same draft and mounts at most 200 rows | Tracker target `share.item.count`, measure `focus-notes:share.item.count` (the `fn:share.reviewContents` count span); 10,000-note controlled unit verifies input can change before completion; bounded-row units retain keyboard/type-ahead focus |
| Item-share preparation and generated words (WP-P.9 candidate) | Responsive → waiting; preserve draft; discard stale completion after closing | Preparing share… / Preparing words…; explicit load or word-generation failure | Tracker targets `share.item.prepare`, `share.item.words`; measures `focus-notes:share.item.prepare`, `focus-notes:share.item.words` |
| Item-share publication and handoff (WP-P.9 candidate) | Long; prepare identities, save grant, back up, poll encrypted deployment, reveal, hand off; retain grant for retry | Preparing share… → Publishing this share. It copies when the site is ready. → copied or native-sheet status; staged step/total and elapsed seconds; offline/signed-out/scope-change failures remain in dialog | Tracker targets `share.item.create`, `share.item.publish`, `share.item.reveal`, `share.item.handoff`; matching `focus-notes:` measures. Actual-app journey proves no copy while site returns 404; 10-minute timeout and cancellation tested. Steps are operation stages, not invented byte percentages |
| Add reviewed notes to existing item shares | Long; guarded identity resolution and grant update, then actual encrypted publication for each affected share; no credential rotation or new grant | Adding reviewed notes… → Publishing this share. It copies when the site is ready. → Reviewed notes added to these shares.; step/elapsed feedback; membership changes fail explicitly | Tracker `share.item.addNotes`, then `share.item.publish`; `focus-notes:share.item.addNotes`, `focus-notes:share.item.publish`; boundary units verify complete reviewed membership and unchanged credentials |
| Existing-row copy, withdrawal and sign-in resume | Responsive → waiting/long; existing dialog/draft stays; cancellation never copies | Named publication/handoff or Withdrawing share…; confirmation defaults to Cancel; signed-out failure offers existing Sign in | Tracker `share.item.publish`, `share.item.handoff`, `share.item.withdraw`; corresponding `focus-notes:` measures. Native callback mutation/cancellation/stale-readiness units; actual sign-in recovery and macOS sheet journeys remain pending |
| First-share site setup | Long; named steps Creating site / Setting up publishing | Share task, preserved draft; partial results and Continue setup | `fn:project.enableSharing`; no remote action before confirmation |
| Create/update/withdraw share | Long; commit, backup, seal, publish | Share status: Preparing share… / Waiting to publish / Ready to share; Retry publishing | `fn:share.publish`; ready only after exact deployment succeeds |
| Publish note on today's workspace (D-351, SHR-26) | Long, leavable; one task with steps | Bottom pill: Saving to GitHub… → Publishing… usually about a minute → Published with Copy link; Not live yet + Retry; after 10 minutes Still publishing. GitHub is taking longer than usual. | `fn:publish.note`; Published only after the Pages deployment for that commit succeeded and the page answers |
| Unpublish note (D-351) | Long, leavable; same task | Bottom pill: Removing from your site… → Removed from your site; Retry on failure | `fn:publish.unpublish`; removed claimed only after the deploy without the page succeeded |
| Invite collaborator | Waiting/long; request then reconcile actual invitation state | People row: Sending invite… → Pending; errors keep username and role | `fn:project.invite`; no accepted claim from pending response |
| Standalone/Local note save | Responsive; journal and atomic disk save | File state: Saving here… / Saved here; write refusal offers Save as… | `fn:file.saveLocal`; disk confirmation ≤ existing 1 s save target, retain journal otherwise |
| Clipboard/OS share | Responsive; explicit result or cancellation | Copy action status / Ready to share when fresh gesture is required | `fn:share.handoff`; never claim copied/opened on refusal |
| Validate SVG logo | Responsive/waiting; retain current mark until exact safe preview ready | Logo control: Checking logo…; explicit refusal, no network | `fn:project.logoValidate`; acknowledgement ≤100 ms, indicator after 300 ms |
| Prepare/update site preview | Responsive/waiting; keep previous good render and settings input | Preview heading: Preparing preview… / Updating preview…; Retry on failure | `fn:site.preview`; control acknowledgement ≤100 ms, never clear old view |
| Save site appearance | Responsive; draft kept, saved values only after atomic write | Apply: Saving site settings…; no Published success | `fn:site.settings`; acknowledgement ≤100 ms |
| Open public section/article | Waiting; static content first, previous page retained during enhanced navigation | Navigation: Opening section… / Opening article… with Retry | `fn:site.navigate`; bounded index page, no remote-duration claim |

Existing browser-writing waits below are historical and retired by D-292; share-reader decrypt and read-only website waits remain. Ordinary AI-stream waits also cover Write at caret, with “Writing” instead of “Rewriting”.

**D-267 revision, 17:29 feedback:** reuse the device-local Writer write and `fn:ai.chooseWriter`, not a second save lane. Keep the old checked Default until persistence applies. Pending radio choices use inert `aria-disabled`, never native disabling that loses focus. The mounted **Remembering your choice…** LiveRegion stays outside layout, so progress and success do not shift the entire list; success is announced, not repeated below it. Shared selected row paint/badge updates leave the editor, panel, scroll and input mounted. Failure retains the old choice and shows its sanitized reason. No note/model request occurs. Find and its scan explanation form one related group above the list; prior results remain during discovery. No latency improvement is claimed or measured; ordinary synthetic UI observation and permitted static/build/type checks are the evidence, with owner acceptance pending.

How Focus Notes stays calm while work takes time. It covers what a person must see within 100 ms, 1 s and 10 s, which feedback pattern each kind of wait gets, how windows and views change without a blank or white frame, and the inventory of every wait in the app with its pattern and measure. It's the design half of performance. The measuring half, with the budgets and the benchmark, is [Performance and quality](performance-and-quality.md), and the signs themselves are [Feedback and dialogs → Waits](../design/components/feedback-and-dialogs.md#waits). Adapted from the owner's perceived-performance framework for his personal site (D-149).

**D-263, integration icons:** local bundled SVG paths replace decorative connection marks; no remote image fetch, model operation or new wait is added. Existing AI Find, models, Test and Rewrite wait rows remain unchanged.

> [!NOTE]
> **TL;DR.**
> - **Speed is felt, not measured.** A 3 s sign-in that names each step feels faster than a 1 s one that freezes. Every action gets the feedback its wait deserves, and no more.
> - **There are four classes of wait** (Nielsen's response-time limits and the Doherty threshold):
>   - **instant** (under 100 ms): no indicator;
>   - **responsive** (100 ms to 1 s): an inline state, never a flashing spinner;
>   - **waiting** (1 to 10 s): names the work at its place, and the window stays usable;
>   - **long** (over 10 s, or several steps): steps, progress and elapsed time, in the background, cancellable where the work can stop.
> - **Never a frozen screen.** Every operation in the [wait inventory](#the-wait-inventory) goes through the one task tracker with its class's pattern (PRF-08, PRF-13). A step that can only say "busy" is a defect.
> - **Never a blank, white or unstyled frame (DSK-09, D-148):**
>   - The window shows only once its first themed frame is painted.
>   - Switching workspaces, finishing setup, removing a workspace, signing out and changing the theme happen **in place**, never by reloading the page.
>   - Views swap complete: the old one stays until the new one is ready.
>   - Resizing, maximizing, snapping and full screen never show unpainted area.
> - **Snappy: the window and every control follow the hand (PRF-14, D-151).**
>   - A dragged or resized window stays attached to the pointer, within a frame, and is where it was released in the frame of release.
>   - Every control answers on pointer-down, in the next frame.
>   - The main process never stalls more than a frame.
> - **Never block input, never lose it, never lie.** Typing is echoed at once. "Saved on this computer" means it's on disk; "Backed up" means it's pushed.
> - **Every pattern has a measure**, so each promise is checked, not hoped. A frame-integrity journey records frames through every transition and fails on a blank one. A "no silent wait" journey slows every inventory operation and checks its sign.

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" role="img" aria-labelledby="fnpp-bands__title fnpp-bands__desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnpp-bands__title">Four classes of wait, and the feedback each gets</title>
<desc id="fnpp-bands__desc">A timeline from 0 to more than 10 seconds split into four bands. Instant, under 100 milliseconds: the result itself, no indicator, for typing and opening a menu. Responsive, 100 milliseconds to 1 second: an inline state shown only after 300 milliseconds, for saving or opening a note. Waiting, 1 to 10 seconds: an indicator that names the work while the window stays usable, for finding your notes or getting a sign-in code. Long, over 10 seconds or several steps: steps with progress and elapsed time, in the background, with a way to cancel, for creating your notes, downloading them, or saving to GitHub.</desc>
<g id="fnpp-bands__instant" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-1" x="30" y="40" width="210" height="200" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="50" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">Instant</text>
<text x="50" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">under 100 ms</text>
<text x="50" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">The result itself</text>
<text x="50" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">No indicator</text>
<text x="50" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fnpp-bands__body-1" data-slate-fit-padding="16">Type, open a menu</text>
</g>
<g id="fnpp-bands__responsive" data-slate-svg-step="2" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-2" x="270" y="40" width="210" height="200" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="290" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Responsive</text>
<text x="290" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">100 ms to 1 s</text>
<text x="290" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Inline state change</text>
<text x="290" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Shown after 300 ms</text>
<text x="290" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fnpp-bands__body-2" data-slate-fit-padding="16">Save, open a note</text>
</g>
<g id="fnpp-bands__waiting" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-3" x="510" y="40" width="210" height="200" rx="16" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="530" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Waiting</text>
<text x="530" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">1 to 10 s</text>
<text x="530" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Names the work</text>
<text x="530" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Window stays usable</text>
<text x="530" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="12" data-slate-fit-target="fnpp-bands__body-3" data-slate-fit-padding="16">Find notes, get a code</text>
</g>
<g id="fnpp-bands__long" data-slate-svg-step="4" data-slate-svg-effect="fade-rise">
<rect id="fnpp-bands__body-4" x="750" y="40" width="220" height="200" rx="16" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="770" y="74" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Long</text>
<text x="770" y="98" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">over 10 s, or steps</text>
<text x="770" y="140" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Steps and progress</text>
<text x="770" y="166" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Background, cancel</text>
<text x="770" y="206" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="12" data-slate-fit-target="fnpp-bands__body-4" data-slate-fit-padding="16">Create, download, push</text>
</g>
<g id="fnpp-bands__axis" data-slate-svg-step="5" data-slate-svg-effect="draw">
<path d="M30 270 L970 270" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<polygon points="979,270 970,275 970,265" fill="var(--color-neutral-fg-2)" />
</g>
<text x="30" y="292" text-anchor="start" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">0</text>
<text x="255" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">100 ms</text>
<text x="495" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">1 s</text>
<text x="735" y="292" text-anchor="middle" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12">10 s</text>
</svg>
<figcaption>The four classes of wait. The boundaries are Nielsen's response-time limits (0.1 s, 1 s, 10 s). The 300 ms delay before an indicator (<code>wait.signDelay</code>) keeps a fast result from flashing one.</figcaption>
</figure>

<details class="slate-figure-data">
<summary>The classes, as a table</summary>

| Class | Wait | What the person sees | Examples in Focus Notes |
|---|---|---|---|
| Instant | under 100 ms | The result itself, with no indicator | Typing, moving the caret and the focus band, opening a menu or Spotlight, toggling focus mode, changing the theme or text size |
| Responsive | 100 ms to 1 s | An inline state change, shown only past 300 ms | Opening a note, writing to disk, a structural change in Files, copying a link |
| Waiting | 1 to 10 s | An indicator at the place that names the work, with the old view kept and the window usable | Getting a sign-in code, finding your notes on GitHub, unlocking, sealing a share, listing repositories |
| Long | over 10 s, or several steps | Named steps with the current one shown, determinate progress where it's known, and elapsed time, in the background, cancellable or leavable | Creating your notes, downloading (cloning) them, waiting for approval on GitHub, saving to GitHub, publishing, an update download |

</details>

## Why perceived performance

A person doesn't experience milliseconds. They experience whether the app **answered**, whether it's **still working**, and whether what it says is **true**. The research behind that is old and stable:

- **Response-time limits** (Nielsen, 1993, after Miller, 1968):
  - under **0.1 s**, an action feels direct;
  - under **1 s**, the flow of thought holds, though the delay is noticed;
  - past **10 s**, attention leaves, and the person needs to know how long it will take.
- **The Doherty threshold** (Doherty and Thadani, IBM, 1982): productivity climbs sharply when the system answers within about **400 ms**.
- **Progress indicators** (Nielsen Norman Group): use a looping indicator for waits of about 2 to 10 s, and a determinate one (percent done, or steps) past 10 s. People tolerate long waits much better when they can see progress.

In Focus Notes, the problem the owner measured by hand isn't only that some work is slow. **Slow work is silent or disruptive**:

- Setup steps sit on one unnamed "busy" state while Git and GitHub work for many seconds.
- Finding your notes runs a GitHub request per repository with nothing to show for it.
- Finishing setup reloads the page, which flashes the whole window white.

Faster code fixes some of that. Honest feedback fixes the rest, and buys time for the code.

## Principles, in order when they conflict

1. **Never block input, never lose it.** Typing is echoed by the editor itself, never after a round trip. A refresh never replaces the note, a field or a selection the person is using. If it would, it waits, and says why.
2. **Acknowledge within 100 ms.** Every action changes something visible at once: the pressed control (the busy state's `ack` phase), the selection, or the new row in Files. If the real result takes longer, that acknowledgement stands in for it.
3. **Never show a blank, white or unstyled frame (DSK-09).** Keep the old view until the new one is ready ([below](#glitch-free-windows-and-views)).
4. **Say what is happening, where it happens.** The affected control or region shows the sign: a busy button, a pending row, a region updating, or the account pill for saving to GitHub. Its words name the work ("Looking for your notes on GitHub…", not "Loading…"). Nothing processes without a visible sign, and there's no status bar (DD-FB-02).
5. **Be true.** "Saved on this computer" means the write finished, and "Backed up" means the push finished (D-132). An optimistic view, such as a moved note shown before its commit, is allowed only when a failure puts it back and says so (PRF-09).
6. **Match the indicator to the wait.** Instant work gets no indicator. Responsive work gets none that flashes (`wait.signDelay`). A wait gets named work. A long wait gets steps, progress and time.
7. **Do the work before it's asked for.** What the next screen will need starts as soon as it's known. For example, *Your notes* starts listing repositories the moment the account is connected, during *Connect*'s confirmation. Hovering or focusing an action that opens a list fetches it.
8. **Preserve context.** Scroll position, focus, the open note, the caret, the selection and the expanded folders survive every refresh, and every workspace switch where they still apply.
9. **Fail loudly, recover quietly.** A failure says what happened and the one thing to do, and keeps the person's input. A retry that succeeds just clears the message.

## Snappy: the window and every control follow the hand

A drag that trails the pointer, or a window that floats to where it was released, feels like a rubber band, however fast everything else is. **Direct manipulation has the strictest budget of all: it must look attached to the hand** (PRF-14, D-151). The owner found that a fast drag left the window behind and that it settled after the release.

**Why it lags today.** Moving the window is app-built (D-14):
1. The page gets the pointer move and waits for its next animation frame.
2. It sends the position to the main process.
3. The main process moves the window.

Each move is therefore at least two frames behind the pointer. When moving the transparent window takes longer than a frame, positions queue up in the main process, and the window keeps moving after the pointer stops. The snap preview is also shown again on every move, not only when its zone changes.

| Rule | How it holds | Measure |
|---|---|---|
| **The window is attached to the pointer** | Moving and resizing follow the system's cursor, not a relay of page events. One message starts the drag; after that, the main process reads the cursor itself (`screen.getCursorScreenPoint()`) once per display frame, at the display's refresh rate, and only while the drag lasts (PRF-04 forbids timers at rest). Where the platform's own move loop is faster, the system moves the window instead: on Windows, the native move started from the band, with the app's snapping driven by `will-move` and applied on `moved`; snapping and restoring a maximized window under the pointer keep working. As built (WP-5.9, D-151): the main process's loop, which reads the cursor at each of its own ticks and at each frame in which the page saw the pointer move, since on Windows its timers fire only every 15.6 ms; the system's loop was evaluated and not chosen (D-151 (8)). | `fn:window.dragLag`: the distance between the cursor and the point of the window under it, in a scripted fast drag (CI, screen level, D-141): p95 at most one frame of travel at 3,000 px/s, i.e. 50 px at 60 Hz, and 0 px within one frame of the pointer stopping |
| **Never a queue** | Only the latest position is ever applied. A move that arrives while the last one is still being applied replaces it, and nothing is applied after the release. | `fn:window.settle`: from the release to the window's final position, at most one frame |
| **Moving never repaints the page** | A move changes only the window's position, never its size, so the page doesn't lay out or paint. The snap preview window is shown only when its zone changes and hidden once, and the window isn't raised again on every move. | The paint count during a 2 s drag: 0 page paints; preview `show` calls equal to zone changes |
| **Resizing keeps up** | Resizing uses the same loop. The page lays out at the new size within the same frame, with no work on the resize path but layout: the editor doesn't re-measure the note on every frame, and the focus band and the top-edge blur follow by CSS, not script. | `fn:window.resizeFrame` p95 ≤ 16 ms (on software compositing, where the processor draws every size, a measured p50 ≤ 35 ms and p95 ≤ 60 ms as a regression check, D-151 (13)); `fn:window.dragLag` for edges |
| **The main process never stalls** | The main process moves windows and answers every bridge call, so blocking it makes everything feel slow. It never does synchronous file, Git or crypto work. Heavy work runs in Git's own processes, worker threads or a utility process. | `fn:main.loopLag`: the main process's event-loop delay during setup, backups, a 10,000-note scan and a drag. p99 ≤ 16 ms, max ≤ 50 ms |
| **Every control answers in the next frame** | A press shows on pointer-down, not after the click: the pressed state, the menu open, the toggle flipped. Hover and focus states change within a frame. An animation never delays the result it shows: the result is in place first, and the motion (`motion.micro` to `motion.enter`) runs while the person can already act, and can be interrupted. A long list draws the rows it shows first and the rest a frame later. Without a GPU (software compositing, D-121), where each frame of a blur or of a fade over the window costs a whole frame of drawing, surfaces aren't frosted and dialogs and menus appear without a fade (D-151 (13)). | Input to next paint (INP, measured in the journeys for every toolbar, menu, Spotlight and Settings action): p95 ≤ 50 ms, never over 100 ms; no long task (over 50 ms) during an interaction |
| **The first input after a pause is as fast as the rest** | Code for the toolbar, menus and Spotlight is loaded and warmed during start-up's warm-up (PRF-10), so their first use isn't slower than their tenth. | INP of each control's first use vs its fifth: within 20% |

**How it's checked.**
- **On CI, at screen level (D-141):** the drag-lag and settle measures drive a real pointer, captured by the system: a straight fast drag, a zig-zag, a drag onto each snap zone, and an edge resize.
- **In the inactive-window journeys:** the main-process loop lag, the paint counts and INP, safe to run on the owner's computer.
- **In the benchmark:** each is a measure in `pnpm bench`, with its budget in `tools/bench/budgets.json`, and the slow-computer run (CPU slowed 4×) reports it too.

<h2 id="glitch-free-windows-and-views">Glitch-free windows and views</h2>

A brief white flash across the whole window is the most visible imperfection a desktop app can have. On Windows and Linux the window is transparent and app-built (D-14), so any frame the page hasn't painted is either see-through or Chromium's default white. These rules make every frame a finished one (DSK-09, D-148):

| Rule | How it holds | Checked by |
| --- | --- | --- |
| **The first frame is a finished frame** | The window is created hidden. The page's first paint is already the theme's canvas, with the theme resolved before the first paint: the main process passes the resolved theme with the page's address, so the boot styles from `packages/ui` paint the right canvas colour with no script. The window shows only after the renderer reports the first frame with the app's layout drawn (`fn:window.firstFrame`), not on DOM ready. On macOS, the native window's `backgroundColor` is the theme's canvas: the chosen built-in theme's own (`themeCanvas`), then the page's. | The frame-integrity journey at launch, in light and dark (`e2e/dsk09-frames.spec.ts`) |
| **No page reloads for state changes** | Finishing setup, opening another workspace, removing the workspace, signing out, running setup again, and changing the theme or language never call `webContents.reload()`. The main process sends the new state over the bridge. The renderer rebuilds its stores and views off screen and swaps them in one frame. A reload is allowed only to recover from a renderer crash, and then a cover in the theme's canvas hides the window's content until the new page reports its first themed frame (a captured image of the last frame isn't possible after the crash). | `apps/desktop/test/no-reload.test.ts` (any other `reload(` in `apps/desktop/src/main` fails); the journey through finishing setup, opening another workspace, removing it and signing out, with no page navigation; a forced renderer crash, whose new page's frames are checked once the cover goes (`crash-cover.test.ts`, `e2e/dsk09-frames.spec.ts`) |
| **Views swap complete** | A view, a setup step, or the setup-to-app change mounts its next content first and replaces the old content when that's ready (double-buffering). Nothing is unmounted to a blank area while its replacement loads. A view that needs more than 300 ms keeps the old one with the region-updating sign. One that opens empty shows its skeleton at once ([Waits](../design/components/feedback-and-dialogs.md#waits)). Setup steps don't remount the whole tree. | The frame-integrity journey: setup's steps, opening Settings, Files, Spotlight, Share |
| **Theme changes all at once** | Light, Dark, System, a custom theme and the OS switching it change every colour together, with the native `backgroundColor` and the window shadow's colours. The whole window may cross-fade from the finished old frame to the finished new one over `motion.theme` (180 ms, [Foundations](../design/foundations.md)). No single element transitions its own colour, so no frame mixes the two themes or shows a half-painted part. | The journey toggles the theme 10 times, in light and dark, and checks every frame |
| **The window never shows unpainted area** | On resize, maximize (the app's emulated maximize included), snap, restore, full screen, a DPI change, or a move to another monitor, the bounds change in one call, never in visible steps. The canvas always covers the window inside the shadow margin, and layout follows the new size within a frame (ResizeObserver work in `requestAnimationFrame`). Where Chromium can't repaint as fast as the operating system resizes, the edge shows the canvas colour, never white or see-through. The shadow margin is never white: on Windows the window stays layered, so letting clicks through the margin never changes its composition (D-153). | Screen-level frame-integrity journeys on CI (D-141): resize from each edge, maximize, vertical maximize, snap, full screen; the shadow margin over a magenta backdrop through pass-through, focus, show, minimize, resize, maximize, snap and a GPU crash, in software and on DirectComposition (`e2e/white-margin.spec.ts`, D-153) |
| **No flash of other fonts or shifting layout** | The bundled fonts load before the first frame (local files, `font-display: block` for the app's own faces). Pictures keep their box (the profile picture, its initials first). Late content never moves the caret or the note, setup's step, or an open confirmation: setup's column is anchored where a step of `layout.onboardingBlock` would be centred, its waits sit below the step's content, and a centred confirmation keeps its top as its content changes. | The frame-integrity journey's layout-shift check: PerformanceObserver `layout-shift` after `fn:window.firstFrame`, failing on any shift over 0.01 no input caused, in setup and the app. Setup's column is placed for its tallest usual step, so content changing height never moves what's shown, and a confirmation keeps its top where it opened |
| **Reduced motion** | Swaps are instant. With motion allowed, a swap may cross-fade over `motion.micro`, but always between two finished frames. | The dark journey again with reduced motion on: any animation or transition that runs for a time fails, and so does a frame whose main colour is in no theme (caught mid-transition) |

**The frame-integrity journey** records the window's frames through the transitions above (through the DevTools screencast, an inactive window, no screen capture, so it's safe on the owner's computer). It fails when any frame:

- has an area of at least 2% of the window that is white, see-through, or a colour outside the current theme's palette for that area;
- has the app's main region blank while a transition is in flight;
- shows a layout shift after the first frame.

Its report lists the frame, the transition and the region. It runs on every pull request that touches `apps/desktop`, `packages/ui` or `packages/ui-runtime`. The screen-level variants (window bounds and monitors) run on CI only (D-141).

## Patterns

Each pattern says when to use it, how it shows, and the measure that holds it. The signs are the shared ones from [Feedback and dialogs → Waits](../design/components/feedback-and-dialogs.md#waits), driven by the one task tracker, never a component's own spinner.

| Pattern | Use when | How it shows | Holds it |
|---|---|---|---|
| **Direct echo** | Typing, selecting, toggling, opening a menu | The control's own state, with no indicator | PRF-01 (keystroke to paint); DSY-11 (a view's first frame within 100 ms) |
| **Save state** | Writing to disk, and backing up to GitHub | The save icon on the account pill (D-132): *Saved on this computer* at once, *Backing up…* while a backup runs, then *Backed up at ⟨time⟩*; when the person asked (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>), the label opens beside the icon for about 2 s; problems stay until fixed | PRF-03; `fn:sync.push` |
| **Optimistic change** | A move, rename, delete, create or duplicate in Files | The tree changes at once with a pending sign on the row; the commit confirms it; a refusal puts it back and says why | PRF-09 (within 100 ms) |
| **Stale while updating** | A region redrawn after a change elsewhere (an external edit, a pull, a theme preview) | The old content stays, with the thin updating line past 300 ms; the new content swaps in complete | PRF-11 (within 500 ms) |
| **Double-buffered swap** | A view, a setup step, a workspace, setup to app | The next content is built off screen and swapped in one frame; scroll, focus and caret carried over | DSK-09: no blank frame in the frame-integrity journey; `fn:workspace.switch` |
| **Skeleton** | Opening a view or a list whose content takes over 300 ms | The view's real layout at once, with skeleton rows where content will be (for example, *We found your notes* shows three skeleton rows). Every placeholder is the `Skeleton` primitive: a light passes across it three times (4.5 s) and then it stands still; it never moves with reduced motion, and it's a plain GrayText shape in forced colours. Placeholders are hidden from screen readers; the words beside them (*Checking your GitHub account…*) are the one status (D-208). Known headings and labels stay; an empty or failed result replaces the placeholders. | `fn:view.open.*` |
| **Named wait** | 1 to 10 s of known work | At the place: words that name the work ("Getting a code from GitHub…", "Looking for your notes on GitHub… 12 of 30"), with the count when there is one, and the elapsed time after 3 s | The waiting-class measures |
| **Steps** | Long work, or work with several parts | The current step always visible as words ("Downloading your notes · 3 of 9"), a step list that ticks parts off (in setup, the list is shown, not hidden behind *Show details*), determinate progress where the work reports it (`git clone --progress` percent), elapsed time, [Cancel] where the work can stop, and the window usable around it | `fn:setup.*`, `fn:clone` |
| **Background task** | Work the person needn't watch (backup, fetch, publish deploy, update download) | Silent while it's going well; the account pill or trigger dot shows a problem; a result note only when the person asked for it | `fn:sync.*`; PRF-04 (idle CPU) |
| **Prefetch on intent** | The next screen's data is predictable | Start it when the intent is known (the account connected, a hover or focus on *Open another repository…*), so the click shows it at once | The prefetched step's `fn:view.open.*` from a hover |
| **First-start notice** | Start-up work past 1 s before the note is ready (a large workspace, a slow disk) | The canvas and the title bar at once, then the note's skeleton, then the note. Never a blank or white window. | PRF-02 |

## Rules for building

- **Declare the class.** A new operation that can take longer than 100 ms is added to [the wait inventory](#the-wait-inventory) in the same pull request, with its class, pattern, place, words and measure.
- **Measure it.** Mark it `fn:<area>.<action>` ([Marks and spans](performance-and-quality.md#marks-and-spans)) and give the benchmark or the journey a target.
- **Go through the tracker.** `tracker.run(target, message, fn, doneMessage)` for single waits, and the tracker's steps for long ones (a step name, `n of total`, and progress when known). One boolean `busy` for a whole screen isn't enough: it can't name the work.
- **Stream progress from the main process.** A long bridge call reports its steps and progress as events (`onReport`, `onProgress`), never just a final answer. Git runs with `--progress` where it has it, and GitHub calls report their counts.
- **Never reload the page** to change state, and never unmount a view before its replacement is ready (DSK-09).
- **Keep the window usable.** During a long wait the title bar band still drags and shows its controls, and every resize edge and corner still works. The frame captures its pointer events before a surface can stop them from bubbling. The person can leave or cancel where the work allows, and quitting resumes it where it left off (setup does, D-98).
- **Words:** name the work in plain words ("Downloading your notes", not "Cloning repository" on the main path, D-124); say the count when there is one; never apologise in a loop.
- **Accessibility:** a wait is announced after 1 s and at its end, never each tick (`wait.announceDelay`). Progress has a `ProgressBar` with its value. Reduced motion stills the moving signs.

<h2 id="the-wait-inventory">The wait inventory</h2>

Every operation that can take longer than 100 ms, with its class, pattern and words. **Status** is what's built today (16 October 2026). Rows marked *gap* are WP-5.8's to close (PRF-13). The "no silent wait" journey (`e2e/prf13-no-silent-wait.spec.ts`) slows each operation through the journeys' slow-down and checks its sign, words and elapsed time, and that the title bar band still drags; setup's rows are in it.

| Operation | Class | Pattern and place | Words on the main path | Measure | Status |
| --- | --- | --- | --- | --- | --- |
| New note in…: Create note | Responsive; waiting if disk is slow | Picker keeps its folder and input until creation finishes; named action through the task tracker, failure stays retryable | "Creating note…" | `focus-notes:newNote.create` | Built on `wp-general-fixes` (D-338); exact-head CI pending |
| New note in…: New folder | Responsive; waiting for a Git batch | Existing Files optimistic pending row; inline name retained on failure | "Creating folder…" | PRF-09 (optimistic row within 100 ms) | Built on `wp-general-fixes`; same Files batch as ordinary New folder |
| Persist an app appearance/reading setting (UI-states W2–W4) | Responsive; storage may exceed 100 ms | Control-local commit state; only the affected control/group locks, failed input remains available for Retry | Pending and confirmed each at least 200 ms; approved inline mark or compact border | Planned `fn:settings.commit`; timing not measured in W2 | Partial at `dbf53479`: writes serialize, failures report Retry, confirmed values change only after persistence. W3/W4 still add the commit lane and draft presentation; W1 must keep Retry reachable above modals. |
| Start-up | Waiting at worst | First-start notice: themed canvas, then the note | none under 1 s; the note's skeleton past 1 s | PRF-02, `fn:window.firstFrame` | Existing native first-frame handshake verified in light/dark first run at `afbd3c3c`; the window remains hidden until the themed frame report. Broader frame-integrity and slow-start variants are separate evidence. |
| Checking Git (Connect) | Responsive | Silent; shows only when missing or too old | none | `fn:setup.git` | Built |
| Getting a sign-in code | Waiting | Named wait on *Connect to GitHub* (busy button) | "Getting a code from GitHub…" | `fn:setup.code` | Built (D-149): `firstRun.signIn` through the tracker |
| Waiting for approval | Long, user-driven | The code card with GitHub's ringed mark, elapsed time, [Cancel] | "Waiting for you to approve on GitHub…" | none (the person's time) | Built: elapsed time and [Cancel] (D-149) |
| Reading the account | Responsive | The profile card's skeleton | "Connecting to your account…" | `fn:setup.account` | Built (D-149): the profile card's skeleton, `firstRun.account`; each GitHub API request times out after 10 s, showing the offline problem instead of waiting indefinitely |
| Finding your notes | Waiting | Prefetched at Connect; skeleton rows; count | "Looking for your notes on GitHub… 12 of 30" | `fn:setup.findNotes` | Built (D-149): prefetched at Connect, three skeleton rows, the 30 most recent checked six at a time and counted |
| Creating your notes | Long | Steps, always shown, current one named, elapsed time | "Copying the template · 2 of 9" | `fn:setup.create` and each part | Built (D-149): parts always shown in plain words, the current one with its number and elapsed time; *Download to this computer* with Git's percentage and a `ProgressBar` |
| Downloading your notes (clone) | Long | Steps with determinate progress from `git clone --progress` | "Downloading your notes · 45%" | `fn:clone` | Built (D-149): the parts (Download · Get the private notes · Link them) shown and ticked, the current one in words, Git's percentage on a `ProgressBar` |
| Opening a folder | Responsive | Named wait if past 1 s | "Checking this folder…" | `fn:setup.folder` | Built (D-149): `firstRun.folder`, in the journey (the system's dialog stubbed) |
| Finishing setup, opening another workspace | Responsive to waiting | Double-buffered swap, in place | "Opening your notes…" past 1 s | `fn:workspace.switch` (≤ 500 ms typical) | Built: in place (D-148), "Opening your notes…" through the tracker (D-149) |
| Removing the workspace, signing out | Responsive | In place, then *Your notes* or *Connect* | "Removing…", "Signing out…" | `fn:workspace.remove`, `fn:auth.signOut` | Built (D-149): in place (D-148); each button says "Removing…" or "Signing out…" with its seconds, through the tracker (`workspace.remove`, `account.signOut`) |
| Checking the notes folder at start ([Where your notes live](../experience/notes-folder.md#waits), D-212) | Instant | None: one `stat` of the recorded folder before Git or the watcher starts | none | `fn:workspace.check` | Planned (WP-5.14) |
| Checking the account for recovery | Responsive | A skeleton in the *Download your notes again* card's line; 10 s at most, then the offline problem | "Checking your GitHub account…" past 1 s | `fn:recover.account` | Planned (WP-5.14) |
| Downloading your notes again (recovery) | Long | Setup's *Opening* parts, with Git's percentage on a `ProgressBar` | "Downloading your notes · 45%" | `fn:clone` | Planned (WP-5.14) |
| Syncing a folder that isn't connected (*Sync now*, D-213) | Long | Steps in the alert's card, the turning ring on the icon; writing stays open | "Syncing your notes · 2 of 5" | `fn:workspace.connect` | Planned (WP-5.14) |
| Moving the notes folder (*Move…*, D-214) | Long | The count and percentage in Settings → Workspace, with *Cancel* until the switch | "Moving your notes · 120 of 480" | `fn:workspace.move` | Planned (WP-5.15) |
| Getting a note from another service (an online-only file, D-215) | Waiting | The note's skeleton, with a name | "Getting this note from OneDrive…" | `fn:note.hydrate` | Planned (WP-5.15) |
| Opening a note | Instant to responsive | Direct, the region-updating line past 300 ms | none | PRF-03, PRF-10 | Built |
| Matching crash drafts at launch ([Crash recovery](crash-recovery.md), QLT-06, D-222) | Instant typically, waiting at worst; off the first frame | Background task: the first note opens and takes typing at once; what the drafts hold comes back after, into the open note as unsaved edits (one undo from the disk's text) or waiting for its note, with one calm toast | "Restored what you were writing in “⟨title⟩”.", or the changed and kept words ([Feedback and dialogs](../design/components/feedback-and-dialogs.md#save-and-sync-status)) | `fn:recovery.match` (`QLT-06.recoveryMatchMs`, budget 30 ms with 20 drafts in 10,000 notes: 10.7 ms; a note moved or deleted outside the app makes it read the workspace, `QLT-06.recoveryMatchMovedMs` about 3.4 s, reported) | Built (WP-8.9): typing in the open note before the answer is saved first, then compared (D-220) |
| Writing to disk | Responsive, background | Save state: *Saved on this computer* | none | PRF-03 | Built (D-132) |
| Backing up to GitHub (*Save to cloud*, <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, and automatic backups) | Waiting to long when asked, background otherwise | Save state on the account pill; past 3 s, the open label adds the elapsed time | "Backing up…", then "Backed up" | `fn:sync.commit`, `fn:sync.push` | Built (D-132, D-133); elapsed time to add |
| Backing up one repository (a Files section's *Back up to GitHub*, D-191) | Waiting | The section's backup icon on its heading, and its card: *Backing up…* with the turning ring, *Backing up your changes to GitHub* in the card; then *Backed up at ⟨time⟩* and a polite announcement; a problem toasts | "Backing up…", then "Public notes backed up" | `focus-notes:repoBackup.private`, `focus-notes:repoBackup.public` | Built (WP-8.10) |
| Fetch and pull | Background | Silent; open notes reload in place | none, unless a problem | `fn:sync.pull` | Built |
| Sending feedback (Send feedback's *Send*, D-203) | Waiting | In place: the *Send* button is busy, the fields read-only; past 3 s its words add the seconds. Then the dialog's *Feedback sent* card, or a danger row with *Try again*. Closed meanwhile, a toast says how it went | "Sending…", then "Feedback sent as issue #N." | `focus-notes:feedback.send` | Built (WP-5.12): through the tracker; the request times out after 10 s like every GitHub API request, which shows *Couldn't reach GitHub* |
| The menu in text (right-click, Windows: the OS spell checker's first answer, D-204) | Instant | The menu opens at the pointer within a frame with the edit actions and a *Checking spelling…* row; the suggestions fill in when the OS answers (about 300 ms the first time) | "Checking spelling…" | `textMenu:open` then its update (FRAME_MS) | Built (WP-5.13); the macOS system menu waits for the answer, as before (D-193) |
| Structural changes in Files | Responsive | Optimistic change with pending rows | none | PRF-09 | Built |
| Copy in Files (files onto the system's clipboard, D-192) | Responsive | Through the tracker on the row menu's item; a toast when done | "Copying…" past 300 ms, then "Copied “⟨title⟩”." | the tracker's marks (`files.copyItem`) | Built: Windows starts PowerShell (about 0.3 to 0.8 s), macOS `osascript`; not yet in the "no silent wait" journey |
| Import files (reading the picked files, D-210) | Waiting | Through the tracker on the row menu's item, after the dialog closes; then the new rows show at once with the saving sign | "Importing…" past 300 ms, then "Imported ⟨n⟩ notes into “⟨folder⟩”." | the tracker's marks (`files.import`) | Built: Word documents take longest (mammoth, about 50 ms per page) |
| Print (laying the note out for paper, D-230) | Responsive | Through the tracker on ⋯'s item, until the system's print dialog opens; the screen never changes, since the paper layout shows only to the printer. A problem toasts | "Preparing to print…" past 300 ms | `focus-notes:note.print` | Built (WP-8.12): the layout is one frame; the dialog itself is the system's |
| Opening from GitHub (the picker) | Waiting, then long | Skeleton list prefetched on hover, then steps to download | "Looking for your repositories…", then as cloning | `fn:view.open.repoPicker`, `fn:clone` | Built (D-149): asked when Settings → Workspace opens (on intent, used within 30 s), three skeleton rows with Back and Esc, then Open's parts. Prefetch on hover waits for hover events in view documents |
| Spotlight before the index is ready | Waiting | Results from titles at once; a quiet count while the rest is indexed | "Still reading 1,200 of 5,000 notes" | SPT-07, PRF-10 | Partial: no count |
| Find in all notes | Responsive | Results stream in, first within 300 ms | none | FND-04 | Built |
| Note history (reading versions) | Responsive; waiting for a long history | Two approved row skeletons after 300 ms, held for at least 500 ms once visible, including failure; refresh keeps old versions. Three shimmer passes then still; reduced motion is static. Inline list failure offers Retry; late replies cannot overwrite a reopened sheet | "Reading versions…", "Reading older versions…", "Reading that version…" | `focus-notes:history.load`; fake-clock section minimums and history generation/retention units | Built on `vq-ui-states` (D8); individual version reads/restores remain separate |
| Settings → Agents | Responsive | Two approved row skeletons on a first load after 300 ms, held for 500 ms; refresh keeps the page. Three passes then still; inline Retry on failure. Shared task tracker supplies the one delayed wait announcement | "Reading agent settings…" | `focus-notes:agents.load`; timed units and the section-loading UI-states journey | Built on `vq-ui-states` (D8); navigation and existing content stay usable |
| Preparing item sharing | Responsive | One approved row skeleton after 300 ms, held for 500 ms; existing grants remain visible and editable choices are retained. Failed load offers section-local Retry, without recreating a share or discarding the draft | "Preparing sharing…" | `focus-notes:share.item.prepare`; timed failure and retained-draft Retry unit | Built on `vq-ui-states` (D8); no real account/network write in validation |
| Unlocking, exporting, importing, resolving a conflict | Waiting | Named wait through the tracker | "Unlocking…", "Exporting…", "Importing…" | the tracker's marks | Built (D-77) |
| Sealing and sharing | Waiting | Busy button through the tracker | "Sharing…" | `fn:share.seal` | Gap: check every share action |
| Publishing (the deploy on GitHub) | Long, remote, background | The note's public state with *Publishing…* and a link to the run; done when the page answers | "Publishing… usually about a minute" | PRF-06 | Partial |
| Report a problem | Responsive | Busy button | "Preparing the report…" | `fn:diagnostics.report` | Built (D-140) |
| Downloading an update | Long, background | The update note's progress | "Downloading the update · 40%" | none | Planned (DSK-07) |

## Where it stands

### Rewrite waits

The waits of [Rewrite with AI](../experience/rewrite-with-ai.md) and [Settings → AI](../experience/ai-settings.md), as built on 31 October (D-256, D-257; PRF-15). The main process's `fn:ai.*` spans are recorded and were measured once against the owner's local Ollama; the window's `fn:rewrite.lock`, `.firstText`, `.render` and `.stream` spans are recorded (`packages/editor/src/rewrite-stream.ts`) with no budget yet, and no real-service latency is ever a promise, since it depends on the service the person chose. None of these waits is a model starting: Focus Notes runs no model.

| Operation | Class | Pattern and place | Words on the main path | Measure | Status |
| --- | --- | --- | --- | --- | --- |
| Open the Rewrite popover | Instant | The non-modal popover opens beside the captured selection with the prompt focused; selected text remains visible and the document scrollable; settings load behind it | (the popover; no first-send disclaimer) | `fn:rewrite.open`, ≤ 100 ms | Built (D-265/D-266, WP-AI.14); targeted journey passes; open latency not measured in this slice |
| Scroll/resize with Rewrite prompt open | Instant / direct manipulation | Keep one x/side/fragment, transform y in the rendering frame; resize measures constrained content even while edge-collapsed. Cross either edge into one directional return button, retaining mounted prompt. Return rounds fractional scroll toward usable room; token fade and smooth scrolling disabled with reduced motion. At very short heights the complete existing prompt scrolls to keep controls reachable | Return to selection above / below; no status for ordinary frame-attached movement | `fn:rewrite.anchor` (schedule → applied placement), first RAF | Approved exact d40b78a3 at 19:59. Current normal/480 x 360 light/dark and reduced-motion journey passes; applied-placement maxima 13.90/18.50 ms, not paint or next-frame wall-clock proof. See current gate evidence |
| Deselect with a prompt | Instant | Empty draft dismisses; non-empty draft opens existing confirmation, retaining exact input and captured range until choice; no network or save wait | “Discard prompt?” · “Deselecting this text will lose your written prompt.” · Keep editing / Discard prompt | `fn:rewrite.deselect`, ≤ 100 ms to dismissal or confirmation, including the scheduled RAF | Built; state units and repeated Escape/Keep editing/Discard journey branches pass. Asserted ≤ 100 ms; maxima light 18.50 ms, dark 17.90 ms |
| Choose Rewrite integration | Responsive (device-local settings write) | Task tracker target `rewrite.writer`, delayed sign under the integration picker; old card and prompt remain; Generate waits for persistence; success announces the new Writer, failure toasts the reason without changing it | "Remembering your choice…" → "Choice remembered."; announces "{name} is now the Writer." | `fn:ai.chooseWriter` (choice → saved settings applied), plus `focus-notes:rewrite.writer` from the tracker | Built feedback slice (D-262); targeted units and one/two-connection light/dark journey captures |
| Choose Settings default | Responsive, existing device-local write | Existing `settings.writer` tracker and mounted off-layout progress; the saved row's border becomes dashed after `wait.signDelay`, with no geometry/content change; pending choices retain native focus and saved check state. No app reload/remount or list-height churn | Remembering your choice… announced; pending border paint, success announced, necessary failure shown | Existing `fn:ai.chooseWriter`; no new timing measurement | 17:29 revision, permitted build/types/ui:check and normal synthetic UI; suites and UX/UI verdict pending |
| Generate → the note locks | Instant | The prompt closes; no first-send confirmation; the selection shimmers; the note is read-only and `aria-busy`, and typing, paste, drop, commands and undo change nothing | (announced below) | `fn:rewrite.lock` | Lock and direct first send built (D-266); fake-service journeys pass through lock assertions |
| Generate → first words | Waiting to long (the answer must start within 30 s, or 120 s from a server on this computer loading its model) | The selection shimmers in place and the note is read-only; a toast names the Writer and offers **Stop**; announced once | "Rewriting with {name}… Press Esc to stop." · "Rewriting the selection. The note is locked until it's done." | `fn:rewrite.firstText` (Generate → first glyph painted); in main, `fn:ai.firstToken` (request sent → the service's first words) | `fn:ai.firstToken` measured: 58 ms from the owner's Ollama with a loaded 12B model (31 October); `fn:rewrite.firstText` not measured |
| Streaming | Long, the person watching (quiet for at most 30 s, or 60 s on this computer; 5 minutes in all, 10 on this computer) | The answer grows in place in the rainbow, formatted as Markdown as it comes (open syntax closed for display only), rendered at most once a frame and redrawing only the blocks that changed; nothing is saved until it ends; the same toast and **Stop**; no per-piece announcements, no fake percentage | (the text itself) | `fn:rewrite.render` (each render, within a frame), `fn:rewrite.stream` (Generate → finish or stop); in main, `fn:ai.stream` (request sent → last piece); the window stays responsive | `fn:ai.stream` measured: 231 ms for a one-sentence rewrite from the same Ollama; `fn:rewrite.stream` not measured |
| Finish | Instant | One undo step; the rainbow holds 1 s and fades over 3 s; announced | "Rewrite finished. Ctrl+Z puts the original back." | `fn:rewrite.finish` | Built; not measured |
| Stop (Esc or **Stop**) | Instant | The original back and the note unlocked at once; the request aborted in main | "Rewrite stopped. The original text is back." | `fn:rewrite.stop`, ≤ 100 ms; late pieces ignored | Built; main closes the request within 1 ms of Stop against the real Ollama |
| Rewrite error | Instant | The original back; an error toast with the reason | e.g. "The service took too long to answer. Try again." | none | Built |
| Test connection | Waiting (up to 20 s; 90 s for a server on this computer, which may be loading its model) | The row's Test line says "Testing…" and the button can't start a second test; the rest of Settings stays usable | "Testing…" → "Checked {time}: it answered." | `fn:ai.test` (in main: request → answer) | Measured: 379 ms against the owner's Ollama, model loaded (31 October) |
| Find on this computer | Responsive for loopback probes (800 ms / 1.5 s); waiting for supported CLI auth (5 s failure bound, plus bounded owned-runtime shutdown) | The section's named discovery status; earlier results stay and other Settings controls remain usable; one completion announcement | Looking for available integrations → found connections or a clear CLI sign-in/version/retry reason; no hidden generation | `fn:ai.discover` (combined discovery), `fn:ai.cliDiscover` (CLI only) | Loopback-only measured 12 ms on 31 October; D-264 CLI auth proven, no latency budget claim |
| Copilot Generate → first words and stream | Waiting to long: first answer 30 s, idle 30 s, total 5 min including CLI startup | Existing in-place shimmer, read-only selection and named Rewrite toast with **Stop**; no blank frame, no input loss, exact original restoration on error | "Rewriting with {name}… Press Esc to stop." | `fn:ai.firstToken`, `fn:ai.stream` and existing editor spans | D-264 one dummy rewrite: 5,395 ms including startup, three deltas, zero offered tools; not a benchmark |
| Copilot Stop / runtime shutdown | Original restored instantly; SDK abort bounded to 1 s before owned-process termination; normal shutdown bounded to 3 s | Existing Stop feedback; owned CLI cleanup stays in main, late pieces ignored | "Rewrite stopped. The original text is back." | `fn:rewrite.stop`; stdio contract verifies abort acknowledgement and process exit | Dummy live abort acknowledged before text; no owner process terminated |
| Find models | Waiting (up to 8 s to answer, 10 s at most) | The model status line under the field; the earlier list stays | "Finding available models…" → "12 models available." | `fn:ai.models` (in main) | Built; recorded, not yet measured live |
| Save connection | Responsive | **Save connection** is busy; the form stays until saved | "Saving connection…" → "Connection saved. Test it to check it answers." | `fn:ai.save` | Built; not measured |

Rewrite's long wait doesn't use the task tracker's busy state: the shimmer at the selection and the toast are its sign, and **Stop** is always there. Switching or closing the note, or recovered text replacing it, mid-rewrite stops the request in main and clears the toast (RWR-86). The main process records `fn:ai.firstToken`, `fn:ai.stream`, `fn:ai.test`, `fn:ai.models` and `fn:ai.discover` with `performance.measure`; the contract tests check they're recorded, and the opt-in live test (`FOCUS_NOTES_LIVE_AI=1`, `apps/desktop/test/ai-ollama.live.test.ts`) prints them against a real local Ollama. A real service's latency is never a promise.

**Built:**
- the task tracker, its timing tokens and the busy states (WP-1.4, D-77);
- the optimistic structural changes (PRF-09);
- the one cached Git status that no view waits for (PRF-07);
- the save state on the account pill (D-132);
- the snapshot and warm-up behind fast reopening (PRF-10).

**Still to come:**
- **WP-5.9 (PRF-14, D-151):** a window that follows the hand. It's the most felt, and it goes first.
- **WP-5.8 (DSK-09, PRF-13, D-148, D-149):** the gaps in [the inventory](#the-wait-inventory) and the [glitch-free window rules](#glitch-free-windows-and-views), before the first public release. Setup comes first in it, because it's the first thing a new person sees, and finishing setup currently flashes the window white.

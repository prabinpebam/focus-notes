# Rewrite acceptance

> [!NOTE]
> **TL;DR.** Draft implementation acceptance, not test results. Every new [rewrite requirement](../product/requirements.md#rewrite-with-ai-rwr) has a Given/When/Then row, validation tier and planned test name. The first demonstration uses only the fake provider. Real transport waits for [WP-AI.7](implementation-plan.md#mai); no test here authorizes live calls, credentials or spending.

## What people expect

| Expectation | Source | Observable consequence |
| --- | --- | --- |
| Try a suggestion without losing the original | Owner request, 2026-10-30; CP-RWR-01 | Stop, Discard, undo and restart retain the original. |
| Choose what may leave the device | PRV-01; D-236, D-238 | No provider by default, named consent before egress, no fallback. |
| Keep familiar editing and version control | EDT-08, EDT-10; D-235, D-237 | Outside bytes unchanged, link key migration explicit, normal Git history untouched. |

## How to read the matrix

Tiers: **unit** isolates mapping/state/policy, **fixture** drives scripted adapter/storage failures without network, **journey** uses the actual app against fixtures, **review** is a scripted human check (themes, screen reader, owner approval). File/test names below are planned, not existing tests. Each row is pending until its builder records the exact command, result, commit and evidence link in its delivery record; no blank row means no unassigned acceptance.

An owning early slice closes only delivered subcases, not a full cross-cutting row. UI-14/I18N-04 file/setup cases await AI.5/AI.6; A11Y-03/DSY-14 full surfaces await the same; SEC-09/PRV-05 actual history awaits AI.4 and approved transport AI.8. Keep these cases pending, then AI.9 records combined closure as specified in the [slice evidence split](implementation-plan.md#slice-evidence-versus-full-requirement-closure). Requirement ownership does not move or duplicate.

## UX

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-01 | Selection, collapsed caret, read-only/conflict/unsupported/oversize/private/busy/offline and missing-profile fixtures | Invoke each menu, key and Spotlight entry | Same eligible target opens; each ineligible case explains why; no unintended send | journey | `rewrite-entry.spec.ts: entry-and-enablement-matrix` |
| RWR-02 | Selection near every edge at default and 480 x 360 | Open, type, Tab, Enter/Shift+Enter/Escape with and without IME | Prompt remains inside window, keys act as specified and focus returns to target | journey | `rewrite-prompt.spec.ts: geometry-keys-focus` |
| RWR-03 | Each named preset and a 4,000-point custom instruction | Inspect generated instruction, translate without/with language | Templates match versioned fixtures; language is required and oversized instructions are blocked | unit | `rewrite-presets.test.ts: exact-instructions` |
| RWR-04 | 20 saved presets, no history opt-in, export destination chosen | Add, rename, delete, export, restart, dismiss prompt | Limits enforced; export warns/includes only selected presets; no prompt/preset in Git or logs | fixture | `rewrite-presets.test.ts: local-limits-export-retention` |
| RWR-05 | Six scripted lifecycle states and a slow stream | Stop/Escape, retry, switch note or close | Legal transitions only; original restored on interruption, outside edits preserved, old events ignored | journey | `rewrite-lifecycle.spec.ts: transitions-stop-and-leave` |
| RWR-06 | Two completed variations and a checkpoint with outside edits | Previous/next, Accept, Discard, Try again, Edit prompt, undo/redo | Controls select the intended result; one undo step/result or restore; no implied cloud save | journey | `rewrite-review.spec.ts: review-actions-and-undo` |
| RWR-07 | Whole Markdown file, near/over size limit | Open chooser and start a long fixture | New file default and destination shown; oversize blocked before send; Stop/progress honest, no partial apply | journey | `rewrite-files.spec.ts: target-choice-and-size` |
| RWR-08 | Every theme, effect setting, reduced motion and forced colors | Complete result and advance fake time through hold/fade | 1.5 s hold/2.5 s fade, at least 4.5:1 every frame; no persistence/clipboard styling; review signal remains | unit, review | `rewrite-fresh-text.test.ts: timed-decoration-contrast` |
| RWR-09 | No provider, configured profile and every error fixture | Open setup/settings, change values, fail a send | No implicit enablement; named status/repair copy preserves prompt; controls use message keys | journey | `rewrite-settings.spec.ts: setup-status-and-errors` |

## Engine

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-21 | Partial/multiple blocks, collapsed caret, list/task/table/cell/heading/code/quote/link/image/raw syntax corpus | Capture selection or resolve current block | Exact splice or visibly confirmed top-level expansion; caret highlights/labels current block before Send; unsupported cases refuse, no hidden context/front matter | unit | `rewrite-mapping.test.ts: source-shape-corpus` |
| RWR-22 | BOM/CRLF/Unicode/front-matter/raw-block corpus, hashes and independent prefix/suffix edits | Accept a result, then drift the target or reuse its path | Current outside bytes identical, front matter untouched; exact target mismatch refuses; no whole-file canonicalization | unit | `rewrite-mapping.test.ts: outside-byte-identity` |
| RWR-23 | Dirty canonical note, review projection, outside typing and storage faults | Autosave/commit/sync; leave/switch/quit, crash before/after checkpoint acknowledgement or overrun 5 s flush | Canonical checkpoint durable before send; no preview in workspace/remote/drafts; Discard preserves outside edits/complete history; failed flush keeps window open | fixture, journey | `rewrite-save-lane.test.ts: checkpoint-and-review-hold`; `rewrite-close.spec.ts: flush-discard-and-timeout` |
| RWR-24 | Protected range, structural edits before/after, multi-step formatting and IME | Apply paired StepMaps, cross range, change preview, Stop then Accept another result | Crossing edit refused with reason; canonical/projection maps preserve typing; no preview undo events; Accept one event without merging unrelated typing | unit | `rewrite-range.test.ts: concurrent-transaction-mapping` |
| RWR-25 | Wrong frame/window/workspace/lease, duplicate/late sequence, oversized batches and stalled consumer | Prepare/start/abort and race terminal events | Main revalidates source/route; unauthorized/stale events rejected, queue capped 64 KiB, consumer stall 5 s aborts and no secret in events | fixture | `rewrite-ipc.test.ts: authorization-order-and-abort` |
| RWR-26 | Fake clock at deadline minus/equal/plus 1 ms and every error fixture | Cross connect 5 s, headers 15 s, first text 60 s, idle 20 s, request 180 s, file 600 s; send only heartbeat | Earliest deadline wins, heartbeat does not reset text timers; exactly one matching terminal, task/lease released, no hidden retry | unit | `rewrite-timeouts.test.ts: deadlines-and-error-taxonomy` |
| RWR-27 | Injection, active HTML, malformed/huge output, refusal and ordinary Markdown fixtures | Frame request and validate response | Text treated as data, no tool/fetch, unsupported output rejected; ordinary links/images retained | fixture | `rewrite-output.test.ts: untrusted-markdown-and-refusal` |
| RWR-28 | Dirty canonical buffer distinct from diskExpected; other-window, sync, rename/delete/path-reuse races | Same file then Accept before/after each writer guard | Checkpoint captures dirty source; afterWrites/lease/expected bytes protect disk; deletion is not recreated, losing content recoverable through resolver | journey | `rewrite-files.spec.ts: dirty-window-and-disk-races` |
| RWR-29 | Private/public source with metadata/relative links and colliding rewrite names | Accept New file, including injected create failure | Atomic free sibling, fresh ID, metadata/link semantics preserved, no inbound retarget/private-to-public move; failure keeps result | fixture | `rewrite-new-file.test.ts: atomic-name-id-visibility` |

## Providers

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-41 | No profile, safeStorage available/unavailable and mocked key | Save/reload/export configuration | Disabled until explicit setup; references only in settings; no secret in Git/log/export; unavailable encryption refuses persistence | fixture | `rewrite-profile.test.ts: credential-reference-boundary` |
| RWR-42 | Exact numeric loopback, LAN, DNS-rebinding/metadata/public route, proxy and redirect fixtures | Resolve/pin/connect each route and inspect CSP | Only reviewed exact route; LAN denied in v1, no redirect/fallback/implicit local proxy, renderer CSP unchanged; no model/runtime/process install or launch path | fixture, review | `rewrite-egress.test.ts: routing-allowlist-no-fallback` |
| RWR-43 | Public/private/shared read-only/editable targets across consent states | Send, change model/endpoint/policy, revoke | Complete policy matrix matches named scope; private remote prompts every time; changes invalidate consent; read-only blocked | fixture | `rewrite-policy.test.ts: consent-private-share-matrix` |
| RWR-44 | Exact boundary minus/equal/plus 1: 32 KiB/8,000 selection, 128 KiB/32,000 file, four chunks, 4,096 output, 10/minute, 100/day, USD 0.10/1.00 | Reserve before send; confirm above 4,000 input/one chunk/USD 0.02; crash, rollback clock, stale/unknown pricing and retry | Aggregate bounds hold, unsupported token/charge bound blocks cloud; no partial apply, optimistic refund, profile-reset bypass or automatic billable retry | unit | `rewrite-limits.test.ts: cost-size-day-boundaries` |
| RWR-45 | Fake scripts success/slow/stall/all errors/malformed/huge/injection/endpoint unavailable | Run offline contract suite and review future source/dependencies | Deterministic zero-network/credential fixtures; unavailable external service offers repair, never install/download/launch/fallback; method guidance only, no scaffold/kit/runtime/model/Python setup | fixture, review | `rewrite-provider-contract.test.ts: offline-script-catalogue` |
| RWR-46 | No owner approval, then approved/revoked gate fixture | Enable real transport or ship changed claims | No send before approved gate; exact approval scope recorded; revoke blocks new sends, local writing survives | fixture, review | `rewrite-rollout.test.ts: owner-gate-and-revocation` |
| RWR-47 | Offline/auth/rate/timeout/provider failures with edited instruction | Fail, reconnect, explicitly retry | Specific repair, original/prompt retained; reconnect never sends queued text; no empty-success fallback | journey | `rewrite-errors.spec.ts: failure-repair-and-offline` |
| RWR-48 | Current browser build and desktop fixture build | Search commands/settings/Help | Browser has no rewrite/key setup; desktop-only scope and future security prerequisites explicit | journey, review | `rewrite-platform.spec.ts: browser-boundary` |

## History

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-61 | Hostile Git config/hooks/alternates/signing env, SHA-1/SHA-256 stores and two window writers | Inspect exact refs/messages/trees; race update-ref CAS, inject each plumbing fault, mirror-push workspace | Sanitized no-remote store only; immutable neutral chain, no stale CAS lost update; failed checkpoint blocks send; no variation objects at mirror destination | fixture | `rewrite-history.test.ts: isolated-commits-and-mirror` |
| RWR-62 | Accepted rewrite and ordinary branch history | Undo, redo, Try again and save | New ordinary content states, no amend/reset/rebase/force push; earlier history immutable | fixture | `rewrite-history.test.ts: undo-new-states` |
| RWR-63 | Resolved/unresolved sessions and interrupted stream | Restart, open earlier-session picker and restore | No partial result restored as final; original/completed versions available, no launch writes or auto-accept | journey | `rewrite-restart.spec.ts: recover-and-restore` |
| RWR-64 | 20/21 variations/note, 29/31-day age, 100 MiB/domain and 200 MiB/workspace including encrypted/Git overhead | Prune/restart with active chain and only recovery original | Delete oldest inactive whole-session refs only; protected original remains, over-cap blocks; no middle-chain/normal-history rewrite or secure-erasure claim | fixture | `rewrite-retention.test.ts: cap-and-unresolved-original` |
| RWR-65 | Non-Git/unborn folders and app-supported Git absent | Rewrite, compare, restart, undo and inspect note folder | App-local bare history only; folder not initialized/committed; Git absence explicitly blocks generation without download or hidden storage fallback | fixture | `rewrite-history.test.ts: non-git-unborn` |
| RWR-66 | Distinct public/private stores, sentinel secret text/metadata, encryption unavailable/key loss | Generate, inspect encrypted blobs/index/temp, sync private-first, mirror-push/export, recover | No plaintext private content/metadata in public/normal logs; unavailable encryption blocks private rewrite; key loss does not destroy ciphertext; no erasure promise | fixture | `rewrite-history.test.ts: private-object-isolation` |

## Cross-cutting

One table per existing requirement area keeps ownership visible. EDT-13 already belongs to WP-1.2; its linked key migration is delivered and tested by KEY-08 without duplicating ownership.

### Keyboard

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| KEY-08 | Editor/table/Spotlight scopes, IME and custom-binding fixtures | Press Mod+K and Mod+Shift+J; inspect all key hints and restart | Rewrite/link/scoped Spotlight agree with registry; one-time hint once; IME/custom bindings retain precedence | journey | `rewrite-keys.spec.ts: scope-and-link-migration` |
| EDT-13 (amended key only) | Existing link create/edit/hover cases | Invoke moved binding and pointer actions after feature enablement | Existing link behavior preserved; key assertions updated, not removed | journey | `m1-formatting.spec.ts: migrated-link-edit` |

### Spotlight

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| SPT-09 | Selection/file captured before Spotlight | Run each rewrite result or Spotlight Mod+K | Original target retained, effective key/reason shown; Spotlight action key never rewrites | journey | `rewrite-spotlight.spec.ts: captured-target` |

### Files

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| FIL-16 | Markdown, binary, non-Markdown and multiple file selection | Pointer/Menu/Shift+F10 rewrite and choose target | Whole body for one eligible file only; exact reasons and privacy/dirty/collision guards | journey | `rewrite-files.spec.ts: file-menu-eligibility` |

### Editor

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| EDT-15 | Corpus and pending guarded writes | Rewrite/apply/undo while write acknowledgement settles | Byte-safe serialization, one undo step, original save ordering preserved | unit, fixture | `rewrite-save-lane.test.ts: guarded-roundtrip` |

### UI

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| UI-14 | Every new view document and lifecycle/error state | Validate and mount/close through renderer | Contracts/message references valid, no forbidden markup/style/string, no blank transition and focus returns | unit, journey | `rewrite-views.test.ts: data-contracts` |

### Focus

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| FOC-07 | D-232 paragraph band, selection/caret/spelling marks | Stream/fade fresh text and move between paragraphs | Band unchanged; all editing marks readable, no persisted focus/fresh style | journey, review | `rewrite-focus.spec.ts: decoration-priority` |

### Help

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| HLP-10 | Feature disabled/enabled and each error Help link | Open Help from app and follow setup/recovery/key articles | Version/scope accurate, stable IDs resolve, unpublished feature never advertised as shipped | review, journey | `rewrite-help.spec.ts: feature-gated-articles` |

### Privacy

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| PRV-05 | Sentinel prompts/output/private notes with enabled fixture logging | Rewrite, export, restart, sync and inspect stores/logs | Only documented isolated stores contain permitted data; no telemetry or public/Git prompt leakage | fixture | `rewrite-privacy.test.ts: sentinel-data-inventory` |

### Security

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| SEC-09 | Malicious IPC, URL/redirect/DNS, note and output fixtures | Run the security checklist below | Unauthorized egress/keys/tools/active content/private-object exposure denied and reported | fixture, review | `rewrite-security.test.ts: threat-boundary-matrix` |

### Performance

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| PRF-15 | Approved rollout fixture and reference hardware | Measure open/first-token/Stop while typing | Acknowledgement/Stop within 100 ms, fixture first-token p95 under 1 s; real 5 s target measured separately; no frozen input/reload | fixture | `rewrite-performance.test.ts: response-and-stop-budgets` |

### Quality

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| QLT-08 | Script catalogue, lifecycle crash points and corpus | Run Windows fixture journeys with FOCUS_NOTES_E2E=1 and cleanup | All matrix cases covered without live calls/keys/focus theft; no test app left open | journey | `rewrite-gate.spec.ts: offline-safety-matrix` |

### Accessibility

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| A11Y-03 | 480 x 360, screen reader, motion/contrast contexts | Complete selection/file/setup/review solely by keyboard | Names/focus correct, stage announcements at most once/2 s, no token chatter, contrast at least 4.5:1 | journey, review | `rewrite-a11y.spec.ts: keyboard-and-announcements` |

### Internationalization

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| I18N-04 | All rewrite messages and 30% expanded pseudo-locale | Render every state and preset | No literal/concatenated copy, correct plurals and no clipped action at minimum size | unit, journey | `rewrite-copy.test.ts: message-completeness-and-expansion` |

### Design system

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| DSY-14 | Gallery states across light/dark/contrast themes | Validate tokens/contracts and score screenshots | All states covered, tokens only, VVS at least 70/80 setup, no criterion below 10 | review, unit | `rewrite-gallery.test.ts: theme-state-contract` |

### Documentation

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| DOC-03 | Registers, six pages and operation-contract provenance | Run chain/plan/Slate checks and inspect coverage | Every requirement maps to one package/row and kit source/offline proof; drafts never claim built | review | `rewrite-spec-coverage: registers-and-kit` |

### Licensing

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| LIC-03 | Future external-API dependency proposal and pinned research provenance | Review licences/notices and source/dependency/process boundaries | Permissive approved artefacts only, no paid Content AI, scaffold/kit/provider/runtime install or app-managed model process; specification-only task performs no Python/model setup | review | `rewrite-license-review: dependency-policy` |

## Test plan and security checklist

1. Unit corpus: exact splice/expanded-target/refusal paths, CRLF/Unicode/front-matter bytes, every supported block, one-step undo and every error/deadline/cap boundary.
2. Fake adapter: deterministic success, slow chunks, connect stall, idle stall, total timeout, every error code, malformed/huge output, refusals and instruction-in-note attacks. No sockets or real credentials.
3. Fixture storage: checkpoint write/ack failure, crash in each state, review leave, disk/rename/sync race, multiple dirty windows, collisions, unborn/non-Git folders, cap eviction and mirror-push sentinel inspection.
4. Windows journeys: selection and file entry, key migration, prompt/presets, review/variation/restart, private consent and repair; use FOCUS_NOTES_E2E=1, never CI-only screen permission locally, and always close test apps.
5. Review: default and 480 x 360, light/dark/contrast, forced colors, reduced motion, screen reader, VVS and all-frame 4.5:1 contrast. Fake first-token performance is not live-provider evidence.

| Security review item | Required proof before real enablement |
| --- | --- |
| Egress | Allowlist, normalized endpoint, credentials-in-URL rejection, redirect/DNS-change handling, no fallback or output-triggered fetch |
| Credentials | safeStorage failure explicit; references only in profiles; no keys in renderer, logs, Git, crash metadata or exports |
| IPC | Operation authorization, payload/size validation, sender/workspace scope, cancellation and late-event rejection |
| Privacy | Private/shared policy matrix; no prompts in commits; isolated private stores and mirror-push object/sentinel inspection |
| Injection | Content framed as data, no tools, supported Markdown only, refusal/malformed/HTML/huge-output scripts |
| Save/recovery | Durable original before token, review save hold, exact guards, no autosaved partial output, restart never writes notes |
| Cost/rollout | Owner approvals, cap boundary tests, no hidden retries, versioned Store/privacy claim review, disable-new-sends rollback |

## Stage gate

GATE-MAI is **planned**. Offline acceptance can validate fake-first packages without choosing a provider. WP-AI.7 requires the owner to approve D-236, D-238 and D-239 and the destination/auth/retention/Store/privacy scope; no writer or fixture can supply that approval.

| Gate | Observable condition | Evidence owner |
| --- | --- | --- |
| Offline UX | MAI.1 to MAI.6 demonstrable with fake provider and zero egress | Builder and design/accessibility reviewers |
| Real enablement | Named approval record exists, consent/cap/private policy enforced, security review approved | Owner and security reviewer |
| Release | All [MAI done rows](definition-of-done.md#mai-rewrite-definition-of-done), required Windows CI, Help/claims and rollback evidence complete | Verifier, then owner |

## Decisions

D-233 to D-244 register the foundation; S2/S3 refine engine/storage/UI contracts in their allocated decisions. See [decisions](decisions.md#rewrite-with-ai-decisions-30-october-2026). Every test above is **planned**, not passed.

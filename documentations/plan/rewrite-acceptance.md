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
| RWR-21 | Partial/multiple blocks, list/task/table/cell/heading/code/quote/link/image/raw syntax corpus | Capture selection and serialize target | Exact source splice or explicitly confirmed top-level expansion; unsupported cases refuse; no hidden context/front matter | unit | `rewrite-mapping.test.ts: source-shape-corpus` |
| RWR-22 | Baseline target/prefix/suffix hashes and front-matter ID | Apply valid result, then repeat after baseline drift | Valid result changes only target bytes; stale baseline yields stale-target without write | unit | `rewrite-mapping.test.ts: outside-byte-identity` |
| RWR-23 | Sending, streaming and review with checkpoint storage fault injection | Attempt autosave/commit/sync, kill or leave review | No unaccepted note write/normal commit/remote text; original durable before token; recovery isolated; leaving discards | fixture | `rewrite-save-lane.test.ts: checkpoint-and-review-hold` |
| RWR-24 | Protected stream plus edits before, after and within target | Receive batches, stop or finalize | Inside edit refused; outside edits mapped/preserved; finalized result is one undo step | unit | `rewrite-range.test.ts: concurrent-transaction-mapping` |
| RWR-25 | Typed IPC fixture with valid, invalid and stale operation IDs | Send events, abort and emit late tokens | Main alone calls adapter; invalid events rejected; aborted/stale events cannot alter document | fixture | `rewrite-ipc.test.ts: authorization-order-and-abort` |
| RWR-26 | Fake clock and each error code | Cross connect 10 s, first-token 30 s, idle 15 s, total 120 s limits | Exactly one terminal transition with matching code; no orphan task or hidden retry | unit | `rewrite-timeouts.test.ts: deadlines-and-error-taxonomy` |
| RWR-27 | Injection, active HTML, malformed/huge output, refusal and ordinary Markdown fixtures | Frame request and validate response | Text treated as data, no tool/fetch, unsupported output rejected; ordinary links/images retained | fixture | `rewrite-output.test.ts: untrusted-markdown-and-refusal` |
| RWR-28 | Dirty local/other-window buffer and disk/sync/rename/delete races | Request Same file then Accept | Correct authoritative snapshot or refusal; write lane/exact guards prevent overwrite and route conflicts | journey | `rewrite-files.spec.ts: dirty-window-and-disk-races` |
| RWR-29 | Private/public source with metadata/relative links and colliding rewrite names | Accept New file, including injected create failure | Atomic free sibling, fresh ID, metadata/link semantics preserved, no inbound retarget/private-to-public move; failure keeps result | fixture | `rewrite-new-file.test.ts: atomic-name-id-visibility` |

## Providers

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-41 | No profile, safeStorage available/unavailable and mocked key | Save/reload/export configuration | Disabled until explicit setup; references only in settings; no secret in Git/log/export; unavailable encryption refuses persistence | fixture | `rewrite-profile.test.ts: credential-reference-boundary` |
| RWR-42 | Approved/unapproved endpoint, redirect and attested local profile fixtures | Request transport destination | Only exact authorized route allowed, credentials-in-URL denied, no redirect/fallback or local-inference guarantee | fixture | `rewrite-egress.test.ts: routing-allowlist-no-fallback` |
| RWR-43 | Public/private/shared read-only/editable targets across consent states | Send, change model/endpoint/policy, revoke | Complete policy matrix matches named scope; private remote prompts every time; changes invalidate consent; read-only blocked | fixture | `rewrite-policy.test.ts: consent-private-share-matrix` |
| RWR-44 | Size/token/day boundary values and known/unknown pricing fixtures | Estimate/send, retry, restart | Caps enforced at exact limits, confirmation above thresholds, unknown not zero, counters survive and no automatic billable retry | unit | `rewrite-limits.test.ts: cost-size-day-boundaries` |
| RWR-45 | Fake scripts success/slow/stall/all errors/malformed/huge/injection | Run offline operation-contract suite | Scripts deterministic with zero network/credentials; kit method maps to source and commands, not live certification | fixture, review | `rewrite-provider-contract.test.ts: offline-script-catalogue` |
| RWR-46 | No owner approval, then approved/revoked gate fixture | Enable real transport or ship changed claims | No send before approved gate; exact approval scope recorded; revoke blocks new sends, local writing survives | fixture, review | `rewrite-rollout.test.ts: owner-gate-and-revocation` |
| RWR-47 | Offline/auth/rate/timeout/provider failures with edited instruction | Fail, reconnect, explicitly retry | Specific repair, original/prompt retained; reconnect never sends queued text; no empty-success fallback | journey | `rewrite-errors.spec.ts: failure-repair-and-offline` |
| RWR-48 | Current browser build and desktop fixture build | Search commands/settings/Help | Browser has no rewrite/key setup; desktop-only scope and future security prerequisites explicit | journey, review | `rewrite-platform.spec.ts: browser-boundary` |

## History

| Requirement | Given | When | Then | Tier | Planned test |
| --- | --- | --- | --- | --- | --- |
| RWR-61 | Fixture workspace with completed variations and isolated history | Inspect commits/index/worktree and push workspace with mirror | Only local history owns variations; neutral metadata; workspace/mirror destination has no variation objects | fixture | `rewrite-history.test.ts: isolated-commits-and-mirror` |
| RWR-62 | Accepted rewrite and ordinary branch history | Undo, redo, Try again and save | New ordinary content states, no amend/reset/rebase/force push; earlier history immutable | fixture | `rewrite-history.test.ts: undo-new-states` |
| RWR-63 | Resolved/unresolved sessions and interrupted stream | Restart, open earlier-session picker and restore | No partial result restored as final; original/completed versions available, no launch writes or auto-accept | journey | `rewrite-restart.spec.ts: recover-and-restore` |
| RWR-64 | 20/21 variations, 29/31-day history and 100 MiB cap | Complete/prune/restart with unresolved checkpoint | Oldest resolved content pruned only; original never evicted; over-cap blocks with recovery choice; normal history unchanged | fixture | `rewrite-retention.test.ts: cap-and-unresolved-original` |
| RWR-65 | Non-Git folder and unborn Git repository | Rewrite, compare, restart, undo | Durable device-local history works without Git initialization/initial commit or branch modification | fixture | `rewrite-history.test.ts: non-git-unborn` |
| RWR-66 | Distinct public/private repositories and sentinel private text | Generate, sync, mirror-push, export and inspect objects/logs | No private sentinel or variation metadata in public destination; cleanup claims do not promise secure Git erasure | fixture | `rewrite-history.test.ts: private-object-isolation` |

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
| LIC-03 | Proposed integration dependencies and kit provenance | Audit licences/notices before adding dependencies | Only approved permissive artefacts, no paid Content AI, optional kit install separated | review | `rewrite-license-review: dependency-policy` |

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

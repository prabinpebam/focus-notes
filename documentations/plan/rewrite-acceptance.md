# Rewrite acceptance

> [!NOTE]
> **TL;DR.** The owner approved exact d40b78a3 UX/UI on 1 November. The combined runtime/test/config head ece4c25c passed complete Windows CI 41325681712: 2,568 units, 294 desktop journeys, 46 web journeys, audit, types, build and unchanged budgets. The current matrix below links the exact commands/head/run and explicitly retains unmeasured renderer latency, full-frame contrast, screen-reader and live-account gaps. Older row evidence is historical and is superseded by that combined proof. No live service is called in CI and complete GATE-MAI certification is not implied.

The chain is in [Rewrite with AI](../experience/rewrite-with-ai.md) and [Settings → AI](../experience/ai-settings.md); requirements in [requirements](../product/requirements.md#rewrite-with-ai-rwr); packages in the [implementation plan](implementation-plan.md#mai).

## What people expect

**Current production boundary, 1 November:** the owner approved both UX and UI
of exact d40b78a3 at 19:59. The combined candidate's 217 targeted units and six
related real-app journeys pass, including 480 x 360 Return, both directions,
reduced motion, opaque highlighted hover, preserved Default focus and mounted
editor/panel/scroller identity. The [current command and requirement matrix](gate-evidence.md#current-production-candidate-checks)
supersedes historical pending-owner-acceptance statements below and maps every
approved requirement/DoD to actual checks and explicit gaps. Static security
review is final with no reported findings, not comprehensive certification or
live SDK/account proof. The runtime/test/config head now has complete green
Windows proof; documentation-only follow-ups must receive their own complete
gate before main fast-forwards. GATE-MAI's unmeasured renderer latency,
full-frame contrast and screen-reader evidence are not inferred from these tests.

That the rows marked built work in the app they're using, that the original is never lost, and that their words go only where they chose. Evidence here is a test that runs, or the owner trying it, never "should work".

## How to read the matrix

- **Unit** names a test file that runs in `pnpm test`.
- **Owner** means the owner tries it in the review build (D-255: before CI and journeys).
- **Journey** is a Windows end-to-end test against a fake local service, with `FOCUS_NOTES_E2E=1`; planned as QLT-08.
- **Look** means a screenshot or gallery check in light, dark and contrast.

## Rewrite

| ID | Check | Evidence today | Left |
| --- | --- | --- | --- |
| RWR-70 | No hosted model/runtime in Focus Notes; HTTP transport stays in main, and the official SDK communicates with a separate installed Copilot CLI | Core/main boundary, `pnpm check` licences and SDK stdio protocol fakes | No live SDK/account certification |
| RWR-71 | The web build has no `ai` bridge; `rewrite.open` disabled there | Code (`enabled` needs `bridge.ai`) | Journey or web test |
| RWR-72 | Ctrl+Shift+R, the text menu and the Edit menu open the dialog on the selection; no selection announces and opens nothing | `packages/core/test/keymap-layers.test.ts`, `menu-bar`, `text-menu` tests; `apps/desktop/e2e/spelling-menu.spec.ts` (with text selected, *Rewrite…* heads the text menu and takes its first focus); Owner | Journey |
| RWR-73 | The inline prompt's integration/picker, field, presets and actions; no preview or disclaimer; presets never send, Generate disabled when empty | `ui:check`; core units; combined `air-safeguards` journeys; normal/small light/dark popover and picker captures reviewed (1 November) | Owner acceptance |
| RWR-74 | No Writer → *Set up AI* opens Settings at AI | `packages/core/test/ai-app.test.ts` (at AI even while Settings' account check is still running: it once opened at Account on CI); `apps/desktop/e2e/air-safeguards.spec.ts` (*Change in Settings* opens at AI); Owner | Journey |
| RWR-75 | A note changed after capture sends nothing and says so | Code (`doc.eq` check in EditorSurface) | Unit test |
| RWR-76 | Read-only and shimmer while generating; toast with Stop; no hand-over for saving | `packages/editor/test/rewrite-stream.test.ts` (streams in place, locked; the lock stops commands, undo and inserts); `apps/desktop/e2e/air-rewrite.spec.ts` (typing, Ctrl+B and Ctrl+Z change nothing, `aria-busy`, nothing on disk while it streams) | — |
| RWR-77 | First text replaces the selection; pieces rebuild it; blank lines make paragraphs | `rewrite-stream.test.ts` | — |
| RWR-78 | One change, caret after it, 1 s hold and 3 s fade, cleared at the end; reduced motion | `rewrite-stream.test.ts` (one step); Owner | Look in light, dark, contrast and reduced motion |
| RWR-79 | One Ctrl+Z gives the exact original; Ctrl+Y the rewrite | `rewrite-stream.test.ts` (one undo step and redo; a second rewrite is its own step); `apps/desktop/e2e/air-rewrite.spec.ts` (local fake Ollama) (saved; Ctrl+Z saves the original, Ctrl+Y the rewrite) | — |
| RWR-80 | Esc or Stop aborts in main and restores exactly | `rewrite-stream.test.ts` (Esc mid-stream restores the original exactly, even inside a list and a fence); `apps/desktop/test/ai-contract.test.ts` (Stop mid-stream and before the answer starts close the socket within 1 s); `packages/core/test/ai-app.test.ts` (Stop cancels in the shell and restores); `ai-ollama.live.test.ts` against the owner's Ollama, 31 October (stopped 1 ms after Stop); `apps/desktop/e2e/air-rewrite.spec.ts` (Esc and F6 → Stop close the request at the service, the original back, nothing saved) | — |
| RWR-81 | Each failure restores the original with its words | `rewrite-stream.test.ts` (a stop or failure puts the original back exactly; no text is a failure); `apps/desktop/test/ai-contract.test.ts` (401, 403, 404, 400, 413, 429 with Retry-After, 5xx, 504, a malformed stream, an error event, HTML, empty answers, refused, DNS, TLS, redirect: each one reason code, never the service's text); `packages/core/test/ai-app.test.ts` (each error event aborts the editor and toasts its words) | Journey with a failing fake |
| RWR-82 | Text, prompt and answer limits; response, idle and total timeouts; one at a time | `apps/desktop/test/ai-contract.test.ts` (response, idle and total timeouts each close the request; too-long answers; local limits longer than cloud) | — |
| RWR-83 | Only the instruction, prompt and selection are sent; thinking kept out of the note | `apps/desktop/test/ai-contract.test.ts` (each kind's documented URL, auth and body; `think: false` for Ollama; `max_completion_tokens` for OpenAI; a leading `<think>` block left out); `ai-ollama.live.test.ts` against the owner's Ollama, 31 October | Security review (SEC-09) |
| RWR-84 | Live Markdown while streaming; the answer's content kept in the note's canonical style afterwards | `rewrite-stream.test.ts` (formatted while it streams, one undo step at the end; open syntax mid-stream; `streamingMarkdown`; another style saved canonically (`__bold__` → `**bold**`, `* ` → `- `); CRLF and front matter bytes; whole note, fence and table selections; a long answer paced to frames); `apps/desktop/e2e/air-rewrite.spec.ts` (local fake Ollama) (bold and code shown while held mid-answer; the saved file is the canonical text) | The owner accepts it in the review build |
| RWR-85 | Ctrl+Shift+R and ⇧⌘R named per platform | `packages/core/test/text-menu.test.ts` at bb50e208 (the text menu's key per platform) | The finish message's undo key; the cheat sheet and tooltips |
| RWR-86 | Switching or closing the note stops the request in main | `packages/core/test/ai-app.test.ts` (a note switch cancels in the shell and the new note gets no late pieces; `pagehide` cancels); main aborts on `destroyed` and `did-start-loading`; `apps/desktop/e2e/air-rewrite.spec.ts` (switching notes mid-stream closes the request at the service; neither note changes) | — |

| RWR-87 | Non-modal inline prompt; selection visible in scrollable document; no passage preview, backdrop or fullscreen | UX-POP.1 locally proven: `ui:check`, combined D-265 journey and reviewed normal/small light/dark captures | Owner acceptance |
| RWR-88 | Fragment anchor follows scroll/resize, clamps while any selection is visible, leaves only when all offscreen, draft returns on scroll back | UX-POP.2/3 locally proven: `selection-placement.test.ts` covers wrapped/partial/gap visibility and full clamp; D-265 scroll/resize/offscreen-return journey passes | Owner acceptance; see honest applied-placement measures in wait inventory |
| RWR-89 | Empty-prompt deselection dismisses with no confirmation, send or write; control focus is not deselection | UX-POP.4 locally proven: core draft units and combined D-265 empty dismissal/control-focus journey | Owner acceptance |
| RWR-90 | Written/preset/whitespace prompt asks Keep editing / Discard prompt; safe default/Escape preserves selection and draft; discard clears, no send/write | UX-POP.5 locally proven: core units, real-editor observer snapshot regression and repeated same-caret Escape/Keep editing/Discard journey; confirmation light/dark reviewed | Owner acceptance |

## Settings → AI

| ID | Check | Evidence today | Left |
| --- | --- | --- | --- |
| AIS-01 | Settings lists AI with its intro and empty state | `packages/core/test/settings-app.test.ts`; Owner | Look |
| AIS-02 | 26 kinds, three groups, six shapes; the not-offered list | `ai-providers.ts` data; `ai-rewrite.test.ts` (each provider's own request, answer and stream) | — |
| AIS-03 | Rows show name, detail, badge, key state and last Test, with their actions | Owner | Journey; look |
| AIS-04 | Only the chosen service's fields; Save disabled with reason; switching service starts afresh | Owner | Unit test of `vm.ai` |
| AIS-05 | The key goes out once, sealed in main, never returned; empty keeps it; no key store fails | `ai-rewrite.test.ts`; `apps/desktop/test/ai-contract.test.ts` (a provider's 401 that echoes the key: the key isn't in settings, the file, errors, stacks, reason codes, model lists or discovery); `diagnostics.test.ts` (AI keys redacted by prefix) | Security review |
| AIS-06 | https or loopback http only; no credentials, query or fragment; no redirects | `ai-rewrite.test.ts` (accepts https and this computer's http only); `redirect: "error"` in code | — |
| AIS-07 | Find on this computer: usual ports, 800 ms, loopback only; a 401 still counts; another program on the port doesn't | `apps/desktop/test/ai-contract.test.ts` (none running, some running, HTML or other JSON on a port, a 401, a silent port); `ai-ollama.live.test.ts` against the owner's Ollama, 31 October (found Ollama in 12 ms) | — |
| AIS-08 | Model lists per shape; Ollama cloud models marked | Owner | Unit test of `modelList` |
| AIS-09 | Test sends the made-up request, no note text; records the result | `apps/desktop/test/ai-contract.test.ts` (every kind; a thinking model's empty answer passes; a non-answer fails; timeouts); `ai-ollama.live.test.ts` against the owner's Ollama, 31 October (379 ms) | — |
| AIS-10 | One Writer; the first saved becomes it; the dialog names it | Owner | Unit test |
| AIS-11 | Each error code has its words | `en.json` keys; `ui:check`; `packages/core/test/ai-app.test.ts` (the words for each code, Retry-After's seconds) | — |
| AIS-12 | The first build's service carries over | `ai-rewrite.test.ts` (moves the first version's single service into a connection) | — |
| AIS-13 | User judgement after integration/model/locality disclosure; legacy settings still load | `ai-contract.test.ts` (old key ignored/stripped, connections preserved, disposable private selection sends after consent); `ai-app.test.ts` (private selections follow the same explicit-send path; local/cloud card, remembered picker and save failure) | `air-safeguards.spec.ts` (private selection Cancel/Send/undo; one/two-connection light/dark captures; persisted choice and reopened prompt) |
| AIS-14 | No first-send warning/disclaimer, consent, Send step or gate; Generate uses the visible integration directly | UX-POP.6 locally proven: core/provider units for absent/stale consent and changed capture; combined fake-service safeguards journeys pass including first Generate, Cancel and undo | Owner acceptance; full MAI gate remains open |
| AIS-15 | `ai.json` on the data inventory | `packages/core/test/inventory.test.ts` | — |
| AIS-16 | One selectable Settings connections list; Default and Rewrite use the same Writer; sibling actions and one Find on this PC | UX-LIST.1 to UX-LIST.5 locally proven in c4335741 and the combined candidate: native radio/core/provider units; five coupled journeys including 0/1/2/30 rows, keyboard, round-trip and default deletion; normal/narrow light/dark captures | Owner acceptance; full assistive-technology/forced-colours audit |

Test titles in brackets are the tests' own, on the branch at bb50e208; the file list is in [Rewrite engine → Tests](../architecture/rewrite-engine.md#tests).

## Cross-cutting

| ID | Check | Evidence today | Left |
| --- | --- | --- | --- |
| KEY-08 | Mod+Shift+R in the Writer layer; links on Mod+K | `keymap-layers.test.ts` | — |
| SPT-09 | Spotlight lists and runs Rewrite… | Command registry | A Spotlight test |
| UI-14 | Views are data; no view-local HTML, CSS or strings | `ui:check` (380 documents, 71 components) | — |
| FOC-07 | The rainbow never hides the focus band | — | Look (WP-AI.9) |
| HLP-10 | Help articles exist and say desktop only | [Rewrite selected text](../help/rewrite-with-ai.md), [Connect an AI service](../help/connect-an-ai-service.md) | Screenshots |
| PRV-05 | Nothing logs or keeps prompts, text or answers | Code review | Security review |
| SEC-09 | Threat review of `ai:*`, addresses, keys, framing, answer handling | First review, 31 October (AIR-SECREVIEW): four findings fixed on `fix-ai-sec` (D-259, D-260): main decides private notes from the note's path, a key stays with its address, whole answers are capped, a cloud-routed Ollama model says "Cloud"; each with a test in `ai-contract.test.ts` or `ai-app.test.ts`, and M1 end to end in the `air-safeguards` journey (a window that skips the dialog is refused) | Review again after the dialog's cases land (WP-AI.9) |
| PRF-15 | Wait rows measured | — | WP-AI.9 ([wait inventory](../architecture/perceived-performance.md#rewrite-waits)) |
| QLT-08 | A Windows journey against a fake local service | — | WP-AI.9 |
| A11Y-03 | Keyboard, focus, announcements, contrast of every frame | Announcements in code | Screen-reader pass; contrast |
| I18N-04 | Every word a message key | `ui:check`; `en.json` | — |
| DSY-14 | Tokens; gallery states; VVS ≥ 70 | Tokens built (`pnpm tokens` tier rules) | Gallery; VVS |
| DOC-03 | Spec matches the build | This page and the pages it links (31 October) | Each increment updates them (owner, 14:25) |
| LIC-03 | No AI dependency | `pnpm check` licences | — |

## Stage gate

### Inline prompt delivery evidence (1 November)

**Historical isolated delivery boundary:** WP-AI.14 / UX-POP.1 to UX-POP.6 were built and locally proven on `own-popover-build`, before integration into the owner's then-current `52bf0dfe` candidate. These commands ran from that owned worktree:

| Command | Result |
| --- | --- |
| `pnpm check` | PASS: boundaries, chain, plan, licences, generated inventory and `ui:check` (394 documents / 71 components / 547 commands) |
| `pnpm typecheck` | PASS, all workspace packages |
| `pnpm exec vitest run packages\ui\test\selection-placement.test.ts packages\ui\test\popover-box.test.ts packages\editor\test\format.test.ts packages\core\test\ai-app.test.ts packages\ui-runtime\test\check.test.ts apps\desktop\test\ai-contract.test.ts apps\desktop\test\ai-rewrite.test.ts apps\desktop\test\ai-own-key.test.ts apps\desktop\test\ai-copilot-contract.test.ts apps\desktop\test\ai-ollama.live.test.ts` | PASS: 206 tests; five opt-in live tests skipped |
| `pnpm --filter @focus-notes/desktop run build` | PASS on final source |
| `pnpm --filter @focus-notes/desktop exec playwright test air-safeguards.spec.ts air-rewrite.spec.ts --workers=1 -g 'D-265\|AIS-13\|AIS-04\|AI Rewrite: streams'` with `FOCUS_NOTES_E2E=1` | PASS: all four journeys, including external overwrite and switching notes |

The initial extra stream journey failed at external replacement: the new selection listener effect accessed `editor.view.dom` while Tiptap replaced its view. A bounded renderer diagnostic identified that exact access; using the mounted column's owning document fixes it. The final four-journey run passes without a save/conflict workaround or weakening the assertion.

Normal/small light/dark popover, loss-dialog and remembered-picker captures were reviewed in the worker's `own-popover-ui` capture set. At 480 × 360, the journey scrolls the popover's existing Surface and asserts Generate is in the viewport without moving the popover outside the editor. The [wait inventory](../architecture/perceived-performance.md#rewrite-waits) records the final applied-placement maxima (82.90 / 78.10 ms) and deselection maxima (18.50 / 17.90 ms, asserted ≤ 100 ms). Applied placement is not literal paint or a 16.7 ms wall-clock claim.

The pinned Slate command `node E:\Projects\side-projects\focus-notes\slate\scripts\runtime-host.mjs check --repo . --host documentations` passes against the owned worktree. The worker's private headless Edge renderer checks all 17 affected reader pages in both themes (34 cases): one H1, figures inside the content column and the changed anchors. It blocks external requests and closes its ephemeral-port server/browser; it never uses port 8787. Historical missing-link and anchor-parser observations are kept separately from this slice.

At that isolated boundary, candidate integration was pending; the combined sections below supersede it. The owner's acceptance, full MAI evidence, screen-reader/contrast review and the desktop merge gate remain pending. No full suite, CI wait, live account test or owner app relaunch ran in that slice.

### Combined candidate integration (1 November)

**Historical candidate 86631980:** `own-candidate` combined the published CLI companion `11942082` and inline popover `74b27d79` serially over `52bf0dfe`. D-264's Copilot assertions and D-265/D-266's direct Generate, prompt-loss and editor lifecycle contracts were preserved. The Settings default-list specification was not part of that candidate.

| Command | Combined result |
| --- | --- |
| `pnpm tokens`, `pnpm check`, `pnpm typecheck` | PASS: 1928 tokens; 394 view documents / 71 components / 547 commands; all workspace types. Tokens were regenerated after the first typecheck found stale local generated output. |
| `pnpm exec vitest run packages\ui\test packages\editor\test\format.test.ts packages\core\test\ai-app.test.ts packages\ui-runtime\test\check.test.ts apps\desktop\test\ai-contract.test.ts apps\desktop\test\ai-rewrite.test.ts apps\desktop\test\ai-own-key.test.ts apps\desktop\test\ai-copilot-contract.test.ts apps\desktop\test\ai-ollama.live.test.ts` | PASS: 358 tests / 30 files; five opt-in live tests skipped. Includes selection geometry, real editor observer regression and CLI icon assertions. |
| `node E:\Projects\side-projects\focus-notes\slate\scripts\runtime-host.mjs check --repo . --host documentations` | PASS against the combined worktree. |
| `pnpm --filter @focus-notes/desktop run build` | PASS; existing renderer chunk-size warning remains. |
| `pnpm --filter @focus-notes/desktop exec playwright test air-safeguards.spec.ts air-rewrite.spec.ts --workers=1 -g 'D-265\|AIS-13\|AIS-04\|AI Rewrite: streams'` with `FOCUS_NOTES_E2E=1` | Final aggregate PASS: four journeys. The first aggregate failed awaiting external overwrite at `air-rewrite.spec.ts:178`; the single-test retry and full four-test rerun passed without a code change or weakened assertion. |

The final combined journey measured applied placement at 88.80 ms (light) / 81.50 ms (dark), and deselection at 7.10 / 17.10 ms. These are local observed scheduling-to-placement values, not paint, next-frame wall-clock proof or a benchmark improvement claim. Every test run used scoped process cleanup. No live inference or owner credentials were used. This candidate is for the owner's review, not a main merge or full MAI acceptance.

### Settings-list combined candidate (1 November)

Exact published Settings implementation `c4335741dfb044c20fb75412afb6bfac0651af77`, including its rebased spec `888ba00a`, fast-forwards the existing own-candidate from `86631980`. Original published spec `145eb45c` remains in history. D-264/D-265/D-266 and the CLI companion remain intact alongside D-267 / AIS-16 / WP-AI.15. No editor geometry code changed in this integration.

| Command | Combined result |
| --- | --- |
| `pnpm check` | PASS: 396 view documents / 71 components / 547 commands, chain, plan, licences and generated parity. Kit-copy checks skip unchecked worktree submodules. |
| `pnpm typecheck` | PASS: all workspace types. |
| `pnpm exec vitest run packages\ui\test packages\editor\test\format.test.ts packages\editor\test\rewrite-stream.test.ts packages\core\test\ai-app.test.ts packages\ui-runtime\test\check.test.ts apps\desktop\test\ai-contract.test.ts apps\desktop\test\ai-rewrite.test.ts apps\desktop\test\ai-own-key.test.ts apps\desktop\test\ai-copilot-contract.test.ts` | PASS: 401 tests / 32 files. No opt-in live tests selected. Includes native radio identity/actions, shared Writer pending/failure, default deletion, API/Copilot fakes, selection geometry, editor observer and streaming/undo contracts. |
| `pnpm --filter @focus-notes/desktop run build` | PASS against combined runtime; existing renderer chunk-size warning only. The owner-review build is rebuilt from the final evidence commit before launch. |
| `pnpm --filter @focus-notes/desktop exec playwright test e2e/air-safeguards.spec.ts e2e/air-rewrite.spec.ts --workers=1 -g 'AIS-16: Settings Default\|D-265, D-266: inline\|AIS-13, AIS-14:\|AIS-04, AIS-13:\|AI Rewrite: streams'` with `FOCUS_NOTES_E2E=1` | PASS: all five journeys, 34.1 s. Settings 0/1/2/30 rows, native keyboard choice, sibling actions, Writer round-trip and deletion; inline draft-loss/direct Generate; private-note disclosure/Cancel; remembered picker; streaming, external overwrite, note switch and undo. No retries or weakened assertions. |
| `node E:\Projects\side-projects\focus-notes\slate\scripts\runtime-host.mjs check --repo . --host documentations`, `git diff --check` | PASS against own-candidate. |
| `node E:\Projects\side-projects\focus-notes-work\scratch\own-int2-render.mjs` | PASS: four changed reader pages in both themes (eight cases), one H1, changed anchors and figures within the content column; light/dark acceptance captures inspected. Headless Edge uses a private ephemeral port, blocks external requests and closes browser/server in finally. |

Fresh normal/narrow light/dark Settings and popover captures are in `focus-notes-work\scratch\own-int2-ui`; narrow Settings, small popover and scrolled Generate/Cancel captures were inspected in both themes. The combined journey observes applied placement at 98.20 / 99.70 ms and deselection at 6.60 / 11.50 ms (light/dark); these are scheduling-to-applied-placement observations, not paint, next-frame proof or benchmark claims. All journey windows were invisible. Scoped cleanup WhatIf and actual each reported zero remaining instances; recorded test PIDs were verified absent.

The owner-review refresh uses a fresh isolated Sample.md workspace and local Ollama Writer with no copied credentials. Only the authorized old candidate is replaced after the exact-head build is ready, with its executable/profile checked first; the new responding PID, profile and reopen command are recorded in the integration delivery and progress log. Preview, port 8787, real notes/private content and accounts remain untouched. No live inference, main merge, full suite, CI wait, release or full MAI acceptance is part of this slice. Owner acceptance, the second security review and full assistive-technology/forced-colours evidence remain pending.

**GATE-MAI** passes when every row above has its evidence, the owner has accepted Rewrite and Settings → AI in the review build, and the branch has passed the desktop gate for app code (D-206, sized by D-255). Live services are never part of CI: the owner's own trial is the evidence for real services.

- **Cloud services (OpenAI, Anthropic and the other keyed kinds), live:** depends on the owner (their own key), deferred. Until then `apps/desktop/test/ai-own-key.test.ts` is the evidence for the owner's own path: Settings → AI's form adds an OpenAI or Anthropic connection with a key, Test passes, and Rewrite streams the answer, through the main process's service at api.openai.com or api.anthropic.com (answered by a local fake), with the key in its own header, sealed on disk and never in the window; a wrong key fails Test in plain words. `ai-contract.test.ts` checks every keyed kind's documented address, auth header and body the same way.

## Decisions

- **D-256** and **D-257**: what's built; the 30 October matrix (fixtures, protected review, variations, files, owner gate) is retired with them.
- **D-255**: the owner sees changes before CI; the full suite comes after acceptance.

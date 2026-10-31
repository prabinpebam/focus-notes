# Rewrite acceptance

> [!NOTE]
> **TL;DR.** One row per Rewrite and Settings → AI requirement: how to check it, the evidence today and what's left. On 31 October the built rows (RWR-70 to RWR-83, AIS-01 to AIS-12, AIS-15) have `pnpm check`, typechecks and unit tests on `fix-ai-rewrite-simple`, and the owner is trying them in the review build with Ollama. The `air-rewrite` and `air-safeguards` journeys run against a local fake Ollama, and the first security review's findings are fixed (SEC-09). No live service is ever called in CI; a live cloud service waits for the owner's own key. The wait measures' budgets and the screen-reader pass are still to do (WP-AI.9).

The chain is in [Rewrite with AI](../experience/rewrite-with-ai.md) and [Settings → AI](../experience/ai-settings.md); requirements in [requirements](../product/requirements.md#rewrite-with-ai-rwr); packages in the [implementation plan](implementation-plan.md#mai).

## What people expect

That the rows marked built work in the app they're using, that the original is never lost, and that their words go only where they chose. Evidence here is a test that runs, or the owner trying it, never "should work".

## How to read the matrix

- **Unit** names a test file that runs in `pnpm test`.
- **Owner** means the owner tries it in the review build (D-255: before CI and journeys).
- **Journey** is a Windows end-to-end test against a fake local service, with `FOCUS_NOTES_E2E=1`; planned as QLT-08.
- **Look** means a screenshot or gallery check in light, dark and contrast.

## Rewrite

| ID | Check | Evidence today | Left |
| --- | --- | --- | --- |
| RWR-70 | No model, runtime or AI SDK in the dependencies; every request goes through main's `fetch` | Code review of the branch; `pnpm check` licences | — |
| RWR-71 | The web build has no `ai` bridge; `rewrite.open` disabled there | Code (`enabled` needs `bridge.ai`) | Journey or web test |
| RWR-72 | Ctrl+Shift+R, the text menu and the Edit menu open the dialog on the selection; no selection announces and opens nothing | `packages/core/test/keymap-layers.test.ts`, `menu-bar`, `text-menu` tests; `apps/desktop/e2e/spelling-menu.spec.ts` (with text selected, *Rewrite…* heads the text menu and takes its first focus); Owner | Journey |
| RWR-73 | The dialog's parts; presets fill the prompt and never send; Generate disabled when empty | `ui:check` of `rewrite.view.json`; Owner | Look; journey |
| RWR-74 | No Writer → *Set up AI* opens Settings at AI | Owner | Journey |
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
| AIS-13 | Don't send private notes | `apps/desktop/test/ai-contract.test.ts` (main refuses a private selection while it's on; sends once it's off); `packages/core/test/ai-app.test.ts` (Private root, shared and `private:` notes; the dialog's private case) | `apps/desktop/e2e/air-safeguards.spec.ts` (a private note offers Change in Settings and sends nothing; the switch turns it off) |
| AIS-14 | First-send confirmation | `apps/desktop/test/ai-contract.test.ts` (nothing sent before consent; a new model, address or key asks again; a new name doesn't); `packages/core/test/ai-app.test.ts` (the dialog names the service, address and where; Send records it first) | `apps/desktop/e2e/air-safeguards.spec.ts` (Cancel sends nothing; Send saves consent and streams; the next rewrite just generates) |
| AIS-15 | `ai.json` on the data inventory | `packages/core/test/inventory.test.ts` | — |

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
| SEC-09 | Threat review of `ai:*`, addresses, keys, framing, answer handling | First review, 31 October (AIR-SECREVIEW): four findings fixed on `fix-ai-sec` (D-259, D-260): main decides private notes from the note's path, a key stays with its address, whole answers are capped, a cloud-routed Ollama model says "Cloud"; each with a test in `ai-contract.test.ts` or `ai-app.test.ts` | Review again after the dialog's cases land (WP-AI.9) |
| PRF-15 | Wait rows measured | — | WP-AI.9 ([wait inventory](../architecture/perceived-performance.md#rewrite-waits)) |
| QLT-08 | A Windows journey against a fake local service | — | WP-AI.9 |
| A11Y-03 | Keyboard, focus, announcements, contrast of every frame | Announcements in code | Screen-reader pass; contrast |
| I18N-04 | Every word a message key | `ui:check`; `en.json` | — |
| DSY-14 | Tokens; gallery states; VVS ≥ 70 | Tokens built (`pnpm tokens` tier rules) | Gallery; VVS |
| DOC-03 | Spec matches the build | This page and the pages it links (31 October) | Each increment updates them (owner, 14:25) |
| LIC-03 | No AI dependency | `pnpm check` licences | — |

## Stage gate

**GATE-MAI** passes when every row above has its evidence, the owner has accepted Rewrite and Settings → AI in the review build, and the branch has passed the desktop gate for app code (D-206, sized by D-255). Live services are never part of CI: the owner's own trial is the evidence for real services.

- **Cloud services (OpenAI, Anthropic and the other keyed kinds), live:** depends on the owner (their own key), deferred. Until then `apps/desktop/test/ai-contract.test.ts` is the evidence: each kind's documented address, auth header and body through the main process's own fetch, with the key sealed by the system's key store, never shown, and kept with its address.

## Decisions

- **D-256** and **D-257**: what's built; the 30 October matrix (fixtures, protected review, variations, files, owner gate) is retired with them.
- **D-255**: the owner sees changes before CI; the full suite comes after acceptance.

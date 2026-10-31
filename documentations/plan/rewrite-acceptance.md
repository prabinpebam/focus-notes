# Rewrite acceptance

> [!NOTE]
> **TL;DR.** One row per Rewrite and Settings → AI requirement: how to check it, the evidence today and what's left. On 31 October the built rows (RWR-70 to RWR-83, AIS-01 to AIS-12, AIS-15) have `pnpm check`, typechecks and unit tests on `fix-ai-rewrite-simple`, and the owner is trying them in the review build with Ollama. Nothing is proven by a Windows journey yet, no live service is ever called in CI, and the security review, wait measures and screen-reader pass are still to do (WP-AI.9).

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
| RWR-72 | Ctrl+Shift+R, the text menu and the Edit menu open the dialog on the selection; no selection announces and opens nothing | `packages/core/test/keymap-layers.test.ts`, `menu-bar`, `text-menu` tests; Owner | Journey |
| RWR-73 | The dialog's parts; presets fill the prompt and never send; Generate disabled when empty | `ui:check` of `rewrite.view.json`; Owner | Look; journey |
| RWR-74 | No Writer → *Set up AI* opens Settings at AI | Owner | Journey |
| RWR-75 | A note changed after capture sends nothing and says so | Code (`doc.eq` check in EditorSurface) | Unit test |
| RWR-76 | Read-only and shimmer while generating; toast with Stop; no hand-over for saving | `packages/editor/test/rewrite-stream.test.ts` (streams in place, locked); Owner | Journey; save-path test |
| RWR-77 | First text replaces the selection; pieces rebuild it; blank lines make paragraphs | `rewrite-stream.test.ts` | — |
| RWR-78 | One change, caret after it, 1 s hold and 3 s fade, cleared at the end; reduced motion | `rewrite-stream.test.ts` (one step); Owner | Look in light, dark, contrast and reduced motion |
| RWR-79 | One Ctrl+Z gives the exact original; Ctrl+Y the rewrite | `rewrite-stream.test.ts` (one undo step and redo) | Journey |
| RWR-80 | Esc or Stop aborts in main and restores exactly | `rewrite-stream.test.ts` (Esc mid-stream restores the original exactly, even inside a list and a fence); `apps/desktop/test/ai-rewrite.test.ts` (stops on cancel) | Journey |
| RWR-81 | Each failure restores the original with its words | `rewrite-stream.test.ts` (a stop or failure puts the original back exactly; no text is a failure); `ai-rewrite.test.ts` (names a refused key and an unreachable service) | Journey with a failing fake |
| RWR-82 | 32 KiB, 4,000 characters, 4,096 tokens, 90 s, one at a time | Code (`MAX_TEXT`, `MAX_INSTRUCTION`, `TIMEOUT_MS`; one per window in `main.ts`) | Unit test of the limits |
| RWR-83 | Only the instruction, prompt and selection are sent | `ai-rewrite.test.ts` (each provider's own request) | Security review (SEC-09) |
| RWR-84 | Live Markdown while streaming; bytes exact afterwards | `rewrite-stream.test.ts` at 2616070c (formatted while it streams and the provider's bytes as one undo step; open syntax mid-stream; `streamingMarkdown`) | The owner accepts it in the review build |
| RWR-85 | Ctrl+Shift+R and ⇧⌘R named per platform | `packages/core/test/text-menu.test.ts` at bb50e208 (the text menu's key per platform) | The finish message's undo key; the cheat sheet and tooltips |
| RWR-86 | Switching notes stops the request in main | — | Not built (WP-AI.13) |

## Settings → AI

| ID | Check | Evidence today | Left |
| --- | --- | --- | --- |
| AIS-01 | Settings lists AI with its intro and empty state | `packages/core/test/settings-app.test.ts`; Owner | Look |
| AIS-02 | 26 kinds, three groups, six shapes; the not-offered list | `ai-providers.ts` data; `ai-rewrite.test.ts` (each provider's own request, answer and stream) | — |
| AIS-03 | Rows show name, detail, badge, key state and last Test, with their actions | Owner | Journey; look |
| AIS-04 | Only the chosen service's fields; Save disabled with reason; switching service starts afresh | Owner | Unit test of `vm.ai` |
| AIS-05 | The key goes out once, sealed in main, never returned; empty keeps it; no key store fails | `ai-rewrite.test.ts` (keeps connections with sealed keys that never come back) | Security review |
| AIS-06 | https or loopback http only; no credentials, query or fragment; no redirects | `ai-rewrite.test.ts` (accepts https and this computer's http only); `redirect: "error"` in code | — |
| AIS-07 | Find on this computer: usual ports, 800 ms, loopback only; a 401 still counts | Owner with Ollama | Unit test of `discover` |
| AIS-08 | Model lists per shape; Ollama cloud models marked | Owner | Unit test of `modelList` |
| AIS-09 | Test sends the made-up request, no note text; records the result | `ai-rewrite.test.ts` (Test records its result); Owner | — |
| AIS-10 | One Writer; the first saved becomes it; the dialog names it | Owner | Unit test |
| AIS-11 | Each error code has its words | `en.json` keys; `ui:check` | — |
| AIS-12 | The first build's service carries over | `ai-rewrite.test.ts` (moves the first version's single service into a connection) | — |
| AIS-13 | Don't send private notes | — | Not built (WP-AI.13) |
| AIS-14 | First-send confirmation | — | Not built (WP-AI.13) |
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
| SEC-09 | Threat review of `ai:*`, addresses, keys, framing, answer handling | — | WP-AI.9 |
| PRF-15 | Wait rows measured | — | WP-AI.9 ([wait inventory](../architecture/perceived-performance.md#rewrite-waits)) |
| QLT-08 | A Windows journey against a fake local service | — | WP-AI.9 |
| A11Y-03 | Keyboard, focus, announcements, contrast of every frame | Announcements in code | Screen-reader pass; contrast |
| I18N-04 | Every word a message key | `ui:check`; `en.json` | — |
| DSY-14 | Tokens; gallery states; VVS ≥ 70 | Tokens built (`pnpm tokens` tier rules) | Gallery; VVS |
| DOC-03 | Spec matches the build | This page and the pages it links (31 October) | Each increment updates them (owner, 14:25) |
| LIC-03 | No AI dependency | `pnpm check` licences | — |

## Stage gate

**GATE-MAI** passes when every row above has its evidence, the owner has accepted Rewrite and Settings → AI in the review build, and the branch has passed the desktop gate for app code (D-206, sized by D-255). Live services are never part of CI: the owner's own trial is the evidence for real services.

## Decisions

- **D-256** and **D-257**: what's built; the 30 October matrix (fixtures, protected review, variations, files, owner gate) is retired with them.
- **D-255**: the owner sees changes before CI; the full suite comes after acceptance.

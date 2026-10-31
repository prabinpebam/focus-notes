# Rewrite engine

> [!NOTE]
> **TL;DR.** The window asks, the main process calls the service, the editor writes. Core (`packages/core/src/ai-app.ts`) runs the dialog and the lifecycle; the main process (`apps/desktop/src/main/ai-rewrite.ts`) holds the keys, makes the request in the Writer's own streaming shape and sends back only text, tagged with the rewrite's ID; the editor (`packages/editor/src/rewrite-stream.ts`) locks the note, replaces the selection piece by piece outside the undo history, then puts the whole answer in as one undo step, or puts the original back on Stop or an error. Built on 31 October (D-256); live Markdown while streaming is in progress (2616070c).

Serves UC-RWR-02 and UC-RWR-07 (RWR-70, RWR-76 to RWR-86). The person's view of it is [Rewrite with AI](../experience/rewrite-with-ai.md); the services are in [Rewrite providers](rewrite-providers.md).

## What people expect

The words they selected change, and nothing else does. If they stop it or it fails, their words are back exactly as they were. One undo takes them back after it's done. Typing can't mix with a half-written answer.

## How it works

| Step | Core (`ai-app.ts`) | Editor (`EditorSurface`, `RewriteStream`) | Main (`ai-rewrite.ts`, `main.ts`) |
| --- | --- | --- | --- |
| Open | `rewrite.open` (Mod+Shift+R, the text menu, the Edit menu) asks the editor for the selection | `rewrite.capture`: the selected text (`textBetween` with blank lines between blocks), with the document and range kept; empty if nothing is selected or the note is read-only | — |
| Captured | `rewrite.captured`: no text → announce "Select some text to rewrite first."; otherwise open the dialog, close the formatting toolbar, load the settings | — | `ai:settings` |
| Generate | `rewrite.generate`: needs a prompt and a Writer; closes the dialog; asks the editor to begin | `rewrite.begin`: if the document is unchanged since the capture and editable, a `RewriteStream` locks the note and marks the range `pending`; answers `ok` | — |
| Began | `rewrite.began`: not ok → "The note changed after you selected the text…"; ok → a new ID, subscribe to events, the toast with Stop, announce, `ai.rewriteStart(id, { text, instruction })` | — | `ai:rewriteStart`: checks the ID, aborts any earlier rewrite from the same window, starts the stream |
| Streaming | each `delta` → `rewrite.chunk` | `push`: replaces the range with all the text so far, as paragraphs split at blank lines, outside the history; marks it `streaming` | each piece of text → `ai:rewriteEvent { id, type: "delta", text }` |
| Done | `done` with no text → fail with `provider-empty`; otherwise `rewrite.finish`, end, announce | `finish`: back to the original outside the history, then the whole answer as one closed step; caret after it; marks it `fading`; unlocks | `{ type: "done" }` |
| Fade | — | The `rewriteFade` animation's end clears the decoration (reduced motion: cleared at once) | — |
| Stop | `rewrite.cancel` (Esc or Stop): `ai.rewriteCancel(id)`, then fail with `cancelled` | `abort`: the original back outside the history; unlocks | aborts the request |
| Error | `{ type: "error", code }` → `rewrite.abort`, the error toast | `abort` | any failure → `{ type: "error", code }` |

## In the editor

`RewriteStream` (`packages/editor/src/rewrite-stream.ts`) owns one rewrite:

- **Locks** the note with `setEditable(false)` and remembers whether it was editable, so a read-only note stays read-only afterwards.
- **Keeps** the original as a document slice, so it can always be put back byte for byte.
- **Pushes** each piece by replacing the range with *all* the text so far. Leading blank space before the first real text is dropped, so a stray newline never wipes the selection early. The answer becomes paragraphs: blank lines split them, single line breaks become spaces. The slice is open at both ends, so the first and last paragraphs join the text around the selection.
- **Decorates** the range with an inline decoration (`RewriteDecoration`), mapped through each change. The decoration's classes come from the host (`rewriteClasses` in `packages/ui`); the editor styles nothing.
- **Keeps the history clean:** every streamed change is a transaction with `addToHistory: false`.

The host (`EditorSurface`) also:

- never hands a half-written note over for saving while a rewrite is active (the change, blur and flush paths return early);
- listens for <kbd>Esc</kbd> on the window, in the capture phase, while a rewrite is active, so <kbd>Esc</kbd> stops it wherever focus is;
- aborts an active rewrite when the editor is torn down (switching notes), so the note is never left locked or half-written.

## Undo and redo

When the answer is complete, `finish` puts the original back outside the history, then replaces it with the whole answer in one transaction wrapped in `closeHistory` before and after. The undo history therefore holds exactly one step: original → answer (RWR-79). <kbd>Ctrl+Z</kbd> restores the selection exactly; <kbd>Ctrl+Y</kbd> or <kbd>Ctrl+Shift+Z</kbd> brings the answer back. Typing after the rewrite starts a new step, so it never merges with it. An empty or blank answer isn't a step at all: it's a failure, and the original stays.

## In the main process

`AiService.stream` (RWR-82, RWR-83):

- **Checks** the input: text of 1 character to 32 KiB, a prompt of 1 to 4,000 characters, a Writer that exists. The ID must match `[\w-]{1,64}`.
- **Builds** one request in the Writer's shape (see [Rewrite providers](rewrite-providers.md#request-shapes)) with the fixed instruction "You rewrite text for a writer. Rewrite the text the user gives, following their instruction. Reply with only the rewritten text: no preamble, no quotes, no commentary. Keep the language of the text." and the user message "Instruction: {prompt}, Text: {selection}". Up to 4,096 tokens of answer.
- **Streams:** `stream: true` (Gemini: `:streamGenerateContent?alt=sse`). Server-sent events for OpenAI-compatible services, Azure, Anthropic (`content_block_delta`), Gemini and Cohere (`content-delta`); newline-delimited JSON for Ollama. A service that answers with plain JSON in one piece yields it once. More than 1 MB without a line break is a format error.
- **Bounds:** 90 s for the whole request, combined with the window's abort signal; `redirect: "error"`.
- **Sends** only text back, to the window that asked, tagged with the ID. One rewrite per window: a new one aborts the last. Closing the window aborts it.

The key is opened from `safeStorage` for the request and never leaves the main process.

## Failure and recovery

| What happens | Code | The person sees |
| --- | --- | --- |
| Can't connect | `network` | "Couldn't reach the service…"; the original |
| Too slow (90 s) | `timeout` | "The service took too long to answer. Try again." |
| 401 or 403 | `unauthorized` | "The service refused the key. Check it in Settings → AI." |
| 404 | `not-found` or `model-missing` | The model or address isn't known |
| 429 | `rate-limited` | "The service is busy or out of quota…" |
| No text at all | `provider-empty` | "The service sent back no text. The original is unchanged." |
| Esc or Stop | `cancelled` | "Rewrite stopped. The original text is back." (announced) |
| The note changed before Generate | — | "The note changed after you selected the text. Select it again and rewrite." |

In every case the editor's `abort` restores the original exactly, outside the history, and unlocks the note (RWR-80, RWR-81). Late events for an old ID are ignored.

**Known gap (RWR-86):** switching notes mid-rewrite aborts the stream in the editor, but core's request and its toast stay until the main process finishes or times out. Closing the window aborts it, since main listens for the window's end.

**Nothing is recovered after a crash:** while a rewrite streams the note isn't handed over for saving, so the saved note and any crash draft hold the original. There is no rewrite history to recover.

## Live Markdown while streaming (in progress)

RWR-84, WP-AI.12. The intended behaviour: Markdown in the answer (`**bold**`, lists, headings, code, links, quotes) shows formatted as it arrives, and the note's Markdown after the rewrite is exactly the answer's Markdown. Undo, Stop and errors are unchanged: still one step, still the exact original.

The first commit, 2616070c on the branch (after the review build at 452e44ba): each piece is parsed as Markdown with open syntax (emphasis, a code span, a fence, a link) closed for display only, and a last line that's only a marker held back; only the blocks that changed are replaced, so nothing flickers. Finish applies the service's text as one undo step; <kbd>Esc</kbd> restores the original document exactly. Not yet accepted by the owner. Until it is, the review build shows the answer as plain paragraphs, with Markdown's characters visible.

## Tests

- `packages/editor/test/rewrite-stream.test.ts`: streams in place, locked, then <kbd>Ctrl+Z</kbd> restores the selection and <kbd>Ctrl+Y</kbd> the rewrite; splits paragraphs at blank lines; a stop or failure puts the original back exactly and unlocks the note; no text at all is a failure. At 2616070c also: formatted while it streams with the provider's bytes as one undo step; open syntax mid-stream; <kbd>Esc</kbd> mid-stream inside a list and a fence; `streamingMarkdown`.
- `apps/desktop/test/ai-rewrite.test.ts`: https and this computer's http only; each provider's own request and answer; each provider's stream and events; sealed keys that never come back, and a rewrite with the Writer; Test's result, a refused key and an unreachable service; Ollama's newline-delimited JSON, a one-piece JSON answer and cancel; the first version's single service moved into a connection.
- `packages/core/test/text-menu.test.ts` at bb50e208: Rewrite…'s key with the platform's modifier names.
- Not yet: a Windows journey against a fake local service (QLT-08), measures (`fn:rewrite.*`, PRF-15), and the security review of the `ai:*` handlers (SEC-09).

## Decisions

- **D-256:** in-place streaming as one undo step; supersedes D-234's protected preview and save hold, D-240 and D-245's source-aware mapping, D-241 and D-246's checkpoints and D-247's history.
- **D-248 (in part):** the answer is untrusted text, inserted as plain paragraphs, with no tools, HTML or fetches.
- **D-233:** the main process makes every request; the window never holds a key.

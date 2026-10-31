# Rewrite with AI design

> [!NOTE]
> **TL;DR.** Three surfaces, all from the design system. The **Rewrite dialog** (view `rewrite`: Dialog size m with the passage, the Writer line, a prompt, three preset toggles, Cancel and Generate). The **in-place stream** in the editor (EditorSurface's rewrite decoration: a rainbow shimmer, the rainbow text, then a 1 s hold and 3 s fade), with a toast that offers Stop. **Settings → AI** (a section of view `settings`: the Writer menu, connection rows, Find on this computer and the Add connection form with the new SecureKeyField). Every colour and timing is a token (`ref.rewrite.*`, `rewrite.*`, `cmp.editorSurface.rewrite.*`). Built on 31 October (D-256, D-257); live Markdown while streaming and platform key names are in progress.

Serves UC-RWR-01, UC-RWR-02 and UC-RWR-05 to UC-RWR-09 under CP-RWR-01; the flow is in [Rewrite with AI](../experience/rewrite-with-ai.md) and [Settings → AI](../experience/ai-settings.md), and the IA rows and design decisions DD-RWR-01 to DD-RWR-09 are in the [information architecture](information-architecture.html#rewrite-with-ai).

## What people expect

A rewrite should feel like the words changing where they are, not a detour through another screen. Word, Google Docs and Notion rewrite a selection next to it; Craft makes one AI edit one undo step; iA Writer colours AI text. Focus Notes keeps the selection where it is, shows the new words arriving there, marks them only for a few seconds, and lets undo be the way back. See [the comparison](../experience/rewrite-with-ai.md#what-people-expect).

## Surfaces

| Surface | Built from | Where | IA |
| --- | --- | --- | --- |
| Rewrite dialog | `Dialog` (size m, height content), `Surface` sunken with caption `Text` and the passage, caption `Text` for the Writer, `TextField` multiline, three `Button`s (subtle, s, toggle), `Inline` of `Button`s | `packages/views/views/rewrite.view.json`, overlay view, focus on `rewritePrompt` | IA-CMP-REWRITEPROMPT |
| In-place stream | EditorSurface's rewrite decoration classes `pending`, `streaming`, `fading` (`rewriteClasses` in `EditorSurface.css.ts`) over a ProseMirror inline decoration (`RewriteDecoration` in `packages/editor/src/rewrite-stream.ts`) | The note | IA-CMP-REWRITEREVIEW |
| Rewrite toast | The app's toast with an action: "Rewriting with {name}… Press Esc to stop." and **Stop** | Bottom of the window | IA-CMP-REWRITEREVIEW |
| Settings → AI | `Heading`, `Text`, `Menu` triggers for the Writer, service and model, connection rows (`Surface`, `Text`, a badge, `Button`s), the found list, `TextField`s, `SecureKeyField`, `Button`s | The `ai` section of `packages/views/views/settings.view.json` | IA-VIEW-REWRITESETTINGS, IA-CMP-REWRITESTATUS, IA-CMP-AIDISCOVER |
| API key field | **SecureKeyField**, a new compound: a password `TextField` and a **Save** `Button`. The key goes out once in the `save` event and the field clears; it's never bound to a view model | Add connection and Change | IA-CMP-AIKEY |
| First-send confirmation (planned) | `Dialog` with the service, address and On this computer or Cloud; **Cancel**, **Send** | Before the first send to a connection | IA-VIEW-REWRITECONSENT |

The text menu gets a plain `rewrite` entry (Windows and Linux; the page runs it, never the shell) and the Edit menu lists `rewrite.open`. The editor's canvas view wires three new EditorSurface events: `rewriteCapture` → `rewrite.captured`, `rewriteBegan` → `rewrite.began`, `rewriteCancel` → `rewrite.cancel`.

Also part of this work: the owner's **modal scroll-to-edges** fix (be8807f9, on `main`; UI-09, D-111). A dialog's block padding moves into the part at each edge. A fixed header or footer keeps it as padding; a scrolling body at the top or bottom holds it inside the scroller, with scroll padding and rounded inner corners. Content now scrolls right up to the dialog's edge and keeps its spacing at rest; Settings → AI, a long scrolling section, is where it shows most.

## States

### Rewrite dialog

| State | Shows | Primary action |
| --- | --- | --- |
| No Writer | Passage; "Rewrite needs an AI service. Add one in Settings → AI." (announced) | **Set up AI** (primary, settings icon); **Cancel** |
| Empty prompt | Passage; Writer line; empty prompt with "Make it clearer and warmer" | **Generate** disabled: "Add a prompt or choose a preset" |
| Preset chosen | The preset's prompt ("Make it concise", "Make it warmer", "Fix the grammar"); that toggle pressed | **Generate** |
| Own prompt | The prompt typed; no toggle pressed | **Generate** |

Rest, hover, pressed, focus and disabled come from Button, TextField and Dialog. The dialog fits 480 × 360: at the compact size class Dialog goes full screen.

### In-place stream

| State | Class | Looks like | Reduced motion | Forced colours |
| --- | --- | --- | --- | --- |
| Waiting for the first words | `pending` | The selected text in the rainbow, shimmering left to right (`rewrite.shimmerDuration`, 1.5 s, linear, looping) | A still rainbow | Ordinary `CanvasText` |
| Streaming | `streaming` | The new text in the moving rainbow | A still rainbow | Ordinary `CanvasText` |
| Done | `fading` | The rainbow holds `rewrite.fadeDelay` (1 s), then the text fades to its own ink over `rewrite.fadeDuration` (3 s); the decoration is removed when the animation ends | Ordinary text at once | Ordinary `CanvasText` |
| Stopped or error | none | The original, ordinary | — | — |

The decoration is never part of the note: it isn't in the Markdown, the clipboard or the undo history. While it streams the note is read-only, so the caret and typing don't mix with the answer.

### Settings → AI

| Part | States |
| --- | --- |
| Section | No connections (empty text with **Add connection** and **Find on this computer**); connections; form open (Add connection hidden) |
| Row | Writer or Saved badge; key saved, none or not needed; never tested, testing, passed, failed, error |
| Find on this computer | Rest; looking; found some; found none |
| Form | Each service's own fields; models: none, finding, list, none available, error; Save disabled with reason, saving, saved, failed |

## Words

Every word is a message key in `packages/views/messages/en.json` (I18N-04). The full Settings list is in [Settings → AI](../experience/ai-settings.md#errors).

| Key | Words |
| --- | --- |
| `rewrite.title`, `rewrite.close` | Rewrite · Dismiss rewrite |
| `rewrite.selected`, `rewrite.prompt`, `rewrite.placeholder` | Selected passage · Prompt · Make it clearer and warmer |
| `rewrite.preset.concise`, `.warmer`, `.grammar` | Make concise · Make warmer · Fix grammar |
| `rewrite.preset.*.prompt` | Make it concise · Make it warmer · Fix the grammar |
| `rewrite.generate`, `rewrite.cancel`, `rewrite.emptyReason` | Generate · Cancel · Add a prompt or choose a preset |
| `rewrite.writer` | Writer: {name} · {detail} |
| `rewrite.setupNeeded`, `rewrite.setup` | Rewrite needs an AI service. Add one in Settings → AI. · Set up AI |
| `rewrite.selectFirst` | Select some text to rewrite first. |
| `rewrite.running`, `rewrite.stop` | Rewriting with {name}… Press Esc to stop. · Stop |
| `rewrite.started` | Rewriting the selection. The note is locked until it's done. |
| `rewrite.replaced` | Rewrite finished. Ctrl+Z puts the original back. |
| `rewrite.stopped` | Rewrite stopped. The original text is back. |
| `rewrite.error.stale` | The note changed after you selected the text. Select it again and rewrite. |
| `ai.error.provider-empty` | The service sent back no text. The original is unchanged. |
| `textMenu.rewrite`, `command.rewrite.open` | Rewrite… |

Two message fixes are in progress (RWR-85): the shortcut shown for `rewrite.open` is the platform's (<kbd>Ctrl+Shift+R</kbd>, <kbd>⇧⌘R</kbd>), and `rewrite.replaced` names the platform's undo key. Two command titles still describe the dropped design and should change with them: `command.rewrite.generate` says "Generate rewrite options" (should be "Generate a rewrite") and `command.rewrite.captured` is internal.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `ref.rewrite.purple`, `.red`, `.orange`, `.blue` | `#8854d0`, `#d34b65`, `#bc6a20`, `#3973cb` | The rainbow's stops |
| `rewrite.purple`, `.red`, `.orange`, `.blue` | the `ref` stops | Semantic aliases |
| `rewrite.shimmerDuration` | `{ref.duration.1500}` | One sweep of the shimmer |
| `rewrite.fadeDelay` | `{ref.duration.1000}` | How long finished text keeps the rainbow |
| `rewrite.fadeDuration` | `{ref.duration.3000}` | The fade back to ordinary ink |
| `cmp.editorSurface.rewrite.*` | the semantic tokens | What EditorSurface reads |

The gradient runs purple → red → orange → blue → purple across 200% of the text's width. The same stops serve light and dark today; contrast of every frame against both backgrounds (4.5:1) is not yet measured (A11Y-03, DSY-14). D-252's separate light and dark stops were dropped with D-256.

## Accessibility

- **Keyboard:** <kbd>Ctrl+Shift+R</kbd> opens; <kbd>Tab</kbd> moves through the prompt, the presets, Cancel and Generate; <kbd>Esc</kbd> closes the dialog, or stops a rewrite wherever focus is. The presets are toggle buttons with a pressed state.
- **Focus:** the prompt takes focus when the dialog opens; after Generate, Cancel or a stop, focus is back in the note.
- **Screen reader:** the start, a stop, the finish and errors are announced; text pieces are never announced one by one. The "Rewrite needs an AI service" line is announced when it appears.
- **Colour and motion:** the rainbow is never the only signal: the toast says it's rewriting and the finish is announced. Reduced motion has no shimmer or fade; forced colours show ordinary text.
- **Still to check (A11Y-03, FOC-07):** a full screen-reader pass, contrast of every gradient frame, and that the decoration never hides the paragraph focus band, the caret or spelling underlines.

## Visual score

Not yet scored. The dialog is one passage, one line, one field, three toggles and two buttons, with no sentences describing what the UI could show; Settings → AI uses rows, badges and menus rather than prose. A score of at least 70 (80 for the empty state) and gallery stories for each state above, in light, dark and contrast, are WP-AI.9's (DSY-14).

## Decisions

- **D-256:** the prompt-only dialog, in-place stream, rainbow timings and one undo step; supersedes D-243, D-250, D-251 and D-252.
- **D-257:** Settings → AI with 26 service kinds.
- **D-111:** dialogs; the scroll-to-edges fix follows it.

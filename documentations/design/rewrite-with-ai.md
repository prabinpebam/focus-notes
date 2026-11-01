# Rewrite with AI design

**Settings single-list update (D-267, built on own-ai-default-list-build):** UC-RWR-05/UC-RWR-08, DD-RWR-07/DD-RWR-08 and AIS-16 use ItemCard's native radio choice area, with identity inside the label and Test/Change/Remove outside it. Native grouped inputs support 30 rows and arrow/Space selection. Checked state and Default badge use the saved Writer ID shared with Rewrite, never another store. Existing itemCard surface/action/focus tokens distinguish selection in light/dark/narrow states; pending disables conflicting choices and actions, failure retains Default and reports its reason. One Find on this PC action and scan line replace the local section. The contract, fixtures and schemas are updated. See [Settings anatomy](../experience/ai-settings.md#single-list-default-choice-d-267-planned) and [observable checks](../plan/definition-of-done.md#settings-ai-single-list-stage). Integration and owner acceptance remain pending. design

> [!NOTE]
> **TL;DR.** Three surfaces: an **inline, non-modal Rewrite popover** with active integration, remembered picker, prompt and presets; the **in-place stream** with rainbow and Stop; and **Settings → AI**. No passage preview or first-send disclaimer/consent. The selection stays visible in the scrollable document and anchors the popover (D-265); the visible integration and the person's judgement are the disclosure (D-266, D-261, D-262). The popover and prompt-loss confirmation are built in WP-AI.14, pending candidate integration and the owner's review.

Serves UC-RWR-01, UC-RWR-02 and UC-RWR-05 to UC-RWR-11 under CP-RWR-01; the flow is in [Rewrite with AI](../experience/rewrite-with-ai.md) and [Settings → AI](../experience/ai-settings.md), and the IA rows and design decisions DD-RWR-01 to DD-RWR-11 are in the [information architecture](information-architecture.html#rewrite-with-ai).

**Integration identities (D-263, DD-RWR-07, AIS-03).** Settings connection cards and the Rewrite integration card use the same `aiConnectionIcon(kind)` mapping through the existing Icon primitive, alongside the name, never instead of it. The Rewrite view model maps its Writer's provider kind to the card's icon. The mark is decorative; standalone usage supplies `label`. All paths inherit `currentColor` and existing `cmp.icon.size` tokens, including contrast contexts. Neutral fallbacks do not imitate missing brands. Sources, licences and restricted-logo fallbacks are in the [component catalog](system/components.md#integration-icons); no new token, wait or AI transport is introduced.

## What people expect

A rewrite should feel like the words changing where they are, not a detour through another screen. Word, Google Docs and Notion rewrite a selection next to it; Craft makes one AI edit one undo step; iA Writer colours AI text. Focus Notes keeps the selection where it is, shows the new words arriving there, marks them only for a few seconds, and lets undo be the way back. See [the comparison](../experience/rewrite-with-ai.md#what-people-expect).

## Surfaces

| Surface | Built from | Where | IA |
| --- | --- | --- | --- |
| Rewrite popover | Existing `Positioner` with a dedicated `rewrite` fragment anchor and `Surface`, token-only sizing/spacing/placement; `ItemCard` with service title, model detail, locality badge and kind-keyed icon slot; `MenuButton` select for several connections; multiline `TextField`, preset `Button`s and action `Inline`. No passage surface or disclaimer | `packages/views/views/rewrite.view.json`, `vm.rewrite`, focus on `rewritePrompt` | IA-CMP-REWRITEPROMPT; DD-RWR-01, DD-RWR-09, DD-RWR-10 |
| In-place stream | EditorSurface's rewrite decoration classes `pending`, `streaming`, `fading` (`rewriteClasses` in `EditorSurface.css.ts`) over a ProseMirror inline decoration (`RewriteDecoration` in `packages/editor/src/rewrite-stream.ts`) | The note | IA-CMP-REWRITEREVIEW |
| Rewrite toast | The app's toast with an action: "Rewriting with {name}… Press Esc to stop." and **Stop** | Bottom of the window | IA-CMP-REWRITEREVIEW |
| Settings → AI | `Heading`, `Text`, `Menu` triggers for the Writer, service and model, connection rows (`Surface`, `Text`, a badge, `Button`s), the found list, `TextField`s, `SecureKeyField`, `Button`s | The `ai` section of `packages/views/views/settings.view.json` | IA-VIEW-REWRITESETTINGS, IA-CMP-REWRITESTATUS, IA-CMP-AIDISCOVER |
| API key field | **SecureKeyField**, a new compound: a password `TextField` and a **Save** `Button`. The key goes out once in the `save` event and the field clears; it's never bound to a view model | Add connection and Change | IA-CMP-AIKEY |
| Prompt-loss confirmation | Existing design-system `Dialog`: **Discard prompt?**, “Deselecting this text will lose your written prompt.” **Keep editing** (autofocused default), **Discard prompt** | Deselect with non-empty written or preset prompt; never on first send | IA-CMP-REWRITEPROMPTLOSS; DD-RWR-11 |

The text menu gets a plain `rewrite` entry (Windows and Linux; the page runs it, never the shell) and the Edit menu lists `rewrite.open`. The editor's canvas view wires `rewriteCapture` → `rewrite.captured`, `rewriteBegan` → `rewrite.began`, `rewriteCancel` → `rewrite.cancel`, and `rewriteDeselect` → `rewrite.deselected`. The existing Positioner/Surface composition is reused rather than introducing a second popover primitive; the overlay-view checker permits this anchored layout beside the loss Dialog.

Also part of this work: the owner's **modal scroll-to-edges** fix (be8807f9, on `main`; UI-09, D-111). A dialog's block padding moves into the part at each edge. A fixed header or footer keeps it as padding; a scrolling body at the top or bottom holds it inside the scroller, with scroll padding and rounded inner corners. Content now scrolls right up to the dialog's edge and keeps its spacing at rest; Settings → AI, a long scrolling section, is where it shows most.

## States

### Rewrite popover

| State | Shows | Primary action |
| --- | --- | --- |
| No Writer | "Rewrite needs an AI service. Add one in Settings → AI." (announced); no passage preview | **Set up AI** (primary, settings icon); **Cancel** |
| Empty prompt | Integration card; empty prompt with "Make it clearer and warmer" | **Generate** disabled: "Add a prompt or choose a preset" |
| Several connections | Same card plus an AI integration menu; each item names connection, service, model and locality; current item checked | Choose one; saved choice updates card without losing the prompt |
| Saving a choice | Old card stays, prompt remains editable; the task tracker's delayed "Remembering your choice…" sign | Generate waits for persistence; Cancel remains available |
| Choice save failed | Old card and choice remain; one error toast | Retry or keep the previous integration |
| Deselect, empty prompt | Popover dismisses immediately; no confirmation, nothing sent | Ordinary editing |
| Deselect, written or preset prompt | Prompt-loss confirmation; original selection and prompt retained pending decision | **Keep editing** restores selection and prompt focus; **Discard prompt** dismisses and clears draft, sending nothing |
| Selection and dialog in view | Popover follows one retained fragment vertically, keeping its initial x and side | Scroll document, type prompt, use controls |
| Selection or dialog beyond an edge | One edge-pinned Button with arrow and “Return to selection above/below”; mounted prompt is inert and hidden, not discarded | Return scrolls the selection into view and restores the prompt; ordinary scrolling back also reverses the morph |
| Preset chosen | The preset's prompt ("Make it concise", "Make it warmer", "Fix the grammar"); that toggle pressed | **Generate** |
| Own prompt | The prompt typed; no toggle pressed | **Generate** |

Rest, hover, pressed, focus and disabled come from design-system components. The prompt is never full-screen or modal. It is at most the existing popover width (360 px), bounded by viewport width. **1 November 15:36 feedback, UX/UI verdict pending:** the textarea starts at exactly two lines, using font/leading/padding/border tokens, grows and shrinks with content to `areaMaxHeight` or remaining viewport room, and alone scrolls past that maximum. Surface scrolling and its reserved gutter are removed. One initial x and fragment/side survive scrolling; scroll updates apply a transform without resetting or measuring panel size. Content/viewport resize alone refreshes size and textarea room. Edge changes fade between the retained prompt and one native return button, using Positioner motion tokens; reduced motion disables fades and smooth return scrolling. Prompt input stays mounted; focus moves out of the inert panel and returns when appropriate. No backdrop, inert document or focus trap.

### Selection anchoring and dismissal

- Track the captured editor range, not the native selection after focus moves to the prompt. Preserve its visible selection decoration while prompt controls have focus; using presets or the integration menu is not deselecting.
- Use exact selected fragment rectangles, not just their bounding box. Choose one visible fragment, side and x on opening; retain them through scrolling, with width constrained by token gutters.
- Apply vertical transforms in the rendering frame without per-scroll panel-size resets. Refresh panel size and textarea room only on content/viewport resize. When selection or dialog crosses an edge, fade into one directional return Button; its action scrolls the selection into view and restores the same mounted prompt. Reduced motion disables fades and smooth scrolling.
- A collapsed or replaced editor selection is deselection. Empty means zero prompt characters; whitespace and presets count as written input. Empty drafts dismiss immediately. Non-empty drafts keep the original captured range and input until confirmation: **Keep editing** (also confirmation Escape) restores both; **Discard prompt** accepts deselection, clears the draft and closes the popover. No network request or note write occurs.
  - Finish a pointer-selection gesture before opening the confirmation, then publish in the next frame. Restore both the editor range and the native selection observer's snapshot: clicking the same deselected caret again must still count. Reopening Rewrite focuses the existing draft rather than resetting it.
- Escape or Cancel explicitly dismisses the popover without sending. A document outside click that deselects follows the prompt-loss rule, not generic popover auto-close. Editing remains available before Generate; a document revision change invalidates the captured rewrite and must never send stale text (RWR-75).

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
| Find on this computer | Rest; looking with earlier results kept; found servers; supported signed-in Copilot added directly; CLI signed-out, unsupported-version or unknown with a reason; found none. Copilot is Cloud, never an on-device model (D-264). |
| Form | Each service's own fields; models: none, finding, list, none available, error; Save disabled with reason, saving, saved, failed |

## Words

Every word is a message key in `packages/views/messages/en.json` (I18N-04). The full Settings list is in [Settings → AI](../experience/ai-settings.md#errors).

| Key | Words |
| --- | --- |
| `rewrite.title`, `rewrite.close` | Rewrite · Dismiss rewrite |
| `rewrite.prompt`, `rewrite.placeholder` | Prompt · Make it clearer and warmer |
| `rewrite.preset.concise`, `.warmer`, `.grammar` | Make concise · Make warmer · Fix grammar |
| `rewrite.preset.*.prompt` | Make it concise · Make it warmer · Fix the grammar |
| `rewrite.generate`, `rewrite.cancel`, `rewrite.emptyReason` | Generate · Cancel · Add a prompt or choose a preset |
| `rewrite.writer` | Writer: {name} · {detail} |
| `rewrite.integration`, `rewrite.integration.saving`, `rewrite.integration.saved` | AI integration · Remembering your choice… · Choice remembered. |
| `ai.where.local`, `ai.where.cloud` | This computer · Cloud |
| Planned prompt-loss messages | Discard prompt? · Deselecting this text will lose your written prompt. · Keep editing · Discard prompt |
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

- **Keyboard:** <kbd>Ctrl+Shift+R</kbd> opens; <kbd>Tab</kbd> moves through integration, prompt, presets and actions without trapping focus; <kbd>Esc</kbd> closes the popover, or stops a rewrite wherever focus is. The presets are toggle buttons with a pressed state. The confirmation uses Dialog's focus trap, with Keep editing as the safe default and Escape equivalent to Keep editing.
- **Focus:** the prompt takes focus when the popover opens; editor selection stays visibly decorated. Generate or Cancel returns focus to the note; Keep editing restores the captured selection and prompt focus. Discard prompt preserves the person's new document caret/selection.
- **Screen reader:** the start, a stop, the finish and errors are announced; text pieces are never announced one by one. The "Rewrite needs an AI service" line is announced when it appears.
- **Colour and motion:** the rainbow is never the only signal: the toast says it's rewriting and the finish is announced. Reduced motion has no shimmer or fade; forced colours show ordinary text.
- **Still to check (A11Y-03, FOC-07):** a full screen-reader pass, contrast of every gradient frame, and that the decoration never hides the paragraph focus band, the caret or spelling underlines.

## Visual score

Not yet scored. The popover is one integration line, one field, three toggles and two buttons, with no passage preview or disclaimer; Settings → AI uses rows, badges and menus rather than prose. A score of at least 70 (80 for the empty state) and gallery stories for each state above, in light, dark and contrast, are WP-AI.9's (DSY-14). WP-AI.14 checks visible anchoring and confirmation in light/dark and at 480 × 360 before owner review.

## Decisions

- **D-256:** the prompt-only dialog, in-place stream, rainbow timings and one undo step; supersedes D-243, D-250, D-251 and D-252.
- **D-257:** Settings → AI with 26 service kinds.
- **D-111:** dialogs; the scroll-to-edges fix follows it.
- **D-265:** the selection-anchored inline popover and draft-preserving deselection rules replace D-256's modal prompt.
- **D-266:** no first-send disclaimer or consent; active integration disclosure and user judgement replace it, extending D-261.

# Rewrite with AI

> [!NOTE]
> **TL;DR.** Select text in a note, press <kbd>Ctrl+Shift+R</kbd> (<kbd>⇧⌘R</kbd> on macOS) or choose **Rewrite…** in the text menu, type a prompt or pick a preset, and press **Generate**. The note locks, your selection shimmers, and the answer from the AI service you chose streams in over it in a rainbow that fades. One <kbd>Ctrl+Z</kbd> gives back your exact original; <kbd>Esc</kbd>, **Stop** or any error puts it back too. Focus Notes only connects to a service you run or pay for; it never runs a model. Built on 31 October (D-256) and open in the owner's review build; not yet on `main`. Live Markdown while streaming and platform key names are in progress.

| Promise | Scenario | User can | Surface | Requirements and decisions |
| --- | --- | --- | --- | --- |
| CP-RWR-01 | SC-RWR-01 | UC-RWR-01, UC-RWR-02, UC-RWR-06 | IA-CMP-REWRITEPROMPT, IA-CMP-REWRITEREVIEW | RWR-70 to RWR-78, RWR-82 to RWR-86; DD-RWR-01, DD-RWR-02, DD-RWR-04 |
| CP-RWR-01 | SC-RWR-03 | UC-RWR-02, UC-RWR-07 | IA-CMP-REWRITEREVIEW | RWR-79 to RWR-81; DD-RWR-03 |
| CP-RWR-01 | SC-RWR-04 | UC-RWR-05, UC-RWR-08, UC-RWR-09 | IA-VIEW-REWRITESETTINGS, IA-CMP-REWRITESTATUS, IA-CMP-AIKEY, IA-CMP-AIDISCOVER, IA-VIEW-REWRITECONSENT | AIS-01 to AIS-15; DD-RWR-05 to DD-RWR-09 ([Settings → AI](ai-settings.md)) |

The [design](../design/rewrite-with-ai.md) holds the surfaces, states, words and tokens; the [engine](../architecture/rewrite-engine.md) how the stream reaches the note; [providers](../architecture/rewrite-providers.md) the services and how each is called; the [acceptance matrix](../plan/rewrite-acceptance.md) what proves each row. Decisions: [D-256 and D-257](../plan/decisions.md#rewrite-with-ai-as-built-31-october-2026), with D-233 kept and D-255 for how checks are sized while the owner reviews.

## What people expect

Official documentation, checked 30 October 2026. These products show the interaction, not our timings.

| Product | What it does | What Focus Notes does |
| --- | --- | --- |
| [Word: edit with Copilot](https://support.microsoft.com/en-us/word/copilot/edit-with-copilot-in-word) | Rewrites selected text with Replace, Insert below and Regenerate | Replaces in place straight away; undo is the way back, so there's no Replace step |
| [Google Docs: Gemini](https://support.google.com/docs/answer/13447609?hl=en) | Refine selected text: tone, length, a custom prompt | Three presets that fill the prompt, and a prompt of your own |
| [Notion AI](https://www.notion.com/help/notion-ai-faqs) | Rewrite a selection with an instruction | The same, from a small dialog, with the service you chose |
| [Craft: editing](https://support.craft.do/en/ai-assistant/editing) | One AI edit is one undo step | One rewrite is one undo step (RWR-79) |
| [iA Writer Authorship](https://ia.net/writer/support/editor/authorship) | Marks AI text with a colour, kept as metadata | A rainbow that fades in seconds and is never saved (RWR-78) |

## The flow

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 330" role="img" aria-labelledby="fnrw-flow__title fnrw-flow__desc" preserveAspectRatio="xMidYMid meet" data-slate-safe-margin="24">
<title id="fnrw-flow__title">Rewrite in place: select, prompt, generate, stream, done; Stop or an error puts the original back</title>
<desc id="fnrw-flow__desc">Five boxes left to right. Select text, then Ctrl+Shift+R or Rewrite… in the text menu. The dialog: a prompt or a preset, then Generate, which closes it. Generating: the note is locked and the selection shimmers. Streaming: the first text replaces the selection and the answer arrives in place in a rainbow. Done: one undo step, the rainbow holds one second and fades over three. Below, from generating and streaming: Esc, Stop or an error puts the exact original back and unlocks the note.</desc>
<g id="fnrw-flow__boxes">
<rect id="fnrw-flow__b1" x="24" y="40" width="168" height="130" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="40" y="72" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnrw-flow__b1" data-slate-fit-padding="14">Select</text>
<text x="40" y="102" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b1" data-slate-fit-padding="14">Ctrl+Shift+R, or</text>
<text x="40" y="124" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b1" data-slate-fit-padding="14">Rewrite… in the</text>
<text x="40" y="146" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b1" data-slate-fit-padding="14">text menu</text>
<rect id="fnrw-flow__b2" x="218" y="40" width="168" height="130" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="234" y="72" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnrw-flow__b2" data-slate-fit-padding="14">Prompt</text>
<text x="234" y="102" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b2" data-slate-fit-padding="14">Type it, or pick</text>
<text x="234" y="124" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b2" data-slate-fit-padding="14">a preset; Generate</text>
<text x="234" y="146" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b2" data-slate-fit-padding="14">closes the dialog</text>
<rect id="fnrw-flow__b3" x="412" y="40" width="168" height="130" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="428" y="72" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnrw-flow__b3" data-slate-fit-padding="14">Generating</text>
<text x="428" y="102" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b3" data-slate-fit-padding="14">Note locked;</text>
<text x="428" y="124" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b3" data-slate-fit-padding="14">selection shimmers;</text>
<text x="428" y="146" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b3" data-slate-fit-padding="14">toast with Stop</text>
<rect id="fnrw-flow__b4" x="606" y="40" width="168" height="130" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="622" y="72" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnrw-flow__b4" data-slate-fit-padding="14">Streaming</text>
<text x="622" y="102" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b4" data-slate-fit-padding="14">First text replaces</text>
<text x="622" y="124" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b4" data-slate-fit-padding="14">the selection; it</text>
<text x="622" y="146" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b4" data-slate-fit-padding="14">grows in a rainbow</text>
<rect id="fnrw-flow__b5" x="800" y="40" width="176" height="130" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="816" y="72" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="17" font-weight="600" data-slate-fit-target="fnrw-flow__b5" data-slate-fit-padding="14">Done</text>
<text x="816" y="102" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b5" data-slate-fit-padding="14">One undo step;</text>
<text x="816" y="124" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b5" data-slate-fit-padding="14">rainbow holds 1 s,</text>
<text x="816" y="146" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__b5" data-slate-fit-padding="14">fades over 3 s</text>
</g>
<g id="fnrw-flow__arrows" stroke="var(--color-neutral-fg-2)" stroke-width="2" fill="none">
<path d="M194 105 H214" /><path d="M208 99 L214 105 L208 111" />
<path d="M388 105 H408" /><path d="M402 99 L408 105 L402 111" />
<path d="M582 105 H602" /><path d="M596 99 L602 105 L596 111" />
<path d="M776 105 H796" /><path d="M790 99 L796 105 L790 111" />
<path d="M496 172 V230" /><path d="M690 172 V230" />
</g>
<rect id="fnrw-flow__stop" x="412" y="230" width="362" height="76" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" stroke-dasharray="6 4" />
<text x="428" y="262" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fnrw-flow__stop" data-slate-fit-padding="14">Esc, Stop or an error</text>
<text x="428" y="288" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fnrw-flow__stop" data-slate-fit-padding="14">The exact original comes back; the note unlocks</text>
</svg>
<figcaption>The rewrite flow as built. Nothing waits for an Accept: the result is in the note, and undo is the way back.</figcaption>
</figure>

<ol class="slate-steps">
  <li class="slate-step">
    <p class="slate-step__title">Select and open</p>
    <p>Select text in an editable note, then press <kbd>Ctrl+Shift+R</kbd> (<kbd>⇧⌘R</kbd>), choose <strong>Rewrite…</strong> in the text menu (Windows and Linux) or the Edit menu, or run it from Spotlight. With nothing selected, nothing opens and the screen reader hears "Select some text to rewrite first." (RWR-72)</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Prompt</p>
    <p>The Rewrite dialog shows the selected passage, the Writer ("Writer: Ollama · Ollama · llama3.2 · On this computer"), the prompt, focused, and three presets: <strong>Make concise</strong>, <strong>Make warmer</strong>, <strong>Fix grammar</strong>. A preset fills the prompt and never sends. <strong>Generate</strong> stays disabled until the prompt has text. With no Writer, the dialog says "Rewrite needs an AI service. Add one in Settings → AI." and offers <strong>Set up AI</strong> instead (RWR-73, RWR-74).</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Generate</p>
    <p><strong>Generate</strong> closes the dialog. The note becomes read-only and the selection shimmers in the AI rainbow. A toast says "Rewriting with Ollama… Press Esc to stop." with <strong>Stop</strong>. If the note changed since you selected, nothing is sent: "The note changed after you selected the text. Select it again and rewrite." (RWR-75, RWR-76)</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Stream in place</p>
    <p>The first text replaces the selection, and the answer grows there in the rainbow gradient. Blank lines in the answer become new paragraphs. Nothing outside the selection changes (RWR-77). In progress (2616070c, not yet in the review build): Markdown in the answer shows formatted as it streams, and the note keeps the answer's content, saved in the note's canonical Markdown style (`* ` bullets become `- `, `__bold__` becomes `**bold**`), not the service's exact bytes (RWR-84).</p>
  </li>
  <li class="slate-step">
    <p class="slate-step__title">Done</p>
    <p>The note unlocks with the caret after the new text. The rainbow holds for a second, then fades over three. The screen reader hears "Rewrite finished. Ctrl+Z puts the original back." One <kbd>Ctrl+Z</kbd> gives back your exact original; <kbd>Ctrl+Y</kbd> brings the rewrite back (RWR-78, RWR-79).</p>
  </li>
</ol>

## Entry points

| Entry | Where | Command |
| --- | --- | --- |
| <kbd>Ctrl+Shift+R</kbd> (<kbd>⇧⌘R</kbd>) | A note, with text selected | `rewrite.open` (Writer layer, KEY-08) |
| **Rewrite…** in the text menu | Right-click on selected text in an editable note (Windows and Linux; the macOS text menu has no entry yet) | the `rewrite` text-menu entry runs `rewrite.open` |
| **Rewrite…** in the Edit menu | The menu bar | `rewrite.open` |
| **Rewrite…** in Spotlight | Spotlight's commands | `rewrite.open` (SPT-09) |

Every entry runs the same command: the editor captures the selection, and the dialog opens on it. The command is disabled while no note is ready, and on the web, where there's no AI bridge (RWR-71, RWR-72).

## States

| State | You see | What you can do | Your note |
| --- | --- | --- | --- |
| Closed | The note | Select text; <kbd>Ctrl+Shift+R</kbd> | Ordinary editing |
| Dialog, no Writer | The passage and "Rewrite needs an AI service. Add one in Settings → AI." | **Set up AI**, **Cancel**, <kbd>Esc</kbd> | Unchanged |
| Dialog, ready | The passage, the Writer line, the prompt and presets | Type, pick a preset, **Generate**, **Cancel**, <kbd>Esc</kbd> | Unchanged |
| Generating | The selection shimmering; the toast with **Stop** | <kbd>Esc</kbd> or **Stop** | Read-only; not handed over for saving |
| Streaming | The answer growing in place in the rainbow | <kbd>Esc</kbd> or **Stop** | Read-only; streamed pieces are outside the undo history |
| Done | The new text, fading to ordinary ink | Edit; <kbd>Ctrl+Z</kbd> for the original | One undo step; saved as usual |
| Stopped | The original, exactly | Edit; rewrite again | "Rewrite stopped. The original text is back." |
| Error | The original, exactly, and an error toast | Fix as the toast says; rewrite again | Unchanged |

## Stop, undo and errors

- **Stop:** <kbd>Esc</kbd>, wherever focus is, or **Stop** in the toast. The request in the main process is aborted, the original comes back outside the undo history, and the note unlocks (RWR-80).
- **Undo:** the streamed pieces never enter the history. When the answer is complete, the note goes back to the original for an instant (outside the history) and the whole answer goes in as one closed step. <kbd>Ctrl+Z</kbd> restores the selection exactly; <kbd>Ctrl+Y</kbd>, <kbd>Ctrl+Shift+Z</kbd> or <kbd>⇧⌘Z</kbd> redoes it (RWR-79).
- **Errors:** every failure restores the original and unlocks the note, with the reason in plain words: "Couldn't reach the service. Check the address and your connection, or start the local server.", "The service refused the key. Check it in Settings → AI.", "The service took too long to answer. Try again.", "The service sent back no text. The original is unchanged." and the rest of the list in [the design's words](../design/rewrite-with-ai.md#words) (RWR-81, AIS-11).
- **Leaving mid-rewrite (RWR-86):** switching or closing the note stops the request in the main process and clears its toast, and the new note never gets the old one's text. Closing or reloading the window stops it too.

## What is sent, and where

Only the prompt and the selected text, with a fixed instruction to reply with just the rewritten text in the same language, go to the Writer's address, from the main process (RWR-83). Nothing else from the note: no title, path, front matter or other text. A thinking model's thoughts never go into the note. Nothing is sent before you've confirmed the connection once (AIS-14), or from a private note while *Don't send private notes* is on (AIS-13). Limits: 32 KiB of text, 4,000 characters of prompt, 4,096 tokens of answer; the answer must start within 30 seconds (2 minutes from a server on this computer, which may be loading its model) and may pause for at most 30 seconds (1 minute); one rewrite at a time (RWR-82). The window never sees a key. Which service is the Writer, and whether it's on this computer or in the cloud, is set in [Settings → AI](ai-settings.md).

Planned (WP-AI.13): private notes aren't sent while **Don't send private notes** is on, and the first send to a connection asks once (AIS-13, AIS-14).

## Keyboard and accessibility

| Key | Where | Does |
| --- | --- | --- |
| <kbd>Ctrl+Shift+R</kbd> (<kbd>⇧⌘R</kbd>) | A note with text selected | Opens Rewrite (KEY-08) |
| <kbd>Tab</kbd>, <kbd>Shift+Tab</kbd> | The dialog | Prompt, presets, Cancel, Generate, close |
| <kbd>Esc</kbd> | The dialog | Closes it; nothing is sent |
| <kbd>Esc</kbd> | While it generates or streams, anywhere | Stops; the original comes back |
| <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> | After it's done | The original / the rewrite |

The prompt takes focus when the dialog opens, and focus returns to the note when it closes. The screen reader hears the start, a stop, the finish and errors, never each piece of text. With reduced motion, the shimmer and fade don't move: a still gradient while it streams, ordinary text when done. Still to check: contrast of every frame of the gradient and the paragraph focus band (FOC-07, A11Y-03).

## Platform key names (in progress)

Menus, the cheat sheet, tooltips and messages say <kbd>Ctrl+Shift+R</kbd> on Windows and Linux and <kbd>⇧⌘R</kbd> on macOS. The text menu was fixed in bb50e208; the rest, and the finish message's undo key, are being fixed on the same branch (RWR-85).

## As built

Built on `fix-ai-rewrite-simple` (commits 8e7e8766, e6e5de0c, 452e44ba, after 7adbf983 to 1309f42e for Settings → AI), in the owner's review build, not merged. Checked: `pnpm check`, the typechecks of core, editor, ui and desktop, and 745 unit tests, including `packages/editor/test/rewrite-stream.test.ts` and `apps/desktop/test/ai-rewrite.test.ts`. Not yet checked: a live service in CI (never), a Windows journey (QLT-08), the security review (SEC-09), wait measures (PRF-15) and a screen-reader pass (A11Y-03).

**Dropped (D-256):** the three options in segmented tabs, *Regenerate*, *Accept* and *Discard*, saved variations and their history, rewriting a whole file to the same or a new file, the anchored companion prompt, <kbd>Ctrl+K</kbd> for Rewrite with the link key moved (links stay on <kbd>Ctrl+K</kbd>), the save hold through review, and the fixture-first owner gate.

## Decisions

- **D-256:** in-place streaming, prompt-only dialog, one undo step, Esc and errors restore; supersedes the 30 October review design.
- **D-257:** every text service kind in the ai-integration kit; see [Settings → AI](ai-settings.md).
- **D-233:** Focus Notes is an integration client only; kept.
- **D-255:** the owner sees changes in the review build after fast checks; CI and the full suite come after acceptance.

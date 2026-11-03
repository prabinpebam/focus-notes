# Rewrite selected text with AI

Ask an AI service you chose to rewrite a few words or a paragraph, and watch the new words appear in place.

> [!NOTE]
> **TL;DR.** Select text, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac), type what you want or pick a preset, and select **Generate**. To get your words back, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once. To stop, press <kbd>Esc</kbd>.

**Applies to:** the desktop app on Windows, macOS and Linux. Rewrite isn't in the browser.

**Before you start:** connect an AI service once. See [Connect an AI service](connect-an-ai-service.md).

Already using GitHub Copilot in your terminal? **Find on this computer** can add its supported signed-in integration directly. It says **Cloud** and uses the same Rewrite and Stop flow.

**Built update (1 November):** the inline prompt and deselection behavior below are implemented in WP-AI.14 (D-265/D-266), pending integration into the owner's candidate build. The local fast checks and Try it evidence are in the [definition of done](../plan/definition-of-done.md#inline-prompt-popover-definition-of-done); this is not a `main` or release claim.

## Rewrite

1. In a note, select the words you want to change.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac). Or right-click the words and select **Rewrite…**, or open the **Edit** menu and select **Rewrite…**.
3. Check the service, model and **This computer** or **Cloud** card. With several connections, use **AI integration** to choose another. Your choice is remembered for the next rewrite.
4. In **Prompt**, say what you want, like "Make it friendlier". Or select **Make concise**, **Make warmer** or **Fix grammar** to fill it in.
5. Select **Generate**, or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (<kbd>⌘Enter</kbd> on a Mac). Plain <kbd>Enter</kbd> adds a line. Composing with an input method never sends. The active integration is the disclosure: there is no first-time warning, disclaimer or extra **Send** confirmation.

**Result:** the inline prompt closes and your note can't be edited for a moment. Your words shimmer, then the new words appear in their place, in rainbow colors. When it's done, the colors fade to normal text and you can type again.

## Write at the caret

With nothing selected, place your caret and use the same Rewrite shortcut. **Write with AI** opens there. Type your prompt and generate; only that prompt goes to the chosen integration, never the note, heading or surrounding words. Text-dependent presets are hidden. The answer is inserted at that captured caret. Stop restores the original; Undo removes the whole insertion in one step.

If the note changed after capture, nothing is sent and your prompt stays available.

## Review the selection while writing the prompt

The prompt opens beside your selected words, like an inline menu. It doesn't show a second copy of the passage. You can still scroll the note and see the selected words in context while typing.

The prompt starts two lines high and grows with what you type. Normally only the prompt field scrolls once it reaches its maximum. In a very short window, scroll the prompt itself to reach Generate and the other controls. The panel stays inside the editor and keeps its horizontal position while following the selection vertically.

When the selection or panel moves beyond an edge, one button shows **Return to selection above** or **Return to selection below**. Choose it to bring the selection and the same prompt back. Scrolling back also restores the prompt. Reduced motion turns off the fade and smooth return.

## Change your mind before generating

- With an empty prompt, deselect the text to close the prompt immediately.
- With a prompt you typed or filled from a preset, deselecting asks **Discard prompt?** and warns that your written prompt will be lost. Choose **Keep editing** to keep the prompt and original selection, or **Discard prompt** to close and clear it. <kbd>Esc</kbd> in that confirmation keeps your prompt too.
- Using the prompt, presets or integration picker doesn't deselect the words.
- **Cancel** or <kbd>Esc</kbd> in the prompt closes it without sending anything.

## Get your words back

- Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>⌘Z</kbd> on a Mac) once. Your exact words come back.
- Changed your mind again? Press <kbd>Ctrl</kbd>+<kbd>Y</kbd> (<kbd>⇧⌘Z</kbd> on a Mac) to bring the new words back.

## Stop a rewrite

- While the new words appear, press <kbd>Esc</kbd>, or select **Stop** at the bottom of the window.

**Result:** "Rewrite stopped. The original text is back." Nothing you wrote is lost.

## If something goes wrong

If the service can't answer, your words stay as they were, and a message says what happened. For example:

- "Couldn't reach the service." Check that the service is running, like Ollama, and that your computer is online.
- "The service refused the key." Check the key in **Settings** → **AI**.
- "The note changed after you selected the text." Select the words again and rewrite.

## Good to know

- Only the words you selected and your prompt are sent, and only to the service you chose. Nothing else from your note goes with them.
- Focus Notes never runs an AI model itself. It sends your words to the service you set up.
- The colors are only on screen. They aren't saved in your note.
- You decide whether to send words from a private note too. Check the integration and model before sending; **Cancel** sends nothing.
- Ollama offers both local and cloud models. The card marks the model and address, not the service name alone. See [Connect an AI service](connect-an-ai-service.md#good-to-know).

## Related

- [Connect an AI service](connect-an-ai-service.md)
- [Write](write.md)
- For the curious: [the Rewrite specification](../experience/rewrite-with-ai.md)

[Back to Help](index.md)

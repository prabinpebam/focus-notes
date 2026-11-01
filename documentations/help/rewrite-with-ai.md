# Rewrite selected text with AI

Ask an AI service you chose to rewrite a few words or a paragraph, and watch the new words appear in place.

> [!NOTE]
> **TL;DR.** Select text, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac), type what you want or pick a preset, and select **Generate**. To get your words back, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once. To stop, press <kbd>Esc</kbd>.

**Applies to:** the desktop app on Windows, macOS and Linux. Rewrite isn't in the browser.

**Before you start:** connect an AI service once. See [Connect an AI service](connect-an-ai-service.md).

**Planned update (1 November):** the inline prompt and deselection behavior below are specified in D-265/D-266 and are being built in WP-AI.14. The current review build still has the modal prompt and first-send confirmation.

## Rewrite

1. In a note, select the words you want to change.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac). Or right-click the words and select **Rewrite…**, or open the **Edit** menu and select **Rewrite…**.
3. Check the service, model and **This computer** or **Cloud** card. With several connections, use **AI integration** to choose another. Your choice is remembered for the next rewrite.
4. In **Prompt**, say what you want, like "Make it friendlier". Or select **Make concise**, **Make warmer** or **Fix grammar** to fill it in.
5. Select **Generate**. The active integration is the disclosure: there is no first-time warning, disclaimer or extra **Send** confirmation.

**Result:** the inline prompt closes and your note can't be edited for a moment. Your words shimmer, then the new words appear in their place, in rainbow colors. When it's done, the colors fade to normal text and you can type again.

## Review the selection while writing the prompt

The prompt opens beside your selected words, like an inline menu. It doesn't show a second copy of the passage. You can still scroll the note and see the selected words in context while typing.

While any selected words are on screen, the prompt follows them and stays inside the document viewport. It can scroll away only when the entire selection is offscreen. Scroll back to return to the same prompt.

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

# Rewrite selected text with AI

Ask an AI service you chose to rewrite a few words or a paragraph, and watch the new words appear in place.

> [!NOTE]
> **TL;DR.** Select text, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac), type what you want or pick a preset, and select **Generate**. To get your words back, press <kbd>Ctrl</kbd>+<kbd>Z</kbd> once. To stop, press <kbd>Esc</kbd>.

**Applies to:** the desktop app on Windows, macOS and Linux. Rewrite isn't in the browser.

**Before you start:** connect an AI service once. See [Connect an AI service](connect-an-ai-service.md).

## Rewrite

1. In a note, select the words you want to change.
2. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (<kbd>⇧⌘R</kbd> on a Mac). Or right-click the words and select **Rewrite…**, or open the **Edit** menu and select **Rewrite…**.
3. In **Prompt**, say what you want, like "Make it friendlier". Or select **Make concise**, **Make warmer** or **Fix grammar** to fill it in.
4. Select **Generate**.

**Result:** the window closes and your note can't be edited for a moment. Your words shimmer, then the new words appear in their place, in rainbow colors. When it's done, the colors fade to normal text and you can type again.

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
- Coming soon: an option to never send private notes.

## Related

- [Connect an AI service](connect-an-ai-service.md)
- [Write](write.md)
- For the curious: [the Rewrite specification](../experience/rewrite-with-ai.md)

[Back to Help](index.md)

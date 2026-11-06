# Write

Format with Markdown shortcuts, use focus mode, make tables, find anything, and rewrite with AI.

> [!NOTE]
> **TL;DR.** The articles in this section are being written. Each will be a short page that answers one question, in plain words. Until then, [open an issue on GitHub](https://github.com/prabinpebam/focus-notes/issues) if you need help with any of these.

## Articles

- [Rewrite selected text with AI](rewrite-with-ai.md)
- [Connect an AI service](connect-an-ai-service.md)

<h2 id="spotlight-keys">Actions keys</h2>

Press <kbd>Ctrl</kbd>+<kbd>/</kbd> (<kbd>⌘/</kbd> on a Mac), type a name and press <kbd>Enter</kbd> to act and close Actions, including toggles and settings. To make repeated adjustments without losing the query or focus, use <kbd>Shift</kbd>+<kbd>Enter</kbd> on a toggle or setting.

## Describe an image

Right-click an image and choose **Edit description…**. **Image description** is its alt text, read to someone who cannot see it. **Caption** is shown below the image. Choose **Save** to change both together; Undo restores both.

Choose **Add caption** or **Edit caption** to type directly below the image. Enter finishes that line. Removing all its words removes the caption; an image without a caption shows no placeholder. Descriptions and captions stay in standard Markdown as `![description](image.png "caption")` and survive reopening.

## Print images

Open the toolbar, then **More → Print…**. The system's print dialog lets you choose a printer or **Save as PDF**. Pictures fit inside the paper margins, stay on one page and keep their captions below them.

While the pictures are being prepared, **Preparing images for print…** appears at the bottom with **Cancel**. A missing picture prints its description in muted italic, or **Image unavailable** when it has no description. Printing and cancelling leave your note and image files unchanged.

## Copy, replace or save an image

Right-click one image. **Copy** puts its pixels, description and caption on the clipboard, not its file location. **Cut** does the same before removing the image from the note; Undo restores it, and its file is never deleted.

**Replace image…** copies a chosen image into the note's managed assets and keeps its description, caption and display choices. Undo restores the old reference. **Save image…** saves a separate PNG copy through the system dialog; Cancel changes nothing.

**Rounded corners** and **Limit height** change the selected images and are remembered on this device for the next insertion. Existing images keep their own choices. A failed settings save leaves the previous insertion defaults intact and says so.

## Write an image caption with AI

Right-click an image and choose **Auto caption with AI…**. Choose an image-capable connected integration; the dialog shows its model and whether it runs on this computer or in the cloud. This choice does not change your writer for rewriting. If image support cannot be confirmed, choose **Write caption** instead.

Edit the instruction, then choose **Generate caption**. Only a smaller, location-free copy of the selected image and your instruction go to that integration, not the note or its name. **Stop** cancels generation without changing the existing caption.

Review and edit the result, then choose **Use caption**. Undo restores the previous caption. The image description remains separate. If the image changed or disappeared, copy the result from its field or reopen the dialog to generate again; the stale result cannot change another image.

## Coming soon

- Write and format with Markdown shortcuts
- Use focus mode
- Make tables
- Find and replace
- Use Actions to find anything
- Change text size, theme and font

[Back to Help](index.md)

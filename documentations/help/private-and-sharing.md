# Private notes and sharing

Keep notes private, make them public, and share one with a passcode.

> [!NOTE]
> **TL;DR.** In the item-sharing candidate, **Share…** starts with the private note or folder you chose. Review its contents, choose how it opens, then copy its share information. Copying waits until the published encrypted share can actually be opened. Opening or cancelling the draft leaves existing shares unchanged.

## Review a note or folder

1. In **Files**, open the note or folder's row menu and choose **Share…**. For the note you're writing, use **⋯ → Note → Share…**.
2. Check the item's name and, for a folder, its note and folder counts. **Review contents** opens a read-only tree; expanding a folder only changes the review.
3. Choose **Done** or press Escape to return to the same draft.
4. Choose the expiry and **Link** or **Passcode**. Link starts on, Passcode starts off, and **Include notes added later** starts off for folders. Both opening methods can be off, but that draft cannot be shared.
5. Close the dialog to discard the draft. No share or website is created by opening, reviewing or cancelling.

## Copy a share

Turn on **Link**, **Passcode**, or both. Passcode offers generated words or your own strong passcode. An access code combines a random identifier and the passcode; readers enter that single code without providing a person's name.

On Windows, choose **Copy share information**, **Copy link**, or **Copy access code**. The first action saves the share and waits for the website. Nothing is copied before the encrypted share is ready. The read-only **Share information** block then shows the actual message. On macOS, the primary **Share…** action opens the system share sheet instead.

Retrying a failed publication in the same dialog reuses the saved share. Opening **Share…** again starts an independent share; it does not replace the earlier link. With **Include notes added later** off, a folder share includes only the reviewed note identities, not another note later created at the same path.

**Candidate limits:** this work is not yet merged or security-reviewed. Shared-before actions, adding newer notes, first-site setup and full large-folder review remain unfinished. Change… and template editing are not part of this increment. Today's Settings → Sharing flow remains available for existing named grants.

## Coming soon

- Public and private notes
- Make a note public or private
- Share a private note with a passcode
- Read a shared note with a link or access code
- What Focus Notes can and can't see

[Back to Help](index.md)

# Private notes and sharing

Keep notes private, publish them as web pages, and share any note with a link, an access code or both.

> [!NOTE]
> **TL;DR.** **Share…** starts with the private note or folder you chose. Review its contents, choose how it opens, then copy its share information. Copying waits until the published encrypted share can actually be opened. Opening or cancelling the draft leaves existing shares unchanged. In Files, shared and published notes carry a small badge on their icon, and **Share details…** copies, extends or withdraws a share. Editing a shared note updates its share by itself, with the same link and code.

## Review a note or folder

1. In **Files**, open the note or folder's row menu and choose **Share…**. For the note you're writing, use **⋯ → Note → Share…**. **Share…** is there for every note. If this project can't share yet, the dialog says what to do: turn sharing on, link the project to GitHub in **Settings → Project**, or move a standalone file into a project.
2. Check the item's name and, for a folder, its note and folder counts. **Review contents** opens a read-only tree; expanding a folder only changes the review.
3. Choose **Done** or press Escape to return to the same draft.
4. Choose the expiry and **Link** or **Access code**. Link starts on, Access code starts off, and **Include notes added later** starts off for folders. Both opening methods can be off, but that draft cannot be shared.
5. Close the dialog to discard the draft. No share or website is created by opening, reviewing or cancelling.

## Copy a share

Turn on **Link**, **Access code**, or both. The access code is a short identifier plus generated words, or your own strong words. Readers enter that single code, never a name.

On Windows, choose **Copy share information**, **Copy link**, or **Copy access code**. The first action saves the share and waits for the website. Nothing is copied before the encrypted share is ready. The read-only **Share information** block then shows the actual message, written to the person you send it to and ready to paste. The note under it is for you: whoever gets the message can pass it on, and copies they download stay after the share expires or you withdraw it. On macOS, the primary **Share…** action opens the system share sheet instead.

**Sharing a published note.** A published note is already a web page anyone can read, so **Share…** on it offers only **Copy link**, which copies its web address. There's no encryption and no access code.

**Publish and Unpublish.** **Publish** makes a private note a web page (it asks first). **Unpublish** takes the page down at the next publish and makes the note private again. Both are in the Files row menu and **⋯ → Note**. Sharing also puts a note on the website, but encrypted: it only opens with the link, the access code or both.

**See each step while it works.** Turning sharing on, sharing, publishing and taking a note down can take a minute or two, because GitHub has to update your website. Each step shows as it happens: done steps get a tick, the current one turns, and the time so far is shown. If a step stops, it says which one and why, with what helps (sign in to GitHub again, reconnect, or wait a few minutes), and **Retry** carries on from there. Nothing done so far is lost. If your notes back up to the same repository while your website uploads, Focus Notes uploads again on top of the backup by itself.

**Where your shares live.** In a project with public and private notes, your published pages and your encrypted shares are on one website: your project's public one. Turning sharing on there creates nothing new on GitHub.

**Moved from an older site.** If an earlier version made a separate site for your shares (named like `notes-site`), the next **Turn on sharing** moves your shares to your project's public website. Their links change, so send the new ones. Then open **Settings → Sharing** and choose **Delete old site…**. Type its name, choose **Open GitHub settings**, delete it there, and come back to choose **Check again**.

**Your website's look.** In **Settings → Sharing → Site appearance**, choose a **Theme** (Paper, Sepia, Ink or Dusk) and a **Font** (Serif, Sans or Hyperlegible). Your published notes and the page your shared notes open on both use it; your app keeps its own look. A change updates your website with the same steps as sharing, and the choices wait until it's done. If it stops, your choice is kept: choose **Retry**. **Preview site…** shows the site in a look before you choose **Apply**, which updates your website the same way.

**Deleting a shared or published note.** Focus Notes always asks before it deletes a note, and says if its link or web page goes too. It turns the link off and takes the page down first, then deletes the note. Until that's done, the note stays in Files marked *Deleting…*; point to it to see the steps. If a step stops, choose **Retry**, or **Delete anyway** to delete the note now and leave its link or page up.

Retrying a failed publication in the same dialog reuses the saved share. Once an item is shared, its menus offer **Share details…** instead of **Share…**. With **Include notes added later** off, a folder share includes only the reviewed note identities, not another note later created at the same path.

**Not available yet:** first-site setup from this dialog and full review of very large folders. Change… and template editing aren't part of this dialog. **Settings → Sharing** holds the share settings (your site, **Share information**, **Turn off sharing…**) and **Site appearance**.

## See what's shared and copy it again

In **Files**, a shared note or folder has a small person on the corner of its icon, and a published note has a globe. A note that's both has the globe above the person. The badges are in your accent colour. Point to a badge, or move to the note with the keyboard, to see in plain words who can open it and until when, for example *Shared privately · anyone with the link and code can open it · until 26 Dec* or *Published · anyone can read it on your website*. They show in **Opened files**, **Pinned**, **Recent** and the list of notes.

To copy a share again, open the shared item's row menu and choose **Share details…** or **Share…**: on a shared item, both open the same dialog. For the note you're writing, use **⋯ → Note → Share details…**. The dialog lists each of its shares that still works:

- **Copy** copies its link, its access code or its share information, at once: nothing is uploaded.
- **Extend** gives it 7, 30 or 90 more days, or no end.
- **Withdraw** turns it off after you confirm. Its icon goes once nothing shares the item.
- **Add them** shows on a folder's share when notes were added to the folder after you shared it. Choose it to add them to that share.

**Your changes reach your share by themselves.** When you edit a shared note, Focus Notes updates its share a few seconds after you stop typing, once your backup has run. The link, the access code and the expiry stay the same, and nothing else is shared. If the update can't happen (offline, for example), a notification says why, with **Retry**; it also tries again after your next change, and until then the share shows the previous version.

Only shared items offer **Share details…**. For a published note, use **Copy public link** and **Unpublish** in the same menus.

## Coming soon

- Public and private notes
- Publish or unpublish a note
- Share a private note with an access code
- Read a shared note with a link or access code
- What Focus Notes can and can't see

[Back to Help](index.md)

# Sharing and visibility

Who can read a note, and how to give specific people access with a magic link or a passcode, without any server.

> [!NOTE]
> **TL;DR.** A note is **Private** (only you), **Shared** (with people you name), or **Public** (anyone). Sharing is by **audience**: a person or group identified **only by a name** ("Asha", "Book club"). Each audience gets a **magic link**, a **passcode**, or both (D-41). The passcode can be **your own** (checked for strength) or **generated** (four random words). An audience can open notes and whole folders, until an expiry (default 30 days) or until you **withdraw** it. Readers open a link, or type **their name and the passcode**, and can stay signed in on their device. Shared notes stay in your private repository and are published only as ciphertext. Your own access in a browser uses the same scheme: the **vault** is a built-in audience, "You", that opens every private note with your vault passphrase (D-90). The cryptography follows the `personal-site` design ([Repository and publishing → Sealing](../../architecture/repository-and-publishing.html#sealing-and-share-links), [The vault](../../architecture/repository-and-publishing.html#the-vault)). View IA-VIEW-SHARE and the share reader in IA-VIEW-PUBLIC serve UC-SHARE-01 to UC-SHARE-05 and UC-READ-01 to UC-READ-02.

<h2 data-reader-personas="product design">Three levels of visibility</h2>

| Level | Who can read | Where it's stored | How it's published |
| --- | --- | --- | --- |
| **Private** | Only you (and anyone with access to your private repository) | Private repository | Only sealed in your vault, which only your vault passphrase opens |
| **Shared** | You, plus the audiences you name | Private repository | Sealed: encrypted pages that only an audience's link or passcode opens |
| **Public** | Anyone | Instance repository (`notes/`) | With the app on your GitHub Pages site, where anyone can read it, and from M5 as a normal page |

New notes are **Private** (D-05). Moving between Private and Shared changes nothing on disk except the grant records. Moving to or from Public moves the file between repositories, and always asks first ([confirmation](../components/feedback-and-dialogs.md#confirmation-dialog)).

<h2 data-reader-personas="product design">Audiences</h2>

An **audience** is one grant: a name, the ways in, what it opens, and when it ends.

| Part | Rule |
| --- | --- |
| **Name** | The only detail recorded about who it's for (owner decision). A person ("Asha") or a group ("Book club"). Unique among audiences that still work. It isn't secret: the reader types it next to the passcode. |
| **Ways in** | Magic link, passcode, or both. Both open exactly the same notes. |
| **Passcode** | **Generated** (default): four random words from the EFF large wordlist, about 52 bits, for example `harbor-maple-river-cloud`. **Your own**: any passcode that passes the strength check (at least 12 characters, and rated "strong" by the zxcvbn-ts estimator, MIT). Weak passcodes can't be saved, because a published file can be attacked offline with unlimited guesses. |
| **Opens** | Any mix of notes and folders. A folder includes notes added to it later. |
| **Expires** | 1 day, 7 days, 30 days (default), 90 days, a date, or never (with a warning). |
| **State** | Active · Expires soon (3 days or less) · Expired · Withdrawn · Waiting to publish |

**Withdraw** stops an audience at the next publish and keeps its record, so the history of who had access stays complete. **Delete** removes the record too, after a confirmation. The private repository's history keeps every change either way.

### You: the vault

Every instance has one built-in audience, **You**: the owner's own grant, whose scope is every private note and whose passcode is the **vault passphrase** set in the desktop app (D-90, SEC-08). It has no link and no expiry, can't be withdrawn or deleted here, and only the passphrase's derived key is stored. The browser opens it with *Unlock*, read-only ([Web app → Unlocking private notes](../../architecture/web-app.md#unlocking-private-notes)). It's listed first in *All people with access*, with [Change passphrase] (the same as in **Settings → Workspace**).

<h2 data-reader-personas="design product">The Share popover</h2>

Opens from ⋯ → Share and visibility, Spotlight (`> Share`), or a Files row's ⋯. A frosted popover, 380 px wide, anchored under the trigger.

| Part | Contents |
| --- | --- |
| Header | The note's title and its current level |
| **Who can read** | A three-option switch: **Only me** · **People you choose** · **Anyone (public)** |
| People you choose | A list of audiences that open this note: name, chips for *Link* and *Passcode*, "Expires in 12 days", and a ⋯ menu (Copy invite, Copy link, Show passcode, Extend, Change what it opens, Withdraw). Audiences that open the note through a folder say "via drafts/". [Add people] is at the bottom. |
| Anyone (public) | The public URL in a read-only field, [Copy link], and the status: **Live**, **Publishing…**, or **Not published yet** |
| Footer | A publish status line while changes are on their way ("Works in about 2 minutes, after publishing"), and a link to *All people with access* (Settings → Sharing) |

### Add people

1. **Name**, required and focused. A duplicate shows "There's already an active audience called Asha" and offers to add this note to it instead.
2. **Ways in:** ☑ Magic link · ☑ Passcode. For the passcode, choose *Generate* (shown in large monospaced type with [New words]) or *Choose my own* (a field with a strength meter and a plain reason when it's too weak).
3. **Opens:** this note (checked), its folder, or *Pick more…* (the [Move to picker](../components/feedback-and-dialogs.md#move-to-picker) in multi-select mode).
4. **Expires:** presets plus a date.
5. [Create] commits the grant to the private repository and starts publishing. Then the **invite** view shows the message, ready to send.

### The invite

The invite is built from a template that can be edited in **Settings → Sharing** and is stored in the private repository as `access-message.json`, like `personal-site`:

```text
Hi {name}, I've shared "{title}" with you.
Open it here: {link}
Or go to {site} and use your name "{name}" with the passcode {passcode}.
On a shared computer, use your name and the passcode: browsers remember links.
It works until {expires}.
```

Lines for a way in that the audience doesn't have are left out. [Copy invite], [Copy link], and [Copy passcode] each copy one thing. The link and passcode can be shown and copied again later, because the secret is kept in the private repository (never published).

### Withdraw and extend

- **Withdraw:** "Withdraw access for Asha? The link and passcode stop working within about 15 minutes. Anything already read can't be taken back." [Cancel] [Withdraw]. It opens on [Cancel].
- **Extend:** choose a new date. It works right away, including links already sent.

<h2 id="settings-sharing" data-reader-personas="design product">Settings → Sharing</h2>

- **All people with access:** *You* (the vault) first, then every audience with its name, ways in, what it opens, expiry, and state. Filter by Active, Expired, or Withdrawn, search by name, and act on any row.
- **Invite template:** edit the message, with the placeholders listed.
- **Share links on this workspace:** whether share-link publishing is set up (the deploy key and secret from [Creating a workspace](../../architecture/desktop-and-git.md#creating-a-workspace)), with [Set up] if it was skipped.

<h2 id="the-share-reader" data-reader-personas="design product">The share reader</h2>

The page a reader sees at `https://<user>.github.io/<workspace>/s/`, part of IA-VIEW-PUBLIC. A magic link is that page with the grant and its secret in the fragment, `s/#<grant>.<secret>`, which browsers never send to the server (D-125).

| Moment | What the reader sees |
| --- | --- |
| **Magic link** | The fragment after `#` is read and removed from the address bar at once. A brief "Opening…", then the note. Nothing to type. |
| **No link** | "This note is private", a line saying what to do, two fields, **Your name** and **Passcode**, then [Open] and [Open and remember]. The name matches whatever its letter case or spacing. |
| **Anything that doesn't open** | A wrong name or passcode, a wrong link, or an audience that has expired or been withdrawn all get the same words: "That didn't open anything. Check your name and passcode, or the link, and try again. If it still doesn't work, ask the person who shared it with you." It never says which one was wrong, whether the name exists, or whether access ever existed (D-125). |
| **Site just updated** | A note that fails to read is read once more from the new build; if it still fails, the same words as above. |
| **Signed in** | The note in the same calm reading view as public pages. An audience that opens several notes sees "Shared with you" with a list of them by title, and each note offers [All shared notes]. Links to other notes in the share stay on the page; links to anything else are plain text. Footer: [Remember on this device] (a toggle) and [Sign out on this device]. |

**Staying signed in** follows `personal-site`. By default the session is for the browser tab: a reload stays open, and closing the tab ends it there. *Open and remember* or *Remember on this device* keeps it on the device until the audience expires or is withdrawn (or, for an audience that never expires, until 30 days unused). A link always opens for its tab only. *Sign out on this device* forgets it in every open tab, and anything saved before it. A tab's session also ends after 12 hours unused. What's kept is a key the browser can use but never reveal (in IndexedDB), with the grant's ID or the name's lookup and its expiry; never the passcode, the name, or the link secret. The page hides the share when its expiry passes; access itself ends at the first publish after that (D-125).

The page removes the link's secret from the address bar at once, but the browser's own history (and its sync) may keep the address the link was opened at, so on a shared computer the name and passcode are the better way in.

<h2 data-reader-personas="product design">Design decisions</h2>

| ID | Decision | Serves | Rationale | Alternatives rejected |
| --- | --- | --- | --- | --- |
| DD-SHARE-01 | Three visibility levels: Private, Shared, Public. | UC-SHARE-01, UC-SHARE-03 | Sharing with a few people is different from publishing, and people should see that difference at a glance (CP-SHARE-01). | Two levels with sharing hidden under Private. |
| DD-SHARE-02 | An audience is identified by a name only. | UC-SHARE-03, UC-SHARE-04 | The owner asked for just the name. It's enough to recognize, extend, or withdraw access, and records nothing else about the reader. | Recording organization, purpose, or email (as `personal-site` does). |
| DD-SHARE-03 | One audience can have both a link and a passcode, opening the same notes. | UC-SHARE-03, UC-SHARE-05 | A link is easiest. A passcode works where links get mangled, or when spoken aloud. One scope keeps them consistent. | Separate grants for each way in. |
| DD-SHARE-04 | Passcodes are generated by default. Custom passcodes must pass a strength check. | UC-SHARE-03 | The owner wants custom passcodes. Static sites can't limit guesses, so weak passcodes would be cracked offline. | Any passcode allowed. Generated only. |
| DD-SHARE-05 | Readers type their name and the passcode. The name finds the right keyring. | UC-READ-02 | Only one slow key derivation runs, and the page never lists or reveals audience names. The reader already knows their name. | Trying every keyring (slow, and grows with each audience). A name word inside the passcode (makes custom passcodes awkward). |
| DD-SHARE-06 | Withdraw keeps the record. Delete removes it only after confirmation. | UC-SHARE-04 | A complete record of who had access, as in `personal-site`. | Deleting on withdraw. |
| DD-SHARE-07 | Default expiry is 30 days, replacing the earlier 1 week. | UC-SHARE-03 | Audiences now include groups, and 30 days matches `personal-site`'s suggestion. | 1 week (too short for groups). Never (forgotten access). |
| DD-SHARE-08 | No read receipts or tracking for shared notes. | UC-READ-01 | No telemetry anywhere (PRV-01, UNSUP-SHARE-02). | `personal-site`'s per-grant analytics. |
| DD-SHARE-09 | The owner's private notes in a browser are a built-in grant, "You", sealed with the same format as share grants. | UC-SETUP-07 | One format, one sealer, and one reader to secure, and the browser needs no GitHub credential (D-90). | A browser token that reads the private repository (D-81, superseded). A separate encrypted mirror repository. |

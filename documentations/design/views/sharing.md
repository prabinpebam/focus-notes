# Sharing and visibility

Start from the note or folder. See what it contains, choose how it opens, then send it.

> [!NOTE]
> **TL;DR.** **Private** stays in the private project. **Shared** is read-only through a link or an access code, never a named recipient. **Public** is a plain website anyone can read, with its own theme. Share… opens one fixed item's dialog directly: no state screen, Add people or “who”. Folder review is a read-only dialog over that dialog, an explicit exception. Link/Passcode use clear switches; Share…, Copy link, Copy access code and Copy share information create the share on first action. This is the **planned replacement** for today's named-audience flow, not as-built behaviour. [Source](../../plan/next-direction.md), D-274, D-284 to D-293. **UX approved by the owner, 3 November 19:39 (D-335):** the clickable gallery mocks are the design of record; where this page and the mocks differed, the mocks win and [Approved design](#approved-design) lists every behaviour they show, plus what's specified but not yet designed.

<h2 id="approved-design">Approved design (3 November)</h2>

The mocks live on branch `vq-share-mocks` (`b2b4e6e0`) in `packages/views/mocks/share/`, under **Mocks: Sharing and publishing** in the gallery (`pnpm gallery`), entries 1 to 15. They're view documents over fake data with the real design system; nothing is wired. **Nothing is added to the writing window (D-336):** sharing and publishing start only from existing menus and live in standard dialogs, Settings pages, a toast and the full-window site preview.

| Surface (gallery entry) | What the approved mock shows |
| --- | --- |
| Entry points (1) | **Share…** and **Publish…** in a Files row's right-click menu (between New note/New folder and Rename/Delete), for a note or a folder, and in ⋯ → Note (Share…, Publish…, Version history, Print…). Each opens its dialog at once. |
| Share dialog: what's shared (2, 3) | Title **Share “⟨name⟩”**. An item card: folder or note icon, the name, *Folder · 12 notes · 3 folders* or *Note · edited 2 November*, a **Private** badge, and for a folder **Review contents**. Under it, for a folder only, the **Include notes added later** switch with *New notes in this folder stay private.* / *New notes in this folder are shared too.* |
| Share dialog: how it opens (2, 3) | Heading **How it opens**. **Expires in**: 7 days, 30 days (default), 90 days, A date, Never. *A date* shows **Expires on** (*The share stops opening at the end of this day.*); *Never* shows a warning row *This share keeps working until you withdraw it.* **Link** (*Opens straight from the link.*, On by default) and **Passcode** (*Opens on the site with an access code.*, Off) as switches side by side. With both off, a warning row says *Keep Link or Passcode on to share this item.* and every action is disabled with that reason. Passcode on shows **Passcode type**: Generated (four words with Copy passcode and **New words**) or Your own (a password field, *Use 16 or more characters, or 3 or more words.*, and a strength meter: Nothing typed yet, Too easy to guess, Strong). |
| Share dialog: actions (2, 3, 10) | Windows: primary **Copy share information**, then a group *Copy*: **Copy link** (Link on) and **Copy access code** (Passcode on). macOS: primary **Share…** and the group adds **Copy share information**. The first action shows a spinner line *Publishing this share. It copies when the site is ready.*, then *Share information copied.* (Windows) or *Ready to share. The share sheet is open.* (macOS). Under the actions, **Share information**: a read-only block of the message's lines for the enabled methods. |
| Share dialog: shared before (2) | Disclosure **Shared before · 2**, open when the item has shares. *3 newer notes aren't shared* with **Add them**. One card per share: its methods as the title, *Shared 28 Oct · expires 27 Nov*, a state badge (Active, Expires soon), and **Copy link**, **Change…**, **Withdraw**. |
| States (6 to 9) | Offline: warning *You're offline. Your share will publish when you're back online.*; actions stay enabled and end in *Waiting to publish. It copies when you're back online.* Signed out: warning *Sign in to GitHub again to publish this share.* with **Sign in**. Large folder: *Folder · 10,000+ notes*, a spinner *Counting notes…*, and Review contents shows skeleton rows with *Counting notes… The list fills in as it's read.* Deleted: the card says *Deleted*, a danger row *This item was deleted. Close sharing or restore it in Files.* with **Restore in Files** and **Close sharing**; actions disabled. |
| Review contents (4) | A second standard dialog over the share dialog, **Contents of “⟨name⟩”**, *12 notes and 3 folders, as they are now. Expanding a folder only changes this view.*, the read-only Files tree, and **Done**. |
| First share (5) | Replaces the draft inside the same dialog: a share mark and **Turn on sharing for “Book”?**, *Your other notes stay private.*; **What's created**: cards *Public copy on GitHub* (`prabin/Book-site`) and *Website* (`prabin.github.io/Book-site`); **What people can see**: cards with the **Shared** badge (*Encrypted, opens only with a link or access code*) and the **Published** badge (*Anyone can read it*); the history line; a **More details** disclosure; **Cancel** (focused) returns to the untouched draft, **Turn on sharing** returns to it with *Creating the website, then publishing this share…*. Offline, the primary is disabled: *Sharing can't be turned on while you're offline.* |
| Publish (11) | **Publish “⟨name⟩”?** in a standard small dialog: the item card with a **Will be public** badge, *Publish “⟨name⟩” for anyone to read? Its text will be public on your website and in GitHub history.*, for a shared item *Its existing shares keep working too.*, **Cancel** (focused) and **Publish**. Success is a toast: *Published. Anyone can read it on your website.* |
| Settings → Sharing (12) | A project card *Book · Sharing on · prabin.github.io/Book-site* with an **On** badge, **Preview site…** and **Turn off sharing…**. **All shares**: **Show** (All, Active, Expires soon, Expired, Withdrawn) and **Find by item**. One card per share: the item's name and icon, *Link and passcode · expires 27 Nov*, a state badge (Active, Expires soon, Expired, Withdrawn, Waiting to publish; a deleted item reads *Item deleted*). Live shares: **Copy again** (Copy link, Copy access code, Copy share information), **Extend** (7 days, 30 days, 90 days, Never expire) and **Withdraw**; ended shares: **Delete record**. One status line confirms each (*Expiry extended. It applies to everyone who has this link or access code.*). Withdraw, Delete record and Turn off sharing confirm in standard dialogs with the copy below. Turn off runs with a progress bar *Turning sharing off… Moving 120 of 480 notes.*, then *Sharing is off. The site is empty, and its history stays on GitHub.* and the card reads *Private only · Nothing is shared or published* with **Turn on sharing…**. Empty: *No shares yet.* |
| People (13, 14) | Settings → Project → **People**: **Invite…** (primary), *People you invite can open the whole project on GitHub. To let someone read one note or folder, use Share… instead.*, and one card per account with its role badge. **Invite to “Book”**: **GitHub username** (*Their GitHub username, not an email address.*), the account's card once typed; on an organization project **Role** (Read, Triage, Write, Maintain, Admin) with one line on what it allows and *They can see every private note and sharing setting in this project, not just one folder.*; on a personal account a **Collaborator** card (*Can read and change everything*, **Only choice**) and the exact personal-account warning. **Manage on GitHub**, **Cancel**, **Send invite** (disabled until a username: *Type a GitHub username first.*). Sent: a card with a **Pending** badge, *Invited with Write access · not accepted yet*, and **Cancel invite**. |
| Preview site (15) | Opened from Settings → Sharing; fills the window with the site's own theme (D-337). A plain top band: **Preview site**, **Close preview**, **Apply**, **Site theme** (Paper, Sepia, Ink, Dusk), **Font** (Serif, Sans, Hyperlegible), **Default size** (Small, Medium, Large) and *Changes only the website. Your app's appearance stays the same.* Below it the site: the name, top-level sections, **Theme** (Light, Dark, System) and a **Focus** switch; home with the tagline and section cards (*2 articles*, *Article*); a section with *Home /*, its title, count and article cards with two-line excerpts; an article with its breadcrumb, *Updated ⟨date⟩* and body. |

**Specified but not in the approved mocks (not approved yet; design before building):** Share… from Spotlight; the **Change…** flow for an existing share; a per-row Copy access code in Shared before; the no-permission state and **Continue setup**; the *Ready to share* fresh-gesture step; clipboard failure; editing the share information template in Settings (and its Edit template / Use default this time errors); legacy named-grant rows; the first Publish creating the site; the Unpublished-preview label; the site's empty, missing-page and failure states; Remove person; and Switch pending and refused-change states. Removed by the approval: the 1-day expiry, a toast per copy, and the project mark as the first-share anchor.

## Item-dialog implementation increment

**Candidate only, WP-P.9 (3 November):** Files row **Share…** and **⋯ → Note → Share…** open one fixed private item's standard dialog over real state. The card, counts, Include notes added later, methods, expiry, generated words, custom-passcode strength and nested Review contents are wired. Escape from review restores focus and the unchanged draft. Counting yields every 200 entries; opening, changing draft controls, reviewing and cancelling make no grant or website.

The first action creates one independent grant, preserves reviewed note identities for fixed snapshots, and waits through the task tracker for a real encrypted reader to open the deployed share before clipboard or native handoff. The saved controls become read-only, publication retry reuses that grant, and Share information contains real enabled methods. Access codes use random identifiers, never name aliases. The reader's default route accepts one identifier-plus-passcode string; legacy name-based access is an explicit separate route.

History, Add them, bounded visible review rows, signed-out recovery and deleted-item controls remain unfinished. Native-sheet cancellation and approved light/dark/narrow comparison still need evidence. The coordinator excluded Change…, template editing, first-site setup and public-item shares from this merge; no implementation acceptance or security approval is claimed.

This first visible increment is not the complete sharing flow and must not replace the production build yet. Generated words, the four publishing/copy actions, Share information, Shared before, first-share setup and remote/offline states remain to be wired. No mock data, mock-finish action or success-shaped clipboard fallback is included. The current Files primitive renders all visible rows: the 10,000-note count is covered, but a 10,000-visible-row review still needs bounded rendering evidence before SHR-14 can close.

## Three levels of visibility

| Level | Who can read | Where it's kept | What the website serves |
| --- | --- | --- | --- |
| Private | Accounts with access to the private project | Private repository | Nothing; no owner vault (D-292) |
| Shared | Anyone holding a working link or access code | Source and grant secrets in the private repository; **ciphertext only**, under opaque names, committed to the site repository (D-299, D-305) | Encrypted pages for that share, opened by the share reader; never listed |
| Public | Anyone, including GitHub repository visitors | Plain Markdown in the site repository | Plain read-only pages, listed on the home page |

New notes and projects are Private. Shared is a private note with a grant, not a move to public storage. Publishing plaintext always confirms the audience and warns about public Git history. Making it private again removes the hosted page at the next successful publication; it cannot erase history, caches or downloaded copies.

**Inviting a GitHub collaborator is different:** it grants account-backed access to the whole private project and its secrets, not read-only access to this item. See [People in a project](../../experience/projects.md#people-in-a-project). No “pick a person, then pick notes” flow exists.

## The share dialog

**Share…** appears in a single note/folder's Files row menu, ⋯ → Note, and Spotlight. It opens IA-CMP-SHAREDIALOG / IA-VIEW-SHARE at once for that item. No visibility-summary interstitial or second Share button. A multi-selection does not silently become one share: offer **Share…** only for one item; a folder is how people choose a group.

<!-- Visual thesis: a fixed item leads directly to opening methods and four actions; review branches out without becoming a scope picker. No icons: the labelled anatomy carries the meaning. -->
<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560" role="img" aria-labelledby="fnshare-dialog__title fnshare-dialog__desc" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fnshare-dialog__title">One item-first share dialog, with review outside its main flow</title>
<desc id="fnshare-dialog__desc">Share Book drafts. First region: the folder name and counts, 12 notes and 3 folders, and Review contents. Second: expiry, the Link switch on, the Passcode switch off, and Include notes added later off. Third: the primary Share button and a group of three copy buttons; where the system has no share sheet the primary reads Copy share information. Shared before lists earlier shares of this item, each with its own actions; it is never an intermediate screen. Review contents branches to a scrollable read-only folder tree and returns to the intact draft.</desc>
<g id="fnshare-dialog__main" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fnshare-dialog__item" x="24" y="24" width="594" height="116" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="46" y="64" font-size="21" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__item" data-slate-fit-padding="16">Share “Book drafts”</text>
<text x="46" y="92" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__item" data-slate-fit-padding="16">Folder · 12 notes · 3 folders</text>
<text x="46" y="120" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__item" data-slate-fit-padding="16">Review contents</text>
<rect id="fnshare-dialog__methods" x="24" y="160" width="594" height="168" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="46" y="196" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__methods" data-slate-fit-padding="16">How it opens</text>
<text x="46" y="230" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__methods" data-slate-fit-padding="16">Expires in 30 days</text>
<rect x="46" y="248" width="44" height="24" rx="12" fill="var(--color-brand-bg)" />
<circle cx="78" cy="260" r="9" fill="var(--color-neutral-bg-1)" />
<text x="102" y="266" font-size="17" fill="var(--color-neutral-fg-1)">Link · On</text>
<rect x="300" y="248" width="44" height="24" rx="12" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" />
<circle cx="312" cy="260" r="9" fill="var(--color-neutral-fg-2)" />
<text x="356" y="266" font-size="17" fill="var(--color-neutral-fg-1)">Passcode · Off</text>
<text x="46" y="308" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__methods" data-slate-fit-padding="16">Include notes added later · Off</text>
<rect id="fnshare-dialog__actions" x="24" y="348" width="594" height="112" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<rect x="46" y="368" width="112" height="36" rx="8" fill="var(--color-neutral-bg-1)" stroke="var(--color-brand-stroke)" stroke-width="2.5" />
<text x="66" y="392" font-size="17" font-weight="600" fill="var(--color-neutral-fg-1)">Share…</text>
<rect x="172" y="368" width="424" height="36" rx="8" fill="none" stroke="var(--color-neutral-stroke-1)" />
<text x="186" y="391" font-size="15" fill="var(--color-neutral-fg-1)">Copy link · Copy access code · Copy share information</text>
<text x="46" y="438" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__actions" data-slate-fit-padding="16">No share sheet on this system → the primary reads Copy share information</text>
<rect id="fnshare-dialog__history" x="24" y="480" width="594" height="56" rx="12" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="46" y="514" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__history" data-slate-fit-padding="16">Shared before · each share with Copy, Change…, Withdraw</text>
</g>
<g id="fnshare-dialog__review" data-slate-svg-step="2" data-slate-svg-effect="fade-rise">
<path d="M618 104 H662" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<rect id="fnshare-dialog__tree" x="662" y="24" width="314" height="304" rx="14" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" />
<text x="684" y="62" font-size="20" font-weight="600" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Review contents</text>
<text x="684" y="104" font-size="17" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Book drafts</text>
<text x="704" y="138" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Chapter 1</text>
<text x="724" y="170" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Opening.md</text>
<text x="704" y="204" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Chapter 2</text>
<text x="684" y="248" font-size="16" fill="var(--color-neutral-fg-2)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Scrollable · read-only</text>
<text x="684" y="286" font-size="16" fill="var(--color-neutral-fg-1)" data-slate-fit-target="fnshare-dialog__tree" data-slate-fit-padding="16">Done / Escape → same draft</text>
</g>
</svg>
<figcaption>Dialog anatomy, not a production screenshot. Counts and filenames are illustrative fixture values; there is no recipient region or scope picker.</figcaption>
</figure>

| Region | Contents and behaviour |
| --- | --- |
| What's being shared | Item title/name, note/folder type and a Private badge; folder descendant note/folder counts, Review contents and, under the card, Include notes added later. No Add items, checkboxes or recipient name. |
| How it opens | Expiry (7, 30 or 90 days, A date, Never with a warning; D-335), Link and Passcode switches; Generated / Your own appears only when Passcode is on. |
| Actions | Share… primary; Copy link; Copy access code; Copy share information. Hidden methods have no copy action. |
| Shared before | This item's existing shares as ItemCard rows (opening methods, when shared and expiry, state badge with text), each with Copy link, Change… and Withdraw (Change… isn't designed yet). Open by default when the item has active shares, collapsed otherwise. No recipient identities. |
| Status | One inline status line in the Actions region, with a Spinner while waiting (a polite live region announces it); the same line confirms the copy (*Share information copied.*). No “ready” until the site serves this share (R-53). |

**Share… always starts a new share (D-307).** An item can hold several shares, one per audience, because shares have no names. Existing ones change only from their row in Shared before or Settings → Sharing; **Change…** says **“Changes apply to everyone who has this link or access code.”** Within one open dialog, repeated actions reuse the share that dialog created.

**Focus order:** the dialog opens on **Expires**, then follows the regions: the item card's **Review contents of “Book drafts”** button, Expires, Link, Passcode, passcode type and field, the actions, Shared before. Escape or Cancel returns focus to the Files row or command that opened it.

The target is captured by stable item ID, not its title. Rename updates the displayed name without changing scope. Moving it within the project keeps its identity; deleting it disables creation and says **“This item was deleted. Close sharing or restore it in Files.”** If its contents change while reviewing, refresh the counts/tree and require a new review before publication; never widen scope invisibly.

## Review contents

**Review contents** opens IA-CMP-SHAREREVIEW over the share dialog. It is the owner's explicit exception to the one-panel rule (DD-IA-04, D-287), not permission to nest general workflows. The share draft remains mounted but inert. The top dialog has an accessible title, the Files tree's expand/collapse behaviour, one scroll region and **Done**.

No add/remove/select-for-sharing controls. Expanding rows changes only the view. Escape closes only review and returns focus to Review contents with all expiry/passcode input intact. Tab is trapped in the top dialog; closing Share after review restores the original Files row or command opener.

**A folder share covers what's in it when shared (D-311).** It includes the reviewed notes and folders, with their later edits. The switch **Include notes added later**, Off by default, makes it follow new notes too. With it Off, a note created in or moved into the folder stays private, and Shared before says **“3 newer notes aren't shared”** with **Add them**. Review rechecks current contents before creation. Moving an item out removes it at the next successful publication. Existing copies remain beyond recall.

**Large folders:** counting and the review tree work in the background with a named wait (**Counting notes…**, waiting class); the tree is virtualized, so a 10,000-note folder scrolls without loading every row.

## Switches and parameters

Use the sealed [Switch primitive](../system/components.md#switch) (DSY-15): labelled track/thumb, On/Off text, position and filled state, not colour alone; 3:1 control contrast, visible focus, native checked semantics and Space. Pending/disabled has an explanation. Generated / Your own is a choice, not a switch.

Default **Link on**, **Passcode off**, **30 days**. Both switches can be turned off; then a warning row says **“Keep Link or Passcode on to share this item.”** and every action is disabled with that reason (D-335). A date in the past cannot generate; keep the draft and focus the date error. Never is explicit with **“This share keeps working until you withdraw it.”**

Passcodes default to four random EFF words (about 52 bits). Keep the as-built custom strength guard (D-134: 16 or more characters or at least 3 distinct words, then strong rating), never weaken it because a share code exists. PBKDF2-SHA256 at 600,000 iterations and per-grant salt remain; public ciphertext allows unlimited offline guesses.

## Actions

1. Validate fixed scope, date, method and strength without side effects.
2. If Private only, show the [first-share confirmation](../../experience/projects.md#private-only-until-the-first-share) as an in-place step of this dialog, not a second dialog; Cancel creates no site or grant and returns to the draft.
3. The first action creates one grant in the private project, backs it up and publishes the sealed output. Opening/cancelling the dialog creates no grant. A repeated action reuses the same grant, not a second share; changed parameters update it explicitly and await publication.
4. Once ready, complete the requested action. If publication fails, keep the same record as **Waiting to publish**, preserve its parameters and offer **Retry publishing**; no duplicate grant or success-shaped copy.

| Action | Result |
| --- | --- |
| Share… | The system share sheet with the complete share information (D-308): macOS through Electron's ShareMenu; Windows through a native DataTransferManager bridge once proven (A-SHR-01). Where there's no sheet (Linux, and Windows until then) this button is **Copy share information** and the separate copy action is hidden; it never says Share… when nothing would open. Cancelling the sheet is cancellation, not a copy fallback; errors remain explicit. |
| Copy link | Copy the working fragment link, only with Link on. |
| Copy access code | Copy share code plus passcode in one string, only with Passcode on. |
| Copy share information | Copy title, enabled opening method(s), site share page, expiry and limits using the template below. |

The four actions follow the owner's list: **Share…** is the primary button; Copy link, Copy access code and Copy share information are secondary buttons in one group that wraps to a column at narrow widths. A grouped bar rounds only its outer corners, never inner segment corners.

Do not invoke the OS sheet until publication is ready. Some platforms require a fresh user gesture after a long wait: show **Ready to share** with **Share…** to complete rather than silently failing or claiming the sheet opened. Clipboard failure shows **“Couldn't copy. Try again.”** with a retry; OS-sheet cancellation leaves the valid share available under Shared before.

Copy through the main process; clear after 90 seconds only if the clipboard is unchanged. History/cloud clipboard services may retain a copy; say so in help, not a wall of text in the dialog. Never put access codes in logs, notifications or public metadata.

## Shares without names

A share is identified by its item, opening methods, expiry and state, **not by whom it reached**. No account, email, name, optional recipient label or read receipt. Holding a link/code is not proof of identity; it can be forwarded. The app cannot guarantee “only Asha can read this”.

**Share code** is a non-secret random 8-character identifier, displayed as `K7QM-4DRP`. Use an unambiguous alphabet and collision-check against the project's records. **Access code** is that identifier plus the secret passcode in one field/string, for example `K7QM-4DRP harbor-maple-river-cloud`. Parsing normalizes only the identifier's separators/case; the passcode keeps its exact content. The share code finds one keyring; its entropy does not strengthen a weak passcode. The site's share page supplies the project context.

**Opaque identity (D-285 / SHR-23):** every new share link, code, published share path and file name is generated from cryptographically random identifiers only. No note/folder name, title or path, including initials, slugs, encodings or hashes derived from them. The generic `/s/` route and site origin are fixed infrastructure, not an item-derived slug. Private item labels and authorized decrypted content may contain titles; unauthenticated URLs/keyrings/public metadata may not. Renaming the source never changes a share's public identifier. Shared media uses the same opaque rule.

Existing named grants are **legacy compatibility only**: keep their old links and passcodes working until expiry/withdrawal, list them by item, and retain a clearly separated legacy reader path. Emit no new name-derived alias, even for an old grant. New grants and the main reader never ask a name. D-285 superseding D-41 is accepted by the owner on 3 November; it is not an open decision.

<h3 id="settings-sharing">Settings → Sharing</h3>

**All shares**, grouped by item, shows Link/Passcode, expiry and Active / Expires soon (within 3 days) / Expired / Withdrawn / Waiting to publish. Filter by state and find by item title. There is no **All people with access**, **Share with someone** or Add people.

Rows are ItemCards with a state badge and its text, never colour or a one-sided border alone; filter with a SegmentedControl (**Show**) and find with a SearchField (**Find by item**). A project card above the list holds **Preview site…** and **Turn off sharing…**. Live rows have **Copy again** (Copy link, Copy access code, Copy share information), **Extend** and **Withdraw**; ended rows have **Delete record**. Empty: **No shares yet.** **Extend** (7, 30 or 90 days, Never expire) changes expiry on the same grant and says it applies to everyone who has this link or access code. **Withdraw** confirms **“Withdraw this share? Its link and access code stop working after the next successful publication. Downloaded copies cannot be recalled.”** with **Cancel** (default focus) / **Withdraw share**. Keep the record. **Delete record** confirms **“Delete this share's record? It's already withdrawn; this removes it from the list.”** with **Cancel** / **Delete record**; private Git history still keeps the record and old secrets.

**Deleted or renamed items:** renaming changes nothing public (identifiers are random). Deleting a shared note or folder withdraws its shares at the next publish, and their rows say **Item deleted**; restoring it never shares it again by itself. **Publishing a shared item** keeps its shares, which then also work, and says so before publishing. Disabling an opening method rotates/reseals as required so the disabled method cannot unlock the new build; the other method's advertised continuity must be verified before claiming success.

### Share information template

```text
“{title}” is shared read-only.
Open: {link}
Or open {site} and enter this access code: {accessCode}
Works until {expires}.
Anyone with the link or access code can read it and forward it.
Expiry or withdrawal cannot remove copies already downloaded.
```

The title line is deliberate: the link itself names nothing, but the message is the sender's own and helps the recipient; it can be removed from the template. A read-only preview of the message sits under Copy share information.

Omit lines for disabled methods. `{site}` is the site's share-reader address. No `{name}` or bare `{passcode}` field in new templates. Settings validates known placeholders; unknown ones have a field error, input retained. Validate the **rendered result against enabled methods before copying/OS sharing**: Link needs a working `{link}`; Passcode needs both `{site}` and `{accessCode}`. At least one enabled method must survive omission, otherwise say **“Add a link, or the site address and access code, for this share.”** Keep the template/dialog draft and provide Edit template / Use default this time; no unusable-success toast or clipboard replacement. Exercise link-only, passcode-only and both against each template shape. Store privately in the project's `access-message.json`; Reset to default is explicit. Legacy templates remain for old grants only, not a reason to request new names.

## The share reader

On the site's `/s/` page (IA-VIEW-PUBLIC):

| Entry/state | What happens |
| --- | --- |
| Link | Read grant/secret from fragment and remove it immediately; open only that share's notes. Browser history/sync may retain the original URL. |
| No link | One **Access code** field, labelled example, **Open** and **Open and remember**. Never a name field in the new flow. |
| Wrong, expired, withdrawn or malformed | Same error: **“That didn't open anything. Check the link or access code and try again. If it still doesn't work, ask the person who shared it.”** No existence oracle. |
| Read failure after site update | Retry once against the current build, then show that same error; no endless retry. |
| Open | Read-only note(s), list of titles for a folder, site's theme in light/dark; no editor, owner vault, demo or local-note controls. |

Scope-safe internal links open only notes in this share; other private links become plain text. Session defaults to the tab, expires after 12 idle hours and at grant expiry. Optional remembrance stores only non-extractable key material plus lookup/expiry, never the passcode, name or fragment secret; expire never-ending grants after 30 unused days. **Sign out on this device** forgets all tabs and remembered access. These reader keys are not a browser writing store and are not retired by D-292.

Expiry is enforced by the reader's clock and a fresh deployment/key rotation. A static host cannot erase old builds, caches or copies, and someone can retain already decrypted text. **Withdrawn** means removed from the current successful build, not cryptographic recall. Nightly deployment and each site's 60-day schedule warning remain mandatory.

## Publishing a website

**Publish…** is distinct from sealed sharing. Confirm **“Publish ‘⟨title⟩’ for anyone to read? Its text will be public on your website and in GitHub history.”** First publication also uses the site-creation confirmation. The approved confirmation is a standard small dialog with the item card and a **Will be public** badge, **Cancel** focused, and **Publish**; success is the toast **“Published. Anyone can read it on your website.”** Publishing moves public source into the site repository under the existing two-repository safety protocol; a partial operation remains visible and recoverable, never silently deleting the private source before the target is durable.

Settings → Sharing → **Preview site…** (D-337) fills the window with the public home/sections/articles and chooses site theme (Paper, Sepia, Ink, Dusk), font (Serif, Sans, Hyperlegible) and default size (Small, Medium, Large); **Close preview** and **Apply** return to Settings; proposed theme **Paper**, independent of personal app Appearance and project accent. Apply saves site settings only; Publish is separate. Public and sealed-reader pages use that site identity and readable light/dark variants. See [Published website](../../experience/published-site.md) for navigation, focus mode and preview states.

GitHub Pages is **purely a website** (D-292). No browser editor, IndexedDB notes, owner-vault unlock, demo-writing or eventual move-to-desktop funnel. [Browser retirement](../../architecture/web-app.md) must preserve old browser drafts before removing the old runtime. Plain download/help links remain.

## States and evidence

| State | What the dialog shows; the draft is kept in every case |
| --- | --- |
| Offline | **“You're offline. Your share will publish when you're back online.”** The share is saved as Waiting to publish; Copy actions wait. A first share (site creation) is unavailable offline, with that reason |
| Sign-in expired | **“Sign in to GitHub again to publish this share.”** Sign in; the same action resumes |
| No permission (a collaborator who can't write to the site) | **“Only someone who can change the site can share from this project.”** Actions disabled with that reason; Manage on GitHub |
| Sharing turned off, or site still being set up | The first-share step, or **Continue setup**, in place |
| Item deleted while open | **“This item was deleted. Close sharing or restore it in Files.”** |

**Components and their status:** Dialog, ItemCard (with its badge slot), Button, Field and FileTree (`readOnly`, for Review) exist; **Switch** (WP-P.16) and **Select** are planned, **SegmentedControl** serves Generated/Custom, and **Disclosure** and **ShareRow** are new and specified with the work. The view can't be wired before those land. Expressed as JSON before wiring. At 320 px actions wrap without horizontal scrolling; only review's tree and the normal dialog content scroll, not a second nested action pane. Fields and target stay stable during waits/errors.

**As built in the D-339 increment:** the fixed-item dialog has item-specific Shared before rows, Copy link and confirmed withdrawal, and Add them for the complete currently reviewed snapshot-folder membership. Addition preserves existing reader credentials and requires main-resolved unique note identities. Snapshot notes moved out of the stored folder boundary are excluded on the next publication; folder-rename handling still needs evidence and must not silently broaden the scope. Existing named Settings creation/template controls remain legacy behavior for now, not the approved new Settings design or a newly designed template flow.

Review streams counts and rows every 200 entries and bounds mounted rows to 200, retaining full-list keyboard navigation and type-ahead. Saved controls lock at the command boundary; new-word preparation also blocks first-copy races. Publication checks the exact authenticated authorization revision and all required ciphertexts, not a successful Git push or equal note counts. The credential callback rechecks current membership, private root and site; stale readiness fails explicitly and retry republishes the same grant. The [evidence](../../plan/gate-evidence.md#wp-p9-item-dialog-candidate) distinguishes local proof from pending native-sheet, recovery and visual acceptance.

The [wait inventory](../../architecture/perceived-performance.md) records preparing contents, site creation, sealing/publishing and OS handoff. Acknowledge within 100 ms; use named status after 300 ms, preserve the current view and prompt, and make long publication leavable. No “Link copied” or “Live” before the actual copy/deploy succeeds.

**VVS:** designed to meet at least 70, with no criterion below 10, by using item identity, counts, tree, checked switches, expiry badges and an action row instead of prose describing state. This is a target and rationale, **not a scored or approved UI**; score the actual JSON surface in light/dark/narrow states before sign-off. Copy pass: Share is not Invite; shared is not public; access code is not share code; errors retain input and offer a next action.

<h2 id="the-share-popover">Former share popover (retired)</h2>

Older links land here for continuity. D-284 replaces the popover/state interstitial with the [direct fixed-item dialog](#the-share-dialog); do not implement a second flow. Legacy named-grant compatibility is a reader/format boundary, not the old creation UI.

## Design decisions

| ID | Decision | Serves | Rationale |
| --- | --- | --- | --- |
| DD-SHARE-01 | Three levels remain, without named recipients | UC-SHARE-01, UC-SHARE-03 | Distinguish private, sealed and public |
| DD-SHARE-02 | **Superseded by D-285:** new grants have no audience name | UC-SHARE-03, UC-SHARE-04 | No identity/tracking claim |
| DD-SHARE-03 | One grant may have link and access-code methods | UC-SHARE-03, UC-SHARE-05 | Same scope, no extra grants |
| DD-SHARE-04 | Generated passcodes and strong custom validation | UC-SHARE-03 | Offline guesses cannot be rate-limited |
| DD-SHARE-05 | **Superseded by D-285:** one access code finds a keyring | UC-READ-02 | No new name field or scanning all keyrings |
| DD-SHARE-06 | Withdraw keeps record; delete is separate | UC-SHARE-04 | History is not recipient tracking |
| DD-SHARE-07 | 30-day default expiry | UC-SHARE-03 | Deliberate limit; Never warns |
| DD-SHARE-08 | No read receipts or recipient lookup | UC-READ-01 | Static, no tracking |
| DD-SHARE-09 | **Retired by D-292:** owner browser vault | UC-SETUP-07 | Website is reading only; private unshared content is never sealed for an owner vault |
| DD-SHARE-10 | Fixed item directly into Share | UC-SHARE-03, UC-SHARE-07 | Removes interstitial and scope creep |
| DD-SHARE-11 | Review tree above preserved share draft | UC-SHARE-07 | Explicit nested-dialog exception with reversible focus |
| DD-SHARE-12 | Switch for on/off; choice for passcode type | UC-SHARE-03 | Position/text, not ambiguous chip colour |
| DD-SHARE-13 | First action creates; ready output only after publish | UC-SHARE-05, UC-SHARE-08 | No empty shares on cancel or unready invitations |
| DD-SHARE-14 | Site theme independent of app; no browser-writing product | UC-SHARE-10 | A clean website, not a second editor |
| DD-SHARE-15 | Random opaque share URLs/codes/paths/files, never source-derived | UC-SHARE-03 | A link must not disclose what it opens before authorization; slugs/hashes are not substitutes for random identifiers (SHR-23) |
| DD-SHARE-16 | Share… starts a new share; existing ones change from their own row (D-307) | UC-SHARE-03, UC-SHARE-04 | Changing the last share silently would cut or shorten access for people who already have it |
| DD-SHARE-17 | Folder membership fixed at sharing; following new notes is an opt-in switch (D-311) | UC-SHARE-07 | No note is published as a side effect of being created in a shared folder |
| DD-SHARE-18 | The primary action names what happens on this platform (D-308) | UC-SHARE-05 | Share… only where a share sheet opens; otherwise Copy share information |

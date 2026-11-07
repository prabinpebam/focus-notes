# Files and sharing

Manage notes inside one project, then choose deliberately whether anything leaves it.

> [!NOTE]
> **TL;DR.** Files, search, moves and history stay in the current project. New note is immediate; **New note in…** chooses the place first. Titles and file names are separate. Pin folders and notes; return to recent files with their place. **Share…** on one note/folder opens its dialog directly, with no recipient names. **Publish…** makes a plain website only after confirmation and a successful GitHub Pages deployment. Browser writing and the owner vault are retired in the product direction. **What's built, 7 November:** item-first sharing for already configured projects and local publish/invite drafts exist; production setup for New-project folders, GitHub invitations and real publishing remain G2/G3, not certified by those drafts.

## The Files panel

**Open** in the [trigger toolbar](main-ui.html), Mod+O or Mod+Shift+E opens the project's Files tree and reveals the current note. It closes after opening a note unless docked. Docking the panel is different from pinning a folder shortcut.

**As built: docking is direct manipulation (D-161).** Dock/Undock moves the writing layout immediately, including with reduced motion, while the control's own border shows the pending save. Persistence confirms the change; a refusal restores the previous layout and shows the error outline with Retry for the same explicit intent. Folder/note shortcut pins remain acknowledgement-first and never change this layout.

| Region | What it contains |
| --- | --- |
| Project heading | Name, logo, backup state, Open local folder |
| Pinned | Shortcuts to real folders and notes; Unpin never deletes content |
| Recent | Files only, newest first, with folder location |
| Private | The project's private notes and sealed shares |
| Public (sharing enabled) | Explicitly published source in the site's repository |
| Recently deleted / Recovered | Restore Git history or crash drafts without overwriting newer text |

See [Files panel](../design/views/files.html) for the full interaction. [Projects](projects.md) owns project selection, Local notes, standalone files and People.

## Operations

| Operation | Behaviour | Requirements |
| --- | --- | --- |
| New note | Immediate in the current private folder or Private root; set name once on first save | FIL-01, FIL-18 |
| New note in… | Mod+Shift+N picks a project and folder first; Cancel writes nothing | FIL-17, KEY-09 |
| Edit title | Changes the first H1, never the file's path | FIL-18 |
| Rename file… | Changes path, not H1; updates incoming and outgoing relative links atomically | FIL-18, FIL-09 |
| New folder | Ctrl+Alt+N / ⌥⌘N, named inline; track empty folders with `.gitkeep` | FIL-02 |
| Move | Drag, cut/paste or Move to… stays inside the project; preview collisions, never overwrite | FIL-03, FIL-08, FIL-09 |
| Delete / Restore | Existing Undo and 30-day Recently deleted; folders/public items confirm consequences | FIL-05, FIL-10 |
| Import files… | Copy supported files into the chosen project folder; keep originals, no replacement | FIL-15 |
| Pin / Unpin | Keep a project/folder/note reachable without creating another copy | PRJ-07 |

### Links that follow

Explicit file/folder rename or move rewrites only relative link destinations pointing at the moved content, including links inside moved notes, in the same recoverable batch. Preserve all unrelated bytes, fragments, titles and query strings. Do not rewrite code, front matter or external URLs. Never introduce a public-to-private link. Editing an H1 alone no longer triggers file/link operations (FIL-07 superseded).

<h2 id="changing-visibility">Private, shared and public</h2>

| State | Stored in | Readable through |
| --- | --- | --- |
| Private | Private project repository | App and authorized GitHub project accounts; no website output |
| Shared | Private project plus sealed site output | Link or access code, read-only; anyone holding it may forward it |
| Public | Site repository | Plain website and public Git history |

New projects are **Private only**, with no site. The first share/publication explains and confirms the public site repository/Pages address before creating it. Published text and old copies cannot be recalled by later making it private. See [Sharing](../design/views/sharing.md).

### Turning on sharing for a new project

PRJ-10 and [G2.1–G2.3](../plan/definition-of-done.md#g2-turn-on-sharing-and-invite-a-person) apply to projects made with New project as well as existing pairs. The production flow uses the signed-in GitHub client, without a candidate-site flag.

| Step / state | Required outcome |
| --- | --- |
| Before setup exists | Share is hidden for an unconfigured project. Settings → Sharing gives one honest reason; it never offers a command that fails by asking the person to fix an unavailable setting. An on-this-computer-only project needs explicit GitHub linking before sharing. |
| First Share or Publish | Confirm the exact neutral editable public site repository name and proposed Pages URL, sealed private-share versus plaintext-publish output, and indefinite Git-history limits. Nothing is made public before the person confirms. Cancel keeps the draft and has no remote effect. |
| Confirmed setup | Create or reconcile one paired public site. Keep the private project private; seal in the desktop, never hand the site a key/secret that can read the private repository. Persist the pairing before reporting readiness. A site name collision is a field error, not permission to reuse someone else's repository. |
| Offline, refused or partial setup | Preserve notes and the chosen name. One error says what remains and how to continue; explicit Retry reconciles completed steps rather than duplicating repositories or blindly retrying writes. Until ready, do not claim Shared or provide a supposedly live link. |
| Turn off / turn on again | Preserve working public notes/media privately before removing current shared/published output at the next successful deployment. A failed preservation stops removal; offline remains pending. Keep the site repository/history, remove legacy private-repository keys/secrets/schedules, and never silently republish when re-enabled. |
| Wait / leave | Repository setup and first push are named streamed task steps, with inventory rows and fn: measures for waits over 100 ms. Leaving the dialog permits writing and keeps the real task status available. |

Agents prove these branches only with protocol fakes. The owner's first real activation from Preview is G2.8; it remains an owner dependency, not fake-backed certification.

**Availability repair (D-387).** Unconfigured projects hide Share in Files, Note, a previously pinned toolbar action, Actions and the native menu. Sharing names the current missing capability: “Turning on sharing isn’t available yet. Your notes stay private.” Configured projects retain sharing. Until their production paths land, invitation and publication reasons name unavailable GitHub operations, not a preview; local drafts are not real invitations or publications.

## Share one item

1. Files row menu → **Share…** on one note or folder.
2. See its fixed name and counts; **Review contents** opens the read-only folder tree above the unchanged draft.
3. Choose expiry, Link/Passcode and generated/custom passcode. No recipient name, multi-item picker or “who”.
4. **Share…**, **Copy link**, **Copy access code** or **Copy share information** creates/updates that share and waits honestly for publication before delivering ready information.

Settings → Sharing lists **All shares** by item/expiry/state; extend and withdraw there. No Flow 2. Existing named grants are compatibility only until they end. Inviting an account with GitHub permissions is a separate whole-project action below. Files and ⋯ → Note are SHR-13's approved entry points; a dedicated Spotlight Share route is deferred, not an unwired delivery promise (D-384).

### Codes, history and share information

SHR-23 is the privacy gate and is implemented before the convenience of SHR-17–19 ([G6](../plan/definition-of-done.md#g6-opaque-share-codes-shares-list-and-information-template)).

| Capability | Contract and negative case |
| --- | --- |
| New code | Random 8-character code, displayed for example as `K7QM-4DRP`; the separator is not a ninth character. Collision-check per project and regenerate before commit. The code identifies the share, not its security entropy; strong passcodes and derivation remain unchanged. |
| No readable names | URLs, code, public share paths, grant files and shared media use opaque random IDs, never titles/paths, slugs, encodings or hashes derived from them. The leak gate checks normalized/Unicode/encoded provenance without logging private values. A rename does not change the identifier. Existing named grants work until expiry/withdrawal, with no new revealing aliases or automatic invalidation. |
| List and Copy again | List by item, opening method, expiry and state. Copy again offers link/access code/information and reuses the same grant, not another share or a delivery/open tracker. |
| Extend / Withdraw | Extend to 7, 30 or 90 days or Never expire. Confirm only after the committed deployment; failed/offline work retains the old effective grant with honest pending/error and explicit Retry. Withdraw removes current access, not copies, keys or old Git history already held by a reader. Expired/withdrawn readers see the generic unavailable state. Delete record is separate from withdrawing live access. |
| Template | Only `{title}`, `{link}`, `{accessCode}`, `{expires}`, `{site}`; no `{name}`. Omit disabled lines, then require an enabled working link or site plus access code. Invalid output keeps the draft, offers correction/default and never claims copied/shared. Include forwarding/expiry limits; never log codes or publish them as metadata. |
| Failures and waits | Failed sealing or deploy preserves the original draft/grant. Pending prevents repeated submissions, one honest task names the step, and waits over 100 ms have an inventory row and fn: measure. |

The G6 journey proves create → Copy again → Extend → Withdraw → reopen using a loopback fake and exact copied information. The owner performs the first real share, extension and withdrawal from Preview.

### Invite a GitHub account

PRJ-12 and [G2.4–G2.9](../plan/definition-of-done.md#g2-turn-on-sharing-and-invite-a-person) govern People. This is not an encrypted per-item share: the invite gives project-wide GitHub access.

1. Enter a GitHub account. A personal repository offers **Collaborator**, never read-only; its warning says the person can read and change everything, including private notes and sharing settings. An organization repository offers only supported Read/Triage/Write/Maintain/Admin roles.
2. Confirm the exact repository, person, role and whole-project/private-note/share-secret access. Cancel sends nothing.
3. Send one request through the signed-in GitHub client in production. Pending prevents duplicate submissions. **Invited** means GitHub accepted the invitation, not that a local draft was saved or that the person has accepted.
4. Invalid account, duplicate invitation, offline, refused permission or rate limit keeps the person and role, reports the cause and offers correction or explicit Retry. Never report success after a failed request or offer an unavailable invite route without its reason.

The operation streams its named task status, permits leaving, and has a wait-inventory row/fn: measure above 100 ms. Units/journeys use API fakes; the first real invite is the owner's G2.9 row.

<h2 id="conflicts-and-offline">Offline, conflicts and recovery</h2>

Project writing continues in the local clone; offline changes queue without claiming backed up. Conflicts show both versions before choosing; never silently overwrite external edits or leave half a rebase. Local notes and standalone files have local journals but no Git safety net, so their state says Saved here / Local only.

The website is read-only, with its own site theme, not a browser app or ease-in plan. Old browser-only drafts must remain recoverable before [retiring the old runtime](../architecture/web-app.md); ordinary import remains independent of that retired funnel.

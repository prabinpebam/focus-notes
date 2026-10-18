# Crash recovery: isolated drafts

How Focus Notes keeps what you were typing when it crashes, without ever touching your files and folders on its own. This page holds the incident that started it, a benchmark of how today's best editors recover unsaved work, the design that replaces the path-keyed recovery journal (D-105), and the plan to build it (WP-8.9, QLT-06, D-190). It's a proposal: the journal described in [Performance and quality → Reliability](performance-and-quality.md#reliability) is what's built today.

> [!NOTE]
> **TL;DR.**
> - **What broke (18 October):** the next launch recreated four notes under names they'd had for a few seconds the night before, and committed them. The journal knew notes only by their path, so a few late keystrokes stayed under an old name after a title rename. Restore then wrote a note back when its file was missing.
> - **What the best do:** VS Code, Zed, JetBrains, Obsidian, Word and macOS keep recovery data **in the app's own data folder**, never beside the file. They restore **into the editor, not onto the disk**, and keep what they can't place for review. Vim, Emacs and Logseq write recovery files into the folder itself, and their users pay for it in Git noise, ghost files and endless prompts.
> - **The rule (QLT-06):** recovery has **no write access to the workspace**. It never creates, writes, renames, moves or deletes a file or folder there by itself. Only the person's own save, or a choice they make, writes a note.
> - **Identity, not paths:** each open note gets a **draft ID** that survives renames. Every text it hands over carries the draft ID and a sequence number, so a late keystroke can't land under an old name.
> - **At launch nothing is written.** Each draft is matched to its note:
>   - matched, and the note is as it was: the note opens with the text as unsaved edits;
>   - the note changed meanwhile: the person compares and chooses in the resolver;
>   - not found: it waits in **Files → Recovered**, kept 30 days.
> - **Plan:** a hotfix today (no restore ever creates a file, and late text follows a rename), then five slices, each with its tests. An **isolation journey** checks that the workspace is byte-for-byte unchanged after any launch.

<figure class="slate-figure">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 380" role="img" aria-labelledby="fncr-flow__title fncr-flow__desc" preserveAspectRatio="xMidYMid meet" data-slate-svg-motion="viewport" data-slate-safe-margin="24">
<title id="fncr-flow__title">Isolated crash recovery: drafts live in the app's data folder and come back through the editor</title>
<desc id="fncr-flow__desc">Three columns. While writing: the editor hands each open note's text to the main process with a draft ID and a sequence number, and the main process keeps it as one draft file in the app's data folder, outside the workspace. At the next launch the drafts are matched to notes by path, front-matter ID, file ID, Git renames, or content, and nothing is written. Three outcomes: matched and unchanged, the note opens with the text as unsaved edits; changed on disk, the resolver compares both; not found, the draft waits in Files, Recovered, for 30 days. Only a save or a choice by the person writes to the workspace.</desc>
<g id="fncr-flow__writing" data-slate-svg-step="1" data-slate-svg-effect="fade-rise">
<rect id="fncr-flow__write" x="24" y="40" width="280" height="300" rx="16" fill="var(--color-neutral-bg-2)" stroke="var(--color-neutral-stroke-2)" stroke-width="1.5" />
<text x="44" y="74" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="18" font-weight="600" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">While writing</text>
<text x="44" y="110" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">Editor hands over the text</text>
<text x="44" y="134" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">draft ID + sequence, ≤ 0.4 s</text>
<text x="44" y="178" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">One draft file per note</text>
<text x="44" y="202" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">app data/recovery, atomic</text>
<text x="44" y="246" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="14" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">A save clears what it covers</text>
<text x="44" y="270" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">by sequence, not by path</text>
<text x="44" y="314" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-success-fg)" font-size="13" font-weight="600" data-slate-fit-target="fncr-flow__write" data-slate-fit-padding="16">Workspace untouched</text>
</g>
<g id="fncr-flow__arrow" data-slate-svg-step="2" data-slate-svg-effect="fade">
<path d="M310 190 L346 190" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<polygon points="354,190 345,195 345,185" fill="var(--color-neutral-fg-2)" />
</g>
<g id="fncr-flow__matching" data-slate-svg-step="3" data-slate-svg-effect="fade-rise">
<rect id="fncr-flow__match" x="360" y="40" width="280" height="300" rx="16" fill="var(--color-brand-bg)" stroke="var(--color-brand-stroke)" stroke-width="1.5" />
<text x="380" y="74" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="18" font-weight="600" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">Next launch: match</text>
<text x="380" y="114" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="14" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">1  Path, hash as it was</text>
<text x="380" y="144" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="14" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">2  Front-matter id</text>
<text x="380" y="174" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="14" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">3  File ID (survives renames)</text>
<text x="380" y="204" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="14" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">4  Git renames since</text>
<text x="380" y="234" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="14" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">5  Unique content match</text>
<text x="380" y="314" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-on-brand)" font-size="13" font-weight="600" data-slate-fit-target="fncr-flow__match" data-slate-fit-padding="16">Reads only. Writes nothing.</text>
</g>
<g id="fncr-flow__branches" data-slate-svg-step="4" data-slate-svg-effect="draw">
<path d="M646 100 L682 72" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<path d="M646 190 L682 190" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
<path d="M646 280 L682 308" fill="none" stroke="var(--color-neutral-fg-2)" stroke-width="2" />
</g>
<g id="fncr-flow__outcomes" data-slate-svg-step="5" data-slate-svg-effect="fade-rise">
<rect id="fncr-flow__ok" x="690" y="30" width="286" height="90" rx="14" fill="var(--color-status-success-bg)" stroke="var(--color-status-success-stroke)" stroke-width="1.5" />
<text x="708" y="60" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fncr-flow__ok" data-slate-fit-padding="14">Matched, unchanged</text>
<text x="708" y="86" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-success-fg)" font-size="13" data-slate-fit-target="fncr-flow__ok" data-slate-fit-padding="14">Opens as unsaved edits</text>
<text x="708" y="106" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fncr-flow__ok" data-slate-fit-padding="14">one undo back to disk</text>
<rect id="fncr-flow__changed" x="690" y="145" width="286" height="90" rx="14" fill="var(--color-status-warning-bg)" stroke="var(--color-status-warning-stroke)" stroke-width="1.5" />
<text x="708" y="175" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fncr-flow__changed" data-slate-fit-padding="14">Changed on disk</text>
<text x="708" y="201" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-status-warning-fg)" font-size="13" data-slate-fit-target="fncr-flow__changed" data-slate-fit-padding="14">Resolver: compare, choose</text>
<text x="708" y="221" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fncr-flow__changed" data-slate-fit-padding="14">nothing written until then</text>
<rect id="fncr-flow__lost" x="690" y="260" width="286" height="90" rx="14" fill="var(--color-neutral-bg-3)" stroke="var(--color-neutral-stroke-1)" stroke-width="1.5" />
<text x="708" y="290" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-1)" font-size="15" font-weight="600" data-slate-fit-target="fncr-flow__lost" data-slate-fit-padding="14">Not found</text>
<text x="708" y="316" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="13" data-slate-fit-target="fncr-flow__lost" data-slate-fit-padding="14">Files → Recovered, 30 days</text>
<text x="708" y="336" font-family="Segoe UI, system-ui, -apple-system, sans-serif" fill="var(--color-neutral-fg-2)" font-size="12" data-slate-fit-target="fncr-flow__lost" data-slate-fit-padding="14">new note only if you choose</text>
</g>
</svg>
<figcaption>Drafts never leave the app's data folder. At launch they're matched to notes, read-only, and each comes back through the editor, the resolver, or the Recovered list. Only the person's save or choice writes to the workspace.</figcaption>
</figure>

## What went wrong on 18 October

The owner's private folder gained four notes at once (`s.md`, `storytelling-as-a-x20.md`, `storytelling-as-a-product.md`, `what-can-be-on-m.md`), all written in the same second as the app started, and committed together as "Create 4 notes". Each was a name one note had held for a few seconds the night before, while its file name followed its title as it was typed (FIL-07): `Untitled` → `s` → `storytelling` → `storytelling-as-a-x20` → `storytelling-as-a-product` → `storytelling-as-a-product-maker`. The real note was intact. The extra files held older text.

| Cause | Where | Why it mattered |
| --- | --- | --- |
| **Identity by path.** Every journal record is keyed by the note's absolute path. | `RecoveryJournal`, `packages/core/src/journal.ts` | A rename has to be replayed in exactly the right order against every text for the entries to follow it. |
| **A race at each rename.** The window hands over text under the path it holds. The main process records the rename (`moved`) when it renames the file, but the window learns the new path only when the reply arrives. A handover in that gap is appended *after* `moved`, under the old path. | `journalSoon` in `packages/core/src/app.ts`; `applyOps` in `apps/desktop/src/main/main.ts` | The entry under the old path is never saved, moved or cleared again. Later saves clear only the new path. |
| **Orphans keep the journal alive.** A clean quit deletes the journal only when nothing is unsaved, and an orphan counts as unsaved. | `RecoveryJournal.close` | The stray entry outlived the session. |
| **Restore writes missing notes back.** A note that's "gone" is written again, by design and by test (D-105 (3); `journal.test.ts`, "or that's gone"). | `restoreJournal` in `apps/desktop/src/main/journal.ts` | A renamed-away path counts as missing, so the old name was recreated, then committed and pushed like any save. |

A separate naming defect showed up on the way: a title typed with a trailing space produced `-x20` in the file name, most likely from the space written out as `&#x20;` before the name was made. It's tracked with the hotfix below.

## How the best do it

Observed 18 October 2026 from each product's source code, documentation and issue tracker. Sublime Text, Word and Notion are closed source, so only their documented behaviour counts. Notion and Bear document no recovery of unsaved edits.

| Product | Where recovery lives | How a note is known | Renames while unsaved | When it's written | At the next launch | Kept until | Isolated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [VS Code hot exit](https://github.com/microsoft/vscode/blob/main/src/vs/platform/backup/electron-main/backupMainService.ts) | App data, `Backups/<workspace hash>/`, one file per dirty editor, the file's URI inside it | Hash of the URI, self-describing | Followed when renamed in VS Code. Renamed outside: not followed ([#339226](https://github.com/microsoft/vscode/issues/339226), open) | About 1 s after an edit, versioned | Silently back in the editor as unsaved; nothing written | Deleted on save or revert; orphans moved to an empty-window backup, never deleted | Yes |
| [Zed](https://github.com/zed-industries/zed/blob/main/crates/editor/src/persistence.rs) | SQLite in app data, `editors` table with the text | Absolute path plus item and workspace IDs | Followed by a watcher event; a crash before it leaves the old path | On every edit, saved in the background | Silently back as unsaved; marked conflicted if the file's modified time changed | Closed tabs pruned; workspaces whose folders are gone cleared after 7 days | Yes |
| [JetBrains Local History](https://www.jetbrains.com/help/idea/local-history.html) | Append-only log in the IDE's system folder | The virtual file system's file object, which lives across renames | A rename is an event in the same file's history | Unsaved documents captured at each command | Manual: browse, compare, revert | 5 working days | Yes |
| [Obsidian File recovery](https://help.obsidian.md/Plugins/File+recovery) | App data, outside the vault | Path | Not followed ([Obsidian team](https://forum.obsidian.md/t/what-is-the-difference-between-file-recovery-and-version-history/103004)) | At most every 5 minutes | Manual: view, copy or restore | 7 days | Yes |
| [Word AutoRecover](https://support.microsoft.com/en-us/word/change-save-frequency-and-where-word-autorecovery-files-are-stored) | `.asd` files in their own folder | Not documented | Not documented | Every few minutes | **Document Recovery pane**: open, save as or delete each | Deleted on a clean close | Yes |
| [macOS documents](https://developer-rno.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/StandardBehaviors/StandardBehaviors.html) | Versions store; `~/Library/Autosave Information` for untitled | The system's document versions | Not documented | When the system decides | **Browse All Versions**, the person picks | System-managed | Yes |
| [Sublime Text](https://docs.sublimetext.io/reference/settings.html) | Session file in app data | Not documented | Not documented | On quit (`hot_exit`) | Silently back | Not documented | Yes |
| [Vim swap files](https://github.com/vim/vim/blob/master/runtime/doc/recover.txt) | `.name.swp` **beside the file** | Path | Not followed | 200 characters or 4 s idle | **E325 ATTENTION** prompt, every time, orphans too | Deleted on a clean exit | No |
| [Emacs auto-save](https://www.gnu.org/software/emacs/manual/html_node/emacs/Auto-Save-Files.html) | `#name#` **beside the file** | Path | Followed when renamed in Emacs | 300 keystrokes or 30 s idle | Manual `recover-file` | Deleted on save | No |
| [Logseq (file graphs)](https://github.com/logseq/logseq/blob/master/src/electron/electron/backup_file.cljs) | `logseq/bak/` **inside the graph** | Relative path | A new chain per name | When a write would delete content | Files just appear | Latest 6 per path | No: users find stray backups after a `git clone` ([forum](https://discuss.logseq.com/t/back-up-files-in-logseq-folder/12912)) |

**What the best share:**

1. **Recovery data lives outside the person's folder.** Six of the seven isolated designs use the app's data folder; the three that don't (Vim, Emacs, Logseq) are the ones people complain about, in Git status, sync clients and repeated prompts.
2. **Restore goes into the editor, never onto the disk.** VS Code and Zed restore silently *because* they write nothing: the person's next save runs the normal checks. Word and macOS write nothing either; they ask.
3. **Identity outlives a name.** JetBrains ties history to a file object that a rename doesn't break, and VS Code puts the original address inside each backup so an entry can't be misattributed. Both of VS Code's open recovery bugs and Obsidian's documented limit are renames done where the tool couldn't see them.
4. **A change on disk is detected before anything is shown as current.** Zed compares the stored modified time; Word shows original and recovered side by side.
5. **Retention is bounded, and orphans are kept, not destroyed.** Zed clears a workspace's state after 7 days only once its folders are gone; VS Code demotes orphans rather than deleting them; JetBrains keeps 5 days; Obsidian 7.
6. **Writes are atomic.** Write a temporary file, flush it, rename it over the old one ([Files are hard](https://danluu.com/file-consistency/)). VS Code's backups truncate and rewrite in place, and its own source names the corruption risk ([#78500](https://github.com/microsoft/vscode/issues/78500)). On Windows the rename is Node's `MoveFileExW` and can briefly fail while OneDrive or antivirus holds the file, so it's retried.

**What to avoid:** recovery files in the notes folder (Vim, Emacs, Logseq); a store keyed by path alone (Obsidian, our journal); restoring by writing to disk without a person (our journal); a prompt for every orphan, forever (Vim); silent discard when a promise can't be kept (Sublime Text, [#6154](https://github.com/sublimehq/sublime_text/issues/6154)).

## The design

### The rules

| # | Rule | How it's kept |
| --- | --- | --- |
| R1 | **Recovery never writes to the workspace.** It never creates, writes, renames, moves or deletes a file or folder there. | The recovery store writes only under `<app data>/recovery/` and refuses any other path. The boundary check forbids it from importing the note writer, the batch or Git. The isolation journey compares the workspace before and after every launch. |
| R2 | **Only a person writes recovered text.** Their save (the normal save, with its "only over what's expected" check, D-92), or a choice in the resolver or the Recovered list. | Recovered text reaches disk only through the editor's save or an explicit action. |
| R3 | **Nothing is lost.** A draft is deleted only when a save that covers it is confirmed, or when the person discards it, or after 30 days unplaced. | Sequence numbers; retention below. |
| R4 | **Nothing is misplaced.** A draft goes to a note only when the match is certain; otherwise it waits in Recovered. | The matching ladder below, in order, stopping at the first certain match. |
| R5 | **A crash still loses at most about a second** (QLT-03), and typing never waits on recovery. | The same pace as today: a handover within 0.25 s, kept within 0.15 s. |

### Identity

- **Draft ID.** When a window opens a note it gets a draft ID (a ULID). It stays the same through every rename the app does, in-app moves, and a folder renamed around it. The path is metadata the main process keeps on the draft, never the key.
- **Sequence.** Each handover carries the draft's next sequence number. The main process keeps only the highest; an older one arriving late is dropped. A save carries the sequence it was sent at, and clears the draft only if nothing newer has arrived.
- **What a draft records to be found again:** the workspace (a hash of its real folder path), the path relative to it, the note's front-matter `id` when it has one, the hash of the text on disk under the draft (its base), the file's ID after the last write or rename (`stat().ino`; NTFS and APFS keep it through a rename, and an atomic save makes a new one, recorded each time), and Git's `HEAD` at the last save.
- **Renames update the draft in the same queue as the texts.** The app's renames, moves and batches (`workspace:rename`, `workspace:apply`) and renames the watcher sees (a file gone and one appearing with the same file ID) update the draft's path. A text arriving after a rename can't create anything, because it names only the draft ID.

### The store

One file per draft: `<app data>/recovery/<workspace key>/<draft ID>.draft`. A JSON header line (the identity above, the sequence, the time) and then the text. Each write is atomic: a temporary file beside it, flushed, renamed over it, retried while Windows holds it. Writes for one draft are queued, and a newer text waiting in the queue replaces an older one (as DEF-14 does today).

| Option | Isolation | Crash safety | Rename handling | New dependency | Verdict |
| --- | --- | --- | --- | --- | --- |
| Append log keyed by path (today, D-105) | Yes | Good: a torn line costs itself | **Replay order decides**, which is how 18 October happened | None | Replace |
| **One draft file per note** (VS Code's shape, made atomic) | Yes | Good: each draft is replaced whole; damage is limited to one draft | Draft ID is the key; the path is a field | None | **Chosen** |
| SQLite with write-ahead logging (Zed's shape) | Yes | Excellent | Draft ID as primary key | `node:sqlite` is still experimental in Node 24, and a native module needs rebuilding for each Electron | Revisit if drafts need queries |

A draft is the whole text each time, as the journal's records are today. A note over 256 KB is kept at most every 0.5 s rather than every 0.15 s, still inside QLT-03's second.

### At launch: match, write nothing

Before the window opens, the main process reads every draft for the workspace (others wait for theirs) and matches each to a note. It stops at the first certain answer:

1. **Already saved:** the file at the draft's path holds exactly the draft's text. The draft is deleted.
2. **Same place, as it was:** the file at the path exists and its hash is the draft's base. **Matched.**
3. **Same place, changed:** the file exists and its hash is neither. **Changed.**
4. **Moved:** the path is gone. Look for the note by its front-matter `id`, then by file ID, then through Git's renames since the recorded `HEAD` (`git diff -M --name-status`), then by a unique file whose hash is the base. Found and as it was: **Matched** at the new path. Found and changed: **Changed**.
5. **Not found:** **Recovered**.

Matching reads Git and files only. It runs off the first-frame path, so the window paints as fast as today.

### What the person sees

| Outcome | What happens | Words (Feedback and dialogs) |
| --- | --- | --- |
| **Matched** | When the note opens (the last note opens at launch), it shows the recovered text as unsaved edits on top of what's on disk, one undo step back to the disk's text. The normal save then writes it like any typing. Other matched notes show a small "unsaved" mark in Files until opened. | "Restored what you were writing in “⟨title⟩”." |
| **Changed** | Opening the note opens the resolver (D-92) with *Recovered* and *On disk*. Nothing is written until the person chooses. | "“⟨title⟩” changed while Focus Notes was closed. Compare to keep what you need." |
| **Recovered** | A **Recovered** section in Files, shown only when it has something, like Recently deleted: title, where it was, when, and length. Each opens read-only, with *Save as a new note…* (the person picks the folder, the last known one by default), *Copy text* and *Discard*. | "Kept 2 drafts we couldn't place · Review" |

One toast at launch sums everything up, with *Review* when anything needs a choice. A launch with nothing to recover says nothing.

### Retention and cleanup

- **Saved:** a draft goes once a save covering its sequence is confirmed on disk.
- **Close without saving:** that draft goes.
- **Clean quit:** drafts with unsaved text stay, which is the point; nothing else changes.
- **Unplaced:** kept **30 days** from its last text, the Recovered row saying until when, then deleted. Longer than Zed's and Obsidian's 7 days, because these are someone's words and they're small.
- **Size:** at most 200 MB of drafts. Past it, the oldest unplaced drafts go first, never a matched one.
- **Removing the workspace** or **signing out** asks first when it has drafts, then deletes them with the workspace's other local data.

### Privacy

A private note's draft is its text, so it's encrypted with the operating system's key store (Electron `safeStorage`: DPAPI on Windows, Keychain on macOS, the secret service on Linux). Where Linux has no key store, it's kept as today, plain text in the app's data folder, and the data inventory says so. Logs and the diagnostic report hold counts only: drafts, matched, changed, recovered.

### Leaving the journal behind

The first launch with drafts reads `recovery-journal.jsonl` once. It turns each live entry into a draft, with no draft ID history and the path as its last known place. The matching ladder then runs as above, so a leftover from the old journal never writes a file. The journal file is then deleted.

## The plan

| Slice | What lands | Done when |
| --- | --- | --- |
| **S0 Hotfix** (today, desktop only) | (a) `restoreJournal` never creates a file: a missing note's text goes to `<app data>/recovered/⟨name⟩ ⟨date⟩.md`, and the toast offers *Show*. (b) The main process maps a text for a path it renamed this session to the new path, along the rename chain, so the race can't leave an orphan. (c) File names drop entities and trailing spaces (`-x20`). | Unit tests: a late text after a rename lands on the new path; a gone note is never written; a title ending in a space names the file without `x20`. `journal.test.ts`'s "or that's gone" case is changed to the new rule. |
| **S1 Drafts** | The draft store, draft IDs and sequences from the window, renames updating drafts, retention, the migration from the journal. Replaces `RecoveryJournal`. | QLT-03's existing fault injection still loses at most a second; unit tests for ordering, renames, saves that clear, damage to one draft. |
| **S2 Matching and restore** | The matching ladder at launch, restore into the editor as unsaved, the resolver for changed notes; nothing written at launch. | Journeys: matched note restored with one undo back; changed note opens the resolver; renamed outside while closed found by file ID; renamed by a pull found through Git. |
| **S3 Recovered** | Files → Recovered as view documents (design system, VVS ≥ 70), *Save as a new note…*, *Copy text*, *Discard*, the launch toast with *Review*. | Journeys by pointer and keyboard; no axe violations, light and dark. |
| **S4 Privacy** | `safeStorage` for private drafts; the data inventory and diagnostic counts. | Unit test round trip; security review. |
| **S5 Proof** | The isolation journey, rename-storm fault injection, and the launch measure. | Below, green on Windows CI. |

### How it's proven

- **Isolation journey (R1).** Seed drafts of every kind (matched, changed, moved, deleted outside, from another workspace, damaged), snapshot the workspace (every path, size, hash, `git status` and `HEAD`), launch, wait for the window and the warm-up, snapshot again: identical.
- **Rename storm.** Type a title one character at a time so each key renames the file, killing the main process at random points, 40 rounds: no file appears in the workspace after relaunch, and at most a second of text is lost.
- **Outside the app.** Rename, move and delete notes, and pull a commit that renames them, while the app is closed: each draft is matched where it went, or kept in Recovered.
- **Measures.** `fn:recovery.match` for matching at launch: under 30 ms with 20 drafts in a 10,000-note workspace, off the first-frame path. The handover-to-disk pace stays as QLT-03 measures it today.

### Related

- [Performance and quality → Reliability](performance-and-quality.md#reliability): the journal as built, until S1 replaces it.
- [Feedback and dialogs → Save and sync status](../design/components/feedback-and-dialogs.md#save-and-sync-status): today's restore toast.
- [Security and privacy → Data inventory](security-and-privacy.md#data-inventory): the journal's row, which S4 replaces.
- [Decisions](../plan/decisions.md): D-105 (the journal as built), D-92 (never save over a change on disk), D-190 (this design).

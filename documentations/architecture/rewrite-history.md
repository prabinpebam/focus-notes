# Rewrite history

The planned local Git record of original text, complete variations and explicit undo/redo choices. It is not the note's publishing branch.

> [!NOTE]
> **TL;DR.** Before sending, durably checkpoint the original. Record complete variations with Git plumbing on local-only refs, then apply accepted text through the normal guarded save. Undo/redo creates a new state, never removes an old commit. Keep private history out of the public repository's objects, refs, logs and pushes. Covers RWR-61 through RWR-66 and the file mechanics in RWR-28/RWR-29; [engine](rewrite-engine.md) defines byte mapping and [providers](rewrite-providers.md) defines data policy. Status: draft, implementation planned.

## What people expect

| Expectation | Source and consequence |
| --- | --- |
| Try several answers without losing the original | Owner's rewrite request; every variation is based on the same durable original, not its predecessor's wording |
| Git history is not rewritten to undo an answer | [git-commit-tree](https://git-scm.com/docs/git-commit-tree), consulted 30 October 2026: create immutable new commit objects with explicit parents |
| A discarded answer never accidentally publishes | PRV-01, SEC-06 and the existing [private submodule boundary](desktop-and-git.md); a ref namespace alone cannot defend against an external mirror push |
| Recovery changes nothing on disk until I choose | QLT-06, [crash recovery](crash-recovery.md); restoring a variation is a new guarded edit |

## How it works

| Record | Durable before | What it contains |
| --- | --- | --- |
| Pre-rewrite checkpoint | Any provider send or projected token | Exact full canonical original source, mapped target and baseline identity |
| Variation | Review becomes available | Complete validated replacement, target base hash and immutable opaque metadata |
| State event | Accept/Discard/history restore/undo/redo finishes | Opaque event kind, selected variation ID and content hash; no prompt, path or note text in messages |
| Ordinary note save | Saved indicator | Accepted/undone/redone canonical note through existing expected-content writer |

## Refs and commits

RWR-61. Recommended safety refinement D-247: use app-local, **no-remote bare Git repositories**, not the workspace object database. This protects even if the person later mirror-pushes their notes repository. The public and private domains have different stores; neither is a submodule of, alternate object directory for, or linked worktree of the workspace.

| Item | Exact contract |
| --- | --- |
| Store path | `<userData>/rewrite-history/<workspaceKey>/<public|private>.git`; `workspaceKey` is a hash of canonical workspace identity, not a note title |
| Ref | `refs/focus-notes/rewrite/v1/<opaqueNoteKey>/<sessionUuid>`; note key is random and mapped to note identity only in app-local metadata |
| Root commit | Empty tree except one fixed-name `content` blob and `record.json`; no parent, independent of workspace HEAD |
| Later commit | Same fixed tree shape; one parent: current side-ref tip. Variations/states append to this session chain. |
| `content` | Exact UTF-8 canonical original or complete candidate; private store uses OS-encrypted envelope bytes, never plaintext Git blobs |
| `record.json` | `{version:1,kind,sessionId,variationId?,baseHash,contentHash,target:{startByte,endByte,replacementEndByte,targetHash,prefixHash,suffixHash},at,encoding:"utf8"|"os-encrypted"}`; offsets describe this record's source snapshot, not future live-editor positions. Private domain encrypts this entire record before writing the blob, leaving only envelope version/encoding outside. No path, title, prompt, endpoint, model response metadata or credential |
| Message | Exactly `Rewrite checkpoint`, `Rewrite variation`, `Rewrite accept`, `Rewrite discard`, `Rewrite undo`, `Rewrite redo` or `Rewrite restore`; optional body `Version: 1` only |
| Author/committer | Fixed local identity `Focus Notes <local@focus-notes.invalid>`; never inherit account identity or sign/contact a signing service |
| Reflog | Disabled for these stores (`core.logAllRefUpdates=false`); immutable commit chain is the record, not reflog retention |

Plumbing runs in main's bounded Git runner with fixed arguments, no shell interpolation and an environment that strips inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY` and alternates. Set explicit `--git-dir`, `--no-replace-objects`, disable system/global config inheritance for the isolated store, hooks and signing; history commands must not invoke filters, credentials, hooks, pagers or remotes.

| Step | Fixed command shape (values validated, bytes on stdin) |
| --- | --- |
| Initialize once | `git init --bare <store>`; validate resolved store stays under the dedicated userData root and has no remotes/alternates |
| Blob | `git --git-dir=<store> hash-object -w --stdin` for content and metadata separately |
| Tree | `git --git-dir=<store> mktree -z` with exactly `100644 blob <oid>\tcontent\0` and `100644 blob <oid>\trecord.json\0` |
| Commit | `git --git-dir=<store> -c commit.gpgSign=false commit-tree <tree> [-p <oldTip>]`, fixed message on stdin, bounded identity/date environment |
| Publish local tip | `git --git-dir=<store> update-ref <ref> <newCommit> <oldTip>`; first update uses the repository's all-zero OID |
| Read | `for-each-ref` under the exact namespace, `log --format` for metadata, then `cat-file` for fixed tree blobs; no checkout |
| Delete expired ref | `update-ref -d <ref> <expectedTip>`; failed compare-and-swap is retried only after re-reading metadata |

Git object IDs may be SHA-1 or SHA-256: detect format, validate exact hex length, do not hardcode 40 characters. Object hash is not a content-privacy guarantee. Main independently checks decrypted source SHA-256. Serialize each store's writes; cross-process lock plus compare-and-swap prevents two windows dropping a variation. A failed local checkpoint/commit cannot proceed to Send/Review. Report a content-free local-history failure, retain in-memory text and allow retry.

No `git add`, checkout, stash, amend, reset, rebase, cherry-pick or force-push occurs in rewrite history. Never use the person's index. A history commit is never a parent of the note branch, and no workspace commit references history OIDs.

## Undo and redo

RWR-62. Accept inserts one complete replacement into the editor's undo stack; streaming and preview navigation do not enter it.

| Person's action | Editor effect | Local history | Workspace Git |
| --- | --- | --- | --- |
| Try again | Restore original target in projection, generate a new sibling variation semantically | Append complete variation to session chain, preserve all previous ones | None |
| Previous/next | Change complete preview only; no provider call | Selection metadata changes; no duplicate content commit necessary | None |
| Accept | One undoable canonical range replacement | Append `Rewrite accept` after guarded save acknowledgement; pending marker until then | Normal existing cadence saves/commits/pushes accepted content |
| Undo accepted rewrite | Replace accepted range with original, preserving independent edits | Append `Rewrite undo` containing resulting canonical source | New normal save/commit; never remove accepted commit |
| Redo | Reapply exact accepted replacement if editor redo is still valid | Append `Rewrite redo` | New normal save/commit |
| Discard before Accept | Remove projection, retain original and independent edits | Append `Rewrite discard`; complete variations stay for retention | No generated content enters branch |
| Restore old variation after restart | Fresh session preview against current note; explicit Accept required | Append `Rewrite restore` after successful acceptance, referring by opaque ID | Normal guarded save, never checkout/reset |

Normal editor behavior applies: new typing can clear redo. Git history does not pretend to resurrect the process-local undo stack after restart; local history offers explicit variation restoration instead. If current target changed, do not auto-patch: show the old complete variation read-only and offer a new-file copy within the same privacy root or an explicit fresh target selection. Do not reuse stale offsets.

History snapshots are not permission to replace a newer complete note. Within a live session, navigation extracts only the variation's replacement span from its checksummed snapshot, then splices it into the currently mapped target; newer outside edits remain. After restart, compare current canonical source and original target identity before reconstructing that map. If it cannot be proven, use read-only comparison/new selection rather than restoring the historical prefix/suffix over newer writing.

Ordinary saves retain existing readable commit messages (which can include the note's path). Rewrite-specific messages never include prompts, output, private paths or titles. Accepted private content is committed only in the private repository; the public parent commit records its submodule pointer, not private blobs.

**Existing sync caveat:** the ordinary Git service currently rebases its own unpushed note commits after a rejected push. This spec does not change all existing sync behavior or claim it never rebases. The no-history-rewrite rule applies to the isolated rewrite chain and to undo/redo; rewrite never invokes rebase to select a version. Normal private-first push ordering remains unchanged.

## Restart and recovery

RWR-63. App-local index maps opaque note keys to stable note ID, draft ID, last path and source identity. Private index and private blobs are OS-encrypted before disk write; no plaintext temp file, plaintext index or public object receives private text. Prompts are deliberately absent.

1. Load and checksum the index; validate refs and object structure without writing the workspace. Ignore incomplete temp files; keep damaged records for explicit removal, not silent replacement.
2. Match current note by existing recovery identity ladder. Ambiguous/missing note stays in local history/Recovered; never create a file automatically.
3. Open the canonical note/recovery draft. If a valid complete unaccepted variation exists, show "A rewrite is ready to review." Reopening it reconstructs review, not an automatic acceptance.
4. A history list shows local date/time, variation number and Accepted/Discarded/Available status using message keys, never a prompt-derived label. Previous-session variations are reachable from the rewrite review's History action.
5. Accept from history uses current target validation and normal guarded save. If disk differs, use the existing resolver; never overwrite merely because a history item has a newer timestamp.

Atomic index updates follow durable Git objects/ref updates; after a crash, discover valid unindexed session refs and repair app-local index metadata only. An indexed missing ref is a visible recoverable-history error. A pending accepted record compares actual disk hash; it cannot replay an automatic write. Key-store decryption failure blocks reading private history and explains how to unlock/retry, without plaintext fallback.

## Retention

RWR-64. Retain at most **30 days**, **20 complete variations per note**, **100 MiB per domain store** and **200 MiB per workspace** (both domains together). The per-note limit refines D-244's initial per-session proposal so opening another session cannot bypass the cap; its per-store byte limit remains. Never evict an active session's original checkpoint or the only recovery copy of unsaved accepted/user text. If protected data alone reaches the budget, stop new generation with `too-large` and offer explicit local-history cleanup; do not discard unsaved work to meet a quota.

| Cleanup | Rule |
| --- | --- |
| Timing | At startup after recovery matching, then at most once per day, idle/off the typing path |
| Order | Oldest inactive session ref first; retain each active session's original. Before a new session, remove enough inactive session refs to reserve room within the per-note cap; never delete individual middle-chain commits. |
| Append-only chain consequence | Do not rewrite a chain to drop one middle variation. Retention unit is the entire inactive session ref; the 20-variation limit prevents new attempts in a session at 20, offering a new session after explicit close. |
| Removal | Delete unpublished side refs with expected tip; remove matching local index records atomically. No workspace ref or file deletion. |
| Objects | Isolated-store maintenance prunes unreferenced objects only after a 7-day grace period, with no active readers/writers; this is storage reclamation, not rewriting surviving history |
| User choice | "Clear local rewrite history" shows scope and bytes; cannot clear unsaved original/recovery protection. No provider/account deletion implied. |
| Security claim | Ref deletion and GC are not secure erasure on SSDs/backups. Private encryption reduces exposure; do not promise forensic deletion. |

At 20 live variations, Try again is disabled with `rewrite.history.limit`: "Keep or discard this rewrite before starting another." Storage accounting includes encrypted envelopes and Git overhead, not only generated characters.

## Private isolation

RWR-66. Private originals, variations and identity metadata never enter a public Git object database, public note, public export, diagnostics or published page. A private note shared with an audience remains private for rewriting; share grants confer no model-provider consent.

| Boundary | Enforced prohibition / planned proof |
| --- | --- |
| Workspace pushes | Rewrite stores have no remote and no alternate; ordinary sync accepts only actual workspace/private repo handles. Test explicit refspec and external workspace mirror push: remote receives no rewrite objects/refs. |
| Private/public domains | Separate isolated stores and encrypted private content. Trap public `hash-object` stdin and assert no private fixture sentinel reaches it. |
| Git config attack | Refuse remotes, alternates, unexpected object path, symlink escape, upload/receive helpers or inherited environment in local history store |
| Output destination | Private variation restores only to original private root or a new file there; the file chooser cannot make it public |
| Logs/messages | Fixed kinds, counts and durations only; no path, title, prompt, endpoint query, credentials, note or output excerpts |
| Exports/publishing | History excluded from workspace bundles, site build and `packages/seal`; encrypted share publication includes only explicitly accepted note content |

SafeStorage is local-at-rest protection, not protection from malicious applications running as the same Windows user. No new cloud backup or history upload is introduced.

## Non-Git folders

RWR-65. The normal note folder is never initialized or committed just to rewrite it.

| Environment | History behavior |
| --- | --- |
| Workspace Git with commits | Same isolated-store contract; no dependency on HEAD's object graph |
| Unborn workspace repository | Same; root side commit has no parent, note branch remains unborn until ordinary save policy creates its first commit |
| Non-Git folder, Git installed | Same no-remote app-local Git store; note folder untouched |
| Git absent/unsupported | Atomic app-local checkpoint/variation files with the same hashes, privacy, retention and review semantics; label local versions rather than claiming commits. Installation is not required for fake-only/ordinary rewriting. |

Fallback storage is `<userData>/rewrite-history/<workspaceKey>/fallback/<domain>/<sessionUuid>/` with fixed `original`, numbered complete `variation-0001` files and atomic index. Private files are encrypted envelopes. This is a declared capability fallback, not a success-shaped Git failure: a failed available Git store raises a history error and does not silently switch formats. Later migration imports checksummed complete records as new local commits without deleting the fallback until verification succeeds.

## Decisions

| ID | Status | Choice and source |
| --- | --- | --- |
| D-247 | Proposed | Isolated no-remote Git side-history stores, separate encrypted private domain, rather than workspace side refs; Git plumbing supports root commits independent of HEAD, and namespace-only refs can escape via mirror pushes. Reconciles F3 before implementation. |

Planned acceptance: `rewrite-history-plumbing`, `rewrite-history-restart`, `rewrite-history-private-isolation`, `rewrite-history-retention` and `rewrite-history-no-git`, all fixture-only. See the [acceptance matrix](../plan/rewrite-acceptance.md).

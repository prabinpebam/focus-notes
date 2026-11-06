# UI states audit

> [!NOTE]
> **TL;DR.** This audit checks the design system and every surface of the app against the `ui-states` skill: every change confirmed where it happened, every failure recoverable, every empty space explained. The `design-system`, `perceived-performance` and `ui-copy` skills apply alongside it. The waits the app was built around are strong: the note save, conflicts, the AI rewrite and Spotlight. What's weak is what happens after a person changes something. The three biggest improvements:
> 1. Stop silent failures. A failed setting or project change today says nothing, or keeps a value that wasn't saved (F1).
> 2. Confirm every change on the control itself: a tick on a field, a spinner in a switch, a Retry when it fails. Add a commit track to the task tracker to drive it (F2).
> 3. Queue three notifications instead of dropping all but two, and retain only reasoned must-read decisions (F3, narrowed by D-357).
>
> Fifteen findings are ranked below, with the missing tokens and primitives and an order of work: eight design slices for the gallery first, then nine wiring slices.

## Visual review and approval

### Owner rules, 6 November

The owner's 6 November feedback ([OFB stage](../plan/definition-of-done.md#owner-feedback-batch-6-november-ofb)) changes two rules on this page, and both are enforced by checks rather than per-screen fixes:

- **Notifications dismiss themselves (D-357).** Auto-dismiss is the default for every notification, including confirmations that carry Undo, such as "Deleted". Must-read (manual dismiss) is only for a notification the person has to read or decide on: data at risk, or an error whose recovery needs their choice. This narrows F3's "an error that needs a choice is hard-dismissed" to exactly that case. The notification inventory below lists every notification with its type and reason; a test fails on any notification missing from it or on a must-read row without a reason.
- **One pending pattern per need (D-356).** Compact controls (pins, icon buttons, Switches, menu buttons) show only the own-border pending arc, then the success or danger outline. The overlaid centre spinner seen on pin and unpin is removed, not hidden, and each primitive keeps one variant per state a person needs.

#### Notification inventory

One row per production notification call, including dynamic message expressions and forwarding calls (which delegate dismissal to the originating caller). `node tools/notification-inventory.mjs` scans the TypeScript AST, so dynamic keys cannot escape coverage. Call IDs hash the source call, not its line number. The check rejects missing or changed rows, dismissal types and reasons; the deliberate broken fixtures also reject invalid must-read reasons. `--write` refreshes this block after reviewing changed callsites.

Auto-dismiss includes ordinary errors, Retry and Undo. Only retained-text risk, a recovery decision or the running rewrite's only Stop control is must-read. Pending actions pause their remaining timer, as do hover, focus and a background window.

<!-- generated:notification-inventory -->
| Call ID | Message key or expression | Shown when (source) | Type | Reason | Action |
| --- | --- | --- | --- | --- | --- |
| 86af98ee0bdb-1 | catalog.format("agents.failed") | packages/core/src/agents-app.ts:76 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 8d55f99b65e0-1 | catalog.format(&#96;agents.undo.${known.includes(r.problem) ? r.problem : "failed"}&#96;, { path: row.path }) | packages/core/src/agents-app.ts:145 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| dc022ea5d858-1 | catalog.format("agents.undo.done", { path: row.path }) | packages/core/src/agents-app.ts:146 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 939f5deaa911-1 | catalog.format("agents.cli.failed") | packages/core/src/agents-app.ts:156 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| bef813ab1af3-1 | status | packages/core/src/ai-app.ts:148 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| bef813ab1af3-2 | status | packages/core/src/ai-app.ts:369 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 812a0f7ee465-1 | t("ai.scan.cancelFailed") | packages/core/src/ai-app.ts:473 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 97339fd20f6d-1 | t("rewrite.error.kept", { reason: reason(new Error(code), "ai.error.provider", retryAfter) }) | packages/core/src/ai-app.ts:578 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| eaf52e16a4df-1 | t("rewrite.error.stale") | packages/core/src/ai-app.ts:673 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| d0962c951e39-1 | t(caret ? "rewrite.writing" : "rewrite.running", { name }) | packages/core/src/ai-app.ts:680 | must-read | operation-control: The running rewrite's only Stop control must remain reachable. | "rewrite.cancel" |
| 622621cf4b88-1 | catalog.format("project.launch.restoreFailed") | packages/core/src/app.ts:653 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e30359ba296c-1 | catalog.format("project.launch.rememberFailed") | packages/core/src/app.ts:671 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e30359ba296c-2 | catalog.format("project.launch.rememberFailed") | packages/core/src/app.ts:687 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 29b2d94c6d43-1 | e instanceof SyncFailed ? e.message : catalog.format("toast.saveFailed") | packages/core/src/app.ts:748 | must-read | data-at-risk: Retained note text or recovered drafts need review before they can be safely stored.; recovery-decision: Conflicting versions need the person's recovery choice. | action |
| e30359ba296c-3 | catalog.format("project.launch.rememberFailed") | packages/core/src/app.ts:774 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 92d64e7506d8-1 | catalog.format("toast.noUnderline") | packages/core/src/app.ts:983 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 5bc6099cdaf0-1 | catalog.format("find.replaced", { count: replaced }) | packages/core/src/app.ts:1147 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 70fd587254d1-1 | catalog.format("toast.actionFailed") | packages/core/src/app.ts:1169 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | retryCommand |
| ab0cb7f69e8d-1 | m | packages/core/src/app.ts:1308 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| c92a56db27bf-1 | catalog.format("demo.aboutText") | packages/core/src/app.ts:1360 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "demo.download" |
| dd1b834760a5-1 | catalog.format(on ? "toast.settingsSynced" : "toast.settingsLocal") | packages/core/src/app.ts:1423 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3ca8f065a3a8-1 | catalog.format("toast.settingsFailed") | packages/core/src/app.ts:1427 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 95707da4a75e-1 | catalog.format("toast.revealItemFailed") | packages/core/src/app.ts:1689 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 622621cf4b88-2 | catalog.format("project.launch.restoreFailed") | packages/core/src/app.ts:1836 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 622621cf4b88-3 | catalog.format("project.launch.restoreFailed") | packages/core/src/app.ts:1843 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| d2cef3e5197d-1 | catalog.format("block.copiedLink", { name: b.text }) | packages/core/src/block-handle.ts:93 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2e9627698b69-1 | catalog.format("table.copyFailed") | packages/core/src/block-handle.ts:95 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| a22985aaed62-1 | catalog.format("toast.copiedToLocal", { note: titleOfPath(target) }) | packages/core/src/browser.ts:165 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| bb66f8128c94-1 | count &lt; 0 ? catalog.format("toast.exportFailed") : catalog.format("toast.exported", { count }) | packages/core/src/browser.ts:176 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | Conditional options; see source |
| 156df44b13ae-1 | catalog.format("toast.imported", { count: r.added, renamed: r.renamed }) | packages/core/src/browser.ts:190 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| eb5aa6ab268d-1 | catalog.format("toast.importFailed") | packages/core/src/browser.ts:192 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 6e5ced57bfd5-1 | catalog.format(remember ? "toast.unlockedRemembered" : "toast.unlocked", { count: (await bridge.listNotes?.() ?? []).filter((n) =&gt; sourceOf(n.path) === "private").length }) | packages/core/src/browser.ts:215 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| ad63ab175976-1 | catalog.format(messageKey) | packages/core/src/browser.ts:228 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| d08ca56be42b-1 | catalog.format(&#96;sync.problem.${p}&#96;) | packages/core/src/conflict-app.ts:100 | must-read | recovery-decision: Conflicting versions need the person's recovery choice. | resolveAction() |
| 2edb5f53d5ed-1 | done | packages/core/src/conflict-app.ts:104 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 219b5148e76a-1 | catalog.format("sync.problem.failed") | packages/core/src/conflict-app.ts:108 | must-read | recovery-decision: Conflicting versions need the person's recovery choice. | resolveAction() |
| 4aba116dd11a-1 | catalog.format("toast.changedOutside", { note: titleOf(n) }) | packages/core/src/conflict-app.ts:129 | must-read | data-at-risk: Retained note text or recovered drafts need review before they can be safely stored. | resolveAction() |
| e36060f9059e-1 | catalog.format("conflict.changedAgain") | packages/core/src/conflict-app.ts:180 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| bd8810ae2781-1 | catalog.format(failure) | packages/core/src/conflict-app.ts:226 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 1f13275f5eb1-1 | catalog.format("toast.saveFailed") | packages/core/src/conflict-app.ts:234 | must-read | data-at-risk: Retained note text or recovered drafts need review before they can be safely stored. | None |
| 2edb5f53d5ed-2 | done | packages/core/src/conflict-app.ts:239 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 21c6c994511c-1 | catalog.format(ok ? "diagnostics.copied" : "diagnostics.failed") | packages/core/src/diagnostics-app.ts:67 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | Conditional options; see source |
| 38de238db4e7-1 | catalog.format("diagnostics.failed") | packages/core/src/diagnostics-app.ts:78 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| ead6b0781b05-1 | catalog.format("diagnostics.saved") | packages/core/src/diagnostics-app.ts:79 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 72e602cd7ca0-1 | words | packages/core/src/drafts-app.ts:231 | must-read | data-at-risk: Retained note text or recovered drafts need review before they can be safely stored. | "recovery.review" |
| 70dabc00aaf0-1 | words | packages/core/src/feedback-app.ts:205 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "feedback.openIssue" |
| f27dc8ffb4e9-1 | catalog.format("feedback.notSent") | packages/core/src/feedback-app.ts:212 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "feedback.open" |
| 9c3a7621cbfa-1 | catalog.format(&#96;feedback.copied.${copied}&#96;) | packages/core/src/feedback-app.ts:235 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 0450a69e92c6-1 | catalog.format("toast.revealFolderFailed") | packages/core/src/files-app.ts:267 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 39607c2f300a-1 | withLinks(o.done, writes) | packages/core/src/files-app.ts:500 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | undoAction(o.undo) |
| c1bd84941e01-1 | o.failed(reason(opErrorCode(e))) | packages/core/src/files-app.ts:515 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| db50c6bdb7cf-1 | catalog.format(key, { ...args, reason: reason(why) }) | packages/core/src/files-app.ts:519 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3b36e7f0caab-1 | done | packages/core/src/files-app.ts:658 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| edbeaaef6f47-1 | failed(reason(plan.reason)) | packages/core/src/files-app.ts:716 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| b98c7ab09d1e-1 | failed(reason(opErrorCode(e))) | packages/core/src/files-app.ts:722 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| b98c7ab09d1e-2 | failed(reason(opErrorCode(e))) | packages/core/src/files-app.ts:768 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 5ae426d72c8b-1 | catalog.format("files.importNone", { what: skipped }) | packages/core/src/files-app.ts:771 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| edbeaaef6f47-2 | failed(reason(plan.reason)) | packages/core/src/files-app.ts:777 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 34d62b93c3e5-1 | catalog.format("toast.revealItemFailed") | packages/core/src/files-app.ts:813 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 34d62b93c3e5-2 | catalog.format("toast.revealItemFailed") | packages/core/src/files-app.ts:835 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2884623f70a5-1 | catalog.format("files.copiedItems", { what: rowsWhat(rows) }) | packages/core/src/files-app.ts:870 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 5685f46aae9b-1 | catalog.format("toast.copyItemsFailed") | packages/core/src/files-app.ts:872 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 427468e8dd77-1 | rows.length === 1 ? catalog.format("files.copiedPath", { what: rowsWhat(rows) }) : catalog.format("files.copiedPaths", { count: rows.length }) | packages/core/src/files-app.ts:885 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| c32033ff7f15-1 | catalog.format("toast.copyFailed") | packages/core/src/files-app.ts:887 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2124dbd82f11-1 | catalog.format("files.copiedText", { what: rowsWhat([row]) }) | packages/core/src/files-app.ts:906 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| c32033ff7f15-2 | catalog.format("toast.copyFailed") | packages/core/src/files-app.ts:908 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| edbeaaef6f47-3 | failed(reason(plan.reason)) | packages/core/src/files-app.ts:935 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3b36e7f0caab-2 | done | packages/core/src/files-app.ts:1019 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| f71763aea2b7-1 | failed(reason("notFound")) | packages/core/src/files-app.ts:1064 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| edbeaaef6f47-4 | failed(reason(plan.reason)) | packages/core/src/files-app.ts:1068 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e46a31674a49-1 | catalog.format("recovered.discardFailed", { what: draftName(d) }) | packages/core/src/files-app.ts:1087 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3b36e7f0caab-3 | done | packages/core/src/files-app.ts:1091 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 083bd07d0e10-1 | catalog.format("recovered.gone", { what: draftName(d) }) | packages/core/src/files-app.ts:1121 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| b6fb889c4d99-1 | catalog.format("recovered.copyFailed", { what }) | packages/core/src/files-app.ts:1148 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3b36e7f0caab-4 | done | packages/core/src/files-app.ts:1151 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e37d4f447ca7-1 | error | packages/core/src/files-app.ts:1177 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e37d4f447ca7-2 | error | packages/core/src/files-app.ts:1240 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 3b36e7f0caab-5 | done | packages/core/src/files-app.ts:1347 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| d5276c437f2d-1 | catalog.format("files.renameFailed", { what: whatOf([path]), reason: reason(opErrorCode(e)) }) | packages/core/src/files-app.ts:1351 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| b2910f7c51f7-1 | catalog.format("toast.signedIn", { login: signedInAs(a) }) | packages/core/src/first-run-app.ts:280 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 61e752d949cf-1 | catalog.format("format.link.copied") | packages/core/src/format.ts:203 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 6be22b1cff7e-1 | catalog.format("format.link.copyFailed") | packages/core/src/format.ts:205 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 9c91336d1d05-1 | catalog.format("held.failed") | packages/core/src/held-app.ts:99 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 69aea155edbc-1 | catalog.format("image.import.unavailable") | packages/core/src/images-app.ts:55 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 8ee41e0c7c6e-1 | catalog.format(message) | packages/core/src/images-app.ts:82 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 0dbc9b2dcb6e-1 | catalog.format("image.import.image-target-changed") | packages/core/src/images-app.ts:91 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| aa825aae93a6-1 | catalog.format("image.read.notice") | packages/core/src/images-app.ts:100 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| d7f5b5c55439-1 | catalog.format("image.edit.saved") | packages/core/src/images-app.ts:209 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 772796636aa7-1 | catalog.format("toast.imported", { count: 0, renamed: 0 }) | packages/core/src/import-app.ts:54 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| c43a381d7756-1 | catalog.format(/tooLarge\s*$/.test(e instanceof Error ? e.message : "") ? "toast.importTooLarge" : "toast.importFailed") | packages/core/src/import-app.ts:58 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 6ff80c2ea178-1 | catalog.format(i.to === "public" ? "toast.importedPublic" : "toast.importedPrivate", { count: r.added, renamed: r.renamed }) | packages/core/src/import-app.ts:82 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| b3f851c12fc4-1 | catalog.format("toast.importNotWritten") | packages/core/src/import-app.ts:85 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 1b42fa8cf924-1 | reason ? catalog.format("keyboard.editFailedWhy", { reason }) : catalog.format("keyboard.editFailed") | packages/core/src/keybindings-app.ts:72 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2ab81cdd8c09-1 | catalog.format("keyboard.resetDone") | packages/core/src/keybindings-app.ts:87 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 364f21c82560-1 | catalog.format("keyboard.editFailed") | packages/core/src/keybindings-app.ts:87 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 277ecbb5f861-1 | done | packages/core/src/note-history-app.ts:236 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "history.undoRestore" |
| 2034069aed21-1 | catalog.format("history.restoreFailed") | packages/core/src/note-history-app.ts:240 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| cf5cc757d082-1 | catalog.format("history.undoChanged") | packages/core/src/note-history-app.ts:255 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "history.open" |
| 8220b5d4ba59-1 | catalog.format("history.undoFailed") | packages/core/src/note-history-app.ts:274 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "history.undoRestore" |
| ed49319dc999-1 | catalog.format("toast.printFailed") | packages/core/src/print-app.ts:90 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 7d8efa32dffe-1 | catalog.format("project.delete.unavailable") | packages/core/src/project-delete-app.ts:140 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 50f6d9631bb9-1 | catalog.format("project.delete.unsaved") | packages/core/src/project-delete-app.ts:157 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 5542d39128f7-1 | catalog.format("project.delete.exportFailed") | packages/core/src/project-delete-app.ts:216 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2aaa120d3bc5-1 | catalog.format(off ? "project.delete.doneOffline" : r.privateKept ? "project.delete.donePrivate" : "project.delete.done", { name: n, path: r.privateKept ?? "" }) | packages/core/src/project-delete-app.ts:290 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 7d8efa32dffe-2 | catalog.format("project.delete.unavailable") | packages/core/src/project-delete-app.ts:330 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 45563c248bea-1 | ctx.catalog.format("quick.import.saved", {name: copied.split(/[\\/]/).at(-1) ?? ""}) | packages/core/src/project-open-app.ts:161 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e6f62a11ca27-1 | ctx.catalog.format("toast.publicLinkCopied", { note }) | packages/core/src/public-link-app.ts:50 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| df01200cab62-1 | ctx.catalog.format("spotlight.copyFailed") | packages/core/src/public-link-app.ts:52 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2d1816abb257-1 | e instanceof SyncFailed ? e.message : catalog.format("sync.problem.failed") | packages/core/src/repo-backup.ts:194 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2c24c1026632-1 | catalog.format("toast.signOutFailed") | packages/core/src/settings-app.ts:172 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| e89e285fae73-1 | git ? catalog.format("toast.signedOut") : catalog.format("toast.signedOutApp", { login: &#96;@${r.account?.login ?? before}&#96; }) | packages/core/src/settings-app.ts:178 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| a1b8ed2dda3b-1 | catalog.format("toast.saveFailed") | packages/core/src/settings-app.ts:189 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 8bf767b91621-1 | catalog.format("sharing.publish.saved") | packages/core/src/sharing-preview.ts:107 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 12a158e779e1-1 | catalog.format("paste.imagesLeftOut") | packages/core/src/slash.ts:143 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 0b3ece652939-1 | catalog.format(key, args) | packages/core/src/slash.ts:149 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 88dc1e6063a2-1 | catalog.format("paste.lineBreaks") | packages/core/src/slash.ts:152 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 7284eb7be408-1 | done | packages/core/src/spotlight-app.ts:639 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 49ed82fdadc3-1 | msg("spotlight.copyFailed") | packages/core/src/spotlight-app.ts:641 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| cabf6a6b3513-1 | msg("actions.contentMissing") | packages/core/src/spotlight-app.ts:651 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 18541b7ebc54-1 | msg("actions.stale") | packages/core/src/spotlight-app.ts:662 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 91c87aa45309-1 | describe(problem) | packages/core/src/sync-app.ts:87 | must-read | recovery-decision: Conflicting versions need the person's recovery choice. | action(problem) |
| 6858f3328871-1 | catalog.format(format === "tsv" ? "table.copied.tsv" : "table.copied.markdown") | packages/core/src/table.ts:134 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 046fc9d0f656-1 | catalog.format("table.copyFailed") | packages/core/src/table.ts:136 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 20eaa0d6a741-1 | catalog.format("theme.deleted", { name: t.name }) | packages/core/src/theme-manager-app.ts:483 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "theme.restore" |
| fd47aa4be6cd-1 | catalog.format("toolbar.customize.saveFailed") | packages/core/src/toolbar-customize.ts:59 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 1ef287d1feb0-1 | catalog.format("toast.workspaceNewer", { found: w.found ?? 0 }) | packages/core/src/workspace-app.ts:81 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 22f5b10df45e-1 | catalog.format("toast.workspaceUnreadable") | packages/core/src/workspace-app.ts:82 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 2f95d4f8beaa-1 | catalog.format("toast.workspaceOlder") | packages/core/src/workspace-app.ts:84 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | "workspace.migrate" |
| 96d315b91b76-1 | catalog.format("toast.workspaceUpdateFailed") | packages/core/src/workspace-app.ts:109 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| a1fa4aa71bfc-1 | catalog.format("toast.workspaceUpdated") | packages/core/src/workspace-app.ts:114 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| ae0f170964a6-1 | catalog.format("toast.changedOutside", { note: stemOf(nameOf(path)) }) | packages/core/src/workspace-app.ts:199 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
| 55b2286d882c-1 | catalog.format("files.firstNameFailed") | packages/core/src/workspace-app.ts:258 | auto-dismiss | Nonessential outcome; input and recovery remain in their originating surface. | None |
<!-- /generated:notification-inventory -->

### Owner feedback batch, 6 November: button geometry

The owner's found-notes screenshots exposed a shared primitive defect, not three missing per-view insets. Legacy `bleed` removed Button's start padding and painted on a negative-inset pseudo-element; the floating hover override also painted the smaller real button. The overlapping boxes explain the offset "More options" hover. Button, MenuButton and IconButton now keep their token inset and all state paint on their own box; the compatibility input cannot opt out.

The obsolete `data-bleed` marker is removed too: the visual-quality probe must measure these controls' real box, not skip it and measure the inset SVG. The first CI run revealed that stale marker as false top-padding findings across dialog and sheet headers; the positive-padding rule itself stays unchanged.

The taller, correctly padded header also exposed minimum-height scroll clips. The category tabs' inset focus ring needs no exterior scroll-padding allowance (which otherwise pushes a 32 px tab beyond a 34 px viewport); SearchField uses its existing inset focus outline without a second exterior shadow, so it remains complete in a one-control-tall Files viewport.

### Owner feedback batch, 6 November: toolbar integration

The approved ToolbarComposer replaces the old action-button list in the existing Customize toolbar dialog, reached from More or Settings → Keyboard. Each drop publishes a complete validated order to the live toolbar and the existing serial device-settings write lane. Failure restores the durable order and shows a localized error; unit evidence includes consecutive failed saves. Reorder, removal, addition, hold-to-replace, full refusal and Reset are checked through the real app and process restarts. Only the active drop slot has an accent outline; no new writing-window element is added, and the separately landed AI scan/editor focus work is not replayed.

The first toolbar gate exposed a startup race in the unrelated delete/Undo fixture: its CI snapshot showed the deletion notification without Undo, while Git history became available only afterward. The journey now waits for the real Recently deleted control before deleting, proving the required history capability has initialized. Its Undo, exact restored bytes, history and remote assertions remain unchanged; three repeated invisible runs pass.

### Owner feedback batch, 6 November: on/off audit

The source audit found 27 production toggle declarations (one Agents repeat renders five permissions), plus the command-driven toolbar. All view declarations and the runtime toolbar now follow these semantic groups. The checker rejects boolean buttons, including an explicit false pressed state without `toggle`; only formatting and sibling groups of at least three distinct named choices pass. Primitive gallery fixtures demonstrate supported states, not settings, and are the only fixture exemption.

| Surface | Meaning | Required treatment | Evidence |
| --- | --- | --- | --- |
| Settings → Agents | Five independent on/off permissions, saved as one permission document | Switch; own-border pending/confirmation/refusal, stored value and focus retained, row Retry | Implemented locally: 13 core units; real Git-backed restart journey; synthetic refusal/Retry keyboard journey with stable bounds |
| Settings appearance sync; sharing link/passcode, new words on Save and included items; reader Remember; feedback attachment | Binary settings or explicit-save draft choices | Switch | Converted. Appearance sync keeps the stored value until acknowledged, shows pending/confirmation/refusal and row Retry; drafts commit only on their existing Save |
| Find and Find in all: case, whole word, regular expression, selection | Binary search settings | Switch | Converted; shortcuts preserved. Compact Find puts the same Switches in the existing PopoverPanel, with every label in bounds at 360 × 320; the match remains visible afterward |
| Trigger toolbar: Focus mode and light/dark | Binary mode settings | Switch | Converted; real command and keyboard journeys, durable focus refusal/Retry, composer restart journey |
| Find's replacement disclosure; Files pin/unpin; immediate new passcode words | Open/close or named actions, not settings | Action buttons, without misleading pressed semantics | Disclosure uses `aria-expanded`; Files uses Dock/Undock names, not pressed state. Immediate passcode regeneration stays an action; the manage-share draft's new-words choice is a Switch |
| Bold, italic, strike, code, link | Editor formatting | Pressed buttons are appropriate | Preserve |
| Rewrite presets | Three mutually exclusive choices | Segmented choice | Preserved; checker accepts three distinct named values and rejects two or duplicated choices |
| Gallery prototype navigation and image samples | Named screen/sample choices, not settings | Three-or-more choice buttons; smaller prototype navigation stays an ordinary action | Preserved. Image Rounded corners and Fit are Switches, not formatting buttons |
| Theme, font, colour and project-logo selection | Named multi-option palettes, not a binary setting | Existing radio/choice primitives | Preserved unchanged |
| Project colour border and watermark | Binary persistent settings, not segmented choices | Switch | Border defaults on even when older saved settings omit the field; 2 px token. Off removes only the outline, keeps project identity and geometry, and survives restart. Watermark now keeps the stored value on refusal and retries the exact choice |

Find now reserves its actual measured layer height, plus the semantic item gap, rather than assuming an icon-only row height. The renderer supplies and subscribes to its already-declared `env.sizeClass` using the token breakpoints; only regions that read the environment subscribe, and resizing within a class does not rerender them. The native small-window check measures the visible label, not React Aria's hidden checkbox wrapper, and checks both axes and the match's on-screen bottom.

### Owner feedback batch, 6 November: pending-pattern inventory

The compact `busy` and `commit` inputs share one rendered pattern, not two lookalikes. IconButton's centre Spinner import, stacked glyph wrappers, delayed hiding/reveal animations and unused delay token are deleted. The glyph stays visible. Pin/unpin is a named action, not an on/off setting: Files and the composer's drag-only previews no longer claim a pressed setting state.

| Primitive | Kept pending/loading pattern | Confirmation, failure and recovery | Removed or deliberately separate |
| --- | --- | --- | --- |
| IconButton | Own-border arc for both `busy` and pending commit | Success/danger outline; recovery outside | Centre Spinner and icon replacement deleted |
| Switch | Own-track-border arc, stored thumb unchanged | Success/danger outline; retained value and row Retry | Old thumb-spinner/tick contract wording removed |
| MenuButton | Own-border arc on trigger | Success/danger outline; recovery outside | Menu-item inline mark stays only in its roomy row, not over the trigger |
| Button | Own-border feedback for compact commits; existing delayed icon-slot sign for a roomy action | Border outcome or task words; recovery outside | Roomy text action and compact commit are distinct needs; deprecated bleed fixture removed |
| PillButton | Own-border arc | Success/danger outline; recovery outside | No alternate spinner |
| PickerButton | Own-border arc on trigger or chosen option | Success/danger outline; row Retry/Revert | No alternate spinner |
| ProjectMark | Chosen mark's own-border arc | Retained choice, success/danger outline; scoped Retry/Revert | No alternate spinner |
| FontChoice | Chosen tile's own-border arc | Retained choice, success/danger outline; scoped Retry/Revert | No alternate spinner |
| ThemeGallery | Chosen tile's own-border arc | Retained choice, success/danger outline; scoped Retry/Revert | No alternate spinner |
| SegmentedControl | Chosen member's own-border arc | Retained attempted choice; scoped Retry/Revert | Genuine multiple-choice controls only, not binary settings |
| TextField | Existing trailing inline CommitMark slot | Confirmed tick, failure and Retry/Revert; input retained | Roomy field treatment, not a compact icon action |
| ColorField | Existing trailing inline CommitMark slot | Confirmed tick, failure and Retry/Revert; input retained | Roomy field treatment |
| Slider | Inline CommitMark beside formatted output | Confirmed tick, failure and Retry/Revert; preview retained | Output feedback, not a thumb spinner |
| CommitMark | One inline implementation and one shared BorderProgress implementation | Pending, confirmed, failed, rest | Inline and border are distinct space budgets; compact controls never request inline |
| FileTree | Row-level loading sign for loading a row; IconButton arc for pin/unpin | Stored pin retained until acknowledgement; Retry outside | Row loading is not a second pin spinner |
| OpenItem | Loading skeleton for project/file content; IconButton arc for pin/unpin | Success/danger outline; exact-action Retry | Content skeleton is not a second pin variant |
| ItemCard | Known-content skeleton or existing task-driven card state | Existing local recovery | Content placeholder, not a compact control |
| Skeleton | One shimmer placeholder family, sized for known content | Replaced by ready content or local failure | Not a control's pending mark |
| Spinner | One indeterminate content/operation sign | Replaced by operation outcome | Never imported by IconButton |
| ProgressBar | Named operation progress | Task outcome and recovery | Determinate/indeterminate work, not compact commit feedback |
| ScanRadar | Per-target connection discovery status | Found/error target state | Scan result list, not pin feedback |
| Toast | Existing named progress tone and action's Button feedback | Outcome replaces progress; action failure keeps recovery | Operation status, not a compact control overlay |

All border pending arcs become a static dashed outline with reduced motion; success and failure remain recognizable. The 85-component inventory stays at 85. Button fixtures reduce **58 → 57**, IconButton **13 → 11**, and MenuButton remains **14** with its text fixture renamed, not duplicated. Total checked view/fixture documents reduce **845 → 842**. Busy and commit pending coverage share one gallery IconButton fixture; separate real-renderer unit cases still prove each input independently.

Seventeen control/geometry units pass, including both IconButton inputs with exactly one border sign, one unchanged icon and no Spinner wrapper. Three native journeys pass: slowed real Files pin/unpin in light and dark, plus Open project/file pin/unpin. They assert the pending sign, no centre-spinner element, reduced-motion dashed/no-animation treatment, stored outcomes, focus/geometry and restart behavior. This evidence is local until the exact combined head reaches green main and Preview.

| State family | Kept | Removed | Enforcement |
| --- | --- | --- | --- |
| Rest, hover, pressed, focus-visible, disabled, pending, selected | One box, fixed token padding and reserved border; colour/ink/focus-ring changes only | Zero-padding bleed and offset painted extensions | Actual primitive rendering matrix in `packages/ui/test/button-geometry.test.tsx`, included in `pnpm check`; intentionally broken fixtures must be detected |
| First-run actions | Create new notes instead, More options and Back use the primitive unchanged | Per-view edge-alignment escape | Built-app `ofb-buttons.spec.ts`: measured padding and bounds, real hover/press/focus, light/dark and default/narrow captures |

### Owner feedback queue, 5 November

**"No tooltip on menu", fixed in `f892846a`:** the menu items' explanations (for example Publish… and Help and docs) were rendered as tooltips, but every React Aria popover carried an inline `z-index: 100000` from its overlay positioning. That put the menu above the tooltip layer, so it painted over its own items' tooltips. The shared `useWindowBoundary` now clears that inline value, so every popover stacks by its layer token (popover 8, below tooltip 9). Worker16's journey missed it because `toBeVisible` doesn't detect occlusion. The new native journey hit-tests the tooltip's centre and corners in the built app, on keyboard focus and on a real mouse rest, for a disabled item and a later-preview item. It also checks that an item without a reason shows none, that the explanation remains the item's accessible description, and that pressing a disabled item keeps the menu open. Forcing the old inline value back makes the journey fail on paint. A static guard (`popover-box.test.ts`) keeps every `<Popover>` on `useWindowBoundary()` and a layer token.

**Exact brief reconciled, `26c3bd1f`:** all seven fixes are available in the corrected two-project review. Pin/Unpin names and tooltips include the row name; resting pinned rows show a pin, and focused controls expose their pressed state. Native Close checks now cover New note location (the owner's screenshot), Settings, Share, Customize toolbar and Delete confirmation, plus New project and short Idea feedback: identical per-frame bounds and computed edge padding before/during/after repeated hover and keyboard focus, at both sizes in both themes. All 68 focused units and 12 combined native journeys pass on the final implementation.

The corrected candidate passed both project inspections before main's authorized replacement of Electron 62832 / launcher 65092. The normal Shell launch of `26c3bd1f` is verified exposed at 22.0 seconds (10/45 points; Electron 4388, launcher 14240, HWND 2752998), without E2E variables, input, activation or movement. Field notes and Garden notes are preserved. The new review is left open; phase 2 awaits owner review, not a merge or release.

**Historical first review checkpoint, `07c2e31a`:** worker17 fixed the repeat Close-hover height report first, then Files pin-on-hover. The exact clean, pushed head passes 68 focused units and all 12 combined native journeys. One fresh candidate passed separate Field notes and Garden notes inspection, then replaced only the authorized old review. Its normal Windows Shell launch has no E2E variables and was verified exposed after 21.6 seconds (20/45 sampled points; Electron 62832, launcher 65092, HWND 2621926). The new review is left open without driving, activating or moving it. This is review availability, not phase completion, a main app merge or release.

| Added item | Cause and correction | Evidence |
| --- | --- | --- |
| 7. Close-hover dialog height jump | Reproduced the old Idea feedback dialog shrinking from 580 px to 556 px: its appended tooltip changed which child received 24 px bottom padding. Shared DialogPanel now marks semantic first/last content slots instead of styling DOM sibling positions. | Both themes; content/stable/navigation dialogs at normal/minimum sizes; every-frame bounds through hover, rehover and keyboard focus; an appended fixed portal cannot change body padding. Earlier tooltip checks explicitly skipped dialog-height rules. |
| 6. Files pin on hover | File/folder type icon swaps to the existing Pin/Unpin IconButton in the same fixed slot on hover or row focus; touch has direct access. Presses stay with that control, not selection, opening, expansion or drag. Pins change only after persistence, with local border feedback and exact-target Retry. | Native geometry, unchanged selection/note bytes, keyboard activation, refusal/Retry after selection moves, actual process restart, and touch Unpin from Pinned. Both ordinary and shortcut trees are wired. |

[Scoped evidence and Try it](../plan/definition-of-done.md#phase-2-close-hover-and-files-pin). These are the last two fixes before the combined candidate, not permission for toolbar-customizer/AI-scan wiring or a main app merge.

**Earlier five-fix checkpoint, `b83c1e0c`:** Settings now keeps its navigation outside the content scroller. The navigation shell is 600 px high, clamped to available window space; when the body cannot fit its 400 px side-navigation budget, tabs wrap horizontally with the footer still fixed. Native bounds/scroll checks pass at 1400 × 850, 1024 × 720, 600 × 480 and 480 × 360. Combined focused evidence is 35 units and 8 native journeys, all passing. The owner's old review is still open; a new exact-head two-project candidate has not yet been packaged or launched. Phase 2 is not complete.

**Code Copy, `a0e29706`:** shared CodeBlock uses the existing IconButton with accessible Copy name/tooltip, positioned top-right rather than consuming a text column. Code preserves line breaks and fills the available width; token clearance prevents the icon obscuring the source. Native Agents proof checks actual geometry, icon-only content, keyboard tooltip and exact copied bytes using the isolated memory clipboard. Fix 4 of 5; Settings navigation remains.

**Menu descriptions, `f879f991`:** shared command, choice and submenu primitives no longer show secondary explanation rows. Reasons remain stable accessible descriptions, with the shared positioned tooltip on hover or focus; unavailable items stay reachable and cannot run. Native proof checks the Publish reason's clipped one-pixel description, accessible name/description, keyboard focus tooltip and hover tooltip. No per-view copy fork. Fix 3 of 5; code Copy and Settings scrolling remain.

**Structural layers, `b031948f`:** one AppRoot full-app portal now removes dialog/window/fill Layers and modal scrims from panel stacking contexts. Docked/floating panels have distinct named token roles; menus/tooltips remain above overlays and notifications last. Raw-index and portal-ownership guards plus a native Connect-over-Files hit-test pass. [Contract](system/overview.html#window-stacking) and [evidence](../plan/definition-of-done.md#phase-2-structural-overlay-layers-b031948f). This is fix 2 of 5; no new owner candidate yet.

The five new owner fixes supersede the earlier implementation pause: Themes application, structural full-app overlay layering, menu-description tooltips, icon-only code Copy overlay, and fixed Settings navigation, in that order. Toolbar customizer and AI-scan designs remain a separate track. Phase 2 is still in progress; only after all five will one new two-project owner candidate replace the existing review.

**Themes, `bc45a4e1`:** reproduced in the built invisible app before fixing: choosing Dusk saved the app slot, while the fixed Sepia project still painted the window and editor. **Why it escaped:** the old journey used only an App-default project and reopened the sheet; it never selected a theme in a fixed-theme project or checked applied tokens after a real process restart.

The fix follows the [pending-number scope decision](../plan/decisions.md#pending-number-themes-follows-this-windows-theme-scope): fixed project changes only itself; App-default project changes the app slot. Preview, failure retention and Revert follow the same scope. One root resolver owns window/editor theme application, avoiding a nested writing scope masking previews. Both native scope cases now check actual canvas/text tokens, root `data-theme`/scheme, saved state, sheet reopen, process restart, exact note bytes and unchanged Garden settings. [Focused evidence](../plan/definition-of-done.md#phase-2-themes-project-scope-bc45a4e1) is not full-suite or owner acceptance.

**Owner direction, 4 November 13:01:** implement this audit in two phases. First show every proposed state in the gallery for visual approval; only then implement the approved slices against their Definition of Done. No tests, journeys, captures, benchmarks, CI waits or app wiring before approval. Phase 1 permits only typecheck, `ui:check` and gallery builds.

**[Open the review hub](http://127.0.0.1:5231/?f=mock.uistates.hub).** Compare Before and After, then Play. Each slice offers light, dark and reduced motion. All data and timing demos are local simulations; none changes notes, settings or accounts. Reply, for example, “approve 2, 3; change 1: …”. Approval is explicit, per slice; the table below is the record.

| Slice | Findings | Review link | Availability | Approval |
| --- | --- | --- | --- | --- |
| D1 · Notifications | F3, F4, F10 | [Open slice 1](http://127.0.0.1:5231/?f=mock.uistates.d1) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D2 · Fields | F1, F2, F12 | [Open slice 2](http://127.0.0.1:5231/?f=mock.uistates.d2) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D3 · Switches | F2 | [Open slice 3](http://127.0.0.1:5231/?f=mock.uistates.d3) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D4 · Choices | F2, F14 | [Open slice 4](http://127.0.0.1:5231/?f=mock.uistates.d4) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D5 · Empty spaces | F6 | [Open slice 5](http://127.0.0.1:5231/?f=mock.uistates.d5) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D6 · Recovery | F4, F5, F11, F15 | [Open slice 6](http://127.0.0.1:5231/?f=mock.uistates.d6) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D7 · Long operations | F7, F8, F13 | [Open slice 7](http://127.0.0.1:5231/?f=mock.uistates.d7) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |
| D8 · Section loading | F9 | [Open slice 8](http://127.0.0.1:5231/?f=mock.uistates.d8) | Shown in the gallery | Approved (owner, 4 Nov 14:06) |

Approval values are **Awaiting review**, **Approved** and **Changes requested**. The gallery index distinguishes an unfinished design from one available to review. The [phase-2 DoD](../plan/definition-of-done.md#ui-states-after-visual-approval) records future wiring, unit and journey evidence only; none is run in phase 1.

**Approved field treatment:** the field border uses the commit colour while pending and returns to rest with the confirmed circle tick, rather than retaining a confirmed border.

**Phase-2 authorization (owner, 4 November 14:06):** “These look good, implement it and make it functional.” Approval covers all eight slices and the compact border-spinner rule. Wiring proceeds with silent failures first, then commit states, on `vq-ui-states`; implementation and exact-head evidence remain outstanding until recorded in the DoD.

### Functional review increment, 4 November

| Work | Implementation | Verified scope |
| --- | --- | --- |
| Integrated project prerequisite | `36e93da4`, merge from `vq-open-cards` | Combined monorepo typecheck passes; project settings are present |
| Modal notification recovery | `5251ef0d` | Existing `layer.toast` plus React Aria's top-layer marker; F6 and pointer Retry work while Settings remains open |
| Notification host | `414b9341`, narrowed by D-357 | Three visible, retained error-first queue, repeated subjects coalesced with latest Retry arguments; auto-dismiss except inventoried must-read cases; visible-only clocks pause on hover/focus/window inactivity and pending actions |
| Commit infrastructure and first controls | `bf1c5afd` | `vm.commits`; immediate pending and separate 200 ms pending/confirmed minimums; field-local lock, failed drafts and Retry/Revert; project name blur/Enter and scale; segmented keyboard changes wait 500 ms or blur; project writes compose independent fields in order |
| Project colour and preset logo | `78d0a335`, pushed | Attempted mark's own border; focusable pending group; retained failed choice without changing saved identity; latest-choice Retry and write-free Revert |
| Project font/theme triggers | `c766d793`, pushed | Persistent trigger feedback after the popover closes, retained attempted name, cleared failed preview, Retry/Revert and Use app default; keyboard theme browsing does not save |
| Watermark refusal proof | `fd5252ee`, pushed | Failed On does not add a writing-surface mark; Retry persists before the mark appears; failed Off/Revert leaves the stored mark intact without writing |
| App appearance/paragraph choices | `9132ff95`, pushed | Local failure and Retry, independent choice groups, persistence after reopening; tabs and explicit-save colour drafts stay outside the commit lane |
| Polite commit outcomes | `b7f54383`, pushed | One named confirmation after successful storage; no new success on pending, failure, Revert or expiry; retained draft values are never announced |
| Reading sliders | `7d8811e3`, pushed | Immediate transient note preview; one save on pointer release, blur or 500 ms keyboard pause; local pending/confirmed marks, retained formatted failures and Retry/Revert |
| SVG logo upload | `6a217238`, pushed | Own-border upload feedback; rejected storage keeps the sanitized source and the old writing-surface mark; Retry does not reopen the picker; cancel never claims Saved; Revert writes nothing |
| Known-empty wrappers and static gates | `7d8f98fd`, pushed | Open/recent, Files, AI, Sharing and site-preview lists use approved wrappers; AI waits for a successful load; filtered Open clears its query; first actions route to existing creation or Files flows. Sharing menus remain focusable/inert with own-border progress. All inherited static gate findings are cleared |
| Independent section loading | `47101d57`, pushed | Agents/history/share use approved row shapes after 300 ms, held for at least 500 ms on success or failure; refresh keeps existing content; local Retry retains sharing choices. Late Agents/history replies cannot replace newer reads |
| App theme and Reading font | `e643bd48`, pushed | Theme tiles and the closed font trigger retain failed choices and offer scoped Retry/Revert. Keyboard theme browsing remains preview-only. Choosing an opposite-scheme theme stores slot and scheme in one write; failure keeps the acknowledged note appearance |
| Compact focus and docking | `b6375b3a`, pushed | Existing Focus mode, Files pin and contents pin use own-border feedback; roomy menu rows use inline marks. Failed writes leave the acknowledged value unchanged. Retry remembers the exact intended value rather than toggling again |
| Reading size | `399bd9c9`, pushed | One inline mark beside the retained size output; Smaller/Larger lock only their group while pending. Failed storage leaves the note unchanged; scoped Retry and write-free Revert preserve other reading choices. Menu and shortcut actions use the same lane |
| Notification acceptance increment | `0db24cb0`, pushed | Four real writing outcomes queue/reveal without stealing focus. Failed Retry stays available, coalesces on the original subject and locks only its action. F6 targets a captured pill ID. Actually wrapped notices get eight visible seconds; success/warning/progress tones reach the host |
| Overlapping notification pauses | `b68775f8`, pushed | Hover and focus are independent causes. Ending either cannot resume the lifetime while the other remains; moving between buttons does not resume it. Two real-window clock journeys prove the retained remainder in both orders |
| Irreversible withdrawal | `46c0cb31`, pushed | The access format refuses reactivation; sharing again generates a new identity/link. Both existing confirmation surfaces now explain this before acting. Cancel keeps the grant active; confirmed withdrawal preserves notes and rejects the old link after synthetic publication |
| Independent AI details and checked key | `42e06fc0`, pushed | Details commit on blur/Enter with retained failures and scoped Retry/Revert; provider-only and discovered connections remain usable without a second form Save. The separate key Save checks synthetic text before persistence, retains same-destination failures locally, preserves the old key on refusal and rejects changed-destination results |
| Scoped Open recovery | `cf5859a2`, pushed | The local error row keeps its Details and only Retry becomes inert. Failed list/open/pin/reveal actions keep their exact recovery target; query and old content remain mounted. A completed pin followed by a failed list retries only the list, never the toggle |
| New project / Local import recovery | `651b1340`, pushed | Opening a completed project retries only Open. Uncertain partial setup offers a location change, never blind creation Retry. Local imports retain one request receipt and publish only a complete no-clobber copy; a lost reply cannot duplicate a completed import |
| Same-project Open acceptance and waits | `8f1fb690`, pushed | A rejected note read keeps the acknowledged note and Open mounted; only an accepted Retry closes it. Named list/open/pin/reveal tasks supply measures and elapsed labels. Lists wait 300 ms before shapes and hold them 500 ms; obsolete actions cannot close or replace a reopened Open |
| History recovery and D8 journey | `ef03a581`, pushed | Retry targets the failed list, older page, version or restore. Failed reads retain the previous list/preview; a failed write retains the sheet and original Undo receipt. Restore/Undo announce success only after disk acknowledgement. Real delayed/failed history reads and saves passed independently of Agents |
| Broken-image recovery | `cd0cede9`, pushed | The approved ImageFrame now shows actual read/decode failures, alt text and a scoped Retry. Retry retains that frame and focus while pending; distinct failures coalesce per note and repeated refusals do not spam. Same-path document generations and read tokens reject obsolete responses |
| Share-item independent section | `2ce9b22d`, pushed | Actual delayed/failed sharing-list reads now have their independent desktop journey. Retry keeps its error row and editable choices mounted, locks only its own action and never writes a grant. A failed refresh retains acknowledged sharing history |
| Files known-empty and first action | `6218b99d`, pushed | Collapsed content is not empty; a query is checked independently of collapsed roots. Initial listing is a named section read with explicit failure and scoped Retry, not empty success. Watcher changes and acknowledged saves survive its snapshot. The empty wrapper's New note replaces it within the same Files body |
| Recently deleted honest states and good news | `71e94423`, pushed | Failed history never becomes an empty success. Read-only Retry retains its error and acknowledged rows; closed/reopened reads reject stale results. Known-empty history and All colours pass reuse the approved success StatusRow |
| Independent initial Files scan acceptance | `b830a17c`, pushed | A held/refused first-ever scan shows bounded/reduced-motion shapes, never false empty; scoped read-only Retry keeps the editor, filter and connected Files body, then reveals real notes and records both named measures |
| Honest Sharing settings list | `e1ce6940`, pushed | Unknown/refused reads cannot claim Nothing shared yet. A named section read retains acknowledged rows and local Retry; filtered emptiness says No matches and clears only filters. Known-empty Open Files remains a read-only route |
| New project streamed setup | `77abe28a`, pushed | Real backend step receipts, completed/total progress and elapsed after 3 seconds; Cancel stops at the next safe boundary, keeps partial files and never replays uncertain creation. A completed receipt retries only Open |
| Local Publish, Apply and site-preview work | `b70e3334`, pushed | Actual per-note preparation receipts and completed/total progress; elapsed after 3 seconds, safe-boundary Cancel and scoped read Retry keep the previous preview. Local draft/settings writes show their actual collection/save steps, retain failed choices and cannot be cancelled mid-write. No remote deployment is claimed |
| First setup clone/push sequence | `a9425fee`, pushed | Actual completed/skipped step receipts and total, existing per-step download percentage and elapsed; Cancel finishes the current step, persists the stopped receipt and keeps files. Resume skips acknowledged steps. A completed final private-first push is never labelled cancelled; a refused push remains failed |
| Existing-project download | `025fe72f`, pushed | Actual discovered step totals and download/private/link receipts; safe Cancel keeps the downloaded folder. In-process Resume checks and continues that same folder, never clones it twice. A late stop on an already completed download offers Open rather than claiming the download was undone |

**Worker 6 increments:** [theme/font evidence](../plan/definition-of-done.md#phase-2-theme-and-reading-font-e643bd48) and [compact-control evidence](../plan/definition-of-done.md#phase-2-compact-focus-and-docking-b6375b3a) include scoped typechecks, units, static gates and invisible real-write-refusal journeys. MenuButton and IconButton reuse the approved own-border treatment; no new writing-window element was added. The toolbar stays open after these compact setting actions so their feedback remains visible; normal outside dismissal still works. Files docking now awaits storage instead of silently discarding its write promise.

**Earlier inspected candidate:** `E:\Projects\side-projects\focus-notes-work\preview\candidates\e1ce6940\Open review build.cmd`. Built from the exact pushed head and inspected invisibly through normal project choices, SVG upload/refusal/Retry, app and Reading choices, compact Focus/Files/contents controls, retained notification recovery/focus, AI connection groups, actual Agents settings, filtered Open/Clear search, collapsed/filtered Files, Recently deleted good news and Sharing first-action/filter treatment; inspection closed with own-PID cleanup. Its launcher retains the local-only GitHub stand-in. The synthetic inspection workspace has a valid format and a local-only Git history so Recently deleted is genuinely available. Controlled key checks, withdrawal, Open, New/Local, initial Files, history, sharing and image failures have their separate scoped journeys in the evidence below, not live-account claims. Earlier candidates and the owner's visible `6218b99d` and `cd0cede9` instances remain untouched. The [5231 gallery](http://127.0.0.1:5231/?f=mock.uistates.hub) runs from fresh `vq-ui-states-10`; its process, socket and HTTP 200 were verified after migrating only folder 9's gallery.

**Owner-requested visible review, 4 November 19:53:** [launch evidence](../plan/definition-of-done.md#phase-2-owner-review-launch-cd0cede9) confirms the still-open `cd0cede9` already contains latest `vq-open-cards` (`34fa5dea`), including Open file and Open from GitHub. Its launcher now supplies a loopback-only GitHub stand-in and a synthetic local bare repository. A new invisible inspection reached Project/AI settings, the real Open surface, the local repository list and Open file with a synthetic picker selection; that inspection closed with own-PID cleanup. A separate fresh owner-review profile was then opened visibly at the owner's request and deliberately left open. It uses only sample notes, not the owner's notes or Preview. No app consolidation merge or additional tests were needed for this launch; phase 2 remains in progress.

**Priority visible refresh, 4 November 20:23 direction:** [latest launch evidence](../plan/definition-of-done.md#phase-2-owner-review-refresh-6218b99d) records a fresh fetch and an empty exact `git log vq-ui-states..origin/vq-open-cards`. The complete `6218b99d` candidate was inspected invisibly again and closed, then a separate fresh owner-review profile was launched visibly and left open. It includes the newer sharing and Files slices as well as Open cards and image recovery. The earlier owner instance was preserved, not silently replaced.

**Push blocker resolved:** GitHub rejected two ordinary branch updates with `Internal Server Error`. The subsequent `git push --no-thin origin vq-ui-states` succeeded at `b6375b3a`, including both worker-6 commits, without rebasing or force-pushing.

**Latest follow-ups:** [Reading-size evidence](../plan/definition-of-done.md#phase-2-reading-size-399bd9c9) records 33 focused unit cases and a real-write-refusal journey. [Notification evidence](../plan/definition-of-done.md#phase-2-notification-acceptance-increment-0db24cb0) records 25 focused unit cases and three invisible journeys, including the exact eight-second lifetime of an actually wrapped notice. Both follow-ups are in the candidate above.

**Still partial:** remaining recovery, complete empty-state acceptance and streamed operations. At `2ce9b22d`, `pnpm check` and `ui:check` pass: the inherited static findings are repaired without changing approved visual values. [AI group evidence](../plan/definition-of-done.md#phase-2-independent-ai-details-and-checked-key-42e06fc0) adds real provider/storage refusal and first-action replacement, not complete D5 acceptance. [Open recovery](../plan/definition-of-done.md#phase-2-scoped-open-recovery-cf5859a2) covers retained errors, query, safe Details and non-repeated completed pins; [same-project acceptance and waits](../plan/definition-of-done.md#phase-2-same-project-open-acceptance-and-waits-8f1fb690) add actual read rejection, exact list timing and tracked action measures. [New/Local recovery](../plan/definition-of-done.md#phase-2-partial-safe-newlocal-recovery-651b1340) proves in-session receipt safety; crash-persistent receipts, resuming uncertain project setup and remaining tracker coverage remain unaccepted. [History recovery](../plan/definition-of-done.md#phase-2-history-recovery-and-independent-section-ef03a581), [broken-image recovery](../plan/definition-of-done.md#phase-2-broken-image-recovery-cd0cede9) and [share-item loading](../plan/definition-of-done.md#phase-2-share-item-independent-section-2ce9b22d) now have their independent delayed/failed desktop journeys. This closes the missing share-item journey, not blanket phase-2 acceptance. Older broad menu-inventory assertions and empty-start toolbar journeys retain unrelated baseline failures, recorded in the compact-control evidence rather than expanded into this slice. Empty-state Add link/Add section/Choose note lead to Files, where publishing already happens; no new configuration workflow is claimed. No complete phase-2 acceptance or app merge is claimed. See [section-loading evidence](../plan/definition-of-done.md#phase-2-independent-section-loading-47101d57), [overlapping-pause evidence](../plan/definition-of-done.md#phase-2-overlapping-notification-pauses-b68775f8) and [withdrawal evidence](../plan/definition-of-done.md#phase-2-irreversible-withdrawal-46c0cb31).

**Files D5 increment:** [known-empty evidence](../plan/definition-of-done.md#phase-2-files-known-empty-and-first-action-6218b99d) adds collapsed/filter/failed-read truthfulness, queued watcher/save preservation and a normal first-action journey. It is not complete D5 acceptance: recently-deleted read failures/good-news treatment, other first actions and all-done variants remain open. The owner's `cd0cede9` instance was left untouched while `6218b99d` was inspected and closed.

**Recently deleted D5 increment:** [honest-history evidence](../plan/definition-of-done.md#phase-2-recently-deleted-honest-states-71e94423) closes the read-failure/good-news gap above. Real delayed/refused history, retained Retry, actual restoration and then acknowledged empty history passed in the same Files wrapper; existing note bytes stayed unchanged. A failed Git log now propagates failure instead of silently omitting a repository. The colour editor's existing all-pass branch uses the same success row. [Independent initial Files evidence](../plan/definition-of-done.md#phase-2-independent-initial-files-scan-b830a17c) now closes the separate first-scan delay/failure journey gap without renderer reloads or production test hooks. Other D5 first actions, D7 and hover/static acceptance remain outstanding.

**Sharing D5 increment:** [honest-list evidence](../plan/definition-of-done.md#phase-2-honest-sharing-settings-list-e1ce6940) closes unknown/refused and filtered false-empty behavior in Settings, including read-only Retry, retained acknowledged rows, newer-change protection and exact section timing. The normal known-empty Open Files route is proven, not a claim that every site-preview first action creates replacement content. The exact candidate above includes all worker-10 slices; the current visible owner builds were not replaced.

**Owner review feedback, 4 November 20:15; fixed in visible review `f2127c67`:** project theme/scheme now reaches Settings and overlays; the `7a0f5e54` docking change narrowed the scroller but left its blur bands spanning both panels, now restored to the note's bounds (headless `before.png` / `after.png` in `focus-notes-work\review\ui-states-owner-feedback`). Desktop typecheck, `ui:check`, 10 project-setting units and the focused invisible feedback journey passed; both distinct local sample repositories and their actual Settings/Open/GitHub-list surfaces were inspected invisibly and closed before replacing only the authorized old review windows. Open `preview\candidates\f2127c67\Open review build.cmd`; in Field notes (blue rocket), press **Ctrl+Alt+O → Garden notes** (green leaf) for its separate window. The fixed review is left open; phase 2 remains incomplete.

**Owner's compact-feedback rule (4 November, 13:58):** when there is room, keep the inline spinner, tick or error icon; when there is no room, the element's own border becomes the spinner. Compact segments, buttons, pills, tiles and switch tracks use a travelling arc following their shape, a success-coloured border for the confirmation minimum (with a brief draw-in), and a danger-coloured border on error; Retry stays in the nearest helper row. Reduced motion holds a dashed pending border, never a sweep. The hub shows both cases side by side with Play. This supersedes the earlier thumb-spinner proposal, not the requirement for visual approval of each slice.

**Open pin increment (owner, 5 November: “I don't see loading state for the pin icon upon trying to pin in "Open dialog"”):** pin and unpin in Open, on project cards and recent files, now run through the commit track (`commit.run`, target `vm.projects.pin:<id>`) and reuse IconButton's own-border `CommitMark`: the pin's border is the pending arc while it saves (dashed under reduced motion), then a success outline for the 200 ms confirmation minimum once the refreshed list shows the new icon, or a danger outline on failure with the previous state kept. Retry stays outside the control, in Open's status row; a completed pin whose list failed retries the list, never the toggle. The pin stays visible while it isn't at rest, and a second press while pending does nothing. Evidence: `project-open.test.ts` (pending, confirmed, rest; refused, then Retry) and the journey “Open shows each pin's own-border pending arc while it saves…” with a slowed pin save.

### What phase 1 shows, and what it does not

| Slice | Visual proposal now available | Deliberately deferred |
| --- | --- | --- |
| D1 | Success, warning, progress and sticky-error pills; 3 visible with a queued count; coalesced image failure; bottom-pill Play at 6 s and 8 s, Retry and Dismiss; conditional withdrawal Undo | Actual priority queue, coalescing, visible-only clocks and pause on hover/focus/window blur. Undo requires proof that the same link can be restored. |
| D2 | Name and colour idle/pending/confirmed/error/empty-value states, retained input and Retry/Revert; separate AI connection-details and access-key groups | Real storage, provider checking and rejected-setter reporting. The key field contains no real key. |
| D3 | Idle/pending/confirmed/error borders on the same switch track; Play holds the simulated stored value after confirmation | Commit tracker, real persistence, rollback and focus/announcement evidence. Off is a value, not an empty state. |
| D4 | Existing segments, theme tiles and font tiles with border feedback on the selected option, pending group lock and scoped failure; theme hover is restricted to hover-capable pointers, with pressed feedback | The 500 ms key pause, blur/release commits, remaining hover sites and the enforcement rule; no keyboard/device test claim. |
| D5 | The same wrapper across Open's states; empty Files, Open, AI connections, sharing and all 4 site-preview lists; component-sized search empty and good-news examples | Real first actions and populated lists. Gallery actions only replace fake content. |
| D6 | Retry and optional Details in Open, New project, Local import, history and the save menu; plain-language safety clauses; broken-image alt and local Retry | Real failed-command targets, partial-result safety and image reading. |
| D7 | New project and Publish step lists, known-total progress, elapsed-time example and Cancel; success, failed step, cancelled and crashed-panel recovery; themed first-view appearance | Actual streamed steps, elapsed clocks, cancellation and crash recovery. The themed mock does not prove native first-paint timing. |
| D8 | Idle content, in-shape section skeletons, content, error and empty; Play uses the 300 ms delay and 500 ms minimum; shimmer stops after 3 passes and is static with reduced motion | Real independent section loads, refresh retention, timeout and announcement behavior. |

The new presentation pieces are `EmptyState` (compound) and `NotificationRegion` (layout). Existing components gain optional visual-state props; no normal app view opts into them yet. All UI is assembled in gallery view documents, and the writing window is unchanged. Token-based gallery timing is simulation, not production behavior. The developer gallery uses a nonce for Vite's development style injection; the app's and built gallery's content-security policies are unchanged.

**Phase-1 evidence only:** the UI, views, runtime and desktop typechecks, `pnpm ui:check`, and the gallery-only Vite build passed. The hub and slices were opened for inspection without captures. No unit tests, journeys, benchmarks or CI waits were run; phase-2 evidence remains outstanding.

The hub and all eight slices scroll vertically inside the existing token-based `Surface` wrapper, without changing the writing window. After the owner's scrolling feedback (4 November, 13:56), headless inspection at 1280 × 720 and 360 × 640 confirmed that every page's scroll height exceeds its viewport height and its final section can be reached.

## Phase-2 wiring evidence

The owner approved all eight designs on 4 November at 14:06. The project/Open implementation from `vq-open-cards` is merged into `vq-ui-states`, not rebased. Combined monorepo typecheck passes.

The merge pass reproduced a real setup layout jump under software rendering and a delayed clone: the anchored onboarding block re-centred when progress grew beyond its minimum height. Its anchor now stays fixed and extra content grows downward, without changing spacing tokens or fixing the content height. Both normal and reduced-motion frame journeys pass with the delayed clone. Tooltips keep their control's landmark outside dialogs; inside dialogs they use the window portal so opening Close never changes the modal's size or padding. Both light/dark geometry journeys pass at regular and small window sizes.

The setup progress list now says “Make notes on GitHub” and “Make private notes”, preserving both actions with four fewer words. The main-path catalogue passes its unchanged visual-score checks; all 57 first-run units pass. A forced-scroll negative control reproduced a separate Rewrite recovery defect: declining prompt loss left its retained fragment off-screen. Recovery now reveals that same fragment after modal focus restoration and restores prompt focus only after the content becomes visible. The strengthened journey passes in light and dark without weakening its draft, focus or document assertions; all 249 UI/Rewrite-core units, the desktop build, full typecheck and static checks pass. Combined exact-head CI remains pending.

The notification layer uses the existing `layer.toast` token and React Aria's top-layer marker, so modal hiding and focus containment do not suppress Retry. While a dialog is open, unrelated notifications stay behind it so they cannot cover its actions; F6 brings the focused notification forward for recovery. A small-window feedback journey reproduced the old overlap by hit-testing the recovery button, then passed after the layering fix. The focused invisible settings journey still reaches Retry with F6, clicks it while Settings stays open, and reopens the persisted value. UI/desktop typechecks and the related layer/runtime tests pass (2 files, 3 tests). The merged sharing/site-preview views retain pre-existing `ui:check` findings; their acceptance remains outstanding.

The host now retains its queue, shows the first three with errors first, and coalesces repeated command failures with the latest Retry arguments. Errors and unique recovery actions require dismissal; queued pills consume no display time. Hover/focus and window inactivity pause the remaining display time without resetting it. The named notification region shows the queued count. Queue timing/priority/coalescing tests pass alongside setting-failure and runtime coverage (4 files, 15 tests); the invisible modal Retry journey also passes. Withdrawal restoration and the full four-outcome writing journey remain outstanding.

The separate commit track exposes `vm.commits`, starts pending immediately and holds pending and confirmed for at least 200 ms each, without altering the delayed wait track. Only view-model fields explicitly declared as independently persisted opt in; search fields and explicit-save form drafts do not. Settings scale and bound project fields now use local recovery: failed input stays in place, Retry repeats its value, and Revert returns to the last stored value. A standalone text field saves on blur or Enter, not per keystroke. Keyboard selection in committed segmented controls waits 500 ms or blur. Project settings construct each queued patch after the preceding write, so independent changes cannot overwrite each other.

Focused invisible journeys verify scale failure/Retry/reopening, notification F6 and pointer recovery with Settings open, and project-name failure with the draft retained and persisted on Retry. Remaining W4/W5 surfaces include the other app settings, AI's separate save groups and logo upload; these are not claimed as accepted.

The project colour and preset-logo pickers now use the same declared, bound commit lane. Only the attempted mark draws the compact border feedback; pending keeps keyboard focus and blocks the choice group. Failed choices remain selected without changing the saved project identity. The nearby row offers Retry of the latest choice or Revert without a write, and repeated recovery failures remain local. The four affected package typechecks, 13 focused unit tests and the invisible project colour/logo failure/Retry/Revert journey pass. Generated schemas are current; the same 54 inherited sharing/site-preview findings remain.

Project font/theme choices, including Use app default, now enter that lane too. Their persistent trigger carries the border feedback when the popover closes, and retains the attempted name on failure beside Retry/Revert. A refused write clears its temporary preview and closes the popover; the saved project look is unchanged. Keyboard browsing in the existing theme gallery remains preview-only. Four affected package typechecks, 16 focused unit tests and the invisible font/theme preview/failure/Retry/reset journey pass. Logo upload remains unfinished W5 work.

The watermark-specific refusal journey now verifies that its failed On choice remains in Settings without adding the watermark to the writing surface. Retry persists it before the mark appears; a subsequent refused Off choice and Revert leave the saved mark present and do not write. The journey waits for the actual wrapper's minimum pending phase before the second change. Core/desktop typechecks, 17 related unit tests and this invisible journey pass; the other five focused journeys also pass on the combined app build.

The app's theme-manager Appearance and Paragraph spacing groups now opt into the same declared commit lane; tab navigation and explicit-save colour drafts do not. A failed appearance choice stays local while paragraph spacing can save independently; Retry keeps both changes and reopening preserves them. Choice errors name the choice rather than saying it was typed. Core/runtime/desktop typechecks, 28 related unit tests, the theme-manager refusal/independent-group/Retry/reopening journey and the updated scale journey pass. The legacy category assertion now includes the Project section brought in by the prerequisite merge. Other app controls, sliders and explicit-save groups remain unaccepted; the same 54 inherited static findings remain.

Confirmed commits now use the existing polite live region once per successful write. Bound controls supply their label, such as “Name saved.”; unnamed action-driven commits use “Change saved.” Pending, failed, Revert and expiry do not claim a save, and retained values never enter the announcement. Core/runtime/desktop typechecks and 35 focused unit tests pass; the invisible project-name refusal/Retry journey reaches the named live-region confirmation while Settings remains open. This is DOM/role evidence, not live screen-reader certification.

## Scope, sources and method

**Assessment date:** 4 November 2026. This is the owner's requested audit (4 November, 12:19), not an accepted decision: every fix below is a proposal until the owner picks it.

<div class="slate-compare">
  <div class="slate-compare__col">
    <p class="slate-compare__head">Code audited</p>
    <ul>
      <li><strong>Main</strong> at <code>25b87f07</code>: what the owner's Preview runs.</li>
      <li><strong>Branch</strong> <code>vq-open-cards</code> at <code>f636e524</code>: the newest work. It contains <code>vq-review</code> <code>53f8d879</code> (Files, the location pill, images, sharing, Invite, Publish, projects, New project, Local notes) plus the Open cards.</li>
      <li>Each finding says which code it comes from: <span class="slate-badge">Main</span> <span class="slate-badge slate-badge--info">Branch</span> or both.</li>
    </ul>
  </div>
  <div class="slate-compare__col">
    <p class="slate-compare__head">Rules applied</p>
    <ul>
      <li><code>ui-states</code>: scopes, the commit, load and outcome tracks, component states, the notification pill, errors, empty states, focus and announcements.</li>
      <li><code>design-system</code> and the <code>design-system-auditor</code> checklist: tokens only, the six layers, states in every context.</li>
      <li><code>perceived-performance</code> and the project's <a href="../architecture/perceived-performance.md">wait inventory</a>; <code>ui-copy</code> and the Words section of <a href="foundations.md">foundations</a>.</li>
    </ul>
  </div>
</div>

### Areas

| Layer | What was read |
| --- | --- |
| Design system | `packages/tokens` (semantic, component, modes, themes), `packages/ui` (primitives, layouts, compounds, host), `packages/ui-runtime`, against [the design system](system/overview.html) and the [visual vs verbose score](visual-score.html) |
| App, by scope | The writing window, Files, Open, Settings (every section), Share, the first-share step, Invite, Publish and the site preview, New project, Local notes, the AI rewrite, Spotlight, conflicts, sync and Git, images, first run and the Store build |
| Per operation | What it shows while it waits, when it's done and when it fails; how a person recovers; what fills the space when there's nothing to show |

### Method and limits

- **Read, not run.** Evidence is the code, the view documents, the message catalogue and the gallery mocks. No tests, journeys or app instances were run (the owner's rule for unapproved designs, and this is an audit).
- **Scope levels** follow `ui-states`: field, component, section, view, app, and background.
- **Impact** ranks findings by what the owner feels while writing: losing or doubting a note first, then not knowing whether a change took, then a dead end after a failure, then empty or jumpy layouts, then polish.
- **Effort** is S (under an hour, one component or view), M (a few hours, a primitive plus its uses) or L (a day or more, a shared mechanism across surfaces).
- This page replaces nothing: the earlier [design-system audit](system/audit.md) of 19 October covers architecture and enforcement; this one covers states.

## Scorecard

<div class="slate-metrics">
  <div class="slate-metric"><span class="slate-metric__value">19</span><span class="slate-metric__label">areas scored</span></div>
  <div class="slate-metric"><span class="slate-metric__value">4</span><span class="slate-metric__label">strong</span></div>
  <div class="slate-metric"><span class="slate-metric__value">12</span><span class="slate-metric__label">partial</span></div>
  <div class="slate-metric"><span class="slate-metric__value">3</span><span class="slate-metric__label">missing the core rule</span></div>
</div>

The waits the app was designed around are handled well: the note save, conflicts, the AI rewrite and Spotlight. What's weak is everything **after** a person changes a value: settings and project choices apply with no confirmation, and when they fail nothing says so. Errors that do surface mostly go to a toast that disappears on its own.

| Area | Code | Rating | What's there | The main gap |
| --- | --- | --- | --- | --- |
| Tokens and timing | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Light, dark, contrast light and dark, more contrast, forced colours and reduced motion as modes; `wait.signDelay` 300 ms, `wait.signMinimum` 500 ms, `wait.doneDuration` 1.5 s, `motion.shimmer` | No confirm minimum (200 ms), commit pause (500 ms), long-notice time (8 s), commit colour, or empty-wrapper minimum sizes |
| Component state sets | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Button and IconButton busy with `aria-busy`, `aria-disabled` and a delayed spinner (D-199); ItemCard and FileTree busy borders | Switch, SegmentedControl, ThemeGallery, TextField, Slider, ColorField and PickerButton have no pending, confirmed or failed state; `useBusy` has no failed phase |
| The note save | Main | <span class="slate-badge slate-badge--success">Strong</span> | SaveState with saved locally, pending, syncing, synced, offline and error; the text is kept; Retry on failure; a problem mark on the trigger | The failure toast still disappears after 10 s |
| App settings (appearance, fonts, scale, focus, outline, Files options) | Main | <span class="slate-badge slate-badge--danger">Missing</span> | The value changes on screen at once | No confirmation; a failed save is silent and the screen keeps a value that wasn't kept |
| Project settings (name, colour, logo, watermark, font, theme) | Branch | <span class="slate-badge slate-badge--danger">Missing</span> | Saves on change; a bad logo says why under the field | No confirmation; a failed save silently snaps the value back |
| Sharing: share item, first share, Invite, Publish, site preview | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Invite runs through the task tracker; the share list and history have empty text | Withdraw asks first instead of offering Undo; the site preview's four lists have no empty state; Publish and Apply have no steps or progress |
| Open | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Placeholders on the first load, the old list kept while it reloads, "Opening project…", a danger StatusRow | No Retry ("Close Open and try again"); one generic failure for open, pin and choose; empty text with no action |
| New project and Local notes | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Pending and error states; import says what it copied | No Retry, no steps for repository creation, no Cancel |
| Files | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Inline rename errors on the field; move and delete ask; recently deleted can restore | Failures are toasts; move and rename have no confirmed beat and no Undo; "Your notes will appear here." has no action |
| Spotlight | Main | <span class="slate-badge slate-badge--success">Strong</span> | Results at once; "Nothing matches “…”" names the query | Could offer "New note named …" from the empty result |
| AI rewrite | Main | <span class="slate-badge slate-badge--success">Strong</span> | Streams, Stop, Cancel restores the original | The no-provider and failed-provider paths don't say the original is kept |
| Images | Branch | <span class="slate-badge slate-badge--warning">Partial</span> | Edit has saving and error states | A read failure is a toast with no Retry; the frame shows no broken-image state |
| Sync and Git | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Every sync problem has words and an action (sign in, resolve, retry) | Clone, first push and pull show no steps or progress; errors leave with the toast |
| Conflicts | Main | <span class="slate-badge slate-badge--success">Strong</span> | The note is held, nothing is overwritten, the resolver opens with both versions | None at this level |
| First run and startup | Main | <span class="slate-badge slate-badge--warning">Partial</span> | Setup steps with error and fail actions, pending part states | The first-run white frame (in the wait inventory); a view that crashes shows its fallback with no Reload or Report |
| Notifications | Main | <span class="slate-badge slate-badge--danger">Missing</span> | One toast host, an action, Close, a pause on hover and focus, F6 to reach it | At most 2 shown, older ones dropped; errors auto-dismiss; info and error tones only; no queue, coalescing or landmark |
| Empty states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | 44 lists declare an empty branch | Every one is a muted sentence in no wrapper, with no action and no minimum size |
| Loading (shimmer) | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | A Skeleton primitive (line, tile, avatar) with finite passes; used in the canvas and Open | Settings sections, the share item and history load with words ("Loading…", "Preparing…") instead of shimmer |
| Accessibility of states | Main, Branch | <span class="slate-badge slate-badge--warning">Partial</span> | `aria-busy`, `aria-disabled` instead of `disabled`, a polite live region, `role="alert"` for error toasts | No Notifications landmark; 9 bare `:hover` rules outside `(hover: hover)`; confirmations aren't announced because none exist |

## Findings, ranked by impact

Ranked by what the owner feels while writing (see [Method and limits](#method-and-limits)). Paths are under `packages/` unless they start with `apps/`; line numbers are at the commit named in the Code column.

| # | Finding | Scope | Code | Effort |
| --- | --- | --- | --- | --- |
| [1](#f1-failures-from-controls-are-silent) | Failures from controls are silent | App | Main, Branch | M |
| [2](#f2-a-changed-value-is-never-confirmed) | A changed value is never confirmed | Field, component | Main, Branch | L |
| [3](#f3-error-notifications-disappear-and-are-dropped) | Error notifications disappear and are dropped | App | Main | M |
| [4](#f4-a-broken-image-cant-be-retried) | A broken image can't be retried | Component | Branch | S |
| [5](#f5-errors-in-open-new-project-and-local-notes-have-no-retry) | Errors in Open, New project and Local notes have no Retry | Section | Branch | S |
| [6](#f6-empty-states-are-passive-sentences) | Empty states are passive sentences | Section, view | Main, Branch | M |
| [7](#f7-long-operations-have-no-steps-progress-or-cancel) | Long operations have no steps, progress or Cancel | View | Main, Branch | M |
| [8](#f8-a-crashed-panel-is-a-dead-end) | A crashed panel is a dead end | View | Main | S |
| [9](#f9-sections-load-with-words-not-shimmer) | Sections load with words, not shimmer | Section | Main, Branch | S |
| [10](#f10-withdraw-asks-first-instead-of-offering-undo) | Withdraw asks first instead of offering Undo | Component | Branch | S |
| [11](#f11-history-and-sync-failures-have-no-retry-in-place) | History and sync failures have no Retry in place | Section | Main | S |
| [12](#f12-two-save-models-in-one-settings-section) | Two save models in one Settings section | Section | Main | S |
| [13](#f13-the-first-run-white-frame) | The first-run white frame | App | Main | S |
| [14](#f14-hover-sticks-on-touch-in-nine-components) | Hover sticks on touch in nine components | Component | Main, Branch | S |
| [15](#f15-failure-copy-doesnt-always-say-whats-safe) | Failure copy doesn't always say what's safe | Field, section | Main, Branch | S |

### F1. Failures from controls are silent

- **Today.** A view's bound control runs its setter as `void deps.app.commands.run(setter, …)` and its actions as `void r.runActions(…)` (`ui-runtime/src/render.ts:173`, `:183`). Nothing catches the rejection, the renderer has no `unhandledrejection` reporter, and the view boundary only logs (`ui-runtime/src/mount.ts:39`). So:
  - App settings change the store first and then `await persistAppState` (`core/src/app.ts:719-737`, `:757-759`, `:789-791`): if the write fails, the screen keeps a value that was never kept, and it's gone at the next launch.
  - Project settings write first and change the view after (`core/src/project-app.ts:46-49`, Branch): if the write fails, the field snaps back with no word.
  - Only *Where appearance is kept* catches its failure (`core/src/app.ts:1283-1286`).
- **Rule broken.** `ui-states` errors: never silent, keep the person's input, say what happened where it happened, offer a recovery. The commit track's *failed* state.
- **Fix.** One mechanism in the runtime, not one per setting: `render.ts` catches a setter's or action's rejection and (a) puts the control into its failed state when its contract has one (F2), otherwise (b) raises one error notification with **Retry**, which reruns the same command with the same arguments. Add a renderer `unhandledrejection` reporter that raises the same notification and logs the cause. Store updates that run before a write roll back on failure.
- **Files.** `ui-runtime/src/render.ts`, `core/src/app.ts`, `core/src/project-app.ts`, `apps/desktop/src/renderer/`.

### F2. A changed value is never confirmed

- **Today.** Everything in Settings saves on change, and nothing says it took:
  - the AI fields, Scale, Settings sync and the other switches (`views/views/settings.view.json`, Main);
  - project name, colour, logo, watermark, font and theme (Branch).
  - The task tracker runs only the load track: the first 300 ms is an `ack` phase, and a task that ends inside it "leaves no trace" (`core/src/tasks.ts`, about line 101). The shared busy policy has only `on` and `done` (`ui/src/behaviors/busy.ts`), and Button's spinner appears only after `wait.signDelay` (`ui/src/primitives/Button/Button.css.ts:82-88`). So an instant commit shows nothing, and a failed one leaves no mark on the control.
  - Switch, SegmentedControl, ThemeGallery, TextField, ColorField, Slider, PickerButton and FontChoice declare no pending, confirmed or failed state in their contracts.
- **Rule broken.** `ui-states` commit track: pending at once, held at least 200 ms, then confirmed for at least 200 ms where the change happened. A field shows a success border and a tick in its trailing slot; a switch shows a spinner in its thumb, then settles; a failed commit keeps the value and offers Retry on the control.
- **Fix.**
  - Add a commit track to the tracker: `tracker.commit(key, fn)` with pending at once, a 200 ms minimum, confirmed for `wait.doneDuration`, and failed (the value kept, Retry). A per-control `commitState` read (`vm.commits.<key>`) drives the view.
  - Give the primitives the states: TextField and ColorField a trailing Spinner, then a tick, with a success border; Switch a Spinner in the thumb; SegmentedControl and ThemeGallery a tick on the chosen option; all with `failed` plus a Retry. Reuse `Spinner`, `Icon` (`checkmark`) and `color.success`.
  - Announce "Saved" politely through the existing LiveRegion.
- **Files.** `core/src/tasks.ts`, `ui/src/behaviors/busy.ts`, the primitives above and their contracts, `views/views/settings.view.json`.

### F3. Error notifications disappear and are dropped

- **Today.** The toast host (`core/src/app.ts:357-372`) shows at most two and dismisses older ones early, so the third toast removes the first. Every toast is armed with a timer: 6 s, or 10 s with an action. That includes errors, such as *Couldn't save your latest changes. Your text is still here.* with Retry. Toast has only the info and error tones (`ui/src/primitives/Toast/Toast.tsx`). The toast layer has no Notifications landmark (`views/views/canvas.view.json`, about line 9277). The good parts:
  - one host and one action per toast;
  - Close, a pause on hover and focus, and F6 to reach it;
  - `role="alert"` for errors.
- **Rule broken.** The notification pill: an error that needs a choice is hard-dismissed; at most three show at once, and the rest queue with errors first; notices about the same subject coalesce; timers pause while the window is in the background; the stack is a labelled region.
- **Fix.**
  - Only inventoried must-read cases are sticky until Close or their action (D-357); an error tone, Retry or Undo alone never makes a notice sticky.
  - The host keeps a queue with three visible, errors first, and coalesces by a `subject` key ("3 images couldn't load").
  - Pause the timers on window blur.
  - Wrap the stack in a region named "Notifications".
  - Add the success, warning and progress tones to Toast.
  - Add the long-notice token (8 s) for notices that actually wrap to two or three lines, not merely those with an action.
- **Files.** `core/src/app.ts`, `ui/src/primitives/Toast/`, `views/views/canvas.view.json`, `tokens/src/semantic/structure.json`.

### F4. A broken image can't be retried

- **Today.** When reading an image fails, its source is stored as empty and a toast is shown for each image (`core/src/images-app.ts:40-52`, Branch). The guard at the top of `image.read` then sees an entry for that source and never reads it again until the note changes. A note with several missing images raises several toasts, and F3 drops all but two.
- **Rule broken.** A component-scope error is shown on the component and recovers there. It isn't a stream of app-scope toasts.
- **Fix.**
  - ImageFrame gets a broken state: an icon, the image's alt text, and **Retry**, which clears the entry and reads the image again.
  - One coalesced notification for the note.
  - Add a row for image reads to the wait inventory.
- **Files.** `core/src/images-app.ts`, `ui/src/primitives/ImageFrame/`, `documentations/architecture/perceived-performance.md`.

### F5. Errors in Open, New project and Local notes have no Retry

- **Today.** Open shows a danger StatusRow (`views/views/projects.view.json:69`, Branch).
  - A failed list says *Your projects couldn't be listed. Close Open and try again.* (`core/src/project-open-app.ts:19`).
  - Opening, pinning and choosing a project all fail with the same *The project couldn't be opened…*, pinning included.
  - StatusRow has no action (`ui/src/primitives/StatusRow/contract.ts`).
  - New project and Local import show their error the same way, with no way to try again.
- **Rule broken.** Every error offers a recovery where it's shown, and names its cause.
- **Fix.**
  - Give StatusRow an optional action: one tertiary Button, reused.
  - Retry reruns the failed command: `projects.open`, `projects.launch` with the same id, `local.copyTo` or the New project step.
  - Give pinning its own message, and say what's safe: *Your notes weren't changed.*
- **Files.** `ui/src/primitives/StatusRow/`, `core/src/project-open-app.ts`, `core/src/project-new-app.ts`, `views/views/projects.view.json`, `projectNew.view.json`, `localImport.view.json`, `views/messages/en.json`.

### F6. Empty states are passive sentences

- **Today.** 44 lists in the views declare an empty branch, and every one is a muted Text with no wrapper, no minimum size and no action. Examples:
  - Files: *Your notes will appear here.*
  - Open: *No projects yet. Choose Open project… or New project… above.* It points at a button instead of being one.
  - AI connections, the share list and recently deleted.
  - The site preview's four lists have no empty branch at all (`views/views/sitePreview.view.json`, Branch).
  - Some "empty" lists are good news, such as *No conflicts* and *All colours pass*, but they're styled like a missing state.
- **Rule broken.** `ui-states` empty states: in the content's own wrapper, at the content's minimum size, saying why it's empty and what to do, with the action right there. VVS ≥ 80 for empty states.
- **Fix.**
  - An `EmptyState` compound: an icon, one line of why, an optional detail and one primary Button, inside a wrapper with min-size tokens.
  - Adopt it in Files (*New note*), Open (*Open project…*, *New project…*), AI connections (*Add a connection*), the share list and the site preview.
  - Good-news lists use a success StatusRow instead.
- **Files.** `ui/src/compounds/` (new), `tokens/src/component/` (new), the views named.

### F7. Long operations have no steps, progress or Cancel

- **Today.** These show one pending line, or a busy button:
  - New project's repository creation (`core/src/project-new-app.ts:9-75`, Branch);
  - Publish and Apply in the site preview (Branch);
  - the first clone, first push and pull (Main).
  None names its steps, shows progress, shows the elapsed time after `wait.elapsedDelay`, or offers Cancel. First-run setup already does all of this with its parts list (`vm.firstRun.parts`).
- **Rule broken.** The long track and steps and progress: name the steps, show where it is, offer Cancel when it's safe, never a single unnamed busy (AGENTS.md rule 6).
- **Fix.** Reuse first run's pattern: a StepMark list with ProgressBar, driven by tracker steps, with Cancel where the bridge can stop. Add each operation to the wait inventory.
- **Files.** `core/src/project-new-app.ts`, `core/src/sharing-*.ts`, `core/src/sync-app.ts`, `views/views/projectNew.view.json`, `sitePreview.view.json`.

### F8. A crashed panel is a dead end

- **Today.** When a view throws, its boundary renders a single Text, *This panel couldn't load.*, and logs to the console (`ui-runtime/src/mount.ts:38-39`). It offers no Reload, no Report and no detail.
- **Rule broken.** A view-scope error says what's safe and offers a recovery.
- **Fix.** The fallback becomes a danger StatusRow, *This panel couldn't load. Your notes are safe.*, with **Reload panel** (remount by key) and **Report problem**, which opens Feedback with the error filled in. Feedback already keeps its draft and retries (`core/src/feedback-app.ts:180-217`).
- **Files.** `ui-runtime/src/mount.ts`, `ui-runtime/src/render.ts` (ViewBoundary).

### F9. Sections load with words, not shimmer

- **Today.**
  - Agents' switches and snippets show *Loading…* in their empty branch (`views/views/settings.view.json`).
  - The share item shows *Preparing…* (`views/views/shareItem.view.json`, Branch).
  - History shows a status line while versions load.
  Open (Branch) and the canvas already use Skeleton.
- **Rule broken.** Views and sections that load show shimmer in the shape of what's coming, with the container marked `aria-busy`. Words are for the long track.
- **Fix.** Skeleton rows in each section's shape, behind `wait.signDelay`, as Open does with `ItemCard skeleton`.
- **Files.** `views/views/settings.view.json`, `shareItem.view.json`, `history.view.json`.

### F10. Withdraw asks first instead of offering Undo

- **Today.** Withdrawing a share opens a confirmation (`core/src/share-item.ts:360-386`, `views/views/shareItem.view.json:244-302`, Branch).
- **Rule broken.** A reversible action acts at once and offers Undo. Confirmation is for what can't be undone.
- **Fix.** If sharing again restores the same link, withdraw at once and show a notification with **Undo**, reusing the pattern of history's restore and Undo (`core/src/note-history-app.ts:115-128`). If the link can't come back, keep the confirmation and say so in it.
- **Files.** `core/src/share-item.ts`, `views/views/shareItem.view.json`.
- **Settled ([D-341](../plan/decisions.md#d-341-withdrawing-a-public-share-keeps-its-confirmation-not-undo)).** The link can't come back: withdrawal invalidates the link and passcode, and sharing again makes a new link. So the confirmation stays and says so.

### F11. History and sync failures have no Retry in place

- **Today.**
  - History says *couldn't load* in its status line, with no Retry (`core/src/note-history-app.ts:178-179`). Restoring a version does offer Undo, which is good.
  - Every sync problem has its words and action (sign in, resolve, retry), but they appear only in a toast, which then disappears (F3).
- **Rule broken.** An error is shown where it happened and stays until it's resolved.
- **Fix.** Give history's status line a Retry, using the StatusRow action from F5. Have the save pill's menu keep the last sync problem and its action until the next success.
- **Files.** `core/src/note-history-app.ts`, `views/views/history.view.json`, `core/src/sync-app.ts`.

### F12. Two save models in one Settings section

- **Today.** The AI section saves its fields on change but its key with an explicit **Save** (`views/views/settings.view.json`, about lines 620-646, Main).
- **Rule broken.** One commit model per section, so a person knows whether to look for a button.
- **Fix.** Keep the explicit Save for the key, because it's checked against the provider, but put it in its own group with its own heading, and give Save a confirmed beat (F2). The rest of the section confirms on each field.
- **Files.** `views/views/settings.view.json`.

### F13. The first-run white frame

- **Today.** The wait inventory already lists a white frame before the first view on first run (`documentations/architecture/perceived-performance.md`, about line 332).
- **Rule broken.** No blank, white or unstyled frame (DSK-09).
- **Fix.** Give the window the resolved scheme's background token before the first paint, and show it on ready-to-show.
- **Files.** `apps/desktop/src/main/`.

### F14. Hover sticks on touch in nine components

- **Today.** These style `&:hover` outside `(hover: hover)`:
  - `ui/src/host/BlockHandle/BlockHandle.css.ts:42` and `ui/src/host/TableControls/TableControls.css.ts:143`;
  - `Heading.css.ts:26`, `FileTree.css.ts:40` and `:94`, `ThemeGallery.css.ts:47` and `Text.css.ts:48`;
  - `OpenItem.css.ts:41` and `:66` (Branch).
  ProjectPill does it right.
- **Rule broken.** States in every context: on touch, hover sticks after a tap.
- **Fix.** Wrap each one in the media query, or use React Aria's `data-hovered` as Button does, and add a `pnpm check` rule that rejects a bare `&:hover` in `*.css.ts`.
- **Files.** The nine files above and `tools/`.

### F15. Failure copy doesn't always say what's safe

- **Today.** The best messages say what's safe: *Your text is still here.*, *Your note is still saved.* Others don't:
  - *Couldn't change where appearance is kept.*
  - *The project couldn't be opened. Check its folder and try again.*
  - *Couldn't copy this local note. Try again.*
  - the AI rewrite's provider failures.
- **Rule broken.** `ui-copy` errors: what happened, what's safe, what to do.
- **Fix.** Add the safe clause to each one, such as *Your notes weren't changed.* or *Your original text is kept.*, and name the action the Retry button runs.
- **Files.** `views/messages/en.json`.

## Missing primitives and tokens

Most of what's needed already exists: Spinner, Icon, StatusRow, Skeleton, StepMark, ProgressBar, LiveRegion, Toast and the `wait.*` timings. The gaps are **states on existing primitives** and three new pieces.

### Tokens

| Token | Value | For | Today |
| --- | --- | --- | --- |
| `wait.confirmMinimum` | 200 ms | The least time pending and confirmed each show on a commit (F2) | Missing; `wait.signMinimum` (500 ms) is the load track's |
| `wait.commitPause` | 500 ms | A segmented choice, a radio or a slider commits after the hand stops, not on each step | Missing |
| `wait.noticeLong` | 8 s | A notice with an action, read and acted on (F3) | `wait.toastUndoDuration` 10 s does this for Undo only |
| `color.commit` and `color.commitBorder` | The success hue, quiet | A field's confirmed border and tick, in light, dark, contrast and forced colours | Reuse `color.success` and `successMuted`; one alias keeps the meaning clear |
| `size.empty.section`, `size.empty.view` | Per layout | The minimum block size of an empty wrapper, so a list doesn't collapse to one line (F6) | Missing |
| `cmp.toast.*` tones | success, warning, progress | The new Toast tones (F3) | Only info and error |
| `cmp.statusRow.action*` | Gap and alignment | The StatusRow action (F5) | Missing |

### States on existing primitives

| Primitive | Add | Reuses |
| --- | --- | --- |
| `useBusy` (behaviour) | `ack`, `failed` and a 200 ms confirm floor | `wait.signDelay`, `wait.confirmMinimum` |
| TextField, ColorField | `pending`, `confirmed`, `failed` in the trailing slot; a confirmed border | Spinner, Icon `checkmark`, `color.commit` |
| Switch | `pending` (a Spinner in the thumb), `confirmed`, `failed` with Retry; still `aria-disabled` while pending, never native `disabled` | Spinner, the Switch's own on and off words |
| SegmentedControl, ThemeGallery, FontChoice, PickerButton | `pending` and `confirmed` on the chosen option; the group locked while pending; `wait.commitPause` | Spinner, Icon |
| Slider | Commit on release, with `confirmed` | `wait.commitPause` |
| ImageFrame | `broken` with alt text and Retry | Icon, Button |
| StatusRow | An optional action (one Button) and an optional **Details** disclosure | Button, the disclosure in Settings |
| Toast | `success`, `warning`, `progress` tones; `sticky` | Spinner, ProgressBar |
| Skeleton | A row and a card shape matching ItemCard and OpenItem, so sections shimmer in their own shape | Skeleton's existing shapes |

### New pieces

| Piece | Layer | What it is |
| --- | --- | --- |
| `EmptyState` | Compound | An icon, one line of why, an optional detail and one primary Button, in a wrapper with the empty min-size tokens; `tone` for good news (F6) |
| `NotificationRegion` | Layout | The labelled "Notifications" region around the toast stack, with the queue's visible limit of three (F3) |
| A commit track in the task tracker | Core (not UI) | `tracker.commit(key, fn)` and `vm.commits`, the source of every control's pending, confirmed and failed state (F2) |
| A gallery fixture for every state | Gallery | Each new state as a contract fixture, so the gallery shows it in light, dark and contrast before any wiring |

## Proposed order of work

UI first, in the owner's strict-design mode: each state is drawn as a contract fixture or a gallery mock with the real design system, and the owner approves the look before anything is wired. Every slice is small enough to review within an hour. Wiring follows only after sign-off, one slice at a time.

<div class="slate-callout slate-callout--tip">
  <p class="slate-callout__title">Where to look</p>
  <p>Design slices land in the <a href="http://127.0.0.1:5231/?f=mock.uistates.hub">UI states review hub</a>, under <code>packages/views/mocks/ui-states/</code>, with light, dark and reduced-motion review controls. Each slice names the findings it answers.</p>
</div>

### Design (gallery only, no wiring)

| Slice | What the owner reviews | Findings | Effort |
| --- | --- | --- | --- |
| D1 | The notification stack: sticky error with Retry, success, warning and progress tones, three visible, a coalesced *3 images couldn't load*, inside the Notifications region | F3, F4 | S |
| D2 | A field's commit: TextField and ColorField pending, confirmed (border and tick) and failed with Retry | F2 | S |
| D3 | A switch's commit: Switch pending (spinner in the thumb), confirmed and failed with Retry | F2 | S |
| D4 | A choice's commit: SegmentedControl, ThemeGallery and FontChoice pending and confirmed, the group locked | F2 | S |
| D5 | `EmptyState` in Files, Open, AI connections, the share list and the site preview, plus a good-news StatusRow | F6 | M |
| D6 | StatusRow with an action and Details, used in Open, New project, Local import and history; ImageFrame broken with Retry | F5, F4, F11 | S |
| D7 | Long operations: New project and Publish with a step list, progress, elapsed time and Cancel; the crashed-panel fallback | F7, F8 | S |
| D8 | Sections loading in their shape: Agents, the share item, history | F9 | S |

### Wiring (after the owner approves each design)

| Slice | What lands | Findings | Effort |
| --- | --- | --- | --- |
| W1 | Notification host: sticky errors, a queue of three with errors first, coalescing, pause on blur, the region | F3 | M |
| W2 | No silent failures: `render.ts` routes a rejected setter or action to the control's failed state or an error with Retry; renderer `unhandledrejection` reporter; roll back store updates whose write fails | F1 | M |
| W3 | The commit track in the task tracker and `vm.commits` | F2 | M |
| W4 | App settings confirm through the commit track (appearance, fonts, scale, focus, outline, Files options, AI fields) | F2, F12 | M |
| W5 | Project settings confirm through the commit track | F2 | S |
| W6 | Retry in place: Open, New project, Local import, history, image reads | F4, F5, F11 | M |
| W7 | Empty states adopted | F6 | S |
| W8 | Steps and Cancel for New project, Publish and the first clone and push | F7 | L |
| W9 | Small fixes: Withdraw with Undo, the crashed-panel fallback, section shimmer, copy that says what's safe, the first-run frame, the hover check in `pnpm check` | F8, F9, F10, F13, F14, F15 | S each |

Each wiring slice also adds its rows to the [wait inventory](../architecture/perceived-performance.md), and runs the checks its risk calls for once it's out of design mode.

**Phase-2 implementation, 4 November:** W2's result-aware action handling and confirmed-settings persistence are pushed to `vq-ui-states` at `dbf53479`; see the [scoped evidence and remaining gaps](../plan/definition-of-done.md#phase-2-evidence-4-november). W3/W4 still supply the approved commit states and retained drafts. W1 must also place actionable notifications above modal scrims: the focused journey could use Retry only after closing Settings. W5 depends on the project-settings implementation, which is not present on this branch. These are implementation gaps, not changes to the owner's design approval.
**New project D7 increment:** [streamed-setup evidence](../plan/definition-of-done.md#phase-2-streamed-new-project) covers actual backend steps/counts, elapsed at 3 seconds, safe-boundary Cancel, retained partial files and completed-create/Open-only receipts. Latest exact pushed candidate: `preview\candidates\65f42cfc\Open review build.cmd`; both distinct sample projects and the real creation/cancellation UI were inspected invisibly, then closed. The owner's visible `f2127c67` remains open; Publish, first clone/push and W9 remain in progress.

**Site D7 increment:** [local-publication evidence](../plan/definition-of-done.md#phase-2-local-site-operations-b70e3334) covers real preview reads, cancelled/rejected preparation, retained previous articles, atomic Apply and local-publication receipts. Publish here saves local draft paths; its copy now says nothing is sent to GitHub. Cancellation is available for preparation, not in the middle of an acknowledged atomic settings write. Exact-head candidate `preview\candidates\b70e3334\Open review build.cmd` retains both sample projects; the visible `f2127c67` stays open. First clone/push, W9 and remaining acceptance are still in progress.

**First-setup D7 increment:** [clone/push receipt evidence](../plan/definition-of-done.md#phase-2-first-setup-cancellation-a9425fee) covers actual setup cancellation/resume through local bare remotes, persistent stop receipts, refused push and completed final push. Exact `preview\candidates\a9425fee\Open review build.cmd` was inspected invisibly in both sample projects, then closed. The separate Open-from-GitHub clone route, W9 and remaining acceptance are not covered by this increment. The visible `f2127c67` still stays open; phase 2 is not complete.

**Existing-download D7 increment:** [retained-folder evidence](../plan/definition-of-done.md#phase-2-existing-project-download-025fe72f) covers that separate clone route, actual read boundaries and same-folder continuation. Its receipt is in-process only; after restart, use Open a folder to check the retained clone, not a blind replay. Exact `preview\candidates\025fe72f\Open review build.cmd` retains both distinct sample projects and was inspected invisibly, then closed. W9 and remaining D5/D7 acceptance remain in progress; the visible `f2127c67` is untouched.

**W9 recovery/hover increment:** [scoped recovery evidence](../plan/definition-of-done.md#phase-2-panel-recovery-and-hover-afbd3c3c) covers client-rendered failure, repeated local Reload, unchanged sibling/editor state, and a safe Feedback draft without automatic diagnostics or sending. Rewrite failures now explicitly keep the original text; pending New-project reasons distinguish checking, creation, stopping and final Open. The static hover gate covers ancestor and mixed selectors; the native touch case proves hover clears while pointer-menu and keyboard-menu access remain. Existing native first-frame machinery passed light/dark first-run checks; this is not a new startup rewrite or a full frame-integrity result. Exact candidate `preview\candidates\afbd3c3c\Open review build.cmd` was inspected invisibly in both projects and closed. Remaining D5/D7 acceptance stays in progress; the visible `f2127c67` stays open.

**Native acceptance increment:** [actual recovery and first-action evidence](../plan/definition-of-done.md#phase-2-native-recovery-and-empty-first-actions-12834be2) adds a native crashed-panel/repeated-Reload/safe-Feedback journey, both Open empty-column first actions through real project IPC, and all three site-preview first actions followed by actual public-note content replacement. Final 3 journeys, desktop types and static checks pass. Exact pushed candidate `preview\candidates\12834be2\Open review build.cmd` was inspected invisibly in both distinct projects, then closed. Remaining D5/D7 and all-done variants are not implicitly accepted; phase 2 remains in progress and the owner's visible window is unchanged.

**Site D5 variants:** [cleared-list and fourth-fallback evidence](../plan/definition-of-done.md#phase-2-site-empty-variants-20406d26) adds the populated-to-cleared native transition, exact 160 px section minimums and each cause/action. The fourth list is the section's article list: sections are derived from articles, so normal navigation cannot select an empty section. Its defensive fallback and existing Files action are verified with the actual client-rendered view and core command, not misreported as a fourth native first-use route. Exact pushed `preview\candidates\20406d26\Open review build.cmd` was inspected invisibly in both sample projects and closed; the owner's visible `f2127c67` stays open. This closes those bounded D5 variants, not complete phase-2 acceptance.

**Cleared AI, sizing and startup pixels:** [scoped D5/D7 evidence](../plan/definition-of-done.md#phase-2-cleared-ai-and-startup-pixels-cf63f90d) verifies actual last-connection removal, its persisted empty list and returned first action in the same Settings wrapper. Files uses the actual 32 px filtered component and 160 px cleared section minimums. Six native journeys pass, including report-triggered PNG checks in both startup schemes; these are not a continuous startup-frame corpus. The unchanged gallery primitive additionally passes all three sizes and good-news/no-action in light/dark and reduced motion. Exact pushed `preview\candidates\cf63f90d\Open review build.cmd` was inspected invisibly in both sample projects and closed. Phase 2 remains in progress; the visible `f2127c67` is untouched.

**D7 single outcomes and first-show frames:** [outcome-ownership evidence](../plan/definition-of-done.md#phase-2-single-outcomes-and-startup-frame-stream-a7363402) fixes reproduced duplicate task/local outcomes and generic Done after stopped download/setup receipts. The default tracker behavior stays unchanged; only the named D7 owners delegate their already-live outcomes. Final 102 scoped units, source/desktop types, static/build checks and 6 native journeys pass together. Startup now has a subscribed first-show stream: 7 classified light and 7 dark frames, no blank/transparent/wrong-scheme drawn window. This is not the full frame-integrity corpus. Exact pushed `preview\candidates\a7363402\Open review build.cmd` was inspected invisibly in both projects and closed; the visible owner window and persistent gallery/docs are unchanged. Final phase-2 evidence reconciliation is still in progress.

**D5 actual colour all-done branch:** [reachable good-news evidence](../plan/definition-of-done.md#phase-2-reachable-colour-all-done-state-a055bbe8) corrects the earlier claim that the colour editor's empty-list fallback supplied its success row: its five editable rows never become empty, so that branch was unreachable. The actual all-pass summary now uses the approved success row, without adding an action or duplicating its polite announcement. Client failure/fix replacement, six selected units and the actual native Fix Text route pass with unchanged note bytes/editor identity. Exact pushed `preview\candidates\a055bbe8\Open review build.cmd` was inspected invisibly in both projects and closed. The separate size-retry fixture failure found by an initial broader unit selector is recorded, not repaired or represented as a passing full file. Phase 2 remains in progress and the owner's visible window stays open.

**D7 repeated retained outcomes:** [repeated-recovery evidence](../plan/definition-of-done.md#phase-2-repeated-retained-outcomes-06d4f939) additionally fixes a missing outcome when the same error row survives another refusal. Only an unchanged retained result gets one explicit announcement; new local outcomes remain their own live result. Final 102 scoped units and 4 affected native operation journeys pass, with no replay of completed creation/clone work. Exact pushed `preview\candidates\06d4f939\Open review build.cmd` was inspected invisibly in both projects and closed; owner `f2127c67` is unchanged.

**D8 initial and repeated section outcomes:** [section-outcome evidence](../plan/definition-of-done.md#phase-2-section-outcome-ownership-1d3deccf) closes the concrete tracker/local-failure overlap below. Agents, item sharing and history keep the delayed wait and legitimate tracker success, but their live recovery row owns failure; an unchanged retained refusal is explicitly reannounced once. Agents now keeps that same recovery row mounted with its existing busy Retry treatment. Final 92 scoped units and all 3 affected native journeys pass, including live-region mutation counts for initial and repeated refusals. Exact pushed `preview\candidates\1d3deccf\Open review build.cmd` was inspected invisibly in both distinct projects and closed. This is native DOM/live-region evidence, not a claim of assistive-technology certification or whole-phase completion.

**D2/D3 named primitives:** [ColorField/Switch evidence](../plan/definition-of-done.md#phase-2-named-field-and-switch-contracts-9c512e40) fills the remaining precise contract-proof gap. ColorField was missing its persisted binding declaration; it now uses the shared commit handler, with generated schemas. Both named primitives have focused component/renderer refusal, exact Retry, success and write-free Revert proof. Native colour edits and reader Focus prove zero early settings writes: the current draft-only controls still wait for their existing Save/Share/Apply boundary. Watermark's saved boolean recovery is real, but its actual control is segmented, not Switch. Final 23 scoped units and 3 native journeys pass. Exact pushed `preview\candidates\9c512e40\Open review build.cmd` was inspected invisibly in both projects and closed.

### Current phase-2 evidence reconciliation

This is a map to the exact DoD rows, not a phase-complete declaration or a demand to rerun their whole historical suite.

| Row | Recorded scoped proof | Remaining check or explicit boundary |
| --- | --- | --- |
| D1 | [Queue, recovery and focus](../plan/definition-of-done.md#phase-2-notification-acceptance-increment-0db24cb0), [overlapping pauses](../plan/definition-of-done.md#phase-2-overlapping-notification-pauses-b68775f8), [irreversible withdrawal](../plan/definition-of-done.md#phase-2-irreversible-withdrawal-46c0cb31) | Withdrawal uses synthetic publication; no real-account grant write is authorized |
| D2 | [Field/commit infrastructure](../plan/definition-of-done.md#phase-2-functional-increment-bf1c5afd), [named ColorField/Switch contract](../plan/definition-of-done.md#phase-2-named-field-and-switch-contracts-9c512e40), [AI independent details and checked key](../plan/definition-of-done.md#phase-2-independent-ai-details-and-checked-key-42e06fc0) | Persisted fields and draft-only colour editing have different acceptance boundaries; no premature per-edit Saved or live-provider certification |
| D3 | [Named Switch and local preview proof](../plan/definition-of-done.md#phase-2-named-field-and-switch-contracts-9c512e40), [watermark refusal, Retry and stored value](../plan/definition-of-done.md#phase-2-project-increment-fd5252ee) | Watermark is segmented, not Switch. No new per-toggle persistence or writing-window element is added |
| D4 | [App choices](../plan/definition-of-done.md#phase-2-app-choices-and-announcements-b7f54383), [theme/font groups](../plan/definition-of-done.md#phase-2-theme-and-reading-font-e643bd48), [sliders](../plan/definition-of-done.md#phase-2-reading-sliders-and-svg-upload-6a217238), [compact controls](../plan/definition-of-done.md#phase-2-compact-focus-and-docking-b6375b3a), [Reading size](../plan/definition-of-done.md#phase-2-reading-size-399bd9c9), [hover AST/touch proof](../plan/definition-of-done.md#phase-2-panel-recovery-and-hover-afbd3c3c) | The separate full-theme size-fixture failure is recorded above for consolidation, not silently repaired or treated as green |
| D5 | [Files](../plan/definition-of-done.md#phase-2-files-known-empty-and-first-action-6218b99d), [honest initial scan](../plan/definition-of-done.md#phase-2-independent-initial-files-scan-b830a17c), [Recently deleted](../plan/definition-of-done.md#phase-2-recently-deleted-honest-states-71e94423), [Sharing](../plan/definition-of-done.md#phase-2-honest-sharing-settings-list-e1ce6940), [Open/site first actions](../plan/definition-of-done.md#phase-2-native-recovery-and-empty-first-actions-12834be2), [fourth site fallback/cleared lists](../plan/definition-of-done.md#phase-2-site-empty-variants-20406d26), [AI/size variants](../plan/definition-of-done.md#phase-2-cleared-ai-and-startup-pixels-cf63f90d), [actual colour all-done](../plan/definition-of-done.md#phase-2-reachable-colour-all-done-state-a055bbe8) | The fourth site fallback is defensive/client-rendered, not a fourth normal first-use route. Existing first actions still route to Files; no new section/link editor is implied |
| D6 | [Open](../plan/definition-of-done.md#phase-2-scoped-open-recovery-cf5859a2), [same-project accepted read](../plan/definition-of-done.md#phase-2-same-project-open-acceptance-and-waits-8f1fb690), [New/Local](../plan/definition-of-done.md#phase-2-partial-safe-newlocal-recovery-651b1340), [history](../plan/definition-of-done.md#phase-2-history-recovery-and-independent-section-ef03a581), [images](../plan/definition-of-done.md#phase-2-broken-image-recovery-cd0cede9), [safe failure copy](../plan/definition-of-done.md#phase-2-panel-recovery-and-hover-afbd3c3c) | Completed import/clone receipts remain in-process; uncertain creation/import replay is not crash-resumable and must never be attempted blindly |
| D7 | [New-project step stream](../plan/definition-of-done.md#phase-2-streamed-new-project), [local site operations](../plan/definition-of-done.md#phase-2-local-site-operations-b70e3334), [first setup](../plan/definition-of-done.md#phase-2-first-setup-cancellation-a9425fee), [existing download](../plan/definition-of-done.md#phase-2-existing-project-download-025fe72f), [native panel recovery](../plan/definition-of-done.md#phase-2-native-recovery-and-empty-first-actions-12834be2), [first-show stream/outcome ownership](../plan/definition-of-done.md#phase-2-single-outcomes-and-startup-frame-stream-a7363402), [repeated retained outcomes](../plan/definition-of-done.md#phase-2-repeated-retained-outcomes-06d4f939) | Publish saves a local draft, never remote deployment. Startup is a scoped first-show stream, not the broad DSK-09 corpus or every possible delay |
| D8 | [Independent tracks](../plan/definition-of-done.md#phase-2-independent-section-loading-47101d57), [history native recovery](../plan/definition-of-done.md#phase-2-history-recovery-and-independent-section-ef03a581), [share-item native track](../plan/definition-of-done.md#phase-2-share-item-independent-section-2ce9b22d), [initial/repeated section outcomes](../plan/definition-of-done.md#phase-2-section-outcome-ownership-1d3deccf) | Default outcomes on unrelated sections remain unchanged. The 3 named owners suppress only generic failure, retain success/wait, and announce unchanged retained refusal once. Older-page refusal has unit proof; native repeated list/version refusal has live-region proof, not a screen-reader certification |

**Current review state:** the [clause-by-clause reconciliation](../plan/definition-of-done.md#phase-2-clause-reconciliation-9c512e40) found no additional unmet implementation clause within the authorized scoped evidence review. D8 outcome ownership and the named ColorField contract gap are fixed; historical generic remaining-D5/D7 prose is superseded by the linked increments. The latest candidate is ready for implementation review through the original main chat, not a phase-complete declaration. Full suites, CI waiting, app consolidation and releases remain unauthorized.

**Latest window is open:** the original main chat's [visible-review request](../plan/definition-of-done.md#phase-2-visible-implementation-review-9c512e40) is fulfilled at `9c512e40`, with both sample projects and a separate review profile. The earlier visible `f2127c67` stays open too. The linked page gives four things to try; neither window is a merged or released app.

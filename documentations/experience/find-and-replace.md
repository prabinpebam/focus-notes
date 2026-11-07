# Find and replace

Find and replace text in the open note, or across every note in the workspace. It works the way VS Code and Word do, inside a compact bar that keeps the canvas calm.

> [!NOTE]
> **TL;DR.** <kbd>Mod</kbd>+<kbd>F</kbd> opens a small frosted **find bar** under the trigger, showing a live "3 of 12" count, case/word/regex toggles, and next and previous buttons. It expands into **replace** (<kbd>⌥⌘F</kbd> / <kbd>Ctrl+H</kbd>), and replace-all is a single undo step. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> searches **all notes** in a side sheet of results grouped by note, and opens any of them at exactly that match with the find bar on it (D-110). Replacing across notes (P1) shows a preview and saves as one revertible commit. Matching runs on the text you see, not on Markdown syntax. Covers FND-01 to FND-05 in the [requirements](../product/requirements.md).

## Find in the note

**Open:** <kbd>Mod</kbd>+<kbd>F</kbd>, ⋯ → *Find*, or Spotlight (`> Find`). If text is selected, it fills the search field, as in VS Code and browsers.

| Part | Behavior |
| --- | --- |
| **Bar** | A compact frosted bar, about 480 px wide, just under the trigger at the top center. It never covers the line being edited. If the current match would sit under the bar, the note scrolls. |
| **Field** | Searches as you type (after a 60 ms pause on long notes). The previous search is remembered for the session, and <kbd>↑</kbd>/<kbd>↓</kbd> in the field steps through recent searches. |
| **Count** | "3 of 12", or "No results" in the danger color. Screen readers announce it politely. |
| **Toggles** | Match case (`Aa`), Whole word (`ab`), Regular expression (`.*`). The defaults ignore case and accents, so `cafe` finds `café`, like browser find. |
| **Navigate** | <kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd>, <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> (Apple), <kbd>F3</kbd> / <kbd>Shift+F3</kbd> (Windows). Searching wraps around the end of the note, with a short "Wrapped to top" notice. |
| **Close** | <kbd>Esc</kbd>. The caret goes to the current match with it selected, so typing replaces it (VS Code behavior). |

**Layout (D-111, D-395; owner correction, 7 November).** The bar is one frosted surface with one layout-owned `insetMd` content inset. Its first row is the chevron, find field, count, previous/next pair, and × at the end. The chevron shares the field's centre line and stays in the same box when replace expands or collapses, on hover and on focus. The options occupy their own row below, aligned at the top of each Switch's control/label line: help text stays below its own label, never vertically centring the other switches against that taller control. The replace row follows below. Section separation uses `stackSection`; options use `inlineGroup` (16 px), larger than the Switch's own track-to-label gap (8 px). Wrapped option lines use `stackItem` (8 px), closer than the section above. At compact widths the existing Search options popover moves below the field row, leaving both navigation arrows and × exposed. In a short window the stack uses its `shortGap` token, keeping the current match on screen. The popover is anchored beside its trigger so all four controls fit. The field gives up room first, down to its token-defined minimum. Every binary option is a Switch; the bar has one × and no field clear button. The all-notes sheet likewise keeps × on its field row and top-aligns its Switch options; its heading/results structure is unchanged in this defect slice.

**One Find surface at a time.** Opening Find in the note (including Replace and next/previous shortcuts) closes Find in all notes in the same state update. Opening Find in all notes closes the note's Find bar and releases its selection scope. Each surface remembers its own query and matching options; a match chosen from all-notes results still explicitly transfers that result's query/options to the note's Find bar. No close/open frame shows both surfaces.

Closing the note's Find bar returns the caret only if focus still belongs to the note or the closed control has left it on the window body. Its deferred frame is cancelled if the bar reopens; it never takes focus back from the all-notes search field that replaced it.

The owner's correction was: "Alignment and layout is all messed up, audit and fix" — switches with extra lines, a jumping chevron, misplaced close, a different all-notes interface, and both Find surfaces open together. References: [in-note Find screenshot](file:///C:/Users/Prabin%20Pebam/AppData/Roaming/Code/agentSessionData/e9c027a6-6c25-4505-b29d-2adc43c241f3/attachments/e2306550-8d33-45e3-af83-9bd311ad66ad/Pasted%20Image.png), [all-notes screenshot](file:///C:/Users/Prabin%20Pebam/AppData/Roaming/Code/agentSessionData/e9c027a6-6c25-4505-b29d-2adc43c241f3/attachments/40c2975a-5d2a-4f78-85f0-f6ce99bb90eb/Pasted%20Image%202.png), [overlapping surfaces screenshot](file:///C:/Users/Prabin%20Pebam/AppData/Roaming/Code/agentSessionData/e9c027a6-6c25-4505-b29d-2adc43c241f3/attachments/f2f4a644-3dae-4fcd-bf73-af60f24ba8ce/Pasted%20Image%203.png). The familiar all-notes layout is a separate candidate requiring approval before it lands.

### What counts as a match

- Matching runs on the **visible text** of the note: what you see, not the Markdown source. Searching for `bold` finds **bold**, and `**` matches nothing unless the note really contains asterisks.
- A match can cross formatting changes (`foo` in "f**oo**") but not block boundaries. Regular expressions run one block at a time.
- Covered: paragraphs, headings, list items, quotes, table cells, code blocks, and link text. Link URLs and future components' attributes aren't searched in v1.

### Highlights and focus mode

- Every match gets a highlight from the `color.findMatch` token. The current match gets a stronger color (`color.findMatchActive`) and an outline. Text in a match takes the text color, so a link or code in it keeps AA contrast on the highlight (D-100).
- While the find bar is open, the top of the note moves down below the bar, and matches scroll into view below it, so the bar never covers the current match.
- *Planned (P1):* thin tick marks along the right edge of the canvas showing where matches are in the note (D-76).
- With [focus mode](focus-mode.md) on, the bright paragraph follows the **current match**. Matches outside its band stay dimmed, but their highlight color still shows through, so you can see where they are.

## Replace in the note

**Open:** <kbd>⌥⌘F</kbd> (Apple) or <kbd>Ctrl+H</kbd> (Windows), or the chevron on the find bar. This adds a replace row, as in VS Code.

| Action | Keys | Behavior |
| --- | --- | --- |
| Replace current | <kbd>Enter</kbd> in the replace field | Replaces the current match and moves to the next. |
| Replace all | <kbd>⌘Enter</kbd> / <kbd>Ctrl+Alt+Enter</kbd> | Replaces every match. Always **one undo step**, and the bar says "Replaced 12 matches" (announced). |
| Regex captures | `$1`, `$2`, `$&` | Available when the regex toggle is on. |
| Preserve case (P1) | Toggle `AB` | `Note` → `Draft`, `NOTE` → `DRAFT`. |

- **Formatting is kept.** The replacement takes the formatting of the first character of the match. Replacing inside a link keeps the link.
- **Read-only parts are skipped.** Raw blocks the editor shows read-only (unknown components, raw HTML) are never searched or changed.

## Find in selection (P1)

<kbd>⌥⌘L</kbd> / <kbd>Alt+L</kbd>, or the bar's *Find in selection* toggle, limits find and replace to the text that was selected when the bar opened, as VS Code does (D-160).

| Situation | Behavior |
| --- | --- |
| **Text selected, then <kbd>Alt+L</kbd> in the note** | The bar opens with find in selection on and its field focused. The selection becomes the **scope**: it's faintly tinted (`color.selectionGhost`) while the option is on, and the field isn't filled from it. |
| **Text selected, then <kbd>Mod</kbd>+<kbd>F</kbd>** | The selection is kept as the scope, off until <kbd>Alt+L</kbd> or the toggle turns it on. A selection within one line still fills the field, as before. |
| **Nothing selected when the bar opened** | There's no scope: the toggle is disabled and says why ("Select text in the note, then open find"), and <kbd>Alt+L</kbd> does nothing. |
| **Matching** | Only matches entirely inside the scope count. The count, next and previous (which wrap inside the scope), replace, and replace all see only those. Replace all is still one undo step. |
| **Edits** | The scope follows edits: replacing inside it, or typing elsewhere, moves its ends with the text. |
| **Turning it off, closing** | Turning it off searches the whole note again, keeping the scope for turning it back on. Closing the bar forgets the scope; the next opening takes the selection then. |

The Switch sits with Match case, Whole word, and Regular expression, is announced as on or off with its shortcut, and works from the keyboard like them.

## Find in all notes

**Open:** <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, ⋯ → *Find in all notes*, or Spotlight's *Find "…" in all notes*, which brings its query. A frosted side sheet opens on the right, over the canvas like the [Files panel](../design/views/files.html), with its search field focused. It's built as its own sheet rather than a Spotlight mode, because grouped lines need the height (D-110).

1. **Matching** is the find bar's own: the same visible text, the same matcher, and the same toggles, Match case (`Aa`), Whole word (`ab`), and Regular expression (`.*`), on the sheet's buttons or <kbd>Alt</kbd>+<kbd>C</kbd> / <kbd>W</kbd> / <kbd>R</kbd> (<kbd>⌥⌘C</kbd> / <kbd>W</kbd> / <kbd>R</kbd> on a Mac). Case and accents don't matter by default. Filters narrow it: `in:essays/`, `is:private`, `is:public`.
2. **Results are grouped by note**: private notes first, then public, then the browser's own, each by path. A note's heading shows its title, its path, whether it's public or private, and its number of matches; under it, each match is a line of the note with the match marked in the find highlight. A line holding two matches shows twice, each marked once. A summary says "12 matches in 3 notes" (announced politely), "No results", or that a regular expression doesn't compile. After 1,000 lines it says only the first are shown, though every match is counted.
3. **Keys.** Focus stays in the field. <kbd>↓</kbd> and <kbd>↑</kbd> move through the lines (never onto a note's heading); <kbd>Enter</kbd>, or a click, opens the note at that match, with the find bar open and its field focused, showing "3 of 5", so <kbd>Enter</kbd> then steps through the note's other matches. <kbd>F4</kbd> / <kbd>Shift</kbd>+<kbd>F4</kbd> open the next or previous result across notes without the sheet (the first <kbd>F4</kbd> opens the result that's highlighted). <kbd>Esc</kbd> clears the field, then closes the sheet, and the caret goes back to the note. The search stays for the session.
4. **Where it searches.** The [search index](spotlight.html) answers, in its worker: every note's visible text, one line per block, as the index read it. **Desktop:** the workspace's notes on disk, private and public, kept current by the app's saves and the file watcher. **Web:** this browser's notes, the instance's public notes, and its private notes only while they're unlocked; locking takes them out of the results at once. While notes are still being read (just after launch), the summary says how many, and the results fill in as they are.
5. **Exactly that match.** Each line knows its place in the note's count and which line it's on, and the editor selects it by its line first: a block the editor shows as raw Markdown isn't searched by the find bar, so there the count in the sheet can be higher than the find bar's, and the line still opens at the right match. A table's row is one line in the sheet and a cell per block in the editor, so a match there is found by its place in the count.

## Replace in all notes (P1)

<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> adds a replace field to *Find in notes*.

1. **Preview first.** Each note shows its changes as before and after lines. Notes, or single matches, can be unchecked.
2. **Apply through the editor.** Each note is opened through the Markdown bridge, changed, and saved, so formatting and [round-trip fidelity](../architecture/content-model.md#round-trip-fidelity) rules apply exactly as for typing. A note that can't round-trip safely is skipped and listed.
3. **One commit per repository.** The changes are saved as one commit, for example `Replace "draft" → "note" in 7 notes`. If private notes changed, the private repository is committed first, as always.
4. **Undo.** A toast offers *Revert*, which runs `git revert` on that commit on the desktop. It stays in Spotlight as `> Revert last replace` until the next change.

## Implementation notes

| Need | Approach | License |
| --- | --- | --- |
| Find and replace in one note | [`prosemirror-search`](https://github.com/ProseMirror/prosemirror-search), the official ProseMirror search package, wrapped as a Tiptap extension | MIT |
| Search across notes | The [search index](spotlight.html)'s worker scans the visible text it holds for every note, with the find bar's matcher (`@focus-notes/markdown/match`), on the desktop and the web alike; no ripgrep (D-110) | MIT |
| Matching that ignores accents | Unicode NFD normalization with combining marks removed, for both the text and the query | Not applicable |

## Acceptance checks

- **Alignment and exclusivity:** the field, chevron, previous/next and close share a centre line; the chevron's exact box does not change through hover, focus or replace expansion; all four Switch rows share their top edge despite selection help. Both shortcut opening orders show exactly one Find surface and retain their respective queries (`m1-find` and `m4-find-all` journeys).

- **FND-01:** <kbd>Mod</kbd>+<kbd>F</kbd> with "focus" selected opens the bar pre-filled, shows the right count, and <kbd>Enter</kbd> steps through every match and wraps around.
- **FND-02:** Replace-all of 100 matches is undone by a single <kbd>Mod</kbd>+<kbd>Z</kbd>, and bold or links on the replaced text are kept.
- **FND-03:** Find in selection never matches outside the selected range: with a word appearing inside and outside a selected paragraph, <kbd>Alt+L</kbd> counts only the ones inside, <kbd>Enter</kbd> wraps inside it, and replace all changes only those, undone by one <kbd>Mod</kbd>+<kbd>Z</kbd>; from the keyboard alone, with no axe violations (unit tests in `packages/editor/test/find.test.ts`, the M8 journey `m8-editor-pro`).
- **FND-04:** Find in all notes on a 5,000-note workspace lists the first results within 300 ms on the desktop (`FND-04.findAllP95Ms` in the benchmark). <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, a query, the arrow keys, and <kbd>Enter</kbd> open the note at that exact match with the find bar showing its place in the count, from the keyboard alone and with no axe violations (the M4 journey `m4-find-all`).
- **FND-05:** Replacing across 10 notes makes one commit, and *Revert* restores every file byte for byte.

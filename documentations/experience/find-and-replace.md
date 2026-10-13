# Find and replace

Find and replace text in the open note, or across every note in the workspace. It works the way VS Code and Word do, inside a compact bar that keeps the canvas calm.

> [!NOTE]
> **TL;DR.** <kbd>Mod</kbd>+<kbd>F</kbd> opens a small frosted **find bar** under the trigger, showing a live "3 of 12" count, case/word/regex toggles, and next and previous buttons. It expands into **replace** (<kbd>⌥⌘F</kbd> / <kbd>Ctrl+H</kbd>), and replace-all is a single undo step. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> searches **all notes** inside the [Spotlight](spotlight.html) panel. Replacing across notes (P1) shows a preview and saves as one revertible commit. Matching runs on the text you see, not on Markdown syntax. Covers FND-01 to FND-05 in the [requirements](../product/requirements.md).

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

### What counts as a match

- Matching runs on the **visible text** of the note: what you see, not the Markdown source. Searching for `bold` finds **bold**, and `**` matches nothing unless the note really contains asterisks.
- A match can cross formatting changes (`foo` in "f**oo**") but not block boundaries. Regular expressions run one block at a time.
- Covered: paragraphs, headings, list items, quotes, table cells, code blocks, and link text. Link URLs and future components' attributes aren't searched in v1.

### Highlights and focus mode

- Every match gets a highlight from the `color.findMatch` token. The current match gets a stronger color (`color.findMatchActive`) and an outline.
- While the find bar is open, the top of the note moves down below the bar, and matches scroll into view below it, so the bar never covers the current match.
- *Planned (P1):* thin tick marks along the right edge of the canvas showing where matches are in the note (D-76).
- With [focus mode](focus-mode.md) on, the bright row follows the **current match**. Other matches stay dimmed with the rest of their rows, but their highlight color still shows through, so you can see where they are.

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

<kbd>⌥⌘L</kbd> / <kbd>Alt+L</kbd> limits find and replace to the text that was selected when the bar opened. The selection stays faintly tinted while this is on.

## Find in all notes

**Open:** <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>. This opens [Spotlight](spotlight.html) in *Find in notes* mode, so there's no separate search sidebar and no extra chrome.

1. Results are grouped by note: title, path, whether it's public or private, and the number of matches. Each note expands to show its matching lines with the match highlighted.
2. The same toggles apply (case, word, regex), along with filters: `in:essays/`, `is:private`, `is:public`.
3. <kbd>Enter</kbd> on a matching line opens that note at the match with the find bar open, so <kbd>Enter</kbd> then steps through its other matches. <kbd>F4</kbd> / <kbd>Shift</kbd>+<kbd>F4</kbd> jump to the next or previous result across notes without reopening the panel.
4. **Desktop** searches the files on disk, so results are always complete and current. **Web** (MW) searches the local index, which is complete for note titles and covers note text as fast as notes can be cached.

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
| Search across notes on the desktop | ripgrep run on the workspace, with Markdown stripped from result lines for display | MIT / Unlicense |
| Search across notes on the web | The [Spotlight](spotlight.html) index (MiniSearch), plus a full scan of cached notes for exact and regex matches | MIT |
| Matching that ignores accents | Unicode NFD normalization with combining marks removed, for both the text and the query | Not applicable |

## Acceptance checks

- **FND-01:** <kbd>Mod</kbd>+<kbd>F</kbd> with "focus" selected opens the bar pre-filled, shows the right count, and <kbd>Enter</kbd> steps through every match and wraps around.
- **FND-02:** Replace-all of 100 matches is undone by a single <kbd>Mod</kbd>+<kbd>Z</kbd>, and bold or links on the replaced text are kept.
- **FND-03:** Find in selection never matches outside the selected range.
- **FND-04:** Find in all notes on a 5,000-note workspace lists the first results within 300 ms on the desktop.
- **FND-05:** Replacing across 10 notes makes one commit, and *Revert* restores every file byte for byte.

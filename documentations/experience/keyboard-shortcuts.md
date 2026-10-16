# Keyboard shortcuts

A full keymap, from the shortcuts everyone knows to niche ones for heavy users. Each binding copies the most widely used app that already has it, so existing muscle memory works on day one.

> [!NOTE]
> **TL;DR.** Every action is a named **command**. Shortcuts are bindings from keys to commands, scoped by **context** (editor, table, find bar, Spotlight, files, global), and each one follows a well-known precedent (VS Code, Notion, Google Docs, Word, Typora, macOS, Windows). **Mod** means <kbd>⌘</kbd> on macOS and iPadOS and <kbd>Ctrl</kbd> on Windows and Linux. The keymap is in four layers: **Basic**, **Writer**, **Power**, and **Pro**. Every command is also reachable from [Spotlight](spotlight.html) (<kbd>Mod</kbd>+<kbd>/</kbd>), which shows its shortcut. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> opens a searchable cheat sheet. Custom keybindings follow in P1. Covers KEY-01 to KEY-07 in the [requirements](../product/requirements.md).

## Strategy

1. **Borrow, don't invent.** Each default comes from a widely used app. The *Precedent* column below names it. A new binding is invented only when no precedent exists.
2. **Commands first.** Every action is a named command, such as `note.new` or `focus.toggle`. The [trigger toolbar](main-ui.html), the ⋯ menu, the macOS menu bar, [Spotlight](spotlight.html), and keys all run the same commands, so there's nothing a shortcut can do that a pointer user can't, and the other way round.
3. **Contexts decide.** Bindings carry a `when` context (`editor`, `table`, `findBar`, `spotlight`, `files`, `toolbar`, `global`). The most specific context wins. In the build, a context is a *key scope*: primitives and layouts mark one with `keyScope`, and keys registered for it work only while focus is inside (the find bar's Enter, Esc, and toggles). For example, <kbd>Mod</kbd>+<kbd>Enter</kbd> adds a table row inside a table and checks a task elsewhere.
4. **Four layers, learnable in order.**

| Layer | Who | Examples |
| --- | --- | --- |
| **Basic** | Everyone | Undo, copy, save, new, open, find, bold |
| **Writer** | Regular writers | Headings, lists, links, focus mode, font size, theme |
| **Power** | Daily users | Spotlight, quick open, replace, move blocks, back and forward, go to heading |
| **Pro** | Heavy keyboard users | Block selection mode, table cell selection, replace across notes, find in selection, Spotlight action keys, expand selection, reveal in Finder/Explorer |

5. **Discoverable.** Tooltips show each shortcut. Spotlight lists the shortcut next to every command, so using it teaches the key. <kbd>Mod</kbd>+<kbd>/</kbd> opens a cheat sheet that can be searched and filtered by layer. The first-run experience teaches exactly one: <kbd>Mod</kbd>+<kbd>/</kbd> for Spotlight.
6. **Customizable (P1).** A `keybindings.json` file (per device, or synced in `private/.focus-notes/`, D-46) can override any binding. It warns on conflicts, can reset everything, and shows the effective binding in Spotlight.

## Platforms

The keymap supports as many platforms as possible ([D-19](../plan/decisions.md)): **macOS**, **Windows**, **Linux**, and **iPadOS and iOS with a hardware keyboard** (the web build in Safari).

| Symbol | macOS, iPadOS, iOS | Windows, Linux |
| --- | --- | --- |
| **Mod** | <kbd>⌘</kbd> Command | <kbd>Ctrl</kbd> |
| **Alt** | <kbd>⌥</kbd> Option | <kbd>Alt</kbd> |
| **Shift** | <kbd>⇧</kbd> | <kbd>Shift</kbd> |
| **Ctrl** (only where it says so) | <kbd>⌃</kbd> Control | <kbd>Ctrl</kbd> |

Everything the app shows (tooltips, Spotlight, the cheat sheet, the macOS menu bar) uses the right symbols for the platform: `⌥⌘F` on Apple, `Ctrl+H` on Windows.

### Platform rules

- **Apple: never bind <kbd>⌥</kbd>+letter on its own.** Option+letter types characters (`⌥E` starts an accent), so Option is only used together with <kbd>⌘</kbd>.
- **Apple: keep the Emacs-style text keys.** <kbd>⌃A</kbd>, <kbd>⌃E</kbd>, <kbd>⌃K</kbd>, <kbd>⌃N</kbd>, <kbd>⌃P</kbd>, <kbd>⌃F</kbd>, <kbd>⌃B</kbd>, <kbd>⌃D</kbd>, <kbd>⌃H</kbd>, <kbd>⌃T</kbd> keep their standard macOS meanings in the editor, so the app doesn't bind <kbd>⌃</kbd>+letter on Apple.
- **Apple: keep the system shortcuts.** <kbd>⌘H</kbd> hides, <kbd>⌘M</kbd> minimizes, <kbd>⌘Q</kbd> quits, <kbd>⌘`</kbd> cycles windows, and <kbd>⌃⌘F</kbd> toggles full screen. <kbd>⌘Space</kbd> belongs to macOS Spotlight and is never used.
- **Windows: never take AltGr characters.** On many keyboard layouts <kbd>Ctrl</kbd>+<kbd>Alt</kbd> is the same as AltGr (on a German layout, AltGr+7 types `{`). If a <kbd>Ctrl</kbd>+<kbd>Alt</kbd> combination produces a character on the user's layout, the character wins and the shortcut doesn't run.
- **Windows: follow common function keys.** <kbd>F2</kbd> renames, <kbd>F3</kbd> finds the next match, <kbd>F11</kbd> is full screen, <kbd>F10</kbd> focuses the toolbar, <kbd>Alt</kbd>+<kbd>F4</kbd> closes the window.
- **Never bind OS-reserved keys:** <kbd>⌘Tab</kbd>, <kbd>⌘Space</kbd>, <kbd>Alt+Tab</kbd>, <kbd>Win</kbd> combinations, <kbd>Ctrl+Alt+Del</kbd>, and <kbd>Ctrl+Alt+T</kbd> (opens a terminal on Ubuntu).
- **Web build: work around browser-reserved keys.** Browsers don't let pages use <kbd>Mod</kbd>+<kbd>N</kbd>, <kbd>Mod</kbd>+<kbd>T</kbd>, <kbd>Mod</kbd>+<kbd>W</kbd>, their <kbd>Shift</kbd> versions, or <kbd>Mod</kbd>+<kbd>Tab</kbd>. The *Web* column gives the substitute, and every such command is also in Spotlight.
- **iPadOS and iOS.** The <kbd>⌘</kbd> bindings match macOS. Safari keeps its tab and window keys, so the web substitutes apply. Holding <kbd>⌘</kbd> only shows the system shortcut overlay for native apps, so <kbd>⌘</kbd>+<kbd>/</kbd> (the app's cheat sheet) fills that role. Bindings Safari reserves are found and documented in the M1 browser test pass.

### Input rules

- **Layout-aware.** Letters match the character the key produces (`event.key`), so <kbd>Mod</kbd>+<kbd>Z</kbd> follows the Z on AZERTY and Dvorak keyboards. On non-Latin layouts (for example Cyrillic or Greek), letters fall back to the physical key (`event.code`). Shortcuts tied to key position, like <kbd>Mod</kbd>+<kbd>[</kbd>, use the physical key.
- **Safe while composing.** No shortcut runs during IME composition (`isComposing`), so Japanese, Chinese, and Korean input is never interrupted.
- **Physical keys for punctuation and digits.** <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> types `?` on a US keyboard, so keys whose character changes with <kbd>Shift</kbd> or the layout also match by position. The character always wins first, and <kbd>Ctrl</kbd>+<kbd>Alt</kbd> never falls back to position on Windows and Linux (AltGr).
- **Fast sequences.** A shortcut pressed right after moving the selection acts on the new selection, even from macros and text expanders: the editor reads the selection before running the command.
- **Defined once, resolved once.** Keys live in the command registry. The editor's keymap, menus, tooltips, and the cheat sheet all read them from there, so they can't disagree. App keys are resolved before the editor sees the key, so a key does the same thing wherever focus is: on a German layout <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>7</kbd> types `/`, so it opens the cheat sheet everywhere rather than making a numbered list only inside the note.
- **No single-character shortcuts while typing.** Single letters work as shortcuts only in list contexts (Files panel type-ahead), which follows WCAG 2.1.4 (character key shortcuts).

## App and window

| Action | macOS / iPadOS | Windows / Linux | Web substitute | Layer | Precedent |
| --- | --- | --- | --- | --- | --- |
| Open Spotlight | <kbd>⌘/</kbd> | <kbd>Ctrl+/</kbd> | | Power | Owner decision (D-16) |
| Spotlight: commands only | <kbd>⇧⌘P</kbd> | <kbd>Ctrl+Shift+P</kbd> |  | Power | VS Code |
| Quick open a note | <kbd>⌘P</kbd> | <kbd>Ctrl+P</kbd> |  | Power | VS Code |
| Open… (Files panel) | <kbd>⌘O</kbd> | <kbd>Ctrl+O</kbd> |  | Basic | Universal |
| New note | <kbd>⌘N</kbd> | <kbd>Ctrl+N</kbd> | <kbd>⌃⌥N</kbd> / <kbd>Ctrl+Alt+N</kbd> | Basic | Universal |
| New window (desktop) | <kbd>⇧⌘N</kbd> | <kbd>Ctrl+Shift+N</kbd> | Not available | Power | VS Code |
| Save to cloud (write, commit, push) | <kbd>⇧⌘S</kbd> or <kbd>⌘S</kbd> | <kbd>Ctrl+Shift+S</kbd> or <kbd>Ctrl+S</kbd> |  | Basic | Universal (<kbd>⌘S</kbd>); <kbd>⇧⌘S</kbd> is free, as there's no Save As (D-132) |
| Close note / window | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> | Not available | Basic | Universal |
| Reopen closed note | <kbd>⇧⌘T</kbd> | <kbd>Ctrl+Shift+T</kbd> | Spotlight | Power | Browsers, VS Code |
| Back / forward between notes | <kbd>⌘[</kbd> / <kbd>⌘]</kbd> | <kbd>Alt+←</kbd> / <kbd>Alt+→</kbd> |  | Power | Notion, browsers, Finder |
| Open the trigger toolbar | <kbd>⌘.</kbd> | <kbd>Ctrl+.</kbd> or <kbd>F10</kbd> |  | Writer | Windows (F10 menu) |
| Settings | <kbd>⌘,</kbd> | <kbd>Ctrl+,</kbd> |  | Basic | Universal |
| Keyboard shortcut cheat sheet | <kbd>⇧⌘/</kbd> (⌘?) | <kbd>Ctrl+Shift+/</kbd> (Ctrl+?) | | Writer | GitHub, Gmail (<kbd>?</kbd>) |
| Toggle focus mode | <kbd>⇧⌘D</kbd> or <kbd>F8</kbd> | <kbd>Ctrl+Shift+D</kbd> or <kbd>F8</kbd> |  | Writer | Typora (F8) |
| Toggle light / dark | <kbd>⇧⌘L</kbd> | <kbd>Ctrl+Shift+L</kbd> | Spotlight if the browser keeps it | Writer | No common standard |
| Larger / smaller / reset font size | <kbd>⌘=</kbd> / <kbd>⌘-</kbd> / <kbd>⌘0</kbd>, or pinch | <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> / <kbd>Ctrl+0</kbd>, or <kbd>Ctrl</kbd>+wheel or pinch |  | Writer | Browsers, VS Code ([D-130](../plan/decisions.md)) |
| Full screen | <kbd>⌃⌘F</kbd> | <kbd>F11</kbd> | Toolbar ⋯ (Fullscreen API) | Writer | macOS, Windows |
| Minimize | <kbd>⌘M</kbd> | <kbd>Win+↓</kbd> (system) |  | Basic | OS |
| Window menu: Restore, Move, Size, Minimize, Maximize, Snap left and right, Close |  | <kbd>Alt+Space</kbd> (the app's own, D-104) |  | Basic | Windows |
| Hide app | <kbd>⌘H</kbd> |  |  | Basic | macOS |
| Cycle windows | <kbd>⌘`</kbd> |  |  | Power | macOS |
| Quit | <kbd>⌘Q</kbd> | <kbd>Alt+F4</kbd> (<kbd>Ctrl+Q</kbd> on Linux) |  | Basic | OS |

As built (WP-4.4, [D-115](../plan/decisions.md)): back and forward step along the last 50 notes opened, as a browser does; opening a note drops the ones ahead. *New window*, *Reopen closed note*, and *Close note / window* are planned with multiple windows (WP-8.5): their keys are reserved and not bound, and until then <kbd>Alt+F4</kbd> and the macOS menu bar's Close close the window. Minimize, Hide app, Cycle windows, and Quit are the system's keys; the window menu is the desktop shell's.

## Everyday editing

The standard OS text keys work as expected and aren't listed one by one: moving and selecting by character, word, line, and document with the arrow keys and <kbd>Shift</kbd>; <kbd>⌥⌫</kbd> / <kbd>Ctrl+Backspace</kbd> to delete a word; <kbd>⌘⌫</kbd> to delete to the start of the line on macOS.

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Undo / redo | <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> | <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> or <kbd>Ctrl+Shift+Z</kbd> | Basic | Universal |
| Cut / copy / paste | <kbd>⌘X</kbd> / <kbd>⌘C</kbd> / <kbd>⌘V</kbd> | <kbd>Ctrl+X</kbd> / <kbd>Ctrl+C</kbd> / <kbd>Ctrl+V</kbd> | Basic | Universal |
| Go to the start / end of the note | <kbd>⌘↑</kbd> / <kbd>⌘↓</kbd> | <kbd>Ctrl+Home</kbd> / <kbd>Ctrl+End</kbd> | Basic | Universal |
| Paste as plain text | <kbd>⇧⌘V</kbd> (also <kbd>⌥⇧⌘V</kbd>) | <kbd>Ctrl+Shift+V</kbd> | Writer | Google Docs, macOS |
| Select all (once: the block; twice: the note) | <kbd>⌘A</kbd> | <kbd>Ctrl+A</kbd> | Basic | Notion |
| Expand / shrink selection (word → sentence → block → note) | <kbd>⌃⇧⌘→</kbd> / <kbd>⌃⇧⌘←</kbd> | <kbd>Shift+Alt+→</kbd> / <kbd>Shift+Alt+←</kbd> | Pro (P1) | VS Code |
| Copy the note as Markdown (desktop) | <kbd>⌥⇧⌘C</kbd> | <kbd>Ctrl+Alt+Shift+C</kbd> | Pro | No common standard |

**Expand and shrink selection (Pro).** Each press of expand grows the selection one step, through the word at the caret, its sentence, its block (the list item or the top-level block, as the block keys count them), and the whole note. A step that would select what's already selected is skipped. Shrink goes back through the steps expand took, and with none to go back through it does nothing. Moving the caret or typing forgets the steps. Selections stay inside a table cell until the cell is selected, then stop there (D-160).

## Inline formatting

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Bold | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> | Basic | Universal |
| Italic | <kbd>⌘I</kbd> | <kbd>Ctrl+I</kbd> | Basic | Universal |
| Strikethrough | <kbd>⇧⌘X</kbd> | <kbd>Ctrl+Shift+X</kbd> | Writer | Slack, Teams |
| Inline code | <kbd>⌘E</kbd> | <kbd>Ctrl+E</kbd> | Writer | Notion, Tiptap |
| Add or edit link | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> | Writer | Notion, Google Docs, Word |
| Clear formatting | <kbd>⌘\</kbd> | <kbd>Ctrl+\</kbd> | Writer | Google Docs, Notion |
| Move focus into the [formatting toolbar](../design/components/text-formatting.html) | <kbd>⌥F10</kbd> | <kbd>Alt+F10</kbd> | Power | Web rich-text editors |
| Leave the formatting toolbar, back to the text with the selection kept | <kbd>Esc</kbd> (in the toolbar) | <kbd>Esc</kbd> (in the toolbar) | Power | Web rich-text editors |
| Close the link editor, keeping the selection | <kbd>Esc</kbd> (in the editor) | <kbd>Esc</kbd> (in the editor) | Writer | Notion, Google Docs |
| Underline | <kbd>⌘U</kbd> shows a one-time hint that Markdown has no underline | <kbd>Ctrl+U</kbd>, same | Basic | Not supported ([D-12](../plan/decisions.md)) |

Markdown typing shortcuts (`**bold**`, `# `, `- `, …) are listed on [Editing](editing.md#blocks-and-their-markdown).

## Blocks

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Insert block menu | <kbd>/</kbd> | <kbd>/</kbd> | Writer | Notion, Loop |
| Turn into paragraph | <kbd>⌥⌘0</kbd> | <kbd>Ctrl+Alt+0</kbd> | Writer | Google Docs, Notion |
| Turn into heading 1 / 2 / 3 | <kbd>⌥⌘1</kbd> / <kbd>⌥⌘2</kbd> / <kbd>⌥⌘3</kbd> | <kbd>Ctrl+Alt+1</kbd> / <kbd>2</kbd> / <kbd>3</kbd> | Writer | Google Docs, Notion |
| Bulleted / numbered / task list | <kbd>⇧⌘8</kbd> / <kbd>⇧⌘7</kbd> / <kbd>⇧⌘9</kbd> | <kbd>Ctrl+Shift+8</kbd> / <kbd>7</kbd> / <kbd>9</kbd> | Writer | Google Docs |
| Quote | <kbd>⇧⌘B</kbd> | <kbd>Ctrl+Shift+B</kbd> | Writer | Tiptap |
| Code block | <kbd>⌥⌘C</kbd> | <kbd>Ctrl+Alt+C</kbd> | Writer | Tiptap |
| Check / uncheck a task | <kbd>⌘Enter</kbd> | <kbd>Ctrl+Enter</kbd> | Writer | Notion |
| Indent / outdent list item | <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> | <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Basic | Universal |
| Line break within a block | <kbd>⇧Enter</kbd> | <kbd>Shift+Enter</kbd> | Basic | Universal |
| Move block up / down | <kbd>⇧⌘↑</kbd> / <kbd>⇧⌘↓</kbd> | <kbd>Ctrl+Shift+↑</kbd> / <kbd>↓</kbd>, also <kbd>Alt+↑</kbd> / <kbd>↓</kbd> | Power | Notion; VS Code (Alt) |
| Duplicate block | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> | Power | Notion |
| Delete block | <kbd>⇧⌘K</kbd> | <kbd>Ctrl+Shift+K</kbd> | Power | VS Code (delete line) |
| Go to heading in this note | <kbd>⇧⌘O</kbd> | <kbd>Ctrl+Shift+O</kbd> | Power | VS Code (go to symbol) |
| Block selection mode | <kbd>Esc</kbd> | <kbd>Esc</kbd> | Pro | Notion |
| Block menu (the block handle's), outside a table | <kbd>⇧F10</kbd> or the Menu key | <kbd>Shift+F10</kbd> or the Menu key | Pro | Windows context menus |

As built (WP-4.4, [D-115](../plan/decisions.md)): a *block* is the list item with the caret, or else the note's block (a paragraph, heading, quote, code block, list, or table). Moving swaps it with its neighbour and keeps the caret in it, Duplicate puts the copy below with the caret in it, and deleting a list's last item deletes the list. In a table the row keys come first. <kbd>Mod</kbd>+<kbd>U</kbd> shows its Markdown hint once per session.

**Block selection mode (Pro).** <kbd>Esc</kbd> while typing (with no menu, toolbar, or table cell to close first) selects the current block, as the block keys count blocks. <kbd>↑</kbd>/<kbd>↓</kbd> moves between blocks and <kbd>Shift</kbd>+arrows extend the selection. <kbd>Mod</kbd>+<kbd>C</kbd> copies the selected blocks as Markdown, <kbd>Backspace</kbd> or <kbd>Delete</kbd> deletes them, the move, duplicate, and turn-into keys work on the whole selection, <kbd>Shift</kbd>+<kbd>F10</kbd> (or the Menu key) opens the [block menu](../design/components/text-formatting.html#block-handle), and <kbd>Enter</kbd> returns to typing at the start of the first selected block. A second <kbd>Esc</kbd> returns to typing where the caret was. The selected blocks show the selection color, and the mode is announced ("Block selected", "3 blocks selected"). Typing a character leaves the mode without replacing the blocks, so nothing is lost by accident (D-160). *Planned, not built in WP-8.1:* <kbd>Esc</kbd> in the note is a quiet key today (it hides the formatting toolbar, closes the slash menu, and does nothing else), and many flows press it on the way back to typing, so taking it for block selection needs its own change with every editor journey re-run. Until then the block keys act on the caret's block, and <kbd>Shift</kbd>+<kbd>F10</kbd> opens the block handle's menu for it ([D-160](../plan/decisions.md)).

**Slash menu.** Typing <kbd>/</kbd> at the start of a block or after a space opens it (EDT-06). While it shows, focus stays in the note: <kbd>↑</kbd>/<kbd>↓</kbd> move through the rows (and wrap), <kbd>Enter</kbd> or <kbd>Tab</kbd> inserts the active row, and <kbd>Esc</kbd> closes it and keeps the typed text. With no row matching, <kbd>Enter</kbd> and <kbd>Tab</kbd> do what they always do. The cheat sheet lists it as *Insert a block (slash menu)*. See [Text formatting → Slash menu](../design/components/text-formatting.html#slash-menu).

## Tables

These apply when the caret is in a table and take priority over the block bindings. In the build they're the `table` key scope: outside a table each key does what it does elsewhere (<kbd>Mod</kbd>+<kbd>Enter</kbd> checks a task, <kbd>Tab</kbd> indents a list item).

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Next / previous cell (<kbd>Tab</kbd> in the last cell adds a row) | <kbd>Tab</kbd> / <kbd>⇧Tab</kbd> | <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | Basic | Word, Notion |
| Cell below / above (<kbd>Enter</kbd> in the last row leaves the table onto a new line) | <kbd>Enter</kbd> / <kbd>⇧Enter</kbd> | <kbd>Enter</kbd> / <kbd>Shift+Enter</kbd> | Writer | Spreadsheets |
| Add row below / above | <kbd>⌘Enter</kbd> / <kbd>⇧⌘Enter</kbd> | <kbd>Ctrl+Enter</kbd> / <kbd>Ctrl+Shift+Enter</kbd> | Power | VS Code (insert line) |
| Move row up / down | <kbd>⇧⌘↑</kbd> / <kbd>⇧⌘↓</kbd> | <kbd>Ctrl+Shift+↑</kbd> / <kbd>↓</kbd> | Power | Same as moving a block |
| Delete row | <kbd>⇧⌘K</kbd> | <kbd>Ctrl+Shift+K</kbd> | Power | Same as deleting a block |
| Cell selection mode (<kbd>Esc</kbd> again goes back to typing) | <kbd>Esc</kbd> | <kbd>Esc</kbd> | Pro | Spreadsheets |
| Cell menu: every row and column action | <kbd>⇧F10</kbd> or the Menu key | <kbd>Shift+F10</kbd> or the Menu key | Pro | Windows context menus |

**Cell selection mode (Pro).** <kbd>Esc</kbd> in a cell selects the cell. Arrow keys move between cells and <kbd>Shift</kbd>+arrows select a range. <kbd>Enter</kbd> or <kbd>Esc</kbd> goes back to typing in the active cell. <kbd>Backspace</kbd> clears the selected cells. <kbd>Mod</kbd>+<kbd>C</kbd> copies them as tab-separated text (for spreadsheets), HTML (for documents), and a Markdown table; <kbd>Mod</kbd>+<kbd>X</kbd> cuts. **The cell menu** (<kbd>Shift</kbd>+<kbd>F10</kbd>, the Menu key, or a right-click) holds Copy, Cut, and Clear cells, inserting rows above and below and columns left and right, moving the row and the column, Align, Duplicate row, selecting the row, column, or table, and deleting rows, columns, or the table, so every handle action has a keyboard path (D-96). Column inserts, moves, deletes, and alignment are on the column handle, in the cell menu, and in Spotlight (`> Insert column right`, M4). They don't get shortcuts because the usual candidates clash with browser tab switching and with OS screen-rotation keys.

## Find and replace

Details are on [Find and replace](find-and-replace.md).

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Find in note | <kbd>⌘F</kbd> | <kbd>Ctrl+F</kbd> | Basic | Universal |
| Next / previous match | <kbd>Enter</kbd> / <kbd>⇧Enter</kbd>, or <kbd>⌘G</kbd> / <kbd>⇧⌘G</kbd> | <kbd>Enter</kbd> / <kbd>Shift+Enter</kbd>, or <kbd>F3</kbd> / <kbd>Shift+F3</kbd> | Basic | macOS, Windows |
| Replace in note | <kbd>⌥⌘F</kbd> | <kbd>Ctrl+H</kbd> | Power | VS Code, Word |
| Replace current (in the replace field) | <kbd>Enter</kbd> | <kbd>Enter</kbd> | Power | VS Code |
| Replace all | <kbd>⌘Enter</kbd> | <kbd>Ctrl+Alt+Enter</kbd> | Power | VS Code |
| Match case / whole word / regex | <kbd>⌥⌘C</kbd> / <kbd>⌥⌘W</kbd> / <kbd>⌥⌘R</kbd> | <kbd>Alt+C</kbd> / <kbd>Alt+W</kbd> / <kbd>Alt+R</kbd> | Pro | VS Code |
| Find in selection | <kbd>⌥⌘L</kbd> | <kbd>Alt+L</kbd> | Pro (P1) | VS Code |
| Find in all notes | <kbd>⇧⌘F</kbd> | <kbd>Ctrl+Shift+F</kbd> | Power | VS Code |
| Replace in all notes | <kbd>⇧⌘H</kbd> | <kbd>Ctrl+Shift+H</kbd> | Pro (P1) | VS Code |
| Next / previous result across notes | <kbd>F4</kbd> / <kbd>⇧F4</kbd> | <kbd>F4</kbd> / <kbd>Shift+F4</kbd> | Pro | VS Code |
| Close the find bar | <kbd>Esc</kbd> | <kbd>Esc</kbd> | Basic | Universal |

In *Find in all notes*, focus stays in its field: <kbd>↓</kbd> and <kbd>↑</kbd> move through the matching lines, <kbd>Enter</kbd> opens the highlighted one at its match with the find bar on it, the match case, whole word, and regex keys work anywhere in the sheet, and <kbd>Esc</kbd> clears the field, then closes the sheet ([D-110](../plan/decisions.md)).

## Spotlight

These apply while [Spotlight](spotlight.html) is open.

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Move through results | <kbd>↑</kbd> / <kbd>↓</kbd> (also <kbd>⌃P</kbd> / <kbd>⌃N</kbd>) | <kbd>↑</kbd> / <kbd>↓</kbd> | Basic | macOS Spotlight, Emacs |
| Run the default action | <kbd>Enter</kbd> | <kbd>Enter</kbd> | Basic | Universal |
| Alternative action (for example, open in a new window) | <kbd>⌘Enter</kbd> | <kbd>Ctrl+Enter</kbd> | Power | macOS Spotlight, Raycast |
| Show the actions for the selected result | <kbd>→</kbd> or <kbd>⌘K</kbd> | <kbd>→</kbd> or <kbd>Ctrl+K</kbd> | Power | Raycast |
| Back out of the action list | <kbd>←</kbd> or <kbd>Esc</kbd> | <kbd>←</kbd> or <kbd>Esc</kbd> | Power | Raycast |
| Back to All from another mode, in an empty field | <kbd>⌫</kbd> | <kbd>Backspace</kbd> | Power | Raycast, VS Code |
| Run the nth result | <kbd>⌘1</kbd> to <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> to <kbd>Ctrl+9</kbd> | Pro | Alfred |
| Copy link to the selected note | <kbd>⇧⌘C</kbd> | <kbd>Ctrl+Shift+C</kbd> | Pro | Raycast |
| Jump between result groups | <kbd>⌥↓</kbd> / <kbd>⌥↑</kbd> | <kbd>Alt+↓</kbd> / <kbd>Alt+↑</kbd> | Pro | No common standard |
| Close | <kbd>Esc</kbd> | <kbd>Esc</kbd> | Basic | Universal |

As built (WP-4.2, D-109): these keys are the `spotlightField` key scope. <kbd>→</kbd> shows the actions only with the caret at the end of the field's text, so elsewhere it still moves the caret; <kbd>←</kbd>, <kbd>Esc</kbd>, and <kbd>Backspace</kbd> act only when there's something for them to do (an action list to leave, another mode to leave) and otherwise reach the field. The Pro keys are built (WP-8.1, [D-160](../plan/decisions.md)): <kbd>Mod</kbd>+<kbd>1</kbd> to <kbd>9</kbd> run the nth result shown (counting the results that can run, the top hit first), <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> copies the selected note's or heading's link and closes Spotlight, and <kbd>Alt</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd> moves to the first result of the next group, or to the first of its own group and then the group above. Each works only when there's something for it to do, and otherwise reaches the field; none work in an action list. <kbd>⌃P</kbd> / <kbd>⌃N</kbd> on Apple aren't bound yet ([D-115](../plan/decisions.md)). The browser uses the same keys: <kbd>Ctrl</kbd>+<kbd>/</kbd>, <kbd>Ctrl</kbd>+<kbd>P</kbd> (quick open, in place of printing), <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>.

## Files panel

The keys follow each platform's file manager (Finder or Explorer), because that's where people's habits come from.

| Action | macOS / iPadOS | Windows / Linux | Layer | Precedent |
| --- | --- | --- | --- | --- |
| Move / expand / collapse | <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>→</kbd> / <kbd>←</kbd> | <kbd>↑</kbd> <kbd>↓</kbd> / <kbd>→</kbd> / <kbd>←</kbd> | Basic | Finder, Explorer |
| Open | <kbd>⌘↓</kbd> or <kbd>⌘O</kbd> | <kbd>Enter</kbd> | Basic | Finder, Explorer |
| Rename | <kbd>Enter</kbd> | <kbd>F2</kbd> | Basic | Finder, Explorer |
| Preview without opening | <kbd>Space</kbd> | <kbd>Space</kbd> | Pro | Finder Quick Look |
| Jump to an item by typing its name | Type letters | Type letters | Basic | Finder, Explorer |
| Select a range / add or remove one | <kbd>Shift</kbd>+<kbd>↑</kbd> <kbd>↓</kbd> or <kbd>Shift</kbd>+click / <kbd>⌘</kbd>+click | <kbd>Shift</kbd>+<kbd>↑</kbd> <kbd>↓</kbd> or <kbd>Shift</kbd>+click / <kbd>Ctrl</kbd>+click, <kbd>Ctrl</kbd>+<kbd>Space</kbd> | Basic | Finder, Explorer |
| Select everything shown | <kbd>⌘A</kbd> | <kbd>Ctrl+A</kbd> | Basic | Finder, Explorer |
| New note in this folder / new folder | <kbd>⌘N</kbd> / <kbd>⇧⌘N</kbd> | <kbd>Ctrl+N</kbd> / <kbd>Ctrl+Shift+N</kbd> | Writer | Finder, Explorer |
| Delete (with confirmation and Undo) | <kbd>⌘⌫</kbd> | <kbd>Delete</kbd> | Basic | Finder, Explorer |
| Move: cut, then paste in the destination | <kbd>⌘C</kbd> then <kbd>⌥⌘V</kbd> (also <kbd>⌘X</kbd> / <kbd>⌘V</kbd>) | <kbd>Ctrl+X</kbd> / <kbd>Ctrl+V</kbd> | Power | Finder, Explorer |
| Move to… picker | <kbd>⇧⌘M</kbd> | <kbd>Ctrl+Shift+M</kbd> | Power | No common standard |
| Show the current note in the panel | <kbd>⇧⌘E</kbd> | <kbd>Ctrl+Shift+E</kbd> | Power | VS Code |
| Show in Finder / Explorer (desktop) | <kbd>⌥⌘R</kbd> | <kbd>Shift+Alt+R</kbd> | Pro | VS Code |

The tree's keys work while focus is in the tree, and New folder and Move to… anywhere in the panel; in a row's name field, <kbd>Enter</kbd> saves the name and <kbd>Esc</kbd> cancels, and the tree's other keys (<kbd>Delete</kbd>, <kbd>F2</kbd>, <kbd>Ctrl+A</kbd>) edit the text instead. Browsers keep <kbd>Ctrl+Shift+N</kbd>, so New folder is <kbd>Ctrl+Alt+Shift+N</kbd> in the web app. Preview, cut and paste, and Show in Finder / Explorer aren't built yet ([Files → What's built](../design/views/files.html#whats-built)).

## Toolbar and menus

| Action | Keys |
| --- | --- |
| Open the toolbar | <kbd>Mod</kbd>+<kbd>.</kbd> (and <kbd>F10</kbd> on Windows and Linux) |
| Move between toolbar actions | <kbd>←</kbd> / <kbd>→</kbd>. <kbd>Home</kbd> / <kbd>End</kbd> jump to the first or last |
| Open ⋯ (more) | <kbd>→</kbd> to the last action, then <kbd>Enter</kbd> or <kbd>↓</kbd> |
| Run an action | <kbd>Enter</kbd> or <kbd>Space</kbd> |
| Close and return to the caret | <kbd>Esc</kbd> |

On macOS the desktop app also has a full native **menu bar** (File, Edit, Format, View, Go, Window, Help) that lists every command with its shortcut. That gives macOS users the standard Help menu search for free. The menu bar sits at the top of the screen, so the window itself stays blank. It's generated from the command registry, so its keys are this page's keys ([Desktop app → macOS menu bar](desktop-app.html#macos-menu-bar), [D-106](../plan/decisions.md)). Keys of one focused control (the find bar's options, a table's cells, the Files tree) aren't in it; they're in the cheat sheet. Each key runs its command once, whether the page or the menu gets it first.

## Conflict register

These are the deliberate trade-offs. Each one is the choice the most popular precedent made.

| Keys | Meaning here | Gives up | Why |
| --- | --- | --- | --- |
| <kbd>Mod</kbd>+<kbd>/</kbd> | Spotlight | The key often used for a cheat sheet, so the cheat sheet moves to <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd> | Owner decision ([D-16](../plan/decisions.md)). <kbd>Mod</kbd>+<kbd>K</kbd> stays the universal link key. |
| <kbd>Mod</kbd>+<kbd>/</kbd> on layouts where <kbd>/</kbd> needs <kbd>Shift</kbd> (for example German, <kbd>Shift</kbd>+<kbd>7</kbd>) | Spotlight wins | The numbered-list key (<kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>7</kbd>) on those layouts | Shortcuts match the character produced. Numbered lists stay available through `1. `, the formatting toolbar, and Spotlight. <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens Spotlight on every layout. |
| <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Find in all notes | Focus mode on this key | VS Code convention. Focus moved to <kbd>Mod</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> / <kbd>F8</kbd> ([D-17](../plan/decisions.md)). |
| <kbd>⌘E</kbd> (macOS) | Inline code | macOS "use selection for find" | Notion and Tiptap. The find bar fills in the selected text anyway. |
| <kbd>Mod</kbd>+<kbd>D</kbd> | Duplicate block | The browser's bookmark key (web) | Notion. |
| <kbd>Mod</kbd>+<kbd>P</kbd> | Quick open | The browser's print key | VS Code, Notion. Printing is in ⋯ and Spotlight. |
| <kbd>⇧⌘↑</kbd> / <kbd>⇧⌘↓</kbd> (macOS) | Move block | Select to start or end of the note | Notion. <kbd>⌘A</kbd> still selects the whole note. |
| <kbd>Mod</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Content font size | Whole-page zoom | VS Code. UI scale is a separate setting. |
| <kbd>Ctrl</kbd>+wheel, trackpad pinch | Content font size, one step a notch | Whole-page zoom | Browsers. The page never zooms; the text size is the only zoom. <kbd>⌘</kbd>+wheel on macOS scrolls, as it does everywhere there ([D-130](../plan/decisions.md)). |

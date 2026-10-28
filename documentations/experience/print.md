# Print

Print the open note on paper, or to a PDF, through the system's own print dialog. Focus Notes lays the note out for paper; the operating system and the printer's driver keep everything else.

> [!NOTE]
> **TL;DR.** ⋯ → *Print…* (also the File menu and Spotlight) opens the system's print dialog with the note laid out for paper: its text on the Paper palette at 12 pt, 0.75 in margins and no front matter. Page numbers (`n / N` on every page) are off until *Page numbers when printing*, right after *Print…*, is turned on; the choice is kept on the device. Pages break on their own, never just after a heading or inside a table row or list item; a line with only `<!-- pagebreak -->` starts a new page where the writer wants one. Printer, paper, orientation, scale, copies, page ranges and *Save as PDF* stay with the system. There's no shortcut, since <kbd>Mod</kbd>+<kbd>P</kbd> is Quick open. Covers SHR-12 in the [requirements](../product/requirements.md); the decisions are D-230 and D-231.

## What people expect

Printing a note is occasional: a page to read away from the screen, something to hand over or file, or a PDF to send. People expect it to look like a clean document, not like the app's window, and they expect the system's dialog they already know. The benchmark (October 2026) covers 22 apps, from the vendors' help and their issue trackers and forums, with Word and Google Docs as the baseline.

| App | Print or only PDF | Dark theme on paper | Page breaks | Page numbers |
| --- | --- | --- | --- | --- |
| **Typora** | Both; <kbd>Mod</kbd>+<kbd>P</kbd> is Quick open | Light (Windows, Linux) | The `page-break-after` `div`; optional break before top headings | Header and footer fields (`${pageNo}`, `${pageCount}`), off by default |
| **Obsidian** | *Export to PDF* only | Always light | None of its own; the `div` works | None |
| **iA Writer** | Both | Not documented | `+++` | Through a template's footer |
| **Ulysses** | Both, through export | Separate export styles | In its export styles | Off by default; no total |
| **Bear**, **Apple Notes**, **Simplenote** | Both (Simplenote: print only) | Apple Notes prints light | None | The system's only |
| **MarkText**, **Joplin** | Both | Light | The `div` | None; MarkText's most-voted open request for 6 years |
| **Notion**, **Craft** | Export only | Light (Craft: a toggle) | Craft: `===`; Notion: none | Craft: a toggle, off by default |
| **Marked 2** | Both, paginated | — | `<!--BREAK-->`, optionally every rule | `%page`, `%total`, `%title`, `%date` in four places |
| **VS Code's Markdown PDF** | Export only | Its own style | CSS only | On by default: `n / N` in the footer |
| **OneNote**, **Notepad** | Both | OneNote prints light, "to save ink" | None | OneNote: yes; Notepad: header and footer codes, on |
| **Word**, **Google Docs** | Print, through the system | — | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Header and footer, "Page X of Y", often skipping the first page |

**What this says.**

- **Table stakes:** the note prints as it reads, not as Markdown; a dark theme prints light (almost every app forces it, several citing wasted ink); and paper, margins, copies and ranges are the system's.
- **Wanted and often missing:** choosing where a page breaks, and page numbers. They're the two requests that come up most and stay open longest (MarkText, Obsidian, StackEdit). The portable way to mark a break is the HTML `page-break-after` `div` that Obsidian, Joplin, Bear and MarkText users already write, so Focus Notes reads it, and `<!-- pagebreak -->` as a shorter form that other apps hide.
- **Page numbers' default:** apps with a setting leave it off; Markdown PDF and Notepad have them on. Focus Notes follows the apps with a setting: off by default, and `n / N` on every page once *Page numbers when printing* is on (D-231).
- **For writers who want more:** headers and footers with the title or date (Marked 2, Craft, iA Writer's templates), a break before every top heading (Typora), and widow and orphan control (Ulysses). Focus Notes keeps two lines on each side of a break without a setting; the rest is under [Not yet](#not-yet).

## How it works

1. ⋯ → *Print…* (or the File menu, or Spotlight's *Print…*). It's unavailable, saying why, when no note is open. To number the pages, turn on *Page numbers when printing* just below it first.
2. The app lays the note out on a hidden layer that only the printer sees, through the task tracker (*Preparing to print…* past 300 ms). The screen doesn't change.
3. The system's print dialog opens. The note's title names the job, so *Save as PDF* suggests it as the file's name.
4. Printing, saving or cancelling closes the dialog, and the layer goes away. A failure says "Couldn't print the note. Check the printer and try again."; cancelling says nothing.

On the web, the browser's print dialog does the same.

## The page

| Part | On paper |
| --- | --- |
| **Text** | The note's blocks as they read, without the editor's marks: headings, paragraphs, lists and tasks, quotes, code, tables and rules. Front matter never prints. |
| **Colors** | The Paper palette on white, whatever the theme on screen, so a dark theme doesn't print a black page. |
| **Size** | 12 pt (16 px) text, whatever the zoom on screen. |
| **Margins** | 0.75 in on every side (`cmp.printPage.margin`). The system's dialog can change them. |
| **Page numbers** | Off by default. With *Page numbers when printing* on, `n / N` in the bottom margin's center of every page, in the interface font and the muted text color. |
| **Long code** | Wraps instead of running off the page. |

## Page breaks

The pages flow on their own, with rules that keep them readable:

- never a break just after a heading, or inside one;
- never a break inside a table row, a list item or a quote's paragraph;
- at least two lines of a paragraph on each side of a break.

To start a new page at a place, put one of these on a line of its own:

```markdown
<!-- pagebreak -->

<div style="page-break-after: always"></div>
```

`<!-- page-break -->` and `break-before: page` or `break-after: page` work too, so notes written in Typora or Obsidian print the same way. On screen and on published pages the line is the note's own text, shown as written; only paper breaks there.

## Not yet

- Headers and footers with the note's title, the date or the path.
- A print preview of the app's own; the system's dialog shows one where it has one.
- Images, which notes don't show yet.
- PDF export with its own paper and margin settings (the system's *Save as PDF* covers most of it).
- Printing several notes or a folder at once.
- A break before every top heading (Typora's option).
- Page numbers on the web in Firefox and Safari, which don't draw page margin boxes; Chromium does from version 131.

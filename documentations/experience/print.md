# Print

Print the open note on paper, or to a PDF, through the system's own print dialog. Focus Notes lays the note out for paper; the operating system and the printer's driver keep everything else.

> [!NOTE]
> **TL;DR.** ⋯ → *Print…* (also the File menu and Spotlight) opens the system's print dialog with the note laid out for paper: its text on the Paper palette at 12 pt, 0.75 in margins, page numbers `n / N` from page 2, and no front matter. Pages break on their own, never just after a heading or inside a table row or list item; a line with only `<!-- pagebreak -->` starts a new page where the writer wants one. Printer, paper, orientation, scale, copies, page ranges and *Save as PDF* stay with the system. There's no shortcut, since <kbd>Mod</kbd>+<kbd>P</kbd> is Quick open. Covers SHR-12 in the [requirements](../product/requirements.md); the decision is D-230.

## What people expect

Printing a note is occasional: a page to read away from the screen, something to hand over or file, or a PDF to send. People expect it to look like a clean document, not like the app's window, and they expect the system's dialog they already know. A Markdown editor is benchmarked against the editors around it and against Word and Google Docs.

| Expectation | Markdown editors (Typora, Obsidian, iA Writer, Bear, VS Code) | Documents (Word, Google Docs) | Focus Notes |
| --- | --- | --- | --- |
| **Where to start** | File → Print or Export → PDF; Obsidian has only *Export to PDF* | File → Print, <kbd>Mod</kbd>+<kbd>P</kbd> | ⋯, File, Spotlight; no shortcut |
| **Printer, paper, copies, ranges** | The system's dialog; export dialogs add paper and margins | The system's dialog | The system's dialog |
| **Looks like a document** | A print style: no interface, often a theme's own | WYSIWYG | Paper palette, document type, no interface |
| **Page breaks where the writer wants** | An HTML `page-break-after` `div` (Typora, Obsidian, Markdown PDF); some offer a break before each top-level heading | <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | `<!-- pagebreak -->` or the same `div` |
| **Pages that break well** | Mostly the browser's defaults | Keep with next, widow and orphan control | No break after a heading or inside a row or list item; two lines each side |
| **Page numbers** | In some exports' header and footer settings (Typora, iA Writer templates, Markdown PDF); none in Obsidian's | Header and footer, often skipping the first page | `n / N` at the bottom, from page 2 |
| **Headers and footers** | Templates or export settings, where they exist | Full control | Not yet |

**What this says.** People expect to control *where* a break goes only now and then, for a section that should start on its own page; mostly they expect the pages to break well without asking. Page numbers matter once a note runs past one page, and they're expected without setting anything up. Everything about the paper and the printer belongs to the system, which already does it well.

## How it works

1. ⋯ → *Print…* (or the File menu, or Spotlight's *Print…*). It's unavailable, saying why, when no note is open.
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
| **Page numbers** | `n / N` in the bottom margin's center, in the interface font and the muted text color, from page 2. The first page stays clean. |
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

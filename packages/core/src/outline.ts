/**
 * How many top-level headings a note's Markdown has, for *Show contents* (UI-13, D-185): ATX headings
 * (`# Title`) and setext ones (a line underlined with `=` or `-`), outside fenced code. A heading in
 * a list item or a quote isn't a section of the note, as in the editor's minimap.
 */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
const BLOCK_START = /^ {0,3}(?:[-+*>]|\d+[.)])(?:[ \t]|$)|^ {0,3}#/;
/** A list item or a quote: what follows inside it (indented, or a lazy line) isn't top level. */
const CONTAINER = /^ {0,3}(?:>|(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$))/;

let lastText = "";
let lastCount = 0;

export function headingCount(markdown: string): number {
  if (markdown === lastText) return lastCount;
  let count = 0;
  let fence = "";
  let paragraph = false;
  let container = false;
  let blankBefore = true;
  for (const line of markdown.split(/\r?\n/)) {
    const open = FENCE.exec(line);
    if (fence) {
      if (open && open[1]![0] === fence[0] && open[1]!.length >= fence.length) fence = "";
      continue;
    }
    const blank = line.trim() === "";
    if (container) {
      if (blank || /^[ \t]/.test(line) || CONTAINER.test(line)) {
        blankBefore = blank;
        continue;
      }
      // A lazy continuation of the item's paragraph, unless a heading or a break interrupts it.
      if (!blankBefore && !ATX.test(line) && !SETEXT.test(line)) continue;
      container = false;
      paragraph = false;
    }
    blankBefore = blank;
    if (open) {
      fence = open[1]!;
      paragraph = false;
      continue;
    }
    if (CONTAINER.test(line)) {
      container = true;
      paragraph = false;
      continue;
    }
    if (ATX.test(line)) {
      count++;
      paragraph = false;
    } else if (paragraph && SETEXT.test(line)) {
      count++;
      paragraph = false;
    } else paragraph = line.trim() !== "" && !BLOCK_START.test(line) && !/^ {4}|^\t/.test(line);
  }
  lastText = markdown;
  lastCount = count;
  return count;
}

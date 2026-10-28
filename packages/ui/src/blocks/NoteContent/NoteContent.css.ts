import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// The same rules as the editor surface's content (EditorSurface.css.ts), on the same semantic tokens,
// so a published note reads exactly as it does on the canvas (DD-CMP-04).
const t = tokens.cmp.noteContent;

export const prose = style({
  fontFamily: t.font,
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
  color: t.text,
  overflowWrap: "break-word",
  minWidth: 0,
});

const p = (sel: string) => `${prose} ${sel}`;
// The paragraph gap: whole lines of the note's text, at least one (D-183).
const blockGap = `calc(${t.blockGapLines} * ${t.lineHeight} * 1em)`;
globalStyle(p("> * + *"), { marginTop: blockGap });
globalStyle(`:where(${prose}) :where(p)`, { margin: 0, whiteSpace: "pre-wrap" });
globalStyle(`:where(${prose}) :where(h1, h2, h3, h4, h5, h6)`, { margin: 0, fontFamily: t.headingFont, fontWeight: t.headingWeight, lineHeight: t.headingLineHeight });
// Spacing shows what belongs together (D-183): consecutive blocks are a paragraph gap apart; the block
// after a heading sits close under it, nested; and the space before a heading is the paragraph gap plus
// more the bigger the heading, so two paragraphs are never further apart than two headings. All in the
// note's em, so it scales with the text size. Each heading's margin is in its own em, so it's divided by
// its size to be in the note's. Nothing above the first block.
globalStyle(p("> :is(h1, h2, h3, h4, h5, h6) + *"), { marginTop: t.headingAfter });
const ramp = [[t.h[1], t.hBefore[1]], [t.h[2], t.hBefore[2]], [t.h[3], t.hBefore[3]], [t.h[4], t.hBefore[4]], [t.h[5], t.hBefore[5]], [t.h[6], t.hBefore[6]]] as const;
ramp.forEach(([size, before], i) => {
  globalStyle(p(`h${i + 1}`), { fontSize: `calc(${size} * 1em)` });
  globalStyle(p(`> * + h${i + 1}`), { marginTop: `calc((${t.blockGapLines} * ${t.lineHeight} + ${before}) * 1em / ${size})` });
});
globalStyle(`:where(${prose}) :where(ul, ol)`, { margin: 0, paddingInlineStart: t.space.l });
// Numbers are wider than bullets: an ordered list keeps "10." inside the column (D-111, inside its container).
globalStyle(`:where(${prose}) :where(ol)`, { paddingInlineStart: `calc(2 * ${t.space.l})` });
globalStyle(p("li > * + *"), { marginTop: t.space.s });
globalStyle(p("li + li"), { marginTop: t.listItemGap });
globalStyle(`:where(${prose}) :where(blockquote)`, { margin: 0, paddingInlineStart: t.space.m, borderInlineStartStyle: "solid", borderInlineStartWidth: t.quoteBorderWidth, borderInlineStartColor: t.quoteBorder, color: t.quoteText });
globalStyle(p("code"), { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, paddingInline: t.space.s, fontSize: `calc(${t.codeRatio} * 1em)` });
globalStyle(`:where(${prose}) :where(pre)`, { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, padding: t.space.m, margin: 0, overflowX: "auto", fontSize: `calc(${t.codeRatio} * 1em)`, whiteSpace: "pre" });
globalStyle(p("pre code"), { backgroundColor: "transparent", padding: 0, fontSize: "inherit" });
globalStyle(p("a"), { color: t.link, textDecoration: "underline" });
globalStyle(p("hr"), { borderStyle: "none", borderTopStyle: "solid", borderTopWidth: t.quoteBorderWidth, borderTopColor: t.quoteBorder, marginBlock: t.space.l });
globalStyle(p('ul[data-type="taskList"]'), { listStyle: "none", paddingInlineStart: 0 });
globalStyle(p('ul[data-type="taskList"] li'), { display: "flex", alignItems: "flex-start", gap: t.space.s });
globalStyle(p('ul[data-type="taskList"] li > span'), { flexShrink: 0, display: "inline-flex", alignItems: "center", height: `calc(${t.lineHeight} * 1em)` });
globalStyle(p('ul[data-type="taskList"] li > span input'), { width: t.checkboxSize, height: t.checkboxSize, margin: 0, accentColor: t.checkbox });
globalStyle(p('ul[data-type="taskList"] li > div'), { flexGrow: 1, minWidth: 0, marginTop: 0 });
globalStyle(p('ul[data-type="taskList"] li[data-checked="true"] > div'), { color: t.checkedText, textDecoration: "line-through" });
globalStyle(p("::selection"), { backgroundColor: t.selection });
// Scrolling blocks (wide tables and code) take focus, so a keyboard can scroll them (A11Y).
globalStyle(p("[tabindex]:focus-visible"), { outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing, outlineOffset: t.focusWidth });

// Tables (Tables → Anatomy): a hairline frame with small corners, the header row on the surface
// color in semibold, scrolling sideways inside its frame when wide (SHR-06: readable from 320 px).
globalStyle(p("[data-table]"), { overflowX: "auto", maxWidth: "100%" });
globalStyle(p("table"), { borderCollapse: "separate", borderSpacing: 0, borderStyle: "solid", borderWidth: t.tableBorderWidth, borderColor: t.tableBorder, borderRadius: t.tableRadius });
globalStyle(p("th, td"), {
  paddingBlock: t.tableCellBlock, paddingInline: t.tableCellInline, verticalAlign: "top", textAlign: "start",
  borderStyle: "none", borderInlineEndStyle: "solid", borderBlockEndStyle: "solid",
  borderInlineEndWidth: t.tableBorderWidth, borderBlockEndWidth: t.tableBorderWidth, borderColor: t.tableBorder,
});
globalStyle(p("th:last-child, td:last-child"), { borderInlineEndStyle: "none" });
globalStyle(p("tr:last-child > th, tr:last-child > td"), { borderBlockEndStyle: "none" });
globalStyle(p("th"), { backgroundColor: t.tableHeader, fontWeight: t.tableHeaderWeight });
globalStyle(p("tr:first-child > th:first-child"), { borderStartStartRadius: t.tableRadius });
globalStyle(p("tr:first-child > th:last-child"), { borderStartEndRadius: t.tableRadius });
globalStyle(p('[data-align="center"]'), { textAlign: "center" });
globalStyle(p('[data-align="right"]'), { textAlign: "end" });
globalStyle(p("th p, td p"), { margin: 0 });

// On paper (SHR-12, D-230): a page break the note asks for starts a new page, and the next block sits
// at the page's head. A heading stays with what follows it; a code line, a table row and a task don't
// split across pages; a paragraph leaves at least two lines at a page's foot and head. Code wraps and
// tables lay out in full, as paper can't scroll.
globalStyle(p("[data-page-break]"), { "@media": { print: { breakAfter: "page" } } });
globalStyle(p("[data-page-break] + *"), { "@media": { print: { marginTop: 0 } } });
globalStyle(p("h1, h2, h3, h4, h5, h6"), { "@media": { print: { breakAfter: "avoid", breakInside: "avoid" } } });
globalStyle(p("tr, li, blockquote > p"), { "@media": { print: { breakInside: "avoid" } } });
globalStyle(p("p, li"), { "@media": { print: { orphans: t.printLines, widows: t.printLines } } });
globalStyle(p("pre"), { "@media": { print: { whiteSpace: "pre-wrap", overflowX: "visible" } } });
globalStyle(p("[data-table]"), { "@media": { print: { overflowX: "visible" } } });

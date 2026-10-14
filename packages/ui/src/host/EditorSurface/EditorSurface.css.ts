import { createVar, globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { scrollEdge, tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.editorSurface;

/** The table controls' reach, read by the tracker in pixels (Tables → Anatomy). */
export const tableGutterVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const tableReachVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const tableBoundaryVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

export const scroller = style({
  vars: { [tableGutterVar]: t.tableGutter, [tableReachVar]: t.tableEdgeReach, [tableBoundaryVar]: t.tableBoundaryReach },
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  backgroundColor: t.background,
  color: t.text,
  // Space for the scrollbar is always reserved, so nothing moves when it appears (UI-09).
  scrollbarGutter: "stable",
});

// The minimal scrollbar (D-73, UI-09).
minimalScrollbar(scroller, t);

/** Holds the scroller and, over its top and bottom edges, the scroll edges (not scrolling with it). */
export const frame = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  minHeight: 0,
});

// The note's scroll edges (D-111): where there's more to scroll to, its text blurs and fades out
// over `scrollFade` (50 px). A layered progressive blur: `edgeLayers` (8) stacked backdrop blurs,
// the outermost `edgeBlur` (40 px) and each one in half the one outside it (down to about 0.3 px),
// each masked to a window of the band that overlaps its neighbors', so the blur rises smoothly from
// none at the band's inner edge to its most at the window's edge. Then a gradient in the canvas's
// color fades the text out over the same band. The edges sit in the frame, beside the scroller, so
// the text scrolls under them; neither they nor anything between them and the text may be a backdrop
// root (filter, opacity, mask, clip-path, blend mode), or the blurs would see nothing. No mask on
// the note: over a long note it repaints all of it on every keystroke (PRF-01). Interface surfaces
// never have them.
/** How many layers, resolved at build time from `cmp.editorSurface.edgeLayers` (CSS can't loop over a token). */
export const EDGE_BANDS = scrollEdge.bands;
export const edge = style({
  position: "absolute",
  zIndex: t.edgeLayer,
  insetInlineStart: 0,
  // Never over the scrollbar, which stays sharp and pressable.
  insetInlineEnd: t.scrollbarSize,
  height: t.scrollFade,
  pointerEvents: "none",
  // Shown with visibility, never opacity: an opacity under 1 would make it a backdrop root.
  visibility: "hidden",
  "@media": { "(forced-colors: active)": { display: "none" } },
});
// The top edge first hides the trigger's place entirely, `triggerClear` (80 px) in the canvas's
// color, then fades over `scrollFade` below it, so scrolled text never meets the trigger (D-111).
const topEdge = `calc(${t.triggerClear} + ${t.scrollFade})`;
export const edgeSide = styleVariants({
  top: { top: 0, height: topEdge, selectors: { "[data-fade-top] ~ &": { visibility: "visible" } } },
  bottom: { bottom: 0, selectors: { "[data-fade-bottom] ~ &": { visibility: "visible" } } },
});
/** A depth into the fade as a length: 0 at its outer edge (the window's, or the top's solid part), 1 at its inner edge. */
const at = (f: number, from = "0px") => `calc(${from} + ${t.scrollFade} * ${Math.round(f * 10000) / 10000})`;
/**
 * Layer k (0 at the window's edge): opaque over its slice of the band, from k-1 to k eighths in
 * (for 8 layers), ramping in and out over one slice on either side, so neighbors overlap and no
 * step shows. Positions past the band's ends are fine in a gradient.
 */
const layerMask = (inward: "bottom" | "top", k: number) => {
  const n = EDGE_BANDS;
  // The top edge's fade starts below its solid part.
  const from = inward === "bottom" ? t.triggerClear : "0px";
  return `linear-gradient(to ${inward}, transparent ${at((k - 2) / n, from)}, black ${at((k - 1) / n, from)}, black ${at(k / n, from)}, transparent ${at((k + 1) / n, from)})`;
};
const layer = (inward: "bottom" | "top", k: number) =>
  style({
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    // Unprefixed only: with the -webkit- one as well, the build keeps just that, which Chromium ignores.
    backdropFilter: `blur(calc(${t.edgeBlur} / ${2 ** k}))`,
    maskImage: layerMask(inward, k),
    // With reduced transparency, the fade alone (Foundations → Surfaces).
    selectors: { ':root[data-transparency="reduced"] &': { display: "none" } },
  } as Parameters<typeof style>[0]);
export const blurTop = Array.from({ length: EDGE_BANDS }, (_, k) => layer("bottom", k));
export const blurBottom = Array.from({ length: EDGE_BANDS }, (_, k) => layer("top", k));
export const fade = styleVariants({
  top: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `linear-gradient(to bottom, ${t.background} ${t.triggerClear}, transparent)` },
  bottom: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `linear-gradient(to top, ${t.background}, transparent)` },
});

export const column = style({
  position: "relative",
  maxWidth: `calc(${t.measure} + 2 * ${t.gutter})`,
  marginInline: "auto",
  paddingInline: t.gutter,
  // The reading zone (UI-11): the note starts 25% down the window (never under the trigger band)
  // and its last line can scroll up to leave 35% below it.
  paddingTop: `max(${t.readingTop}, ${t.topBand})`,
  paddingBottom: t.endPadding,
  selectors: {
    // While the find bar is open, the top of the note sits below it, so it never covers a match.
    "[data-find-open] > &": { paddingTop: `max(${t.readingTop}, calc(${t.topBand} + ${t.findClearance}))` },
  },
});

// Focus mode (FOC-01 to FOC-06): a full-width mask over the content, bright only in the band.
// The band is in content coordinates, so scrolling never recomputes it. Registered properties
// let the band glide (motion.micro), and reduced motion makes the duration 0 (FOC-04).
export const bandTop = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const bandBottom = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
const dimmed = `color-mix(in srgb, black calc(${t.focusDim} * 100%), transparent)`;
const mask = `linear-gradient(to bottom, ${dimmed} 0, ${dimmed} ${bandTop}, black ${bandTop}, black ${bandBottom}, ${dimmed} ${bandBottom}, ${dimmed} 100%)`;
export const focusOn = style({
  maskImage: mask,
  WebkitMaskImage: mask,
  transitionProperty: `${bandTop}, ${bandBottom}`,
  transitionDuration: t.focusDuration,
  transitionTimingFunction: t.focusEasing,
});

export const prose = style({
  outline: "none",
  fontFamily: t.font,
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
  color: t.text,
  caretColor: t.caret,
  minHeight: t.minHeight,
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
});

const p = (sel: string) => `${prose} ${sel}`;
globalStyle(p("> * + *"), { marginTop: t.blockGap });
globalStyle(`:where(${prose}) :where(p)`, { margin: 0 });
globalStyle(`:where(${prose}) :where(h1, h2, h3, h4, h5, h6)`, { margin: 0, fontFamily: t.headingFont, fontWeight: t.headingWeight, lineHeight: t.headingLineHeight });
// The heading ramp and the space above each heading, in its own em (D-78).
const ramp = [[t.h1, t.h1Before], [t.h2, t.h2Before], [t.h3, t.h3Before], [t.h4, t.h4Before], [t.h5, t.h5Before], [t.h6, t.h6Before]] as const;
ramp.forEach(([size, before], i) => {
  globalStyle(p(`h${i + 1}`), { fontSize: `calc(${size} * 1em)` });
  globalStyle(p(`> * + h${i + 1}`), { marginTop: `calc(${before} * 1em)` });
});
globalStyle(`:where(${prose}) :where(ul, ol)`, { margin: 0, paddingInlineStart: t.space.l });
globalStyle(p("li > * + *"), { marginTop: t.space.s });
globalStyle(p("li + li"), { marginTop: t.listItemGap });
globalStyle(`:where(${prose}) :where(blockquote)`, { margin: 0, paddingInlineStart: t.space.m, borderInlineStartStyle: "solid", borderInlineStartWidth: t.quoteBorderWidth, borderInlineStartColor: t.quoteBorder, color: t.quoteText });
globalStyle(p("code"), { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, paddingInline: t.space.s, fontSize: `calc(${t.codeRatio} * 1em)` });
globalStyle(`:where(${prose}) :where(pre)`, { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, padding: t.space.m, margin: 0, overflowX: "auto", fontSize: `calc(${t.codeRatio} * 1em)`, whiteSpace: "pre" });
globalStyle(p("pre code"), { backgroundColor: "transparent", padding: 0, fontSize: "inherit" });
globalStyle(p("pre[data-raw-markdown]"), { userSelect: "text" });
globalStyle(p("a"), { color: t.link, textDecoration: "underline" });
globalStyle(p("hr"), { borderStyle: "none", borderTopStyle: "solid", borderTopWidth: t.quoteBorderWidth, borderTopColor: t.quoteBorder, marginBlock: t.space.l });
globalStyle(p("p.is-editor-empty:first-child::before"), { content: "attr(data-placeholder)", color: t.placeholder, pointerEvents: "none", float: "left", height: 0 });
globalStyle(p('ul[data-type="taskList"]'), { listStyle: "none", paddingInlineStart: 0 });
globalStyle(p('ul[data-type="taskList"] li'), { display: "flex", alignItems: "flex-start", gap: t.space.s });
globalStyle(p('ul[data-type="taskList"] li > label'), { flexShrink: 0, userSelect: "none", display: "inline-flex", alignItems: "center", height: `calc(${t.lineHeight} * 1em)` });
globalStyle(p('ul[data-type="taskList"] li > label input'), { width: t.checkboxSize, height: t.checkboxSize, margin: 0, accentColor: t.checkbox });
// The text sits beside the checkbox, never below it: the space between a list item's blocks isn't for
// it, so the checkbox stays centered on the first line (D-111, aligned rows).
globalStyle(p('ul[data-type="taskList"] li > div'), { flexGrow: 1, minWidth: 0, marginTop: 0 });
globalStyle(p('ul[data-type="taskList"] li[data-checked="true"] > div'), { color: t.checkedText, textDecoration: "line-through" });
globalStyle(p("::selection"), { backgroundColor: t.selection });

// Tables (Tables → Anatomy): a 1 px frame with small corners and 1 px inner rules, no striping,
// a header row on the surface color in semibold. The frame scrolls sideways when the table is wide.
// Room below for the New row bar, so it never covers the next line while the pointer is near.
globalStyle(p("[data-table]"), { overflowX: "auto", maxWidth: "100%", paddingBlockEnd: `calc(${t.tableBarSpace} + ${t.tableBarGap})` });
globalStyle(p("table"), {
  borderCollapse: "separate",
  borderSpacing: 0,
  borderStyle: "solid",
  borderWidth: t.tableBorderWidth,
  borderColor: t.tableBorder,
  borderRadius: t.tableRadius,
});
globalStyle(p("th, td"), {
  paddingBlock: t.tableCellBlock,
  paddingInline: t.tableCellInline,
  verticalAlign: "top",
  textAlign: "start",
  borderStyle: "none",
  borderInlineEndStyle: "solid",
  borderBlockEndStyle: "solid",
  borderInlineEndWidth: t.tableBorderWidth,
  borderBlockEndWidth: t.tableBorderWidth,
  borderColor: t.tableBorder,
  // Each cell paints on its own, so typing in one repaints that cell rather than the whole table:
  // in a 200 × 10 table whose cells wrap, keystroke to paint drops from hundreds of ms to under one
  // frame (PRF-01, D-100). Cells never draw outside themselves; the controls are an overlay.
  contain: "paint",
});
globalStyle(p("th:last-child, td:last-child"), { borderInlineEndStyle: "none" });
globalStyle(p("tr:last-child > th, tr:last-child > td"), { borderBlockEndStyle: "none" });
globalStyle(p("th"), { backgroundColor: t.tableHeader, fontWeight: t.tableHeaderWeight });
globalStyle(p("tr:first-child > th:first-child"), { borderStartStartRadius: t.tableRadius });
globalStyle(p("tr:first-child > th:last-child"), { borderStartEndRadius: t.tableRadius });
globalStyle(p('[data-align="center"]'), { textAlign: "center" });
globalStyle(p('[data-align="right"]'), { textAlign: "end" });
globalStyle(p('[data-align="left"]'), { textAlign: "start" });
// A selected cell range (TBL-11): the selection color; TableControls outlines the range.
globalStyle(p(".selectedCell"), { backgroundColor: t.tableSelection });
globalStyle(p("th p, td p"), { margin: 0 });

// Find highlights (FND-01): every match, and the current one stronger and outlined. A match's text
// is the text color, so a link or code in it keeps AA contrast on the highlight (D-100).
globalStyle(`${prose} .ProseMirror-search-match`, { backgroundColor: t.findMatch, color: t.findMatchText, borderRadius: t.findMatchOutlineWidth });
globalStyle(`${prose} .ProseMirror-active-search-match`, {
  backgroundColor: t.findMatchActive,
  color: t.findMatchText,
  outlineStyle: "solid",
  outlineWidth: t.findMatchOutlineWidth,
  outlineColor: t.findMatchOutline,
});

// ProseMirror's own needs (what Tiptap would otherwise inject): hidden selections stay hidden.
globalStyle(p(".ProseMirror-hideselection *::selection"), { backgroundColor: "transparent" });
globalStyle(`${prose}.ProseMirror-hideselection`, { caretColor: "transparent" });

/** The selection, kept visible while the link editor's field has focus (Text formatting → Link editor). */
// Text keeps its contrast on it, also in forced colors (HighlightText on Highlight).
export const ghost = style({ backgroundColor: t.selectionGhost, color: t.selectionGhostText });
// An empty header cell's column name: muted, zero-width so the caret stays at the cell's start, and
// never selected or clicked.
export const emptyHeader = style({
  display: "inline-block",
  width: 0,
  whiteSpace: "nowrap",
  color: t.placeholder,
  pointerEvents: "none",
  userSelect: "none",
});

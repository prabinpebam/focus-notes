import { createVar, globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { scrollEdge, tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.editorSurface;

/** The table controls' reach, read by the tracker in pixels (Tables → Anatomy). */
export const tableGutterVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const tableReachVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const tableBoundaryVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

/**
 * Docked panels (D-187): the width docked Files takes on the left and the docked contents on the right,
 * set on the scroller by keepClearOfPinned. They're the scroller's own margins, so the note's area, its
 * scrollbar with it, sits between the panels. Registered and inherited, so docking glides over
 * motion.sheet; resizing a panel or the window moves nothing late.
 */
export const pinnedClearVar = createVar({ syntax: "<length>", inherits: true, initialValue: "0px" });
export const pinnedRightVar = createVar({ syntax: "<length>", inherits: true, initialValue: "0px" });

export const scroller = style({
  vars: { [tableGutterVar]: t.tableGutter, [tableReachVar]: t.tableEdgeReach, [tableBoundaryVar]: t.tableInsertZone },
  transitionProperty: `${pinnedClearVar.slice(4, -1)}, ${pinnedRightVar.slice(4, -1)}`,
  transitionDuration: t.pinnedDuration,
  transitionTimingFunction: t.pinnedEasing,
  // The first layout, resizing and a window resize move the column at once; only docking and undocking glide.
  selectors: { "&[data-pinned-instant]": { transitionDuration: t.pinnedInstant } },
  marginInlineStart: pinnedClearVar,
  marginInlineEnd: pinnedRightVar,
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  backgroundColor: t.background,
  color: t.text,
  cursor: "text",
  // Space for the scrollbar is always reserved, so nothing moves when it appears (UI-09).
  scrollbarGutter: "stable",
  // A table bled to the edge measures the note's width against this (D-182).
  containerType: "inline-size",
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
// The top edge (D-119, D-172): one progressive blur and fade from the window's very edge down
// `triggerClear + scrollFade` (130 px), strongest at the edge and crisp at its inner end, with no
// solid band. It's light (`edgeBlurTop`, 8 px, under a `scrollVeil` 30% veil) so the blurred text
// visibly reaches the window's edge; over the trigger's place the veil is at least `triggerVeil`.
const topEdge = `calc(${t.triggerClear} + ${t.scrollFade})`;
export const edgeSide = styleVariants({
  top: { top: 0, height: topEdge, selectors: { "[data-fade-top] ~ &": { visibility: "visible" } } },
  bottom: { bottom: 0, selectors: { "[data-fade-bottom] ~ &": { visibility: "visible" } } },
});
const round = (f: number) => Math.round(f * 10000) / 10000;
/** A depth into the bottom fade as a length: 0 at the window's edge, 1 at its inner edge. */
const at = (f: number) => `calc(${t.scrollFade} * ${round(f)})`;
/** A depth into the top edge as a length: 0 at the window's edge, 1 at its inner end. */
const topAt = (f: number) => `calc(${topEdge} * ${round(f)})`;
/**
 * Layer k (0 at the window's edge): opaque over its slice of the band, from k-1 to k eighths in
 * (for 8 layers), ramping in and out over one slice on either side, so neighbors overlap and no
 * step shows. Positions past the band's ends are fine in a gradient.
 */
const layerMask = (inward: "bottom" | "top", k: number) => {
  const n = EDGE_BANDS;
  return `linear-gradient(to ${inward}, transparent ${at((k - 2) / n)}, black ${at((k - 1) / n)}, black ${at(k / n)}, transparent ${at((k + 1) / n)})`;
};
const layerBase = (k: number, blur: string = t.edgeBlur) => ({
  position: "absolute",
  pointerEvents: "none",
  // Unprefixed only: with the -webkit- one as well, the build keeps just that, which Chromium ignores.
  backdropFilter: `blur(calc(${blur} / ${2 ** k}))`,
  // With reduced transparency, or in software compositing, where eight backdrop filters drop the
  // window to a few frames a second (D-121): the canvas-colored fade alone.
  selectors: { ':root[data-transparency="reduced"] &, :root[data-compositing="software"] &': { display: "none" } },
});
const layer = (k: number) => style({ ...layerBase(k), inset: 0, maskImage: layerMask("top", k) } as Parameters<typeof style>[0]);
/**
 * The top edge's slices are eased out: the strong blurs hold over the trigger's place and the soft
 * ones gather toward the crisp end (layer k's slice ends at `topSlice(k / n)` of the edge).
 */
const topSlice = (x: number) => 1 - (1 - Math.min(x, 1)) ** 2;
const topLayer = (k: number) => {
  const n = EDGE_BANDS;
  const b = (j: number) => topSlice(j / n);
  // Each layer's box is only where its mask shows: a backdrop filter costs its whole box every
  // frame, and over all 130 px eight of them would cost more than the old edge did (PRF-01, D-121).
  const start = Math.max(0, b(k - 2));
  const end = b(k + 1);
  const mask = `linear-gradient(to bottom, transparent ${topAt(b(k - 2) - start)}, black ${topAt(b(k - 1) - start)}, black ${topAt(b(k) - start)}, transparent ${topAt(end - start)})`;
  return style({ ...layerBase(k, t.edgeBlurTop), insetInline: 0, top: topAt(start), height: topAt(end - start), maskImage: mask } as Parameters<typeof style>[0]);
};
export const blurTop = Array.from({ length: EDGE_BANDS }, (_, k) => topLayer(k));
export const blurBottom = Array.from({ length: EDGE_BANDS }, (_, k) => layer(k));
/**
 * The top's veil, eased: the canvas color's opacity at depth x (0 at the window's edge, 1 at the
 * inner end) is `top · (1 − x^p)²`, `top` at the edge, `under` at the trigger place's bottom
 * (p solves for it), and leveling off to none at the inner end, so no seam shows at either end.
 * With the blur, `top` is `veil` and `under` is `triggerVeil`, light enough that the blurred text
 * visibly reaches the edge (D-172); without it (reduced transparency, software compositing), the
 * curve starts fully opaque down to `triggerVeilPlain`, as unblurred text under the dot would read.
 */
const { veil, triggerVeil, triggerVeilPlain, clear, range } = scrollEdge;
const VEIL_STOPS = 16;
const veilGradient = (top: number, under: number) => {
  const ease = Math.log(1 - Math.sqrt(under / top)) / Math.log(clear / (clear + range));
  const stops = Array.from({ length: VEIL_STOPS + 1 }, (_, i) => {
    const x = i / VEIL_STOPS;
    return `color-mix(in srgb, ${t.background} ${round(top * (1 - x ** ease) ** 2 * 100)}%, transparent) ${topAt(x)}`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
};
export const fade = styleVariants({
  top: {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    backgroundImage: veilGradient(veil, triggerVeil),
    selectors: { ':root[data-transparency="reduced"] &, :root[data-compositing="software"] &': { backgroundImage: veilGradient(1, triggerVeilPlain) } },
  },
  bottom: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: `linear-gradient(to top, ${t.background}, transparent)` },
});

export const column = style({
  position: "relative",
  maxWidth: `calc(${t.measure} + 2 * ${t.gutter})`,
  // Centred in the note's area, which docked panels narrow (D-187); the column narrows when the area
  // is less than its measure.
  marginInlineStart: `max(0px, (100% - ${t.measure} - 2 * ${t.gutter}) / 2)`,
  marginInlineEnd: `max(0px, (100% - ${t.measure} - 2 * ${t.gutter}) / 2)`,
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
// The transition names the band's properties (--x), never their values (var(--x)): a var() there made the
// list invalid, so it fell back to `all`, and the column's 25vh/35vh padding glided after every height
// change while the band, measured once, stayed where the row had been (D-156).
const propertyName = (v: string) => v.slice(4, -1);
export const focusOn = style({
  maskImage: mask,
  WebkitMaskImage: mask,
  transitionProperty: `${propertyName(bandTop)}, ${propertyName(bandBottom)}`,
  transitionDuration: t.focusDuration,
  transitionTimingFunction: t.focusEasing,
  selectors: {
    // While the window is resized the band is written every frame, so it never glides behind the row (FOC-02).
    "&[data-band-live]": { transitionDuration: t.focusLiveDuration },
  },
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
// The paragraph gap: whole lines of the note's text, at least one (D-183).
const blockGap = `calc(${t.blockGapLines} * ${t.lineHeight} * 1em)`;
globalStyle(p("> * + *"), { marginTop: blockGap });
globalStyle(`:where(${prose}) :where(p)`, { margin: 0 });
globalStyle(`:where(${prose}) :where(h1, h2, h3, h4, h5, h6)`, { margin: 0, fontFamily: t.headingFont, fontWeight: t.headingWeight, lineHeight: t.headingLineHeight });
// Spacing shows what belongs together (D-183): consecutive blocks are a paragraph gap apart; the block
// after a heading sits close under it, nested; and the space before a heading is the paragraph gap plus
// more the bigger the heading, so two paragraphs are never further apart than two headings. All in the
// note's em, so it scales with the text size. Each heading's margin is in its own em, so it's divided by
// its size to be in the note's. Nothing above the first block.
globalStyle(p("> :is(h1, h2, h3, h4, h5, h6) + *"), { marginTop: t.headingAfter });
// The heading ramp (D-78) and the space above each heading.
const ramp = [[t.h1, t.h1Before], [t.h2, t.h2Before], [t.h3, t.h3Before], [t.h4, t.h4Before], [t.h5, t.h5Before], [t.h6, t.h6Before]] as const;
ramp.forEach(([size, before], i) => {
  globalStyle(p(`h${i + 1}`), { fontSize: `calc(${size} * 1em)` });
  globalStyle(p(`> * + h${i + 1}`), { marginTop: `calc((${t.blockGapLines} * ${t.lineHeight} + ${before}) * 1em / ${size})` });
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
// One line, ending in an ellipsis in a narrow window: a wrapped hint ran below the empty line, outside
// the caret's row, so the focus band drew its second line in another tone (D-135).
globalStyle(p("p.is-editor-empty:first-child"), { position: "relative" });
globalStyle(p("p.is-editor-empty:first-child::before"), {
  content: "attr(data-placeholder)", color: t.placeholder, pointerEvents: "none",
  position: "absolute", insetInline: 0, top: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
});
globalStyle(p('ul[data-type="taskList"]'), { listStyle: "none", paddingInlineStart: 0 });
globalStyle(p('ul[data-type="taskList"] li'), { display: "flex", alignItems: "flex-start", gap: t.space.s });
globalStyle(p('ul[data-type="taskList"] li > label'), { flexShrink: 0, userSelect: "none", display: "inline-flex", alignItems: "center", height: `calc(${t.lineHeight} * 1em)` });
globalStyle(p('ul[data-type="taskList"] li > label input'), { width: t.checkboxSize, height: t.checkboxSize, margin: 0, accentColor: t.checkbox, cursor: "pointer" });
// The text sits beside the checkbox, never below it: the space between a list item's blocks isn't for
// it, so the checkbox stays centered on the first line (D-111, aligned rows).
globalStyle(p('ul[data-type="taskList"] li > div'), { flexGrow: 1, minWidth: 0, marginTop: 0 });
globalStyle(p('ul[data-type="taskList"] li[data-checked="true"] > div'), { color: t.checkedText, textDecoration: "line-through" });
globalStyle(p("::selection"), { backgroundColor: t.selection });

// Tables (Tables → Anatomy): a 1 px frame with small corners and 1 px inner rules, no striping,
// a header row on the surface color in semibold. The frame scrolls sideways when the table is wide.
// Room below for the New row bar, so it never covers the next line while the pointer is near.
globalStyle(p("[data-table]"), { overflowX: "auto", maxWidth: "100%", paddingBlockEnd: `calc(${t.tableBarSpace} + ${t.tableBarGap})` });
// Fit to column (D-182): a table spans the text column in equal columns, as in Microsoft Loop; its
// text wraps inside them.
globalStyle(p("table"), {
  width: "100%",
  tableLayout: "fixed",
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
// Bleed to edge (D-182): the table may be as wide as the note's area (less the gutters, and right of a
// pinned Files sheet), centred on the text column, never stretched: as wide as its columns, each
// aiming for at most 75 characters a line, and narrower columns where the room runs out.
const bleedRoom = `calc(100cqi - 2 * ${t.gutter})`;
globalStyle(p('[data-table][data-layout="bleed"]'), {
  width: bleedRoom,
  maxWidth: "none",
  marginInlineStart: `calc((100% - ${bleedRoom}) / 2)`,
});
globalStyle(p('[data-table][data-layout="bleed"] > table'), { width: "max-content", maxWidth: "100%", tableLayout: "auto", marginInline: "auto" });
globalStyle(p('[data-table][data-layout="bleed"] :is(th, td) > p'), { maxWidth: t.tableBleedMeasure });
// Set widths (D-182): the columns are exactly as wide as set; bled out, the table is their sum (set by the view).
globalStyle(p('[data-table][data-layout="bleed"][data-widths] > table'), { tableLayout: "fixed", maxWidth: "none" });
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
// Find in selection's scope (FND-03): the held selection's faint tint, under the match highlights.
export const findScope = style({ backgroundColor: t.selectionGhost });
// Block selection mode (KEY-04): the selected blocks take the selection color, as a selected cell range does.
export const blockSelected = style({ backgroundColor: t.tableSelection, borderRadius: t.findMatchOutlineWidth });
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

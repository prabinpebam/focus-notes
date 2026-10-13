import { createVar, globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { minimalScrollbar } from "../../behaviors/scrollbar-styles.ts";

const t = tokens.cmp.editorSurface;

export const scroller = style({
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
globalStyle(p('ul[data-type="taskList"] li > div'), { flexGrow: 1, minWidth: 0 });
globalStyle(p('ul[data-type="taskList"] li[data-checked="true"] > div'), { color: t.checkedText, textDecoration: "line-through" });
globalStyle(p("::selection"), { backgroundColor: t.selection });

// Find highlights (FND-01): every match, and the current one stronger and outlined.
globalStyle(`${prose} .ProseMirror-search-match`, { backgroundColor: t.findMatch, borderRadius: t.findMatchOutlineWidth });
globalStyle(`${prose} .ProseMirror-active-search-match`, {
  backgroundColor: t.findMatchActive,
  outlineStyle: "solid",
  outlineWidth: t.findMatchOutlineWidth,
  outlineColor: t.findMatchOutline,
});

// ProseMirror's own needs (what Tiptap would otherwise inject): hidden selections stay hidden.
globalStyle(p(".ProseMirror-hideselection *::selection"), { backgroundColor: "transparent" });
globalStyle(`${prose}.ProseMirror-hideselection`, { caretColor: "transparent" });

/** The selection, kept visible while the link editor's field has focus (Text formatting → Link editor). */
export const ghost = style({ backgroundColor: t.selectionGhost });

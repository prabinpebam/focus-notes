import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.editorSurface;

export const scroller = style({
  flexGrow: 1,
  minHeight: 0,
  overflowY: "auto",
  backgroundColor: t.background,
  color: t.text,
  scrollbarGutter: "stable",
});

export const column = style({
  maxWidth: `calc(${t.measure} + 2 * ${t.gutter})`,
  marginInline: "auto",
  paddingInline: t.gutter,
  paddingTop: t.topBand,
  paddingBottom: t.endPadding,
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
globalStyle(p("p"), { margin: 0 });
globalStyle(p("h1, h2, h3, h4, h5, h6"), { margin: 0, fontWeight: t.headingWeight, lineHeight: t.headingLineHeight });
globalStyle(p("h1"), { fontSize: `calc(${t.h1} * 1em)` });
globalStyle(p("h2"), { fontSize: `calc(${t.h2} * 1em)` });
globalStyle(p("h3"), { fontSize: `calc(${t.h3} * 1em)` });
globalStyle(p("ul, ol"), { margin: 0, paddingInlineStart: t.space.l });
globalStyle(p("li > * + *"), { marginTop: t.space.s });
globalStyle(p("blockquote"), { margin: 0, paddingInlineStart: t.space.m, borderInlineStartStyle: "solid", borderInlineStartWidth: t.quoteBorderWidth, borderInlineStartColor: t.quoteBorder, color: t.quoteText });
globalStyle(p("code"), { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, paddingInline: t.space.s, fontSize: `calc(${t.codeRatio} * 1em)` });
globalStyle(p("pre"), { fontFamily: t.codeFont, backgroundColor: t.codeBackground, color: t.codeText, borderRadius: t.codeRadius, padding: t.space.m, margin: 0, overflowX: "auto", fontSize: `calc(${t.codeRatio} * 1em)`, whiteSpace: "pre" });
globalStyle(p("pre code"), { backgroundColor: "transparent", padding: 0, fontSize: "inherit" });
globalStyle(p("pre[data-raw-markdown]"), { userSelect: "text" });
globalStyle(p("a"), { color: t.link, textDecoration: "underline" });
globalStyle(p("hr"), { borderStyle: "none", borderTopStyle: "solid", borderTopWidth: t.quoteBorderWidth, borderTopColor: t.quoteBorder, marginBlock: t.space.l });
globalStyle(p("p.is-editor-empty:first-child::before"), { content: "attr(data-placeholder)", color: t.placeholder, pointerEvents: "none", float: "left", height: 0 });
globalStyle(p("::selection"), { backgroundColor: t.selection });

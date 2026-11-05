import { globalStyle, style } from "@vanilla-extract/css";
import { breakpoints, tokens } from "@focus-notes/tokens";

const t = tokens.cmp.readerPage;

// Only on a published page (its document says data-page="reader"), never in the app or the gallery.
const page = ':root[data-page="reader"]';
globalStyle(`${page} *, ${page} *::before, ${page} *::after`, { boxSizing: "border-box" });
globalStyle(`${page}, ${page} body`, { margin: 0, padding: 0, backgroundColor: t.background, color: t.text });
globalStyle(`${page} body`, { fontFamily: t.font, fontSize: t.fontSize, lineHeight: t.uiLineHeight, WebkitFontSmoothing: "antialiased" });
globalStyle(`${page} ::selection`, { backgroundColor: t.selection });
// Print drops the footer and the skip link (Secondary views → Public note page).
globalStyle(`${page} [data-print="hide"]`, { "@media": { print: { display: "none" } } });

export const root = style({ display: "flex", flexDirection: "column" });

export const skip = style({
  position: "absolute",
  insetInlineStart: t.edge,
  insetBlockStart: t.edge,
  zIndex: t.skipLayer,
  padding: t.edge,
  backgroundColor: t.skipBackground,
  color: t.text,
  borderRadius: t.skipRadius,
  transform: "translateY(-200%)",
  selectors: { "&:focus-visible": { transform: "none", outlineStyle: "solid", outlineWidth: t.focusWidth, outlineColor: t.focusRing } },
});

// The reading column: the editor's measure and gutter, narrower gutters below the medium breakpoint
// so 320 px still reads (SHR-06).
const column = {
  width: "100%",
  maxWidth: `calc(${t.measure} + 2 * ${t.gutter})`,
  marginInline: "auto",
  paddingInline: t.gutter,
  "@media": { [`(max-width: ${breakpoints.medium - 1}px)`]: { paddingInline: t.gutterCompact } },
} as const;

export const main = style({
  ...column,
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  paddingBlockStart: t.top,
  paddingBlockEnd: t.sectionGap,
  outline: "none",
});

export const footer = style({
  ...column,
  paddingBlock: t.sectionGap,
  color: t.muted,
  borderBlockStartStyle: "solid",
  borderBlockStartWidth: t.borderWidth,
  borderBlockStartColor: t.border,
});

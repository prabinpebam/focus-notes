import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { breakpoints, tokens } from "@focus-notes/tokens";

const t = tokens.cmp.sitePage;

// Only on a page of the product site (its document says data-page="site"), never in the app or the gallery.
const page = ':root[data-page="site"]';
globalStyle(`${page} *, ${page} *::before, ${page} *::after`, { boxSizing: "border-box" });
globalStyle(`${page}, ${page} body`, { margin: 0, padding: 0, backgroundColor: t.background, color: t.text });
globalStyle(`${page} body`, { fontFamily: t.font, fontSize: t.fontSize, lineHeight: t.uiLineHeight, WebkitFontSmoothing: "antialiased" });
globalStyle(`${page} ::selection`, { backgroundColor: t.selection });

const compact = `(max-width: ${breakpoints.medium - 1}px)`;
const column = (max: string) => ({
  width: "100%",
  maxWidth: `calc(${max} + 2 * ${t.gutter})`,
  marginInline: "auto",
  paddingInline: t.gutter,
  "@media": { [compact]: { paddingInline: t.gutterCompact } },
}) as const;

export const root = style({ display: "flex", flexDirection: "column", minHeight: "100vh" });

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

export const header = style({
  borderBlockEndStyle: "solid",
  borderBlockEndWidth: t.borderWidth,
  borderBlockEndColor: t.border,
});

// The brand first, then the site's links; they wrap below the medium breakpoint rather than shrink.
export const nav = style({
  ...column(t.wide),
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: t.navGap,
  paddingBlock: t.headerBlock,
});

export const main = style({
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  gap: t.gap,
  paddingBlockStart: t.top,
  paddingBlockEnd: t.sectionGap,
  outline: "none",
});
export const width = styleVariants({ reading: column(t.measure), wide: column(t.wide) });

export const footer = style({
  ...column(t.wide),
  paddingBlock: t.sectionGap,
  color: t.muted,
  borderBlockStartStyle: "solid",
  borderBlockStartWidth: t.borderWidth,
  borderBlockStartColor: t.border,
});

import { createVar, globalStyle, style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";
import { controlMetrics } from "../control.css.ts";
import { hitReach } from "../hit.ts";

const t = tokens.cmp.openItem;

// The whole item is one button (hit): its ::after covers the item, so a press anywhere opens it; the
// folder path and pin sit above it and do their own thing.
export const hit = style({
  ...controlMetrics, display: "block", minWidth: 0, maxWidth: "100%", padding: 0, border: "none", background: "none",
  color: "inherit", font: "inherit", textAlign: "start", cursor: "default", outline: "none",
  selectors: { "&::after": { content: '""', position: "absolute", inset: 0, zIndex: t.hitLayer, borderRadius: "inherit" } },
});

export const base = style({
  position: "relative", isolation: "isolate", display: "flex", alignItems: "center", gap: t.gap, minWidth: 0,
  fontFamily: t.font, lineHeight: t.lineHeight, color: t.titleColor,
  transitionProperty: "background-color", transitionDuration: t.duration, transitionTimingFunction: t.easing,
  selectors: {
    [`&:has(${hit}:focus-visible)`]: { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
});

export const kind = styleVariants({
  // A project: a card washed in its accent; hovered, the full tint.
  project: {
    padding: t.padding.card, borderRadius: t.radius, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, backgroundColor: t.background,
    selectors: {
      "&::before": {
        content: '""', position: "absolute", inset: 0, zIndex: t.tintLayer, borderRadius: "inherit", backgroundColor: t.tint, opacity: t.tintOpacity, pointerEvents: "none",
        transitionProperty: "opacity", transitionDuration: t.duration, transitionTimingFunction: t.easing,
      },
      [`&:has(${hit}:active)`]: { backgroundColor: t.pressed },
    },
    "@media": { "(hover: hover)": { selectors: { "&:hover::before": { opacity: t.visible } } } },
  },
  // A file: a quiet row; hovered, the hover fill.
  file: {
    paddingBlock: t.padding.rowBlock, paddingInline: t.padding.rowInline, borderRadius: t.rowRadius,
    selectors: {
      [`&:has(${hit}:active)`]: { backgroundColor: t.pressed },
    },
    "@media": { "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.hover } } } },
  },
});

export const text = style({ display: "flex", flexDirection: "column", gap: t.textGap, flexGrow: 1, minWidth: 0, paddingInlineEnd: t.pinRoom });
const oneLine = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const;
export const title = style({ ...oneLine, display: "block", margin: 0, fontWeight: t.titleWeight, color: t.titleColor });
export const titleSize = styleVariants({ project: { fontSize: t.title.card }, file: { fontSize: t.title.row } });
export const detail = style({ ...oneLine, display: "block", fontSize: t.detail, color: t.detailColor });

export const fileTile = style({
  flexShrink: 0, width: t.fileTile, height: t.fileTile, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: t.rowRadius, backgroundColor: t.fileTileBackground, color: t.fileTileColor,
});
export const fileIcon = style({ width: t.fileTileIcon, height: t.fileTileIcon });

// The folder path: one line, ellipsized in the middle (its start gives way, the folder's own name stays),
// above the item's hit area; pressing it shows the folder in File Explorer or Finder.
/** The path link's fill, drawn on its hit extension. */
const pathFill = createVar();
// Its text lines up with the title above it; its start padding is an invisible extension that
// carries the hit area, fill and ring, never a negative margin into the row's padding (spacing SP-2).
export const path = style({
  ...controlMetrics, position: "relative", zIndex: t.controlLayer, isolation: "isolate", display: "inline-flex", alignItems: "center", gap: t.pathGap, alignSelf: "flex-start",
  minWidth: 0, maxWidth: "100%", paddingInlineStart: 0, paddingInlineEnd: t.pathPadding,
  border: "none", borderRadius: t.rowRadius, background: "none", font: "inherit", fontSize: t.detail, color: t.detailColor, cursor: "pointer", whiteSpace: "nowrap",
  vars: { [pathFill]: "transparent" },
  "::before": { content: '""', position: "absolute", zIndex: tokens.layer.underlay, insetBlock: 0, insetInlineEnd: 0, insetInlineStart: `calc(-1 * ${t.pathPadding})`, borderRadius: t.rowRadius, backgroundColor: pathFill },
  // Its line is 18 px; its target reaches the dense-surface minimum, never the title (spacing SP-6).
  "::after": { ...hitReach(t.pathHit, "1lh"), insetInlineStart: `calc(-1 * ${t.pathPadding})` },
  selectors: {
    "&:active": { color: t.pathHover, vars: { [pathFill]: t.pressed } },
    "&:focus-visible": { outlineStyle: "none" },
    "&:focus-visible::before": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: t.focusOffset },
  },
  "@media": { "(hover: hover)": { selectors: { "&:hover": { color: t.pathHover, vars: { [pathFill]: t.hover } } } } },
});
export const pathIcon = style({ flexShrink: 0, width: t.pathIcon, height: t.pathIcon });
export const pathWrap = style({ display: "inline-flex", minWidth: 0 });
export const pathHead = style({ minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis" });
export const pathTail = style({ flexShrink: 0 });

// Pin: top right, shown on hover or focus, and always while pinned.
export const pin = style({
  position: "absolute", zIndex: t.controlLayer, top: t.pinInset, insetInlineEnd: t.pinInset, display: "flex", opacity: 0,
  transitionProperty: "opacity", transitionDuration: t.duration, transitionTimingFunction: t.easing,
  selectors: {
    [`${base}:focus-within &, &[data-pinned]`]: { opacity: t.visible },
  },
  "@media": {
    "(hover: hover)": { selectors: { [`${base}:hover &`]: { opacity: t.visible } } },
    "(hover: none)": { opacity: t.visible },
  },
});
globalStyle(`${pin}[data-pinned] button`, { color: t.pinned });

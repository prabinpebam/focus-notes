import { globalStyle, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.openedFiles;

export const root = style({ display: "flex", flexDirection: "column", gap: t.stack, flexShrink: 0, fontFamily: t.font, fontSize: t.fontSize, color: t.text });

/** Reads as a section label, its words lined up with Pinned and Recent after the tree's chevron width. */
export const header = style({
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: t.inlineGap,
  paddingInlineStart: `calc(${t.headerInlineStart} + ${t.chevronSpace} + ${t.inlineGap})`,
});
export const headerLabel = style({
  minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  textTransform: "uppercase", fontSize: t.headerSize, fontWeight: t.strongWeight, color: t.textMuted,
});

export const list = style({ display: "flex", flexDirection: "column", gap: t.tabGap, margin: 0, padding: 0, listStyle: "none" });

/**
 * One box in every state (D-354): only its colours and the name's weight change. The border is on the
 * tab itself, so the close button sits inside it. Inside a project the active tab takes the project
 * accent: its tint as the fill and the accent as its whole outline (owner, 24 November; D-410).
 */
export const tab = style({
  position: "relative", display: "flex", alignItems: "center", gap: t.inlineGap,
  minHeight: t.tabHeight, boxSizing: "border-box", paddingInlineEnd: t.paddingInline,
  borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, borderRadius: t.radius,
  backgroundColor: t.background,
  transitionProperty: "background-color, border-color", transitionDuration: t.duration,
  selectors: {
    "&:active": { backgroundColor: t.hover },
    "&[data-current]": { backgroundColor: t.current },
    "[data-project-accent] &[data-current]": { backgroundColor: t.currentProject, borderColor: t.borderCurrentProject },
  },
  "@media": {
    "(hover: hover)": { selectors: { "&:hover:not([data-current])": { backgroundColor: t.hover } } },
    "(forced-colors: active)": { selectors: {
      "&[data-current], [data-project-accent] &[data-current]": { backgroundColor: t.forcedCurrent, borderColor: t.forcedCurrent, color: t.forcedCurrentText, forcedColorAdjust: "none" },
    } },
  },
});

/** The whole tab but its ×: one click activates. */
export const activate = style({
  display: "flex", alignItems: "center", gap: t.inlineGap, flexGrow: 1, minWidth: 0, minHeight: t.tabHeight, alignSelf: "stretch",
  paddingInlineStart: t.paddingInline, margin: 0, borderStyle: "none", borderRadius: t.radius,
  backgroundColor: t.background, color: "inherit", font: "inherit", fontWeight: t.weight, textAlign: "start", cursor: "default", outline: "none",
});
// Keyboard focus rings the whole tab, inset on its own box, so the panel's scroller never clips it.
globalStyle(`${tab}:has(${activate}[data-focus-visible])`, { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})` });
globalStyle(`${tab}[data-current] ${activate}`, { fontWeight: t.strongWeight });

export const icon = style({ display: "inline-flex", flexShrink: 0, width: t.iconSize, height: t.iconSize, color: t.textMuted });
export const name = style({ flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

/** Its place is always kept, so showing it never moves the name; it shows on hover and keyboard focus. */
export const close = style({
  display: "inline-flex", flexShrink: 0, alignItems: "center", justifyContent: "center",
  width: t.closeSize, height: t.closeSize, padding: 0, margin: 0, borderStyle: "none", borderRadius: t.radius,
  backgroundColor: t.background, color: t.textMuted, cursor: "default", outline: "none", visibility: "hidden",
  selectors: {
    "&[data-pressed]": { backgroundColor: t.closeHover },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
  "@media": {
    "(hover: hover)": { selectors: { "&[data-hovered]": { backgroundColor: t.closeHover } } },
    "(hover: none)": { visibility: "visible" },
  },
});
globalStyle(`${tab}:has([data-focus-visible]) ${close}`, { visibility: "visible" });
globalStyle(`${tab}:hover ${close}`, { "@media": { "(hover: hover)": { visibility: "visible" } } });
globalStyle(`${tab}[data-current] ${icon}, ${tab}[data-current] ${close}`, { "@media": { "(forced-colors: active)": { color: t.forcedCurrentText } } });

/** A list whose current row keeps one weight (Ctrl+Tab's switcher): its highlight moves, so only fill and outline show it and a name never re-truncates. */
export const steadyWeight = style({});
globalStyle(`${steadyWeight} ${tab}[data-current] ${activate}`, { fontWeight: t.weight });

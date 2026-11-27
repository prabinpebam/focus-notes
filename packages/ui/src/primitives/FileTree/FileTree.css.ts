import { globalStyle, createVar, fallbackVar, keyframes, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.fileTree;
/** How deep a row is (aria-level minus one), set per row: each level indents by one step. */
export const depth = createVar({ syntax: "<number>", inherits: false, initialValue: "0" });
export const skippedRows = createVar({ syntax: "<number>", inherits: false, initialValue: "0" });
export const spacer = style({ flexShrink: 0, height: `calc(${skippedRows} * (${t.rowHeight} + ${t.rowGap}) - ${t.rowGap})` });
export const windowed = style({ overflowY: "auto", maxHeight: `calc(12 * (${t.rowHeight} + ${t.rowGap}))` });

// It scrolls with what holds it (the Files sheet's body), which fades its edges (D-111).
export const tree = style({
  display: "flex",
  flexDirection: "column",
  gap: t.rowGap,
  flexShrink: 0,
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  outline: "none",
});

export const row = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: t.gap,
  flexShrink: 0,
  minHeight: t.rowHeight,
  paddingInlineEnd: t.paddingInline,
  paddingInlineStart: `calc(${t.paddingInline} + ${depth} * ${t.indent})`,
  borderRadius: t.radius,
  fontWeight: t.weight,
  cursor: "default",
  outline: "none",
  boxSizing: "border-box",
  transitionProperty: "background-color",
  transitionDuration: t.duration,
  selectors: {
    "&:active": { backgroundColor: t.hover },
    // Text on the selection's color: the same as elsewhere, except in forced colors (HighlightText).
    '&[aria-selected="true"]': { backgroundColor: t.selection, color: t.selectionText, forcedColorAdjust: "none" },
    // The open note: a quiet fill and semibold, never an outline or a side bar (D-111). Selected wins.
    '&[data-current]:not([aria-selected="true"])': { backgroundColor: t.current },
    "&[data-current]": { fontWeight: t.strongWeight },
    "&[data-drop-target]": { boxShadow: `inset 0 0 0 ${t.focusWidth} ${t.accent}` },
    // Inset: drawn inside the item's rounded shape, so no scrolling or clipping container ever cuts it (D-111).
    "&:focus-visible": { outlineStyle: "solid", outlineColor: t.focusRing, outlineWidth: t.focusWidth, outlineOffset: `calc(-1 * ${t.focusWidth})` },
  },
  "@media": { "(hover: hover)": { selectors: { '&:hover:not([aria-selected="true"]):not([data-current])': { backgroundColor: t.hover } } } },
});
/** A root's section label: uppercase, small, muted. */
export const section = style({
  textTransform: "uppercase",
  fontSize: t.sectionSize,
  fontWeight: t.strongWeight,
  color: t.textMuted,
});
export const chevron = style({ display: "inline-flex", flexShrink: 0, width: t.iconSize, height: t.iconSize, alignItems: "center", justifyContent: "center", color: t.textMuted });
export const icon = style({ position: "relative", display: "inline-flex", flexShrink: 0, width: t.iconSize, height: t.iconSize, color: t.textMuted });
export const typeIcon = style({ display: "inline-flex" });
/**
 * D-436 (main, 27 November 13:27 and 13:58): the pin has its own place at the row's end, a slot the size of the
 * row's ⋯ (and Opened files' ×), always reserved so its title never shifts; order: the pin, then ⋯. It never covers
 * the icon's badges (nor they it) at any width or zoom. It shows on hover and keyboard focus, and always without hover.
 */
export const pinSlot = style({ position: "relative", display: "inline-flex", flexShrink: 0, width: t.moreSize, height: t.moreSize });
export const pinControl = style({
  position: "absolute", inset: `calc((${t.moreSize} - ${t.pinSize}) / 2)`, display: "flex", alignItems: "center", justifyContent: "center", visibility: "hidden",
  // Only the button takes the pointer, never the box around it, so the row's ⋯ beside it keeps its whole target.
  pointerEvents: "none",
});
globalStyle(`${pinControl} button`, { pointerEvents: "auto" });
globalStyle(`${row}:focus-within ${pinControl}, ${pinControl}[data-pin-commit]:not([data-pin-commit="rest"])`, { visibility: "visible" });
globalStyle(`${row}:hover ${pinControl}`, { "@media": { "(hover: hover)": { visibility: "visible" } } });
globalStyle(`${row}[aria-selected="true"] ${pinControl} button`, { color: t.selectionTextMuted });
globalStyle(`${pinControl} button`, { flexShrink: 0 });
globalStyle(`${pinControl}`, { "@media": { "(hover: none)": { visibility: "visible" } } });
export const label = style({ flexGrow: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
// It gives way after the label, ending in an ellipsis, so the row keeps its end inset in a narrow window (spacing SP-4).
export const description = style({ flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.textMuted, fontSize: t.captionSize, fontWeight: t.weight, textTransform: "none" });
globalStyle(`${row}[aria-selected="true"] :is(${chevron}, ${icon}, ${description})`, { color: t.selectionTextMuted });
/**
 * D-431 (owner, 26 November): the shared and published badges on the file icon's bottom-right corner.
 * The icon is masked away around each badge by the knockout, so no border or fill separates them.
 */
export const glyph = style({ position: "relative", display: "inline-flex" });
export const badges = style({ position: "absolute", inset: 0 });
export const badge = style({
  position: "absolute", display: "inline-flex", right: 0, bottom: `calc(-1 * ${t.iconBadgeOverhang})`, color: t.badge,
  selectors: { [`${glyph}[data-site-badges="shared published"] &[data-badge="published"]`]: { bottom: "auto", top: `calc(-1 * ${t.iconBadgeOverhang})` } },
  // Forced colours: Highlight (the accent's system colour), and HighlightText where the row or tab is Highlight itself.
  "@media": { "(forced-colors: active)": { forcedColorAdjust: "none" } },
});
globalStyle(`${row}[aria-selected="true"] ${badge}, [data-opened-files] [data-current] ${badge}`, { "@media": { "(forced-colors: active)": { color: t.selectionText } } });
/**
 * D-436: the published badge's live status. Waiting for GitHub Pages: the warning colour inside the commit mark's
 * own-border pending arc; confirmed: success, with its outline; failed: danger, with its outline. The icon's
 * knockout widens by the ring while it shows, so the arc never touches the icon. Forced colours keep the system's
 * Highlight; the arc and outline are the cue there.
 */
const liveRing = createVar();
const ringWidth = `calc(${t.badgeRing} + ${t.badgeRingStroke})`;
globalStyle(`${glyph}[data-site-live], ${icon}:has(${glyph}[data-site-live])`, { vars: { [liveRing]: ringWidth } });
globalStyle(`${badge}[data-live]`, { borderRadius: "50%" });
globalStyle(`${badge}[data-live="pending"]`, { color: t.badgePending });
globalStyle(`${badge}[data-live="confirmed"]`, { color: t.badgeLive });
globalStyle(`${badge}[data-live="failed"]`, { color: t.badgeFailed });
export const liveRingBox = style({ position: "absolute", inset: `calc(-1 * ${ringWidth})`, borderRadius: "50%", pointerEvents: "none" });
globalStyle(`${badge} svg`, { display: "block", width: t.iconBadgeSize, height: t.iconBadgeSize });
const badgeX = `calc(${t.iconSize} - ${t.iconBadgeSize} / 2)`;
const badgeAt = `calc(${t.iconSize} + ${t.iconBadgeOverhang} - ${t.iconBadgeSize} / 2)`;
const badgeTop = `calc(${t.iconBadgeSize} / 2 - ${t.iconBadgeOverhang})`;
const knockout = `calc(${t.iconBadgeSize} / 2 + ${t.iconBadgeKnockout} + ${fallbackVar(liveRing, "0px")})`;
const hole = (y: string, shift?: string) => {
  const at = shift ? `calc(${badgeX} + ${shift}) calc(${y} + ${shift})` : `${badgeX} ${y}`;
  return `radial-gradient(circle at ${at}, ${t.transparent} ${knockout}, ${t.iconBadgeKeep} ${knockout})`;
};
globalStyle(`${glyph}[data-site-badges] > svg`, { maskImage: hole(badgeAt) });
globalStyle(`${glyph}[data-site-badges="shared published"] > svg`, { maskImage: `${hole(badgeAt)}, ${hole(badgeTop)}`, maskComposite: "intersect" });
/** The saving sign appears only after the wait sign's delay (Waits), so quick writes show nothing. */
const appear = keyframes({ to: { visibility: "visible" } });
export const pending = style({
  display: "inline-flex", flexShrink: 0, visibility: "hidden",
  animationName: appear, animationDuration: t.duration, animationDelay: t.signDelay, animationFillMode: "forwards",
});
export const edit = style({ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0, paddingBlock: t.gap });
export const input = style({
  minHeight: t.inputHeight,
  paddingInline: t.gap,
  fontFamily: t.font,
  fontSize: t.fontSize,
  color: t.text,
  backgroundColor: t.inputBackground,
  borderStyle: "solid",
  borderWidth: t.outlineWidth,
  borderColor: t.inputBorder,
  borderRadius: t.radius,
  outline: "none",
  selectors: {
    "&:focus": { borderColor: t.focusRing, boxShadow: `0 0 0 ${t.outlineWidth} ${t.focusRing}` },
    '&[aria-invalid="true"]': { borderColor: t.danger },
  },
});
/**
 * The row's ⋯ (D-162): opens its menu with the pointer; the keyboard has Shift+F10 and the Menu key. Its
 * place is kept, so showing it never moves the label; it shows on hover, focus, selection, and while open.
 */
export const more = style({
  display: "inline-flex", flexShrink: 0, alignItems: "center", justifyContent: "center",
  width: t.moreSize, height: t.moreSize, borderRadius: t.radius, color: t.textMuted, visibility: "hidden",
  selectors: { "&:active": { backgroundColor: t.moreHover } },
  "@media": {
    "(hover: hover)": { selectors: { "&:hover": { backgroundColor: t.moreHover }, [`${row}:hover &`]: { visibility: "visible" } } },
    "(hover: none)": { visibility: "visible" },
  },
});
globalStyle(`${row}:focus-visible ${more}, ${row}[aria-selected="true"] ${more}, ${row}[data-menu-open] ${more}`, { visibility: "visible" });
globalStyle(`${row}[aria-selected="true"] ${more}`, { color: t.selectionTextMuted });
/** Where a right-click's menu opens: the pointer's place in the row, set as it opens. */
export const anchorX = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const anchorY = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const anchor = style({ position: "absolute", left: anchorX, top: anchorY, width: 0, height: 0, pointerEvents: "none" });
/** Read by screen readers, not shown: the comma between a row's name and its description. */
// Inline and without size, so the name reads "About, public" with no space before the comma.
export const srOnly = style({ display: "inline", fontSize: 0 });
export const error = style({ color: t.danger, fontSize: t.captionSize, whiteSpace: "normal" });

/** A section's own control at its trailing end (a repository's backup, D-191): in the heading's case and size, not upper-cased. */
export const accessory = style({ display: "inline-flex", flexShrink: 0, alignItems: "center", textTransform: "none" });

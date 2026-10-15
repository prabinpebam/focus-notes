import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.itemCard;

export const base = style({
  display: "flex", alignItems: "center", flexWrap: "wrap", gap: t.gap, minWidth: 0,
  padding: t.padding.m, backgroundColor: t.background, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.border, borderRadius: t.radius,
  fontFamily: t.font, lineHeight: t.lineHeight,
});
export const large = style({ padding: t.padding.l });
export const tile = style({
  flexShrink: 0, width: t.tile, height: t.tile, display: "flex", alignItems: "center", justifyContent: "center",
  backgroundColor: t.tileBackground, color: t.tileColor, borderRadius: t.tileRadius,
});
export const tileIcon = style({ width: t.tileIcon, height: t.tileIcon });
export const avatar = style({
  flexShrink: 0, width: t.avatar, height: t.avatar, borderRadius: t.avatarRadius, objectFit: "cover", display: "flex", alignItems: "center", justifyContent: "center",
  backgroundColor: t.initialsBackground, color: t.initialsColor, fontSize: t.initialsSize, fontWeight: t.titleWeight,
});
// The text takes the room left; actions wrap below it in a narrow window (D-111).
export const text = style({ display: "flex", flexDirection: "column", gap: t.textGap, flexGrow: 1, flexShrink: 1, flexBasis: t.textMin, minWidth: 0 });
export const title = style({ margin: 0, fontSize: t.title.m, fontWeight: t.titleWeight, color: t.titleColor, overflowWrap: "anywhere" });
export const titleLarge = style({ fontSize: t.title.l });
export const detail = style({ display: "flex", alignItems: "center", flexWrap: "wrap", gap: t.textGap, fontSize: t.detail, color: t.detailColor, overflowWrap: "anywhere" });
export const mark = style({ width: t.markSize, height: t.markSize, flexShrink: 0 });
export const badge = style({
  display: "inline-flex", alignItems: "center", paddingInline: t.badgePaddingInline, borderStyle: "solid", borderWidth: t.borderWidth, borderColor: t.badgeBorder,
  borderRadius: t.badgeRadius, fontSize: t.badgeSize, color: t.badgeColor,
});
export const actions = style({ display: "flex", alignItems: "center", gap: t.textGap, flexShrink: 0, marginInlineStart: "auto" });
// The whole card is the action (D-131): one button, the accent edge says it's the step's main one.
export const pressable = style({
  width: "100%", textAlign: "start", color: "inherit", cursor: "default", outline: "none", flexWrap: "nowrap",
  borderColor: t.action.border,
  transitionProperty: "background-color, box-shadow", transitionDuration: t.action.duration, transitionTimingFunction: t.action.easing,
  selectors: {
    '&[data-hovered]:not([aria-disabled="true"])': { backgroundColor: t.action.hover },
    '&[data-pressed]:not([aria-disabled="true"])': { backgroundColor: t.action.pressed },
    "&[data-focus-visible]": { outlineStyle: "solid", outlineColor: t.action.focusRing, outlineWidth: t.action.focusWidth, outlineOffset: t.action.focusOffset },
    '&[aria-disabled="true"]': { opacity: t.action.disabledOpacity },
    // Unavailable (offline): a neutral edge, so it never reads as selected and disabled at once (D-142).
    "&[data-unavailable]": { borderColor: t.border },
  },
});
export const chevron = style({ width: t.markSize, height: t.markSize, flexShrink: 0, color: t.detailColor });

// The step's main action (D-142): its tile in the accent and its title large, so it outweighs the step's title.
export const tileAction = style({ backgroundColor: t.action.tileBackground, color: t.action.tileColor });
export const titleAction = style({ fontSize: t.action.title });

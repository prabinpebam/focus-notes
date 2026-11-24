import { style, styleVariants } from "@vanilla-extract/css";
import { tokens, breakpoints } from "@focus-notes/tokens";

export const base = style({ display: "flex", flexDirection: "column", width: "100%", marginInline: "auto", boxSizing: "border-box" });
export const maxWidth = styleVariants({
  measure: { maxWidth: tokens.layout.measure },
  wideContent: { maxWidth: tokens.layout.wideContent },
  popover: { maxWidth: tokens.layout.popover },
  dialogS: { maxWidth: tokens.layout.dialogS },
  dialogL: { maxWidth: tokens.layout.dialogL },
  onboarding: { maxWidth: tokens.layout.onboarding },
});
// middle: centred in the height too, while there's room; taller than its scroller, it starts at the top and scrolls (D-126).
// anchored: placed as a block of layout.onboardingBlock would be centred, its content at the top of it, so content
// grows downward from that anchor without re-centring when progress makes it taller (DSK-09, D-148).
// Because insetBlockStart shifts the painted box past the scroller's bottom padding, paddingBlockEnd restores
// the exact displaced portion of insetLg (up to insetLg) so overflowing content scrolls fully with token clearance.
export const block = styleVariants({
  start: {},
  middle: { flexShrink: 0, marginBlock: "auto" },
  anchored: {
    position: "relative",
    flexShrink: 0,
    insetBlockStart: `max(0px, calc((100% - ${tokens.layout.onboardingBlock}) / 2))`,
    minHeight: `min(${tokens.layout.onboardingBlock}, 100%)`,
    paddingBlockEnd: `min(${tokens.space.insetLg}, max(0px, calc((100cqh - ${tokens.layout.titleBar} - ${tokens.layout.onboardingBlock}) / 2 - ${tokens.space.insetLg})))`,
  },
});
export const gutter = styleVariants({
  none: {},
  regular: { paddingInline: tokens.layout.gutter, "@media": { [`(max-width: ${breakpoints.medium - 1}px)`]: { paddingInline: tokens.layout.gutterCompact } } },
});

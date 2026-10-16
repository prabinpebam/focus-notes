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
// shorter than that changes height without moving what's already shown (DSK-09, D-148); held to its scroller's height.
export const block = styleVariants({
  start: {},
  middle: { marginBlock: "auto" },
  anchored: { marginBlock: "auto", minHeight: `min(${tokens.layout.onboardingBlock}, 100%)` },
});
export const gutter = styleVariants({
  none: {},
  regular: { paddingInline: tokens.layout.gutter, "@media": { [`(max-width: ${breakpoints.medium - 1}px)`]: { paddingInline: tokens.layout.gutterCompact } } },
});

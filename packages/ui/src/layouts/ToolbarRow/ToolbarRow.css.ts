import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// Wraps onto a second row when its container is narrower than its actions (320 px, WCAG 1.4.10).
export const row = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.space.xs });

import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

export const row = style({ display: "flex", alignItems: "center", gap: tokens.space.xs });

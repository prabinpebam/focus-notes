import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.siteFigure;

export const root = style({ display: "block", width: "100%", maxWidth: t.maxWidth, marginInline: "auto", borderRadius: t.radius, overflow: "hidden" });
export const image = style({ display: "block", width: "100%", height: "auto" });
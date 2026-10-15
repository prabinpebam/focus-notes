import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.stepDots;

export const base = style({ display: "inline-flex", alignItems: "center", gap: t.gap, height: t.dot });
export const dot = style({ display: "block", width: t.dot, height: t.dot, borderRadius: t.radius, flexShrink: 0 });
export const done = style({ backgroundColor: t.done });
export const on = style({ width: t.current, backgroundColor: t.on });
export const todo = style({ backgroundColor: t.todo });

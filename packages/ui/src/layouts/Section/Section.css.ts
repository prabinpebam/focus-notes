import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

// Space alone groups a section (spacing SP-12): the heading stackItem above its items, the items stackGroup apart.
export const base = style({ display: "flex", flexDirection: "column", gap: tokens.space.stackItem, minWidth: 0 });
export const header = style({ display: "flex", flexDirection: "column", minWidth: 0 });
export const body = style({ display: "flex", flexDirection: "column", gap: tokens.space.stackGroup, minWidth: 0 });

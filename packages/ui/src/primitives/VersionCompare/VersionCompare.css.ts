import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.versionCompare;

export const root = style({ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: t.gap, fontFamily: t.font, fontSize: t.size });
export const pill = style({ display: "inline-flex", alignItems: "center", gap: t.pillGap, height: t.height, paddingInline: t.paddingInline, borderRadius: t.radius, whiteSpace: "nowrap" });
export const found = style({ backgroundColor: t.found.background, color: t.found.text });
export const needed = style({ backgroundColor: t.needed.background, color: t.needed.text });
export const value = style({ fontFamily: t.valueFont, fontWeight: t.valueWeight });
export const arrow = style({ width: t.icon, height: t.icon, color: t.arrow, flexShrink: 0 });

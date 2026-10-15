import { style, styleVariants } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.strengthMeter;

export const root = style({ display: "flex", alignItems: "center", gap: t.labelGap, fontFamily: t.font, fontSize: t.size });
export const track = style({ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: t.gap, flexGrow: 1, minWidth: 0 });
export const segment = style({ height: t.height, borderRadius: t.radius, backgroundColor: t.track });
export const fill = styleVariants({ weak: { backgroundColor: t.weak }, fair: { backgroundColor: t.fair }, strong: { backgroundColor: t.strong } });
export const ink = styleVariants({ weak: { color: t.weak }, fair: { color: t.fair }, strong: { color: t.strong } });
export const text = style({ flexShrink: 0, whiteSpace: "nowrap" });

import { style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.notificationRegion;
export const root = style({ display: "flex", flexDirection: "column", alignItems: "center", gap: t.gap, maxWidth: t.maxWidth, width: "100%" });
export const more = style({ alignSelf: "center", paddingBlock: t.morePaddingBlock, paddingInline: t.morePaddingInline, borderRadius: t.moreRadius, backgroundColor: t.moreBackground, color: t.moreText, fontFamily: t.font, fontSize: t.moreSize });

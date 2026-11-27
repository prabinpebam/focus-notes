import { createVar, fallbackVar, style } from "@vanilla-extract/css";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.tooltip;

/** D-436: the drawn window's width less its edges, set by the placement code. */
export const windowMaxVar = createVar();

/** Registered lengths, so the placement code reads the tokens' computed pixels. */
export const gapVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });
export const edgeVar = createVar({ syntax: "<length>", inherits: false, initialValue: "0px" });

export const tooltip = style({
  vars: { [gapVar]: t.offset, [edgeVar]: t.edge },
  // Placed by its code next to its control, in the window's coordinates (Tooltip.tsx).
  position: "fixed",
  left: 0,
  top: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: t.gap,
  width: "max-content",
  // D-436: never wider than its token or the window less its edges; long words (an address) wrap anywhere.
  maxWidth: `min(${t.maxWidth}, ${fallbackVar(windowMaxVar, t.maxWidth)})`,
  overflowWrap: "anywhere",
  backgroundColor: t.background,
  color: t.text,
  borderRadius: t.radius,
  paddingInline: t.paddingInline,
  paddingBlock: t.paddingBlock,
  fontFamily: t.font,
  fontSize: t.fontSize,
  whiteSpace: "normal",
  boxShadow: t.shadow,
  zIndex: t.layer,
  pointerEvents: "none",
  transitionProperty: "opacity",
  transitionDuration: t.duration,
  selectors: {
    "&[data-entering]": { opacity: 0, transitionDuration: "0s" },
  },
  // Forced colours: its own system colours (CanvasText fill, Canvas text), never the text backplate that hid its words.
  "@media": { "(forced-colors: active)": { forcedColorAdjust: "none" } },
});

export const shortcut = style({ opacity: t.shortcutOpacity });

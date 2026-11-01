import type { AnchorRect } from "./anchors.ts";

/** Placement for a selection that can span or partly leave the editor viewport (D-265). */
export function placeSelection(
  fragments: readonly AnchorRect[],
  viewport: AnchorRect,
  size: { width: number; height: number },
  metrics: { edge: number; gap: number },
) {
  const visible = fragments.filter((r) => r.bottom > r.top && r.right > r.left
    && r.bottom > viewport.top && r.top < viewport.bottom && r.right > viewport.left && r.left < viewport.right);
  const anchor = visible.at(-1) ?? fragments.at(-1) ?? viewport;
  const width = Math.min(size.width, Math.max(0, viewport.right - viewport.left - 2 * metrics.edge));
  const height = Math.min(size.height, Math.max(0, viewport.bottom - viewport.top - 2 * metrics.edge));
  const minX = viewport.left + metrics.edge;
  const minY = viewport.top + metrics.edge;
  const maxX = Math.max(minX, viewport.right - metrics.edge - width);
  const maxY = Math.max(minY, viewport.bottom - metrics.edge - height);
  const below = Math.min(anchor.bottom, viewport.bottom) + metrics.gap;
  const above = Math.max(anchor.top, viewport.top) - metrics.gap - height;
  const side = below + height <= viewport.bottom - metrics.edge || above < minY ? "below" : "above";
  const offscreen = visible.length === 0;
  return {
    x: Math.max(minX, Math.min(anchor.left, maxX)),
    y: offscreen ? anchor.bottom + metrics.gap : Math.max(minY, Math.min(side === "below" ? below : above, maxY)),
    width, height, side, offscreen,
  };
}

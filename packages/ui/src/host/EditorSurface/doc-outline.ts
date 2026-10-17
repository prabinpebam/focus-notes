/**
 * The document minimap's rules (UI-13, D-185), apart from the DOM: which headings it lists, how the
 * rail lays them out, which section is current, and whether there's room for it.
 */

/** A note's top-level heading: its node position, level, text, and index among the note's blocks. */
export interface OutlineHeading {
  pos: number;
  level: number;
  text: string;
  index: number;
}

interface DocLike {
  forEach(fn: (node: { type: { name: string }; attrs: Record<string, unknown>; textContent: string }, offset: number, index: number) => void): void;
}

/** The rail and card show with this many headings or more, as Notion's do. */
export const MIN_HEADINGS = 2;

/** Top-level headings only: a heading in a list or quote isn't a section of the note. */
export function outlineOf(doc: DocLike): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  doc.forEach((node, offset, index) => {
    if (node.type.name === "heading") out.push({ pos: offset, level: Number(node.attrs.level) || 1, text: node.textContent.trim(), index });
  });
  return out;
}

/** Depth below the note's shallowest heading: a note of only H2s and H3s draws them as 0 and 1. */
export function depthsOf(headings: readonly { level: number }[]): number[] {
  if (!headings.length) return [];
  const min = Math.min(...headings.map((h) => h.level));
  return headings.map((h) => h.level - min);
}

export interface OutlineNode {
  /** The heading's index in the outline. */
  i: number;
  children: OutlineNode[];
}

/** The outline as a tree, each heading under the last shallower one, so assistive technology hears the levels (1.3.1). */
export function nestOutline(depths: readonly number[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: { depth: number; node: OutlineNode }[] = [];
  depths.forEach((depth, i) => {
    const node: OutlineNode = { i, children: [] };
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    (stack.length ? stack[stack.length - 1]!.node.children : root).push(node);
    stack.push({ depth, node });
  });
  return root;
}

/**
 * Evenly spaced bars: the full pitch while they fit `maxHeight`, a smaller one down to `minPitch`,
 * then evenly sampled headings, the first, last and current always among them.
 */
export function railLayout(count: number, maxHeight: number, maxPitch: number, minPitch: number, current: number): { pitch: number; indices: number[] } {
  if (count <= 0) return { pitch: maxPitch, indices: [] };
  const all = () => Array.from({ length: count }, (_, i) => i);
  // Unrounded: the interface scale makes the minimum pitch fractional (3.6 px at 90%).
  const exact = maxHeight / count;
  if (exact >= minPitch) return { pitch: Math.max(minPitch, Math.min(maxPitch, Math.floor(exact))), indices: all() };
  const slots = Math.min(count, Math.max(2, Math.floor(maxHeight / minPitch)));
  if (slots >= count) return { pitch: minPitch, indices: all() };
  const picked = Array.from({ length: slots }, (_, k) => Math.round((k * (count - 1)) / (slots - 1)));
  // The slot nearest the current heading stands for it, never the first or last (so with two slots, none).
  if (slots > 2 && current >= 0 && current < count && !picked.includes(current)) {
    let near = 1;
    for (let k = 1; k < slots - 1; k++) if (Math.abs(picked[k]! - current) < Math.abs(picked[near]! - current)) near = k;
    picked[near] = current;
  }
  return { pitch: minPitch, indices: picked };
}

/** Binary search: the last heading whose block is at or before `block`, or -1. */
export function caretSection(headings: readonly { index: number }[], block: number): number {
  let lo = 0;
  let hi = headings.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (headings[mid]!.index <= block) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Reading, not writing: the last heading whose top is at or above the reading line; at the end of the
 * note, the last one in view, so a short last section can still be current. Tops and the line are in
 * the scroller's coordinates (0 is its top edge).
 */
export function scrollSection(tops: readonly number[], line: number, atEnd: boolean, viewportBottom: number): number {
  let found = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i]! <= line + 1) found = i;
    else if (atEnd && tops[i]! < viewportBottom) found = i;
    else break;
  }
  return found;
}

/** Whether the rail fits between the text and the scrollbar without covering a word. */
export function railShows(o: { textRight: number; contentRight: number; railWidth: number; railInset: number; clearance: number }): boolean {
  return o.textRight + o.clearance + o.railWidth + o.railInset <= o.contentRight;
}

/**
 * The room a pinned card keeps on the note's right (D-186): the text column's margin is held clear of
 * the card plus the gap between them (less the column's own gutter, which is already empty). 0 when
 * the text left of it would be narrower than `minText`: the card then doesn't pin, and the rail is back.
 * Positions are window pixels; the card's right edge is `cardRight`, the scroller's content box spans
 * `contentLeft` to `contentRight`, and `leftClear` is what a pinned Files sheet already takes (D-161).
 */
export function pinnedReserve(o: { contentLeft: number; contentRight: number; cardRight: number; width: number; clearance: number; gutter: number; leftClear: number; minText: number }): number {
  if (o.width <= 0) return 0;
  const keep = Math.max(0, o.contentRight - (o.cardRight - o.width - o.clearance) - o.gutter);
  const text = o.contentRight - o.contentLeft - o.leftClear - keep - 2 * o.gutter;
  return text >= o.minText ? Math.ceil(keep) : 0;
}

/** The card's top: centred on the rail, kept between `minTop` and `maxBottom` (top first, if it can't fit). */
export function cardTop(railCenter: number, height: number, minTop: number, maxBottom: number): number {
  return Math.max(minTop, Math.min(railCenter - height / 2, maxBottom - height));
}

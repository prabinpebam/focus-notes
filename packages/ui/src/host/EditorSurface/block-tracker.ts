/**
 * The block handle's editor side (IA-CMP-HANDLE, EDT-07): follows the pointer down the note, finds the
 * block it's level with (a list item, or a top-level block), and publishes where the grip goes. It
 * reports the block (`block` event) only when that changes, measures in one animation frame, and
 * hides while typing, so the blank canvas stays blank (UI-06). Tables have their own handles.
 */
import type { Editor } from "@tiptap/react";
import { blockInfo, blockTextStart } from "@focus-notes/editor";
import { blockGeometry, type BlockTarget } from "../../behaviors/block-geometry.ts";
import type { Box } from "../../behaviors/table-geometry.ts";

export interface BlockPayload {
  visible: boolean;
  block: number;
  kind: string;
  level: number;
  first: boolean;
  last: boolean;
  text: string;
}
const NONE: BlockPayload = { visible: false, block: -1, kind: "", level: 0, first: false, last: false, text: "" };
/** The grip stays this long after the pointer leaves the note, so it can be reached. */
const LEAVE_DELAY_MS = 200;
const LISTS = new Set(["UL", "OL"]);

const box = (r: DOMRect): Box => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });

/** The last of `els` whose top is at or above `y` (they're in order down the page), else the first. */
function at(els: HTMLElement[], y: number): HTMLElement | null {
  let lo = 0;
  let hi = els.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (els[mid]!.getBoundingClientRect().top <= y) lo = mid;
    else hi = mid - 1;
  }
  return els[lo]!;
}

export interface BlockTracker {
  /** The block menu was asked for from the keyboard: the grip goes to the caret's block. */
  menu(): void;
  dispose(): void;
}

export function trackBlocks(editor: Editor, scroller: HTMLElement, column: HTMLElement, emit: (p: BlockPayload) => void): BlockTracker {
  const view = editor.view;
  let pointer: { x: number; y: number } | null = null;
  let typing = false;
  let pinned: number | null = null;
  let shown: number | null = null;
  let leaving: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let last = "";

  const publish = (p: BlockPayload) => {
    const key = JSON.stringify(p);
    if (key === last) return;
    last = key;
    emit(p);
  };
  const clear = () => {
    shown = null;
    blockGeometry.set(null);
    publish(NONE);
  };

  /** The block (its position) whose DOM is `el`: a list item, or a top-level block. */
  const posOf = (el: HTMLElement, item: boolean): number | null => {
    try {
      const inside = view.posAtDOM(el, 0);
      const $p = view.state.doc.resolve(inside);
      const pos = item ? inside - 1 : $p.depth >= 1 ? $p.before(1) : inside;
      return blockInfo(view.state, pos) ? pos : null;
    } catch {
      return null;
    }
  };
  /** The block level with `y`: the top-level block there, or the list item, however deeply nested. */
  const blockAt = (y: number): number | null => {
    const top = at([...view.dom.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains("ProseMirror-gapcursor")), y);
    if (!top) return null;
    if (top.matches("[data-table]")) return null;
    let list: HTMLElement | null = LISTS.has(top.tagName) ? top : null;
    let found: number | null = list ? null : posOf(top, false);
    while (list) {
      const li = at([...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.tagName === "LI"), y);
      if (!li) break;
      found = posOf(li, true) ?? found;
      const nested = [...li.children].find((c): c is HTMLElement => c instanceof HTMLElement && LISTS.has(c.tagName) && c.getBoundingClientRect().top <= y);
      list = nested ?? null;
    }
    return found;
  };

  const measure = () => {
    frame = 0;
    if (editor.isDestroyed) return;
    if (!editor.isEditable) return clear();
    let pos: number | null = null;
    if (blockGeometry.held && shown !== null) pos = shown;
    else if (pinned !== null) pos = pinned;
    else if (pointer && !typing) {
      const s = scroller.getBoundingClientRect();
      if (pointer.y >= s.top && pointer.y <= s.bottom) pos = blockAt(pointer.y);
    }
    if (pos === null && shown !== null && leaving) pos = shown;
    // Typing: the grip just goes, without a word to the app, so nothing runs on the typing path (PRF-01).
    if (pos === null && typing) {
      shown = null;
      blockGeometry.set(null);
      return;
    }
    const info = pos === null ? null : blockInfo(view.state, pos);
    const dom = info ? (view.nodeDOM(info.block) as HTMLElement | null) : null;
    if (!info || !dom?.getBoundingClientRect || info.kind === "table") return clear();
    shown = info.block;
    const b = box(dom.getBoundingClientRect());
    // Level with the block's first line: its first text position, where there is one.
    let line: Box = { ...b, bottom: Math.min(b.bottom, b.top + 24) };
    try {
      const first = blockTextStart(view.state, info.block);
      if (first !== null) {
        const c = view.coordsAtPos(first);
        line = { top: c.top, bottom: c.bottom, left: b.left, right: b.right };
      }
    } catch { /* a leaf (a divider): its box */ }
    blockGeometry.set({ block: info.block, box: b, line, column: column.getBoundingClientRect().left });
    publish({ visible: true, ...info });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    // Chromium sends a move with the same coordinates after a scroll or a layout change: that's not
    // the hand moving, so typing keeps the grip hidden, and nothing is measured on the typing path.
    if (pointer && pointer.x === e.clientX && pointer.y === e.clientY) return;
    pointer = { x: e.clientX, y: e.clientY };
    typing = false;
    pinned = null;
    clearTimeout(leaving);
    leaving = undefined;
    schedule();
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pointer = null;
    clearTimeout(leaving);
    leaving = setTimeout(() => { leaving = undefined; schedule(); }, LEAVE_DELAY_MS);
    schedule();
  };
  // Typing hides the grip until the pointer moves again (UI-06).
  const onKey = (e: KeyboardEvent) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key) || blockGeometry.held) return;
    typing = true;
    pinned = null;
    if (shown !== null) {
      shown = null;
      blockGeometry.set(null);
    }
  };
  // An edit moves the grip with its block; while typing, or with no grip, there's nothing to do.
  const onTransaction = () => {
    if (typing || (shown === null && pinned === null && !blockGeometry.held)) return;
    schedule();
  };
  editor.on("transaction", onTransaction);
  editor.on("blur", onTransaction);
  scroller.addEventListener("pointermove", onMove, { passive: true });
  scroller.addEventListener("pointerleave", onLeave);
  scroller.addEventListener("scroll", schedule, { passive: true });
  view.dom.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", schedule);
  blockGeometry.refresh = schedule;
  blockGeometry.scrollBy = (dy) => scroller.scrollBy({ top: dy });
  blockGeometry.targets = (block) => {
    // Every boundary between the block's siblings: a list item lands only within its list.
    const out: BlockTarget[] = [];
    try {
      const $b = view.state.doc.resolve(block);
      const parent = $b.parent;
      const start = $b.start();
      const rects: { pos: number; r: DOMRect }[] = [];
      parent.forEach((_n, offset) => {
        const el = view.nodeDOM(start + offset) as HTMLElement | null;
        if (el?.getBoundingClientRect) rects.push({ pos: start + offset, r: el.getBoundingClientRect() });
      });
      const col = column.getBoundingClientRect();
      const left = $b.depth > 0 && rects[0] ? Math.min(rects[0].r.left, col.right) : col.left;
      for (let i = 0; i <= rects.length; i++) {
        const prev = rects[i - 1];
        const next = rects[i];
        const y = !prev ? next!.r.top : !next ? prev.r.bottom : (prev.r.bottom + next.r.top) / 2;
        out.push({ to: next ? next.pos : start + parent.content.size, at: y, left, right: col.right });
      }
    } catch { /* the note changed under the drag */ }
    return out;
  };
  schedule();

  return {
    menu() {
      const info = blockInfo(view.state);
      pinned = info?.block ?? null;
      cancelAnimationFrame(frame);
      measure();
    },
    dispose() {
      cancelAnimationFrame(frame);
      clearTimeout(leaving);
      editor.off("transaction", onTransaction);
      editor.off("blur", onTransaction);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerleave", onLeave);
      scroller.removeEventListener("scroll", schedule);
      view.dom.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", schedule);
      blockGeometry.refresh = () => {};
      blockGeometry.targets = () => [];
      blockGeometry.scrollBy = () => {};
      blockGeometry.set(null);
    },
  };
}

import type { Editor } from "@tiptap/react";
import { clearance, pinnedRight, pinnedSheet } from "../../behaviors/pinned-sheet.ts";
import * as s from "./EditorSurface.css.ts";

const varName = (v: string) => v.slice(4, -1);
/** The longest a glide is followed without its end being heard (a transition that never ran). */
const GLIDE_LIMIT_MS = 2000;
const seconds = (v: string) => {
  const first = v.split(",")[0]!.trim();
  return first.endsWith("ms") ? parseFloat(first) : parseFloat(first) * 1000;
};

/**
 * The note's text beside a pinned Files sheet (D-161): the column is laid out right of the sheet, a gap
 * after it, centred in what's left, narrower down to the minimum, else under the sheet as before.
 * Pinning and unpinning glide over motion.sheet (reduced motion: at once); a window resize follows at
 * once. Throughout, the line with the caret keeps its height in the window: the scroll follows the
 * reflow every frame, before it's drawn. Returns a cleanup function.
 */
export function keepClearOfPinned(scroller: HTMLElement, column: HTMLElement, editor: Editor): () => void {
  let current: string | undefined;
  let pinned = pinnedSheet.get() !== undefined;
  let pinnedOnRight = pinnedRight.get() > 0;
  let frame = 0;
  /** A glide is running: held until it ends (its transitionend), however few frames the window draws. */
  let gliding = false;
  let until = 0;
  let anchor: number | undefined;
  const px = (v: string) => parseFloat(getComputedStyle(scroller).getPropertyValue(varName(v))) || 0;
  const caretTop = () => {
    if (editor.isDestroyed) return undefined;
    try {
      return editor.view.coordsAtPos(editor.state.selection.head).top;
    } catch {
      return undefined;
    }
  };
  /** Puts the caret's line back where it was, then again each frame until the glide ends. */
  const hold = () => {
    frame = 0;
    if (anchor === undefined) return;
    const y = caretTop();
    if (y !== undefined && Math.abs(y - anchor) >= 0.5) scroller.scrollTop += y - anchor;
    if (gliding || performance.now() < until) frame = requestAnimationFrame(hold);
    else anchor = undefined;
  };
  const apply = (glide: boolean) => {
    const box = scroller.getBoundingClientRect();
    // A pinned contents card keeps its room on the right (D-186); the sheet's clearance is what's left.
    const keep = pinnedRight.get();
    const next = clearance({
      edge: pinnedSheet.get(), left: box.left + scroller.clientLeft, width: scroller.clientWidth - keep,
      gap: px(s.pinnedGapVar), gutter: parseFloat(getComputedStyle(column).paddingLeft) || 0, minText: px(s.pinnedMinVar),
    });
    const key = `${next}|${keep}`;
    if (key === current) return;
    const first = current === undefined;
    current = key;
    anchor ??= caretTop();
    // Only pinning and unpinning glide; the first layout and a resize are at once.
    if (first || !glide) scroller.dataset.pinnedInstant = "";
    else delete scroller.dataset.pinnedInstant;
    scroller.style.setProperty(varName(s.pinnedClearVar), `${next}px`);
    scroller.style.setProperty(varName(s.pinnedRightVar), `${keep}px`);
    const ms = first || !glide ? 0 : seconds(getComputedStyle(scroller).transitionDuration) || 0;
    gliding = ms > 0;
    // A safety net only: the glide's end is its transitionend.
    until = performance.now() + (gliding ? GLIDE_LIMIT_MS : 0);
    // Laid out now (reduced motion, a resize), or each frame of the glide, before it's drawn.
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    hold();
  };
  /** The glide ended: the caret's line is put back once more, then left alone. A glide replaced midway ends with its replacement. */
  const ended = (e: TransitionEvent) => {
    if (e.target !== scroller || (e.propertyName !== varName(s.pinnedClearVar) && e.propertyName !== varName(s.pinnedRightVar))) return;
    gliding = false;
    until = 0;
    if (frame) cancelAnimationFrame(frame);
    hold();
  };
  scroller.addEventListener("transitionend", ended);
  apply(false);
  const off = pinnedSheet.subscribe((edge) => {
    const now = edge !== undefined;
    apply(now !== pinned);
    pinned = now;
  });
  // The contents card pinned or unpinned glides; its width changing (a new note) is at once.
  const offRight = pinnedRight.subscribe((width) => {
    const now = width > 0;
    apply(now !== pinnedOnRight);
    pinnedOnRight = now;
  });
  const ro = new ResizeObserver(() => apply(false));
  ro.observe(scroller);
  return () => {
    off();
    offRight();
    ro.disconnect();
    scroller.removeEventListener("transitionend", ended);
    if (frame) cancelAnimationFrame(frame);
    scroller.style.removeProperty(varName(s.pinnedClearVar));
    scroller.style.removeProperty(varName(s.pinnedRightVar));
  };
}

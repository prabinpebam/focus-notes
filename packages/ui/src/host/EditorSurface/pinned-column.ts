import type { Editor } from "@tiptap/react";
import { dockLeft, pinnedRight } from "../../behaviors/pinned-sheet.ts";
import * as s from "./EditorSurface.css.ts";

const varName = (v: string) => v.slice(4, -1);
/** The longest a glide is followed without its end being heard (a transition that never ran). */
const GLIDE_LIMIT_MS = 2000;
const seconds = (v: string) => {
  const first = v.split(",")[0]!.trim();
  return first.endsWith("ms") ? parseFloat(first) : parseFloat(first) * 1000;
};

/**
 * The note between docked panels (D-187): the scroller, its scrollbar with it, is laid out between
 * docked Files on the left and the docked contents on the right, and the text column is centred in it.
 * Docking and undocking glide over motion.sheet (reduced motion: at once); resizing a panel and a
 * window resize follow at once. Throughout, the line with the caret keeps its height in the window:
 * the scroll follows the reflow every frame, before it's drawn. Returns a cleanup function.
 */
export function keepClearOfPinned(scroller: HTMLElement, column: HTMLElement, editor: Editor): () => void {
  void column;
  let current: string | undefined;
  let dockedLeft = dockLeft.get() > 0;
  let pinnedOnRight = pinnedRight.get() > 0;
  let frame = 0;
  /** A glide is running: held until it ends (its transitionend), however few frames the window draws. */
  let gliding = false;
  let until = 0;
  let anchor: number | undefined;
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
    const leftWidth = dockLeft.get();
    const keep = pinnedRight.get();
    const key = `${leftWidth}|${keep}`;
    if (key === current) return;
    const first = current === undefined;
    current = key;
    anchor ??= caretTop();
    // Only docking and undocking glide; the first layout, resizing a panel and a window resize are at once.
    if (first || !glide) scroller.dataset.pinnedInstant = "";
    else delete scroller.dataset.pinnedInstant;
    scroller.style.setProperty(varName(s.pinnedClearVar), `${leftWidth}px`);
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
  // Docking or undocking Files glides; resizing it follows the pointer at once.
  const off = dockLeft.subscribe((width) => {
    const now = width > 0;
    apply(now !== dockedLeft);
    dockedLeft = now;
  });
  // The contents docking or undocking glides; resizing it, or its width changing, is at once.
  const offRight = pinnedRight.subscribe((width) => {
    const now = width > 0;
    apply(now !== pinnedOnRight);
    pinnedOnRight = now;
  });
  return () => {
    off();
    offRight();
    scroller.removeEventListener("transitionend", ended);
    if (frame) cancelAnimationFrame(frame);
    scroller.style.removeProperty(varName(s.pinnedClearVar));
    scroller.style.removeProperty(varName(s.pinnedRightVar));
  };
}

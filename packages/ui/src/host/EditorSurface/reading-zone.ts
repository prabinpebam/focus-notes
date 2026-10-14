import type { Editor } from "@tiptap/react";
import { tokens } from "@focus-notes/tokens";

const t = tokens.cmp.editorSurface;
/** The CSS custom property name inside a token reference such as "var(--fn-x)". */
const varName = (ref: string) => ref.slice(4, -1);

/**
 * Keeps the line being edited inside the reading zone (UI-11, D-78): the band between
 * readingZone.top and readingZone.bottom of the editor's height. ProseMirror's own scrolling uses
 * the band as its threshold and margin, so typing and arrow keys land inside it; clicks, focus, and
 * other selection moves are checked after the frame. A drag-selection waits for the pointer to lift.
 * Scrolling never brings the caret back: not the wheel, nor pressing, dragging, or clicking the
 * scrollbar (or the scroller around the note), nor the focus that such a press moves.
 * Returns a cleanup function.
 */
export function keepInReadingZone(editor: Editor, scroller: HTMLElement, column: HTMLElement, findOpen: boolean): () => void {
  let band = { top: 0, bottom: 0 };
  let pointerDown = false;
  /** A press on the scrollbar or the scroller itself (not the note) is scrolling: it moves no caret. */
  let scrollPress = false;
  let frame = 0;

  const measure = () => {
    const css = getComputedStyle(scroller);
    const h = scroller.clientHeight;
    const topFrac = parseFloat(css.getPropertyValue(varName(t.zoneTop))) || 0.25;
    const bottomFrac = parseFloat(css.getPropertyValue(varName(t.zoneBottom))) || 0.65;
    // With find open, the band's top is never under the bar (the column's top padding clears it).
    const clear = findOpen ? parseFloat(getComputedStyle(column).paddingTop) || 0 : 0;
    band = { top: Math.max(h * topFrac, clear), bottom: h * (1 - bottomFrac) };
    if (!editor.isDestroyed) {
      editor.view.setProps({
        scrollThreshold: { top: band.top, bottom: band.bottom, left: 0, right: 0 },
        scrollMargin: { top: band.top, bottom: band.bottom, left: 5, right: 5 },
      });
    }
  };

  const keep = () => {
    frame = 0;
    if (pointerDown || editor.isDestroyed || !editor.view.hasFocus()) return;
    const { view } = editor;
    let caret: { top: number; bottom: number };
    try {
      caret = view.coordsAtPos(view.state.selection.head);
    } catch {
      return;
    }
    const box = scroller.getBoundingClientRect();
    const top = box.top + band.top;
    const bottom = box.bottom - band.bottom;
    if (caret.top < top) scroller.scrollTop -= top - caret.top;
    else if (caret.bottom > bottom) scroller.scrollTop += caret.bottom - bottom;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(keep);
  };
  /** Whether a press lands on the scrollbar, or on the scroller rather than the note in it. */
  const onScrollbar = (e: PointerEvent) => {
    if (e.target === scroller) return true;
    const box = scroller.getBoundingClientRect();
    const x = e.clientX - box.left - scroller.clientLeft;
    const y = e.clientY - box.top - scroller.clientTop;
    return x >= scroller.clientWidth || x < 0 || y >= scroller.clientHeight;
  };
  const onDown = (e: PointerEvent) => {
    pointerDown = true;
    scrollPress = onScrollbar(e);
    if (scrollPress && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  const onUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    if (scrollPress) return;
    schedule();
  };
  // Focus coming back after a press on the scrollbar isn't a caret move; typing or a key is.
  const onFocus = () => {
    if (!scrollPress) schedule();
  };
  const onKey = () => {
    scrollPress = false;
  };

  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(scroller);
  editor.on("selectionUpdate", schedule);
  editor.on("update", schedule);
  editor.on("focus", onFocus);
  scroller.addEventListener("pointerdown", onDown);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    ro.disconnect();
    if (frame) cancelAnimationFrame(frame);
    editor.off("selectionUpdate", schedule);
    editor.off("update", schedule);
    editor.off("focus", onFocus);
    scroller.removeEventListener("pointerdown", onDown);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

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
 * Returns a cleanup function.
 */
export function keepInReadingZone(editor: Editor, scroller: HTMLElement, column: HTMLElement, findOpen: boolean): () => void {
  let band = { top: 0, bottom: 0 };
  let pointerDown = false;
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
  const onDown = () => {
    pointerDown = true;
  };
  const onUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    schedule();
  };

  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(scroller);
  editor.on("selectionUpdate", schedule);
  editor.on("update", schedule);
  editor.on("focus", schedule);
  scroller.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    ro.disconnect();
    if (frame) cancelAnimationFrame(frame);
    editor.off("selectionUpdate", schedule);
    editor.off("update", schedule);
    editor.off("focus", schedule);
    scroller.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

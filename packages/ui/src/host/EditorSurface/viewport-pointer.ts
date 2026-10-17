import type { Editor } from "@tiptap/react";
import { focusAtPosition, selectBlock } from "@focus-notes/editor";

const CONTROLS = "button, input, textarea, select, a[href], [role=button], [role=menu], [role=dialog], [role=toolbar], [contenteditable=false], [data-editor-companion]";
/** How far the pointer moves before a press in the margin becomes a drag-selection, in px. */
const DRAG = 4;

/**
 * The blank document canvas points to the same visual rows as the text column (EDT-02), as in Word:
 * a press left of the column selects that row's whole block; right of it, the caret goes to the end
 * of that row; above the first row, to the start; below the last, to the end. Dragging from any of
 * these selects text from where the press landed to the row under the pointer, as a drag in the text
 * does. Shift extends the selection the caret already has.
 */
export function trackViewportPointer(editor: Editor, scroller: HTMLElement): () => void {
  let stop: (() => void) | undefined;
  const rows = () => {
    const { view } = editor;
    let firstBlock = view.dom.firstElementChild;
    let lastBlock = view.dom.lastElementChild;
    while (firstBlock?.classList.contains("ProseMirror-gapcursor")) firstBlock = firstBlock.nextElementSibling;
    while (lastBlock?.classList.contains("ProseMirror-gapcursor")) lastBlock = lastBlock.previousElementSibling;
    const first = firstBlock?.getBoundingClientRect();
    const last = lastBlock?.getBoundingClientRect();
    return first && last ? { first, last, column: view.dom.getBoundingClientRect() } : null;
  };
  /** The document position on the row at (x, y), the column's edge standing in for a point beside it. */
  const posAt = (x: number, y: number): number | undefined => {
    const r = rows();
    if (!r) return undefined;
    if (y < r.first.top) return 0;
    if (y >= r.last.bottom) return editor.state.doc.content.size;
    return editor.view.posAtCoords({ left: Math.max(r.column.left + 1, Math.min(x, r.column.right - 1)), top: y })?.pos;
  };
  const down = (e: PointerEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.pointerType === "touch" || e.ctrlKey || e.metaKey || e.altKey || !editor.isEditable || editor.isDestroyed) return;
    const { view } = editor;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || view.dom.contains(target) || target.closest(CONTROLS)) return;
    const viewport = scroller.getBoundingClientRect();
    const left = viewport.left + scroller.clientLeft;
    const top = viewport.top + scroller.clientTop;
    if (e.clientX < left || e.clientX >= left + scroller.clientWidth || e.clientY < top || e.clientY >= top + scroller.clientHeight) return;
    const r = rows();
    const pos = posAt(e.clientX, e.clientY);
    if (!r || pos === undefined) return;
    e.preventDefault();
    const inRows = e.clientY >= r.first.top && e.clientY < r.last.bottom;
    const leftOf = inRows && e.clientX < r.column.left;
    const anchor = e.shiftKey ? editor.state.selection.anchor : pos;
    focusAtPosition(editor, pos, e.shiftKey ? anchor : undefined);
    // Left of the column: the row's whole block, on the press (KEY-04's block selection).
    if (leftOf && !e.shiftKey) selectBlock(editor);

    // Dragging from here selects text from the press to the row under the pointer.
    stop?.();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let dragging = false;
    const id = e.pointerId;
    try {
      scroller.setPointerCapture(id);
    } catch { /* the pointer is already gone */ }
    const move = (m: PointerEvent) => {
      if (m.pointerId !== id || editor.isDestroyed) return;
      if (!dragging && Math.hypot(m.clientX - x0, m.clientY - y0) < DRAG) return;
      dragging = true;
      // Past the note's top or bottom edge, the note scrolls along, as a drag in the text does.
      const v = scroller.getBoundingClientRect();
      const edgeTop = v.top + scroller.clientTop;
      const edgeBottom = edgeTop + scroller.clientHeight;
      if (m.clientY < edgeTop) scroller.scrollTop -= edgeTop - m.clientY;
      else if (m.clientY > edgeBottom) scroller.scrollTop += m.clientY - edgeBottom;
      const head = posAt(m.clientX, Math.max(edgeTop, Math.min(m.clientY, edgeBottom - 1)));
      if (head !== undefined) focusAtPosition(editor, head, anchor);
    };
    const end = (u: PointerEvent) => {
      if (u.pointerId === id) stop?.();
    };
    stop = () => {
      stop = undefined;
      scroller.removeEventListener("pointermove", move);
      scroller.removeEventListener("pointerup", end);
      scroller.removeEventListener("pointercancel", end);
      try {
        if (scroller.hasPointerCapture(id)) scroller.releasePointerCapture(id);
      } catch { /* released already */ }
    };
    scroller.addEventListener("pointermove", move);
    scroller.addEventListener("pointerup", end);
    scroller.addEventListener("pointercancel", end);
  };
  scroller.addEventListener("pointerdown", down);
  return () => {
    stop?.();
    scroller.removeEventListener("pointerdown", down);
  };
}

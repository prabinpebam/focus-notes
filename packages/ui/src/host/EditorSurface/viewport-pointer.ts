import type { Editor } from "@tiptap/react";
import { focusAtPosition, selectBlock } from "@focus-notes/editor";

const CONTROLS = "button, input, textarea, select, a[href], [role=button], [role=menu], [role=dialog], [role=toolbar], [contenteditable=false], [data-editor-companion]";

/** The blank document canvas points to the same visual rows as the text column. */
export function trackViewportPointer(editor: Editor, scroller: HTMLElement): () => void {
  const down = (e: PointerEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.pointerType === "touch" || e.ctrlKey || e.metaKey || e.altKey || !editor.isEditable || editor.isDestroyed) return;
    const { view } = editor;
    const target = e.target instanceof Element ? e.target : null;
    if (!target || view.dom.contains(target) || target.closest(CONTROLS)) return;
    const viewport = scroller.getBoundingClientRect();
    const left = viewport.left + scroller.clientLeft;
    const top = viewport.top + scroller.clientTop;
    if (e.clientX < left || e.clientX >= left + scroller.clientWidth || e.clientY < top || e.clientY >= top + scroller.clientHeight) return;
    let firstBlock = view.dom.firstElementChild;
    let lastBlock = view.dom.lastElementChild;
    while (firstBlock?.classList.contains("ProseMirror-gapcursor")) firstBlock = firstBlock.nextElementSibling;
    while (lastBlock?.classList.contains("ProseMirror-gapcursor")) lastBlock = lastBlock.previousElementSibling;
    const first = firstBlock?.getBoundingClientRect();
    const last = lastBlock?.getBoundingClientRect();
    if (!first || !last) return;
    const column = view.dom.getBoundingClientRect();
    const above = e.clientY < first.top;
    const below = e.clientY >= last.bottom;
    const point = above || below ? null : view.posAtCoords({
      left: Math.max(column.left + 1, Math.min(e.clientX, column.right - 1)),
      top: e.clientY,
    });
    const pos = above ? 0 : below ? editor.state.doc.content.size : point?.pos;
    if (pos === undefined) return;
    e.preventDefault();
    const anchor = e.shiftKey ? editor.state.selection.anchor : undefined;
    focusAtPosition(editor, pos, anchor);
    if (!above && !below && !e.shiftKey && e.clientX >= column.right) selectBlock(editor);
  };
  scroller.addEventListener("pointerdown", down);
  return () => scroller.removeEventListener("pointerdown", down);
}

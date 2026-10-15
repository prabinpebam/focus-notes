/**
 * Focus mode's band tracking (FOC-01 to FOC-06, Focus mode → How the active row is found):
 * every trigger marks the band stale, and one animation frame measures and writes it.
 */
import type { Editor } from "@tiptap/react";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, pre, td, th, blockquote";
const varName = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/** The line box around a document position, in viewport coordinates, and the block it's in. */
function lineBoxAt(editor: Editor, pos: number): { top: number; bottom: number; block: Element } {
  const view = editor.view;
  const c = view.coordsAtPos(pos);
  const at = view.domAtPos(pos).node;
  const el = (at.nodeType === Node.ELEMENT_NODE ? (at as Element) : at.parentElement) ?? view.dom;
  const block = el.closest(BLOCKS) ?? el;
  const lineHeight = parseFloat(getComputedStyle(block).lineHeight) || c.bottom - c.top;
  const mid = (c.top + c.bottom) / 2;
  return { top: mid - lineHeight / 2, bottom: mid + lineHeight / 2, block };
}

export interface BandVars { top: string; bottom: string }

export function trackFocusBand(editor: Editor, column: HTMLElement, vars: BandVars): () => void {
  let frame = 0;
  const top = varName(vars.top);
  const bottom = varName(vars.bottom);
  // The caret's blocks are watched as well as the column: when the line metrics change (the text
  // size, the content font, the window's zoom), a short note's column keeps its minimum height,
  // but the caret's block always changes size (D-130).
  const blocks = new ResizeObserver(() => schedule());
  let watched: Element[] = [];
  const watch = (els: Element[]) => {
    if (els.length === watched.length && els.every((el, i) => el === watched[i])) return;
    blocks.disconnect();
    for (const el of els) blocks.observe(el);
    watched = els;
  };
  const measure = () => {
    frame = 0;
    if (editor.isDestroyed) return;
    // Reads only, all in one frame: the column, the caret, and the block's line height.
    const origin = column.getBoundingClientRect().top;
    const { from, to } = editor.state.selection;
    const a = lineBoxAt(editor, from);
    const b = to === from ? a : lineBoxAt(editor, to);
    column.style.setProperty(top, `${Math.round(Math.min(a.top, b.top) - origin)}px`);
    column.style.setProperty(bottom, `${Math.round(Math.max(a.bottom, b.bottom) - origin)}px`);
    watch(a.block === b.block ? [a.block] : [a.block, b.block]);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  editor.on("transaction", schedule);
  editor.on("focus", schedule);
  const dom = editor.view.dom;
  dom.addEventListener("compositionupdate", schedule);
  dom.addEventListener("compositionend", schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(column);
  window.addEventListener("resize", schedule);
  document.fonts?.addEventListener?.("loadingdone", schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    editor.off("transaction", schedule);
    editor.off("focus", schedule);
    dom.removeEventListener("compositionupdate", schedule);
    dom.removeEventListener("compositionend", schedule);
    resize.disconnect();
    blocks.disconnect();
    window.removeEventListener("resize", schedule);
    document.fonts?.removeEventListener?.("loadingdone", schedule);
    column.style.removeProperty(top);
    column.style.removeProperty(bottom);
  };
}

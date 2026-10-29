/**
 * Focus mode's band tracking (FOC-01 to FOC-06, Focus mode → How the active paragraph is found):
 * every trigger marks the band stale, and one animation frame measures and writes it.
 */
import type { Editor } from "@tiptap/react";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, pre, td, th, blockquote";
const varName = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/** The containing paragraph or text block, in viewport coordinates (D-232). */
function blockBoxAt(editor: Editor, pos: number): { top: number; bottom: number; block: Element } {
  const view = editor.view;
  const at = view.domAtPos(pos).node;
  const el = (at.nodeType === Node.ELEMENT_NODE ? (at as Element) : at.parentElement) ?? view.dom;
  const block = el.closest(BLOCKS) ?? el;
  const { top, bottom } = block.getBoundingClientRect();
  return { top, bottom, block };
}

export interface BandVars { top: string; bottom: string }

/** The column's box as a ResizeObserver reports it: its content box's width, height, and top (its padding-top). */
export interface ColumnBox { width: number; height: number; top: number }

/**
 * Whether a change to the column is a resize (D-156): its width (lines rewrap) or its top padding (the
 * reading zone's 25vh, which follows the window's height) moved. Then the band is written without a
 * glide, every frame, so it never trails the caret's paragraph. Only the height changing is the note growing
 * or shrinking as it's typed: the band glides as usual.
 */
export function isResize(prev: ColumnBox | undefined, next: ColumnBox): boolean {
  if (!prev) return false;
  return Math.abs(prev.width - next.width) > 0.01 || Math.abs(prev.top - next.top) > 0.01;
}

export function trackFocusBand(editor: Editor, column: HTMLElement, vars: BandVars): () => void {
  let frame = 0;
  /** Whether the next write follows a resize (no glide) rather than the caret (a glide). */
  let live = false;
  let box: ColumnBox | undefined;
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
    // Reads only, all in one frame: the column and the selection's endpoint blocks.
    const origin = column.getBoundingClientRect().top;
    const { from, to } = editor.state.selection;
    const a = blockBoxAt(editor, from);
    const b = to === from ? a : blockBoxAt(editor, to);
    column.toggleAttribute("data-band-live", live);
    column.style.setProperty(top, `${Math.round(Math.min(a.top, b.top) - origin)}px`);
    column.style.setProperty(bottom, `${Math.round(Math.max(a.bottom, b.bottom) - origin)}px`);
    watch(a.block === b.block ? [a.block] : [a.block, b.block]);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  /** The caret moved or the text changed: the band glides to it. */
  const caretMoved = () => {
    live = false;
    schedule();
  };
  /** The window's size changed: the band is re-measured in this frame's callback, without a glide. */
  const resized = () => {
    live = true;
    schedule();
  };
  editor.on("transaction", caretMoved);
  editor.on("focus", caretMoved);
  const dom = editor.view.dom;
  dom.addEventListener("compositionupdate", caretMoved);
  dom.addEventListener("compositionend", caretMoved);
  // Observed by its border box, so a padding-only change (the 25vh reading top, after a height-only
  // resize) is seen as well as a width change that rewraps; contentRect.top is its padding-top (FOC-02, D-156).
  const resize = new ResizeObserver(([entry]) => {
    const r = entry?.contentRect;
    if (!r) return schedule();
    const next = { width: r.width, height: r.height, top: r.top };
    if (isResize(box, next)) live = true;
    box = next;
    schedule();
  });
  resize.observe(column, { box: "border-box" });
  window.addEventListener("resize", resized);
  document.fonts?.addEventListener?.("loadingdone", schedule);
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    editor.off("transaction", caretMoved);
    editor.off("focus", caretMoved);
    dom.removeEventListener("compositionupdate", caretMoved);
    dom.removeEventListener("compositionend", caretMoved);
    resize.disconnect();
    blocks.disconnect();
    window.removeEventListener("resize", resized);
    document.fonts?.removeEventListener?.("loadingdone", schedule);
    column.removeAttribute("data-band-live");
    column.style.removeProperty(top);
    column.style.removeProperty(bottom);
  };
}

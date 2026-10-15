import type { Editor } from "@tiptap/react";
import { autoScroll, tokens } from "@focus-notes/tokens";
import { createScrollAnimator, cubicBezier } from "./scroll-animator.ts";

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
 * The scroll animates over motion.autoScroll with easing.inOut, never a jump (D-156): ProseMirror's own
 * instant scroll is turned off while the editor has focus, and a new target restarts from where the
 * note is. The wheel or the scrollbar stops it. Reduced motion (a duration of 0) makes it instant.
 * Returns a cleanup function.
 */
export function keepInReadingZone(editor: Editor, scroller: HTMLElement, column: HTMLElement, findOpen: boolean): () => void {
  let band = { top: 0, bottom: 0 };
  let pointerDown = false;
  /** A press on the scrollbar or the scroller itself (not the note) is scrolling: it moves no caret. */
  let scrollPress = false;
  let frame = 0;
  /** Whether the person's key, input, or pointer release came since the last check (D-156). */
  let intent = false;
  /** Whether that key is held down and repeating: the scroll then follows within a few frames (D-156). */
  let repeating = false;
  const ease = cubicBezier(autoScroll.easing);
  const animator = createScrollAnimator(
    { get: () => scroller.scrollTop, set: (v) => (scroller.scrollTop = v) },
    {
      // Read when a scroll starts (in the frame's callback, never on the keystroke): reduced motion makes it 0.
      duration: () => {
        const v = getComputedStyle(scroller).getPropertyValue(varName(tokens.motion.autoScroll)).trim();
        const ms = v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : NaN;
        return Number.isFinite(ms) ? ms : autoScroll.duration;
      },
      easing: ease,
      // The browser revealed the caret past where the scroll was heading: check once more, still the person's move.
      onOvertaken: () => {
        intent = true;
        schedule();
      },
    },
  );

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
        // With focus, the frame's callback below scrolls (animated); ProseMirror's own would jump.
        handleScrollToSelection: (view) => {
          if (!view.hasFocus()) return false;
          schedule();
          return true;
        },
      });
    }
  };

  const keep = () => {
    frame = 0;
    if (pointerDown || editor.isDestroyed || !editor.view.hasFocus()) return;
    // Only a scroll the person's own key, input, or click caused animates; opening a note, focus coming
    // back, and other programmatic moves place it at once, as before (a long note's jump to its end
    // would otherwise paint every page on the way, PRF-01).
    const animate = intent;
    const follow = repeating;
    intent = false;
    repeating = false;
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
    // Where the caret will be once a running scroll ends: the band is checked there.
    const now = scroller.scrollTop;
    const base = animator.dest ?? now;
    const shift = base - now;
    const caretTop = caret.top - shift;
    const caretBottom = caret.bottom - shift;
    let dest = base;
    if (caretTop < top) dest = base - (top - caretTop);
    else if (caretBottom > bottom) dest = base + (caretBottom - bottom);
    else return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    animator.to(Math.max(0, Math.min(max, dest)), !animate ? "instant" : follow ? "follow" : "animate");
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
    // A press stops a running auto-scroll where the note is: the person is pointing at what they see,
    // and the text mustn't slide out from under the pointer (the release checks the band again).
    animator.cancel();
    if (scrollPress) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
  };
  /**
   * The person scrolling stops the auto-scroll: the wheel here, the scrollbar in onDown. Not any scroll
   * the animator didn't write: the browser's own caret reveal is one, and the scroll must still finish.
   */
  const onWheel = () => animator.cancel();
  const onUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    if (scrollPress) return;
    intent = true;
    schedule();
  };
  // Focus coming back after a press on the scrollbar isn't a caret move; typing or a key is.
  const onFocus = () => {
    if (!scrollPress) schedule();
  };
  const onKey = (e: KeyboardEvent) => {
    scrollPress = false;
    intent = true;
    repeating = e.repeat;
  };
  const onInput = () => {
    intent = true;
  };
  // Focus leaving the note (into the link editor, the toolbar, find) ends a running scroll at once: what
  // opens is anchored to the selection, and mid-scroll that can still be under the top band, where an
  // anchored surface is hidden and would drop the focus it was just given.
  const onBlur = () => animator.finish();

  measure();
  const dom = editor.view.dom;
  const ro = new ResizeObserver(measure);
  ro.observe(scroller);
  editor.on("selectionUpdate", schedule);
  editor.on("update", schedule);
  editor.on("focus", onFocus);
  editor.on("blur", onBlur);
  scroller.addEventListener("pointerdown", onDown);
  scroller.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKey, true);
  dom.addEventListener("beforeinput", onInput, true);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    ro.disconnect();
    animator.cancel();
    if (frame) cancelAnimationFrame(frame);
    if (!editor.isDestroyed) editor.view.setProps({ handleScrollToSelection: undefined });
    editor.off("selectionUpdate", schedule);
    editor.off("update", schedule);
    editor.off("focus", onFocus);
    editor.off("blur", onBlur);
    scroller.removeEventListener("pointerdown", onDown);
    scroller.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey, true);
    dom.removeEventListener("beforeinput", onInput, true);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

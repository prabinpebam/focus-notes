import type { Editor } from "@tiptap/react";
import { autoScroll, tokens } from "@focus-notes/tokens";
import { createScrollAnimator, cubicBezier } from "./scroll-animator.ts";
import { anchors } from "../../behaviors/anchors.ts";

const t = tokens.cmp.editorSurface;
/**
 * The keys that move the caret (D-156: typing, arrow keys, and clicks animate the scroll), with Enter,
 * Backspace, and Delete, which ProseMirror handles in keydown (no beforeinput follows).
 */
const CARET_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Enter", "Backspace", "Delete"]);
/** Typing's input types: text, a new line, and deleting; not insertFromPaste, insertFromDrop, or history. */
const TYPING = /^(insertText|insertCompositionText|insertParagraph|insertLineBreak|delete(Content|Word|Soft|Hard))/;
/** The CSS custom property name inside a token reference such as "var(--fn-x)". */
const varName = (ref: string) => ref.slice(4, -1);

/**
 * Keeps the line being edited inside the reading zone (UI-11, D-78): the band between
 * readingZone.top and readingZone.bottom of the editor's height. ProseMirror's own scrolling uses
 * the band as its threshold and margin, so typing and arrow keys land inside it; clicks, focus, and
 * other selection moves are checked after the frame. A drag-selection waits for the pointer to lift.
 * Scrolling never brings the caret back: not the wheel, nor pressing, dragging, or clicking the
 * scrollbar (or the scroller around the note), nor the focus that such a press moves.
 * A caret move from typing, a key, or a click in the note animates the scroll over motion.autoScroll
 * with easing.inOut (D-156); every other scroll is ProseMirror's own, instant, as before. The animator
 * only writes scrollTop. The wheel or the scrollbar stops it. Reduced motion (a duration of 0) makes it instant.
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
    {
      get: () => scroller.scrollTop,
      // Written in a frame's callback: a surface anchored to the note is placed again in this frame, not the next (DEF-25).
      set: (v) => {
        scroller.scrollTop = v;
        if (anchors.anyOpen) anchors.moved();
      },
    },
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
        // Only a scroll that will animate is taken over (the frame's callback below); every other one,
        // from a programmatic selection, focus coming back, find, or a range the contextual toolbar is
        // opening on, is ProseMirror's own, instant and in the same task, as before D-156.
        handleScrollToSelection: () => {
          if (!mayAnimate()) {
            animator.finish();
            return false;
          }
          schedule();
          return true;
        },
      });
    }
  };

  /**
   * Whether the scroll now may animate (D-156): only a caret move from typing, a key, or a click in the
   * note (not a key elsewhere, a programmatic selection, or focus coming back), with the note focused,
   * find closed, and a caret rather than a range (on a range the contextual toolbar is opening, and it
   * is anchored there). Anything else scrolls at once, as does every scroll while a surface anchored to
   * the note (the slash menu, a link card, a toolbar) is open: it never sits on a moving note (DEF-21).
   */
  const mayAnimate = () => intent && !findOpen && !anchors.anyOpen && !editor.isDestroyed && editor.view.hasFocus() && editor.state.selection.empty;

  const keep = () => {
    frame = 0;
    if (pointerDown || editor.isDestroyed || !editor.view.hasFocus()) return;
    // Only a scroll the person's own key, input, or click caused animates; opening a note, focus coming
    // back, and other programmatic moves place it at once, as before (a long note's jump to its end
    // would otherwise paint every page on the way, PRF-01).
    const animate = mayAnimate();
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
  const onKey = () => {
    scrollPress = false;
  };
  /**
   * A caret or typing key in the note itself (CARET_KEYS): Escape in Spotlight, a key
   * in the link editor, Tab in a table, or a command such as paste is not one the spec lists.
   */
  const onNoteKey = (e: KeyboardEvent) => {
    if (!CARET_KEYS.has(e.key)) return;
    intent = true;
    repeating = e.repeat;
  };
  /** Typing (inserting or deleting text); a paste or a drop isn't typing. */
  const onInput = (e: InputEvent) => {
    if (TYPING.test(e.inputType)) intent = true;
  };
  // Focus leaving the note (into the link editor, the toolbar, find) ends a running scroll at once: what
  // opens is anchored to the selection, and mid-scroll that can still be under the top band, where an
  // anchored surface is hidden and would drop the focus it was just given.
  const onBlur = () => {
    intent = false;
    repeating = false;
    animator.finish();
  };
  // A surface anchored to the note opening (typing `/`, the caret reaching a link) ends a running
  // scroll at once on its target, as focus leaving does: it opens where its anchor stays (DEF-21).
  const offOpen = anchors.onOpen(() => animator.finish());

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
  dom.addEventListener("keydown", onNoteKey, true);
  dom.addEventListener("beforeinput", onInput, true);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    offOpen();
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
    dom.removeEventListener("keydown", onNoteKey, true);
    dom.removeEventListener("beforeinput", onInput, true);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

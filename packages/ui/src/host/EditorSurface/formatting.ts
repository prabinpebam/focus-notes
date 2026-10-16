/**
 * The selection side of the formatting toolbar and the link hover card (Text formatting → When it
 * appears and disappears; EDT-12, EDT-13, UI-06). It decides when each shows, reports what they
 * show, and publishes where they point. Nothing here runs while typing beyond one cheap check.
 */
import type { Editor } from "@tiptap/react";
import { formatState, linkAround } from "@focus-notes/editor";
import { anchors, companion, COMPANION_LEAVE_EVENT, inCompanion, type AnchorRect } from "../../behaviors/anchors.ts";

type EditorView = Editor["view"];

export interface FormatPayload {
  toolbar: boolean;
  card: boolean;
  bold: string;
  italic: string;
  strike: string;
  code: string;
  block: string;
  codeBlock: boolean;
  inlineCode: boolean;
  oneBlock: boolean;
  href: string;
  /** In a table: the toolbar has marks only (TBL-05). */
  table: boolean;
}

/** DD-FMT-04: after a pointer selection ends, and after the last keyboard selection change. */
const POINTER_DELAY_MS = 150;
const KEYBOARD_DELAY_MS = 300;
/** The hover card: the pointer rests on a link this long, and it leaves this long after the pointer. */
const HOVER_DELAY_MS = 500;
const LEAVE_DELAY_MS = 200;

/** A range's box: the first line's top and extent, and the last line's bottom (Placement → Anchor). */
export function rangeRect(view: EditorView, from: number, to: number): AnchorRect {
  const caret = (pos: number) => {
    const c = view.coordsAtPos(pos);
    return { top: c.top, bottom: c.bottom, left: c.left, right: c.right };
  };
  if (from === to) return caret(from);
  const a = view.domAtPos(from);
  const b = view.domAtPos(to);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return caret(from);
  const first = rects[0]!;
  const line = rects.filter((r) => Math.abs(r.top - first.top) < first.height / 2);
  return {
    top: Math.min(...line.map((r) => r.top)),
    bottom: rects.at(-1)!.bottom,
    left: Math.min(...line.map((r) => r.left)),
    right: Math.max(...line.map((r) => r.right)),
  };
}

export interface FormatTracker {
  /** Esc in the note: hides them until the selection changes. True if something was showing. */
  dismiss(): boolean;
  /** The link the hover card is about: the hovered one, else the one the caret is in. */
  cardRange(): { from: number; to: number } | null;
  /** Re-checks after an outside change (the find bar, the link editor). */
  refresh(): void;
  /** Keeps the selection's anchor current while the link editor has focus. */
  holdSelection(on: boolean): void;
  dispose(): void;
}

export function trackFormatting(editor: Editor, scroller: HTMLElement, emit: (p: FormatPayload) => void, suppressed: () => boolean): FormatTracker {
  const view = editor.view;
  let shown = false;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let dismissedAt: string | null = null;
  let pointerDown = false;
  let lastInput: "pointer" | "keyboard" = "keyboard";
  let typing = false;
  let companionFocused = false;
  let hold = false;
  let hover: { el: HTMLAnchorElement; from: number; to: number; href: string } | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  let frame = 0;

  const selKey = () => {
    const { from, to } = editor.state.selection;
    return `${from}:${to}`;
  };
  /**
   * A live reader for an anchor (DEF-21): the range's box now, while the document (and, for the
   * selection, the selection) is the one it was published for; else the published rectangle stands.
   */
  const live = (from: number, to: number, selection: boolean) => {
    const doc = editor.state.doc;
    return () => {
      if (editor.isDestroyed || editor.state.doc !== doc) return null;
      const s = editor.state.selection;
      return !selection || (s.from === from && s.to === to) ? rangeRect(view, from, to) : null;
    };
  };
  const publish = (toolbar: boolean, card: boolean, info: ReturnType<typeof formatState>, href: string) => {
    const { from, to } = editor.state.selection;
    if (toolbar || hold) anchors.set("selection", rangeRect(view, from, to), live(from, to, true));
    if (card) {
      const r = hover && !info.link ? hover : info.link;
      if (r) anchors.set("link", rangeRect(view, r.from, r.to), live(r.from, r.to, false));
    }
    const p: FormatPayload = {
      toolbar, card, bold: info.marks.bold, italic: info.marks.italic, strike: info.marks.strike, code: info.marks.code,
      block: info.block, codeBlock: info.codeBlock, inlineCode: info.inlineCode, oneBlock: info.oneBlock, href, table: info.table,
    };
    const key = JSON.stringify(p);
    if (key === last) return;
    last = key;
    emit(p);
  };

  const evaluate = () => {
    if (editor.isDestroyed) return;
    // The hovered link as it is now: an edit can change its address or replace its element.
    if (hover) {
      const link = hover.el.isConnected && view.dom.contains(hover.el) ? linkAround(editor.state, view.posAtDOM(hover.el, 0)) : null;
      hover = link ? { el: hover.el, ...link } : null;
    }
    const info = formatState(editor.state);
    const focused = view.hasFocus() || companionFocused;
    if (dismissedAt !== null && dismissedAt !== selKey()) dismissedAt = null;
    const allowed = editor.isEditable && focused && !suppressed() && dismissedAt === null;
    const wantToolbar = allowed && info.text && !pointerDown;
    const caretCard = allowed && editor.state.selection.empty && Boolean(info.link) && !typing;
    const card = !wantToolbar && (caretCard || (Boolean(hover) && !suppressed() && dismissedAt === null));
    const href = info.link?.href ?? (card && hover ? hover.href : "");
    if (!wantToolbar) {
      clearTimeout(showTimer);
      showTimer = undefined;
      shown = false;
      return publish(false, card, info, href);
    }
    if (shown) return publish(true, false, info, href);
    // Not showing yet: wait until the selection has settled.
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      showTimer = undefined;
      shown = true;
      evaluate();
    }, lastInput === "pointer" ? POINTER_DELAY_MS : KEYBOARD_DELAY_MS);
    publish(false, card, info, href);
  };

  const onTransaction = ({ transaction: tr }: { transaction: { docChanged: boolean; selectionSet: boolean; getMeta(key: string): unknown } }) => {
    // Focus and blur have their own handlers, which know where focus went.
    if (tr.getMeta("focus") || tr.getMeta("blur")) return;
    if (tr.docChanged) {
      // Typing hides the toolbar at once; formatting a selection keeps it (the selection stays).
      typing = editor.state.selection.empty;
    } else if (tr.selectionSet) typing = false;
    evaluate();
  };
  const onFocus = () => {
    companionFocused = false;
    evaluate();
  };
  const onBlur = ({ event }: { event: FocusEvent }) => {
    // Focus moving into the toolbar or the link editor keeps them.
    companionFocused = inCompanion(event.relatedTarget);
    evaluate();
  };
  const onPointerDown = () => {
    pointerDown = true;
    lastInput = "pointer";
  };
  const onPointerUp = () => {
    if (!pointerDown) return;
    pointerDown = false;
    evaluate();
  };
  const onKeyDown = () => {
    lastInput = "keyboard";
  };
  const onCompanionLeave = () => {
    if (!inCompanion(document.activeElement) && !view.hasFocus()) companionFocused = false;
    if (hover) scheduleLeave();
    evaluate();
  };
  const scheduleLeave = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (companion.hovered || (hover && hover.el.matches(":hover"))) return;
      hover = null;
      evaluate();
    }, LEAVE_DELAY_MS);
  };
  const onMouseOver = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !view.dom.contains(a)) return;
    clearTimeout(leaveTimer);
    if (hover?.el === a) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (editor.isDestroyed || !a.isConnected) return;
      const link = linkAround(editor.state, view.posAtDOM(a, 0));
      if (!link) return;
      hover = { el: a, ...link };
      evaluate();
    }, HOVER_DELAY_MS);
  };
  const onMouseOut = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!a || a.contains(e.relatedTarget as Node | null)) return;
    clearTimeout(hoverTimer);
    if (hover) scheduleLeave();
  };
  // The anchors follow the note as it scrolls or the window resizes (Placement → Scrolling).
  const follow = () => {
    if (!frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (editor.isDestroyed) return;
      evaluate();
    });
  };

  editor.on("transaction", onTransaction);
  editor.on("focus", onFocus);
  editor.on("blur", onBlur);
  view.dom.addEventListener("pointerdown", onPointerDown);
  view.dom.addEventListener("keydown", onKeyDown);
  view.dom.addEventListener("mouseover", onMouseOver);
  view.dom.addEventListener("mouseout", onMouseOut);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener(COMPANION_LEAVE_EVENT, onCompanionLeave);
  scroller.addEventListener("scroll", follow, { passive: true });
  window.addEventListener("resize", follow);

  return {
    dismiss() {
      const showing = shown || last.includes('"card":true');
      if (!showing) return false;
      dismissedAt = selKey();
      hover = null;
      evaluate();
      return true;
    },
    cardRange() {
      const info = formatState(editor.state);
      if (hover && !info.link) return { from: hover.from, to: hover.to };
      return info.link ? { from: info.link.from, to: info.link.to } : null;
    },
    refresh: evaluate,
    holdSelection(on: boolean) {
      hold = on;
      if (!on) companionFocused = inCompanion(document.activeElement);
      last = "";
      evaluate();
    },
    dispose() {
      clearTimeout(showTimer);
      clearTimeout(hoverTimer);
      clearTimeout(leaveTimer);
      cancelAnimationFrame(frame);
      editor.off("transaction", onTransaction);
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
      view.dom.removeEventListener("pointerdown", onPointerDown);
      view.dom.removeEventListener("keydown", onKeyDown);
      view.dom.removeEventListener("mouseover", onMouseOver);
      view.dom.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener(COMPANION_LEAVE_EVENT, onCompanionLeave);
      scroller.removeEventListener("scroll", follow);
      window.removeEventListener("resize", follow);
      anchors.set("selection", null);
      anchors.set("link", null);
    },
  };
}

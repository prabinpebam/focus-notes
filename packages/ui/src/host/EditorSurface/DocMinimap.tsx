import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { focusAtPosition } from "@focus-notes/editor";
import { tokens } from "@focus-notes/tokens";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import { useFadingEdges } from "../../behaviors/fading-edges.ts";
import { allocateDocks, dockLeft, dockMaxWidth, pinnedRight } from "../../behaviors/pinned-sheet.ts";
import { useResizeHandle } from "../../behaviors/resize-handle.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import { IconButton } from "../../primitives/IconButton/IconButton.tsx";
import { caretSection, cardTop, depthsOf, MIN_HEADINGS, outlineOf, railLayout, nestOutline, railShows, scrollSection, type OutlineHeading, type OutlineNode } from "./doc-outline.ts";
import { glideTo } from "./reading-zone.ts";
import * as s from "./DocMinimap.css.ts";

const t = tokens.cmp.editorSurface.minimap;
/** The heading list is read this long after the last change, never on the keystroke (PRF-01). */
const OUTLINE_DELAY_MS = 150;
const CLAIM_MS = 1000;

const varName = (ref: string) => ref.slice(4, -1);
const read = (el: Element, ref: string) => getComputedStyle(el).getPropertyValue(varName(ref)).trim();
const ms = (el: Element, ref: string) => {
  const v = read(el, ref);
  return v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : 0;
};
/**
 * Length tokens are `calc()`s scaled by the interface scale (DSY-03): the browser resolves them on a
 * hidden probe, so the rail follows the scale like everything else.
 */
function lengthReader(host: HTMLElement) {
  const probe = document.createElement("span");
  probe.className = s.probe;
  probe.setAttribute("aria-hidden", "true");
  host.append(probe);
  // Read once each until the note's size or scale changes: no forced layout on every scroll frame.
  const cache = new Map<string, number>();
  return {
    px: (ref: string) => {
      let v = cache.get(ref);
      if (v === undefined) {
        probe.style.width = ref;
        v = probe.getBoundingClientRect().width;
        cache.set(ref, v);
      }
      return v;
    },
    reset: () => cache.clear(),
    dispose: () => probe.remove(),
  };
}
/** What the list shows changes only with a heading's block, level or text, not as text above it moves positions. */
const signature = (hs: readonly OutlineHeading[]) => hs.map((h) => `${h.index}:${h.level}:${h.text}`).join("\n");

export interface DocMinimapHandle {
  /** *Show contents*: opens the card with focus on the current heading. False with too few headings. */
  openFromKeyboard(): boolean;
}

interface DocMinimapProps {
  editor: Editor;
  scroller: RefObject<HTMLElement | null>;
  /** The landmark's and the rail's name ("Contents"). */
  label: string;
  /** What an empty heading reads as. */
  untitled: string;
  /** Docked on the right (D-186, D-187), where the window has room for it and the note's narrowest area. */
  pinned?: boolean;
  pinLabel?: string;
  unpinLabel?: string;
  onPin?: () => void;
  /** Its docked width in px, as resized; 0: the token's default. */
  dockWidth?: number;
  /** The resize handle's name ("Resize contents"). */
  resizeLabel?: string;
  onResize?: (width: number) => void;
  /** Files docked on the left, as kept on this device, and its width (0: its default): the docks are arbitrated here (D-187). */
  filesDock?: boolean;
  filesWidth?: number;
  /** Whether docked Files fits beside the docked contents and the note's narrowest area; Files is first to undock. */
  onFilesFit?: (fits: boolean) => void;
}

type Open = null | "hover" | "click" | "keyboard";
interface Layout { room: boolean; top: number; pitch: number; indices: number[]; center: number; height: number }
const NO_LAYOUT: Layout = { room: false, top: 0, pitch: 0, indices: [], center: 0, height: 0 };
const sameLayout = (a: Layout, b: Layout) => a.room === b.room && a.top === b.top && a.pitch === b.pitch && a.center === b.center && a.height === b.height && a.indices.join() === b.indices.join();

/**
 * The document minimap (UI-13, D-185): a rail of heading bars on the note's right edge, the current
 * section bright, that expands on hover (or *Show contents*) into a card of the note's headings.
 */
export const DocMinimap = forwardRef<DocMinimapHandle, DocMinimapProps>(function DocMinimap({ editor, scroller, label, untitled, pinned = false, pinLabel = "", unpinLabel = "", onPin, dockWidth = 0, resizeLabel, onResize, filesDock = false, filesWidth = 0, onFilesFit }, ref) {
  const [headings, setHeadings] = useState<OutlineHeading[]>(() => outlineOf(editor.state.doc));
  const [current, setCurrent] = useState(-1);
  const [layout, setLayout] = useState<Layout>(NO_LAYOUT);
  const [open, setOpenState] = useState<Open>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const headingsRef = useRef(headings);
  headingsRef.current = headings;
  const openRef = useRef<Open>(null);
  const caretInView = useRef(false);
  /** Scrolled by the wheel or the scrollbar since the caret last moved: the heading in view is current. */
  const reading = useRef(false);
  /** The caret's section as the note lost focus, kept while focus is in Spotlight or the card. */
  const held = useRef<number | null>(null);
  const railFocused = useRef(false);
  /** A pointer press on the pin began with the caret in the note (D-186). */
  const noteHadFocus = useRef(false);
  const returnTo = useRef<"note" | "rail">("note");
  /** Until when the card takes focus back from a closing dialog (Spotlight ran Show contents). */
  const claimUntil = useRef(0);
  const timers = useRef<{ open?: ReturnType<typeof setTimeout>; close?: ReturnType<typeof setTimeout> }>({});
  const frame = useRef(0);
  const lengths = useRef<ReturnType<typeof lengthReader> | null>(null);
  const px = (ref: string) => lengths.current?.px(ref) ?? 0;
  const cardId = useRef(`doc-minimap-${Math.random().toString(36).slice(2)}`).current;
  useAutoHideScrollbar(listRef, Boolean(open));
  useFadingEdges(listRef, Boolean(open));

  const setOpen = useCallback((next: Open) => {
    // Closing with focus in the card: focus goes back where it came from, never to the page.
    const leaving = next === null && Boolean(cardRef.current?.contains(document.activeElement));
    openRef.current = next;
    if (next !== "keyboard") claimUntil.current = 0;
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
    setOpenState(next);
    if (!leaving) return;
    const rail = railRef.current;
    if (returnTo.current === "rail" && rail?.isConnected) rail.focus();
    else if (!editor.isDestroyed) editor.view.focus();
  }, [editor]);

  /** Layout and the current section: on scroll (once a frame), resize, focus, and after the heading list changes. */
  const measure = useCallback(() => {
    frame.current = 0;
    const sc = scroller.current;
    if (!sc || editor.isDestroyed) return;
    const { view } = editor;
    const hs = outlineOf(editor.state.doc);
    // Nothing to show: no layout to read.
    if (hs.length < MIN_HEADINGS) {
      held.current = null;
      setLayout((prev) => (prev.room ? NO_LAYOUT : prev));
      setCurrent(-1);
      return;
    }
    const box = sc.getBoundingClientRect();
    const h = sc.clientHeight;
    const top = box.top + sc.clientTop;
    let caretIn = false;
    const focused = view.hasFocus();
    // Scrolled with the wheel or the scrollbar: the heading in view, not the caret's, until the caret moves.
    if (focused && !reading.current) {
      try {
        const c = view.coordsAtPos(editor.state.selection.head);
        caretIn = c.bottom > top && c.top < top + h;
      } catch { /* a position the view can't measure yet */ }
    }
    caretInView.current = caretIn;
    // Away in Spotlight or the card, the section is still the caret's: what Show contents points at.
    const away = !focused && held.current !== null && (Boolean(navRef.current?.contains(document.activeElement)) || Boolean(document.querySelector("[data-dialog-modal]")));
    let cur: number;
    if (caretIn) cur = caretSection(hs, editor.state.selection.$head.index(0));
    else if (away) cur = Math.min(held.current!, hs.length - 1);
    else {
      const tops = hs.map((x) => {
        const dom = view.nodeDOM(x.pos);
        return dom instanceof HTMLElement ? dom.getBoundingClientRect().top - top : Number.POSITIVE_INFINITY;
      });
      // A note that fits the window is never "at its end": the reading line decides.
      const atEnd = sc.scrollHeight > h + 1 && sc.scrollTop >= sc.scrollHeight - h - 1;
      cur = scrollSection(tops, h * (parseFloat(read(sc, tokens.cmp.editorSurface.zoneTop)) || 0), atEnd, h);
    }
    if (focused) held.current = caretIn ? cur : null;
    else if (!away) held.current = null;
    const edgeTop = px(t.edgeTop);
    const edgeBottom = px(t.edgeBottom);
    const maxHeight = Math.max(0, Math.min(h * (parseFloat(read(sc, t.railMax)) || 0), h - edgeTop - edgeBottom));
    const lay = railLayout(hs.length, maxHeight, px(t.pitch), px(t.pitchMin), cur);
    const height = lay.indices.length * lay.pitch;
    const railTop = Math.round(Math.max(edgeTop, (h - height) / 2));
    const textRight = view.dom.getBoundingClientRect().right;
    const contentLeft = box.left + sc.clientLeft;
    const contentRight = contentLeft + sc.clientWidth;
    const room = railShows({ textRight, contentRight, railWidth: px(t.railWidth), railInset: px(t.railInset), clearance: px(t.clearance) });
    const next: Layout = { room, top: railTop, pitch: lay.pitch, indices: lay.indices, center: railTop + height / 2, height: h };
    setLayout((prev) => (sameLayout(prev, next) ? prev : next));
    setCurrent(cur);
  }, [editor, scroller]);
  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc || editor.isDestroyed) return;
    // A note loaded (or reopened) is a new editor: its headings at once, and nothing left from the last.
    setHeadings(outlineOf(editor.state.doc));
    setCurrent(-1);
    caretInView.current = false;
    held.current = null;
    reading.current = false;
    if (openRef.current) setOpen(null);
    lengths.current = lengthReader(sc.parentElement ?? sc);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (editor.isDestroyed) return;
        const hs = outlineOf(editor.state.doc);
        if (signature(hs) !== signature(headingsRef.current)) setHeadings(hs);
        schedule();
      }, OUTLINE_DELAY_MS);
    };
    // Typing: the caret's section from document positions alone, no layout (PRF-01). A caret move
    // ends reading: its section is current again.
    const onSelection = () => {
      reading.current = false;
      if (!caretInView.current || !editor.view.hasFocus()) return schedule();
      const cur = caretSection(headingsRef.current, editor.state.selection.$head.index(0));
      held.current = cur;
      setCurrent(cur);
    };
    // The wheel, or a press on the scrollbar: reading, so the heading in view is current (the owner, 17 October).
    const onWheel = () => {
      reading.current = true;
    };
    const onPress = (ev: PointerEvent) => {
      const b = sc.getBoundingClientRect();
      if (ev.clientX >= b.left + sc.clientLeft + sc.clientWidth) reading.current = true;
    };
    sc.addEventListener("wheel", onWheel, { passive: true });
    sc.addEventListener("pointerdown", onPress);
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onSelection);
    // Focus moving (Spotlight, a menu, the toolbar) changes little here, and its frame belongs to
    // what's opening (PRF-14): measured once things settle, not in that frame.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(settle);
      settle = setTimeout(schedule, OUTLINE_DELAY_MS);
    };
    editor.on("focus", later);
    editor.on("blur", later);
    sc.addEventListener("scroll", schedule, { passive: true });
    // The scroller's size, or the text column's width (the scale, a pinned panel): lengths re-read.
    // The text growing taller as you type is left to the pause after it (onUpdate).
    let textWidth = -1;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        if (e.target === sc) changed = true;
        else if (e.contentRect.width !== textWidth) {
          textWidth = e.contentRect.width;
          changed = true;
        }
      }
      if (!changed) return;
      lengths.current?.reset();
      schedule();
    });
    ro.observe(sc);
    ro.observe(editor.view.dom);
    const offPinned = dockLeft.subscribe(schedule);
    schedule();
    return () => {
      clearTimeout(pending);
      clearTimeout(settle);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("pointerdown", onPress);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
      editor.off("focus", later);
      editor.off("blur", later);
      sc.removeEventListener("scroll", schedule);
      ro.disconnect();
      offPinned();
      lengths.current?.dispose();
      lengths.current = null;
    };
  }, [editor, scroller, schedule]);

  useEffect(() => () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.close);
  }, []);

  const enough = headings.length >= MIN_HEADINGS;
  // Docking (D-187): the contents ask with their width while pinned and showing; docked Files asks with
  // its own. The window decides what docks, keeping the note's narrowest area: Files is first to undock.
  const outlineAsk = pinned && enough;
  const [dockAllowed, setDockAllowed] = useState(false);
  const [live, setLive] = useState<number | null>(null);
  const dockLengths = () => ({ def: px(t.dock.width), files: px(t.dock.filesWidth), min: px(t.dock.min), max: px(t.dock.max), content: px(t.dock.contentMin) });
  const clampWidth = (w: number, l: { min: number; max: number }) => Math.max(l.min, Math.min(l.max, w));
  const filesFit = useRef<boolean | null>(null);
  const onFilesFitRef = useRef(onFilesFit);
  onFilesFitRef.current = onFilesFit;
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const arbitrate = () => {
      const l = dockLengths();
      if (!l.max) return;
      const files = filesDock ? clampWidth(filesWidth || l.files, l) : undefined;
      const outline = outlineAsk ? clampWidth(dockWidth || l.def, l) : undefined;
      const a = allocateDocks({ width: fixedBox(sc).width, files, outline, contentMin: l.content });
      setDockAllowed(a.outline);
      const fits = filesDock ? a.files : true;
      if (filesFit.current !== fits) {
        filesFit.current = fits;
        onFilesFitRef.current?.(fits);
      }
    };
    arbitrate();
    addEventListener("resize", arbitrate);
    return () => removeEventListener("resize", arbitrate);
  }, [scroller, filesDock, filesWidth, outlineAsk, dockWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const docked = outlineAsk && dockAllowed;
  const dockedWidth = live ?? (lengths.current ? clampWidth(dockWidth || px(t.dock.width), dockLengths()) : 0);
  // The note's area keeps clear of the docked contents, and gets the room back when they go.
  useEffect(() => {
    pinnedRight.set(docked && dockedWidth ? dockedWidth : 0);
  }, [docked, dockedWidth]);
  // The window's controls stay shown at the top of the docked contents (D-187).
  useEffect(() => {
    if (!docked) return;
    document.documentElement.dataset.dockRight = "";
    return () => {
      delete document.documentElement.dataset.dockRight;
    };
  }, [docked]);
  useEffect(() => () => pinnedRight.set(0), []);
  const pinnedRef = useRef(docked);
  pinnedRef.current = docked;
  const pinnedShown = docked;
  const handle = useResizeHandle({
    width: dockedWidth,
    min: px(t.dock.min),
    max: () => dockMaxWidth({ window: scroller.current ? fixedBox(scroller.current).width : innerWidth, other: dockLeft.get(), contentMin: px(t.dock.contentMin), min: px(t.dock.min), max: px(t.dock.max) }),
    edge: "start",
    onResize: (w) => setLive(w),
    onCommit: (w) => {
      setLive(null);
      onResize?.(w);
    },
    onReset: () => {
      setLive(null);
      onResize?.(px(t.dock.width));
    },
  });
  // Focus mode is on by default, so the rail stays: it sits beside the text, never on it (D-185).
  const railShown = enough && layout.room && !pinnedShown;
  const cardShown = Boolean(open) || pinnedShown;
  // Nothing left to show: a card opened from the rail goes with it.
  useEffect(() => {
    if (!enough || (!railShown && open !== "keyboard")) {
      if (openRef.current) setOpen(null);
    }
  }, [enough, railShown, open, setOpen]);

  const backToNote = useCallback(() => {
    if (!editor.isDestroyed) editor.view.focus();
  }, [editor]);
  // The rail going (a narrower window, a pinned panel) while it holds focus: focus goes to the note.
  useEffect(() => {
    if (railShown || !railFocused.current) return;
    railFocused.current = false;
    backToNote();
  }, [railShown, backToNote]);

  const close = useCallback((restore: boolean) => {
    const was = openRef.current;
    const inside = Boolean(navRef.current?.contains(document.activeElement));
    // Focus in the card goes back with setOpen; opened from Spotlight and not yet focused, to the note.
    setOpen(null);
    if (restore && was === "keyboard" && !inside) backToNote();
  }, [backToNote, setOpen]);

  useImperativeHandle(ref, () => ({
    openFromKeyboard() {
      if (headingsRef.current.length < MIN_HEADINGS) return false;
      returnTo.current = "note";
      setOpen("keyboard");
      claimUntil.current = performance.now() + CLAIM_MS;
      schedule();
      return true;
    },
  }), [schedule, setOpen]);

  // Run from Spotlight, the card opens while the dialog still holds focus; the dialog hands focus back
  // to the note as it leaves, a frame or more later. Until then (within a second, and only until the
  // first key or press), focus goes to the current heading once no dialog is open.
  useEffect(() => {
    if (open !== "keyboard" || !claimUntil.current) return;
    let raf = 0;
    const stop = () => { claimUntil.current = 0; };
    const tick = () => {
      if (performance.now() > claimUntil.current) return stop();
      const nav = navRef.current;
      if (nav && !document.querySelector("[data-dialog-modal]") && !nav.contains(document.activeElement)) focusCurrent();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Any key, anywhere (typing into the note as the dialog leaves), or any press ends the claim.
    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("keydown", stop, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", stop, true);
      window.removeEventListener("keydown", stop, true);
    };
  }, [open]);

  function focusCurrent() {
    const items = listRef.current ? [...listRef.current.querySelectorAll<HTMLButtonElement>("button")] : [];
    (items.find((b) => b.getAttribute("aria-current") === "location") ?? items[0])?.focus();
  }

  // Placed once drawn, centred on the rail (or the note) and kept inside it; the current heading
  // scrolled into view, and focus on it when the keyboard opened the card.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const card = cardRef.current;
    const sc = scroller.current;
    if (!nav || !card || !sc || !cardShown) return;
    const h = sc.clientHeight;
    const edgeTop = px(t.edgeTop);
    const edgeBottom = px(t.edgeBottom);
    const max = Math.max(0, Math.min(h * (parseFloat(read(sc, t.cardMax)) || 0), h - edgeTop - edgeBottom));
    nav.style.setProperty(varName(s.cardMaxVar), `${Math.round(max)}px`);
    if (pinnedShown && dockedWidth) nav.style.setProperty(varName(s.dockWidthVar), `${dockedWidth}px`);
    const center = railShown ? layout.center : h / 2;
    nav.style.setProperty(varName(s.cardTopVar), `${Math.round(cardTop(center, card.offsetHeight, edgeTop, h - edgeBottom))}px`);
    const list = listRef.current;
    const items = list ? [...list.querySelectorAll<HTMLButtonElement>("button")] : [];
    const target = items[current >= 0 ? current : 0];
    // Kept in view, scrolling only when it would leave the list (pinned, it follows the reading).
    if (list && target) {
      const top = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      if (top < list.scrollTop || top + target.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = Math.max(0, top - (list.clientHeight - target.offsetHeight) / 2);
      }
    }
    if (open === "keyboard" && target && !card.contains(document.activeElement) && !document.querySelector("[data-dialog-modal]")) target.focus();
  }, [open, cardShown, pinnedShown, dockedWidth, layout, railShown, scroller, current, headings]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    nav.style.setProperty(varName(s.railTopVar), `${layout.top}px`);
    nav.style.setProperty(varName(s.railHeightVar), `${layout.indices.length * layout.pitch}px`);
    nav.style.setProperty(varName(s.pitchVar), `${layout.pitch}px`);
  });

  // Esc closes the card and does nothing else (WCAG 1.4.13: dismissible without moving the pointer).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      // A hover card is only the pointer's: Esc belongs to a dialog, menu or field that has focus.
      const a = document.activeElement;
      const ours = Boolean(navRef.current?.contains(a));
      if (!ours && openRef.current !== "keyboard") {
        const free = !a || a === document.body || (!editor.isDestroyed && editor.view.dom.contains(a));
        if (!free || document.querySelector("[data-dialog-modal], [data-floating-child]")) return;
      }
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close, editor]);

  const delay = (which: "open" | "close") => (navRef.current ? ms(navRef.current, which === "open" ? t.openDelay : t.closeDelay) : 0);
  const pointerIn = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch") return;
    clearTimeout(timers.current.close);
    if (openRef.current || pinnedRef.current) return;
    clearTimeout(timers.current.open);
    timers.current.open = setTimeout(() => {
      if (!openRef.current) setOpen("hover");
    }, delay("open"));
  };
  const pointerOut = (e: ReactPointerEvent) => {
    if (e.pointerType === "touch") return;
    clearTimeout(timers.current.open);
    if (openRef.current !== "hover" && openRef.current !== "click") return;
    clearTimeout(timers.current.close);
    timers.current.close = setTimeout(() => {
      // Focus inside keeps it open: persistent while focused, as well as while pointed at.
      if (navRef.current?.contains(document.activeElement)) return;
      setOpen(null);
    }, delay("close"));
  };
  // A press never takes focus from the note: typing carries on where it was.
  const keepFocus = (e: ReactPointerEvent) => {
    if (e.button === 0) e.preventDefault();
  };

  const toggle = (e: ReactMouseEvent) => {
    if (openRef.current) return close(e.detail === 0);
    // Enter or Space on the focused rail (a click with no pointer) moves focus into the card.
    if (e.detail === 0) {
      returnTo.current = "rail";
      setOpen("keyboard");
    } else setOpen("click");
  };

  const jump = (i: number) => {
    const wanted = headings[i];
    if (!wanted || editor.isDestroyed) return;
    const fresh = outlineOf(editor.state.doc);
    const h = fresh.find((x) => x.index === wanted.index && x.text === wanted.text) ?? fresh[i];
    const sc = scroller.current;
    if (!h || !sc) return;
    const { view } = editor;
    // Focus to the note first, so closing the card has nothing to hand back.
    focusAtPosition(editor, h.pos + 1);
    setOpen(null);
    // To the reading zone's top, gliding as the reading zone's own scrolls do (200 ms, D-156). The
    // caret is aimed just inside the band, so the reading zone, checking where the scroll is heading,
    // has nothing to correct (D-185); aiming the heading's box left the caret a pixel above it, and
    // the correction cut the glide short.
    let caretTop: number | undefined;
    try {
      caretTop = view.coordsAtPos(h.pos + 1).top;
    } catch { /* not drawn yet */ }
    const dom = view.nodeDOM(h.pos);
    if (caretTop === undefined && dom instanceof HTMLElement) caretTop = dom.getBoundingClientRect().top;
    if (caretTop !== undefined) {
      const line = sc.clientHeight * (parseFloat(read(sc, tokens.cmp.editorSurface.zoneTop)) || 0);
      glideTo(sc, sc.scrollTop + caretTop - (sc.getBoundingClientRect().top + sc.clientTop) - line - 0.5);
    }
    caretInView.current = true;
    setCurrent(fresh.indexOf(h));
    schedule();
  };

  const onListKey = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowDown" ? Math.min(items.length - 1, at + 1) : e.key === "ArrowUp" ? Math.max(0, at - 1) : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus();
  };
  // Tab out of the card (or anywhere focus leaves it) closes it.
  const onBlur = (e: ReactFocusEvent) => {
    if (e.target === railRef.current) railFocused.current = false;
    if (openRef.current !== "keyboard" || claimUntil.current) return;
    const next = e.relatedTarget;
    if (next instanceof Node && navRef.current?.contains(next)) return;
    setOpen(null);
  };
  // Focus entering a card the pointer opened makes it the keyboard's: Esc, Tab and leaving then
  // behave as they do for Show contents, and it no longer closes as the pointer leaves.
  const onFocus = (e: ReactFocusEvent) => {
    if (e.target === railRef.current) railFocused.current = true;
    // (Not for a pointer press on the pin from the note: the caret goes straight back.)
    if (noteHadFocus.current) return;
    if ((openRef.current === "hover" || openRef.current === "click") && cardRef.current?.contains(e.target)) {
      returnTo.current = "note";
      setOpen("keyboard");
    }
  };
  // Esc in a pinned card: the caret back to the note, the card kept (as pinned Files, D-161).
  const onNavKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "Escape" || e.nativeEvent.isComposing || openRef.current || !pinnedRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    backToNote();
  };

  // The pin (D-186). A pointer press leaves the caret in the note; unpinned from the card, it stays
  // as a hover card (or the keyboard's, with focus in it) until it's left.
  const pinDown = () => {
    noteHadFocus.current = !editor.isDestroyed && editor.view.hasFocus();
  };
  const togglePin = () => {
    const unpinning = pinned;
    const focusIn = Boolean(cardRef.current?.contains(document.activeElement)) && !noteHadFocus.current;
    // Docked the first time, it keeps the card's width (the owner: pinning doesn't change it); resized
    // later, that width is what it keeps (D-187).
    const card = cardRef.current;
    if (!unpinning && !dockWidth && card && !card.hasAttribute("data-docked")) {
      const l = dockLengths();
      onResize?.(clampWidth(card.offsetWidth, l));
    }
    onPin?.();
    if (unpinning) {
      returnTo.current = "note";
      setOpen(focusIn ? "keyboard" : "hover");
    }
    if (noteHadFocus.current) {
      noteHadFocus.current = false;
      backToNote();
    }
  };

  if (!enough || (!railShown && !cardShown)) return null;
  const depths = depthsOf(headings);
  const focusIndex = current >= 0 ? current : 0;
  // Nested by level: a heading's subsections are a list inside its item.
  const entries = (nodes: OutlineNode[]) => nodes.map(({ i, children }) => {
    const h = headings[i]!;
    return (
      <li key={`${h.index}:${i}`} className={s.entry}>
        <button
          type="button"
          className={`${s.item} ${s.indent[Math.min(5, depths[i] ?? 0) as 0 | 1 | 2 | 3 | 4 | 5]}`}
          tabIndex={i === focusIndex ? 0 : -1}
          aria-current={i === current ? "location" : undefined}
          data-untitled={h.text ? undefined : ""}
          onPointerDown={keepFocus}
          onClick={() => jump(i)}
        >
          <span className={s.label} dir="auto">{h.text || untitled}</span>
        </button>
        {children.length ? <ul className={s.sublist}>{entries(children)}</ul> : null}
      </li>
    );
  });
  return (
    <nav ref={navRef} className={s.nav} aria-label={label} data-doc-minimap="" onBlur={onBlur} onFocus={onFocus} onKeyDown={onNavKey}>
      {railShown ? (
        <button
          ref={railRef}
          type="button"
          className={s.rail}
          aria-label={label}
          aria-expanded={Boolean(open)}
          tabIndex={open ? -1 : 0}
          {...(open ? { "aria-controls": cardId } : {})}
          data-doc-minimap-rail=""
          onPointerEnter={pointerIn}
          onPointerLeave={pointerOut}
          onPointerDown={keepFocus}
          onClick={toggle}
        >
          {layout.indices.map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`${s.bar} ${s.barDepth[Math.min(3, depths[i] ?? 0) as 0 | 1 | 2 | 3]}`}
              data-current={i === current ? "" : undefined}
            />
          ))}
        </button>
      ) : null}
      {cardShown ? (
        <div
          ref={cardRef} id={cardId} className={s.card} data-doc-minimap-card="" data-surface="popover"
          data-pinned={pinnedShown ? "" : undefined}
          data-docked={pinnedShown ? "" : undefined}
          onPointerEnter={pointerIn} onPointerLeave={pointerOut}
        >
          {onPin ? (
            <div className={s.head} onPointerDownCapture={pinDown}>
              <IconButton icon={pinned ? "pinOff" : "pin"} label={pinned ? unpinLabel : pinLabel} toggle pressed={pinned} tone="muted" onPress={togglePin} />
            </div>
          ) : null}
          <ul ref={listRef} className={s.list} data-pin={onPin ? "" : undefined} onKeyDown={onListKey}>
            {entries(nestOutline(depths))}
          </ul>
          {pinnedShown && onResize && dockedWidth ? <div className={s.handle} aria-label={resizeLabel ?? label} data-dock-handle="" {...handle} /> : null}
        </div>
      ) : null}
    </nav>
  );
});

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "react-aria-components";
import { CommandMenu } from "../../primitives/MenuButton/MenuButton.tsx";
import * as menuStyles from "../../primitives/MenuButton/MenuButton.css.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import type { MenuSection } from "../../data.ts";
import * as s from "./TextMenu.css.ts";

export interface TextMenuProps {
  label: string;
  sections: MenuSection[];
  request?: number;
  x?: number;
  y?: number;
  open?: boolean;
  onAction?: (p: { id: string }) => void;
  onClose?: () => void;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/** Where focus and the selection were as the menu opened: they go back exactly there (cut and copy act on the selection). */
interface Saved {
  el: HTMLElement | null;
  ranges: Range[];
}
function save(): Saved {
  const sel = typeof getSelection === "function" ? getSelection() : null;
  const ranges = sel ? Array.from({ length: sel.rangeCount }, (_, i) => sel.getRangeAt(i).cloneRange()) : [];
  return { el: document.activeElement instanceof HTMLElement ? document.activeElement : null, ranges };
}
function restore(saved: Saved | undefined) {
  if (!saved?.el?.isConnected) return;
  saved.el.focus({ preventScroll: true });
  const sel = getSelection();
  if (!sel || !saved.ranges.length) return;
  sel.removeAllRanges();
  for (const r of saved.ranges) sel.addRange(r);
}

/**
 * The right-click menu in text the app draws on Windows and Linux (D-204, EDT-14): the shared command
 * menu at the pointer, in the theme. It opens as the shell's menu arrives (each new `request`), and
 * closes on Esc, a click outside, a scroll, the window losing focus, or a resize; focus and the
 * selection go back to the text before a chosen item is acted on.
 */
export function TextMenu({ label, sections, request = 0, x = 0, y = 0, open: openAtStart = false, onAction, onClose }: TextMenuProps) {
  const boundary = useWindowBoundary();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(openAtStart);
  const seen = useRef(request);
  const saved = useRef<Saved | undefined>(undefined);
  const events = useRef({ onAction, onClose });
  events.current = { onAction, onClose };

  // Before the menu takes focus: where the caret and selection are now.
  useLayoutEffect(() => {
    if (request === seen.current) return;
    seen.current = request;
    if (!sections.length) return;
    saved.current = save();
    setOpen(true);
  }, [request, sections.length]);
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const o = fixedBox(el);
    el.style.setProperty(name(s.xVar), `${Math.round(x - o.left)}px`);
    el.style.setProperty(name(s.yVar), `${Math.round(y - o.top)}px`);
  });

  const close = (chosen?: string) => {
    setOpen(false);
    const back = saved.current;
    saved.current = undefined;
    restore(back);
    if (chosen === undefined) {
      events.current.onClose?.();
      // The popover's own focus handling can leave focus nowhere as it unmounts (Linux): unless
      // something else took focus (a click outside), the text gets it and its selection back.
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (!now || now === document.body || !now.isConnected) restore(back);
      });
      return;
    }
    // The chosen item acts once the menu is gone and the text has focus and its selection again
    // (the menu's own focus handling runs as it closes), so the shell's cut, copy or delete acts on it.
    requestAnimationFrame(() => {
      restore(back);
      events.current.onAction?.({ id: chosen });
    });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // A scroll or a wheel anywhere but the menu (a short note doesn't scroll), the window losing focus,
  // or a resize closes it, as a system menu does.
  useEffect(() => {
    if (!open) return;
    const scroll = (e: Event) => {
      if (e.target instanceof Node && popoverRef.current?.contains(e.target)) return;
      closeRef.current();
    };
    const away = () => closeRef.current();
    addEventListener("scroll", scroll, true);
    addEventListener("wheel", scroll, { capture: true, passive: true });
    addEventListener("blur", away);
    addEventListener("resize", away);
    return () => {
      removeEventListener("scroll", scroll, true);
      removeEventListener("wheel", scroll, { capture: true });
      removeEventListener("blur", away);
      removeEventListener("resize", away);
    };
  }, [open]);

  return (
    <>
      <div ref={anchorRef} className={s.anchor} aria-hidden="true" />
      {open && sections.length ? (
        <Popover
          ref={popoverRef}
          triggerRef={anchorRef}
          isOpen
          onOpenChange={(o) => {
            if (!o) close();
          }}
          placement="bottom start"
          offset={0}
          className={menuStyles.popover}
          {...boundary}
          aria-label={label}
          data-floating-child=""
          data-surface="popover"
          data-text-menu=""
        >
          <CommandMenu label={label} sections={sections} autoFocus onAction={({ id }) => close(id)} />
        </Popover>
      ) : null}
    </>
  );
}

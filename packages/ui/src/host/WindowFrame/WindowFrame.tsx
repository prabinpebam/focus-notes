import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Popover } from "react-aria-components";
import { CommandMenu } from "../../primitives/MenuButton/MenuButton.tsx";
import * as menuStyles from "../../primitives/MenuButton/MenuButton.css.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import type { MenuSection } from "../../data.ts";
import * as s from "./WindowFrame.css.ts";

const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type Kind = "move" | (typeof EDGES)[number];
export interface DragPayload { phase: "start" | "move" | "end"; kind: Kind; x: number; y: number; shift: boolean }

export interface WindowFrameProps {
  frame?: "native" | "rounded" | "square";
  resizable?: boolean;
  menu: MenuSection[];
  menuLabel: string;
  menuRequest?: number;
  menuX?: number;
  menuY?: number;
  keyboard?: "none" | "move" | "size";
  onDrag?: (p: DragPayload) => void;
  onToggleMaximize?: () => void;
  onMenu?: (p: { x: number; y: number }) => void;
  onAction?: (p: { id: string }) => void;
  onKey?: (p: { key: string; fine: boolean }) => void;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");
const band = (t: EventTarget | null) => {
  const el = t instanceof Element ? t : null;
  return Boolean(el?.closest("[data-drag-band]") && !el.closest("[data-no-drag]"));
};

/**
 * The app-built window on Windows and Linux (Desktop app → Window management): the app moves the
 * window itself, so it can snap at screen edges (DD-DSK-02), and resizes it from handles on every
 * edge and corner. Positions are screen coordinates in DIP; the shell does the rest. Draws nothing
 * where the system owns the window.
 */
export function WindowFrame({ frame = "native", resizable, menu, menuLabel, menuRequest = 0, menuX = -1, menuY = -1, keyboard = "none", onDrag, onToggleMaximize, onMenu, onAction, onKey }: WindowFrameProps) {
  const custom = frame !== "native";
  const events = useRef({ onDrag, onToggleMaximize, onMenu, onKey });
  events.current = { onDrag, onToggleMaximize, onMenu, onKey };

  // While the system menu's Move or Size runs, the keys move the window, not the note.
  useEffect(() => {
    if (!custom || keyboard === "none") return;
    const keydown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (/^(Arrow(Left|Right|Up|Down)|Enter|Escape)$/.test(e.key)) events.current.onKey?.({ key: e.key, fine: e.ctrlKey });
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, [custom, keyboard]);

  useEffect(() => {
    if (!custom) return;
    const html = document.documentElement;
    let drag: { id: number; kind: Kind; x: number; y: number; shift: boolean } | undefined;
    let frameId = 0;
    const emit = (phase: DragPayload["phase"]) => drag && events.current.onDrag?.({ phase, kind: drag.kind, x: drag.x, y: drag.y, shift: drag.shift });
    const track = (e: PointerEvent) => {
      if (!drag) return;
      drag.x = e.screenX;
      drag.y = e.screenY;
      drag.shift = e.shiftKey;
    };
    const down = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const handle = target?.closest("[data-window-handle]")?.getAttribute("data-window-handle") as Kind | null | undefined;
      if (!handle && !band(target)) return;
      // A press on the band (any button) never takes focus from the note.
      e.preventDefault();
      if (e.button !== 0 || drag) return;
      drag = { id: e.pointerId, kind: handle ?? "move", x: e.screenX, y: e.screenY, shift: e.shiftKey };
      try {
        target?.setPointerCapture(e.pointerId);
      } catch {
        // Not a real pointer (tests dispatch their own events): the document still gets its moves.
      }
      emit("start");
    };
    // At most one move per frame reaches the shell (Window management → Move).
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      track(e);
      if (!frameId) frameId = requestAnimationFrame(() => ((frameId = 0), emit("move")));
    };
    // It ends where the last move was: a release always comes after the move that took the pointer there.
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      cancelAnimationFrame(frameId);
      frameId = 0;
      emit("end");
      drag = undefined;
    };
    const dblclick = (e: MouseEvent) => {
      if (band(e.target)) events.current.onToggleMaximize?.();
    };
    const contextmenu = (e: MouseEvent) => {
      if (!band(e.target)) return;
      e.preventDefault();
      const o = fixedBox();
      events.current.onMenu?.({ x: Math.round(e.clientX - o.left), y: Math.round(e.clientY - o.top) });
    };
    // The window controls show while the pointer is over the band (DD-DSK-04).
    const over = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("[data-drag-band], [data-window-controls]")) html.dataset.windowBand = "";
      else delete html.dataset.windowBand;
    };
    const out = (e: PointerEvent) => {
      if (!e.relatedTarget) delete html.dataset.windowBand;
    };
    // Alt+Space opens the system menu. The shell catches it before the system does; this is for
    // anything that reaches the page anyway.
    const keydown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      events.current.onMenu?.({ x: -1, y: -1 });
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("dblclick", dblclick);
    document.addEventListener("contextmenu", contextmenu);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("dblclick", dblclick);
      document.removeEventListener("contextmenu", contextmenu);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      delete html.dataset.windowBand;
    };
  }, [custom]);

  // The system menu (Alt+Space, or right-clicking the band) opens at the pointer or under the band's start.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const seen = useRef(menuRequest);
  useEffect(() => {
    if (menuRequest === seen.current) return;
    seen.current = menuRequest;
    if (custom && menu.length) setOpen(true);
  }, [menuRequest, custom, menu.length]);
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    if (menuX < 0 || menuY < 0) {
      el.style.removeProperty(name(s.xVar));
      el.style.removeProperty(name(s.yVar));
    } else {
      el.style.setProperty(name(s.xVar), `${Math.round(menuX)}px`);
      el.style.setProperty(name(s.yVar), `${Math.round(menuY)}px`);
    }
  });

  if (!custom) return null;
  return (
    <>
      <div ref={anchorRef} className={s.anchor} aria-hidden="true" />
      {open ? (
        <Popover triggerRef={anchorRef} isOpen onOpenChange={setOpen} placement="bottom start" className={menuStyles.popover} aria-label={menuLabel} data-floating-child="">
          <CommandMenu
            label={menuLabel}
            sections={menu}
            autoFocus
            onAction={({ id }) => {
              setOpen(false);
              onAction?.({ id });
            }}
          />
        </Popover>
      ) : null}
      {resizable
        ? createPortal(
            <div className={`${s.handles} ${s.place[frame]}`} aria-hidden="true" data-window-handles="">
              {EDGES.map((e) => <div key={e} className={`${s.handle} ${s.edge[e]}`} data-window-handle={e} />)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

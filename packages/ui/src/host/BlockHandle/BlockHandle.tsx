import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Popover } from "react-aria-components";
import { CommandMenu } from "../../primitives/MenuButton/MenuButton.tsx";
import * as menuStyles from "../../primitives/MenuButton/MenuButton.css.ts";
import { Icon } from "../../primitives/Icon/Icon.tsx";
import { blockGeometry, type BlockTarget } from "../../behaviors/block-geometry.ts";
import { anchors, COMPANION_ATTR } from "../../behaviors/anchors.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import type { MenuSection } from "../../data.ts";
import * as s from "./BlockHandle.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";

export interface BlockAction {
  id: string;
  block: number;
  to: number;
}

export interface BlockHandleProps {
  /** "Paragraph options", "Heading 2 options" (Text formatting → Block handle → Accessibility). */
  label: string;
  /** The block menu: Turn into, Duplicate, Move up and down, Copy link to a heading, Delete. */
  menu: MenuSection[];
  /** Each new value opens the menu at the caret's block (Shift+F10, the Menu key). */
  menuRequest?: number;
  onAction?: (payload: BlockAction) => void;
  /** The menu closed, or a drag ended: the caret goes back to the note. */
  onClose?: () => void;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");
/** A drag starts once the pointer has moved this far from where it pressed. */
const DRAG_SLOP_PX = 4;
/** Within this far of the note's top or bottom edge, a drag scrolls the note, this much a frame. */
const EDGE_PX = 48;
const EDGE_STEP_PX = 12;

/** Writes a box's place (and size) from the geometry, in the drawn window's coordinates (D-14). */
function usePlace(ref: RefObject<HTMLElement | null>, x: number, y: number, w?: number, h?: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = fixedBox(el);
    el.style.setProperty(name(s.xVar), `${Math.round(x - o.left)}px`);
    el.style.setProperty(name(s.yVar), `${Math.round(y - o.top)}px`);
    if (w !== undefined) el.style.setProperty(name(s.wVar), `${Math.round(w)}px`);
    if (h !== undefined) el.style.setProperty(name(s.hVar), `${Math.round(h)}px`);
  });
}
function Area({ className, x, y, w, h, mark }: { className: string; x: number; y: number; w: number; h?: number; mark: "lift" | "drop" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  usePlace(ref, x, y, w, h);
  return <div ref={ref} className={className} aria-hidden="true" {...{ [`data-${mark}`]: "" }} />;
}

interface Drag { block: number; target: BlockTarget | null }

/**
 * The block handle (IA-CMP-HANDLE, EDT-07): a grip in the gutter beside the hovered block. Pressing it
 * answers at once; releasing it opens the block menu; moving it drags the block, with an accent line
 * where it will land, and the note scrolling near its edges. Esc cancels a drag. The menu is the one
 * MenuButton opens, follows its grip as the note moves, and ends any auto-scroll as it opens (DEF-21).
 */
export function BlockHandle({ label, menu, menuRequest = 0, onAction, onClose }: BlockHandleProps) {
  const boundary = useWindowBoundary();
  const g = useSyncExternalStore(blockGeometry.subscribe, blockGeometry.get, () => null);
  const [open, setOpen] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const hovered = useRef(false);
  const dragged = useRef(false);
  const gripRef = useRef<HTMLButtonElement | null>(null);

  // The block stays while the pointer is on the grip, the menu is open, or a drag is under way.
  useEffect(() => {
    blockGeometry.held = hovered.current || open !== null || Boolean(drag);
    if (!blockGeometry.held) blockGeometry.refresh();
  }, [open, drag]);
  useEffect(() => () => { blockGeometry.held = false; }, []);
  // A surface anchored to the note is open: the note's auto-scroll ends, and its scrolls are instant (DEF-21).
  useEffect(() => (open !== null ? anchors.opening() : undefined), [open]);
  // The block went away (deleted, or the note changed) with the menu open: the menu goes too.
  useEffect(() => {
    if (!g && open !== null) close();
  }, [g, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The menu, asked for from the keyboard: the editor has moved the grip to the caret's block.
  // From 0: the grip mounts with the request when it wasn't showing (the count restarts when it hides).
  const lastRequest = useRef(0);
  useEffect(() => {
    if (menuRequest === lastRequest.current) return;
    lastRequest.current = menuRequest;
    const now = blockGeometry.get();
    if (now) setOpen(now.block);
  }, [menuRequest]);

  const close = () => {
    setOpen(null);
    // After the menu has handed focus back to its grip, the caret goes back to the note.
    requestAnimationFrame(() => onClose?.());
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !g) return;
    setPressed(true);
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    const block = g.block;
    let targets: BlockTarget[] | null = null;
    let current: Drag | null = null;
    let edge = 0;
    let lastY = start.y;
    dragged.current = false;
    el.setPointerCapture?.(e.pointerId);
    const nearest = (y: number) => {
      let best: BlockTarget | null = null;
      for (const t of targets ?? []) if (!best || Math.abs(t.at - y) < Math.abs(best.at - y)) best = t;
      return best;
    };
    const follow = (y: number) => {
      current = { block, target: nearest(y) };
      setDrag(current);
    };
    // Near the note's top or bottom edge, the note scrolls, and the line follows (Text formatting → Block handle).
    const scrollEdge = () => {
      edge = 0;
      const scroller = document.querySelector("[data-editor-scroller]")?.getBoundingClientRect();
      if (!scroller || !current) return;
      const dy = lastY < scroller.top + EDGE_PX ? -EDGE_STEP_PX : lastY > scroller.bottom - EDGE_PX ? EDGE_STEP_PX : 0;
      if (!dy) return;
      blockGeometry.scrollBy(dy);
      targets = blockGeometry.targets(block);
      follow(lastY);
      edge = requestAnimationFrame(scrollEdge);
    };
    const stop = () => {
      cancelAnimationFrame(edge);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      setPressed(false);
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      lastY = ev.clientY;
      if (!targets) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_SLOP_PX) return;
        targets = blockGeometry.targets(block);
        dragged.current = true;
      }
      follow(ev.clientY);
      if (!edge) edge = requestAnimationFrame(scrollEdge);
    };
    const up = () => {
      const was = current;
      stop();
      if (!was?.target) return;
      onAction?.({ id: "block.moveTo", block, to: was.target.to });
      requestAnimationFrame(() => onClose?.());
    };
    const cancel = () => { current = null; stop(); };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      current = null;
      stop();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
  };
  const onPress = () => {
    // A drag isn't a click.
    if (dragged.current) { dragged.current = false; return; }
    if (g) setOpen(g.block);
  };

  const shown = g && (open === null || open === g.block) ? g : null;
  return (
    <div
      className={s.root}
      {...{ [COMPANION_ATTR]: "" }}
      data-block-handle=""
      onPointerEnter={() => { hovered.current = true; blockGeometry.held = true; }}
      onPointerLeave={() => {
        hovered.current = false;
        blockGeometry.held = open !== null || Boolean(drag);
        blockGeometry.refresh();
      }}
    >
      {shown && (open !== null || drag) ? <Area className={s.lift} x={shown.box.left} y={shown.box.top} w={shown.box.right - shown.box.left} h={shown.box.bottom - shown.box.top} mark="lift" /> : null}
      {drag?.target ? <Area className={s.drop} x={drag.target.left} y={drag.target.at} w={drag.target.right - drag.target.left} mark="drop" /> : null}
      {shown ? (
        <Grip
          gripRef={gripRef} label={label} x={shown.column} y={(shown.line.top + shown.line.bottom) / 2}
          expanded={open !== null} pressed={pressed} dragging={Boolean(drag)} onPointerDown={onPointerDown} onPress={onPress}
        />
      ) : null}
      {open !== null && shown ? (
        <Popover
          triggerRef={gripRef}
          isOpen
          onOpenChange={(o) => { if (!o) close(); }}
          placement="bottom start"
          offset={4}
          className={menuStyles.popover}
          {...boundary}
          data-surface="popover"
          aria-label={label}
          data-floating-child=""
        >
          <CommandMenu
            label={label}
            sections={menu}
            autoFocus
            onAction={({ id }) => {
              onAction?.({ id, block: open, to: 0 });
              close();
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

interface GripProps {
  gripRef: RefObject<HTMLButtonElement | null>;
  label: string;
  x: number;
  y: number;
  expanded: boolean;
  pressed: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPress: () => void;
}
function Grip({ gripRef, label, x, y, expanded, pressed, dragging, onPointerDown, onPress }: GripProps) {
  usePlace(gripRef, x, y);
  return (
    <button
      ref={gripRef}
      type="button"
      className={s.grip}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      // Out of the Tab order: it shows only on hover, and Shift+F10 opens the same menu from the keyboard.
      tabIndex={-1}
      {...(pressed ? { "data-pressed": "" } : {})}
      {...(dragging ? { "data-dragging": "" } : {})}
      // A pointer press never takes focus from the note.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onClick={onPress}
    >
      <Icon name="grip" size="s" />
    </button>
  );
}

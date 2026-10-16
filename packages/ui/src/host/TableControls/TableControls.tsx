import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { Popover } from "react-aria-components";
import { CommandMenu } from "../../primitives/MenuButton/MenuButton.tsx";
import * as menuStyles from "../../primitives/MenuButton/MenuButton.css.ts";
import { Icon } from "../../primitives/Icon/Icon.tsx";
import { tableGeometry, type Box, type TableGeometry } from "../../behaviors/table-geometry.ts";
import { anchors, COMPANION_ATTR } from "../../behaviors/anchors.ts";
import { fixedBox } from "../../behaviors/frame.ts";
import type { MenuSection } from "../../data.ts";
import * as s from "./TableControls.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";

export interface TableAction {
  id: string;
  table: number;
  row: number;
  col: number;
  index: number;
  from: number;
  to: number;
  /** A column's width and its neighbour's while resizing (D-182), in characters. */
  width?: number;
  next?: number;
}

/** The header row's bottom: where a column border stops resizing and starts inserting only (D-182). */
const headerBottom = (g: TableGeometry): number => tableGeometry.edges()?.rows[1] ?? g.frame.bottom;

export interface TableControlsProps {
  /** "Column 2, Owner, options", "Row 3 options", "Table options" (Tables → Accessibility). */
  columnLabel: string;
  rowLabel: string;
  tableLabel: string;
  /** "Insert row between rows 2 and 3", while an insertion point shows. */
  insertLabel?: string;
  newRowLabel: string;
  newColumnLabel: string;
  cellMenuLabel: string;
  columnMenu: MenuSection[];
  rowMenu: MenuSection[];
  tableMenu: MenuSection[];
  /** The context menu of the selected cells (right-click, Shift+F10, the Menu key). */
  cellMenu: MenuSection[];
  /** Each new value opens the context menu at the active cell. */
  menuRequest?: number;
  /** Fit to column or Bleed to edge (D-182). */
  layout?: "fit" | "bleed";
  onAction?: (payload: TableAction) => void;
  /** A menu closed, or a control was used: the caret goes back to the note. */
  onClose?: () => void;
}

const name = (v: string) => v.replace(/^var\(/, "").replace(/\)$/, "");

/** Writes a control's place (and size) from the geometry, as Positioner does. */
function usePlace(ref: RefObject<HTMLElement | null>, x: number, y: number, w?: number, h?: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The editor's geometry is in viewport coordinates; inside the drawn window (D-14) it moves into the window's.
    const o = fixedBox(el);
    el.style.setProperty(name(s.xVar), `${Math.round(x - o.left)}px`);
    el.style.setProperty(name(s.yVar), `${Math.round(y - o.top)}px`);
    if (w !== undefined) el.style.setProperty(name(s.wVar), `${Math.round(w)}px`);
    if (h !== undefined) el.style.setProperty(name(s.hVar), `${Math.round(h)}px`);
  });
}

function Area({ className, box }: { className: string; box: Box }) {
  const ref = useRef<HTMLDivElement | null>(null);
  usePlace(ref, box.left, box.top, box.right - box.left, box.bottom - box.top);
  return <div ref={ref} className={className} aria-hidden="true" />;
}

/**
 * The highlighted border (D-182): a press and release on it without moving inserts there, as the +
 * does; on a column border, a drag resizes the column on its left. Pointer only; the + and the menus
 * are what the keyboard and screen readers reach.
 */
function Strip({ className, box, onInsert, onResize, attr = "data-table-insert-line", onDoubleClick }: {
  className: string; box: Box; onInsert?: () => void; onResize?: (e: React.PointerEvent<HTMLDivElement>) => void; attr?: string; onDoubleClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  usePlace(ref, box.left, box.top, box.right - box.left, box.bottom - box.top);
  return (
    <div
      ref={ref}
      className={className}
      aria-hidden="true"
      {...{ [attr]: "" }}
      // Never takes focus from the note.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (onResize) return onResize(e);
        const start = { x: e.clientX, y: e.clientY };
        const el = e.currentTarget;
        const up = (ev: PointerEvent) => {
          el.removeEventListener("pointerup", up);
          if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) onInsert?.();
        };
        el.addEventListener("pointerup", up);
      }}
      onDoubleClick={onDoubleClick}
    />
  );
}

interface ButtonProps {
  className: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  expanded?: boolean;
  menu?: boolean;
  dragging?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onPress: () => void;
  onDragStart?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}
function Control({ className, label, x, y, w, h, expanded, menu, dragging, buttonRef, onPress, onDragStart, children }: ButtonProps) {
  const own = useRef<HTMLButtonElement | null>(null);
  const ref = buttonRef ?? own;
  usePlace(ref, x, y, w, h);
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      aria-label={label}
      {...(menu ? { "aria-haspopup": "menu" as const, "aria-expanded": Boolean(expanded) } : {})}
      {...(dragging ? { "data-dragging": "" } : {})}
      // A pointer press never takes focus from the note; Enter and Space still work from the keyboard.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={onDragStart}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

type MenuKind = "column" | "row" | "table" | "cell";
interface OpenMenu { kind: MenuKind; table: number; row: number; col: number }
interface Drag { axis: "row" | "column"; from: number; index: number; at: number; box: Box }

/**
 * Loop-style table controls (IA-CMP-TABLE, TBL-07, TBL-08, TBL-11): row and column handles that
 * open menus and drag to reorder, the + insertion point at the nearest edge boundary, the New row and
 * New column bars, the hovered column's tint, the selected range's outline, and the cell menu. It
 * draws over the note from the geometry the editor surface publishes, above the focus mask.
 */
export function TableControls({
  columnLabel, rowLabel, tableLabel, insertLabel = "", newRowLabel, newColumnLabel, cellMenuLabel,
  columnMenu, rowMenu, tableMenu, cellMenu, menuRequest = 0, layout = "fit", onAction, onClose,
}: TableControlsProps) {
  const boundary = useWindowBoundary();
  const g = useSyncExternalStore(tableGeometry.subscribe, tableGeometry.get, () => null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  /**
   * A menu from a cell near the window's right edge opens leftward, from the cell's right (D-111): a
   * table filling the column (D-182) puts cells there, and a menu starting at one ran past the edge.
   */
  const [menuEnd, setMenuEnd] = useState(false);
  const popoverRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!menu) { setMenuEnd(false); return; }
    let frame = requestAnimationFrame(function check() {
      const pop = popoverRef.current;
      const win = fixedBox(pop);
      if (!pop) { frame = requestAnimationFrame(check); return; }
      const r = pop.getBoundingClientRect();
      if (r.width && r.right > win.left + win.width - (boundary.containerPadding ?? 0) + 1) setMenuEnd(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps
  const [drag, setDrag] = useState<Drag | null>(null);
  const hovered = useRef(false);
  const dragged = useRef(false);
  const columnRef = useRef<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const tableRef = useRef<HTMLButtonElement | null>(null);
  const cellRef = useRef<HTMLDivElement | null>(null);

  // Hover stays on the table while the pointer is here, a menu is open, or a drag is under way.
  useEffect(() => {
    tableGeometry.held = hovered.current || Boolean(menu) || Boolean(drag);
    if (!tableGeometry.held) tableGeometry.refresh();
  }, [menu, drag]);
  useEffect(() => () => { tableGeometry.held = false; }, []);

  // A menu over the note ends its auto-scroll as it opens, so it's placed where the note stays (DEF-21).
  const menuOpen = menu !== null;
  useEffect(() => (menuOpen ? anchors.opening() : undefined), [menuOpen]);
  // The table went away (deleted, or the note changed) with a menu open: the menu goes too.
  useEffect(() => {
    if (!g && menu) close();
  }, [g, menu]); // eslint-disable-line react-hooks/exhaustive-deps

  // The context menu, asked for by the editor (right-click, Shift+F10, the Menu key).
  // From 0: the controls mount with the table, and a request made in the same update (the caret
  // arriving with Shift+F10) must open the menu. The count restarts whenever the caret leaves a table.
  const lastRequest = useRef(0);
  useEffect(() => {
    if (menuRequest === lastRequest.current) return;
    lastRequest.current = menuRequest;
    const now = tableGeometry.get();
    if (now) setMenu({ kind: "cell", table: now.table, row: now.row, col: now.col });
  }, [menuRequest]);

  const pressed = useRef(false);
  /**
   * Resizes the column on the border's left by dragging (D-182): it follows the hand in the frame of
   * each move (the widths are drawn before they're saved), never narrower than the minimum. Fit to
   * column: the column on the right gives or takes the difference; Bleed to edge: the table grows.
   * Saved once, on release; Esc puts it back. A press that doesn't move inserts on the line's body
   * (`insertOnClick`), and does nothing on the header row.
   */
  const startResize = (col: number, insertOnClick: boolean) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (!g) return;
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const bleed = isBleed();
    let cols: ReturnType<typeof tableGeometry.columns> = null;
    let widths: number[] | null = null;
    tableGeometry.held = true;
    const finish = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      tableGeometry.held = hovered.current;
    };
    const move = (ev: PointerEvent) => {
      if (!cols) {
        if (Math.abs(ev.clientX - x0) < 4) return;
        cols = tableGeometry.columns();
        if (!cols || col < 0 || col >= cols.widths.length) { cols = null; return; }
      }
      const w0 = cols.widths;
      const dx = ev.clientX - x0;
      const next = [...w0];
      next[col] = Math.max(cols.min, w0[col]! + dx);
      const k = col + 1 < w0.length ? col + 1 : -1;
      if (!bleed && k >= 0) {
        next[k] = w0[k]! - (next[col]! - w0[col]!);
        if (next[k]! < cols.min) { next[k] = cols.min; next[col] = w0[col]! + (w0[k]! - cols.min); }
      }
      widths = next;
      cols.show(next);
    };
    const up = (ev: PointerEvent) => {
      finish();
      if (cols && widths) {
        cols.show(null);
        const k = col + 1 < widths.length ? col + 1 : -1;
        act("table.resizeColumn", { col, width: widths[col]! / cols.ch, ...(!bleed && k >= 0 ? { next: widths[k]! / cols.ch } : {}) } as Partial<TableAction>);
        requestAnimationFrame(() => onClose?.());
      } else if (insertOnClick && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) insertHere();
    };
    const cancel = () => { finish(); cols?.show(null); };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cancel();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
  };
  /** Whether the hovered table is bled to the edge (its layout, from the editor's state). */
  const isBleed = () => layout === "bleed";
  /** Inserts a row or column at the offered border (D-182). */
  const insertHere = () => {
    if (!g?.insert) return;
    act(g.insert.axis === "row" ? "table.insertRowAt" : "table.insertColumnAt", { index: g.insert.index });
    requestAnimationFrame(() => onClose?.());
  };
  const act = (id: string, extra: Partial<TableAction> = {}) => {
    const at = menu ?? (g ? { table: g.table, row: g.row, col: g.col } : null);
    if (!at) return;
    onAction?.({ id, table: at.table, row: at.row, col: at.col, index: 0, from: 0, to: 0, ...extra });
  };
  const close = () => {
    setMenu(null);
    // After the menu has handed focus back to its trigger, the caret goes back to the note.
    requestAnimationFrame(() => onClose?.());
  };
  const openMenu = (kind: Exclude<MenuKind, "cell">) => {
    if (dragged.current) { dragged.current = false; return; }
    if (!g) return;
    // Clicking a handle selects what its menu acts on (DD-TABLE-03).
    const select = kind === "row" ? "table.selectRow" : kind === "column" ? "table.selectColumn" : "table.selectTable";
    onAction?.({ id: select, table: g.table, row: g.row, col: g.col, index: 0, from: 0, to: 0 });
    setMenu({ kind, table: g.table, row: g.row, col: g.col });
  };

  /** Drag a handle to reorder: an accent line follows the nearest boundary; Esc cancels (TBL-08). */
  const startDrag = (axis: "row" | "column") => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !g) return;
    const from = axis === "row" ? g.row : g.col;
    // The header row can't move.
    if (axis === "row" && from === 0) return;
    const el = e.currentTarget;
    const start = { x: e.clientX, y: e.clientY };
    const table = g.table;
    const frame = g.frame;
    let edges: number[] | null = null;
    let current: Drag | null = null;
    dragged.current = false;
    el.setPointerCapture?.(e.pointerId);
    const stop = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      if (!edges) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        const measured = tableGeometry.edges();
        if (!measured) return;
        edges = axis === "row" ? measured.rows : measured.cols;
        dragged.current = true;
      }
      const v = axis === "row" ? ev.clientY : ev.clientX;
      let best = axis === "row" ? 1 : 0;
      for (let i = best; i < edges.length; i++) if (Math.abs(edges[i]! - v) < Math.abs(edges[best]! - v)) best = i;
      const at = edges[best]!;
      current = { axis, from, index: best, at, box: axis === "row" ? { top: at, bottom: at, left: frame.left, right: frame.right } : { top: frame.top, bottom: frame.bottom, left: at, right: at } };
      setDrag(current);
    };
    const up = () => {
      stop();
      if (!current) return;
      const to = current.index > from ? current.index - 1 : current.index;
      if (to !== from) onAction?.({ id: axis === "row" ? "table.moveRow" : "table.moveColumn", table, row: g.row, col: g.col, index: 0, from, to });
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

  const sections = menu?.kind === "column" ? columnMenu : menu?.kind === "row" ? rowMenu : menu?.kind === "table" ? tableMenu : cellMenu;
  const menuLabel = menu?.kind === "column" ? columnLabel : menu?.kind === "row" ? rowLabel : menu?.kind === "table" ? tableLabel : cellMenuLabel;
  const trigger = menu?.kind === "column" ? columnRef : menu?.kind === "row" ? rowRef : menu?.kind === "table" ? tableRef : cellRef;
  const cell = g?.cell ?? g?.rowBox ?? null;
  const show = (geo: TableGeometry | null): geo is TableGeometry => Boolean(geo);

  return (
    <div
      className={s.root}
      {...{ [COMPANION_ATTR]: "" }}
      data-table-controls=""
      onPointerEnter={() => { hovered.current = true; tableGeometry.held = true; }}
      onPointerLeave={() => {
        hovered.current = false;
        tableGeometry.held = Boolean(menu) || Boolean(drag);
        tableGeometry.refresh();
      }}
    >
      {show(g) && g.hovering && !drag ? <Area className={s.tint} box={g.colBox} /> : null}
      {show(g) && g.selection ? <Area className={s.outline} box={g.selection} /> : null}
      {show(g) && drag ? <Area className={s.lift} box={drag.axis === "row" ? g.rowBox : g.colBox} /> : null}
      {drag ? <Area className={`${s.line} ${drag.axis === "row" ? s.lineRow : s.lineColumn}`} box={drag.box} /> : null}
      {show(g) && g.insert && !drag ? (
        <>
          <Strip
            className={g.insert.axis === "row" ? s.stripRow : s.stripColumn}
            box={g.insert.axis === "row" ? { top: g.insert.at, bottom: g.insert.at, left: g.frame.left, right: g.frame.right } : { top: g.frame.top, bottom: g.frame.bottom, left: g.insert.at, right: g.insert.at }}
            onInsert={insertHere}
            {...(g.insert.axis === "column" ? { onResize: startResize(g.insert.index - 1, true) } : {})}
          />
          {g.insert.axis === "column" ? (
            <Strip
              className={s.resizeZone}
              attr="data-table-resize"
              box={{ top: g.frame.top, bottom: headerBottom(g), left: g.insert.at, right: g.insert.at }}
              onResize={startResize(g.insert.index - 1, false)}
              onDoubleClick={() => act("table.resetColumnWidth", { col: g.insert!.index - 1 })}
            />
          ) : null}
          <Control
            className={`${s.insert} ${g.insert.axis === "row" ? s.insertRow : s.insertColumn}`}
            label={insertLabel}
            x={g.insert.axis === "row" ? g.frame.left : g.insert.at}
            y={g.insert.axis === "row" ? g.insert.at : g.frame.top}
            // The press inserts, in the frame it's pressed (PRF-14); Enter and Space too.
            onDragStart={(e) => {
              if (e.button !== 0) return;
              pressed.current = true;
              insertHere();
            }}
            onPress={() => {
              if (pressed.current) { pressed.current = false; return; }
              insertHere();
            }}
          >
            <Icon name="add" size="s" />
          </Control>
        </>
      ) : null}
      {show(g) && (g.handles || menu) ? (
        <>
          {!g.insert || g.insert.axis !== "column" ? (
            <Control
              className={s.columnHandle} label={columnLabel} buttonRef={columnRef} menu expanded={menu?.kind === "column"}
              dragging={drag?.axis === "column"} x={(g.colBox.left + g.colBox.right) / 2} y={g.frame.top}
              onPress={() => openMenu("column")} onDragStart={startDrag("column")}
            >
              <Icon name="more" size="s" />
            </Control>
          ) : null}
          {!g.insert || g.insert.axis !== "row" ? (
            <Control
              className={s.rowHandle} label={rowLabel} buttonRef={rowRef} menu expanded={menu?.kind === "row"}
              dragging={drag?.axis === "row"} x={g.frame.left} y={(g.rowBox.top + g.rowBox.bottom) / 2}
              onPress={() => openMenu("row")} onDragStart={startDrag("row")}
            >
              <Icon name="moreVertical" size="s" />
            </Control>
          ) : null}
          <Control className={s.tableHandle} label={tableLabel} buttonRef={tableRef} menu expanded={menu?.kind === "table"} x={g.frame.left} y={g.frame.top} onPress={() => openMenu("table")}>
            <Icon name="table" size="s" />
          </Control>
        </>
      ) : null}
      {show(g) && g.hovering && !drag ? (
        <>
          <Control className={s.newRow} label={newRowLabel} x={g.frame.left} y={g.frame.bottom} w={g.frame.right - g.frame.left} onPress={() => { act("table.appendRow"); requestAnimationFrame(() => onClose?.()); }}>
            <Icon name="add" size="s" />
            <span aria-hidden="true">{newRowLabel}</span>
          </Control>
          <Control className={s.newColumn} label={newColumnLabel} x={g.frame.right} y={g.frame.top} h={g.frame.bottom - g.frame.top} onPress={() => { act("table.appendColumn"); requestAnimationFrame(() => onClose?.()); }}>
            <Icon name="add" size="s" />
          </Control>
        </>
      ) : null}
      {cell ? <CellAnchor anchorRef={cellRef} box={cell} inset={boundary.containerPadding ?? 0} /> : null}
      {menu ? (
        <Popover
          triggerRef={trigger}
          isOpen
          onOpenChange={(open) => { if (!open) close(); }}
          ref={popoverRef}
          placement={menuEnd ? "bottom end" : "bottom start"}
          offset={8}
          className={menuStyles.popover}
          {...boundary}
          data-surface="popover"
          aria-label={menuLabel}
          data-floating-child=""
        >
          <CommandMenu
            label={menuLabel}
            sections={sections}
            autoFocus
            onAction={({ id }) => {
              act(id);
              close();
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Where the context menu opens: the active cell, kept inside the room menus have in the window (its
 * box less the popovers' padding). A cell scrolled out of view (below a small window) would place the
 * menu against a box off the window, or at its very edge, and the menu past it (D-111).
 */
function CellAnchor({ anchorRef, box, inset }: { anchorRef: RefObject<HTMLDivElement | null>; box: Box; inset: number }) {
  const o = fixedBox(anchorRef.current);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const top = clamp(box.top, o.top + inset, o.top + o.height - inset);
  const bottom = clamp(box.bottom, top, o.top + o.height - inset);
  const left = clamp(box.left, o.left, o.left + o.width);
  const right = clamp(box.right, left, o.left + o.width);
  usePlace(anchorRef, left, top, right - left, bottom - top);
  return <div ref={anchorRef} className={s.anchor} aria-hidden="true" />;
}

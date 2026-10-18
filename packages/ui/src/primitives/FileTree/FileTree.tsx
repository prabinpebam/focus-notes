import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { Popover } from "react-aria-components";
import { CommandMenu } from "../MenuButton/MenuButton.tsx";
import * as menuStyles from "../MenuButton/MenuButton.css.ts";
import { useWindowBoundary } from "../../layouts/AppRoot/in-window.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import type { MenuSection, TreeItem } from "../../data.ts";
import * as s from "./FileTree.css.ts";
import { typeAhead, type TypeAheadState } from "./typeAhead.ts";

export interface FileTreeProps {
  label: string;
  items: TreeItem[];
  /** The focused row: the tree's one tab stop (roving tabindex). */
  focusId?: string;
  /** A new value moves focus into the tree, to the focused row. */
  focusRequest?: number;
  /** The inline name field of the row being named. */
  editValue?: string;
  editLabel?: string;
  editError?: string;
  /** The focused row's menu (D-162): right-click, its ⋯, Shift+F10, or the Menu key. */
  menu?: MenuSection[];
  menuLabel?: string;
  /** Controls at a section row's trailing end, by the row's `accessory` (a section's backup, D-191). */
  sectionEnd?: ReactNode[];
  id: string;
  onSelect?: (p: { id: string; mode: string }) => void;
  onExpand?: (p: { id: string; expanded: boolean }) => void;
  onAction?: (p: { id: string }) => void;
  onDrop?: (p: { source: string; target: string }) => void;
  onEditChange?: (p: { value: string }) => void;
  onEditBlur?: () => void;
  onMenuAction?: (p: { id: string }) => void;
}

/** A registered property's name, from the var() vanilla-extract gives. */
const varName = (v: string) => v.replace(/^var\((.*)\)$/, "$1");
/** A row's DOM ID: one-to-one with its item ID, whatever characters a path has. */
export const treeRowId = (treeId: string, itemId: string) => `${treeId}-r-${itemId.replace(/[^\w-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}`)}`;
/** How long a collapsed folder is hovered while dragging before it opens (Files → Moving). */
const EXPAND_AFTER_MS = 600;

/**
 * The Files tree (IA-VIEW-FILES): the ARIA tree pattern on a flat list of rows with aria-level,
 * multiple selection (Mod+click, Shift+click, Shift+arrows), type-ahead, drag and drop onto folders,
 * and an inline name field. Selection and expansion belong to the view model: this reports intents.
 * Enter, F2, Delete, and Mod+A are commands scoped to `filesTree`, so they're in the keymap.
 */
/** The last focus request each tree met, by id, kept while it's re-created (DEF-20). */
const metRequests = new Map<string, number>();

export function FileTree({ label, items, focusId, focusRequest, editValue = "", editLabel, editError, menu = [], menuLabel = "", sectionEnd = [], id, onSelect, onExpand, onAction, onDrop, onEditChange, onEditBlur, onMenuAction }: FileTreeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [dropId, setDropId] = useState("");
  const drag = useRef<{ source: string; ids: string[] } | null>(null);
  const hover = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const typed = useRef<TypeAheadState>({ text: "", at: -Infinity });
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const focused = byId.has(focusId ?? "") ? focusId! : items[0]?.id ?? "";
  const editing = items.find((i) => i.editing);

  // ---- the row's menu (D-162) ----
  const boundary = useWindowBoundary();
  /** The open menu: its row, and where it opens: the pointer's place in the row, the row's ⋯, or the row itself (keys). */
  const [menuAt, setMenuAt] = useState<{ id: string; at: "point" | "more" | "row"; x: number; y: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  /** Open now, before the render that shows it: a key's echoed context-menu event finds it open. */
  const menuOpen = useRef(false);
  const hasMenu = Boolean(onMenuAction);
  /** Opens the menu on a row: one outside the selection is selected first; on a selected row, the selection stays and focus moves there. */
  const openMenu = (item: TreeItem, at: "point" | "more" | "row", x = 0, y = 0) => {
    if (!hasMenu || item.editing) return;
    select(item.id, item.selected ? "focus" : "replace");
    menuOpen.current = true;
    setMenuAt({ id: item.id, at, x, y });
  };
  /** Focus goes back to the row as the menu closes, unless what it ran took it (a name field, a dialog). */
  const menuClosed = () => {
    menuOpen.current = false;
    setMenuAt(null);
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) focusRow(focusedRef.current);
    });
  };
  const focusedRef = useRef("");
  focusedRef.current = focused;

  const rowEl = (itemId: string) => document.getElementById(treeRowId(id, itemId));
  const focusRow = (itemId: string) => {
    const el = rowEl(itemId);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  };
  // Focus follows the focused row while it's in the tree; a new request brings it in from outside.
  useEffect(() => {
    if (editing) return;
    if (ref.current?.contains(document.activeElement)) focusRow(focused);
  }, [focused, Boolean(editing)]);
  /**
   * A request made while the tree had no rows yet (opened before the workspace was listed): the
   * element focus was on then. The rows take focus once they arrive only if it's still there, never
   * from a control the person moved to meanwhile (DEF-20).
   */
  const waiting = useRef<Element | null | undefined>(undefined);
  useEffect(() => {
    if (!focusRequest || editing) return;
    // A tree re-created by a render (its panel's content rebuilt) mounts with the request it already
    // met: met again, it would pull focus from the control the person is on, and their Enter would
    // open the note (DEF-20). Only a request it hasn't met moves focus.
    const key = id ?? "";
    if (metRequests.get(key) === focusRequest) return;
    metRequests.set(key, focusRequest);
    if (rowEl(focused)) {
      waiting.current = undefined;
      focusRow(focused);
    } else waiting.current = document.activeElement;
  }, [focusRequest]);
  // Closed (not re-created), the next opening's request is met again, whatever its number.
  useEffect(() => () => {
    const key = id ?? "";
    const met = metRequests.get(key);
    setTimeout(() => {
      if (metRequests.get(key) === met && !document.getElementById(id ?? "")) metRequests.delete(key);
    }, 0);
  }, []);
  useEffect(() => {
    if (waiting.current === undefined || editing || !rowEl(focused)) return;
    const was = waiting.current;
    waiting.current = undefined;
    if (document.activeElement === was || document.activeElement === document.body) focusRow(focused);
  }, [items]);
  // The name field takes focus with its text selected (Files → Renaming).
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing?.id]);

  const parentsOf = (itemId: string) => {
    const out: string[] = [];
    for (let p = byId.get(itemId)?.parent; p; p = byId.get(p)?.parent) out.push(p);
    return out;
  };
  const canDrop = (target: TreeItem) => {
    const d = drag.current;
    if (!d || !target.droppable) return false;
    // Never into itself or anything inside it.
    const above = new Set([target.id, ...parentsOf(target.id)]);
    return !d.ids.some((x) => above.has(x));
  };
  const stopHover = () => {
    if (hover.current) clearTimeout(hover.current.timer);
    hover.current = null;
  };

  const select = (itemId: string, mode: string) => onSelect?.({ id: itemId, mode });
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys in the row's menu reach here through React's tree, not the DOM's: they're the menu's.
    if (e.target instanceof HTMLInputElement || e.altKey || !ref.current?.contains(e.target as Node)) return;
    const i = items.findIndex((x) => x.id === focused);
    const item = items[i];
    // Shift+F10 and the Menu key open the focused row's menu, under it (IA-CMP-CONTEXTMENU).
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      if (item && hasMenu) {
        e.preventDefault();
        openMenu(item, "row");
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const moveTo = (j: number) => {
      const next = items[Math.max(0, Math.min(items.length - 1, j))];
      if (!next || next.editing) return;
      select(next.id, e.shiftKey ? "range" : mod ? "focus" : "replace");
    };
    switch (e.key) {
      case "ArrowDown": moveTo(i + 1); break;
      case "ArrowUp": moveTo(i - 1); break;
      case "Home": moveTo(0); break;
      case "End": moveTo(items.length - 1); break;
      case "ArrowRight":
        if (!item || item.kind === "note") return;
        if (!item.expanded) onExpand?.({ id: item.id, expanded: true });
        else if (items[i + 1]?.parent === item.id) select(items[i + 1]!.id, "replace");
        break;
      case "ArrowLeft":
        if (!item) return;
        if (item.kind !== "note" && item.expanded) onExpand?.({ id: item.id, expanded: false });
        else if (item.parent) select(item.parent, "replace");
        break;
      case " ":
        if (!item) return;
        select(item.id, mod ? "toggle" : "replace");
        break;
      default: {
        // Type-ahead: letters jump to the next row whose name starts with them (Files → Accessibility).
        if (mod || e.key.length !== 1 || !/\S/.test(e.key)) return;
        // The key's own time, when it was pressed (DEF-4); a synthetic event without one uses now.
        const hit = typeAhead(typed.current, e.key, e.timeStamp || performance.now(), items, i);
        if (hit) select(hit, "replace");
        break;
      }
    }
    e.preventDefault();
  };
  const contextMenu = (e: MouseEvent, item: TreeItem) => {
    if (!hasMenu) return;
    // Never the browser's own menu over the tree.
    e.preventDefault();
    if (item.editing) return;
    // From the keyboard (not the secondary button): the key's own request, already open from its keydown,
    // or under the row. Never a timer: an occluded window's timers are throttled.
    if (e.button !== 2) {
      if (!menuOpen.current) openMenu(item, "row");
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(item, "point", e.clientX - r.left, e.clientY - r.top);
  };
  /** The ⋯ answers on pointer-down, the way a menu button does (D-151). */
  const morePress = (e: PointerEvent, item: TreeItem) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(item, "more");
  };
  const click = (e: MouseEvent, item: TreeItem) => {
    if (item.editing) return;
    select(item.id, e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "replace");
  };

  const dragStart = (e: DragEvent, item: TreeItem) => {
    const ids = item.selected ? items.filter((x) => x.selected && x.draggable).map((x) => x.id) : [item.id];
    if (!item.selected) select(item.id, "replace");
    drag.current = { source: item.id, ids };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.label);
  };
  const dragOver = (e: DragEvent, item: TreeItem) => {
    if (!canDrop(item)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropId !== item.id) setDropId(item.id);
    if (item.kind !== "note" && !item.expanded && hover.current?.id !== item.id) {
      stopHover();
      hover.current = { id: item.id, timer: setTimeout(() => onExpand?.({ id: item.id, expanded: true }), EXPAND_AFTER_MS) };
    }
  };
  const dragLeave = (e: DragEvent, item: TreeItem) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (dropId === item.id) setDropId("");
    if (hover.current?.id === item.id) stopHover();
  };
  const drop = (e: DragEvent, item: TreeItem) => {
    const d = drag.current;
    e.preventDefault();
    setDropId("");
    stopHover();
    drag.current = null;
    if (d && canDropWith(d, item)) onDrop?.({ source: d.source, target: item.id });
  };
  const canDropWith = (d: { ids: string[] }, item: TreeItem) => {
    const above = new Set([item.id, ...parentsOf(item.id)]);
    return item.droppable && !d.ids.some((x) => above.has(x));
  };
  const dragEnd = () => {
    drag.current = null;
    setDropId("");
    stopHover();
  };

  const errorId = `${id}-edit-error`;
  return (
    <div ref={ref} id={id} role="tree" aria-label={label} aria-multiselectable="true" className={s.tree} data-key-scope="filesTree" onKeyDown={keyDown}>
      {items.map((item) => {
        const folder = item.kind !== "note";
        // A section's own control (its repository's backup, D-191); the row is then named by its label alone.
        const end = item.kind === "section" && item.accessory !== undefined ? sectionEnd[item.accessory] : undefined;
        const labelId = end ? `${treeRowId(id, item.id)}-label` : undefined;
        return (
          <div
            key={item.id}
            id={treeRowId(id, item.id)}
            ref={(el) => {
              el?.style.setProperty(varName(s.depth), String(Math.max(0, item.level - 1)));
              if (el && menuAt?.id === item.id && menuAt.at === "row") anchor.current = el;
            }}
            role="treeitem"
            aria-labelledby={labelId}
            aria-level={item.level}
            aria-selected={item.selected}
            aria-expanded={folder ? item.expanded : undefined}
            aria-busy={item.pending ? true : undefined}
            tabIndex={item.id === focused && !item.editing ? 0 : -1}
            title={item.title || undefined}
            className={`${s.row} ${item.kind === "section" ? s.section : ""}`}
            data-current={item.current ? "" : undefined}
            data-drop-target={dropId === item.id ? "" : undefined}
            data-kind={item.kind}
            data-menu-open={menuAt?.id === item.id ? "" : undefined}
            onContextMenu={(e) => contextMenu(e, item)}
            draggable={item.draggable && !item.editing}
            onClick={(e) => click(e, item)}
            onDoubleClick={() => !item.editing && onAction?.({ id: item.id })}
            onDragStart={(e) => dragStart(e, item)}
            onDragOver={(e) => dragOver(e, item)}
            onDragLeave={(e) => dragLeave(e, item)}
            onDrop={(e) => drop(e, item)}
            onDragEnd={dragEnd}
          >
            {folder ? (
              <span
                className={s.chevron}
                aria-hidden="true"
                onClick={(e) => { e.stopPropagation(); onExpand?.({ id: item.id, expanded: !item.expanded }); }}
              >
                <Icon name={item.expanded ? "chevronDown" : "chevronRight"} size="s" />
              </span>
            ) : <span className={s.chevron} aria-hidden="true" />}
            {item.kind !== "section" ? <span className={s.icon} aria-hidden="true"><Icon name={folder ? "folder" : "document"} size="s" /></span> : null}
            {item.editing ? (
              <span className={s.edit}>
                <input
                  ref={input}
                  className={s.input}
                  aria-label={editLabel}
                  aria-invalid={editError ? true : undefined}
                  aria-describedby={editError ? errorId : undefined}
                  value={editValue}
                  spellCheck={false}
                  // Enter and Esc are commands of this scope; the tree's own keys stop here.
                  data-key-scope="filesEdit"
                  data-key-scope-stop=""
                  onChange={(e) => onEditChange?.({ value: e.target.value })}
                  onBlur={() => onEditBlur?.()}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
                {editError ? <span id={errorId} className={s.error}>{editError}</span> : null}
              </span>
            ) : (
              <span className={s.label} id={labelId} dir="auto">{item.label}{item.description ? <span className={s.srOnly}>,</span> : null}</span>
            )}
            {/* The name is the row's text: "About, public" (Files → Accessibility). */}
            {item.description && !item.editing ? <span className={s.description}>{item.description}</span> : null}
            {item.pending ? <span className={s.pending}><Spinner size="s" /></span> : null}
            {end ? (
              // Its own control, not the row's: its keys, clicks and presses stay with it (D-191).
              <span
                className={s.accessory}
                data-key-scope="filesSection"
                data-key-scope-stop=""
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.stopPropagation()}
              >{end}</span>
            ) : null}
            {hasMenu && !item.editing && (!item.readOnly || item.kind === "note") ? (
              <span
                className={s.more}
                aria-hidden="true"
                data-row-more=""
                ref={(el) => { if (el && menuAt?.id === item.id && menuAt.at === "more") anchor.current = el; }}
                onPointerDown={(e) => morePress(e, item)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <Icon name="more" size="s" />
              </span>
            ) : null}
            {menuAt?.id === item.id && menuAt.at === "point" ? (
              <span
                className={s.anchor}
                aria-hidden="true"
                ref={(el) => {
                  if (!el) return;
                  el.style.setProperty(varName(s.anchorX), `${menuAt.x}px`);
                  el.style.setProperty(varName(s.anchorY), `${menuAt.y}px`);
                  anchor.current = el;
                }}
              />
            ) : null}
          </div>
        );
      })}
      {menuAt && menu.length ? (
        <Popover
          triggerRef={anchor}
          isOpen
          onOpenChange={(open) => { if (!open) menuClosed(); }}
          placement="bottom start"
          offset={4}
          className={menuStyles.popover}
          {...boundary}
          data-surface="popover"
          aria-label={menuLabel}
          data-floating-child=""
        >
          <CommandMenu
            label={menuLabel}
            sections={menu}
            autoFocus
            onAction={({ id: command }) => {
              onMenuAction?.({ id: command });
              menuClosed();
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

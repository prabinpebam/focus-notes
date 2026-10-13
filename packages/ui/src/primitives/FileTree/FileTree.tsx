import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { Spinner } from "../Spinner/Spinner.tsx";
import type { TreeItem } from "../../data.ts";
import * as s from "./FileTree.css.ts";

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
  id: string;
  onSelect?: (p: { id: string; mode: string }) => void;
  onExpand?: (p: { id: string; expanded: boolean }) => void;
  onAction?: (p: { id: string }) => void;
  onDrop?: (p: { source: string; target: string }) => void;
  onEditChange?: (p: { value: string }) => void;
  onEditBlur?: () => void;
}

/** A row's DOM ID: one-to-one with its item ID, whatever characters a path has. */
export const treeRowId = (treeId: string, itemId: string) => `${treeId}-r-${itemId.replace(/[^\w-]/g, (c) => `_${c.codePointAt(0)!.toString(16)}`)}`;
/** How long a collapsed folder is hovered while dragging before it opens (Files → Moving). */
const EXPAND_AFTER_MS = 600;
const TYPE_AHEAD_MS = 700;

/**
 * The Files tree (IA-VIEW-FILES): the ARIA tree pattern on a flat list of rows with aria-level,
 * multiple selection (Mod+click, Shift+click, Shift+arrows), type-ahead, drag and drop onto folders,
 * and an inline name field. Selection and expansion belong to the view model: this reports intents.
 * Enter, F2, Delete, and Mod+A are commands scoped to `filesTree`, so they're in the keymap.
 */
export function FileTree({ label, items, focusId, focusRequest, editValue = "", editLabel, editError, id, onSelect, onExpand, onAction, onDrop, onEditChange, onEditBlur }: FileTreeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [dropId, setDropId] = useState("");
  const drag = useRef<{ source: string; ids: string[] } | null>(null);
  const hover = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const focused = byId.has(focusId ?? "") ? focusId! : items[0]?.id ?? "";
  const editing = items.find((i) => i.editing);

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
  useEffect(() => {
    if (focusRequest && !editing) focusRow(focused);
  }, [focusRequest]);
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
    if (e.target instanceof HTMLInputElement || e.altKey) return;
    const i = items.findIndex((x) => x.id === focused);
    const item = items[i];
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
        const now = Date.now();
        const t = typed.current;
        t.text = now - t.at > TYPE_AHEAD_MS ? e.key : t.text + e.key;
        t.at = now;
        const q = t.text.toLocaleLowerCase();
        const start = t.text.length === 1 ? i + 1 : i;
        const order = [...items.slice(start), ...items.slice(0, start)];
        const hit = order.find((x) => !x.editing && x.label.toLocaleLowerCase().startsWith(q));
        if (hit) select(hit.id, "replace");
        break;
      }
    }
    e.preventDefault();
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
        const name = item.description ? `${item.label}, ${item.description}` : undefined;
        return (
          <div
            key={item.id}
            id={treeRowId(id, item.id)}
            ref={(el) => el?.style.setProperty(s.depth.replace(/^var\((.*)\)$/, "$1"), String(Math.max(0, item.level - 1)))}
            role="treeitem"
            aria-level={item.level}
            aria-selected={item.selected}
            aria-expanded={folder ? item.expanded : undefined}
            aria-label={item.editing ? undefined : name}
            aria-busy={item.pending ? true : undefined}
            tabIndex={item.id === focused && !item.editing ? 0 : -1}
            title={item.title || undefined}
            className={`${s.row} ${item.kind === "section" ? s.section : ""}`}
            data-current={item.current ? "" : undefined}
            data-drop-target={dropId === item.id ? "" : undefined}
            data-kind={item.kind}
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
              <span className={s.label} dir="auto">{item.label}</span>
            )}
            {item.description && !item.editing ? <span className={s.description} aria-hidden="true">{item.description}</span> : null}
            {item.pending ? <span className={s.pending}><Spinner size="s" /></span> : null}
          </div>
        );
      })}
    </div>
  );
}

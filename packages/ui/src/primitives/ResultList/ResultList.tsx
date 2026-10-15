import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useAutoHideScrollbar } from "../../behaviors/auto-hide-scrollbar.ts";
import { Icon } from "../Icon/Icon.tsx";
import type { ResultItem } from "../../data.ts";
import type { IconName } from "../../icon-names.ts";
import * as s from "./ResultList.css.ts";

export interface ResultListProps {
  label: string;
  items: ResultItem[];
  /** The highlighted item. Focus stays in the field or editor that owns the list (aria-activedescendant). */
  activeId?: string;
  /** Fills its container, or the slash menu's fixed width. */
  width?: "fill" | "menu";
  /** As tall as its items up to a popover's height, or the height its container gives it. */
  height?: "content" | "fill";
  id: string;
  onAction?: (payload: { id: string }) => void;
  onActiveChange?: (payload: { id: string }) => void;
}

/** The rows a long list shows in its first frame, about what Spotlight shows on a 1080p screen; the rest follow a frame later. */
const FIRST_ROWS = 24;

/** The DOM ID of an item, for aria-activedescendant on the element that keeps focus. Distinct IDs stay distinct. */
export const resultItemId = (listId: string, itemId: string) => `${listId}-opt-${itemId.replace(/[^\w-]|_/g, (c) => `_${c.charCodeAt(0).toString(16)}_`)}`;

/** Text with where the query matched marked: [start, end) ranges, in any order; overlapping or out-of-range ones are skipped. */
function marked(text: string, ranges: ResultItem["highlights"]): ReactNode {
  if (!ranges?.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  for (const [from = 0, to = 0] of [...ranges].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
    if (from < at || to <= from || to > text.length) continue;
    if (from > at) out.push(text.slice(at, from));
    out.push(<mark key={from} className={s.match}>{text.slice(from, to)}</mark>);
    at = to;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

/**
 * A list box of results (Spotlight, the slash menu, Move to, Find in all notes). The owner keeps
 * focus and moves the active item with the arrow keys; the list follows it and runs an item on
 * click. The list is a tab stop too, so a scrolling list can be reached and used from the keyboard
 * on its own.
 *
 * One notion of groups: a header item starts a group of the items after it, up to the next header
 * (the listbox pattern's groups, named by the header's label and description); items before the
 * first header stand alone, and the arrow keys pass over headers. One notion of matches: `highlights`
 * and `descriptionHighlights` mark where the query matched. A row's `state` (a toggle's value, a
 * match's place) sits at its end, read with it.
 */
export function ResultList({ label, items, activeId, width = "fill", height = "content", id, onAction, onActiveChange }: ResultListProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useAutoHideScrollbar(ref);
  // A long list appears in two frames (PRF-14, D-151 (12)): the rows the first frame can show, then
  // the rest once that frame is drawn. Spotlight opens on every action the app has (about 180 rows,
  // over 1,200 elements), and making, styling and laying them all out before its first frame put
  // its opening over 50 ms on a slower computer; the rows past the first screen can't be seen yet.
  const [whole, setWhole] = useState(() => items.length <= FIRST_ROWS);
  useEffect(() => {
    if (whole) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // After the next frame is drawn: a frame callback runs before it, a task after it.
    const frame = requestAnimationFrame(() => (timer = setTimeout(() => setWhole(true))));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [whole]);
  // Never short of the active row (End, or a row chosen before the rest came).
  const activeAt = whole ? -1 : items.findIndex((i) => i.id === activeId);
  const shown = whole ? items : items.slice(0, Math.max(FIRST_ROWS, activeAt + 1));
  useEffect(() => {
    if (!activeId) return;
    ref.current?.querySelector(`#${CSS.escape(resultItemId(id, activeId))}`)?.scrollIntoView({ block: "nearest" });
    // The field driving the list keeps its place in view: in a short sheet that scrolls header and
    // all, showing the active item never scrolls the focused field away (D-111).
    const focus = document.activeElement;
    if (!focus || focus === document.body || ref.current?.contains(focus)) return;
    for (let sc = ref.current?.parentElement; sc; sc = sc.parentElement) {
      if (!sc.contains(focus) || sc.scrollHeight <= sc.clientHeight) continue;
      const o = getComputedStyle(sc).overflowY;
      if (o !== "auto" && o !== "scroll") continue;
      const over = sc.getBoundingClientRect().top + sc.clientTop - focus.getBoundingClientRect().top;
      if (over > 0) sc.scrollTop -= over;
      break;
    }
  }, [activeId, id]);
  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled && !i.header);
    if (!enabled.length) return;
    const at = enabled.findIndex((i) => i.id === activeId);
    const go = (i: number) => onActiveChange?.({ id: enabled[Math.max(0, Math.min(enabled.length - 1, i))]!.id });
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at < 0 ? 0 : at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(enabled.length - 1);
    else if ((e.key === "Enter" || e.key === " ") && at >= 0) onAction?.({ id: enabled[at]!.id });
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  // Items before the first header stand alone; each header heads the group of items after it.
  const groups: { header?: ResultItem; items: ResultItem[] }[] = [{ items: [] }];
  for (const item of shown) {
    if (item.header) groups.push({ header: item, items: [] });
    else groups.at(-1)!.items.push(item);
  }
  return (
    <div
      ref={ref} id={id} role="listbox" aria-label={label} className={`${s.list} ${s.width[width]} ${s.height[height]}`}
      tabIndex={0}
      aria-activedescendant={activeId ? resultItemId(id, activeId) : undefined}
      onKeyDown={onKeyDown}
    >
      {groups.map((group) => {
        if (!group.header) return group.items.map(option);
        const headerId = resultItemId(id, group.header.id);
        return (
          <div key={group.header.id} role="group" aria-labelledby={headerId} className={s.group}>
            <div id={headerId} role="presentation" className={s.header}>
              <span className={s.headerLabel} dir="auto">{group.header.label}</span>
              {group.header.description ? <span className={s.description} dir="auto">{group.header.description}</span> : null}
            </div>
            {group.items.map(option)}
          </div>
        );
      })}
    </div>
  );

  function option(item: ResultItem) {
    return (
      <div
        key={item.id}
        id={resultItemId(id, item.id)}
        role="option"
        aria-selected={item.id === activeId}
        aria-disabled={item.disabled ? "true" : undefined}
        className={s.item}
        // The owner keeps focus, so pressing an item never moves it.
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => item.id !== activeId && onActiveChange?.({ id: item.id })}
        onClick={() => !item.disabled && onAction?.({ id: item.id })}
      >
        {item.icon ? <span className={s.icon} aria-hidden="true"><Icon name={item.icon as IconName} /></span> : null}
        <span className={s.text}>
          <span className={s.label} dir="auto">{marked(item.label, item.highlights)}</span>
          {item.description ? <span className={s.description} dir="auto">{marked(item.description, item.descriptionHighlights)}</span> : null}
        </span>
        {item.state ? <span className={s.state} dir="auto">{item.state}</span> : null}
        {item.shortcut ? <span className={s.shortcut} aria-hidden="true">{item.shortcut}</span> : null}
      </div>
    );
  }
}

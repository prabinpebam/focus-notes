import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
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

/** The DOM ID of an item, for aria-activedescendant on the element that keeps focus. */
export const resultItemId = (listId: string, itemId: string) => `${listId}-opt-${itemId.replace(/[^\w-]/g, "_")}`;

/** A label with its matches marked, as the find bar marks matches in a note. */
function marked(label: string, highlights: ResultItem["highlights"]): ReactNode {
  if (!highlights?.length) return label;
  const out: ReactNode[] = [];
  let at = 0;
  for (const [from, to] of [...highlights].sort((a, b) => a[0] - b[0])) {
    if (from < at || to <= from) continue;
    if (from > at) out.push(label.slice(at, from));
    out.push(<mark key={from} className={s.match}>{label.slice(from, to)}</mark>);
    at = to;
  }
  if (at < label.length) out.push(label.slice(at));
  return out;
}

/**
 * A list box of results (Spotlight, the slash menu, Move to, Find in all notes). The owner keeps
 * focus and moves the active item with the arrow keys; the list follows it and runs an item on
 * click. The list is a tab stop too, so a scrolling list can be reached and used from the keyboard
 * on its own. A header item starts a labeled section of the items after it (the listbox pattern's
 * groups); the arrow keys pass over headers.
 */
export function ResultList({ label, items, activeId, width = "fill", height = "content", id, onAction, onActiveChange }: ResultListProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeId) return;
    ref.current?.querySelector(`#${CSS.escape(resultItemId(id, activeId))}`)?.scrollIntoView({ block: "nearest" });
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
  const option = (item: ResultItem) => (
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
        <span dir="auto">{marked(item.label, item.highlights)}</span>
        {item.description ? <span className={s.description} dir="auto">{item.description}</span> : null}
      </span>
      {item.shortcut ? <span className={s.shortcut} aria-hidden="true">{item.shortcut}</span> : null}
    </div>
  );
  // Items before the first header stand alone; each header labels the group of items after it.
  const sections: { header?: ResultItem; items: ResultItem[] }[] = [{ items: [] }];
  for (const item of items) {
    if (item.header) sections.push({ header: item, items: [] });
    else sections.at(-1)!.items.push(item);
  }
  return (
    <div
      ref={ref} id={id} role="listbox" aria-label={label} className={`${s.list} ${s.width[width]} ${s.height[height]}`}
      tabIndex={0}
      aria-activedescendant={activeId ? resultItemId(id, activeId) : undefined}
      onKeyDown={onKeyDown}
    >
      {sections.map((section) => {
        if (!section.header) return section.items.map(option);
        const headerId = resultItemId(id, section.header.id);
        return (
          <div key={section.header.id} role="presentation" className={s.section}>
            <div id={headerId} role="presentation" className={s.header}>
              <span className={s.headerLabel} dir="auto">{section.header.label}</span>
              {section.header.description ? <span className={s.description} dir="auto">{section.header.description}</span> : null}
            </div>
            <div role="group" aria-labelledby={headerId} className={s.group}>{section.items.map(option)}</div>
          </div>
        );
      })}
    </div>
  );
}

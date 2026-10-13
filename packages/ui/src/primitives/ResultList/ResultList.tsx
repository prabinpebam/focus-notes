import { useEffect, useRef, type KeyboardEvent } from "react";
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
  id: string;
  onAction?: (payload: { id: string }) => void;
  onActiveChange?: (payload: { id: string }) => void;
}

/** The DOM ID of an item, for aria-activedescendant on the element that keeps focus. */
export const resultItemId = (listId: string, itemId: string) => `${listId}-opt-${itemId.replace(/[^\w-]/g, "_")}`;

/**
 * A list box of results (Spotlight, the slash menu, Move to). The owner keeps focus and moves the
 * active item with the arrow keys; the list follows it and runs an item on click. The list is a tab
 * stop too, so a scrolling list can be reached and used from the keyboard on its own.
 */
export function ResultList({ label, items, activeId, width = "fill", id, onAction, onActiveChange }: ResultListProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeId) return;
    ref.current?.querySelector(`#${CSS.escape(resultItemId(id, activeId))}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId, id]);
  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled);
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
  return (
    <div
      ref={ref} id={id} role="listbox" aria-label={label} className={`${s.list} ${s.width[width]}`}
      tabIndex={0}
      aria-activedescendant={activeId ? resultItemId(id, activeId) : undefined}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
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
            <span dir="auto">{item.label}</span>
            {item.description ? <span className={s.description} dir="auto">{item.description}</span> : null}
          </span>
          {item.shortcut ? <span className={s.shortcut} aria-hidden="true">{item.shortcut}</span> : null}
        </div>
      ))}
    </div>
  );
}

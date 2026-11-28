import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Icon } from "../Icon/Icon.tsx";
import { FileGlyph, SiteMarksName } from "../FileTree/SiteMarks.tsx";
import type { TreeItem } from "../../data.ts";
import * as row from "../OpenedFiles/OpenedFiles.css.ts";
import * as s from "./TabSwitcher.css.ts";

export interface TabSwitcherProps {
  /** The list's name: "Opened tabs". */
  label: string;
  /** The opened tabs in switch order: `label` is the name, `title` the path, `current` the highlighted one. */
  items: TreeItem[];
  activeId?: string;
  id: string;
  onChoose?: (p: { id: string }) => void;
  onActiveChange?: (p: { id: string }) => void;
}

/**
 * Ctrl+Tab's switcher (owner, 29 November): the opened tabs as the same rows Opened files draws, the
 * highlighted one in the active tab's look. The app moves the highlight on each Tab while Ctrl is held
 * and opens it as Ctrl is released; here the arrows, Home and End move it, Enter or a click opens a row.
 * @tier primitive
 * @a11y A listbox that keeps focus, its highlighted option named by aria-activedescendant.
 */
export function TabSwitcher({ label, items, activeId = "", id, onChoose, onActiveChange }: TabSwitcherProps) {
  const base = useId();
  const list = useRef<HTMLUListElement | null>(null);
  const optionId = (i: number) => `${base}-o${i}`;
  const active = items.findIndex((i) => i.id === activeId);
  useEffect(() => { list.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (active >= 0) list.current?.querySelector(`[id="${CSS.escape(optionId(active))}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const keyDown = (e: KeyboardEvent) => {
    const n = items.length;
    if (!n) return;
    const to = e.key === "ArrowDown" ? (active + 1) % n : e.key === "ArrowUp" ? (active - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to >= 0) {
      e.preventDefault();
      onActiveChange?.({ id: items[to]!.id });
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      onChoose?.({ id: items[active]!.id });
    }
  };
  return (
    <ul ref={list} id={id} className={`${row.list} ${s.list}`} role="listbox" aria-label={label} tabIndex={0}
      aria-activedescendant={active >= 0 ? optionId(active) : undefined} onKeyDown={keyDown}>
      {items.map((item, i) => {
        const nameId = `${base}-n${i}`;
        const marksId = `${base}-m${i}`;
        const marked = Boolean(item.siteLabel && (item.shared || item.published));
        return (
          <li key={item.id} id={optionId(i)} role="option" aria-selected={i === active} className={row.tab}
            data-current={i === active ? "" : undefined} aria-labelledby={marked ? `${nameId} ${marksId}` : nameId}
            onClick={() => onChoose?.({ id: item.id })}>
            <span className={row.activate}>
              <FileGlyph item={item} className={row.icon}><Icon name="document" size="s" /></FileGlyph>
              <span className={row.name} id={nameId} dir="auto" title={item.title || item.label}>{item.label}</span>
              {marked ? <SiteMarksName item={item} nameId={marksId} /> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from "react-aria-components";
import type { Option } from "../../data.ts";
import * as s from "./Tabs.css.ts";

export interface TabsProps {
  label: string;
  items: Option[];
  value?: string;
  /** Vertical: the tab list on the inline start, as Settings' categories (IA-VIEW-SETTINGS); arrow keys go up and down. */
  orientation?: "horizontal" | "vertical";
  /** The selected tab takes focus when the tabs appear (Settings opens on its categories, D-103). */
  autoFocus?: boolean;
  id?: string;
  /** The selected tab's panel content; the view switches it on `value`. */
  children?: ReactNode;
  onChange?: (payload: { value: string }) => void;
}

/**
 * A panel with nothing to focus is a tab stop itself, and stops being one once a control appears in
 * it (Settings' Account panel while it checks the account, then its buttons). Focus resting on the
 * panel then moves to that control instead of being lost (WCAG 2.4.3).
 */
const TABBABLE = "a[href], button, input, select, textarea, [tabindex], [contenteditable='true']";
const keepFocus = (panel: HTMLDivElement | null) => {
  if (!panel) return;
  const observer = new MutationObserver(() => {
    if (panel.ownerDocument.activeElement !== panel) return;
    const first = [...panel.querySelectorAll<HTMLElement>(TABBABLE)].find((el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0);
    first?.focus();
  });
  observer.observe(panel, { childList: true, subtree: true, attributes: true });
  return () => observer.disconnect();
};

/** Tabs (ARIA tabs pattern): arrow keys move between tabs, and the panel follows the selection. */
export function Tabs({ label, items, value, orientation = "horizontal", autoFocus, id, children, onChange }: TabsProps) {
  const selected = value ?? items[0]?.id ?? "";
  // Vertical tabs need room for the list and the panel side by side; without it (a narrow window,
  // 320 px reflow) they lay out across, over the panel, and the arrow keys go left and right.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (orientation !== "vertical" || !el) return;
    const check = () => setNarrow(el.getBoundingClientRect().width < (parseFloat(getComputedStyle(el).getPropertyValue(s.besideVar.replace(/^var\(|\)$/g, ""))) || 0));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [orientation]);
  const laid = orientation === "vertical" && !narrow ? "vertical" : "horizontal";
  // Once, as the selected tab is first drawn (the collection draws its tabs after the list).
  const focused = useRef(!autoFocus);
  const focusFirst = (el: HTMLDivElement | null) => {
    if (!el || focused.current) return;
    focused.current = true;
    el.focus();
  };
  return (
    <AriaTabs ref={rootRef} className={s.root[laid]} orientation={laid} selectedKey={selected} onSelectionChange={(k) => onChange?.({ value: String(k) })} {...(id ? { id } : {})}>
      <TabList className={s.list[laid]} aria-label={label}>
        {items.map((o) => <Tab key={o.id} id={o.id} className={s.tab[laid]} {...(o.id === selected ? { ref: focusFirst } : {})}>{o.label}</Tab>)}
      </TabList>
      {/* Keyed by the selection, so the panel and its id change together with the selected tab's aria-controls. */}
      <TabPanel key={selected} id={selected} ref={keepFocus} className={s.panel[laid]}>{children}</TabPanel>
    </AriaTabs>
  );
}

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
  /** Under the list, on every tab: an action for the whole set (Settings' Send feedback, D-203). */
  footer?: ReactNode;
  /** The selected tab's panel content; the view switches it on `value`. */
  children?: ReactNode;
  onChange?: (payload: { value: string }) => void;
}

/**
 * Tabs (ARIA tabs pattern): arrow keys move between tabs, and the panel follows the selection.
 * A panel with nothing to focus is a tab stop itself, and stops being one once a control appears in
 * it (Settings' Account panel while it checks the account, then its buttons). Chromium drops focus
 * resting on the panel then, within React's commit; the dialog around it moves focus on to that
 * control (DialogPanel, DEF-12).
 */
export function Tabs({ label, items, value, orientation = "horizontal", autoFocus, id, footer, children, onChange }: TabsProps) {
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
  const tabList = (className: string) => (
    <TabList className={className} aria-label={label}>
      {items.map((o) => <Tab key={o.id} id={o.id} className={s.tab[laid]} {...(o.id === selected ? { ref: focusFirst } : {})}>{o.label}</Tab>)}
    </TabList>
  );
  return (
    <AriaTabs ref={rootRef} className={s.root[laid]} orientation={laid} selectedKey={selected} onSelectionChange={(k) => onChange?.({ value: String(k) })} {...(id ? { id } : {})}>
      {footer ? (
        // The list and its footer share the column and its divider; the footer sits right under the tabs.
        // `data-side-nav`: the column is the side navigation that runs the body's full height (D-123).
        <div className={s.side[laid]} data-side-nav="">
          {tabList(s.sideList[laid])}
          <div className={s.footer[laid]}>{footer}</div>
        </div>
      ) : tabList(s.list[laid])}
      {/* Keyed by the selection, so the panel and its id change together with the selected tab's aria-controls. */}
      <TabPanel key={selected} id={selected} className={s.panel[laid]}>{children}</TabPanel>
    </AriaTabs>
  );
}

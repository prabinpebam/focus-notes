import { useRef, type ReactNode } from "react";
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

/** Tabs (ARIA tabs pattern): arrow keys move between tabs, and the panel follows the selection. */
export function Tabs({ label, items, value, orientation = "horizontal", autoFocus, id, children, onChange }: TabsProps) {
  const selected = value ?? items[0]?.id ?? "";
  // Once, as the selected tab is first drawn (the collection draws its tabs after the list).
  const focused = useRef(!autoFocus);
  const focusFirst = (el: HTMLDivElement | null) => {
    if (!el || focused.current) return;
    focused.current = true;
    el.focus();
  };
  return (
    <AriaTabs className={s.root[orientation]} orientation={orientation} selectedKey={selected} onSelectionChange={(k) => onChange?.({ value: String(k) })} {...(id ? { id } : {})}>
      <TabList className={s.list[orientation]} aria-label={label}>
        {items.map((o) => <Tab key={o.id} id={o.id} className={s.tab[orientation]} {...(o.id === selected ? { ref: focusFirst } : {})}>{o.label}</Tab>)}
      </TabList>
      {/* Keyed by the selection, so the panel and its id change together with the selected tab's aria-controls. */}
      <TabPanel key={selected} id={selected} className={s.panel[orientation]}>{children}</TabPanel>
    </AriaTabs>
  );
}

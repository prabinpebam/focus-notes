import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from "react-aria-components";
import type { Option } from "../../data.ts";
import * as s from "./Tabs.css.ts";

export interface TabsProps {
  label: string;
  items: Option[];
  value?: string;
  id?: string;
  /** The selected tab's panel content; the view switches it on `value`. */
  children?: ReactNode;
  onChange?: (payload: { value: string }) => void;
}

/** Tabs (ARIA tabs pattern): arrow keys move between tabs, and the panel follows the selection. */
export function Tabs({ label, items, value, id, children, onChange }: TabsProps) {
  const selected = value ?? items[0]?.id ?? "";
  return (
    <AriaTabs className={s.root} selectedKey={selected} onSelectionChange={(k) => onChange?.({ value: String(k) })} {...(id ? { id } : {})}>
      <TabList className={s.list} aria-label={label}>
        {items.map((o) => <Tab key={o.id} id={o.id} className={s.tab}>{o.label}</Tab>)}
      </TabList>
      <TabPanel id={selected} className={s.panel}>{children}</TabPanel>
    </AriaTabs>
  );
}

import { Children, type ReactNode } from "react";
import * as s from "./SiteGrid.css.ts";

export interface SiteGridProps { children?: ReactNode }

/** Tiles in as many columns as fit, as a list (D-174). */
export function SiteGrid({ children }: SiteGridProps) {
  return <ul className={s.root}>{Children.map(children, (c) => <li className={s.item}>{c}</li>)}</ul>;
}
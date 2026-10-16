import { createElement } from "react";
import * as s from "./SiteText.css.ts";

export interface SiteTextProps {
  value: string;
  as?: "h1" | "h2" | "h3" | "p";
  look?: keyof typeof s.look;
  id?: string;
}

/** A few words of the product site in its display type (D-174). */
export function SiteText({ value, as = "p", look = "lead", id }: SiteTextProps) {
  return createElement(as, { id, className: [s.base, s.look[look]].join(" ") }, value);
}
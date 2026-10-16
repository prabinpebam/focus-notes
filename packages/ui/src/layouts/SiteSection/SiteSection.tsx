import type { ReactNode } from "react";
import * as s from "./SiteSection.css.ts";

export interface SiteSectionProps {
  anchor: string;
  tone?: "plain" | "band";
  children?: ReactNode;
}

/** A section of a site page with a stable anchor (WP-10.1). */
export function SiteSection({ anchor, tone = "plain", children }: SiteSectionProps) {
  return <section id={anchor} className={[s.base, s.tone[tone]].join(" ")}>{children}</section>;
}

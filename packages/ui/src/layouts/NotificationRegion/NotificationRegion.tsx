import type { ReactNode } from "react";
import * as s from "./NotificationRegion.css.ts";

export interface NotificationRegionProps {
  label: string;
  /** The host's count of queued outcomes, for example “2 more waiting”. */
  overflowLabel?: string;
  children?: ReactNode;
}

/** The bottom notification stack's named home. Its host supplies at most 3 visible pills, errors first. @tier layout */
export function NotificationRegion({ label, overflowLabel, children }: NotificationRegionProps) {
  return <section className={s.root} aria-label={label}>{overflowLabel ? <span className={s.more}>{overflowLabel}</span> : null}{children}</section>;
}

import { Children, type ReactNode } from "react";
import * as s from "./Section.css.ts";

export interface SectionProps {
  heading?: ReactNode;
  id?: string;
  children?: ReactNode;
}

/** One section of a view, grouped by space alone (spacing SP-12): pair < heading < item < section. */
export function Section({ heading, id, children }: SectionProps) {
  const head = Children.toArray(heading);
  return (
    <section id={id} className={s.base} data-section="">
      {head.length ? <div className={s.header} data-section-header="">{head}</div> : null}
      <div className={s.body} data-section-body="">{children}</div>
    </section>
  );
}

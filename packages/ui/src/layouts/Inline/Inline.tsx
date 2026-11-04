import type { ReactNode } from "react";
import * as s from "./Inline.css.ts";
import type { Space } from "../Stack/Stack.tsx";

export interface InlineProps {
  gap?: Space;
  /** One named semantic group; uses the inline item role and wraps together by default. */
  related?: boolean;
  label?: string;
  padding?: Space;
  align?: keyof typeof s.align;
  justify?: keyof typeof s.justify;
  wrap?: boolean;
  grow?: boolean;
  id?: string;
  children?: ReactNode;
}

export function Inline({ gap = "none", related, label, padding = "none", align = "center", justify = "start", wrap, grow, id, children }: InlineProps) {
  return (
    <div id={id} role={related ? "group" : undefined} aria-label={related ? label : undefined} data-related={related ? "" : undefined} className={[s.base, s.gap[related ? "inlineItem" : gap], s.padding[padding], s.align[align], s.justify[justify], (wrap ?? related) ? s.wrap : "", grow ? s.grow : ""].join(" ")}>
      {children}
    </div>
  );
}

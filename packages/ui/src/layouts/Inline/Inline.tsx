import type { ReactNode } from "react";
import * as s from "./Inline.css.ts";
import type { Space } from "../Stack/Stack.tsx";

export interface InlineProps {
  gap?: Space;
  padding?: Space;
  align?: keyof typeof s.align;
  justify?: keyof typeof s.justify;
  wrap?: boolean;
  grow?: boolean;
  id?: string;
  children?: ReactNode;
}

export function Inline({ gap = "none", padding = "none", align = "center", justify = "start", wrap, grow, id, children }: InlineProps) {
  return (
    <div id={id} className={[s.base, s.gap[gap], s.padding[padding], s.align[align], s.justify[justify], wrap ? s.wrap : "", grow ? s.grow : ""].join(" ")}>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import * as s from "./Stack.css.ts";

export type Space = keyof typeof s.gap;

export interface StackProps {
  gap?: Space;
  padding?: Space;
  align?: keyof typeof s.align;
  justify?: keyof typeof s.justify;
  grow?: boolean;
  id?: string;
  children?: ReactNode;
}

export function Stack({ gap = "none", padding = "none", align = "stretch", justify = "start", grow, id, children }: StackProps) {
  return (
    <div id={id} className={[s.base, s.gap[gap], s.padding[padding], s.align[align], s.justify[justify], grow ? s.grow : ""].join(" ")}>
      {children}
    </div>
  );
}

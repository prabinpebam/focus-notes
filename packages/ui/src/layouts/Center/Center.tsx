import type { ReactNode } from "react";
import * as s from "./Center.css.ts";

export interface CenterProps {
  maxWidth?: keyof typeof s.maxWidth;
  block?: keyof typeof s.block;
  gutter?: keyof typeof s.gutter;
  id?: string;
  children?: ReactNode;
}

export function Center({ maxWidth = "measure", block = "start", gutter = "regular", id, children }: CenterProps) {
  return <div id={id} className={`${s.base} ${s.maxWidth[maxWidth]} ${s.block[block]} ${s.gutter[gutter]}`}>{children}</div>;
}

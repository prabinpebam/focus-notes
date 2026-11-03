import type { ReactNode } from "react";
import * as s from "./Columns.css.ts";
import type { Space } from "../Stack/Stack.tsx";

export interface ColumnsProps {
  gap?: Space;
  /** sheet: columns at least a narrow sheet wide; choice: a uniform grid of small equal cells. */
  cell?: keyof typeof s.cell;
  id?: string;
  children?: ReactNode;
}

/** Equal columns while each has room, stacked when not (D-142). */
export function Columns({ gap = "m", cell = "sheet", id, children }: ColumnsProps) {
  return <div id={id} className={`${s.base} ${s.cell[cell]} ${s.gap[gap]}`}>{children}</div>;
}

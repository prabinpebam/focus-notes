import type { ReactNode } from "react";
import * as s from "./Columns.css.ts";
import type { Space } from "../Stack/Stack.tsx";

export interface ColumnsProps {
  gap?: Space;
  id?: string;
  children?: ReactNode;
}

/** Equal columns while each has room, stacked when not (D-142). */
export function Columns({ gap = "m", id, children }: ColumnsProps) {
  return <div id={id} className={`${s.base} ${s.gap[gap]}`}>{children}</div>;
}

import { Separator } from "react-aria-components";
import * as s from "./Divider.css.ts";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ orientation = "horizontal" }: DividerProps) {
  return <Separator orientation={orientation} className={`${s.base} ${s.orientation[orientation]}`} />;
}

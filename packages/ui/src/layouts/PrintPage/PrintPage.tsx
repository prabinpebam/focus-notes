import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import * as s from "./PrintPage.css.ts";

export interface PrintPageProps {
  id?: string;
  children?: ReactNode;
}

/**
 * A note laid out for paper (SHR-12, D-230): hidden on screen, and while printing the only thing on the
 * page, on the named page fn-print (its margin and page numbers come from the tokens build). It sits
 * straight in <body>, outside the drawn window, so nothing of the window's frame reaches the paper.
 */
export function PrintPage({ id, children }: PrintPageProps) {
  if (typeof document === "undefined") return null;
  return createPortal(<div id={id} className={s.root} data-print-root="">{children}</div>, document.body);
}

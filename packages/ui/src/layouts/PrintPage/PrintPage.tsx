import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import * as s from "./PrintPage.css.ts";

export interface PrintPageProps {
  id?: string;
  /** The page number and the count at the foot of every page (D-231). */
  pageNumbers?: boolean;
  children?: ReactNode;
}

/**
 * A note laid out for paper (SHR-12, D-230): hidden on screen, and while printing the only thing on the
 * page, on the named page fn-print, or fn-print-numbered with page numbers (their margin and numbers
 * come from the tokens build). It sits
 * straight in <body>, outside the drawn window, so nothing of the window's frame reaches the paper.
 */
export function PrintPage({ id, pageNumbers = false, children }: PrintPageProps) {
  if (typeof document === "undefined") return null;
  return createPortal(<div id={id} className={pageNumbers ? `${s.root} ${s.numbered}` : s.root} data-print-root="">{children}</div>, document.body);
}

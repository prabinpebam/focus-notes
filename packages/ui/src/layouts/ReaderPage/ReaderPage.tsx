import type { ReactNode } from "react";
import "@focus-notes/tokens/tokens.css";
// The default content font (Roboto Mono), self-hosted (PRV-04). Pages preload only the faces their
// first screen uses (PRF-12); the rest load when text needs them.
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/400-italic.css";
import "@fontsource/roboto-mono/700.css";
import "@fontsource/roboto-mono/700-italic.css";
import * as s from "./ReaderPage.css.ts";

export interface ReaderPageProps {
  skipLabel: string;
  footer?: ReactNode;
  id?: string;
  children?: ReactNode;
}

/** A published page (IA-VIEW-PUBLIC): skip link, the note as the main landmark, and a quiet footer. */
export function ReaderPage({ skipLabel, footer, id, children }: ReaderPageProps) {
  return (
    <div id={id} className={s.root}>
      <a className={s.skip} href="#note" data-print="hide">{skipLabel}</a>
      <main id="note" className={s.main} tabIndex={-1}>{children}</main>
      {footer ? <footer className={s.footer} data-print="hide">{footer}</footer> : null}
    </div>
  );
}

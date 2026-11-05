import type { ReactNode } from "react";
import "@focus-notes/tokens/tokens.css";
// The default content font (Roboto Mono), self-hosted (PRV-04). Pages preload only the faces their
// first screen uses (PRF-12); the rest load when text needs them.
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/400-italic.css";
import "@fontsource/roboto-mono/700.css";
import "@fontsource/roboto-mono/700-italic.css";
import * as s from "./ReaderPage.css.ts";
import { SegmentedControl } from "../../primitives/SegmentedControl/SegmentedControl.tsx";

export interface ReaderPageProps {
  skipLabel: string;
  themeLabel?: string;
  lightLabel?: string;
  darkLabel?: string;
  systemLabel?: string;
  footer?: ReactNode;
  id?: string;
  children?: ReactNode;
}

/** A published page (IA-VIEW-PUBLIC): skip link, the note as the main landmark, and a quiet footer. */
export function ReaderPage({ skipLabel, themeLabel, lightLabel, darkLabel, systemLabel, footer, id, children }: ReaderPageProps) {
  if (themeLabel && (!lightLabel || !darkLabel || !systemLabel)) throw new Error("ReaderPage theme choices require all three accessible labels");
  return (
    <div id={id} className={s.root}>
      <a className={s.skip} href="#note" data-print="hide">{skipLabel}</a>
      {themeLabel && lightLabel && darkLabel && systemLabel ? <div className={s.controls} data-print="hide" data-reader-appearance="">
        <SegmentedControl label={themeLabel} iconsOnly value="system" options={[
          { id: "light", label: lightLabel, icon: "lightTheme" },
          { id: "dark", label: darkLabel, icon: "darkTheme" },
          { id: "system", label: systemLabel, icon: "systemTheme" },
        ]} />
      </div> : null}
      <main id="note" className={s.main} tabIndex={-1}>{children}</main>
      {footer ? <footer className={s.footer} data-print="hide">{footer}</footer> : null}
    </div>
  );
}

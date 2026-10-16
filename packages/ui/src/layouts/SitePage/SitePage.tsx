import type { ReactNode } from "react";
import "@focus-notes/tokens/tokens.css";
import "@focus-notes/tokens/site-tokens.css";
// The content font (Roboto Mono) for articles' text, self-hosted (PRV-01); pages preload only the faces
// their first screen uses (PRF-12).
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/400-italic.css";
import "@fontsource/roboto-mono/700.css";
import "@fontsource/roboto-mono/700-italic.css";
import * as s from "./SitePage.css.ts";

export interface SitePageProps {
  skipLabel: string;
  navLabel: string;
  width?: "reading" | "wide" | "showcase";
  header?: ReactNode;
  footer?: ReactNode;
  id?: string;
  children?: ReactNode;
}

/** A page of the product site (WP-10.1): skip link, the site's navigation, the content as the main landmark, and a footer. */
export function SitePage({ skipLabel, navLabel, width = "reading", header, footer, id, children }: SitePageProps) {
  return (
    <div id={id} className={s.root}>
      <a className={s.skip} href="#main">{skipLabel}</a>
      <header className={s.header}>
        <nav className={s.nav} aria-label={navLabel}>{header}</nav>
      </header>
      <main id="main" className={[s.main, s.width[width]].join(" ")} tabIndex={-1}>{children}</main>
      {footer ? <footer className={s.footer}>{footer}</footer> : null}
    </div>
  );
}

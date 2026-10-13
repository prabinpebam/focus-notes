/// <reference path="../../env.d.ts" />
import { useEffect, type ReactNode } from "react";
import "@focus-notes/tokens/tokens.css";
import * as s from "./AppRoot.css.ts";

export interface AppRootProps {
  scheme: "light" | "dark";
  platform: "macos" | "windows" | "linux" | "web";
  lang?: string;
  children?: ReactNode;
}

const THEME_FOR = { light: "paper", dark: "ink" } as const;

/**
 * The root of every app view. Applies the theme and the token modes (DSY-03) to the document:
 * scheme, platform, reduced motion, reduced transparency, and pointer type.
 */
export function AppRoot({ scheme, platform, lang = "en", children }: AppRootProps) {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = THEME_FOR[scheme];
    html.dataset.platform = platform;
    html.lang = lang;
    html.style.colorScheme = scheme;
  }, [scheme, platform, lang]);

  useEffect(() => {
    const html = document.documentElement;
    const queries: [string, string, string][] = [
      ["(prefers-reduced-motion: reduce)", "motion", "reduced"],
      ["(prefers-reduced-transparency: reduce)", "transparency", "reduced"],
      ["(pointer: coarse)", "pointer", "coarse"],
    ];
    const cleanups = queries.map(([q, key, value]) => {
      const mq = window.matchMedia(q);
      const apply = () => (mq.matches ? (html.dataset[key] = value) : delete html.dataset[key]);
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    });
    return () => cleanups.forEach((c) => c());
  }, []);

  return <div className={s.root}>{children}</div>;
}

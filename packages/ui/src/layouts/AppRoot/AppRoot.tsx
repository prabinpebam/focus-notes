/// <reference path="../../env.d.ts" />
import { useEffect, type ReactNode } from "react";
import "@focus-notes/tokens/tokens.css";
// Bundled content fonts (OFL, D-29), self-hosted: nothing loads from a font service.
import "@fontsource/inter/400.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import { cssVarName } from "@focus-notes/tokens";
import * as s from "./AppRoot.css.ts";

export interface AppRootProps {
  scheme: "light" | "dark";
  /** The theme to show; defaults to Paper or Ink for the scheme (THM-08). */
  theme?: string;
  /** The content font (THM-03): a token mode; "sans" is the default. */
  contentFont?: string;
  /** Interface scale (DSY-03). Note text is unaffected. */
  uiScale?: number;
  platform: "macos" | "windows" | "linux" | "web";
  /** Note text size in px (THM-06). Overrides the font.size token at run time. */
  contentSize?: number;
  focusMode?: boolean;
  lang?: string;
  children?: ReactNode;
}

const THEME_FOR = { light: "paper", dark: "ink" } as const;

/**
 * The root of every app view. Applies the theme and the token modes (DSY-03) to the document:
 * scheme, platform, reduced motion, reduced transparency, and pointer type.
 */
export function AppRoot({ scheme, theme, contentFont, uiScale, platform, contentSize, focusMode, lang = "en", children }: AppRootProps) {
  useEffect(() => {
    const html = document.documentElement;
    const id = theme ?? THEME_FOR[scheme];
    html.dataset.theme = id;
    // The High contrast themes turn on the contrast mode too (heavier focus, lighter dimming).
    if (id.startsWith("contrast-")) html.dataset.themeContrast = "high";
    else delete html.dataset.themeContrast;
    html.dataset.platform = platform;
    html.lang = lang;
    html.style.colorScheme = scheme;
  }, [scheme, theme, platform, lang]);

  useEffect(() => {
    const html = document.documentElement;
    if (contentFont && contentFont !== "sans") html.dataset.contentFont = contentFont;
    else delete html.dataset.contentFont;
    if (uiScale && uiScale !== 1) html.style.setProperty("--fn-ui-scale", String(uiScale));
    else html.style.removeProperty("--fn-ui-scale");
  }, [contentFont, uiScale]);

  useEffect(() => {
    const html = document.documentElement;
    if (contentSize) html.style.setProperty(cssVarName("font.size"), `${contentSize}px`);
    else html.style.removeProperty(cssVarName("font.size"));
    if (focusMode) html.dataset.focus = "on";
    else delete html.dataset.focus;
  }, [contentSize, focusMode]);

  useEffect(() => {
    const html = document.documentElement;
    const queries: [string, string, string][] = [
      ["(prefers-reduced-motion: reduce)", "motion", "reduced"],
      ["(prefers-reduced-transparency: reduce)", "transparency", "reduced"],
      ["(pointer: coarse)", "pointer", "coarse"],
      ["(prefers-contrast: more)", "osContrast", "more"],
    ];
    const cleanups = queries.map(([q, key, value]) => {
      const mq = window.matchMedia(q);
      const apply = () => (mq.matches ? (html.dataset[key] = value) : delete html.dataset[key]);
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    });
    // The contrast mode follows the OS asking for more contrast, or a High contrast theme.
    const contrast = () => {
      if (html.dataset.osContrast || html.dataset.themeContrast) html.dataset.contrast = "more";
      else delete html.dataset.contrast;
    };
    const observer = new MutationObserver(contrast);
    observer.observe(html, { attributes: true, attributeFilter: ["data-os-contrast", "data-theme-contrast"] });
    contrast();
    return () => {
      cleanups.forEach((c) => c());
      observer.disconnect();
    };
  }, []);

  return <div className={s.root}>{children}</div>;
}

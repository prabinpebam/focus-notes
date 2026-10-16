/// <reference path="../../env.d.ts" />
import { useEffect, useRef, type ReactNode } from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import "@focus-notes/tokens/tokens.css";
// Bundled content fonts (OFL, D-29), self-hosted: nothing loads from a font service.
import "@fontsource/inter/400.css";
import "@fontsource/inter/400-italic.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/700.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/fraunces/700-italic.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/400-italic.css";
import "@fontsource/roboto-mono/700.css";
import "@fontsource/roboto-mono/700-italic.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
import { cssVarName } from "@focus-notes/tokens";
import type { ColorValue } from "../../data.ts";
import { setWindowElement } from "./in-window.tsx";
import * as s from "./AppRoot.css.ts";

export interface AppRootProps {
  scheme: "light" | "dark";
  /** The theme to show; defaults to Paper or Ink for the scheme (THM-08). */
  theme?: string;
  /** The content font (THM-03): a token mode; "mono" (Roboto Mono) is the default (D-78). */
  contentFont?: string;
  /** Interface scale (DSY-03). Note text is unaffected. */
  uiScale?: number;
  platform: "macos" | "windows" | "linux" | "web";
  /** Note text size in px (THM-06). Overrides the font.size token at run time. */
  contentSize?: number;
  focusMode?: boolean;
  /**
   * The window's shape where the app draws the window itself (Windows and Linux, D-14): rounded, with
   * 20 px corners and the drawn shadow in a transparent margin, or square (maximized, snapped, full
   * screen, or opaque). Native: the system's own window (macOS, the browser).
   */
  frame?: "native" | "rounded" | "square";
  /** Reading settings (Theme manager → Reading): line spacing, reading width in characters, paragraph spacing, and focus dim. */
  lineHeight?: number;
  measure?: number;
  paragraphSpacing?: "compact" | "comfortable" | "airy";
  focusDim?: number;
  /** An edited copy of the theme showing: color tokens and their hex values over the theme's own. */
  themeColors?: ColorValue[];
  /** How the window is composited (D-121): "software" turns off the backdrop blurs too costly to draw without a GPU. */
  compositing?: "gpu" | "software";
  lang?: string;
  children?: ReactNode;
}

const THEME_FOR = { light: "paper", dark: "ink" } as const;
/** Only color tokens, and only hex values, reach the root's style (a theme can't inject CSS, UNSUP-THEME-01). */
const COLOR_TOKEN = /^(color|trigger|code)\.[a-zA-Z]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const inRange = (v: number | undefined, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
/**
 * The token defaults the note's reading width scales from, read once before any override: the note
 * text size (font.size, px) and the reading width (layout.measure, ch).
 */
let defaults: { size: number; chars: number } | undefined;
function tokenDefaults(html: HTMLElement): { size: number; chars: number } | undefined {
  if (defaults) return defaults;
  const size = cssVarName("font.size");
  const measure = cssVarName("layout.measure");
  const kept = [html.style.getPropertyValue(size), html.style.getPropertyValue(measure)];
  html.style.removeProperty(size);
  html.style.removeProperty(measure);
  const cs = getComputedStyle(html);
  const px = parseFloat(cs.getPropertyValue(size));
  const ch = cs.getPropertyValue(measure).trim();
  if (kept[0]) html.style.setProperty(size, kept[0]);
  if (kept[1]) html.style.setProperty(measure, kept[1]);
  if (px > 0 && ch.endsWith("ch") && parseFloat(ch) > 0) defaults = { size: px, chars: parseFloat(ch) };
  return defaults;
}

/**
 * The root of every app view. Applies the theme and the token modes (DSY-03) to the document:
 * scheme, platform, reduced motion, reduced transparency, and pointer type.
 */
export function AppRoot({ scheme, theme, contentFont, uiScale, platform, contentSize, focusMode, frame = "native", lineHeight, measure, paragraphSpacing, focusDim, themeColors, compositing = "gpu", lang = "en", children }: AppRootProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const applied = useRef<string[]>([]);
  useEffect(() => {
    // The page around a drawn window is transparent, and fixed layers are placed inside the window (frame.ts).
    const html = document.documentElement;
    if (frame === "native") delete html.dataset.windowFrame;
    else html.dataset.windowFrame = frame;
    // Views hosted beside this one render inside the drawn window too (InWindow).
    setWindowElement(frame === "native" ? null : rootRef.current, frame);
    return () => setWindowElement(null);
  }, [frame]);

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
    if (contentFont && contentFont !== "mono") html.dataset.contentFont = contentFont;
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

  // Software compositing (D-121): the styles that need a GPU, the note's edge blur, read this.
  useEffect(() => {
    const html = document.documentElement;
    if (compositing === "software") html.dataset.compositing = "software";
    else delete html.dataset.compositing;
  }, [compositing]);

  // Reading settings override their tokens at run time, as the note text size does.
  useEffect(() => {
    const html = document.documentElement;
    const set = (token: string, v: string | undefined) => (v === undefined ? html.style.removeProperty(cssVarName(token)) : html.style.setProperty(cssVarName(token), v));
    set("font.lineHeight", inRange(lineHeight, 1.3, 2) ? String(lineHeight) : undefined);
    set("layout.measure", inRange(measure, 50, 100) ? `${measure}ch` : undefined);
    // The note's column grows and shrinks with its text size (Mod+= and Mod+-), so a line keeps about
    // as many characters; the window still narrows it (the column's margins). One length, never a
    // calc() over the measure: that made every keystroke lay out a long note again (PRF-01).
    const d = tokenDefaults(html);
    const scale = contentSize && d ? contentSize / d.size : 1;
    const chars = inRange(measure, 50, 100) ? measure! : d?.chars;
    set("cmp.editorSurface.measure", scale !== 1 && chars ? `${Math.round(chars * scale * 100) / 100}ch` : undefined);
    set("focus.dimOpacity", inRange(focusDim, 0.15, 0.6) ? String(focusDim) : undefined);
    if (paragraphSpacing && paragraphSpacing !== "comfortable") html.dataset.paragraphSpacing = paragraphSpacing;
    else delete html.dataset.paragraphSpacing;
  }, [lineHeight, measure, focusDim, paragraphSpacing, contentSize]);

  const colorsKey = (themeColors ?? []).map((c) => `${c.id}=${c.value}`).join(";");
  useEffect(() => {
    const html = document.documentElement;
    for (const name of applied.current) html.style.removeProperty(name);
    applied.current = (themeColors ?? []).filter((c) => COLOR_TOKEN.test(c.id) && HEX.test(c.value)).map((c) => {
      html.style.setProperty(cssVarName(c.id), c.value);
      return cssVarName(c.id);
    });
  }, [colorsKey]);

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

  const root = (
    <div ref={rootRef} className={`${s.root} ${s.frame[frame]}`} data-app-root="">
      {/* Every desktop window drags by its top band, in every state (D-147). */}
      {platform === "web" ? null : <div className={s.band} data-drag-band="" data-title-band="" aria-hidden="true" />}
      {children}
    </div>
  );
  // In a drawn window, menus, tooltips, and dialogs open inside it: clipped to its corners, never in the shadow margin.
  if (frame === "native") return root;
  return <UNSAFE_PortalProvider getContainer={() => rootRef.current}>{root}</UNSAFE_PortalProvider>;
}

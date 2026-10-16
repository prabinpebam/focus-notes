/**
 * The product site's part of the design system (IA-VIEW-SITE, IA-VIEW-HELP, WP-10.1): only the
 * components a site page uses, rendered once at build time through the public pages' static renderer
 * (D-114), so the site's stylesheet carries nothing else (PRF-12, HLP-08).
 */
import type { ComponentType } from "react";
import type { Contract } from "./contract.ts";
import { Text } from "./primitives/Text/Text.tsx";
import { SiteLink } from "./primitives/SiteLink/SiteLink.tsx";
import { Stack } from "./layouts/Stack/Stack.tsx";
import { Inline } from "./layouts/Inline/Inline.tsx";
import { SitePage } from "./layouts/SitePage/SitePage.tsx";
import { SiteSection } from "./layouts/SiteSection/SiteSection.tsx";
import { NoteContent } from "./blocks/NoteContent/NoteContent.tsx";
import { contractByType } from "./contracts.ts";

export const siteRegistry: Readonly<Record<string, ComponentType<any>>> = Object.freeze({ Text, SiteLink, Stack, Inline, SitePage, SiteSection, NoteContent });
export const siteContracts: ReadonlyMap<string, Contract> = new Map(Object.keys(siteRegistry).map((type) => [type, contractByType.get(type)!]));

/** No script and no other origin (PRV-01, HLP-08): the site's own styles, fonts and images, nothing else. */
export const SITE_CSP = "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'";

export interface SiteDocument {
  title: string;
  description?: string;
  /** The page's absolute URL, when the site's address is known. */
  canonical?: string;
  /** Relative URLs, from the page. */
  stylesheets: readonly string[];
  /** Font files the first screen uses, preloaded (PRF-12). */
  preload: readonly string[];
  /** The rendered view document. */
  body: string;
  lang?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A site page's document (Design system → Where HTML and CSS may exist): the head and the rendered
 * view. `data-theme="auto"` follows the visitor's light or dark preference; links to other sites
 * carry no referrer.
 */
export function renderSiteDocument(d: SiteDocument): string {
  const head = [
    `<meta charset="utf-8" />`,
    `<meta http-equiv="Content-Security-Policy" content="${SITE_CSP}" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<meta name="color-scheme" content="light dark" />`,
    `<meta name="referrer" content="no-referrer" />`,
    `<title>${esc(d.title)}</title>`,
    ...(d.description ? [`<meta name="description" content="${esc(d.description)}" />`] : []),
    ...(d.canonical ? [`<link rel="canonical" href="${esc(d.canonical)}" />`] : []),
    ...d.preload.map((f) => `<link rel="preload" href="${esc(f)}" as="font" type="font/woff2" crossorigin />`),
    ...d.stylesheets.map((s) => `<link rel="stylesheet" href="${esc(s)}" />`),
  ];
  return `<!doctype html>\n<html lang="${esc(d.lang ?? "en")}" data-theme="auto" data-page="site">\n  <head>\n    ${head.join("\n    ")}\n  </head>\n  <body>${d.body}</body>\n</html>\n`;
}

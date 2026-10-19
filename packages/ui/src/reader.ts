/**
 * The published pages' part of the design system (IA-VIEW-PUBLIC, WP-5.1): only the components a
 * reader page uses, so the publisher's renderer and its stylesheet carry nothing else (PRF-12).
 */
import type { Contract } from "./contract.ts";
import { Text } from "./primitives/Text/Text.tsx";
import { Stack } from "./layouts/Stack/Stack.tsx";
import { ReaderPage } from "./layouts/ReaderPage/ReaderPage.tsx";
import { NoteContent } from "./blocks/NoteContent/NoteContent.tsx";
import { contractByType } from "./contracts.ts";
import { defineRegistry } from "./register.ts";

export const readerRegistry = defineRegistry({ Text, Stack, ReaderPage, NoteContent });
export const readerContracts: ReadonlyMap<string, Contract> = new Map(Object.keys(readerRegistry).map((type) => [type, contractByType.get(type)!]));
export type { BlockNode } from "./blocks/NoteContent/NoteContent.tsx";

/** No script, no other origin (PRV-04): styles and fonts from the site itself, nothing else. */
export const READER_CSP = "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'";

export interface ReaderDocument {
  title: string;
  description?: string;
  /** The page's absolute URL, when the site's address is known (SHR-03). */
  canonical?: string;
  noindex?: boolean;
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
 * A published page's document (Design system → Where HTML and CSS may exist): the head and the
 * rendered view. `data-theme="auto"` follows the reader's light or dark preference (SHR-06).
 */
export function renderReaderDocument(d: ReaderDocument): string {
  const head = [
    `<meta charset="utf-8" />`,
    `<meta http-equiv="Content-Security-Policy" content="${READER_CSP}" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<meta name="color-scheme" content="light dark" />`,
    `<meta name="referrer" content="strict-origin-when-cross-origin" />`,
    ...(d.noindex ? [`<meta name="robots" content="noindex" />`] : []),
    `<title>${esc(d.title)}</title>`,
    ...(d.description ? [`<meta name="description" content="${esc(d.description)}" />`] : []),
    ...(d.canonical ? [`<link rel="canonical" href="${esc(d.canonical)}" />`] : []),
    ...d.preload.map((f) => `<link rel="preload" href="${esc(f)}" as="font" type="font/woff2" crossorigin />`),
    ...d.stylesheets.map((s) => `<link rel="stylesheet" href="${esc(s)}" />`),
  ];
  return `<!doctype html>\n<html lang="${esc(d.lang ?? "en")}" data-theme="auto" data-page="reader">\n  <head>\n    ${head.join("\n    ")}\n  </head>\n  <body>${d.body}</body>\n</html>\n`;
}

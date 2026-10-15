/**
 * The publisher's page renderer (WP-5.1): built by vite.reader.config.ts into dist-reader/render.mjs
 * with its stylesheet and fonts, and run in Node by the publisher (packages/seal) for each public
 * note. Markdown → the bridge's blocks → the reader view document, through the UI runtime (DSY-06).
 */
import { publicIndexModel, publicPage, publicPagePath, publicNoteUrl, PUBLIC_INDEX_VIEW_MODEL, READER_VIEW_MODEL, type PublicIndexEntry } from "@focus-notes/core";
import { renderStaticView } from "@focus-notes/ui-runtime/static";
import { readerContracts, readerRegistry, renderReaderDocument } from "@focus-notes/ui/reader";
import { pages, messages } from "@focus-notes/views";

export interface ReaderAssets {
  /** File names in the site's assets/ folder. */
  css: readonly string[];
  fonts: readonly string[];
}
export interface NotePageInput {
  markdown: string;
  /** The note's path in notes/. */
  path: string;
  /** When it last changed (ISO 8601). */
  updated: string;
  publicPaths: ReadonlySet<string>;
  /** The site's address, for canonical links (configure-pages' base_url). */
  siteUrl?: string;
  assets: ReaderAssets;
}

export { publicPagePath };

export function renderNotePage(input: NotePageInput): { file: string; html: string; title: string; excerpt?: string } {
  const page = publicPage(input.markdown, input.path, input.updated, input.publicPaths);
  const dir = publicPagePath(input.path);
  const up = "../".repeat(dir.split("/").filter(Boolean).length);
  const asset = (name: string) => `${up}assets/${name}`;
  // The content font's latin faces the first screen uses (PRF-12); other subsets load only if needed.
  const preload = page.faces.flatMap((face) => input.assets.fonts.filter((f) => f.endsWith(".woff2") && f.includes(`-latin-${face}-`)).slice(0, 1)).map(asset);
  const body = renderStaticView({ views: pages, view: "reader", registry: readerRegistry, contracts: readerContracts, messages: messages.en!, data: { [READER_VIEW_MODEL.id]: page.model } });
  const html = renderReaderDocument({
    title: page.title,
    description: page.description,
    ...(input.siteUrl ? { canonical: publicNoteUrl(input.siteUrl, input.path) } : {}),
    noindex: page.noindex,
    stylesheets: input.assets.css.map(asset),
    preload,
    body,
  });
  return { file: `${dir}index.html`, html, title: page.title, ...(page.excerpt ? { excerpt: page.excerpt } : {}) };
}

export interface IndexPageInput {
  /** Each public note: its path in notes/, title, when it last changed (ISO 8601), and its excerpt if it has one. */
  notes: readonly PublicIndexEntry[];
  siteUrl?: string;
  assets: ReaderAssets;
}

/** The index of public notes at `n/` (D-139): the same renderer, stylesheet, and document as the notes' pages. */
export function renderIndexPage(input: IndexPageInput): { file: string; html: string } {
  const en = messages.en!;
  const heading = en["publicIndex.title"]!;
  const model = publicIndexModel(heading, input.notes);
  const asset = (name: string) => `../assets/${name}`;
  const preload = ["400-normal", "700-normal"].flatMap((face) => input.assets.fonts.filter((f) => f.endsWith(".woff2") && f.includes(`-latin-${face}-`)).slice(0, 1)).map(asset);
  const body = renderStaticView({ views: pages, view: "index", registry: readerRegistry, contracts: readerContracts, messages: en, data: { [PUBLIC_INDEX_VIEW_MODEL.id]: model } });
  const html = renderReaderDocument({
    title: heading,
    ...(input.siteUrl ? { canonical: new URL("n/", input.siteUrl.endsWith("/") ? input.siteUrl : `${input.siteUrl}/`).href } : {}),
    stylesheets: input.assets.css.map(asset),
    preload,
    body,
  });
  return { file: "n/index.html", html };
}

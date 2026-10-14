/**
 * Public note pages (WP-5.1, SHR-03, PRV-04): where each public note is published, and the reader
 * view model the publisher renders it from. Pure: the publisher runs it in Node at build time.
 */
import { parseMarkdown, type PMNode } from "@focus-notes/markdown";
import type { JsonSchema } from "./view-models.ts";

/** A public note's page in the site, from its path in `notes/`: `Guides/Garden.md` → `n/Guides/Garden/`. */
export function publicPagePath(notePath: string): string {
  const segs = notePath.replace(/\.(md|markdown)$/i, "").split("/");
  return `n/${segs.map(encodeURIComponent).join("/")}/`;
}

/** A public note's stable, read-only URL on the instance's site (SHR-03). `siteBase` ends in "/". */
export function publicNoteUrl(siteBase: string, notePath: string): string {
  return new URL(publicPagePath(notePath), siteBase.endsWith("/") ? siteBase : `${siteBase}/`).href;
}

/** The reader view model (`vm.reader`) the published page's view document reads (IA-VIEW-PUBLIC). */
export interface ReaderModel extends Record<string, unknown> {
  title: PMNode[];
  /** When the note last changed, in milliseconds since the epoch. */
  updated: number;
  body: PMNode[];
}
export const READER_VIEW_MODEL: { id: string; schema: JsonSchema & { type: "object"; properties: Record<string, JsonSchema> } } = {
  id: "vm.reader",
  schema: {
    type: "object",
    properties: {
      title: { type: "array", items: { type: "object" }, description: "The title as a level-1 heading block." },
      updated: { type: "number", description: "When the note last changed (ms since the epoch)." },
      body: { type: "array", items: { type: "object" }, description: "The note's blocks after its title." },
    },
  },
};

export interface PublicPage {
  model: ReaderModel;
  title: string;
  description: string;
  /** Front matter `noindex: true` keeps the page out of search engines (PRV-04). */
  noindex: boolean;
  /** The font faces the first screen sets text in (PRF-12): "400-normal", "700-normal", "400-italic", "700-italic". */
  faces: string[];
}

const SAFE_ABSOLUTE = /^(https?:|mailto:)/i;
const plain = (nodes: PMNode[] = []): string => nodes.map((n) => n.text ?? plain(n.content)).join("");

/**
 * The reader model for one public note. Relative links to other public notes go to their pages;
 * links to anything else in the repository (a private note, a missing one) and unsafe schemes become
 * plain text, so a public page never points at, or reveals, a private note.
 */
export function publicPage(markdown: string, notePath: string, updated: string, publicPaths: ReadonlySet<string>): PublicPage {
  const blocks = [...(parseMarkdown(markdown).doc.content ?? [])];
  let noindex = false;
  const first = blocks[0];
  if (first?.type === "rawMarkdown" && /^---\r?\n/.test(String(first.attrs?.source ?? ""))) {
    noindex = /^noindex:\s*(true|yes)\s*$/im.test(String(first.attrs?.source));
    blocks.shift();
  }
  const dir = notePath.split("/").slice(0, -1);
  const fix = (n: PMNode): PMNode => ({
    ...n,
    ...(n.content ? { content: n.content.map(fix) } : {}),
    ...(n.marks ? { marks: n.marks.map((m) => (m.type === "link" ? { ...m, attrs: { ...m.attrs, href: linkTarget(String(m.attrs?.href ?? ""), dir, notePath, publicPaths) } } : m)) } : {}),
  });
  const content = blocks.map(fix);
  const h1 = content.findIndex((b) => b.type === "heading" && b.attrs?.level === 1);
  const fallback = notePath.split("/").at(-1)!.replace(/\.(md|markdown)$/i, "");
  const titleBlock = h1 === 0 ? content.shift()! : { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: fallback }] };
  const title = plain(titleBlock.content).trim() || fallback;
  const firstPara = content.find((b) => b.type === "paragraph");
  const description = plain(firstPara?.content).replace(/\s+/g, " ").trim().slice(0, 160);
  // The first screen: the title and about 1,500 characters of the note.
  const faces = new Set(["400-normal", "700-normal"]);
  let budget = 1500;
  const walk = (n: PMNode, bold: boolean) => {
    if (budget <= 0) return;
    const strong = bold || n.type === "heading" || n.type === "tableHeader" || !!n.marks?.some((m) => m.type === "bold");
    if (n.text) {
      budget -= n.text.length;
      if (n.marks?.some((m) => m.type === "italic")) faces.add(strong ? "700-italic" : "400-italic");
    }
    for (const c of n.content ?? []) walk(c, strong);
  };
  for (const b of content) walk(b, false);
  return { model: { title: [titleBlock], updated: Date.parse(updated) || 0, body: content }, title, description, noindex, faces: [...faces] };
}

function linkTarget(href: string, dir: string[], notePath: string, publicPaths: ReadonlySet<string>): string | null {
  if (!href) return null;
  if (SAFE_ABSOLUTE.test(href) || href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("\\")) return null;
  const [rawPath, hash] = href.split("#", 2) as [string, string | undefined];
  let target: string;
  try { target = decodeURIComponent(rawPath); } catch { return null; }
  const segs = [...dir];
  for (const s of target.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") { if (!segs.length) return null; segs.pop(); } else segs.push(s);
  }
  const resolved = segs.join("/");
  if (!publicPaths.has(resolved)) return null;
  // From this page's folder (n/<note>/) to the other page's.
  const from = publicPagePath(notePath).split("/").filter(Boolean);
  const to = publicPagePath(resolved).split("/").filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const rel = [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
  return `${rel ? `${rel}/` : "./"}${hash ? `#${hash}` : ""}`;
}

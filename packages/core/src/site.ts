/**
 * The product site (WP-10.1, HLP-08, D-167): its addresses, the chrome every page shares, and the view
 * models its pages are rendered from, built from the Markdown in `site/`. Pure: the site's renderer
 * runs it in Node at build time, like the public pages (D-114).
 */
import { parseMarkdown, type PMNode } from "@focus-notes/markdown";
import type { JsonSchema } from "./view-models.ts";

/** The project's repository, the only other site the product site links to (with GitHub's own help). */
export const SITE_REPOSITORY = "https://github.com/prabinpebam/focus-notes";

/** The site's addresses (D-167), relative to its root. */
export const SITE_PATHS = {
  home: "", help: "help/", demo: "demo/", download: "download/", privacy: "privacy/", app: "app/", notes: "n/", docs: "documentations/",
} as const;

/**
 * The landing page's limits (D-174): visual first, a few words each. The site check also counts the
 * rendered page: at most LANDING_WORDS of visible text outside the navigation and footer, and no
 * text block over LANDING_BLOCK words.
 */
export const LANDING_LIMITS = { headline: 6, line: 14, features: 5, featureHeadline: 5, eyebrow: 2, closing: 8 } as const;
export const LANDING_WORDS = 120;
export const LANDING_BLOCK = 20;

/** The hero's anchor, and the closing call to action's. */
export const LANDING_HERO = "start";
export const LANDING_CLOSING = "get-focus-notes";

export type FrontMatter = Record<string, string | string[]>;

/** A content file's front matter (a small YAML subset: `key: value`, `key: [a, b]`, and `- item` lists) and its body. */
export function splitFrontMatter(markdown: string): { data: FrontMatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!m) return { data: {}, body: markdown };
  const data: FrontMatter = {};
  const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");
  let list: string | undefined;
  for (const line of m[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) { (data[list] as string[]).push(unquote(item[1]!)); continue; }
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`Front matter: can't read "${line.trim()}"`);
    const [, key, raw] = kv as unknown as [string, string, string];
    list = undefined;
    if (!raw.trim()) { data[key] = []; list = key; }
    else if (/^\[.*\]$/.test(raw.trim())) data[key] = raw.trim().slice(1, -1).split(",").map(unquote).filter(Boolean);
    else data[key] = unquote(raw);
  }
  return { data, body: markdown.slice(m[0].length) };
}

/** From the page at `from` (a site path like `help/write/`) to `to`, relative, so the site works at any address. */
export function siteHref(from: string, to: string): string {
  const up = "../".repeat(from.split("/").filter(Boolean).length);
  return up + to || "./";
}

/** The chrome every site page shares (`vm.site`): its links, relative to the page, and which one is current. */
export interface SiteChromeModel extends Record<string, unknown> {
  home: string; help: string; demo: string; download: string; privacy: string; app: string; notes: string; docs: string; source: string;
  currentHelp: boolean; currentDemo: boolean; currentDownload: boolean;
}
export function siteChrome(path: string): SiteChromeModel {
  const to = (p: string) => siteHref(path, p);
  return {
    home: to(SITE_PATHS.home), help: to(SITE_PATHS.help), demo: to(SITE_PATHS.demo), download: to(SITE_PATHS.download), privacy: to(SITE_PATHS.privacy),
    app: to(SITE_PATHS.app), notes: to(SITE_PATHS.notes), docs: to(SITE_PATHS.docs), source: SITE_REPOSITORY,
    currentHelp: path.startsWith(SITE_PATHS.help), currentDemo: path.startsWith(SITE_PATHS.demo), currentDownload: path.startsWith(SITE_PATHS.download),
  };
}

const text = (t: string, href?: string): PMNode => ({ type: "text", text: t, ...(href ? { marks: [{ type: "link", attrs: { href } }] } : {}) });
const plain = (nodes: PMNode[] = []): string => nodes.map((n) => n.text ?? plain(n.content)).join("");
const heading = (level: number, t: string, href?: string): PMNode => ({ type: "heading", attrs: { level }, content: [text(t, href)] });
const paragraph = (t: string): PMNode => ({ type: "paragraph", content: [text(t)] });
const linkList = (items: { title: string; href: string }[]): PMNode[] =>
  items.length ? [{ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [{ type: "paragraph", content: [text(i.title, i.href)] }] })) }] : [];

/** A site content file: its front matter, its title (the first level-1 heading), and the blocks after it. */
export interface SiteContent {
  data: FrontMatter;
  title: PMNode[];
  titleText: string;
  description: string;
  body: PMNode[];
}

// Site content is the project's own, so its links stay as written, except schemes a page must never follow.
const SAFE_LINK = /^(https?:|mailto:|#|\.{0,2}\/|[^:]*$)/i;
export function siteMarkdown(markdown: string): SiteContent {
  const { data, body } = splitFrontMatter(markdown);
  const fix = (n: PMNode): PMNode => {
    const marks = n.marks?.filter((m) => m.type !== "link" || SAFE_LINK.test(String(m.attrs?.href ?? "")));
    return { ...n, ...(n.content ? { content: n.content.map(fix) } : {}), ...(n.marks ? { marks: marks! } : {}) };
  };
  const blocks = (parseMarkdown(body).doc.content ?? []).map(fix);
  const h1 = blocks.findIndex((b) => b.type === "heading" && b.attrs?.level === 1);
  const fallback = typeof data.title === "string" ? data.title : "";
  const titleBlock = h1 === 0 ? blocks.shift()! : heading(1, fallback);
  const firstPara = blocks.find((b) => b.type === "paragraph");
  const summary = typeof data.summary === "string" ? data.summary : "";
  return {
    data,
    title: [titleBlock],
    titleText: plain(titleBlock.content).trim() || fallback,
    description: (summary || plain(firstPara?.content)).replace(/\s+/g, " ").trim().slice(0, 160),
    body: blocks,
  };
}

/** A plain content page (`vm.sitePage`): download, privacy, the demo's placeholder. */
export interface SitePageModel extends Record<string, unknown> { title: PMNode[]; body: PMNode[] }
export const sitePageModel = (c: SiteContent): SitePageModel => ({ title: c.title, body: c.body });

/** A screenshot on the site (D-169): light, and dark if there is one, with its size in CSS pixels. */
export interface SiteImage { src: string; srcDark?: string; alt: string; width: number; height: number }
/** site/landing.json (D-174): the hero, up to five featured sections, and the closing line. */
export interface LandingContent {
  /** Which work package writes its final words. */
  draft?: string;
  headline: string;
  line: string;
  hero: SiteImage;
  features: { id: string; eyebrow?: string; headline: string; line: string; image: SiteImage }[];
  closing: string;
}
/** The landing page (`vm.siteLanding`, HLP-01, D-174): the hero, each feature with its anchor, and the closing line. */
export interface LandingModel extends Record<string, unknown> {
  heroAnchor: string;
  headline: string;
  line: string;
  hero: Required<SiteImage>;
  features: { key: string; anchor: string; hasEyebrow: boolean; eyebrow: string; headline: string; line: string; image: Required<SiteImage> }[];
  closingAnchor: string;
  closing: string;
}
export const countWords = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const ANCHOR = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The landing page's model, after checking it keeps to D-174's limits; a problem names what's over. */
export function landingModel(c: LandingContent): LandingModel {
  const over: string[] = [];
  const limit = (what: string, text: string | undefined, max: number) => { if (text !== undefined && countWords(text) > max) over.push(`${what} has ${countWords(text)} words (at most ${max})`); };
  const image = (what: string, i: SiteImage): Required<SiteImage> => {
    if (!i?.src || !i.alt?.trim() || !(i.width > 0) || !(i.height > 0)) over.push(`${what}'s screenshot needs src, alt, width and height`);
    return { src: i?.src ?? "", srcDark: i?.srcDark ?? "", alt: i?.alt ?? "", width: i?.width ?? 0, height: i?.height ?? 0 };
  };
  limit("The headline", c.headline, LANDING_LIMITS.headline);
  limit("The hero's line", c.line, LANDING_LIMITS.line);
  limit("The closing line", c.closing, LANDING_LIMITS.closing);
  if (c.features.length > LANDING_LIMITS.features) over.push(`${c.features.length} featured sections (at most ${LANDING_LIMITS.features})`);
  const hero = image("The hero", c.hero);
  const features = c.features.map((f) => {
    if (!ANCHOR.test(f.id)) over.push(`"${f.id}" isn't a usable anchor`);
    limit(`${f.id}'s headline`, f.headline, LANDING_LIMITS.featureHeadline);
    limit(`${f.id}'s line`, f.line, LANDING_LIMITS.line);
    limit(`${f.id}'s eyebrow`, f.eyebrow, LANDING_LIMITS.eyebrow);
    return { key: f.id, anchor: f.id, hasEyebrow: Boolean(f.eyebrow), eyebrow: f.eyebrow ?? "", headline: f.headline, line: f.line, image: image(f.id, f.image) };
  });
  if (over.length) throw new Error(`site/landing.json: ${over.join("; ")} (D-174).`);
  return { heroAnchor: LANDING_HERO, headline: c.headline, line: c.line, hero, features, closingAnchor: LANDING_CLOSING, closing: c.closing };
}

export interface HelpCategory { id: string; title: string; summary: string }
export interface HelpArticleEntry { id: string; category: string; title: string; summary: string }

/** The help centre's home (`vm.helpHome`, HLP-02): each category in order, linking to it and to its articles. */
export interface HelpHomeModel extends Record<string, unknown> {
  title: PMNode[];
  categories: { key: string; heading: PMNode[]; summary: PMNode[]; hasArticles: boolean; articles: PMNode[] }[];
}
export function helpHomeModel(title: string, categories: readonly HelpCategory[], articles: readonly HelpArticleEntry[]): HelpHomeModel {
  return {
    title: [heading(1, title)],
    categories: categories.map((c) => {
      const mine = articles.filter((a) => a.category === c.id).map((a) => ({ title: a.title, href: `${c.id}/${a.id}/` }));
      return { key: c.id, heading: [heading(2, c.title, `${c.id}/`)], summary: c.summary ? [paragraph(c.summary)] : [], hasArticles: mine.length > 0, articles: linkList(mine) };
    }),
  };
}

/** A category's page (`vm.helpCategory`): its title and summary, and its articles. */
export interface HelpCategoryModel extends Record<string, unknown> { title: PMNode[]; summary: PMNode[]; hasArticles: boolean; articles: PMNode[] }
export function helpCategoryModel(category: HelpCategory, articles: readonly HelpArticleEntry[]): HelpCategoryModel {
  const mine = articles.filter((a) => a.category === category.id).map((a) => ({ title: a.title, href: `${a.id}/` }));
  return { title: [heading(1, category.title)], summary: category.summary ? [paragraph(category.summary)] : [], hasArticles: mine.length > 0, articles: linkList(mine) };
}

/** An article's page (`vm.helpArticle`, HLP-02, HLP-07): its category, title, Applies to, body, and when and for which release. */
export interface HelpArticleModel extends Record<string, unknown> {
  category: string; categoryHref: string; title: PMNode[]; appliesTo: string; body: PMNode[]; updated: number; release: string;
}
export function helpArticleModel(c: SiteContent, category: HelpCategory): HelpArticleModel {
  const applies = c.data.appliesTo;
  return {
    category: category.title,
    // An article is at help/<category>/<id>/, so its category is the folder above.
    categoryHref: "../",
    title: c.title,
    appliesTo: Array.isArray(applies) ? applies.join(", ") : applies ?? "",
    body: c.body,
    updated: Date.parse(String(c.data.updated ?? "")) || 0,
    release: typeof c.data.release === "string" ? c.data.release : "",
  };
}

const BLOCKS: JsonSchema = { type: "array", items: { type: "object" } };
const IMAGE: JsonSchema = { type: "object", properties: { src: { type: "string" }, srcDark: { type: "string" }, alt: { type: "string" }, width: { type: "number" }, height: { type: "number" } } };
const vm = (id: string, properties: Record<string, JsonSchema>) => ({ id, schema: { type: "object" as const, properties } });
/** The site's view models, filled by the site's renderer (WP-10.1), not the app. */
export const SITE_VIEW_MODELS = [
  vm("vm.site", Object.fromEntries([...Object.keys(SITE_PATHS), "source"].map((k) => [k, { type: "string", description: `The ${k} link, relative to the page.` } as JsonSchema])
    .concat([["currentHelp", { type: "boolean" }], ["currentDemo", { type: "boolean" }], ["currentDownload", { type: "boolean" }]]))),
  vm("vm.sitePage", { title: BLOCKS, body: BLOCKS }),
  vm("vm.siteLanding", {
    heroAnchor: { type: "string" },
    headline: { type: "string" },
    line: { type: "string" },
    hero: IMAGE,
    features: { type: "array", items: { type: "object", properties: { key: { type: "string" }, anchor: { type: "string" }, hasEyebrow: { type: "boolean" }, eyebrow: { type: "string" }, headline: { type: "string" }, line: { type: "string" }, image: IMAGE } } },
    closingAnchor: { type: "string" },
    closing: { type: "string" },
  }),
  vm("vm.helpHome", {
    title: BLOCKS,
    categories: { type: "array", items: { type: "object", properties: { key: { type: "string" }, heading: BLOCKS, summary: BLOCKS, hasArticles: { type: "boolean" }, articles: BLOCKS } } },
  }),
  vm("vm.helpCategory", { title: BLOCKS, summary: BLOCKS, hasArticles: { type: "boolean" }, articles: BLOCKS }),
  vm("vm.helpArticle", { category: { type: "string" }, categoryHref: { type: "string" }, title: BLOCKS, appliesTo: { type: "string" }, body: BLOCKS, updated: { type: "number" }, release: { type: "string" } }),
] as const;

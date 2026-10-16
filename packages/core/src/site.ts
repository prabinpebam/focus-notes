/**
 * The product site (WP-10.1, HLP-08, D-167): its addresses, the chrome every page shares, and the view
 * models its pages are rendered from, built from the Markdown in `site/`. Pure: the site's renderer
 * runs it in Node at build time, like the public pages (D-114).
 */
import { parseMarkdown, type PMNode } from "@focus-notes/markdown";
import type { JsonSchema } from "./view-models.ts";

/** The project's repository, the only other site the product site links to (with GitHub's own help). */
export const SITE_REPOSITORY = "https://github.com/prabinpebam/focus-notes";
/** The newest release's installers and checksums: GitHub's stable address, so the site never needs updating for a release. */
export const SITE_RELEASES = `${SITE_REPOSITORY}/releases/latest`;

/** Help is a section of the Slate docs (D-181): its home, by the docs' hash route. */
export const HELP_DOCS = "documentations/#help/index.md";
/** A help page's address in the docs, from its file in documentations/help/ ("fix-a-problem.md"), with an optional anchor. */
export const helpDocsPath = (page: string, anchor?: string): string => `documentations/#help/${page}${anchor ? `#${anchor}` : ""}`;

/** The site's addresses (D-167), relative to its root. Downloads are the landing page's last section (D-184). */
export const SITE_PATHS = {
  home: "", help: HELP_DOCS, demo: "demo/", download: "#download", privacy: "privacy/", app: "app/", notes: "n/", docs: "documentations/",
} as const;

/**
 * The landing page's limits (D-174): visual first, a few words each. The site check also counts the
 * rendered page: at most LANDING_WORDS of visible text outside the navigation and footer, and no
 * text block over LANDING_BLOCK words.
 */
export const LANDING_LIMITS = { headline: 6, line: 14, features: 5, featureHeadline: 5, eyebrow: 2, closing: 8 } as const;
export const LANDING_WORDS = 120;
export const LANDING_BLOCK = 20;

/** The hero's anchor, the closing call to action's, and the downloads' (D-184). */
export const LANDING_HERO = "start";
export const LANDING_CLOSING = "get-focus-notes";
export const LANDING_DOWNLOAD = "download";

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
  home: string; help: string; demo: string; download: string; privacy: string; app: string; notes: string; docs: string; source: string; releases: string;
  currentDemo: boolean;
}
export function siteChrome(path: string): SiteChromeModel {
  const to = (p: string) => siteHref(path, p);
  return {
    home: to(SITE_PATHS.home), help: to(SITE_PATHS.help), demo: to(SITE_PATHS.demo), download: to(SITE_PATHS.download), privacy: to(SITE_PATHS.privacy),
    app: to(SITE_PATHS.app), notes: to(SITE_PATHS.notes), docs: to(SITE_PATHS.docs), source: SITE_REPOSITORY, releases: SITE_RELEASES,
    currentDemo: path.startsWith(SITE_PATHS.demo),
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

/**
 * A screenshot on the site (D-176): the app's own window, made by
 * tools/site/scenes.py as `media/<scene>-<width>.avif` and `.webp` at each of SCENE_WIDTHS, all
 * SCENE_SIZE: the window alone, its corners kept, with no wallpaper (D-176). Light mode unless a
 * section shows the themes.
 */
export interface SiteImage { scene: string; alt: string }
export const SCENE_WIDTHS = [720, 1440] as const;
export const SCENE_SIZE = { width: 1440, height: 900 } as const;
/** What a SiteFigure is given: its sources at each width, and its size. */
export interface SiteFigureModel { src: string; srcSet: string; avifSet: string; sizes: string; alt: string; width: number; height: number }
const sceneSet = (scene: string, ext: string) => SCENE_WIDTHS.map((w) => `media/${scene}-${w}.${ext} ${w}w`).join(", ");
/** As wide as the page's widest column, or the viewport below it (cmp.siteFigure.maxWidth is 1200 px). */
export const SCENE_SIZES = "(min-width: 1200px) 1200px, 100vw";
export function sceneFigure(i: SiteImage): SiteFigureModel {
  return { src: `media/${i.scene}-${SCENE_WIDTHS[0]}.webp`, srcSet: sceneSet(i.scene, "webp"), avifSet: sceneSet(i.scene, "avif"), sizes: SCENE_SIZES, alt: i.alt, ...SCENE_SIZE };
}
export interface SiteThemeEntry { id: string; label: string }
/** One theme in the Themes section's model: its swatch and its screenshot. */
export interface SiteThemeModel extends SiteFigureModel { id: string; label: string; scheme: "light" | "dark" }
/** site/landing.json (D-174): the hero, up to five featured sections, and the closing line. */
export interface LandingContent {
  /** Which work package writes its final words. */
  draft?: string;
  headline: string;
  line: string;
  hero: SiteImage;
  /**
   * `themes`: every built-in theme, light and dark, each shown by its swatch (D-176); its screenshot is
   * the scene `theme-<id>`. A section has an image or themes.
   */
  features: { id: string; eyebrow?: string; headline: string; line: string; image?: SiteImage; themes?: { light: SiteThemeEntry[]; dark: SiteThemeEntry[] } }[];
  closing: string;
}
/** The landing page (`vm.siteLanding`, HLP-01, D-174): the hero, each feature with its anchor, and the closing line. */
export interface LandingModel extends Record<string, unknown> {
  heroAnchor: string;
  headline: string;
  line: string;
  hero: SiteFigureModel;
  features: { key: string; anchor: string; hasEyebrow: boolean; eyebrow: string; headline: string; line: string; image: SiteFigureModel; hasThemes: boolean; themes: SiteThemeModel[] }[];
  closingAnchor: string;
  closing: string;
  downloadAnchor: string;
}
export const countWords = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const ANCHOR = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The landing page's model, after checking it keeps to D-174's limits; a problem names what's over. */
export function landingModel(c: LandingContent): LandingModel {
  const over: string[] = [];
  const limit = (what: string, text: string | undefined, max: number) => { if (text !== undefined && countWords(text) > max) over.push(`${what} has ${countWords(text)} words (at most ${max})`); };
  const image = (what: string, i: SiteImage): SiteFigureModel => {
    if (!i?.scene || !ANCHOR.test(i.scene) || !i.alt?.trim()) over.push(`${what}'s screenshot needs a scene and alt text`);
    return sceneFigure({ scene: i?.scene ?? "", alt: i?.alt ?? "" });
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
    const themes: SiteThemeModel[] = (["light", "dark"] as const).flatMap((scheme) => (f.themes?.[scheme] ?? []).map((t) => {
      if (!ANCHOR.test(t.id) || !t.label?.trim()) over.push(`${f.id}'s theme "${t.id}" needs an ID and a name`);
      return { ...image(t.id, { scene: `theme-${t.id}`, alt: `The same note in the ${t.label} theme, ${scheme}.` }), id: t.id, label: t.label, scheme };
    }));
    if (themes.length > 16) over.push(`${f.id} has ${themes.length} themes (at most 8 light and 8 dark)`);
    if (!f.image && !themes.length) over.push(`${f.id} needs an image or themes`);
    const shown = f.image ? image(f.id, f.image) : themes[0]!;
    return { key: f.id, anchor: f.id, hasEyebrow: Boolean(f.eyebrow), eyebrow: f.eyebrow ?? "", headline: f.headline, line: f.line, image: shown, hasThemes: themes.length > 0, themes };
  });
  if (over.length) throw new Error(`site/landing.json: ${over.join("; ")} (D-174).`);
  return { heroAnchor: LANDING_HERO, headline: c.headline, line: c.line, hero, features, closingAnchor: LANDING_CLOSING, closing: c.closing, downloadAnchor: LANDING_DOWNLOAD };
}

const BLOCKS: JsonSchema = { type: "array", items: { type: "object" } };
const IMAGE: JsonSchema = { type: "object", properties: Object.fromEntries(["src", "srcSet", "avifSet", "sizes", "alt"].map((k) => [k, { type: "string" } as JsonSchema]).concat([["width", { type: "number" }], ["height", { type: "number" }]])) };
const vm = (id: string, properties: Record<string, JsonSchema>) => ({ id, schema: { type: "object" as const, properties } });
/** The site's view models, filled by the site's renderer (WP-10.1), not the app. */
export const SITE_VIEW_MODELS = [
  vm("vm.site", Object.fromEntries([...Object.keys(SITE_PATHS), "source", "releases"].map((k) => [k, { type: "string", description: `The ${k} link, relative to the page.` } as JsonSchema])
    .concat([["currentDemo", { type: "boolean" }]]))),
  vm("vm.sitePage", { title: BLOCKS, body: BLOCKS }),
  vm("vm.siteLanding", {
    heroAnchor: { type: "string" },
    headline: { type: "string" },
    line: { type: "string" },
    hero: IMAGE,
    features: { type: "array", items: { type: "object", properties: { key: { type: "string" }, anchor: { type: "string" }, hasEyebrow: { type: "boolean" }, eyebrow: { type: "string" }, headline: { type: "string" }, line: { type: "string" }, image: IMAGE, hasThemes: { type: "boolean" }, themes: { type: "array", items: { type: "object" } } } } },
    closingAnchor: { type: "string" },
    closing: { type: "string" },
    downloadAnchor: { type: "string" },
  }),
] as const;

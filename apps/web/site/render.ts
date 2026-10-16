/**
 * The product site's renderer (WP-10.1, HLP-08, D-167): built by vite.site.config.ts into
 * dist-site/render.mjs with its stylesheet and fonts, and run in Node by the site's builder
 * (tools/site/build.mjs) over the Markdown in site/. The public pages' static renderer (D-114): the
 * view documents in packages/views, the components in packages/ui, the tokens' CSS, no script.
 */
import {
  helpArticleModel, helpCategoryModel, helpHomeModel, landingModel, MessageCatalog, siteChrome, siteHref, siteMarkdown, sitePageModel,
  type HelpArticleEntry, type HelpCategory, type SiteContent,
} from "@focus-notes/core";
import { renderStaticView } from "@focus-notes/ui-runtime/static";
import { renderSiteDocument, siteContracts, siteRegistry } from "@focus-notes/ui/site";
import { messages, sitePages } from "@focus-notes/views";

export interface SiteAssets {
  /** File names in the site's assets/ folder. */
  css: readonly string[];
  fonts: readonly string[];
}
export interface SiteSource {
  /** site/index.md: the landing page. */
  landing: string;
  /** Plain pages by their address (`download/`, `privacy/`, `demo/`), from site/<name>.md. */
  pages: readonly { path: string; markdown: string }[];
  /** site/help/categories.json, in order. */
  categories: readonly HelpCategory[];
  /** site/help/<category>/<id>.md. */
  articles: readonly { category: string; id: string; markdown: string }[];
}
export interface SiteOptions {
  /** The site's address (configure-pages' base_url), for canonical links. */
  siteUrl?: string;
  assets: SiteAssets;
}
export interface SiteFile { file: string; html: string; title: string }

const en = new MessageCatalog("en", messages.en!);

/** Every page of the site, each at `<path>index.html`. */
export function renderSite(src: SiteSource, o: SiteOptions): SiteFile[] {
  const out: SiteFile[] = [];
  const page = (path: string, view: string, vm: string, model: Record<string, unknown>, c: { titleText: string; description: string }, home = false) => {
    const body = renderStaticView({ views: sitePages, view, registry: siteRegistry, contracts: siteContracts, messages: en, data: { "vm.site": siteChrome(path), [vm]: model } });
    const asset = (name: string) => siteHref(path, `assets/${name}`);
    const title = home ? c.titleText : en.format("site.documentTitle", { title: c.titleText });
    const html = renderSiteDocument({
      title,
      ...(c.description ? { description: c.description } : {}),
      ...(o.siteUrl ? { canonical: new URL(path, o.siteUrl.endsWith("/") ? o.siteUrl : `${o.siteUrl}/`).href } : {}),
      stylesheets: o.assets.css.map(asset),
      // The chrome is in the system's font; the content font's regular latin face is the one the first screen reads (PRF-12).
      preload: o.assets.fonts.filter((f) => f.endsWith(".woff2") && f.includes("-latin-400-normal")).slice(0, 1).map(asset),
      body,
    });
    out.push({ file: `${path}index.html`, html, title });
  };

  const landing = siteMarkdown(src.landing);
  page("", "siteLanding", "vm.siteLanding", landingModel(landing), landing, true);
  for (const p of src.pages) {
    const c = siteMarkdown(p.markdown);
    page(p.path, "sitePage", "vm.sitePage", sitePageModel(c), c);
  }

  // The help centre: its home, each category, and each article at help/<category>/<id>/ (HLP-02, HLP-03).
  // IDs are addresses that never change, in lowercase words joined by hyphens (help-writing.md → Every article).
  const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const c of src.categories) if (!ID.test(c.id)) throw new Error(`help/categories.json: "${c.id}" isn't a usable category ID (lowercase words joined by hyphens)`);
  for (const a of src.articles) if (!ID.test(a.id)) throw new Error(`help/${a.category}/${a.id}.md: "${a.id}" isn't a usable article ID (lowercase words joined by hyphens)`);
  const byCategory = new Map(src.categories.map((c) => [c.id, c]));
  const articles: { entry: HelpArticleEntry; content: SiteContent }[] = src.articles.map((a) => {
    const content = siteMarkdown(a.markdown);
    if (!byCategory.has(a.category)) throw new Error(`help/${a.category}/${a.id}.md: there's no category "${a.category}" in help/categories.json`);
    if (content.data.id !== undefined && content.data.id !== a.id) throw new Error(`help/${a.category}/${a.id}.md: its id is "${String(content.data.id)}", not its file name`);
    return { entry: { id: a.id, category: a.category, title: content.titleText, summary: content.description }, content };
  });
  const entries = articles.map((a) => a.entry);
  const helpTitle = en.format("help.title");
  page("help/", "helpHome", "vm.helpHome", helpHomeModel(helpTitle, src.categories, entries), { titleText: helpTitle, description: en.format("help.home.intro") });
  for (const c of src.categories) page(`help/${c.id}/`, "helpCategory", "vm.helpCategory", helpCategoryModel(c, entries), { titleText: c.title, description: c.summary });
  for (const a of articles) page(`help/${a.entry.category}/${a.entry.id}/`, "helpArticle", "vm.helpArticle", helpArticleModel(a.content, byCategory.get(a.entry.category)!), a.content);
  return out;
}

/**
 * The product site's renderer (WP-10.1, HLP-08, D-167): built by vite.site.config.ts into
 * dist-site/render.mjs with its stylesheet and fonts, and run in Node by the site's builder
 * (tools/site/build.mjs) over the Markdown in site/. The public pages' static renderer (D-114): the
 * view documents in packages/views, the components in packages/ui, the tokens' CSS, no script.
 */
import {
  HELP_DOCS, landingModel, MessageCatalog, siteChrome, siteHref, siteMarkdown, sitePageModel, type LandingContent,
} from "@focus-notes/core";
import { renderStaticView } from "@focus-notes/ui-runtime/static";
import { renderRedirectDocument, renderSiteDocument, siteContracts, siteRegistry } from "@focus-notes/ui/site";
import { messages, sitePages } from "@focus-notes/views";

export interface SiteAssets {
  /** File names in the site's assets/ folder. */
  css: readonly string[];
  fonts: readonly string[];
}
export interface SiteSource {
  /** site/landing.json: the landing page (D-174). */
  landing: LandingContent;
  /** Plain pages by their address (`download/`, `privacy/`, `demo/`), from site/<name>.md. */
  pages: readonly { path: string; markdown: string }[];
  /**
   * The help pages in the Slate docs (documentations/help/*.md, D-181): their old addresses on the site,
   * help/ and help/<page>/, send visitors there.
   */
  helpPages: readonly string[];
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
      // The landing page sets no note text, so it preloads no font (D-174).
      preload: home ? [] : o.assets.fonts.filter((f) => f.endsWith(".woff2") && f.includes("-latin-400-normal")).slice(0, 1).map(asset),
      body,
    });
    out.push({ file: `${path}index.html`, html, title });
  };

  // The landing page's title is the product's name; its description, the hero's line.
  page("", "siteLanding", "vm.siteLanding", landingModel(src.landing), { titleText: `${en.format("site.brand")}: ${src.landing.headline}`, description: src.landing.line }, true);
  for (const p of src.pages) {
    const c = siteMarkdown(p.markdown);
    page(p.path, "sitePage", "vm.sitePage", sitePageModel(c), c);
  }

  // Help is a section of the Slate docs (D-181): its old addresses redirect there.
  const redirect = (path: string, to: string) => {
    const html = renderRedirectDocument({ to: siteHref(path, to), title: en.format("site.nav.help"), label: en.format("site.help.redirect") });
    out.push({ file: `${path}index.html`, html, title: en.format("site.nav.help") });
  };
  redirect("help/", HELP_DOCS);
  for (const page of src.helpPages) redirect(`help/${page}/`, `documentations/#help/${page}.md`);
  return out;
}

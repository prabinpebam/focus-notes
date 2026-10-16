/** Types for the product site's builder (build.mjs, WP-10.1), for the journeys that use it. */
export declare const SITE_PAGES: readonly string[];
export declare const LINK_ORIGINS: readonly string[];
export interface SiteSourceFiles {
  landing: string;
  pages: { path: string; markdown: string }[];
  categories: { id: string; title: string; summary: string }[];
  articles: { category: string; id: string; markdown: string }[];
}
export declare function readContent(dir: string): Promise<SiteSourceFiles>;
export declare function buildSite(o: {
  content?: string;
  out: string;
  /** The built renderer's folder, or the renderer module itself. */
  renderer?: string | { renderSite: (src: SiteSourceFiles, o: { siteUrl?: string; assets: { css: readonly string[]; fonts: readonly string[] } }) => { file: string; html: string; title: string }[] };
  app?: string;
  siteUrl?: string;
  log?: (line: string) => void;
}): Promise<{ file: string; html: string; title: string }[]>;
export declare function placeApp(app: string, out: string): Promise<void>;
export declare function siteFiles(out: string): Promise<string[]>;
export declare function checkSite(out: string, o?: { assume?: readonly string[]; siteUrl?: string }): Promise<string[]>;

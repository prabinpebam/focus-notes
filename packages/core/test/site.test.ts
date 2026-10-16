import { describe, expect, it } from "vitest";
import {
  helpArticleModel, helpCategoryModel, helpHomeModel, landingModel, siteChrome, siteHref, siteMarkdown, sitePageModel, splitFrontMatter, SITE_REPOSITORY,
} from "../src/site.ts";

const plain = (nodes: { text?: string; content?: unknown[] }[] = []): string => nodes.map((n) => n.text ?? plain(n.content as never)).join("");

describe("HLP-08: the product site's content (WP-10.1)", () => {
  it("reads front matter: strings, quoted strings, inline lists and block lists", () => {
    const { data, body } = splitFrontMatter("---\nid: connect-github\ntitle: \"Connect your GitHub account\"\nsynonyms: [sign in, log in]\nrelated:\n  - install\n  - get-started\n---\n# Hi\n");
    expect(data).toEqual({ id: "connect-github", title: "Connect your GitHub account", synonyms: ["sign in", "log in"], related: ["install", "get-started"] });
    expect(body).toBe("# Hi\n");
    expect(splitFrontMatter("# No front matter\n")).toEqual({ data: {}, body: "# No front matter\n" });
  });

  it("addresses between pages are relative, so the site works at any GitHub Pages address", () => {
    expect(siteHref("", "help/")).toBe("help/");
    expect(siteHref("help/write/", "download/")).toBe("../../download/");
    expect(siteHref("help/", "")).toBe("../");
    expect(siteHref("", "")).toBe("./");
  });

  it("the chrome links every page to the landing page, help, demo, download, privacy, the owner's app, and marks the current one", () => {
    const c = siteChrome("help/write/");
    expect(c).toMatchObject({ home: "../../", help: "../../help/", demo: "../../demo/", download: "../../download/", privacy: "../../privacy/", app: "../../app/", notes: "../../n/", docs: "../../documentations/", source: SITE_REPOSITORY });
    expect(c.currentHelp).toBe(true);
    expect(siteChrome("download/")).toMatchObject({ currentDownload: true, currentHelp: false, currentDemo: false });
  });

  it("a content page's title is its first heading, and unsafe links lose their address", () => {
    const page = siteMarkdown("---\ntitle: Privacy\n---\n# Privacy\n\nNothing is [collected](javascript:alert(1)). See [help](../help/) and [GitHub](https://github.com/prabinpebam/focus-notes).\n");
    expect(page.titleText).toBe("Privacy");
    expect(page.description).toContain("Nothing is collected");
    const hrefs = JSON.stringify(page.body).match(/"href":"[^"]*"/g) ?? [];
    expect(hrefs).toEqual(['"href":"../help/"', '"href":"https://github.com/prabinpebam/focus-notes"']);
    expect(sitePageModel(page)).toMatchObject({ title: [{ type: "heading", attrs: { level: 1 } }] });
  });

  it("HLP-01, D-174, D-176: the landing page is a hero, a few featured sections and a closing line, each within its word limit, with desktop scenes in AVIF and WebP, light and dark", () => {
    const image = { scene: "spotlight-light", alt: "Spotlight" };
    const c = { headline: "Write. Nothing else.", line: "A calm writing app.", hero: { scene: "focus-light", dark: "focus-dark", alt: "Focus mode" }, features: [{ id: "spotlight", eyebrow: "Spotlight", headline: "Find anything. Instantly.", line: "One keystroke away.", image }], closing: "Start writing." };
    const m = landingModel(c);
    expect(m).toMatchObject({ heroAnchor: "start", headline: "Write. Nothing else.", closingAnchor: "get-focus-notes" });
    expect(m.hero).toEqual({
      src: "media/focus-light-960.webp", srcSet: "media/focus-light-960.webp 960w, media/focus-light-1920.webp 1920w", avifSet: "media/focus-light-960.avif 960w, media/focus-light-1920.avif 1920w",
      darkSrcSet: "media/focus-dark-960.webp 960w, media/focus-dark-1920.webp 1920w", darkAvifSet: "media/focus-dark-960.avif 960w, media/focus-dark-1920.avif 1920w",
      sizes: "(min-width: 1200px) 1200px, 100vw", alt: "Focus mode", width: 1920, height: 1080,
    });
    expect(m.features[0]).toMatchObject({ key: "spotlight", anchor: "spotlight", hasEyebrow: true, eyebrow: "Spotlight", image: { darkSrcSet: "", darkAvifSet: "" } });
    expect(() => landingModel({ ...c, headline: "A calm place to write your notes in" })).toThrow(/headline has 8 words \(at most 6\)/);
    expect(() => landingModel({ ...c, features: Array.from({ length: 6 }, (_, i) => ({ ...c.features[0]!, id: `f${i}` })) })).toThrow(/6 featured sections \(at most 5\)/);
    expect(() => landingModel({ ...c, hero: { scene: "focus-light", alt: "" } })).toThrow(/needs a scene and alt text/);
  });

  it("HLP-02: the help home lists every category in order, with its articles linked by address", () => {
    const categories = [{ id: "get-started", title: "Get started", summary: "Begin here." }, { id: "write", title: "Write", summary: "Write." }];
    const articles = [{ id: "connect-github", category: "get-started", title: "Connect your GitHub account", summary: "Sign in." }];
    const m = helpHomeModel("Help", categories, articles);
    expect(m.categories.map((c) => c.key)).toEqual(["get-started", "write"]);
    expect(JSON.stringify(m.categories[0]!.heading)).toContain('"href":"get-started/"');
    expect(JSON.stringify(m.categories[0]!.articles)).toContain('"href":"get-started/connect-github/"');
    expect(m.categories[1]).toMatchObject({ hasArticles: false, articles: [] });
    const cat = helpCategoryModel(categories[0]!, articles);
    expect(cat.hasArticles).toBe(true);
    expect(JSON.stringify(cat.articles)).toContain('"href":"connect-github/"');
  });

  it("HLP-02: an article carries its category, Applies to, the last-updated date and release", () => {
    const page = siteMarkdown("---\nid: connect-github\ntitle: Connect your GitHub account\ntype: how-to\ncategory: get-started\nappliesTo: [Desktop app on Windows, macOS, Linux]\nupdated: 2026-10-16\nrelease: 0.9.0\n---\n# Connect your GitHub account\n\nSign in once.\n");
    const m = helpArticleModel(page, { id: "get-started", title: "Get started", summary: "" });
    expect(m).toMatchObject({ category: "Get started", appliesTo: "Desktop app on Windows, macOS, Linux", release: "0.9.0", updated: Date.parse("2026-10-16") });
  });
});

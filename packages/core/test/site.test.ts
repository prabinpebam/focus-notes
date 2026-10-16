import { describe, expect, it } from "vitest";
import {
  helpArticleModel, helpCategoryModel, helpHomeModel, landingModel, LANDING_SECTIONS, siteChrome, siteHref, siteMarkdown, sitePageModel, splitFrontMatter, SITE_REPOSITORY,
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

  it("HLP-01: the landing page is the hero, then the spec's eight sections in order, each with its stable anchor", () => {
    const md = ["---", "draft: WP-10.5", "---", "# A calm place to write", "", "Pitch.", ...LANDING_SECTIONS.flatMap((s) => ["", `## ${s}`, "", "Words."])].join("\n");
    const m = landingModel(siteMarkdown(md));
    expect(plain(m.hero as never)).toContain("A calm place to write");
    expect(m.sections.map((s) => s.anchor)).toEqual([...LANDING_SECTIONS]);
    expect(m.sections.map((s) => s.tone)).toEqual(LANDING_SECTIONS.map((_, i) => (i % 2 ? "plain" : "band")));
    expect(() => landingModel(siteMarkdown("# Hi\n\n## Only one\n"))).toThrow(/sections/);
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

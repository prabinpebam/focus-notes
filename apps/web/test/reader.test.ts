/** WP-5.1: the published page's document, rendered from the reader view through the UI runtime (DSY-06, SHR-06, PRV-04). */
import { describe, expect, it } from "vitest";
import { renderIndexPage, renderNotePage } from "../reader/render.ts";

const assets = { css: ["style-abc.css"], fonts: ["roboto-mono-latin-400-normal-abc.woff2", "roboto-mono-latin-400-normal-abc.woff", "roboto-mono-latin-700-normal-def.woff2", "roboto-mono-latin-ext-400-normal-x.woff2"] };
const page = (markdown: string, path = "Guides/Garden.md") =>
  renderNotePage({ markdown, path, updated: "2026-10-01T12:00:00Z", publicPaths: new Set([path, "Reading.md"]), siteUrl: "https://octo.github.io/notes/", assets });

describe("public page document", () => {
  it("SHR-03: renders at n/<path>/ with a canonical link and relative assets", () => {
    const { file, html } = page("# Garden log\n\nPlanted the tomatoes. See [reading](../Reading.md).\n");
    expect(file).toBe("n/Guides/Garden/index.html");
    expect(html).toContain('<link rel="canonical" href="https://octo.github.io/notes/n/Guides/Garden/" />');
    expect(html).toContain('<link rel="stylesheet" href="../../../assets/style-abc.css" />');
    expect(html).toContain('href="../../Reading/"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Published with Focus Notes");
  });

  it("SHR-06, PRV-04: follows the reader's scheme, runs no script, and allows only its own origin", () => {
    const { html } = page("# T\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n");
    expect(html).toContain('data-theme="auto"');
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    expect(html).toMatch(/Content-Security-Policy" content="default-src 'none'; style-src 'self'; font-src 'self'/);
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/https?:\/\/(?!octo\.github\.io\/notes\/n\/)/);
  });

  it("PRF-12: preloads only the latin woff2 faces the first screen uses", () => {
    const { html } = page("# T\n\nPlain.\n");
    expect([...html.matchAll(/rel="preload" href="([^"]+)"/g)].map((m) => m[1])).toEqual(["../../../assets/roboto-mono-latin-400-normal-abc.woff2", "../../../assets/roboto-mono-latin-700-normal-def.woff2"]);
  });

  it("escapes the title and description", () => {
    const { html } = page('# Tom & "Jerry" > all\n\nText & more.\n');
    expect(html).toContain("<title>Tom &amp; &quot;Jerry&quot; &gt; all</title>");
    expect(html).toContain('<meta name="description" content="Text &amp; more." />');
  });

  it("D-139: gives the excerpt its front matter specifies, for the index", () => {
    expect(page("---\nexcerpt: \"What grew, & when.\"\n---\n# Garden log\n\nText.\n").excerpt).toBe("What grew, & when.");
    expect(page("# Garden log\n\nText.\n").excerpt).toBeUndefined();
  });
});

describe("public notes index (D-139)", () => {
  const notes = [
    { path: "Guides/Garden.md", title: "Garden <log>", updated: "2026-10-01T12:00:00Z", excerpt: "What grew, & when." },
    { path: "Reading.md", title: "Reading", updated: "2026-10-03T12:00:00Z" },
  ];
  const index = () => renderIndexPage({ notes, siteUrl: "https://octo.github.io/notes/", assets });

  it("SHR-03: is at n/ with a canonical link, relative assets, one H1, and the reader's scheme without script", () => {
    const { file, html } = index();
    expect(file).toBe("n/index.html");
    expect(html).toContain('<link rel="canonical" href="https://octo.github.io/notes/n/" />');
    expect(html).toContain('<link rel="stylesheet" href="../assets/style-abc.css" />');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('data-theme="auto"');
    expect(html).not.toMatch(/<script/);
    expect(html).not.toMatch(/https?:\/\/(?!octo\.github\.io\/notes\/n\/)/);
  });

  it("lists each public note as a row, newest first: its title linking to its page, when it was updated, and its excerpt if it has one", () => {
    const { html } = index();
    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(html.indexOf("Reading")).toBeLessThan(html.indexOf("Garden &lt;log&gt;"));
    expect(html).toContain('href="Guides/Garden/"');
    expect(html).toContain('href="Reading/"');
    expect(html).toContain("Updated October 1, 2026");
    expect(html).toContain("Updated October 3, 2026");
    expect(html).toContain("What grew, &amp; when.");
    expect(html.match(/What grew/g)).toHaveLength(1);
    expect(html).toContain("2 public notes");
  });
});

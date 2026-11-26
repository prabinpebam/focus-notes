import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applySiteLook, applySiteLookToSite, readSiteLook } from "../src/main/share/site-look.ts";

const page = `<!doctype html>\n<html lang="en" data-theme="auto" data-page="reader">\n  <head>\n    <link rel="preload" href="../assets/roboto-mono-latin-400-normal-a1.woff2" as="font" type="font/woff2" crossorigin />\n    <link rel="preload" href="../assets/roboto-mono-latin-700-normal-b2.woff2" as="font" type="font/woff2" crossorigin />\n  </head>\n  <body></body>\n</html>\n`;

describe("D-430: the website's look", () => {
  it("puts the theme and font on the page and preloads the chosen family's faces instead of the default", () => {
    const html = applySiteLook(page, { theme: "dusk", font: "sans" }, ["inter-latin-400-normal-c3.woff2", "roboto-mono-latin-400-normal-a1.woff2"]);
    expect(html).toContain('<html lang="en" data-theme="dusk" data-content-font="sans" data-page="reader">');
    expect([...html.matchAll(/rel="preload" href="([^"]+)"/g)].map(m => m[1])).toEqual(["../assets/inter-latin-400-normal-c3.woff2"]);
  });
  it("reads only allowlisted looks, and applies one to every page of the built site, s/ included", async () => {
    const dir = await mkdtemp(join(tmpdir(), "site-look-"));
    try {
      await writeFile(join(dir, "site.json"), JSON.stringify({ version: 1, theme: "dusk", font: "url(evil)" }));
      expect(await readSiteLook(join(dir, "site.json"))).toBeUndefined();
      expect(await readSiteLook(join(dir, "missing.json"))).toBeUndefined();
      await writeFile(join(dir, "site.json"), JSON.stringify({ version: 1, theme: "sepia", font: "hyperlegible" }));
      const look = (await readSiteLook(join(dir, "site.json")))!;
      const site = join(dir, "site");
      await mkdir(join(site, "n", "trip"), { recursive: true });
      await mkdir(join(site, "s"), { recursive: true });
      await mkdir(join(site, "assets"), { recursive: true });
      await writeFile(join(site, "n", "trip", "index.html"), page);
      await writeFile(join(site, "s", "index.html"), '<html lang="en" data-theme="auto" data-page="reader"><body></body></html>');
      expect(await applySiteLookToSite(site, look)).toBe(2);
      for (const file of [join(site, "n", "trip", "index.html"), join(site, "s", "index.html")]) {
        expect(await readFile(file, "utf8")).toContain('data-theme="sepia" data-content-font="hyperlegible"');
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

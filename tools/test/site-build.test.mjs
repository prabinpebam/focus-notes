/**
 * The product site's build (WP-10.1, HLP-08, D-167): the builder renders site/ through the site's
 * renderer at the new addresses, places the owner's app at /app/ with the share reader still at /s/,
 * and its check fails on a broken link, a missing anchor, or anything from another origin (PRV-01).
 * The Deploy app workflow builds the site this way.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile, cp, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { buildSite, checkSite, LANDING_BLOCK, LANDING_WORDS, placeApp, readContent, visibleText } from "../site/build.mjs";
import { renderSite } from "../../apps/web/site/render.ts";
import { LANDING_CLOSING, LANDING_HERO } from "../../packages/core/src/site.ts";

const root = join(import.meta.dirname, "..", "..");
const content = join(root, "site");
let tmp;
beforeAll(async () => { tmp = await mkdtemp(join(tmpdir(), "fn-site-")); });
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });
const read = (out, file) => readFile(join(out, ...file.split("/")), "utf8");

describe("HLP-08: the product site builds from site/ at its addresses (D-167)", () => {
  let out;
  let helpPages;
  beforeAll(async () => {
    out = join(tmp, "site");
    await buildSite({ content, out, renderer: { renderSite } });
    helpPages = (await readContent(content)).helpPages;
  });

  it("renders the landing page, the demo, downloads and privacy; help is in the Slate docs, and its old addresses send visitors there (D-181)", async () => {
    for (const f of ["index.html", "demo/index.html", "download/index.html", "privacy/index.html"]) expect((await read(out, f)).length, f).toBeGreaterThan(0);
    expect(helpPages).toEqual(["get-started", "write", "organize", "save-and-back-up", "private-and-sharing", "fix-a-problem", "reference", "developers"]);
    const home = await read(out, "help/index.html");
    expect(home).toMatch(/<meta http-equiv="refresh" content="0; url=\.\.\/documentations\/#help\/index\.md" \/>/);
    expect(home).toMatch(/<a href="\.\.\/documentations\/#help\/index\.md">Help is in the Focus Notes docs\. Go to Help<\/a>/);
    expect(home).not.toMatch(/<script/);
    expect(await read(out, "help/fix-a-problem/index.html")).toMatch(/url=\.\.\/\.\.\/documentations\/#help\/fix-a-problem\.md/);
    // Every help page the redirects name is a Slate page in the docs.
    for (const id of ["index", ...helpPages]) expect(readFileSync(join(root, "documentations", "help", `${id}.md`), "utf8")).toMatch(/^# .+\n[\s\S]*\*\*TL;DR\.\*\*/);
  });

  it("HLP-01, D-174: the landing page is visual first: the hero, the featured sections and the closing line, 120 words at most, every screenshot sized and described", async () => {
    const html = await read(out, "index.html");
    const landing = JSON.parse(await readFile(join(content, "landing.json"), "utf8"));
    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([LANDING_HERO, ...landing.features.map((f) => f.id), LANDING_CLOSING]);
    expect(landing.draft).toBe("WP-10.5");
    expect(html).toMatch(/<h1 class="[^"]*">Write\. Nothing else\.<\/h1>/);
    expect(html).toMatch(/href="download\/"[^>]*>Download Focus Notes</);
    expect(html).toMatch(/href="demo\/"[^>]*>Try the demo</);
    // Light scenes for everyone (D-176): nothing switches by the visitor's setting; dark is a choice, by radio buttons.
    expect(html).not.toMatch(/prefers-color-scheme/);
    expect(html).toMatch(/<source type="image\/avif" srcSet="media\/note-light-960\.avif 960w, media\/note-light-1920\.avif 1920w" sizes="[^"]+"\/>/i);
    expect(html).toMatch(/<fieldset[^>]*><legend[^>]*>Show the app in<\/legend><input[^>]*type="radio" id="themes-scheme-light" name="themes-scheme" checked="" value="light"\/><label[^>]*for="themes-scheme-light">Light<\/label><input[^>]*type="radio" id="themes-scheme-dark" name="themes-scheme" value="dark"\/><label[^>]*for="themes-scheme-dark">Dark<\/label><\/fieldset>/);
    expect(html).toMatch(/fetchPriority="high"/i);
    // D-176: every scene is in site/media at both widths, both formats, and the wallpaper's source isn't published.
    for (const s of [landing.hero, ...landing.features.flatMap((f) => [f.image, f.dark].filter(Boolean))].map((i) => i.scene)) {
      for (const f of [`${s}-960.avif`, `${s}-1920.avif`, `${s}-960.webp`, `${s}-1920.webp`]) expect((await readFile(join(out, "media", f))).length, f).toBeGreaterThan(0);
    }
    await expect(readFile(join(out, "media", "source", "wallpaper-1920.webp"))).rejects.toThrow();
    expect(html).toMatch(/Desktop photo by Cristina Gottardi on Unsplash/);
    const { words, blocks } = visibleText(html);
    expect(words).toBeLessThanOrEqual(LANDING_WORDS);
    for (const b of blocks) expect(b.split(/\s+/).length, b).toBeLessThanOrEqual(LANDING_BLOCK);
    for (const [img] of html.matchAll(/<img\b[^>]*>/g)) expect(img).toMatch(/alt="[^"]+".*width="\d+".*height="\d+"/);
    // Nothing from the help centre's prose is here: no lists, no paragraphs of explanation.
    expect(html).not.toMatch(/<ul(?![^>]*class)|Is it for you|Questions/);
  });

  it("D-174: the site check fails a landing page over its word budget or with a long block", async () => {
    const o = join(tmp, "wordy");
    await mkdir(o, { recursive: true });
    await writeFile(join(o, "index.html"), `<main><p>${"word ".repeat(21)}</p>${"<p>five words in a line</p>".repeat(30)}</main>`);
    const problems = await checkSite(o);
    expect(problems).toEqual(expect.arrayContaining([expect.stringMatching(/a text block of 21 words/), expect.stringMatching(/171 words of visible text \(at most 120/)]));
  });

  it("every page is the design system's document: light and dark by the visitor's setting, no script, one main heading, the site's links", async () => {
    for (const f of ["index.html", "download/index.html", "privacy/index.html"]) {
      const html = await read(out, f);
      expect(html, f).toMatch(/<html lang="en" data-theme="auto" data-page="site">/);
      expect(html, f).toMatch(/<meta name="color-scheme" content="light dark" \/>/);
      expect(html, f).toMatch(/Content-Security-Policy" content="default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self';/);
      expect(html, f).not.toMatch(/<script|style="/);
      expect(html.match(/<h1[\s>]/g), f).toHaveLength(1);
      expect(html, f).toMatch(/<nav [^>]*aria-label="Focus Notes site"/);
      expect(html, f).toMatch(/href="[./]*privacy\/"/);
      expect(html, f).toMatch(/href="[./]*app\/"/);
    }
    expect(await read(out, "download/index.html")).toMatch(/aria-current="page"[^>]*>Download</);
    expect(await read(out, "index.html")).toMatch(/href="documentations\/#help\/index\.md"[^>]*>Help</);
  });

  it("HLP-03, PRV-01: every link resolves, including each docs page a link names, and nothing names another origin but links to GitHub", async () => {
    await cp(join(root, "documentations", "help"), join(out, "documentations", "help"), { recursive: true });
    await writeFile(join(out, "documentations", "index.html"), "");
    expect(await checkSite(out, { assume: ["app/"] })).toEqual([]);
    await rm(join(out, "documentations", "help", "fix-a-problem.md"));
    expect(await checkSite(out, { assume: ["app/"] })).toEqual([expect.stringMatching(/help\/fix-a-problem\/index\.html: .* names a docs page that isn't there \(documentations\/help\/fix-a-problem\.md\)/)]);
  });

});

describe("the site's check fails on what HLP-03 and PRV-01 forbid", () => {
  it("a broken link, a missing anchor, a link to another site, and anything loaded from another origin", async () => {
    const out = join(tmp, "bad-links");
    await mkdir(join(out, "help"), { recursive: true });
    await mkdir(join(out, "assets"), { recursive: true });
    await writeFile(join(out, "index.html"), `<a href="help/">ok</a><a href="nowhere/">x</a><a href="#gone">y</a><a href="help/#missing">z</a><a href="https://example.com/">e</a><a href="https://github.com/prabinpebam/focus-notes">ok</a><img src="https://example.com/a.png"><section id="here"></section><a href="#here">ok</a>`);
    await writeFile(join(out, "help", "index.html"), `<h1 id="top">Help</h1>`);
    await writeFile(join(out, "assets", "site.css"), `@font-face{src:url(https://fonts.example.com/a.woff2)}`);
    const problems = await checkSite(out);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/index\.html: nowhere\/ doesn't resolve/),
      expect.stringMatching(/index\.html: no anchor #gone/),
      expect.stringMatching(/index\.html: help\/#missing has no anchor #missing/),
      expect.stringMatching(/index\.html: links to another origin: https:\/\/example\.com\//),
      expect.stringMatching(/index\.html: loads another origin: https:\/\/example\.com\/a\.png/),
      expect.stringMatching(/assets\/site\.css: loads another origin/),
    ]));
    expect(problems.some((p) => p.includes("github.com"))).toBe(false);
    expect(problems.some((p) => p.includes("#here"))).toBe(false);
  });
});

describe("D-167: the owner's app moves to /app/, and share links keep working at /s/", () => {
  it("places the app at app/ and the share reader at s/, reading the app's assets", async () => {
    const app = join(tmp, "dist");
    await mkdir(join(app, "assets"), { recursive: true });
    await mkdir(join(app, "s"), { recursive: true });
    await writeFile(join(app, "index.html"), `<script type="module" src="./assets/main-1.js"></script>`);
    await writeFile(join(app, "assets", "main-1.js"), "");
    await writeFile(join(app, "s", "index.html"), `<link rel="icon" href="../favicon.svg"><script type="module" crossorigin src="../assets/share-2.js"></script>`);
    const out = join(tmp, "placed");
    await placeApp(app, out);
    expect(await readdir(join(out, "app"))).toEqual(["assets", "index.html"]);
    expect(await read(out, "s/index.html")).toBe(`<link rel="icon" href="../app/favicon.svg"><script type="module" crossorigin src="../app/assets/share-2.js"></script>`);
  });

  it("security review I2: the build fails without the share reader's page, or with a reference the move missed", async () => {
    const app = join(tmp, "dist-no-s");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "index.html"), "");
    await expect(placeApp(app, join(tmp, "placed-no-s"))).rejects.toThrow(/no s\/index\.html/);
    await mkdir(join(app, "s"), { recursive: true });
    await writeFile(join(app, "s", "index.html"), `<script src="../share/main.js"></script>`);
    await expect(placeApp(app, join(tmp, "placed-left"))).rejects.toThrow(/still has a "\.\.\/" reference/);
  });

  it("security review I1: a help page name that isn't lowercase words joined by hyphens fails before it's used as a path", async () => {
    const docs = join(tmp, "bad-docs");
    await mkdir(docs, { recursive: true });
    await writeFile(join(docs, "docs-manifest.json"), JSON.stringify({ version: 1, entries: [{ path: "help/../../outside.md" }, { path: "help/Bad Name.md" }] }));
    await expect(readContent(content, docs)).rejects.toThrow(/isn't a usable help page name/);
  });

  it("the Deploy app workflow builds the app to read the notes from the site's root, builds the site, then publishes the notes at the root", () => {
    const wf = yaml.load(readFileSync(join(root, ".github", "workflows", "pages.yml"), "utf8"));
    const steps = wf.jobs.build.steps;
    const at = (re) => steps.findIndex((s) => re.test(s.name ?? ""));
    expect(steps[at(/Build the web app/)].run).toBe("pnpm --filter @focus-notes/web run build");
    // The web app's build includes dist-app/: the app built to read the notes from the folder above it.
    expect(JSON.parse(readFileSync(join(root, "apps", "web", "package.json"), "utf8")).scripts.build).toMatch(/vite build --config vite\.config\.ts --mode app/);
    const site = steps[at(/Build the product site/)];
    // Security review L2: only this repository publishes the product site; a fork's app is its whole site.
    expect(site.if).toBe("github.repository == 'prabinpebam/focus-notes'");
    const fork = steps[at(/Put the app at the root/)];
    expect(fork.if).toBe("github.repository != 'prabinpebam/focus-notes'");
    expect(fork.run).toBe("cp -r apps/web/dist/. _site/");
    expect(at(/Copy the docs/)).toBeLessThan(at(/Build the product site/));
    expect(site.run).toMatch(/node tools\/site\/build\.mjs --out _site --app apps\/web\/dist-app /);
    expect(site.run).toMatch(/--site-url "\$SITE_URL\/"/);
    expect(at(/Build the product site/)).toBeGreaterThan(at(/Build the web app/));
    expect(at(/Build the product site/)).toBeGreaterThan(steps.findIndex((s) => s.id === "pages"));
    expect(at(/Publish the notes/)).toBeGreaterThan(at(/Build the product site/));
    expect(steps[at(/Publish the notes/)].run).toMatch(/--site _site /);
  });

  it("the content's folders: the landing page and plain pages; the help pages come from the docs", async () => {
    const c = await readContent(content);
    expect(c.pages.map((p) => p.path)).toEqual(["download/", "privacy/", "demo/"]);
    expect(c.helpPages).toHaveLength(8);
  });
});

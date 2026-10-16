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
import { buildSite, checkSite, placeApp, readContent } from "../site/build.mjs";
import { renderSite } from "../../apps/web/site/render.ts";
import { LANDING_HERO, LANDING_SECTIONS } from "../../packages/core/src/site.ts";

const root = join(import.meta.dirname, "..", "..");
const content = join(root, "site");
let tmp;
beforeAll(async () => { tmp = await mkdtemp(join(tmpdir(), "fn-site-")); });
afterAll(async () => { await rm(tmp, { recursive: true, force: true }); });
const read = (out, file) => readFile(join(out, ...file.split("/")), "utf8");

describe("HLP-08: the product site builds from site/ at its addresses (D-167)", () => {
  let out;
  let categories;
  beforeAll(async () => {
    out = join(tmp, "site");
    await buildSite({ content, out, renderer: { renderSite } });
    categories = JSON.parse(readFileSync(join(content, "help", "categories.json"), "utf8"));
  });

  it("renders the landing page, the help centre with every category, the demo, downloads and privacy", async () => {
    const files = ["index.html", "help/index.html", "demo/index.html", "download/index.html", "privacy/index.html", ...categories.map((c) => `help/${c.id}/index.html`)];
    for (const f of files) expect((await read(out, f)).length, f).toBeGreaterThan(0);
    expect(categories.map((c) => c.title)).toEqual(["Get started", "Write", "Organize your notes", "Save and back up", "Private notes and sharing", "Fix a problem", "Reference", "For developers and AI agents"]);
  });

  it("HLP-01: the landing page is the hero then the eight sections in the spec's order, its copy marked as a draft for WP-10.5", async () => {
    const html = await read(out, "index.html");
    const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([LANDING_HERO, ...LANDING_SECTIONS]);
    expect(await readFile(join(content, "index.md"), "utf8")).toMatch(/^draft: WP-10\.5$/m);
    expect(html).toMatch(/href="download\/"[^>]*>Download Focus Notes</);
    expect(html).toMatch(/href="demo\/"[^>]*>Try the demo</);
  });

  it("every page is the design system's document: light and dark by the visitor's setting, no script, one main heading, the site's links", async () => {
    for (const f of ["index.html", "help/index.html", "help/write/index.html", "privacy/index.html"]) {
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
    expect(await read(out, "help/write/index.html")).toMatch(/aria-current="page"[^>]*>Help</);
  });

  it("HLP-03, PRV-01: every link resolves, and nothing names another origin but links to GitHub", async () => {
    expect(await checkSite(out, { assume: ["app/", "documentations/"] })).toEqual([]);
  });

  it("HLP-02: an article is at help/<category>/<id>/ with its category, Applies to, the date and release; a wrong category fails the build", async () => {
    const src = join(tmp, "content");
    await cp(content, src, { recursive: true });
    await mkdir(join(src, "help", "get-started"), { recursive: true });
    await writeFile(join(src, "help", "get-started", "connect-github.md"), "---\nid: connect-github\ntitle: Connect your GitHub account\ntype: how-to\ncategory: get-started\nappliesTo: [Desktop app on Windows, macOS, Linux]\nupdated: 2026-10-16\nrelease: 0.9.0\n---\n# Connect your GitHub account\n\nSign in once, and Focus Notes backs up your notes.\n");
    const o = join(tmp, "with-article");
    await buildSite({ content: src, out: o, renderer: { renderSite } });
    const html = await read(o, "help/get-started/connect-github/index.html");
    expect(html).toMatch(/<title>Connect your GitHub account · Focus Notes<\/title>/);
    expect(html).toMatch(/Applies to: Desktop app on Windows, macOS, Linux/);
    expect(html).toMatch(/Updated October 16, 2026, for Focus Notes 0\.9\.0/);
    expect(html).toMatch(/href="\.\.\/"[^>]*>Get started</);
    expect(await read(o, "help/index.html")).toMatch(/href="get-started\/connect-github\/"/);
    expect(await read(o, "help/get-started/index.html")).toMatch(/href="connect-github\/"/);
    expect(await checkSite(o, { assume: ["app/", "documentations/"] })).toEqual([]);

    await writeFile(join(src, "help", "get-started", "connect-github.md"), "---\nid: connect\n---\n# Hi\n");
    await expect(buildSite({ content: src, out: join(tmp, "bad"), renderer: { renderSite } })).rejects.toThrow(/its id is "connect"/);
    await rm(join(src, "help", "get-started", "connect-github.md"));
    await writeFile(join(src, "help", "get-started", "Connect GitHub.md"), "# Hi\n");
    await expect(buildSite({ content: src, out: join(tmp, "bad2"), renderer: { renderSite } })).rejects.toThrow(/isn't a usable article ID/);
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

  it("the Deploy app workflow builds the app to read the notes from the site's root, builds the site, then publishes the notes at the root", () => {
    const wf = yaml.load(readFileSync(join(root, ".github", "workflows", "pages.yml"), "utf8"));
    const steps = wf.jobs.build.steps;
    const at = (re) => steps.findIndex((s) => re.test(s.name ?? ""));
    expect(steps[at(/Build the web app/)].run).toBe("pnpm --filter @focus-notes/web run build");
    // The web app's build includes dist-app/: the app built to read the notes from the folder above it.
    expect(JSON.parse(readFileSync(join(root, "apps", "web", "package.json"), "utf8")).scripts.build).toMatch(/vite build --config vite\.config\.ts --mode app/);
    const site = steps[at(/Build the product site/)];
    expect(site.run).toMatch(/node tools\/site\/build\.mjs --out _site --app apps\/web\/dist-app /);
    expect(site.run).toMatch(/--site-url "\$SITE_URL\/"/);
    expect(at(/Build the product site/)).toBeGreaterThan(at(/Build the web app/));
    expect(at(/Build the product site/)).toBeGreaterThan(steps.findIndex((s) => s.id === "pages"));
    expect(at(/Publish the notes/)).toBeGreaterThan(at(/Build the product site/));
    expect(steps[at(/Publish the notes/)].run).toMatch(/--site _site /);
  });

  it("the content's folders: the landing page, plain pages, and the help centre's categories", async () => {
    const c = await readContent(content);
    expect(c.pages.map((p) => p.path)).toEqual(["download/", "privacy/", "demo/"]);
    expect(c.categories).toHaveLength(8);
  });
});

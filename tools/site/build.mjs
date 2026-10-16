/**
 * The product site's builder (WP-10.1, HLP-08, D-167). Reads the content in site/ (the landing page,
 * plain pages, and the help centre's categories and articles), renders every page through the site's
 * renderer (apps/web/site/render.ts, built to apps/web/dist-site/), and assembles the site:
 *
 *   /            the landing page            /help/…     the help centre
 *   /demo/       the demo (WP-10.6)          /download/, /privacy/
 *   /app/        the owner's Focus Notes, which / served before D-167
 *   /s/          the share reader, where share links have always pointed
 *
 * The publisher (packages/seal) then adds /n/, the notes and the sealed files at the root, where the
 * share reader and /app/ read them (the web app's dist-app/, built with `--mode app`).
 *
 *   node tools/site/build.mjs --out _site [--content site] [--renderer apps/web/dist-site]
 *     [--app apps/web/dist-app] [--site-url https://…/] [--assume documentations/ …]
 *
 * It fails when a page links to an address the site doesn't have, or loads anything from another origin.
 */
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** Plain pages: site/<name>.md at /<name>/. */
export const SITE_PAGES = ["download", "privacy", "demo"];
/** The only other origin a site page may link to (help-writing.md → Links); nothing may be loaded from one. */
export const LINK_ORIGINS = ["https://github.com"];

const exists = (p) => stat(p).then(() => true, () => false);
const isDir = (p) => stat(p).then((s) => s.isDirectory(), () => false);

/** The site's content, read from its folder. */
export async function readContent(dir) {
  const landing = await readFile(join(dir, "index.md"), "utf8");
  const pages = [];
  for (const name of SITE_PAGES) pages.push({ path: `${name}/`, markdown: await readFile(join(dir, `${name}.md`), "utf8") });
  const categories = JSON.parse(await readFile(join(dir, "help", "categories.json"), "utf8"));
  const articles = [];
  for (const c of categories) {
    const folder = join(dir, "help", c.id);
    if (!(await isDir(folder))) continue;
    for (const f of (await readdir(folder)).sort()) if (f.endsWith(".md")) articles.push({ category: c.id, id: f.slice(0, -3), markdown: await readFile(join(folder, f), "utf8") });
  }
  return { landing, pages, categories, articles };
}

/**
 * Builds the site into `out`. `renderer` is the built module's folder (render.mjs and assets/), or,
 * in tests, `{ renderSite }` itself with no assets.
 */
export async function buildSite({ content = "site", out, renderer = "apps/web/dist-site", app, siteUrl, log = () => {} }) {
  const built = typeof renderer === "string";
  const render = built ? await import(pathToFileURL(resolve(renderer, "render.mjs")).href) : renderer;
  const assetFiles = built ? await readdir(join(renderer, "assets")) : [];
  await mkdir(out, { recursive: true });
  if (built) await cp(join(renderer, "assets"), join(out, "assets"), { recursive: true });
  const assets = { css: assetFiles.filter((f) => f.endsWith(".css")), fonts: assetFiles.filter((f) => /\.woff2?$/.test(f)) };

  const files = render.renderSite(await readContent(content), { assets, ...(siteUrl ? { siteUrl } : {}) });
  for (const f of files) {
    const target = join(out, ...f.file.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.html);
  }
  if (await isDir(join(content, "media"))) await cp(join(content, "media"), join(out, "media"), { recursive: true, filter: (p) => !p.endsWith(".gitkeep") });
  if (app) await placeApp(app, out);
  log(`Built ${files.length} site pages${app ? ", with the app at app/" : ""}.`);
  return files;
}

/**
 * The web app at /app/ (D-167), and its share reader at /s/, where share links have always pointed:
 * the same page, with its scripts and styles read from the app's assets.
 */
export async function placeApp(app, out) {
  await cp(app, join(out, "app"), { recursive: true, filter: (p) => relative(app, p).split(sep)[0] !== "s" });
  if (await exists(join(app, "s", "index.html"))) {
    const page = (await readFile(join(app, "s", "index.html"), "utf8")).replace(/(["'])\.\.\/(assets\/|favicon\.svg)/g, "$1../app/$2");
    await mkdir(join(out, "s"), { recursive: true });
    await writeFile(join(out, "s", "index.html"), page);
  }
}

const HTML_REF = /\s(href|src)="([^"]*)"/g;
const CSS_REF = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
const ANY_URL = /(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'<>)]*/gi;
const ROOT_PAGES = new Set(["index.html", ...SITE_PAGES.map((p) => `${p}/index.html`)]);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
/** The site's own pages and stylesheets: the landing page, plain pages, the help centre, and the assets' CSS. */
export async function siteFiles(out) {
  const found = [];
  for await (const p of walk(out)) {
    const rel = relative(out, p).split(sep).join("/");
    if (ROOT_PAGES.has(rel) || (rel.startsWith("help/") && rel.endsWith(".html")) || (rel.startsWith("assets/") && rel.endsWith(".css"))) found.push(rel);
  }
  return found.sort();
}

/**
 * Every link and reference on the site's pages resolves to a file in `out`, or to an address another
 * step adds (`assume`, like documentations/); links to other origins go only to LINK_ORIGINS, and
 * nothing is loaded from another origin (PRV-01, HLP-03, HLP-08). Returns the problems.
 */
export async function checkSite(out, { assume = [], siteUrl } = {}) {
  const problems = [];
  for (const rel of await siteFiles(out)) {
    const body = await readFile(join(out, rel), "utf8");
    const css = rel.endsWith(".css");
    const refs = css
      ? [...body.matchAll(CSS_REF)].map((m) => ({ attr: "src", url: m[1] }))
      : [...body.matchAll(HTML_REF)].map((m) => ({ attr: m[1], url: m[2].replace(/&amp;/g, "&") }));
    const canonical = css ? undefined : /<link rel="canonical" href="([^"]*)"/.exec(body)?.[1];
    for (const { attr, url } of refs) {
      if (url === canonical) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) {
        const origin = new URL(url, "https://site.invalid/").origin;
        if (attr === "src" || !LINK_ORIGINS.includes(origin)) problems.push(`${rel}: ${attr === "src" ? "loads" : "links to"} another origin: ${url}`);
        continue;
      }
      if (url.startsWith("#")) {
        if (url.length > 1 && !body.includes(`id="${decodeURIComponent(url.slice(1))}"`)) problems.push(`${rel}: no anchor ${url}`);
        continue;
      }
      const target = new URL(url, `https://site.invalid/${rel}`);
      const path = decodeURIComponent(target.pathname.slice(1));
      if (assume.some((a) => path.startsWith(a))) continue;
      const file = path === "" || path.endsWith("/") ? `${path}index.html` : path;
      if (!(await exists(join(out, ...file.split("/"))))) { problems.push(`${rel}: ${url} doesn't resolve (${file})`); continue; }
      if (target.hash.length > 1 && file.endsWith(".html")) {
        const other = await readFile(join(out, ...file.split("/")), "utf8");
        if (!other.includes(`id="${decodeURIComponent(target.hash.slice(1))}"`)) problems.push(`${rel}: ${url} has no anchor ${target.hash}`);
      }
    }
    // Any other address in a page's or stylesheet's text: nothing may name another origin outside a link to one it may.
    const linked = new Set(refs.filter((r) => r.attr === "href").map((r) => r.url));
    for (const [url] of body.matchAll(ANY_URL)) {
      if (url === canonical || (siteUrl && url.startsWith(siteUrl.replace(/\/$/, "")))) continue;
      if (linked.has(url) && LINK_ORIGINS.includes(new URL(url, "https://site.invalid/").origin)) continue;
      problems.push(`${rel}: names another origin: ${url}`);
    }
  }
  return problems;
}

function parseArgs(argv) {
  const o = { assume: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "assume") o.assume.push(argv[++i]);
    else if (k === "clean") o.clean = true;
    else o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const o = parseArgs(process.argv.slice(2));
  if (!o.out) {
    console.error("Usage: node tools/site/build.mjs --out <folder> [--clean] [--content site] [--renderer apps/web/dist-site] [--app apps/web/dist-app] [--site-url <url>] [--assume <path>]…");
    process.exit(2);
  }
  if (o.clean) await rm(o.out, { recursive: true, force: true });
  await buildSite({ ...o, log: console.log });
  const problems = await checkSite(o.out, { assume: o.assume, siteUrl: o.siteUrl });
  for (const p of problems) console.error(`✗ ${p}`);
  if (problems.length) { console.error(`The site check failed: ${problems.length} problem(s).`); process.exit(1); }
  console.log("The site check passed: every link resolves, and nothing loads from another origin.");
}

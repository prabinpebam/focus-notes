/**
 * WP-10.1: the product site (HLP-08, D-167). The site's builder (tools/site/build.mjs) assembles the
 * site from site/ with the owner's app at /app/ (dist-app/), the publisher adds the fixture instance's
 * notes, pages and sealed files at the root, and a plain static server serves it like GitHub Pages.
 * Every page passes axe in light and dark and requests nothing from another origin; every link on
 * it resolves; the landing page meets the public pages' lab budgets (PRF-12); and the app still works
 * at /app/, with public notes, the vault and the share reader read from the root.
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { publish } from "../../../packages/seal/src/publish.ts";
import { buildSite, checkSite } from "../../../tools/site/build.mjs";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff",
  ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
};
const web = join(import.meta.dirname, "..");
const repo = join(web, "..", "..");
const PAGES = ["", "help/", "help/write/", "help/fix-a-problem/", "demo/", "download/", "privacy/"];
const PASSPHRASE = "correct horse battery staple";
let site = "";
let server: Server;
let origin = "";

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "fn-site-e2e-"));
  // In this order, as the Deploy app workflow does: the docs, the site with the app, then the notes.
  await cp(join(repo, "documentations", "index.html"), join(site, "documentations", "index.html"));
  await buildSite({ content: join(repo, "site"), out: site, renderer: join(web, "dist-site"), app: join(web, "dist-app") });
  await publish({ site, notes: join(import.meta.dirname, "fixture", "notes"), private: join(import.meta.dirname, "fixture", "private"), owner: "octo", reader: join(web, "dist-reader") });
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^([\\/])+/, "");
    let file = join(site, path);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
test.afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(site, { recursive: true, force: true });
});

/** Every request the page makes, by origin; anything not from the site itself fails the test (PRV-01). */
function watch(page: Page) {
  const others: string[] = [];
  page.on("request", (r) => { if (new URL(r.url()).origin !== origin) others.push(r.url()); });
  return others;
}

test("HLP-03, PRV-01: the built site's links all resolve and it names no other origin but links to GitHub", async () => {
  expect(await checkSite(site, { assume: ["documentations/"] })).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`HLP-08, A11Y-01: every site page passes axe in ${colorScheme}, follows the visitor's scheme, and requests nothing from another origin`, async ({ page }) => {
    const others = watch(page);
    await page.emulateMedia({ colorScheme });
    const backgrounds = new Set<string>();
    for (const path of PAGES) {
      await page.goto(`${origin}/${path}`);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("navigation", { name: "Focus Notes site" })).toBeVisible();
      expect(await axeViolations(page), `${path || "/"} in ${colorScheme}`).toEqual([]);
      backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
      // Readable at 320 px: nothing scrolls sideways.
      await page.setViewportSize({ width: 320, height: 640 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path || "/"} at 320 px`).toBeLessThanOrEqual(320);
      await page.setViewportSize({ width: 1100, height: 780 });
    }
    // One background throughout, the scheme's own.
    expect(backgrounds.size).toBe(1);
    const [bg] = [...backgrounds];
    const lum = bg!.match(/\d+/g)!.slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
    expect(colorScheme === "dark" ? lum < 128 : lum > 128, `${bg} in ${colorScheme}`).toBe(true);
    expect(others).toEqual([]);
  });
}

test("the site's navigation reaches each address, the skip link goes to the content, and the current page is marked", async ({ page }) => {
  await page.goto(`${origin}/`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const nav = page.getByRole("navigation", { name: "Focus Notes site" });
  await nav.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(`${origin}/help/`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Help centre");
  await expect(nav.getByRole("link", { name: "Help" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Fix a problem" }).click();
  await expect(page).toHaveURL(`${origin}/help/fix-a-problem/`);
  await page.getByRole("link", { name: "Download" }).first().click();
  await expect(page).toHaveURL(`${origin}/download/`);
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(`${origin}/privacy/`);
  await page.getByRole("link", { name: "Focus Notes", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  // The landing page's sections, in the specification's order, each with its anchor.
  expect(await page.locator("main section[id]").evaluateAll((s) => s.map((e) => e.id))).toEqual(["start", "spotlight", "themes", "light-and-dark", "files", "get-focus-notes"]);
});

test("PRF-12: the landing page's LCP, INP and CLS on a throttled profile", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  // About a mid-range phone on a slow 4G connection, as the public pages are measured.
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto(`${origin}/`, { waitUntil: "load" });
  const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href.split("/").at(-1)!.replace(/-[\w-]{8}\.woff2$/, "")));
  expect(preloads).toEqual([]);
  await page.getByRole("heading", { level: 1 }).click();
  const m = await page.evaluate(() => new Promise<{ lcp: number; cls: number; inp: number }>((resolve) => {
    let lcp = 0, cls = 0, inp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = Math.max(lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) inp = Math.max(inp, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    setTimeout(() => resolve({ lcp, cls, inp }), 500);
  }));
  console.log(`Landing page lab metrics: LCP ${Math.round(m.lcp)} ms, INP ${Math.round(m.inp)} ms, CLS ${m.cls.toFixed(3)}`);
  expect(m.lcp).toBeGreaterThan(0);
  expect(m.lcp).toBeLessThanOrEqual(2500);
  expect(m.inp).toBeLessThanOrEqual(200);
  expect(m.cls).toBeLessThanOrEqual(0.1);
});

test("D-167: the owner's app works at /app/, reading the public notes and the vault from the site's root", async ({ page }) => {
  const others = watch(page);
  await page.goto(`${origin}/app/`);
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText(/Garden log|Reading list/);
  await expect(editor).toHaveAttribute("aria-readonly", "true");
  const corner = page.getByRole("region", { name: "Account" });
  await corner.getByRole("button", { name: "Unlock" }).click();
  const dialog = page.getByRole("dialog", { name: "Unlock private notes" });
  await dialog.getByLabel("Passphrase").fill(PASSPHRASE);
  await dialog.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.keyboard.press("Control+p");
  const open = page.getByRole("dialog", { name: "Spotlight" });
  await expect(open.getByRole("option", { name: /Launch plan/ })).toBeVisible();
  expect(others).toEqual([]);
});

test("D-167: public note pages stay at /n/ and the share reader at /s/, where their links have always pointed", async ({ page }) => {
  const others = watch(page);
  await page.goto(`${origin}/n/Guides/Garden/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Garden log");
  await page.goto(`${origin}/n/`);
  await expect(page.getByRole("link", { name: "Garden log" })).toBeVisible();
  await page.goto(`${origin}/s/`);
  await expect(page.getByRole("heading", { name: "This note is private" })).toBeVisible();
  expect(others).toEqual([]);
});

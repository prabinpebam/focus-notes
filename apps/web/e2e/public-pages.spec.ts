/**
 * WP-5.1: public note pages. The publisher builds a fixture site (e2e/fixture-pages) with the page
 * renderer, served by a plain static server, and headless Chromium loads its pages: read-only notes
 * at stable /n/<path>/ URLs (SHR-03), light or dark by the reader's preference and readable at 320 px
 * (SHR-06), no cookies, nothing from another origin, and noindex by front matter (PRV-04), and lab
 * Core Web Vitals on a throttled profile (PRF-12).
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { publish } from "../../../packages/seal/src/publish.ts";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".md": "text/markdown; charset=utf-8" };
let site = "";
let server: Server;
let origin = "";

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "fn-pages-"));
  const result = await publish({ site, notes: join(import.meta.dirname, "fixture-pages", "notes"), owner: "octo", reader: join(import.meta.dirname, "..", "dist-reader"), siteUrl: "https://octo.github.io/notes/", build: "e2e" });
  expect(result.publicPages).toBe(2);
  // Like GitHub Pages: a folder serves its index.html.
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^([\\/])+/, "");
    let file = join(site, path);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
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

const PAGE = "/n/Essays/On%20focus/";
const requests = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  return urls;
};

test("SHR-03: a public note is a read-only page at its stable URL, with its canonical link", async ({ page }) => {
  await page.goto(origin + PAGE);
  await expect(page).toHaveTitle("On focus");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["On focus"]);
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", "https://octo.github.io/notes/n/Essays/On%20focus/");
  await expect(page.getByText(/^Updated /)).toBeVisible();
  await expect(page.getByRole("contentinfo")).toHaveText("Published with Focus Notes");
  // Nothing is editable, and no script exists on the page.
  await expect(page.locator("[contenteditable], textarea, script")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Turn off notifications" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Turn off notifications" })).toBeDisabled();
  // A note's HTML is shown as text, never run (SEC-02).
  await expect(page.getByText('<script>alert("never runs")</script>')).toBeVisible();
  // A link to another public note goes to its page; one to a private note is plain text.
  await page.getByRole("link", { name: "the index" }).click();
  await expect(page).toHaveURL(`${origin}/n/Index/`);
  await page.goBack();
  await expect(page.getByRole("link", { name: "a private plan" })).toHaveCount(0);
  // The skip link is the first stop and lands on the note.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the note" })).toBeFocused();
});

test("SHR-06: pages follow light or dark, read at 320 px, and have no axe violations", async ({ page }) => {
  const backgrounds: string[] = [];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1100, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(origin + PAGE);
      expect(await axeViolations(page), `${colorScheme} at ${width} px`).toEqual([]);
      // Nothing spills sideways: wide tables and code scroll inside their own frame.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  expect(backgrounds[0]).not.toBe(backgrounds[1]);
});

test("PRV-04: no cookies, nothing from another origin, and noindex from front matter", async ({ page, context }) => {
  const urls = requests(page);
  await page.goto(origin + PAGE);
  await page.waitForLoadState("networkidle");
  expect(urls.length).toBeGreaterThan(1);
  expect(urls.filter((u) => !u.startsWith(origin))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await page.goto(origin + "/n/Index/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});

const shots = process.env.FOCUS_NOTES_PUBLIC_SHOTS;
test("D-139: the index at /n/ lists each public note as a row (title, last updated, excerpt if given), light and dark at 320 px, no cookies or other origins", async ({ page, context }) => {
  const urls = requests(page);
  await page.goto(origin + "/n/");
  await expect(page).toHaveTitle("Notes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(["Notes"]);
  await expect(page.getByText("2 public notes")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
  expect((await page.getByRole("heading", { level: 2 }).allTextContents()).sort()).toEqual(["Index", "On focus"]);
  await expect(page.getByText(/^Updated /)).toHaveCount(2);
  // Only the note whose front matter gives an excerpt shows one.
  await expect(page.getByText("Why attention grows what you water.")).toBeVisible();
  await expect(page.getByText("Everything published here.")).toHaveCount(0);
  await expect(page.locator("[contenteditable], textarea, script")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(urls.filter((u) => !u.startsWith(origin))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1100, 320]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto(origin + "/n/");
      expect(await axeViolations(page), `${colorScheme} at ${width} px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (shots) await page.screenshot({ path: join(shots, `index-${colorScheme}-${width}.png`), fullPage: true });
    }
  }
  // Each title goes to its note's page.
  await page.getByRole("link", { name: "On focus" }).click();
  await expect(page).toHaveURL(origin + PAGE);
});

test("PRF-12: LCP, INP, and CLS on a throttled profile, and only the first screen's fonts preloaded", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  // About a mid-range phone on a slow 4G connection.
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto(origin + PAGE, { waitUntil: "load" });
  // Preloads: the regular and bold faces, and italic, which the first screen uses; never more.
  const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href.split("/").at(-1)!.replace(/-[\w-]{8}\.woff2$/, "")));
  expect(preloads.sort()).toEqual(["roboto-mono-latin-400-italic", "roboto-mono-latin-400-normal", "roboto-mono-latin-700-normal"]);
  // An interaction, for INP: tap the page and select a word.
  await page.getByText("Quiet is a skill").click();
  const m = await page.evaluate(() => new Promise<{ lcp: number; cls: number; inp: number }>((resolve) => {
    let lcp = 0, cls = 0, inp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = Math.max(lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) inp = Math.max(inp, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    setTimeout(() => resolve({ lcp, cls, inp }), 500);
  }));
  console.log(`Public page lab metrics: LCP ${Math.round(m.lcp)} ms, INP ${Math.round(m.inp)} ms, CLS ${m.cls.toFixed(3)}`);
  expect(m.lcp).toBeGreaterThan(0);
  expect(m.lcp).toBeLessThanOrEqual(2500);
  expect(m.inp).toBeLessThanOrEqual(200);
  expect(m.cls).toBeLessThanOrEqual(0.1);
});

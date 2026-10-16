/**
 * WP-10.6: the demo at /demo/ (D-177). The site's builder places the web app's demo build there; it
 * opens light on the sample notes, kept in the visitor's browser: what's typed is there after a
 * reload, Reset demo puts the sample notes back, and nothing is requested from another origin. A
 * quiet banner says it's a demo. Axe-clean in light and dark, and usable at 390 px.
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { buildSite } from "../../../tools/site/build.mjs";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
};
const web = join(import.meta.dirname, "..");
const repo = join(web, "..", "..");
let site = "";
let server: Server;
let origin = "";

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "fn-demo-e2e-"));
  await cp(join(repo, "documentations", "index.html"), join(site, "documentations", "index.html"));
  await buildSite({ content: join(repo, "site"), out: site, renderer: join(web, "dist-site"), app: join(web, "dist-app"), demo: join(web, "dist-demo") });
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

const editor = (page: Page) => page.getByRole("textbox", { name: "Note" });
const corner = (page: Page) => page.getByRole("region", { name: "Account" });
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
function watch(page: Page) {
  const others: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("data:") && new URL(r.url()).origin !== origin) others.push(r.url()); });
  return others;
}
async function openDemo(page: Page) {
  const started = Date.now();
  await page.goto(`${origin}/demo/`);
  await expect(editor(page)).toContainText("Welcome to the demo");
  return Date.now() - started;
}

test("D-177: the demo opens light on the sample notes, keeps what's typed after a reload, and Reset demo puts the notes back; nothing goes to another origin", async ({ browser }) => {
  // The visitor's system is dark: the demo still opens light, as the owner prefers.
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  const others = watch(page);
  const opened = await openDemo(page);
  console.log(`[D-177] /demo/ open to first note: ${opened} ms`);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("paper");
  // The quiet banner: it's a demo, with Download and Reset demo.
  await expect(corner(page).getByRole("button", { name: "Demo: notes stay in this browser" })).toBeVisible();
  await expect(corner(page).getByRole("button", { name: "Download" })).toBeVisible();
  const reset = corner(page).getByRole("button", { name: "Reset demo" });
  await expect(reset).toBeVisible();
  // Notes and folders, in a Private and a Public root.
  await page.keyboard.press("Control+o");
  const tree = page.getByRole("tree", { name: "Notes and folders" });
  await expect(tree.getByRole("treeitem", { name: /^Private/ })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /^Public/ })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /^Garden/ })).toBeVisible();
  await page.keyboard.press("Escape");
  // Typed text is kept in the browser.
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Typed in the demo.");
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(editor(page)).toContainText("Typed in the demo.");
  // Reset demo: the sample notes as they were.
  await corner(page).getByRole("button", { name: "Reset demo" }).click();
  await expect(editor(page)).toContainText("Welcome to the demo");
  await expect(editor(page)).not.toContainText("Typed in the demo.");
  expect(others).toEqual([]);
  await context.close();
});

for (const scheme of ["light", "dark"] as const) {
  test(`D-177: the demo has no axe violations in ${scheme}, and works at 390 px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: scheme });
    const page = await context.newPage();
    await openDemo(page);
    if (scheme === "dark") {
      // The visitor switched to follow the system, which is dark (as Theme manager → System does).
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("focus-notes-demo");
        r.onsuccess = () => {
          const tx = r.result.transaction("meta", "readwrite");
          const meta = tx.objectStore("meta");
          const get = meta.get("appState");
          get.onsuccess = () => meta.put({ ...(get.result ?? { version: 1 }), appearance: "system" }, "appState");
          tx.oncomplete = () => { r.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        r.onerror = () => reject(r.error);
      }));
      await page.reload();
      await expect(editor(page)).toContainText("Welcome to the demo");
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("ink");
    }
    await settled(page);
    expect(await axeViolations(page)).toEqual([]);
    // Nothing spills sideways at 390 px; the banner's buttons are inside the window.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const box = await corner(page).getByRole("button", { name: "Reset demo" }).boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(390);
    await context.close();
  });
}

/**
 * WEB-01 (D-292, D-412): safe one-time IndexedDB draft export and retirement of browser writing.
 * Asserts the user-visible outcome in the built site:
 * - drafts in `focus-notes` and `focus-notes-demo` show the approved export prompt and download a valid bundle
 * - failed export preserves all drafts in IndexedDB and succeeds on retry
 * - no drafts skips the export step and redirects /app/ to /#download with no editor or vault
 * - public pages (/n/) and the share reader (/s/) stay intact, with zero third-party requests
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { parseBundle } from "../../../packages/core/src/notes.ts";
import { publish } from "../../../packages/seal/src/publish.ts";
import { buildSite } from "../../../tools/site/build.mjs";
import { axeViolations } from "../../desktop/e2e/axe.ts";
import { staticResponse } from "./static-response.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff",
  ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
};
const web = join(import.meta.dirname, "..");
const repo = join(web, "..", "..");
let site = "";
let server: Server;
let origin = "";

test.beforeAll(async () => {
  site = await mkdtemp(join(tmpdir(), "fn-web-retire-e2e-"));
  await cp(join(repo, "documentations", "index.html"), join(site, "documentations", "index.html"));
  await buildSite({ content: join(repo, "site"), out: site, renderer: join(web, "dist-site"), app: join(web, "dist-app") });
  await publish({ site, notes: join(import.meta.dirname, "fixture", "notes"), private: join(import.meta.dirname, "fixture", "private"), owner: "octo", reader: join(web, "dist-reader") });
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^([\\/])+/, "");
    let file = join(site, path);
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      staticResponse(req, res, TYPES[extname(file)] ?? "application/octet-stream", await readFile(file));
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

function watch(page: Page) {
  const others: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("blob:") && !url.startsWith("data:") && new URL(url).origin !== origin) others.push(url);
  });
  return others;
}

async function seedLegacyDrafts(page: Page) {
  // Visit the origin first so IndexedDB is scoped to this site.
  await page.goto(`${origin}/privacy/`);
  await page.evaluate(async () => {
    const putAll = (dbName: string, rows: { path: string; text: string; updated: number; deleted?: boolean }[]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "path" });
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("notes", "readwrite");
          const store = tx.objectStore("notes");
          for (const row of rows) store.put(row);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        };
        open.onerror = () => reject(open.error);
      });

    await putAll("focus-notes", [
      { path: "Welcome.md", text: "# Browser note\nSaved in the old web app.", updated: 1_700_000_000_000 },
      { path: "Ideas.md", text: "# Ideas\nKeep these thoughts.", updated: 1_700_000_010_000 },
      { path: "Deleted.md", text: "# Deleted", updated: 1_700_000_020_000, deleted: true },
    ]);
    await putAll("focus-notes-demo", [
      { path: "Welcome.md", text: "# Demo note\nEdited in the old demo.", updated: 1_700_000_030_000 },
    ]);
  });
}

async function countStoredNotes(page: Page, dbName: string): Promise<number> {
  return page.evaluate((name) => new Promise<number>((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("notes")) { db.close(); resolve(0); return; }
      const req = db.transaction("notes", "readonly").objectStore("notes").getAll();
      req.onsuccess = () => { db.close(); resolve((req.result as { deleted?: boolean }[]).filter((n) => !n.deleted).length); };
      req.onerror = () => { db.close(); reject(req.error); };
    };
    open.onerror = () => reject(open.error);
  }), dbName);
}

test("WEB-01, D-292, D-412: drafts in IndexedDB show the one-time export, download a valid bundle, keep drafts intact, and pass axe", async ({ page }) => {
  const others = watch(page);
  await seedLegacyDrafts(page);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`${origin}/app/`);
    await expect(page.getByRole("heading", { level: 1, name: "Save your browser drafts before browser writing is removed." })).toBeVisible();
    await expect(page.getByText("3 drafts in this browser")).toBeVisible();
    await expect(page.locator("[contenteditable]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Unlock" })).toHaveCount(0);
    expect(await axeViolations(page), `webExport in ${colorScheme}`).toEqual([]);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export drafts" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^focus-notes-export-\d{4}-\d{2}-\d{2}\.json$/);
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();
  const bundle = parseBundle(await readFile(savedPath!, "utf8"));
  expect(bundle.notes.map((n) => n.path)).toEqual(["demo/Welcome.md", "Ideas.md", "Welcome.md"]);
  expect(bundle.notes.find((n) => n.path === "Welcome.md")?.text).toContain("Saved in the old web app.");
  expect(bundle.notes.find((n) => n.path === "demo/Welcome.md")?.text).toContain("Edited in the old demo.");

  await expect(page.getByText("Exported 3 drafts to your Downloads folder.")).toBeVisible();
  expect(await countStoredNotes(page, "focus-notes")).toBe(2);
  expect(await countStoredNotes(page, "focus-notes-demo")).toBe(1);

  await page.getByRole("button", { name: "Download Focus Notes" }).click();
  await expect(page).toHaveURL(`${origin}/#download`);
  expect(others).toEqual([]);
});

test("WEB-01, D-292: failed export keeps every draft intact and succeeds on Try again", async ({ page }) => {
  await seedLegacyDrafts(page);
  await page.addInitScript(() => {
    const orig = URL.createObjectURL.bind(URL);
    let failedOnce = false;
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (!failedOnce) {
        failedOnce = true;
        throw new Error("Simulated download failure");
      }
      return orig(obj);
    };
  });

  await page.goto(`${origin}/app/`);
  await expect(page.getByText("3 drafts in this browser")).toBeVisible();
  await page.getByRole("button", { name: "Export drafts" }).click();

  await expect(page.getByText("Couldn't export your drafts. Try again.")).toBeVisible();
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeVisible();
  expect(await countStoredNotes(page, "focus-notes")).toBe(2);
  expect(await countStoredNotes(page, "focus-notes-demo")).toBe(1);

  const downloadPromise = page.waitForEvent("download");
  await retry.click();
  const download = await downloadPromise;
  const bundle = parseBundle(await readFile((await download.path())!, "utf8"));
  expect(bundle.notes).toHaveLength(3);
  await expect(page.getByText("Exported 3 drafts to your Downloads folder.")).toBeVisible();
});

test("WEB-01, D-292: with no browser drafts, /app/ skips export and goes to /#download while /n/ and /s/ stay intact", async ({ page }) => {
  const others = watch(page);
  await page.goto(`${origin}/app/`);
  await expect(page).toHaveURL(`${origin}/#download`);
  await expect(page.locator("[contenteditable]")).toHaveCount(0);

  await page.goto(`${origin}/n/Guides/Garden/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Garden log");
  await page.goto(`${origin}/s/`);
  await expect(page.getByRole("heading", { name: "This note is private" })).toBeVisible();
  expect(others).toEqual([]);
});

/**
 * WP-9.6, IMG-06: a code-shared note's image in the share reader. The real publisher seals the note and
 * its image into a copy of the built app; the reader decrypts the image in the page and shows it from a
 * data: URL, so nothing ever requests it by its private path. Withdrawn, the share no longer opens.
 */
import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { publish } from "../../../packages/seal/src/publish.ts";
import { randomBytes, toB64url } from "../../../packages/seal/src/format.ts";
import { sharedImageDestinations } from "../../desktop/src/main/share/media.ts";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json" };
const ERROR = "That didn't open anything. Check the access code or link and try again. If it still doesn't work, ask the person who shared it with you.";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ID = "sbbbbbbbbbbbbbbbb", SECRET = toB64url(randomBytes(32)), SALT = toB64url(randomBytes(16));

let root = "", site = "", origin = "";
let server: Server;
const served: string[] = [];

const grant = (withdrawn: boolean) => ({
  id: ID, name: "", shareCode: "M3QK7DRP", salt: SALT, link: { secret: SECRET }, passcode: { value: "cedar silver meadow stone" },
  scope: { ids: ["n-lisbon"], notes: [], folders: [] }, item: { path: "Trips/Lisbon.md", label: "Lisbon", folder: false, includeLater: false },
  createdAt: "2026-11-01T00:00:00Z", ...(withdrawn ? { revokedAt: "2026-11-02T00:00:00Z" } : {}),
});
async function seal(withdrawn: boolean) {
  await writeFile(join(root, "private", "access.json"), JSON.stringify({ version: 1, grants: [grant(withdrawn)] }));
  return publish({ site, private: join(root, "private"), owner: "octo", media: sharedImageDestinations });
}

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "fn-share-media-"));
  site = join(root, "site");
  await cp(join(import.meta.dirname, "..", "dist"), site, { recursive: true });
  await mkdir(join(root, "private", "notes", "Trips"), { recursive: true });
  await mkdir(join(root, "private", "assets", "images"), { recursive: true });
  await writeFile(join(root, "private", "assets", "images", "q7m4k2.png"), PNG);
  await writeFile(join(root, "private", "notes", "Trips", "Lisbon.md"), "---\nid: n-lisbon\n---\n# Lisbon\n\n![Desk by the window](../../assets/images/q7m4k2.png)\n");
  expect((await seal(false)).shares).toBe(1);
  server = createServer(async (req, res) => {
    served.push(req.url ?? "");
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
  await rm(root, { recursive: true, force: true });
});

test("WP-9.6: a code-shared note shows its sealed image from data:, never requesting its private path; withdrawn, it no longer opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/^Applying inline style violates/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${origin}/s/#${ID}.${SECRET}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lisbon");
  const image = page.getByRole("main").getByRole("img", { name: "Desk by the window", exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth === 1)).toBe(true);
  expect(await image.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  expect(served.filter((url) => /q7m4k2|assets\/images|Lisbon|Trips/i.test(decodeURIComponent(url)))).toEqual([]);
  expect(errors).toEqual([]);

  await seal(true);
  await page.goto("about:blank");
  await page.goto(`${origin}/s/#${ID}.${SECRET}`);
  await expect(page.getByText(ERROR)).toBeVisible();
  await expect(page.getByRole("img", { name: "Desk by the window" })).toHaveCount(0);
});

/**
 * WP-5.4: the share reader at s/ (SHR-10, SHR-06, PRF-05, PRV-04, D-125). The real publisher seals a
 * fixture's private notes for share grants into a copy of the built app, served by a plain static
 * server, and headless Chromium opens what each grant shares: with a magic link, whose secret leaves
 * the address bar at once, or with a name (any case or spacing) and a passcode. Wrong, expired, and
 * withdrawn grants all get the one generic error; nothing outside a grant's scope is reachable; the
 * page is accessible, light and dark, readable at 320 px, sets no cookies, asks no other origin, and
 * loads 300 KB or less of compressed JavaScript.
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { publish } from "../../../packages/seal/src/publish.ts";
import { randomBytes, toB64url } from "../../../packages/seal/src/format.ts";
import { axeViolations } from "../../desktop/e2e/axe.ts";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".svg": "image/svg+xml" };
const ERROR = "That didn't open anything. Check your name and passcode, or the link, and try again. If it still doesn't work, ask the person who shared it with you.";
const PASSCODE = "orbit maple quiet river";
const NOTES: Record<string, string> = {
  "Work/drafts/Plan.md": "---\nid: n-plan\n---\n# The plan\n\nLaunch quietly on a Tuesday. See [the detail](sub/Detail.md) and [the diary](../../Diary.md).\n",
  "Work/drafts/sub/Detail.md": "# Detail\n\nThe detail of the plan, for the team.\n",
  "Letters/To Asha.md": "---\nid: n-letter\n---\n# To Asha\n\nDear Asha, the garden is doing well.\n",
  "Diary.md": "# Diary\n\nA line only the owner may ever read.\n",
};
const secrets = { folder: toB64url(randomBytes(32)), note: toB64url(randomBytes(32)), withdrawn: toB64url(randomBytes(32)), expired: toB64url(randomBytes(32)), later: toB64url(randomBytes(32)) };
const salt = () => toB64url(randomBytes(16));
const grants = (laterWithdrawn: boolean) => [
  { id: "gfolder01", name: "Sam Lee", salt: SALTS[0], link: { secret: secrets.folder }, passcode: { value: PASSCODE }, scope: { folders: ["Work/drafts/"] }, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
  { id: "gnote0001", name: "Book club", salt: SALTS[1], link: { secret: secrets.note }, scope: { notes: ["n-letter"] }, createdAt: "2026-10-01T00:00:00Z" },
  { id: "gwithdrw1", name: "Old friend", salt: SALTS[2], link: { secret: secrets.withdrawn }, scope: { notes: ["n-letter"] }, createdAt: "2026-10-01T00:00:00Z", revokedAt: "2026-10-02T00:00:00Z" },
  { id: "gexpired1", name: "Late reader", salt: SALTS[3], link: { secret: secrets.expired }, scope: { notes: ["n-letter"] }, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-02T00:00:00Z" },
  { id: "gwithdr02", name: "Kim Park", salt: SALTS[4], link: { secret: secrets.later }, scope: { notes: ["n-letter"] }, createdAt: "2026-10-01T00:00:00Z", ...(laterWithdrawn ? { revokedAt: "2026-10-03T00:00:00Z" } : {}) },
];
const SALTS = [salt(), salt(), salt(), salt(), salt()];

let root = "";
let site = "";
let server: Server;
let origin = "";
const served: string[] = [];

async function seal(laterWithdrawn: boolean) {
  await writeFile(join(root, "private", "access.json"), JSON.stringify({ version: 1, nameSalt: "c2FsdHNhbHRzYWx0c2FsdA", grants: grants(laterWithdrawn) }));
  return publish({ site, private: join(root, "private"), owner: "octo" });
}

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "fn-share-"));
  site = join(root, "site");
  // The built app, as the Deploy app workflow has it before publishing: the share reader is its s/ page.
  await cp(join(import.meta.dirname, "..", "dist"), site, { recursive: true });
  for (const [p, t] of Object.entries(NOTES)) {
    await mkdir(join(root, "private", "notes", ...p.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(root, "private", "notes", ...p.split("/")), t);
  }
  expect((await seal(false)).shares).toBe(3);
  // Like GitHub Pages: a folder serves its index.html, and nothing sets a cookie.
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

const READER = "/s/";
const link = (id: string, secret: string) => `${READER}#${id}.${secret}`;
const main = (page: Page) => page.getByRole("main");
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  // react-aria adds a <style> for touch-action on pressable controls; the CSP blocks it, as in the app (D-125).
  page.on("console", (m) => { if (m.type() === "error" && !/^Applying inline style violates/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
};
async function signIn(page: Page, name: string, passcode = PASSCODE, button = "Open") {
  await page.getByRole("textbox", { name: "Your name" }).fill(name);
  await page.getByLabel("Passcode").fill(passcode);
  await page.getByRole("button", { name: button, exact: true }).click();
}
/** A try that fails: the passcode field empties once the answer is back. */
async function failedSignIn(page: Page, name: string, passcode = PASSCODE) {
  await signIn(page, name, passcode);
  await expect(page.getByLabel("Passcode")).toHaveValue("");
}
// Light and dark, wide and 320 px, saved for review when FOCUS_NOTES_SHARE_SHOTS names a folder.
async function shot(page: Page, name: string) {
  const dir = process.env.FOCUS_NOTES_SHARE_SHOTS;
  if (dir) await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

test("SHR-10: a magic link opens exactly its scope, and its secret leaves the address bar at once", async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(origin + link("gfolder01", secrets.folder));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  expect(new URL(page.url()).hash).toBe("");
  await expect(page).toHaveTitle("Private note");
  await expect(main(page).getByRole("link")).toHaveText(["Detail", "The plan"]);
  await main(page).getByRole("link", { name: "The plan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The plan");
  await expect(page.getByText(/^Updated /)).toBeVisible();
  // A link to another note in the share stays on the page; one to a note outside it is plain text.
  await expect(main(page).getByRole("link", { name: "the diary" })).toHaveCount(0);
  await main(page).getByRole("link", { name: "the detail" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Detail");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The plan");
  await page.getByRole("button", { name: "All shared notes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  // This tab keeps the session (a reload stays open); it's the derived key, never the secret.
  const stored = await page.evaluate(() => [sessionStorage.getItem("focus-notes.share"), localStorage.getItem("focus-notes.share")]);
  expect(stored[0]).toBeTruthy();
  expect(stored[0]).not.toContain(secrets.folder);
  expect(stored[1]).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  // The secret never reached the server: browsers don't send the fragment.
  expect(served.filter((u) => u.includes(secrets.folder))).toEqual([]);
  // A one-note share opens straight to it, with nothing to go back to.
  await page.goto(origin + link("gnote0001", secrets.note));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To Asha");
  await expect(page.getByRole("button", { name: "All shared notes" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("SHR-10: a name and passcode open their scope, whatever the name's case or spacing; the session is per tab unless remembered, and sign-out reaches every tab", async ({ page, context }) => {
  await page.goto(origin + READER);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This note is private");
  await expect(page.getByRole("textbox", { name: "Your name" })).toBeFocused();
  await signIn(page, "  sAM   lee ");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  await expect(main(page).getByRole("link")).toHaveText(["Detail", "The plan"]);
  // Another tab asks again: the session is this tab's only.
  const other = await context.newPage();
  await other.goto(origin + READER);
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("This note is private");
  // Remember on this device: a new tab opens it without asking.
  const remember = page.getByRole("button", { name: "Remember on this device" });
  await expect(remember).toHaveAttribute("aria-pressed", "false");
  await remember.click();
  await expect(remember).toHaveAttribute("aria-pressed", "true");
  await other.reload();
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  // Sign out in one tab signs out every tab, and forgets the session on this device.
  await other.getByRole("button", { name: "Sign out on this device" }).click();
  await expect(other.getByText("You're signed out on this device.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This note is private");
  await expect(page.getByText("You're signed out on this device.")).toBeVisible();
  expect(await page.evaluate(() => [sessionStorage.length, localStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This note is private");
  // Open and remember keeps it on this device from the start.
  await signIn(page, "Sam Lee", PASSCODE, "Open and remember");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  await expect(page.getByRole("button", { name: "Remember on this device" })).toHaveAttribute("aria-pressed", "true");
  await other.reload();
  await expect(other.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
});

test("SHR-06: wrong, expired, and withdrawn grants all show the one generic error", async ({ page }) => {
  const shown: string[] = [];
  const expectError = async () => {
    await expect(page.getByText(ERROR)).toBeVisible();
    shown.push(await main(page).innerText());
  };
  await page.goto(origin + READER);
  await failedSignIn(page, "Sam Lee", "orbit maple quiet rivers");
  await expectError();
  await failedSignIn(page, "Nobody Here");
  await expectError();
  await failedSignIn(page, "Book club");
  await expectError();
  for (const [id, secret] of [["gfolder01", secrets.note], ["gwithdrw1", secrets.withdrawn], ["gexpired1", secrets.expired], ["gnosuch01", secrets.folder]] as const) {
    await page.goto("about:blank");
    await page.goto(origin + link(id, secret));
    await expectError();
  }
  // Every failure reads the same, so none of them says whether a name, a link, or a note exists.
  expect(new Set(shown.map((s) => s.replace(/Your name|Passcode/g, ""))).size).toBe(1);
  // An empty field is asked for, not an error.
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByText("Enter your name and the passcode.")).toBeVisible();

  // A grant withdrawn after it was opened (and remembered) stops at the next publish.
  await page.goto(origin + link("gwithdr02", secrets.later));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To Asha");
  await page.getByRole("button", { name: "Remember on this device" }).click();
  await seal(true);
  try {
    await page.reload();
    await expectError();
    expect(await page.evaluate(() => [sessionStorage.length, localStorage.length])).toEqual([0, 0]);
  } finally {
    await seal(false);
  }
});

test("SHR-10: nothing outside a grant's scope is reachable by its address", async ({ page }) => {
  await page.goto(origin + link("gnote0001", secrets.note));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To Asha");
  for (const hash of ["#note=Plan.md", "#note=Work%2Fdrafts%2FPlan.md", "#note=Diary.md", "#note=..%2FDiary.md", "#note=%2E%2E%2FDiary.md"]) {
    await page.goto(origin + READER + hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("To Asha");
  }
  await page.goto(origin + link("gfolder01", secrets.folder));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  for (const hash of ["#note=Diary.md", "#note=To%20Asha.md", "#note=Letters%2FTo%20Asha.md", "#note=drafts%2F..%2F..%2FDiary.md"]) {
    await page.goto(origin + READER + hash);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  }
  await page.goto(origin + READER + "#note=drafts%2FPlan.md");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The plan");
  await expect(page.getByText(/only the owner|garden is doing well/)).toHaveCount(0);
});

test("SHR-06: the reader has no axe violations, follows light or dark, and reads at 320 px", async ({ page }) => {
  const states: [string, string, (p: Page) => Promise<void>][] = [
    ["gate", READER, async (p) => { await expect(p.getByRole("heading", { level: 1 })).toBeVisible(); await p.evaluate(() => sessionStorage.clear()); await p.reload(); await expect(p.getByRole("heading", { level: 1 })).toHaveText("This note is private"); }],
    ["error", READER, async (p) => { await signIn(p, "Nobody Here"); await expect(p.getByText(ERROR)).toBeVisible(); }],
    ["list", link("gfolder01", secrets.folder), async (p) => { await expect(p.getByRole("heading", { level: 1 })).toHaveText("Shared with you"); }],
    ["note", link("gfolder01", secrets.folder), async (p) => { await expect(p.getByRole("heading", { level: 1 })).toHaveText("Shared with you"); await main(p).getByRole("link", { name: "The plan" }).click(); await expect(p.getByRole("heading", { level: 1 })).toHaveText("The plan"); }],
  ];
  const backgrounds = new Set<string>();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1100, 320]) {
      await page.setViewportSize({ width, height: 720 });
      for (const [name, url, ready] of states) {
        await page.goto(origin + url);
        await ready(page);
        expect(await axeViolations(page), `${name}, ${colorScheme}, ${width} px`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name}, ${colorScheme}, ${width} px`).toBeLessThanOrEqual(width);
        await shot(page, `${name}-${colorScheme}-${width}`);
      }
    }
    backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  }
  expect(backgrounds.size).toBe(2);
});

test("PRV-04, PRF-05: no cookies, only the site's own files, and 300 KB or less of compressed JavaScript", async ({ page, context }) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto(origin + link("gfolder01", secrets.folder));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await signIn(page, "Sam Lee");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shared with you");
  await main(page).getByRole("link", { name: "The plan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The plan");
  expect(urls.filter((u) => !u.startsWith(origin + "/"))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
  const scripts = [...new Set(urls.filter((u) => u.endsWith(".js")))];
  let compressed = 0;
  for (const u of scripts) compressed += gzipSync(await readFile(join(site, ...new URL(u).pathname.split("/").filter(Boolean)))).length;
  console.log(`Share reader JavaScript: ${scripts.length} files, ${(compressed / 1024).toFixed(1)} KB compressed`);
  expect(compressed).toBeLessThanOrEqual(300 * 1024);
});

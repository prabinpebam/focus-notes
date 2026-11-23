/**
 * The share catalogue's recipient side (D-146): the share reader at s/ over fixture notes sealed by the
 * real publisher, light and dark, wide and narrow. Captures, not checks. Runs only with
 * FOCUS_NOTES_CAPTURE_SHARE=1; files `NN-<state>.<theme>.<size>.png` in FOCUS_NOTES_SHARE_OUT.
 */
import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { publish } from "../../../packages/seal/src/publish.ts";
import { randomBytes, toB64url } from "../../../packages/seal/src/format.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_SHARE !== "1", "Share catalogue captures only");
const OUT = process.env.FOCUS_NOTES_SHARE_OUT ?? join(import.meta.dirname, "..", "..", "..", "test-results", "review", "share-catalog");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".svg": "image/svg+xml" };
const PASSCODE = "orbit maple quiet river";
const NOTES: Record<string, string> = {
  "Work/drafts/Plan.md": "---\nid: n-plan\n---\n# The plan\n\nLaunch quietly on a Tuesday. See [the detail](sub/Detail.md).\n",
  "Work/drafts/sub/Detail.md": "---\nid: n-detail\n---\n# Detail\n\nThe detail of the plan, for the team.\n",
  "Letters/To Asha.md": "---\nid: n-letter\n---\n# To Asha\n\nDear Asha, the garden is doing well.\n",
};
const s = () => toB64url(randomBytes(32)), salt = () => toB64url(randomBytes(16));
const secrets = { folder: s(), note: s(), withdrawn: s(), expired: s() };
const grants = [
  { id: "sfolderaaaaaaaaab", name: "", shareCode: "H3XW9TQA", salt: salt(), link: { secret: secrets.folder }, passcode: { value: PASSCODE }, scope: { ids: ["n-plan", "n-detail"], notes: [], folders: [] }, item: { path: "Work/drafts", label: "drafts", folder: true, includeLater: false }, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" },
  { id: "snoteaaaaaaaaaaab", name: "", shareCode: "K7QM4DRP", salt: salt(), link: { secret: secrets.note }, passcode: { value: PASSCODE }, scope: { ids: ["n-letter"], notes: [], folders: [] }, item: { path: "Letters/To Asha.md", label: "To Asha", folder: false, includeLater: false }, createdAt: "2026-10-01T00:00:00Z" },
  { id: "swithdrawnaaaaaab", name: "", shareCode: "M2PZ8RWN", salt: salt(), link: { secret: secrets.withdrawn }, scope: { ids: ["n-letter"], notes: [], folders: [] }, item: { path: "Letters/To Asha.md", label: "To Asha", folder: false, includeLater: false }, createdAt: "2026-10-01T00:00:00Z", revokedAt: "2026-10-02T00:00:00Z" },
  { id: "sexpiredaaaaaaaab", name: "", shareCode: "Q4VN6TBE", salt: salt(), link: { secret: secrets.expired }, scope: { ids: ["n-letter"], notes: [], folders: [] }, item: { path: "Letters/To Asha.md", label: "To Asha", folder: false, includeLater: false }, createdAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-02T00:00:00Z" },
];
let root = "", site = "", origin = "";
let server: Server;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "fn-share-cat-"));
  site = join(root, "site");
  await cp(join(import.meta.dirname, "..", "dist"), site, { recursive: true });
  for (const [p, t] of Object.entries(NOTES)) {
    await mkdir(join(root, "private", "notes", ...p.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(root, "private", "notes", ...p.split("/")), t);
  }
  await writeFile(join(root, "private", "access.json"), JSON.stringify({ version: 1, nameSalt: "c2FsdHNhbHRzYWx0c2FsdA", grants }));
  await publish({ site, private: join(root, "private"), owner: "octo" });
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
  if (server) await new Promise((r) => server.close(r));
  await rm(root, { recursive: true, force: true });
});

const link = (id: string, secret: string) => `/s/#${id}.${secret}`;
const sizes = [["default", 1100, 760], ["narrow", 380, 720]] as const;

for (const theme of ["light", "dark"] as const) {
  test(`recipient side (${theme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: theme });
    const states: [string, (p: Page) => Promise<void>][] = [
      ["60-recipient-access-code-gate", async (p) => { await p.goto(origin + "/s/"); await expect(p.getByRole("textbox", { name: "Access code", exact: true })).toBeVisible(); }],
      ["61-recipient-access-code-typed", async (p) => { await p.goto(origin + "/s/"); await p.getByRole("textbox", { name: "Access code", exact: true }).fill(`K7QM-4DRP ${PASSCODE}`); }],
      ["62-recipient-wrong-code-error", async (p) => { await p.goto(origin + "/s/"); await p.getByRole("textbox", { name: "Access code", exact: true }).fill(`K7QM-4DRP wrong words here`); await p.getByRole("button", { name: "Open", exact: true }).click(); await expect(p.getByText(/That didn't open anything/)).toBeVisible(); }],
      ["63-recipient-redeemed-code-note", async (p) => { await p.goto(origin + "/s/"); await p.getByRole("textbox", { name: "Access code", exact: true }).fill(`K7QM-4DRP ${PASSCODE}`); await p.getByRole("button", { name: "Open", exact: true }).click(); await expect(p.getByRole("heading", { level: 1 })).toHaveText("To Asha"); }],
      ["64-recipient-link-folder-list", async (p) => { await p.goto("about:blank"); await p.goto(origin + link("sfolderaaaaaaaaab", secrets.folder)); await expect(p.getByRole("heading", { level: 1 })).toHaveText("Shared with you"); }],
      ["65-recipient-link-folder-note", async (p) => { await p.goto("about:blank"); await p.goto(origin + link("sfolderaaaaaaaaab", secrets.folder)); await p.getByRole("main").getByRole("link", { name: "The plan" }).click(); await expect(p.getByRole("heading", { level: 1 })).toHaveText("The plan"); }],
      ["66-recipient-withdrawn-link", async (p) => { await p.goto("about:blank"); await p.goto(origin + link("swithdrawnaaaaaab", secrets.withdrawn)); await expect(p.getByText(/That didn't open anything/)).toBeVisible(); }],
      ["67-recipient-expired-link", async (p) => { await p.goto("about:blank"); await p.goto(origin + link("sexpiredaaaaaaaab", secrets.expired)); await expect(p.getByText(/That didn't open anything/)).toBeVisible(); }],
    ];
    await mkdir(OUT, { recursive: true });
    for (const [size, width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (const [name, ready] of states) {
        try {
          await page.evaluate(() => { try { sessionStorage.clear(); localStorage.clear(); } catch { /* about:blank */ } }).catch(() => {});
          await ready(page);
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(OUT, `${name}.${theme}.${size}.png`) });
        } catch (error) {
          await writeFile(join(OUT, "missing.log"), `${name} ${theme} ${size}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\n`, { flag: "a" });
        }
      }
    }
  });
}

/**
 * D-431: a shared file shows the share mark in Files, its menu opens Share details…, Copy copies its link,
 * and Withdraw there takes the mark and the menu item away. Over a fixture site (no network, no GitHub).
 */
import { test, expect } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { publish } from "../../../packages/seal/src/publish.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { launch, quit } from "./helpers.ts";
import { configureSharing, git, instance, write } from "./instance.ts";

test("D-431: a shared note is marked in Files; Share details… copies its link and Withdraw removes the mark", async () => {
  test.setTimeout(120_000);
  const { dirs } = instance();
  write(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(dirs.docs, "notes", "hello.md") }));
  const priv = join(dirs.docs, "private"), siteDir = join(dirs.userData, "published-share-fixture");
  write(join(priv, "notes", "rome.md"), "# Rome\n\nA sealed fixture plan.\n");
  git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add fixture plan");
  let revision = "";
  let building: Promise<unknown> | undefined;
  let requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    try {
      const current = readFileSync(join(priv, "access.json"), "utf8");
      if (revision !== current) {
        building ??= publish({ private: priv, site: siteDir, owner: "fixture" }).then(() => { revision = current; }).finally(() => { building = undefined; });
        await building;
      }
      const path = new URL(req.url!, "http://fixture").pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (path.some((part) => part === ".." || part.includes("\\") || part.includes(":"))) { res.writeHead(400).end(); return; }
      res.writeHead(200, { "content-type": "application/json" }).end(await readFile(join(siteDir, ...path), "utf8"));
    } catch (error) {
      res.writeHead(error instanceof Error && "code" in error && error.code === "ENOENT" ? 404 : 500).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server address");
  const origin = `http://127.0.0.1:${address.port}/`;
  const site = "https://sharing.test/";
  await configureSharing(dirs, site);
  const l = await launch(dirs, { FOCUS_NOTES_MEMORY_CLIPBOARD: "1", FOCUS_NOTES_POINTER_GAP_MS: "0", FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const copied = () => l.app.evaluate(() => (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard?.text ?? "");
  const access = (): AccessFile => JSON.parse(readFileSync(join(priv, "access.json"), "utf8"));
  try {
    await l.app.evaluate((_electron, fixture) => {
      const nativeFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return nativeFetch(url.origin === new URL(fixture.site).origin ? new URL(`${url.pathname}${url.search}`, fixture.origin) : input, init);
      };
    }, { site, origin });
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    const files = () => page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    const rome = page.getByRole("treeitem", { name: /^Rome\b/ });
    await files();
    await expect(rome).toBeVisible();
    await expect(rome).not.toHaveAccessibleName(/Shared/);
    await rome.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Share…", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Share details…", exact: true })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “Rome”", exact: true });
    await share.getByRole("button", { name: "Copy link", exact: true }).first().click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(share).toHaveCount(0);

    // The mark: visible at the row's end, read with its name and shown as its tooltip.
    await files();
    await expect(rome).toHaveAccessibleName(/^Rome, Shared\b/);
    const mark = rome.locator("[data-site-marks]");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveAttribute("title", "Shared");
    await expect(mark.locator("svg")).toHaveCount(1);

    // Share details… from the file's menu: the right link, copied.
    await rome.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share details…", exact: true }).click();
    const details = page.getByRole("dialog", { name: "Share details", exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByText("Rome", { exact: true })).toBeVisible();
    const grant = access().grants.find((g) => !g.owner)!;
    await l.app.evaluate(() => { const box = (globalThis as { memoryClipboard?: { text: string } }).memoryClipboard; if (box) box.text = ""; });
    // D-433: Copy on an existing share is local: the clipboard has the link at once, the website is never read, and
    // only Copy's own control could ever show pending (here none does).
    const commits = git(priv, "rev-list", "--count", "HEAD").toString().trim(), seen = requests;
    await details.getByRole("button", { name: "Copy", exact: true }).click();
    await page.getByRole("menuitem", { name: "Copy link", exact: true }).click();
    await expect.poll(copied, { timeout: 1_000 }).toBe(`${site}s/#${grant.id}.${grant.link!.secret}`);
    await expect(details.getByText("Copied.", { exact: true })).toBeVisible({ timeout: 1_000 });
    await expect(details.locator("[aria-busy='true']")).toHaveCount(0);
    expect(requests).toBe(seen);
    expect(git(priv, "rev-list", "--count", "HEAD").toString().trim()).toBe(commits);
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);

    // Share… on the shared note opens the same dialog, never a second one.
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await files();
    await rome.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Share…", exact: true })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Share details…", exact: true }).click();
    await expect(details).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Share “Rome”", exact: true })).toHaveCount(0);

    // Withdraw there: back to the dialog, then the mark and the menu item are gone.
    await details.getByRole("button", { name: "Withdraw", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
    await confirm.getByRole("button", { name: "Withdraw share", exact: true }).click();
    await expect(confirm).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => access().grants.find((g) => g.id === grant.id)?.revokedAt).toBeTruthy();
    await expect(details.getByText("Not shared any more.", { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(details).toHaveCount(0);
    await files();
    await expect(rome).toBeVisible();
    await expect(rome).not.toHaveAccessibleName(/Shared/);
    await expect(rome.locator("[data-site-marks]")).toHaveCount(0);
    await rome.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "Share…", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Share details…", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
  } finally {
    try { await quit(l); } finally {
      if (process.platform === "win32") {
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
      }
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
});

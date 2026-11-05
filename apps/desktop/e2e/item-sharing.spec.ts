import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { publish } from "../../../packages/seal/src/publish.ts";
import { SiteReader } from "../../../packages/seal/src/reader.ts";
import type { AccessFile } from "../../../packages/seal/src/grants.ts";
import { launch, quit } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";
import { pointerModality } from "./visual-quality.ts";

test("Share New words is icon-only, aligned and keeps pending feedback on its own border", async () => {
  const { dirs } = instance();
  const privateDir = join(dirs.docs, "private");
  write(join(privateDir, "notes", "trips", "rome.md"), "# Rome\n\nTrip plan.\n");
  git(privateDir, "add", "-A");
  git(privateDir, "commit", "-qm", "Add test folder");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    await page.getByRole("treeitem", { name: "trips", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await share.getByText("Passcode", { exact: true }).click();
    const button = share.getByRole("button", { name: "New words", exact: true });
    await expect(button).toHaveText("");
    await expect(button.locator("svg")).toHaveCount(1);
    const passcode = share.getByRole("textbox", { name: "Passcode", exact: true });
    await expect(passcode).toHaveAttribute("readonly", "");
    for (const [width, height] of [[900, 700], [480, 360]] as const) {
      await l.app.evaluate(({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows()[0]!;
        window.setSize(size.width, size.height);
        return window.getSize();
      }, { width, height });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox(), field = await passcode.boundingBox();
      expect(box).not.toBeNull();
      expect(field).not.toBeNull();
      expect(box!.y).toBe(field!.y);
      expect(box!.height).toBe(field!.height);
    }
    const before = await button.boundingBox();
    await pointerModality(page);
    await button.hover();
    await expect(page.getByRole("tooltip", { name: "New words", exact: true })).toBeVisible();
    await l.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("access:words");
      ipcMain.handle("access:words", () => new Promise(resolve => setTimeout(() => resolve({
        id: "new-words-ui-fixture", value: "cedar-silver-meadow-stone",
      }), 800)));
    });
    await button.click();
    await expect(button).toHaveAttribute("data-commit", "pending");
    await expect(button.locator('[data-border-progress="pending"]')).toHaveCount(1);
    await expect(button.locator("svg")).toHaveCount(1);
    expect(await button.boundingBox()).toEqual(before);
    await expect(passcode).toHaveValue("cedar-silver-meadow-stone");
    await expect(button).toHaveAttribute("data-commit", "rest");
  } finally {
    try { await quit(l); } finally {
      if (process.platform === "win32") for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
    }
  }
});

test("SHR-16: first copy waits for a real deployed share; both methods work and reopening creates an independent share", async () => {
  test.setTimeout(120_000);
  const { dirs } = instance();
  write(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(dirs.docs, "notes", "hello.md") }));
  const priv = join(dirs.docs, "private"), siteDir = join(dirs.userData, "published-share-fixture");
  write(join(priv, "notes", "trips", "rome.md"), "# Rome\n\nA sealed fixture plan.\n");
  git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add fixture plan");
  let available = false, revision = "";
  let building: Promise<unknown> | undefined;
  const server = createServer(async (req, res) => {
    if (!available) { res.writeHead(404).end(); return; }
    try {
      const current = readFileSync(join(priv, "access.json"), "utf8");
      if (revision !== current) {
        building ??= publish({ private: priv, site: siteDir, owner: "fixture" }).then(() => { revision = current; }).finally(() => { building = undefined; });
        await building;
      }
      const path = new URL(req.url!, "http://fixture").pathname.split("/").filter(Boolean).map(decodeURIComponent);
      if (path.some((part) => part === ".." || part.includes("\\") || part.includes(":"))) { res.writeHead(400).end(); return; }
      const text = await readFile(join(siteDir, ...path), "utf8");
      res.writeHead(200, { "content-type": "application/json" }).end(text);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") res.writeHead(404).end();
      else {
        console.error("Fixture publication failed:", error instanceof Error ? error.message : String(error));
        res.writeHead(500).end();
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture server address");
  const origin = `http://127.0.0.1:${address.port}/`;
  const site = "https://sharing.test/";
  write(join(dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site, steps: {} }));
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
    const open = async () => {
      await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
      await page.getByRole("treeitem", { name: "trips", exact: true }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    };
    await open();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await share.getByText("Passcode", { exact: true }).click();
    await expect(share.getByText(/^[a-z]+(-[a-z]+){3}$/)).toBeVisible();
    await share.getByRole("button", { name: "Copy share information", exact: true }).click();
    await expect(share.getByText("Publishing this share. It copies when the site is ready.", { exact: true })).toBeVisible();
    await expect.poll(() => existsSync(join(priv, "access.json")) ? access().grants.filter((g) => !g.owner).length : 0).toBe(1);
    expect(await copied()).toBe("");
    available = true;
    await expect(share.getByText("Share information copied.", { exact: true })).toBeVisible({ timeout: 20_000 });
    const first = access().grants.find((g) => !g.owner)!;
    expect(await copied()).toContain(first.passcode!.value);
    expect(await copied()).not.toContain("{link}");
    const reader = () => new SiteReader(async (p) => {
      const result = await fetch(new URL(p, origin));
      return result.status === 404 ? undefined : result.text();
    });
    expect((await reader().openLinkSession(first.id, first.link!.secret)).share.notes).toHaveLength(1);
    expect((await reader().openAccessCode(`${first.shareCode} ${first.passcode!.value}`)).share.notes).toHaveLength(1);
    await share.getByRole("button", { name: "Copy link", exact: true }).first().click();
    expect(access().grants.filter((g) => !g.owner)).toHaveLength(1);
    await page.keyboard.press("Escape");
    await open();
    await share.getByRole("button", { name: "Copy link", exact: true }).first().click();
    await expect(share.getByText("Link copied.", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(access().grants.filter((g) => !g.owner)).toHaveLength(2);
    expect(access().grants.find((g) => g.id === first.id)).toEqual(first);
    await page.keyboard.press("Escape");
    write(join(priv, "notes", "trips", "New travel.md"), "# New travel\n\nNot in either snapshot yet.\n");
    git(priv, "add", "-A"); git(priv, "commit", "-qm", "Add unshared fixture note");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    await page.getByRole("treeitem", { name: "trips", exact: true }).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("treeitem", { name: "New travel", exact: true })).toBeVisible();
    await page.getByRole("treeitem", { name: "trips", exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    await expect(share.getByText("1 newer note isn't shared", { exact: true })).toBeVisible();
    await share.getByRole("button", { name: "Add them", exact: true }).click();
    await expect(share.getByText("Reviewed notes added to these shares.", { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(access().grants.filter((g) => !g.owner)).toHaveLength(2);
    const expanded = access().grants.find((g) => g.id === first.id)!;
    expect(expanded.link).toEqual(first.link);
    expect(expanded.passcode).toEqual(first.passcode);
    expect((await reader().openLinkSession(first.id, first.link!.secret)).share.notes).toHaveLength(2);
    expect((await reader().openAccessCode(`${first.shareCode} ${first.passcode!.value}`)).share.notes).toHaveLength(2);
    const noteBeforeWithdrawal = readFileSync(join(priv, "notes", "trips", "rome.md"), "utf8");
    await share.getByRole("button", { name: "Withdraw", exact: true }).first().click();
    const confirm = page.getByRole("dialog", { name: "Withdraw this share?", exact: true });
    await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(confirm).toContainText("This cannot be undone.");
    await expect(confirm).toContainText("Sharing again creates a new link.");
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(access().grants.find((g) => g.id === first.id)!.revokedAt).toBeUndefined();
    await share.getByRole("button", { name: "Withdraw", exact: true }).first().click();
    await confirm.getByRole("button", { name: "Withdraw share", exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect.poll(() => access().grants.find((g) => g.id === first.id)?.revokedAt).toBeTruthy();
    await expect(share).toContainText("Its readers stop working after the next successful publication.");
    await expect(page.getByRole("region", { name: "Notifications", exact: true }).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
    expect(readFileSync(join(priv, "notes", "trips", "rome.md"), "utf8")).toBe(noteBeforeWithdrawal);
    await expect(reader().openLinkSession(first.id, first.link!.secret)).rejects.toThrow();
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

test("SHR-13/14/15/24: Share… opens a fixed item, reviews contents and preserves the draft without writing a grant", async () => {
  const { dirs } = instance();
  const privateDir = join(dirs.docs, "private");
  write(join(privateDir, "notes", "trips", "rome.md"), "# Rome\n\nTrip plan.\n");
  write(join(privateDir, "notes", "trips", "ideas", "travel.md"), "# Travel\n");
  git(privateDir, "add", "-A");
  git(privateDir, "commit", "-qm", "Add test folder");
  const file = join(privateDir, "access.json");
  const before = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+E" : "Control+Shift+E");
    const trips = page.getByRole("treeitem", { name: "trips", exact: true });
    await expect(trips).toBeVisible();
    await trips.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    const share = page.getByRole("dialog", { name: "Share “trips”", exact: true });
    await expect(share).toBeVisible();
    await expect(share.getByText("Folder · 2 notes · 1 folder", { exact: true })).toBeVisible();
    await expect(share.getByRole("switch", { name: /^Link / })).toBeChecked();
    await expect(share.getByRole("switch", { name: /^Passcode / })).not.toBeChecked();
    await expect(share.getByRole("switch", { name: /^Include notes added later / })).not.toBeChecked();
    await share.getByText("Link", { exact: true }).click();
    await expect(share.getByText("Keep Link or Passcode on to share this item.", { exact: true })).toBeVisible();
    await share.getByText("Passcode", { exact: true }).click();
    await share.getByText("Your own", { exact: true }).click();
    await share.getByLabel("Your passcode", { exact: true }).fill("harbor maple river cloud");
    await share.getByRole("button", { name: "Review contents", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Contents of “trips”", exact: true });
    await expect(review).toBeVisible();
    await expect(review.getByRole("treeitem", { name: "Rome", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(review).not.toBeVisible();
    await expect(share.getByLabel("Your passcode", { exact: true })).toHaveValue("harbor maple river cloud");
    await expect(share.getByRole("button", { name: "Review contents", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(share).not.toBeVisible();
    expect(existsSync(file) ? readFileSync(file, "utf8") : undefined).toBe(before);
  } finally {
    try { await quit(l); } finally {
      if (process.platform === "win32") execFileSync("pwsh", ["-File", join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1"), "-OnlyPid", String(l.pid)], { stdio: "inherit" });
    }
  }
});

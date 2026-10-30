import { test, expect } from "./fixtures.ts";
import { launch, tempDirs } from "./helpers.ts";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

test("normal whole-file New file preserves source and refuses collision", async () => {
  const dirs = tempDirs(), file = join(dirs.docs, "source.md");
  const original = "# Synthetic source\n\nWhole note text.\n";
  writeFileSync(file, original);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  const server = createServer(async (req, res) => {
    let body = ""; for await (const part of req) body += part;
    expect(body).toContain("Whole note text.");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[{"index":0,"delta":{"content":"# Synthetic result\\n\\nRewritten whole note.\\n"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture");
  const gh = join(dirs.userData, "gh-empty"); mkdirSync(gh);
  const { app, page } = await launch(dirs, { GH_CONFIG_DIR: gh, GH_TOKEN: "", GITHUB_TOKEN: "" });
  try {
    // Record attempts as well as refusing them. No claim that a fence proves no attempted egress.
    await app.evaluate(({ session }) => {
      (globalThis as any).rewriteDenied = [];
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const denied = /^https?:$/.test(url.protocol) && url.hostname !== "127.0.0.1";
        if (denied) (globalThis as any).rewriteDenied.push(url.origin);
        callback({ cancel: denied });
      });
      const fetch = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.hostname !== "127.0.0.1") {
          (globalThis as any).rewriteDenied.push(url.origin); throw new Error("fenced");
        }
        return fetch(input, init);
      };
    });
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Whole note text.");
    // Normal command entry: the same Files context command, not a demo activation flag.
    await page.keyboard.press("Control+Shift+e");
    const row = page.getByRole("treeitem").filter({ hasText: "Synthetic source" });
    await row.first().click();
    await row.first().press("Shift+F10");
    await page.getByRole("menuitem", { name: "Rewrite with AI", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(`http://127.0.0.1:${address.port}/v1`);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic");
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel).toContainText("Connection saved locally.");
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel).toContainText("Rewritten whole note.");
    await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await expect(panel).toContainText("Preview only");
    writeFileSync(join(dirs.docs, "rewrite.md"), "Collision sentinel");
    await panel.getByRole("button", { name: "Create new file", exact: true }).click();
    await expect(panel).toContainText("could not be created");
    expect(readFileSync(join(dirs.docs, "rewrite.md"), "utf8")).toBe("Collision sentinel");
    await panel.getByRole("textbox", { name: "New file name", exact: true }).fill("fresh.md");
    await panel.getByRole("button", { name: "Create new file", exact: true }).click();
    await expect.poll(() => existsSync(join(dirs.docs, "fresh.md"))).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(readFileSync(join(dirs.docs, "fresh.md"), "utf8")).toMatch(/id: [a-f0-9-]{36}/);
    const captures = resolve("../../test-results/rewrite-files"); mkdirSync(captures, { recursive: true });
    const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString("base64"));
    writeFileSync(join(captures, "new-file.png"), Buffer.from(image, "base64"));
    console.log("Blocked external attempts:", await app.evaluate(() => (globalThis as any).rewriteDenied));
  } finally { await app.close(); server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
});

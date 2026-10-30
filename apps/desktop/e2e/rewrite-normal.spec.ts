import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

test("normal launch: trusted current note, in-app connection, durable preview and window refusal", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const file = join(dirs.docs, "public", "normal.md");
  const other = join(dirs.docs, "public", "other.md");
  const original = "A synthetic normal note.\n";
  writeFileSync(file, original); writeFileSync(other, "Another synthetic note.\n");
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  let requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    expect(readdirSync(join(dirs.userData, "rewrite-history"), { recursive: true }).map(String)
      .some((p) => p.includes("refs") && p.includes("focus-notes"))).toBe(true);
    let body = ""; for await (const part of req) body += part;
    expect(body).toContain("A synthetic normal note.");
    expect(body).not.toContain("Another synthetic");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[{"index":0,"delta":{"content":"A normal "},"finish_reason":null}]}\n\n');
    await new Promise((r) => setTimeout(r, 700));
    res.end('data: {"choices":[{"index":0,"delta":{"content":"preview."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture");
  const { app, page } = await launch(dirs); // No demo/activation flag.
  try {
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("A synthetic");
    await expect(editor).toHaveAttribute("data-rewrite-enabled", "true");
    await editor.press(caret.docStart); await editor.press("Control+Shift+r");
    const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Switch provider" })).toHaveCount(0);
    await expect(panel).not.toContainText("Disposable file workspace");
    expect(requests).toBe(0);
    await panel.getByRole("button", { name: "Discard", exact: true }).click();
    await editor.press(caret.docStart);
    await editor.press("Control+Shift+End");
    const selected = await page.evaluate(() => {
      const box = getSelection()!.getRangeAt(0).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    await page.mouse.click(selected.x, selected.y, { button: "right" });
    await page.getByRole("menuitem", { name: /Rewrite with AI/ }).click();
    await expect(panel).toBeVisible();
    expect(await page.evaluate(async (source) => {
      try {
        await (window as any).focusNotes.rewriteAuthority("prepare", { revision: "stale-revision", source,
          target: { from: 0, to: source.length, startByte: 0, endByte: source.length, original: source, expanded: false } });
        return "unsafe";
      } catch { return "refused"; }
    }, original)).toBe("refused");
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(`http://127.0.0.1:${address.port}/v1`);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill("synthetic-model");
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel.getByText("Connection saved locally. Not checked. The key field is cleared.", { exact: true }).last()).toBeVisible();
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.locator("[data-rewrite-proposal]")).toContainText("A normal");
    expect(readFileSync(file, "utf8")).toBe(original);
    await expect(page.locator("[data-rewrite-proposal]")).toContainText("preview.");
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    await expect(panel).toContainText("Preview only");
    const captures = resolve("../../test-results/rewrite-normal");
    mkdirSync(captures, { recursive: true });
    await page.screenshot({ path: join(captures, "01-normal-review.png") });
    expect(await page.evaluate(async () => {
      try { await (window as any).focusNotes.rewriteConnection("configure", { address: "https://example.invalid/v1", model: "synthetic", key: "" }); return "unsafe"; }
      catch { return "refused"; }
    })).toBe("refused");
    await page.evaluate(async (path) => (window as any).focusNotes.windows.open(path), other);
    await expect.poll(() => app.windows().length).toBe(2);
    const second = app.windows()[1]!;
    await expect(second.getByRole("textbox", { name: "Note", exact: true })).toContainText("Another synthetic");
    expect(await second.evaluate(async () => {
      try { await (window as any).focusNotes.rewriteAuthority("accept", { token: "other-window" }); return "unsafe"; }
      catch { return "refused"; }
    })).toBe("refused");
    await panel.getByRole("button", { name: "Discard", exact: true }).click();
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(readFileSync(other, "utf8")).toBe("Another synthetic note.\n");
    expect(requests).toBe(1);
  } finally { await app.close(); server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
});

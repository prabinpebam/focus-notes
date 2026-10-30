import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret, onDisk } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

test("configured loopback connection: inert incremental proposal, cancel, error, retry, Accept and native Undo", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, "public"), { recursive: true });
  const file = join(dirs.docs, "public", "sample.md");
  const original = "We are planning a community garden.\n\nKeep this paragraph unchanged.\n";
  writeFileSync(file, original);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
  let mode = "stream", requests = 0, closed = 0;
  const bodies: string[] = [];
  const server = createServer(async (req, res) => {
    requests++;
    // The local note's encrypted durable original ref exists BEFORE any provider request.
    const history = readdirSync(join(dirs.userData, "rewrite-history"), { recursive: true }).map(String);
    expect(history.some((p) => p.includes("refs") && p.includes("focus-notes"))).toBe(true);
    expect(req.url).toBe("/v1/chat/completions");
    expect(req.headers.authorization).toBe("Bearer fixture-only-token");
    let body = ""; for await (const part of req) body += part; bodies.push(body);
    expect(body).not.toContain("Keep this paragraph");
    res.on("close", () => { closed++; });
    if (mode === "error") { res.writeHead(503); res.end("synthetic unavailable"); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"choices":[{"index":0,"delta":{"content":"Plan "},"finish_reason":null}]}\n\n');
    // Observable server-side assertion while the proposal is incomplete.
    expect(readFileSync(file, "utf8")).toBe(original);
    await new Promise((r) => setTimeout(r, 1200));
    if (!res.destroyed) res.end('data: {"choices":[{"index":0,"delta":{"content":"a garden."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture");
  const { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
  const captures = resolve("../../test-results/rewrite-connection");
  mkdirSync(captures, { recursive: true });
  try {
    await app.evaluate(() => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.hostname !== "127.0.0.1") throw new Error("test-outside-network-refused");
        return originalFetch(input, init);
      };
    });
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("We are planning");
    await editor.press(caret.docStart); await editor.press("Control+Shift+r");
    const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("textbox", { name: "API base address" }).fill(`http://127.0.0.1:${address.port}/v1`);
    await panel.getByRole("textbox", { name: "Model", exact: true }).fill("fixture-model");
    await panel.getByRole("textbox", { name: "API key", exact: true }).fill("fixture-only-token");
    await panel.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(panel.getByText("Connection saved locally. Not checked. The key field is cleared.", { exact: true }).last()).toBeVisible();
    await expect(panel.getByRole("textbox", { name: "API key", exact: true })).toHaveValue("");
    expect(requests).toBe(0);
    expect(readFileSync(join(dirs.userData, "rewrite-connection.json"), "utf8")).not.toContain("fixture-only-token");
    await page.screenshot({ path: `${captures}/01-settings.png` });
    await panel.getByRole("button", { name: "Open connection settings" }).click();
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(page.locator("[data-rewrite-proposal]")).toContainText("Plan");
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.screenshot({ path: `${captures}/02-stream.png` });
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.poll(() => closed).toBe(1);
    await expect(page.locator("[data-rewrite-proposal]")).toHaveCount(0);
    expect(readFileSync(file, "utf8")).toBe(original);
    await editor.press("Control+Shift+r");
    mode = "error";
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel.getByText(/The connection could not finish this rewrite/).last()).toBeVisible();
    await page.screenshot({ path: `${captures}/03-error.png` });
    mode = "stream";
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await page.screenshot({ path: `${captures}/04-review.png` });
    expect(readFileSync(file, "utf8")).toBe(original);
    await panel.getByRole("button", { name: "Accept", exact: true }).click();
    await onDisk(file, "Plan a garden.\n\nKeep this paragraph unchanged.");
    await editor.press("Control+z");
    await expect.poll(() => readFileSync(file, "utf8")).toBe(original);
    expect(requests).toBe(3);
    expect(bodies.every((body) => JSON.parse(body).stream === true)).toBe(true);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

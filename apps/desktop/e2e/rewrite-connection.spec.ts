import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret, onDisk } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";

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
  let { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
  const captures = resolve("../../test-results/rewrite-connection");
  mkdirSync(captures, { recursive: true });
  const completed = () => {
    const root = join(dirs.userData, "rewrite-history");
    return readdirSync(root, { recursive: true }).map(String).filter((p) => p.includes("variations") && !p.includes(".lock") && !p.endsWith("v1") && !p.endsWith("variations"));
  };
  const git = (...args: string[]) => {
    const root = join(dirs.userData, "rewrite-history");
    const repo = join(root, readdirSync(root)[0]!, "private.git");
    return execFileSync("git", ["--no-pager", `--git-dir=${repo}`, ...args], { encoding: "utf8" }).trim();
  };
  const readComplete = async () => {
    const refs = git("for-each-ref", "--format=%(refname)", "refs/focus-notes/variations/v1/").split("\n");
    const results = [];
    for (const ref of refs) {
      const envelope = git("show", `${ref}:content`);
      results.push(await app.evaluate(({ safeStorage }, envelope) =>
        safeStorage.decryptString(Buffer.from(JSON.parse(envelope).data, "base64")), envelope));
    }
    return results;
  };
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
    expect(completed()).toHaveLength(0);
    expect(readFileSync(file, "utf8")).toBe(original);
    await editor.press("Control+Shift+r");
    mode = "error";
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel.getByText(/The connection could not finish this rewrite/).last()).toBeVisible();
    await page.screenshot({ path: `${captures}/03-error.png` });
    mode = "stream";
    // Fail actual Git storage AFTER the original checkpoint, while tokens are arriving.
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.locator("[data-rewrite-proposal]")).toContainText("Plan");
    const historyRoot = join(dirs.userData, "rewrite-history");
    const lock = join(historyRoot, readdirSync(historyRoot)[0]!, "private.lock");
    writeFileSync(lock, "synthetic storage failure");
    await expect(panel.getByText(/back.*up|checkpoint|history/i).last()).toBeVisible();
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    await page.screenshot({ path: `${captures}/05-history-error.png` });
    expect(completed()).toHaveLength(0);
    expect(readFileSync(file, "utf8")).toBe(original);
    unlinkSync(lock);
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    const first = completed();
    expect(first).toHaveLength(1);
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    expect(completed()).toHaveLength(2);
    expect(completed()).toContain(first[0]);
    expect(await readComplete()).toEqual([original.replace("We are planning a community garden.", "Plan a garden."), original.replace("We are planning a community garden.", "Plan a garden.")]);
    await page.screenshot({ path: `${captures}/04-review.png` });
    expect(readFileSync(file, "utf8")).toBe(original);
    await panel.getByRole("button", { name: "Accept", exact: true }).click();
    await onDisk(file, "Plan a garden.\n\nKeep this paragraph unchanged.");
    await editor.press("Control+z");
    await expect.poll(() => readFileSync(file, "utf8")).toBe(original);
    await editor.press(caret.docStart); await editor.press("Control+Shift+r");
    await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await panel.getByRole("button", { name: "Discard", exact: true }).click();
    const retained = completed();
    expect(retained).toHaveLength(3);
    const originals = git("for-each-ref", "--format=%(refname)", "refs/focus-notes/rewrite/v1/");
    await app.close();
    ({ app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] }));
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toContainText("We are planning");
    expect(readFileSync(file, "utf8")).toBe(original);
    expect(completed()).toEqual(retained);
    expect(await readComplete()).toHaveLength(3);
    const reopenedEditor = page.getByRole("textbox", { name: "Note", exact: true });
    await reopenedEditor.press(caret.docStart); await reopenedEditor.press("Control+Shift+r");
    const reopenedPanel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
    await reopenedPanel.getByRole("button", { name: "Browse saved variations" }).click();
    await expect(reopenedPanel.getByText("Variation 1 of 3", { exact: true })).toBeVisible();
    await expect(reopenedPanel.getByRole("button", { name: "Previous variation" })).toBeDisabled();
    await expect(reopenedPanel.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    await reopenedPanel.getByRole("button", { name: "Next variation" }).click();
    await reopenedPanel.getByRole("button", { name: "Next variation" }).click();
    await expect(reopenedPanel.getByText("Variation 3 of 3", { exact: true })).toBeVisible();
    await expect(reopenedPanel.getByRole("button", { name: "Next variation" })).toBeDisabled();
    await expect(reopenedPanel.getByText("Plan a garden.\n\nKeep this paragraph unchanged.\n", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 720, height: 600 });
    await page.screenshot({ path: join(captures, "06-saved-history.png") });
    await reopenedPanel.getByRole("button", { name: "Show original" }).click();
    await expect(reopenedPanel.getByRole("button", { name: "Accept", exact: true })).toBeDisabled();
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.screenshot({ path: join(captures, "07-saved-original.png") });
    await reopenedPanel.getByRole("button", { name: "Discard", exact: true }).click();
    expect(git("for-each-ref", "--format=%(refname)", "refs/focus-notes/rewrite/v1/")).toBe(originals);
    expect(requests).toBe(6);
    expect(bodies.every((body) => JSON.parse(body).stream === true)).toBe(true);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

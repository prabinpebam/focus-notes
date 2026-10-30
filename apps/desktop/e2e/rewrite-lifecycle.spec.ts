import { test, expect } from "./fixtures.ts";
import { launch, tempDirs, caret, onDisk } from "./helpers.ts";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { ElectronApplication } from "@playwright/test";

// Observe real IPC handlers, without replacing the writer, authority or original store.
// The optional reply gate models a checkpoint acknowledgement still in flight at close.
async function observe(app: ElectronApplication, gate: boolean) {
  await app.evaluate(({ ipcMain, BrowserWindow, dialog }, gate) => {
    const state = { events: [] as string[], release: () => {} };
    (globalThis as any).lifecycle = state;
    const handlers = (ipcMain as any)._invokeHandlers as Map<string, (...args: any[]) => any>;
    for (const channel of ["note:write", "rewrite:authority"]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing real handler: ${channel}`);
      handlers.set(channel, async (event, ...args) => {
        const label = channel === "note:write" ? "save" : String(args[0]);
        state.events.push(`${label}:start`);
        const result = await handler(event, ...args);
        state.events.push(`${label}:ack`);
        if (gate && label === "prepare") await new Promise<void>((r) => { state.release = r; });
        return result;
      });
    }
    ipcMain.on("app:flushed", (_e, ok) => state.events.push(`flushed:${ok}`));
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
    const send = win.webContents.send.bind(win.webContents);
    win.webContents.send = (channel, ...args) => {
      if (channel === "app:flush") {
        state.events.push("flush:request");
        // Let a late preparation reply arrive only AFTER close initiated its normal flush.
        state.release();
      }
      send(channel, ...args);
    };
    dialog.showMessageBox = async () => {
      state.events.push("unexpected-save-dialog");
      return { response: 0, checkboxChecked: false };
    };
    const fetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "127.0.0.1") throw new Error("test-outside-network-refused");
      state.events.push("provider:start");
      return fetch(input, init);
    };
  }, gate);
}
const events = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as any).lifecycle.events);

for (const stage of ["cancel", "stream-close", "checkpoint-close"] as const) {
  test(`dirty editor autosave and ${stage}: durable original, released lane and latest reopen`, async () => {
    const dirs = tempDirs();
    mkdirSync(join(dirs.docs, "public"), { recursive: true });
    // Deliberately different Windows spelling, even if TEMP has no short-name alias on CI.
    const diskFile = join(dirs.docs, "public", "lifecycle.md");
    const file = process.platform === "win32" ? join(dirs.docs, "public", "LIFECYCLE.md") : diskFile;
    const original = "A community garden.\n\nKeep this paragraph unchanged.\n";
    const dirty = "A community garden. Dirty before rewrite.\n\nKeep this paragraph unchanged.\n";
    const latest = stage === "cancel"
      ? "A community garden. Dirty before rewrite. Latest while streaming.\n\nKeep this paragraph unchanged.\n"
      : dirty;
    writeFileSync(diskFile, original);
    if (process.platform === "win32") expect(file).not.toBe(realpathSync.native(file));
    writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: file }));
    const git = (...args: string[]) => {
      const history = join(dirs.userData, "rewrite-history");
      const repo = join(history, readdirSync(history)[0]!, "private.git");
      return execFileSync("git", ["--no-pager", `--git-dir=${repo}`, ...args], { encoding: "utf8" }).trim();
    };
    let requests = 0, disconnected = 0, checkpointAtRequest = "";
    const server = createServer(async (req, res) => {
      requests++;
      let body = ""; for await (const part of req) body += part;
      expect(JSON.parse(body).messages.at(-1).content).toContain("Dirty before rewrite.");
      expect(body).not.toContain("Latest while streaming.");
      const ref = git("for-each-ref", "--format=%(refname)", "refs/focus-notes/rewrite/v1/");
      checkpointAtRequest = git("show", `${ref}:content`);
      res.on("close", () => { disconnected++; });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"index":0,"delta":{"content":"An inert proposal."},"finish_reason":null}]}\n\n');
      // Intentionally unfinished until Cancel/close aborts it; no timer or model process.
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("fixture");
    const { app, page } = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
    try {
      await observe(app, stage === "checkpoint-close");
      const editor = page.getByRole("textbox", { name: "Note", exact: true });
      await expect(editor).toContainText("A community garden.");
      await editor.press(caret.docStart); await editor.press("Control+Shift+r");
      const panel = page.getByRole("complementary", { name: "Rewrite with AI", exact: true });
      await panel.getByRole("button", { name: "Open connection settings" }).click();
      await panel.getByRole("textbox", { name: "API base address" }).fill(`http://127.0.0.1:${address.port}/v1`);
      await panel.getByRole("textbox", { name: "Model", exact: true }).fill("fixture-model");
      await panel.getByRole("button", { name: "Save connection", exact: true }).click();
      await expect(panel.getByText("Connection saved locally. Not checked. The key field is cleared.", { exact: true }).last()).toBeVisible();
      await panel.getByRole("button", { name: "Open connection settings" }).click();
      // Keyboard edits use the actual editor/native history, not bridge-supplied source.
      await editor.press(caret.docStart); await editor.press("End");
      await page.keyboard.insertText(" Dirty before rewrite.");
      await editor.press(caret.docStart); await editor.press("Control+Shift+r");
      expect(readFileSync(file, "utf8")).toBe(original);
      await panel.getByRole("button", { name: "Rewrite", exact: true }).click();
      await expect.poll(async () => (await events(app)).includes("prepare:ack")).toBe(true);

      // Inspect the actual durable Git ref/content before allowing generation to be evidence.
      const ref = git("for-each-ref", "--format=%(refname)", "refs/focus-notes/rewrite/v1/");
      expect(ref.split("\n")).toHaveLength(1);
      const encrypted = git("show", `${ref}:content`);
      const checkpoint = await app.evaluate(({ safeStorage }, envelope) =>
        safeStorage.decryptString(Buffer.from(JSON.parse(envelope).data, "base64")), encrypted);
      expect(checkpoint).toBe(dirty);
      if (stage !== "checkpoint-close") {
        await expect(page.locator("[data-rewrite-proposal]")).toContainText("An inert proposal.");
        const order = await events(app);
        expect(order.indexOf("prepare:ack")).toBeLessThan(order.indexOf("provider:start"));
        expect(requests).toBe(1);
        expect(checkpointAtRequest).toBe(encrypted);
        // Autosave of the original dirty source reaches the real held writer.
        await expect.poll(async () => (await events(app)).includes("save:start")).toBe(true);
        expect(readFileSync(file, "utf8")).toBe(original);
        expect((await events(app)).includes("save:ack")).toBe(false);
      } else {
        expect(requests).toBe(0);
      }

      if (stage === "cancel") {
        // Typing invalidates the proposal and releases its held older autosave.
        // The newer save must follow it, never be overwritten by the queued source.
        await editor.press(caret.docStart); await editor.press("End");
        await page.keyboard.insertText(" Latest while streaming.");
        await expect(panel).not.toBeVisible();
        await onDisk(file, latest);
        await expect.poll(() => disconnected).toBe(1);
      }
      // BrowserWindow.close exercises authority release BEFORE the real renderer flush.
      // A second test-only window keeps main alive so the flush result remains observable.
      const closingAt = Date.now();
      await app.evaluate(({ BrowserWindow }) => {
        (globalThis as any).lifecycleKeeper = new BrowserWindow({ show: false });
        BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!.close();
      });
      await expect.poll(async () => (await events(app)).includes("flushed:true")).toBe(true);
      console.log(`${stage}: close-to-flushed ${Date.now() - closingAt}ms`);
      const order = await events(app);
      expect(order).not.toContain("unexpected-save-dialog");
      expect(order.indexOf("flush:request")).toBeLessThan(order.indexOf("flushed:true"));
      if (stage !== "cancel") expect(order.indexOf("flush:request")).toBeLessThan(order.indexOf("save:ack"));
      await expect.poll(() => readFileSync(file, "utf8")).toBe(latest);
      if (stage === "checkpoint-close") expect(requests).toBe(0);
      else await expect.poll(() => disconnected).toBe(1);
      await app.evaluate(() => (globalThis as any).lifecycleKeeper.destroy());
    } finally {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
    const reopened = await launch(dirs, {}, { args: ["--rewrite-editor-demo"] });
    try {
      await expect(reopened.page.getByRole("textbox", { name: "Note", exact: true })).toContainText(
        stage === "cancel" ? "Dirty before rewrite. Latest while streaming." : "Dirty before rewrite.");
      await expect(reopened.page.locator("[data-rewrite-proposal]")).toHaveCount(0);
      expect(readFileSync(file, "utf8")).toBe(latest);
      expect(requests).toBe(stage === "checkpoint-close" ? 0 : 1);
    } finally { await reopened.app.close(); }
  });
}

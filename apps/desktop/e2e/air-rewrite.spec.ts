/**
 * AI Rewrite journeys (streaming in place): the Writer is a local fake that speaks Ollama's
 * /api/chat NDJSON stream, so nothing leaves the machine. Select, Rewrite (Mod+Shift+R), a prompt,
 * Generate: the answer streams in formatted, the note locked and busy, nothing saved; Esc stops it,
 * the request in the main process is cancelled and the original is back; a finished answer is saved
 * and is one undo step; switching notes mid-stream cancels it too. And a dialog's scrolling body
 * runs to the dialog's edge (UI-09, D-111).
 */
import { test, expect, type Page } from "./fixtures.ts";
import { createServer, type Server } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { launch, quit, tempDirs, PROMPTLY, type Launched } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const redo = process.platform === "darwin" ? "Meta+Shift+z" : "Control+y";

/** A fake Ollama: each request streams `chunks`, pausing before `holdAt` until `release()`. */
function fakeOllama() {
  let plan: { chunks: string[]; holdAt: number } = { chunks: [], holdAt: -1 };
  let gate: Promise<void> = Promise.resolve();
  let open: () => void = () => {};
  const seen: { body: unknown; closed: boolean; finished: boolean }[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ models: [{ name: "fake" }] }));
      return;
    }
    if (req.url !== "/api/chat" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.on("data", (d) => { raw += String(d); });
    req.on("end", async () => {
      const entry = { body: JSON.parse(raw) as unknown, closed: false, finished: false };
      seen.push(entry);
      res.on("close", () => { if (!entry.finished) entry.closed = true; });
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      const { chunks, holdAt } = plan;
      for (const [i, content] of chunks.entries()) {
        if (i === holdAt) await gate;
        if (res.destroyed) return;
        res.write(`${JSON.stringify({ model: "fake", message: { role: "assistant", content }, done: false })}\n`);
        await new Promise((r) => setTimeout(r, 25));
      }
      entry.finished = true;
      res.end(`${JSON.stringify({ model: "fake", message: { role: "assistant", content: "" }, done: true })}\n`);
    });
  });
  return {
    seen,
    play(chunks: string[], holdAt = -1) {
      plan = { chunks, holdAt };
      gate = new Promise((r) => { open = r; });
    },
    release: () => open(),
    listen: () => new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as { port: number }).port))),
    close: () => new Promise<void>((r) => { open(); server.closeAllConnections(); server.close(() => r()); }),
  };
}

/** Selects `text` in the note, as a drag would. */
async function select(page: Page, text: string) {
  await page.evaluate((text) => {
    const root = document.querySelector("[data-editor]")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
    throw new Error(`"${text}" isn't in the note`);
  }, text);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString() ?? "")).toBe(text);
}

async function rewrite(page: Page, text: string, prompt: string) {
  await select(page, text);
  await page.keyboard.press(`${mod}+Shift+R`);
  const dialog = page.getByRole("dialog", { name: "Rewrite" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Prompt" }).fill(prompt);
  await dialog.getByRole("button", { name: "Generate" }).click();
  await expect(dialog).toBeHidden();
}

const ORIGINAL = "# Plan\n\nKeep this. Change this part. Keep that.\n";
const ANSWER = ["New ", "**bol", "d** words", " and `co", "de`."];
const REWRITTEN = "# Plan\n\nKeep this. New **bold** words and `code`. Keep that.\n";

test.describe.configure({ mode: "serial" });

test("AI Rewrite: streams formatted and locked, Esc cancels the request and restores, finish saves as one undo step", async () => {
  test.setTimeout(120_000);
  const fake = fakeOllama();
  const port = await fake.listen();
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, DATA_FILES.ai), JSON.stringify({
    version: 2, writer: "fake",
    connections: [{ id: "fake", provider: "ollama", name: "Fake Ollama", endpoint: `http://127.0.0.1:${port}`, model: "fake" }],
  }));
  const note = join(dirs.docs, "Welcome.md");
  const other = join(dirs.docs, "Other.md");
  writeFileSync(note, ORIGINAL);
  writeFileSync(other, "# Other\n\nSomething else.\n");
  const saved = () => readFileSync(note, "utf8");
  let l: Launched | undefined;
  try {
    l = await launch(dirs);
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();

    // 1. Held mid-answer: formatted live, locked and busy, nothing saved.
    fake.play(ANSWER, 3);
    await rewrite(page, "Change this part.", "Make it bold");
    await expect(editor.locator("strong")).toHaveText("bold");
    await expect(editor).toHaveAttribute("aria-busy", "true");
    await expect(editor).toHaveAttribute("contenteditable", "false");
    expect(await editor.innerText()).not.toContain("**");
    const during = await editor.innerText();
    await page.keyboard.type("typed");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.press(`${mod}+z`);
    expect(await editor.innerText()).toBe(during);
    await page.waitForTimeout(1200);
    expect(saved()).toBe(ORIGINAL);
    expect((fake.seen[0]!.body as { messages: { content: string }[] }).messages.at(-1)!.content).toContain("Change this part.");

    // 2. Esc: the original at once, the note unlocked, the request cancelled in the main process.
    await page.keyboard.press("Escape");
    await expect(editor).toContainText("Keep this. Change this part. Keep that.");
    await expect(editor).not.toHaveAttribute("aria-busy", "true");
    await expect.poll(() => fake.seen[0]!.closed, PROMPTLY).toBe(true);
    await expect(page.getByText("Rewrite stopped. The original text is back.")).toBeAttached();
    fake.release();
    await page.waitForTimeout(500);
    expect(saved()).toBe(ORIGINAL);

    // 2b. By keyboard alone: F6 reaches the toast's Stop, Enter stops it.
    fake.play(ANSWER, 2);
    const keyed = fake.seen.length;
    await rewrite(page, "Change this part.", "Make it bold");
    await expect(editor).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press("F6");
    await expect(page.getByRole("button", { name: "Stop" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(editor).not.toHaveAttribute("aria-busy", "true");
    await expect(editor).toContainText("Keep this. Change this part. Keep that.");
    await expect.poll(() => fake.seen[keyed]?.closed, PROMPTLY).toBe(true);
    fake.release();
    expect(saved()).toBe(ORIGINAL);

    // 3. To the end: saved as the provider's Markdown, one undo step back, redo again.
    fake.play(ANSWER);
    await rewrite(page, "Change this part.", "Make it bold");
    await expect(editor).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    await expect(editor.locator("code")).toHaveText("code");
    await expect.poll(saved, PROMPTLY).toBe(REWRITTEN);
    await editor.focus();
    await page.keyboard.press(`${mod}+z`);
    await expect(editor).toContainText("Keep this. Change this part. Keep that.");
    await expect.poll(saved, PROMPTLY).toBe(ORIGINAL);
    await page.keyboard.press(redo);
    await expect(editor.locator("strong")).toHaveText("bold");
    await expect.poll(saved, PROMPTLY).toBe(REWRITTEN);

    // 4. Leaving the note mid-stream: the request is cancelled and neither note gets the answer.
    writeFileSync(note, ORIGINAL);
    await expect(editor).toContainText("Change this part.", { timeout: 15_000 });
    fake.play(["Gone ", "words ", "here."], 1);
    const before = fake.seen.length;
    await rewrite(page, "Change this part.", "Again");
    await expect(editor).toHaveAttribute("aria-busy", "true");
    await page.keyboard.press(`${mod}+p`);
    await page.keyboard.type("Other");
    await page.keyboard.press("Enter");
    await expect(editor).toContainText("Something else.");
    await expect.poll(() => fake.seen[before]?.closed, PROMPTLY).toBe(true);
    await expect(editor).not.toHaveAttribute("aria-busy", "true");
    fake.release();
    await page.waitForTimeout(500);
    expect(saved()).toBe(ORIGINAL);
    expect(readFileSync(other, "utf8")).toBe("# Other\n\nSomething else.\n");
  } finally {
    if (l) await quit(l);
    await fake.close();
  }
});

test("UI-09, D-111: a dialog's scrolling body runs to the dialog's bottom edge, its padding inside the scroller", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Note\n");
  const l = await launch(dirs);
  try {
    const { page } = l;
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await page.keyboard.press(`${mod}+Shift+Slash`);
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    const edges = await dialog.locator("[data-dialog-body]").evaluate((body) => {
      const panel = body.parentElement!;
      const p = panel.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      const border = parseFloat(getComputedStyle(panel).borderBottomWidth) || 0;
      return { gap: p.bottom - border - b.bottom, last: panel.lastElementChild === body, padding: parseFloat(getComputedStyle(body).paddingBottom), scrolls: body.scrollHeight > body.clientHeight };
    });
    expect(edges.last).toBe(true);
    expect(Math.abs(edges.gap)).toBeLessThanOrEqual(1);
    expect(edges.padding).toBeGreaterThan(0);
    expect(edges.scrolls).toBe(true);
  } finally {
    await quit(l);
  }
});

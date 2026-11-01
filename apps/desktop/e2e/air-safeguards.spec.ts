/**
 * AI Rewrite's safeguards in the real app (AIS-13, AIS-14, D-259), against a local fake that speaks
 * Ollama's /api/chat NDJSON, so nothing leaves the machine. In a disposable private note, the user
 * decides whether to send after seeing the integration, model and destination. The first send
 * asks first, naming the service, its address and This computer; Cancel sends nothing; Send
 * streams and is remembered, so the next rewrite just generates.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { createServer, type Server } from "node:http";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { launch, quit, tempDirs, PROMPTLY, type Launched } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** A fake Ollama that answers every chat with `answer`, streamed. */
function fakeOllama(answer: string[]) {
  const seen: unknown[] = [];
  const server: Server = createServer((req, res) => {
    if (req.url !== "/api/chat" || req.method !== "POST") return void res.writeHead(404).end();
    let raw = "";
    req.on("data", (d) => { raw += String(d); });
    req.on("end", async () => {
      seen.push(JSON.parse(raw));
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const content of answer) {
        res.write(`${JSON.stringify({ model: "fake", message: { role: "assistant", content }, done: false })}\n`);
        await new Promise((r) => setTimeout(r, 20));
      }
      res.end(`${JSON.stringify({ model: "fake", message: { role: "assistant", content: "" }, done: true })}\n`);
    });
  });
  return {
    seen,
    listen: () => new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as { port: number }).port))),
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

async function select(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Note" }).focus();
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
/** Select, open Rewrite and type the prompt; the dialog is left open. */
async function openRewrite(page: Page, text: string, prompt?: string) {
  await select(page, text);
  await page.keyboard.press(`${mod}+Shift+R`);
  const dialog = page.getByRole("dialog", { name: "Rewrite" });
  await expect(dialog).toBeVisible();
  if (prompt !== undefined) await dialog.getByRole("textbox", { name: "Prompt" }).fill(prompt);
  return dialog;
}

const DIARY = "# Diary\n\nA private thought here.\n";

test("AIS-13, AIS-14: a private note discloses its integration; Cancel sends nothing, Send streams and is remembered", async () => {
  test.setTimeout(120_000);
  const fake = fakeOllama(["A ", "kinder ", "thought."]);
  const port = await fake.listen();
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"), { recursive: true });
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  mkdirSync(join(dirs.docs, "notes"), { recursive: true });
  writeFileSync(join(dirs.docs, "notes", "essay.md"), "# Essay\n\nPublic words.\n");
  mkdirSync(join(dirs.docs, "private", "notes"), { recursive: true });
  const diary = join(dirs.docs, "private", "notes", "diary.md");
  writeFileSync(diary, DIARY);
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: diary }));
  const aiFile = join(dirs.userData, DATA_FILES.ai);
  // A legacy private-notes key is ignored; a local Ollama model needs no discovery to be labelled.
  writeFileSync(aiFile, JSON.stringify({
    version: 2, writer: "fake", keepPrivate: true,
    connections: [{ id: "fake", provider: "ollama", name: "Fake Ollama", endpoint: `http://127.0.0.1:${port}`, model: "fake", deployment: "", apiVersion: "", account: "" }],
  }));
  const ai = () => JSON.parse(readFileSync(aiFile, "utf8")) as { keepPrivate?: boolean; connections: { consent?: string }[] };
  let l: Launched | undefined;
  try {
    l = await launch(dirs);
    if (process.env.FOCUS_NOTES_AI_PICKER_PIDS) appendFileSync(process.env.FOCUS_NOTES_AI_PICKER_PIDS, `${l.pid}\n`);
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("A private thought here.");

    // The first send asks, including in a private note. Cancel sends nothing.
    let dialog = await openRewrite(page, "A private thought here.", "Make it kinder");
    await expect(dialog.getByText("This computer", { exact: true })).toBeVisible();
    await expect(dialog.getByText(`Rewrite sends the selected text and your prompt to Ollama · fake at 127.0.0.1:${port} · This computer.`, { exact: false })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Generate" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(300);
    expect(fake.seen).toHaveLength(0);
    expect(ai().connections[0]!.consent).toBeUndefined();

    // 4. Send: consent is saved, then the answer streams into the note and is saved.
    dialog = await openRewrite(page, "A private thought here.", "Make it kinder");
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(dialog).toBeHidden();
    await expect(editor).toContainText("A kinder thought.", { timeout: 15_000 });
    await expect(editor).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    expect(fake.seen).toHaveLength(1);
    expect(ai().connections[0]!.consent).toBe(`ollama|http://127.0.0.1:${port}|fake|`);
    await expect.poll(() => readFileSync(diary, "utf8"), PROMPTLY).toContain("A kinder thought.");

    // 5. Remembered: the next rewrite just generates.
    dialog = await openRewrite(page, "A kinder thought.", "Shorter");
    await expect(dialog.getByRole("button", { name: "Generate" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Send" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    expect(ai().keepPrivate).toBeUndefined();
    await editor.focus();
    await page.keyboard.press(`${mod}+z`);
    await expect(editor).toContainText("A private thought here.");
    await expect.poll(() => readFileSync(diary, "utf8"), PROMPTLY).toContain("A private thought here.");
    expect(fake.seen).toHaveLength(1);
  } finally {
    if (l) await quit(l).catch(() => {});
    await fake.close();
  }
});

test("AIS-04, AIS-13: the rewrite integration picker remembers its model and locality", async () => {
  test.setTimeout(120_000);
  const captureDir = process.env.FOCUS_NOTES_AI_PICKER_CAPTURES;
  if (captureDir) mkdirSync(captureDir, { recursive: true });
  for (const count of [1, 2]) {
    for (const theme of ["light", "dark"]) {
      const dirs = tempDirs();
      const note = join(dirs.docs, "essay.md");
      writeFileSync(note, "# Essay\n\nA few words to rewrite.\n");
      writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, appearance: theme }));
      const aiFile = join(dirs.userData, DATA_FILES.ai);
      const connections = [
        { id: "local", provider: "ollama", name: "Local Ollama", endpoint: "http://localhost:11434", model: "llama3.2", deployment: "", apiVersion: "", account: "" },
        { id: "cloud", provider: "ollama", name: "Cloud Ollama", endpoint: "http://localhost:11434", model: "gpt-oss:120b-cloud", deployment: "", apiVersion: "", account: "" },
      ].slice(0, count);
      writeFileSync(aiFile, JSON.stringify({ version: 2, writer: "local", connections }));
      let l: Launched | undefined;
      try {
        l = await launch(dirs);
        if (process.env.FOCUS_NOTES_AI_PICKER_PIDS) appendFileSync(process.env.FOCUS_NOTES_AI_PICKER_PIDS, `${l.pid}\n`);
        const { page } = l;
        const dialog = await openRewrite(page, "A few words to rewrite.", "Make it warmer");
        await expect(dialog.getByText("This computer", { exact: true })).toBeVisible();
        await expect(dialog.getByText("llama3.2", { exact: true })).toBeVisible();
        const picker = dialog.getByRole("button", { name: "AI integration", exact: true });
        await expect(picker).toHaveCount(count === 2 ? 1 : 0);
        if (captureDir) await dialog.screenshot({ path: join(captureDir, `rewrite-${count}-${theme}.png`), animations: "disabled" });
        if (count === 2) {
          await picker.click();
          await page.getByRole("menuitemcheckbox", { name: /Cloud Ollama/ }).click();
          await expect(dialog.getByText("Cloud", { exact: true })).toBeVisible();
          await expect(dialog.getByText("gpt-oss:120b-cloud", { exact: true })).toBeVisible();
          await expect.poll(() => JSON.parse(readFileSync(aiFile, "utf8")).writer, PROMPTLY).toBe("cloud");
          await expect(dialog.getByRole("textbox", { name: "Prompt" })).toHaveValue("Make it warmer");
          if (captureDir) await dialog.screenshot({ path: join(captureDir, `rewrite-2-cloud-${theme}.png`), animations: "disabled" });
          await dialog.getByRole("button", { name: "Cancel" }).click();
          const reopened = await openRewrite(page, "A few words to rewrite.");
          await expect(reopened.getByText("gpt-oss:120b-cloud", { exact: true })).toBeVisible();
        }
      } finally {
        if (l) await quit(l).catch(() => {});
      }
    }
  }
});

/**
 * AI Rewrite's safeguards in the real app (AIS-13, AIS-14, D-259), against a local fake that speaks
 * Ollama's /api/chat NDJSON, so nothing leaves the machine. In a disposable private note, the user
 * decides whether to send after seeing the integration, model and locality in the inline prompt.
 * Cancel sends nothing; Generate streams directly without a first-send consent gate.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { createServer, type Server } from "node:http";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { tokens } from "../../../packages/tokens/dist/tokens.ts";
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
  await expect.poll(() => page.locator("[data-editor]").evaluate((element) => {
    const editor = (element as HTMLElement & {
      editor?: { state: { selection: { from: number; to: number }; doc: { textBetween: (from: number, to: number, separator: string) => string } } };
    }).editor;
    if (!editor) throw new Error("The note editor is not mounted");
    const { selection, doc } = editor.state;
    return doc.textBetween(selection.from, selection.to, "\n\n");
  })).toBe(text);
}
/** Select, open Rewrite and type the prompt; the dialog is left open. */
async function openRewrite(page: Page, text: string, prompt?: string) {
  await select(page, text);
  await page.keyboard.press(`${mod}+Shift+R`);
  const dialog = page.locator('#rewrite[role="region"]');
  await expect(dialog).toBeVisible();
  if (prompt !== undefined) await dialog.getByRole("textbox", { name: "Prompt" }).fill(prompt);
  return dialog;
}

const DIARY = "# Diary\n\nA private thought here.\n";

test("D-265, D-266: inline Rewrite follows visible selection, confirms draft loss, and generates directly", async () => {
  test.setTimeout(120_000);
  const fake = fakeOllama(["Rewritten ", "selection."]);
  const port = await fake.listen();
  const captureDir = process.env.FOCUS_NOTES_AI_PICKER_CAPTURES;
  if (captureDir) mkdirSync(captureDir, { recursive: true });
  const passage = Array.from({ length: 36 }, (_, i) => `Selected sentence ${i} remains in the document while the prompt follows its visible lines.`).join(" ");
  const markdown = `# Essay\n\nOpening words to rewrite.\n\n${passage}\n\n` + "Following paragraph for scrolling.\n\n".repeat(50);
  try {
    for (const theme of ["light", "dark"]) {
      const sentBefore = fake.seen.length;
      const dirs = tempDirs();
      const note = join(dirs.docs, "essay.md");
      writeFileSync(note, markdown);
      writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, appearance: theme }));
      writeFileSync(join(dirs.userData, DATA_FILES.ai), JSON.stringify({ version: 2, writer: "fake", connections: [
        { id: "fake", provider: "ollama", name: "Fake Ollama", endpoint: `http://127.0.0.1:${port}`, model: "fake", deployment: "", apiVersion: "", account: "" },
      ] }));
      let l: Launched | undefined;
      try {
        l = await launch(dirs);
        if (process.env.FOCUS_NOTES_AI_PICKER_PIDS) appendFileSync(process.env.FOCUS_NOTES_AI_PICKER_PIDS, `${l.pid}\n`);
        const { page } = l;
        const editor = page.getByRole("textbox", { name: "Note" });
        await expect(editor).toContainText("Opening words to rewrite.");
        let prompt = await openRewrite(page, "Opening words to rewrite.");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(prompt.getByText("Opening words to rewrite.", { exact: true })).toHaveCount(0);
        await editor.getByRole("heading", { name: "Essay", exact: true }).click();
        await expect(prompt).toBeHidden();
        expect(fake.seen).toHaveLength(sentBefore);

        prompt = await openRewrite(page, passage, "Keep this exact draft");
        await expect(prompt.getByText(/Rewrite sends|Nothing else from your notes/)).toHaveCount(0);
        await expect.poll(() => editor.locator("span").evaluateAll((spans) => spans.some((span) =>
          span.textContent?.includes("Selected sentence") && getComputedStyle(span).backgroundColor !== "rgba(0, 0, 0, 0)",
        ))).toBe(true);
        const initialScroll = await page.locator("[data-editor-scroller]").evaluate((el) => el.scrollTop);
        await page.locator("[data-editor-scroller]").evaluate((el) => { el.scrollTop += 160; });
        await expect.poll(() => page.locator("[data-editor-scroller]").evaluate((el) => el.scrollTop)).toBeGreaterThan(initialScroll);
        await expect(prompt).toBeVisible();
        const inBounds = () => prompt.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const viewport = document.querySelector("[data-editor-scroller]")!.getBoundingClientRect();
          return box.left >= viewport.left && box.right <= viewport.right + 1 && box.top >= viewport.top && box.bottom <= viewport.bottom + 1;
        });
        await expect.poll(inBounds).toBe(true);
        if (captureDir) await page.screenshot({ path: join(captureDir, `popover-scroll-${theme}.png`), animations: "disabled" });
        await page.locator("[data-editor-scroller]").evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeHidden();
        const returnAbove = prompt.getByRole("button", { name: "Return to selection above", exact: true });
        await expect(returnAbove).toBeVisible();
        await returnAbove.hover();
        await expect(returnAbove).toHaveAttribute("data-hovered", "true");
        expect(await returnAbove.evaluate((el, bearingToken) => {
          const style = getComputedStyle(el);
          const raw = getComputedStyle(el).getPropertyValue(bearingToken.replace(/^var\(|\)$/g, "")).trim();
          const bearing = parseFloat(raw) * (raw.endsWith("rem") ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
          return style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundImage !== "none"
            && style.alignItems === "center" && style.justifyContent === "center"
            && Math.abs(parseFloat(style.paddingLeft) + bearing - parseFloat(style.paddingRight)) < 0.1;
        }, tokens.cmp.button.iconBearing)).toBe(true);
        await returnAbove.click();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeVisible();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        const originalSize = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize());
        await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(480, 360));
        await expect.poll(inBounds).toBe(true);
        if (captureDir) await page.screenshot({ path: join(captureDir, `popover-small-${theme}.png`), animations: "disabled" });
        await prompt.getByRole("button", { name: /Return to selection/ }).click();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeVisible();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        const smallGenerate = prompt.getByRole("button", { name: "Generate" });
        await smallGenerate.scrollIntoViewIfNeeded();
        await expect(smallGenerate).toBeInViewport();
        await expect.poll(inBounds).toBe(true);
        if (captureDir) await page.screenshot({ path: join(captureDir, `popover-small-actions-${theme}.png`), animations: "disabled" });
        await l.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setSize(size[0]!, size[1]!), originalSize);
        await expect.poll(inBounds).toBe(true);
        await page.locator("[data-editor-scroller]").evaluate((el) => { el.scrollTop = 0; });
        const returnBelow = prompt.getByRole("button", { name: "Return to selection below", exact: true });
        await expect(returnBelow).toBeVisible();
        await returnBelow.click();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeVisible();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.locator("[data-editor-scroller]").evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await expect(returnAbove).toBeVisible();
        await returnAbove.click();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeVisible();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        await page.emulateMedia({ reducedMotion: "no-preference" });

        await editor.getByRole("heading", { name: "Essay", exact: true }).click();
        const loss = page.getByRole("dialog", { name: "Discard prompt?" });
        await expect(loss).toBeVisible();
        await expect(loss.getByRole("button", { name: "Keep editing", exact: true }).last()).toBeFocused();
        await expect(loss.getByText("Deselecting this text will lose your written prompt.")).toBeVisible();
        if (captureDir) await loss.screenshot({ path: join(captureDir, `popover-loss-${theme}.png`), animations: "disabled" });
        await page.keyboard.press("Escape");
        await expect(loss).toBeHidden();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeFocused();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        await editor.getByRole("heading", { name: "Essay", exact: true }).click();
        await expect(loss).toBeVisible();
        await loss.getByRole("button", { name: "Keep editing", exact: true }).last().click();
        await expect(loss).toBeHidden();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toBeFocused();
        await expect(prompt.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep this exact draft");
        await editor.getByRole("heading", { name: "Essay", exact: true }).click();
        await expect(loss).toBeVisible();
        await loss.getByRole("button", { name: "Discard prompt", exact: true }).click();
        await expect(loss).toBeHidden();
        await expect(prompt).toBeHidden();
        expect(fake.seen).toHaveLength(sentBefore);
        expect(readFileSync(note, "utf8")).toBe(markdown);

        await page.locator("[data-editor-scroller]").evaluate((el) => { el.scrollTop = 0; });
        prompt = await openRewrite(page, "Opening words to rewrite.", "Make it warmer");
        await prompt.getByRole("button", { name: "Generate" }).click();
        await expect(prompt).toBeHidden();
        await expect(editor).toContainText("Rewritten selection.", { timeout: 15_000 });
        await expect(editor).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
        expect(fake.seen).toHaveLength(sentBefore + 1);
        const timings = await page.evaluate(() => ({
          anchors: performance.getEntriesByName("fn:rewrite.anchor").map((entry) => entry.duration),
          deselections: performance.getEntriesByName("fn:rewrite.deselect").map((entry) => entry.duration),
        }));
        expect(timings.anchors.length).toBeGreaterThan(0);
        expect(timings.deselections.length).toBeGreaterThan(0);
        expect(Math.max(...timings.deselections)).toBeLessThanOrEqual(100);
        console.log(`popover ${theme}: anchor max ${Math.max(...timings.anchors).toFixed(2)} ms; deselect max ${Math.max(...timings.deselections).toFixed(2)} ms`);
      } finally {
        if (l) await quit(l);
      }
    }
  } finally {
    await fake.close();
  }
});

test("AIS-13, AIS-14: a private note discloses its integration; Cancel sends nothing and Generate streams directly", async () => {
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

    // No first-send disclosure or permission gate, including in a disposable private note.
    let dialog = await openRewrite(page, "A private thought here.", "Make it kinder");
    await expect(dialog.getByText("This computer", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/Rewrite sends/)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Generate" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(300);
    expect(fake.seen).toHaveLength(0);
    expect(ai().connections[0]!.consent).toBeUndefined();

    // Generate sends directly; no consent metadata is written.
    dialog = await openRewrite(page, "A private thought here.", "Make it kinder");
    await dialog.getByRole("button", { name: "Generate" }).click();
    await expect(dialog).toBeHidden();
    await expect(editor).toContainText("A kinder thought.", { timeout: 15_000 });
    await expect(editor).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
    expect(fake.seen).toHaveLength(1);
    expect(ai().connections[0]!.consent).toBeUndefined();
    await expect.poll(() => readFileSync(diary, "utf8"), PROMPTLY).toContain("A kinder thought.");

    // 5. Remembered: the next rewrite just generates.
    dialog = await openRewrite(page, "A kinder thought.", "Shorter");
    await expect(dialog.getByRole("button", { name: "Generate" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Send" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // Generate ignores legacy settings without rewriting the connection file.
    expect(ai().keepPrivate).toBe(true);
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

test("AIS-16: Settings Default is one list shared with Rewrite", async () => {
  test.setTimeout(180_000);
  const captureDir = process.env.FOCUS_NOTES_AI_LIST_CAPTURES;
  if (captureDir) mkdirSync(captureDir, { recursive: true });
  for (const [count, theme] of [[0, "light"], [1, "light"], [2, "light"], [2, "dark"], [30, "light"]] as const) {
    const dirs = tempDirs();
    const note = join(dirs.docs, "essay.md");
    writeFileSync(note, "# Essay\n\nA few words to rewrite.\n");
    writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, appearance: theme }));
    const aiFile = join(dirs.userData, DATA_FILES.ai);
    const connections = Array.from({ length: count }, (_, i) => ({
      id: `c${i}`, provider: "ollama", name: `Connection ${i}`, endpoint: "http://localhost:11434",
      model: i === 1 ? "gpt-oss:120b-cloud" : "llama3.2",
    }));
    writeFileSync(aiFile, JSON.stringify({ version: 2, writer: count ? "c0" : "", connections }));
    let l: Launched | undefined;
    try {
      l = await launch(dirs);
      if (process.env.FOCUS_NOTES_AI_LIST_PIDS) appendFileSync(process.env.FOCUS_NOTES_AI_LIST_PIDS, `${l.pid}\n`);
      const { page } = l;
      const settings = page.getByRole("dialog", { name: "Settings", exact: true });
      const openSettings = async () => {
        await page.keyboard.press(`${mod}+,`);
        await expect(settings).toBeVisible();
        await settings.getByRole("tab", { name: "AI", exact: true }).click();
      };
      await openSettings();
      const radios = settings.getByRole("radio");
      await expect(radios).toHaveCount(count);
      await expect(settings.getByRole("button", { name: "Writer (used by Rewrite)" })).toHaveCount(0);
      await expect(settings.getByRole("button", { name: "Use as Writer" })).toHaveCount(0);
      await expect(settings.getByRole("heading", { name: "On this computer", exact: true })).toHaveCount(0);
      await expect(settings.getByRole("button", { name: "Find on this PC", exact: true })).toHaveCount(1);
      await expect(settings.getByText("Scans this PC for running AI services you can use.", { exact: true })).toBeVisible();
      if (count) await expect(radios.first()).toBeChecked();
      if (captureDir) await settings.screenshot({ path: join(captureDir, `settings-${count}-${theme}.png`), animations: "disabled" });
      if (count >= 2) {
        const identities = await Promise.all([
          settings.elementHandle(), radios.first().elementHandle(),
          page.getByRole("textbox", { name: "Note" }).elementHandle(),
          page.locator("[data-editor-scroller]").elementHandle(),
        ]);
        await radios.first().focus();
        await page.keyboard.press("ArrowDown");
        await expect(radios.nth(1)).toBeChecked();
        await expect.poll(() => JSON.parse(readFileSync(aiFile, "utf8")).writer, PROMPTLY).toBe("c1");
        await expect(radios.nth(1)).toBeFocused();
        for (const identity of identities) {
          expect(await identity!.evaluate((node) => node.isConnected)).toBe(true);
          await identity!.dispose();
        }
        await radios.first().focus();
        await page.keyboard.press("Space");
        await expect(radios.first()).toBeChecked();
        await radios.nth(1).check();
        await expect.poll(() => JSON.parse(readFileSync(aiFile, "utf8")).writer, PROMPTLY).toBe("c1");
        const row = settings.locator("[data-item-card]").filter({ has: page.getByRole("radio", { name: "Default: Connection 0", exact: true }) });
        await row.getByRole("button", { name: "Change", exact: true }).click();
        expect(JSON.parse(readFileSync(aiFile, "utf8")).writer).toBe("c1");
        await settings.getByRole("button", { name: "Done", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(settings).toBeHidden();
        const dialog = await openRewrite(page, "A few words to rewrite.", "Keep my draft");
        await expect(dialog.getByText("gpt-oss:120b-cloud", { exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "AI integration", exact: true }).click();
        await page.getByRole("menuitemcheckbox", { name: /Connection 0/ }).click();
        await expect.poll(() => JSON.parse(readFileSync(aiFile, "utf8")).writer, PROMPTLY).toBe("c0");
        await expect(dialog.getByRole("textbox", { name: "Prompt" })).toHaveValue("Keep my draft");
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
        await openSettings();
        await expect(radios.first()).toBeChecked();
        await page.setViewportSize({ width: 480, height: 640 });
        if (captureDir) await settings.screenshot({ path: join(captureDir, `settings-${count}-${theme}-narrow.png`), animations: "disabled" });
        await row.getByRole("button", { name: "Remove", exact: true }).click();
        await expect.poll(() => JSON.parse(readFileSync(aiFile, "utf8")).writer, PROMPTLY).toBe("");
        await expect(settings.locator('input[type="radio"]:checked')).toHaveCount(0);
      }
    } finally {
      if (l) await quit(l);
    }
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

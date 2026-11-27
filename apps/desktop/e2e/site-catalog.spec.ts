/**
 * The product site's screenshots (D-169, D-174, WP-10.4 brought forward): a curated demo workspace,
 * each scene the landing page shows, captured from the app's own window (webContents.capturePage,
 * never the screen, D-141) as lossless PNG with its shadow's alpha, into test-results/site-capture/.
 * tools/site/scenes.py then sets each on the wallpaper as a 2560 × 1440 desktop scene (D-176).
 * The Microsoft Store's screenshots have their own journey (store-catalog.spec.ts, D-223).
 *
 * Opt in with `FOCUS_NOTES_CAPTURE_SITE=1` (and `FOCUS_NOTES_E2E=1`). `FOCUS_NOTES_SITE_OUT` names the
 * folder. The window is 1440 × 900 unless `FOCUS_NOTES_SITE_WINDOW_W`/`_H` say otherwise.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { quit, type Launched } from "./helpers.ts";
import { files, reset, mod } from "./surfaces.ts";
import { repoRoot } from "./github-world.ts";
import { captureWindow, fullNote, openNote, openThemes, startDemo } from "./scene-capture.ts";
import { expectNoGlobeUnderPrivate, publishedRow, PUBLISHED, sharedRow, SHARED, startSharedProject } from "./scene-sharing.ts";

test.skip(process.env.FOCUS_NOTES_CAPTURE_SITE !== "1", "Opt in with FOCUS_NOTES_CAPTURE_SITE=1");

/** The window's size (D-176), and where the lossless captures go; tools/site/scenes.py makes the site's images from them. */
const WINDOW = { width: Number(process.env.FOCUS_NOTES_SITE_WINDOW_W ?? 1440), height: Number(process.env.FOCUS_NOTES_SITE_WINDOW_H ?? 900) };
const PNG_OUT = process.env.FOCUS_NOTES_SITE_OUT ?? join(repoRoot, "test-results", "site-capture");

// A large window, as on a 2560 × 1440 desktop (D-176).
const start = (theme: "light" | "dark") => startDemo({ size: WINDOW, theme });
const capture = (l: Launched, name: string, opts?: { hover?: boolean }) => captureWindow(l, PNG_OUT, name, opts);

// Every scene in light and dark, so the page can show either (D-176, D-437).
for (const theme of ["light", "dark"] as const) {
  test(`D-176: the hero and the theme gallery, ${theme}`, async () => {
    test.setTimeout(180_000);
    const l = await start(theme);
    const { page } = l;
    // The hero never uses focus mode.
    await fullNote(page);
    await capture(l, `note-${theme}`);
    await openThemes(page);
    await capture(l, `themes-${theme}`);
    await quit(l);
  });

  // D-437: a project in use: Open's Projects cards, Files with its opened tabs and the shared and published marks,
  // and Share details over the note.
  test(`D-437: projects, files and share details, ${theme}`, async () => {
    test.setTimeout(240_000);
    const { l, page, close } = await startSharedProject({ theme, size: WINDOW });
    const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    try {
      await fullNote(page);
      await page.keyboard.press("Control+Alt+O");
      const open = page.getByRole("dialog", { name: "Open", exact: true });
      await expect(open).toBeVisible();
      for (const name of ["Essays", "Book draft", "Garden club"]) await expect(open.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await blur();
      await capture(l, `projects-${theme}`);
      await page.keyboard.press("Escape");
      await expect(open).toBeHidden();
      await page.getByRole("textbox", { name: "Note" }).focus();

      // The published note open last: its row has focus in Files, so its badge's tooltip says who can read it; the
      // shared note's row shows its own badge. (Sharing gives a note an id in front matter, so it isn't the one shown.)
      for (const title of ["Reading list", SHARED, PUBLISHED]) await openNote(page, title);
      await fullNote(page);
      await files(page);
      const shared = sharedRow(page);
      await expect(publishedRow(page)).toBeFocused();
      await expect(shared.locator("[data-site-marks]")).toBeVisible();
      await expectNoGlobeUnderPrivate(page);
      await expect(page.getByRole("tooltip")).toHaveCount(1);
      await capture(l, `files-${theme}`);
      await reset(page);

      // Share details for the note that's open behind it: the dialog names the note whose title the page shows.
      await openNote(page, SHARED);
      await fullNote(page);
      const editor = page.getByRole("textbox", { name: "Note" });
      const openTitle = (await editor.locator("h1").first().textContent())?.trim() ?? "";
      expect(openTitle).toBe(SHARED);
      await expect(editor).not.toContainText("id:");
      await page.keyboard.press(`${mod}+Shift+E`);
      await shared.click({ button: "right" });
      await page.getByRole("menuitem", { name: "Share details…", exact: true }).click();
      const details = page.getByRole("dialog", { name: "Share details", exact: true });
      await expect(details).toBeVisible();
      await expect(details.getByText(openTitle, { exact: true })).toBeVisible();
      await expect(details.getByRole("button", { name: "Withdraw", exact: true })).toBeVisible();
      await capture(l, `share-details-${theme}`);
    } finally {
      await close();
    }
  });

  // D-437: AI editing: Rewrite over a selected paragraph with a model on this computer (a local fake, "Ollama ·
  // llama3.2"): the prompt, then the answer arriving in place of the paragraph.
  test(`D-437: AI rewrite, ${theme}`, async () => {
    test.setTimeout(180_000);
    const fake = await fakeModel();
    const l = await startDemo({ size: WINDOW, theme, setup: (dirs) => writeFileSync(join(dirs.userData, DATA_FILES.ai), JSON.stringify({
      version: 2, writer: "local",
      connections: [{ id: "local", provider: "ollama", name: "Ollama", endpoint: fake.endpoint, model: "llama3.2" }],
    })) });
    const { page } = l;
    try {
      await fullNote(page);
      await selectText(page, PARAGRAPH);
      await page.keyboard.press(`${mod}+Shift+R`);
      const rewrite = page.getByRole("region", { name: "Rewrite", exact: true });
      await expect(rewrite).toBeVisible();
      await rewrite.getByRole("textbox", { name: "Prompt" }).fill("Make it warmer, and a little shorter");
      await toTop(page);
      await capture(l, `ai-prompt-${theme}`);
      await rewrite.getByRole("button", { name: "Generate" }).click();
      const editor = page.getByRole("textbox", { name: "Note" });
      await expect(editor).toContainText(ANSWER.slice(0, HOLD).join(""), { timeout: 30_000 });
      await expect(editor).toHaveAttribute("aria-busy", "true");
      // The answer arriving in place of the paragraph, the model named in the status (a finished rewrite reads as plain text).
      await toTop(page);
      await capture(l, `ai-rewrite-${theme}`);
      fake.release();
      await expect(editor).toContainText(ANSWER.join(""), { timeout: 30_000 });
    } finally {
      await quit(l);
      await fake.close();
    }
  });
}

const PARAGRAPH = "So I keep the screen quiet. One note, one line at a time, and the rest of the page fades back until I'm ready to read it again.";
const HOLD = 5;
const ANSWER = ["So I keep ", "the room quiet: ", "one note, ", "one gentle line at a time, ", "while the rest of the page ", "rests until I'm ready for it."];

/** A model on this computer that speaks Ollama's API, streaming ANSWER and holding before chunk HOLD until `release`; nothing leaves the machine. */
async function fakeModel() {
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ models: [{ name: "llama3.2" }] })); return; }
    if (req.url !== "/api/chat") { res.writeHead(404).end(); return; }
    req.resume();
    req.on("end", async () => {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const [i, content] of ANSWER.entries()) {
        if (i === HOLD) await held;
        res.write(`${JSON.stringify({ model: "llama3.2", message: { role: "assistant", content }, done: false })}\n`);
        await new Promise((r) => setTimeout(r, 30));
      }
      res.end(`${JSON.stringify({ model: "llama3.2", message: { role: "assistant", content: "" }, done: true })}\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    release,
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>((resolve) => { release(); server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

/** The note scrolled to its top: the title whole below the status dot, nothing faded at the top edge. */
const toTop = (page: Page) => page.evaluate(() => {
  for (let el = document.querySelector("[data-editor]")?.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = 0;
});

/** Selects `text` in the note, as a drag would. */
async function selectText(page: Page, text: string) {
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

/** Every built-in theme (packages/tokens/src/themes), light and dark, for the landing page's theme swatches (D-176). */
export const SITE_THEMES = {
  light: ["paper", "sepia", "harbor-light", "forest-light", "contrast-light"],
  dark: ["ink", "dusk", "harbor-dark", "forest-dark", "contrast-dark"],
} as const;

test("D-176: the same note in every built-in theme, light and dark", async () => {
  test.setTimeout(300_000);
  for (const mode of ["light", "dark"] as const) {
    const l = await start(mode);
    const { page } = l;
    await fullNote(page);
    // The theme gallery lists the light themes, then the dark ones, in SITE_THEMES' order.
    for (const [i, id] of SITE_THEMES[mode].entries()) {
      await openThemes(page);
      const tiles = page.getByRole("complementary", { name: "Theme" }).getByRole("option");
      await expect(tiles).toHaveCount(SITE_THEMES.light.length + SITE_THEMES.dark.length);
      await tiles.nth(mode === "light" ? i : SITE_THEMES.light.length + i).click();
      await reset(page);
      await page.keyboard.press(`${mod}+Home`);
      await capture(l, `theme-${id}`);
    }
    await quit(l);
  }
});

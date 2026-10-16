/**
 * DSK-06 (D-179, UC-CANVAS-04): a note in a window of its own. Spotlight's Mod+Enter opens the note in
 * a new window, cascaded from this one, shown on its first themed frame (DSK-09) and drawn by the app
 * with its own frame (it drags by itself); this window keeps its note. Two windows on one note never
 * write over each other (DEF-26): the second to save is told the note changed, or saves on top of the
 * first's text.
 */
import { test, expect, type Page } from "./fixtures.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit } from "./helpers.ts";
import { instance } from "./instance.ts";
import { axeViolations } from "./axe.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const custom = process.platform !== "darwin";

async function openInNewWindow(page: Page, query: string) {
  await page.keyboard.press(`${mod}+/`);
  const spotlight = page.getByRole("dialog", { name: "Spotlight" });
  await spotlight.waitFor();
  await page.keyboard.type(query);
  await expect(spotlight.getByRole("option").first()).toContainText(query);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(spotlight).toHaveCount(0);
}

test("DSK-06: Mod+Enter in Spotlight opens a note in a new window on its first themed frame; each window keeps its note, drags by itself, and two windows never save over each other", async () => {
  const { dirs } = instance();
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  const { app, page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toContainText("First line.");

  // A different note in a new window: this window keeps Welcome.
  const second = app.waitForEvent("window");
  await openInNewWindow(page, "Hello");
  const page2 = await second;
  const editor2 = page2.getByRole("textbox", { name: "Note" });
  await expect(editor2.getByRole("heading", { level: 1 })).toHaveText("Hello");
  await expect(editor).toContainText("First line.");
  // Shown on its first themed frame, never before it was painted (DSK-09, D-149).
  await expect.poll(() => l.log.filter((x) => x.includes("window-shown on=first-frame")).length).toBe(2);
  expect(l.log.filter((x) => x.includes("window-shown on=timeout"))).toEqual([]);
  expect(await page2.evaluate(() => performance.getEntriesByName("fn:window.firstFrame").length)).toBe(1);
  // Cascaded from the first, both on screen.
  const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().includes("index.html")).map((w) => ({ url: w.webContents.getURL(), b: w.getBounds() })));
  const [b1, b2] = await bounds().then((all) => [all.find((w) => !w.url.includes("note="))!.b, all.find((w) => w.url.includes("note="))!.b]);
  expect(b2!.x - b1!.x).toBe(32);
  expect(b2!.y - b1!.y).toBe(32);
  expect(await axeViolations(page2)).toEqual([]);

  if (custom) {
    // Its own frame: a drag on the second window's band moves it, never the first.
    await page2.evaluate(() => {
      const w = (window as unknown as { focusNotes: { window: { drag(p: string, k: string, x: number, y: number, s: boolean): void } } }).focusNotes.window;
      w.drag("start", "move", 400, 300, false);
      w.drag("move", "move", 440, 330, false);
      w.drag("end", "move", 440, 330, false);
    });
    await expect.poll(async () => {
      const all = await bounds();
      const n1 = all.find((w) => !w.url.includes("note="))!.b;
      const n2 = all.find((w) => w.url.includes("note="))!.b;
      return { first: [n1.x, n1.y], second: [n2.x - b2!.x, n2.y - b2!.y] };
    }).toEqual({ first: [b1!.x, b1!.y], second: [40, 30] });
  }

  // The same note in two windows: neither ever saves over the other (DEF-26).
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  await editor.focus();
  await page.keyboard.press(`${mod}+End`);
  const third = app.waitForEvent("window");
  await openInNewWindow(page, "Welcome");
  const page3 = await third;
  const editor3 = page3.getByRole("textbox", { name: "Note" });
  await expect(editor3).toContainText("First line.");
  await editor3.focus();
  await page3.keyboard.press(`${mod}+End`);
  await page3.keyboard.type(" Typed in the other window.");
  await editor.focus();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" Typed in the first window.");
  await page.keyboard.press(`${mod}+S`);
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 10_000 }).toContain("Typed in the first window.");
  await page3.keyboard.press(`${mod}+S`);
  await page3.waitForTimeout(1500);
  // The first window's words are never lost; the other window's are saved on top of them, or it says
  // the note changed and keeps them until a choice is made.
  const onDisk = readFileSync(note, "utf8");
  expect(onDisk).toContain("Typed in the first window.");
  if (!onDisk.includes("Typed in the other window.")) {
    await expect(page3.locator("#toasts").getByText("“Welcome” changed outside Focus Notes. Your edits are kept here, and aren't saved over it until you choose.")).toBeVisible();
    await expect(editor3).toContainText("Typed in the other window.");
    // Keep both: the first window's text stays at the note, this one's goes next to it as a copy.
    await page3.keyboard.press(`${mod}+S`);
    const dialog = page3.getByRole("dialog", { name: "“Welcome” changed outside Focus Notes" });
    await dialog.getByRole("button", { name: "Keep both" }).click();
    await expect(dialog).toHaveCount(0);
    expect(readFileSync(note, "utf8")).toContain("Typed in the first window.");
  }

  // Closing a window for a note leaves the first one, and its note, as they were.
  for (const p of [page3, page2]) {
    const closed = p.waitForEvent("close");
    await p.evaluate(() => (window as unknown as { focusNotes: { window: { close(): void } } }).focusNotes.window.close());
    await closed;
  }
  await expect(editor).toContainText("Typed in the first window.");
  const state = JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8")) as { lastNotePath?: string };
  expect(state.lastNotePath?.endsWith("welcome.md")).toBe(true);
  await quit(l);
});

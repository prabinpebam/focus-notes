/**
 * The M0 demo script as a journey test (Implementation plan → M0). It runs on every build from
 * now on, so this stage's promise can't regress (PD-DOD-03).
 */
import { test, expect } from "./fixtures.ts";
import { axeViolations } from "./axe.ts";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs, windowBox } from "./helpers.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";

// PKG-03: the desktop app is Electron wrapping the same views the web build renders, with native file access.
test("M0: launch to the blank canvas, type, save as Markdown, and reopen", async () => {
  const dirs = tempDirs();
  const first = await launch(dirs);
  const { page } = first;

  // Launch: only the canvas and the trigger (UI-01, UI-02), with the caret ready in time (PRF-02).
  const trigger = page.getByRole("button", { name: "Focus Notes menu" });
  await expect(trigger).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Note" });
  await expect(editor).toBeFocused();
  // PRF-02 is defined on reference hardware; CI runners are checked by pnpm bench with a margin.
  const ready = await first.readyMs();
  if (!process.env.CI) expect(ready).toBeLessThan(2500);
  // The only thing showing is the trigger. On Windows and Linux the window buttons are there too,
  // hidden until the pointer reaches the band or they have focus (DD-DSK-04).
  const windowButtons = await page.getByRole("group", { name: "Window controls" }).getByRole("button").count();
  expect(await page.getByRole("button").count() - windowButtons).toBe(1);
  // (They also show while the window isn't the active one: m2-titlebar.spec.ts.)
  if (process.platform !== "darwin") await expect(page.getByRole("group", { name: "Window controls" })).toHaveCSS("opacity", "0");

  // The trigger: a 10 px dot in a 30 px circle, at the top center of the window (drawn inside a
  // shadow margin on Windows and Linux, D-14).
  const ring = await trigger.boundingBox();
  const dot = await trigger.locator("span").boundingBox();
  const win = await windowBox(page);
  expect(Math.round(ring!.width)).toBe(30);
  expect(Math.round(dot!.width)).toBe(10);
  expect(Math.abs(ring!.x + ring!.width / 2 - (win.left + win.width / 2))).toBeLessThan(1.5);
  // 40 px below the window's top edge (UI-10, D-78).
  expect(Math.abs(ring!.y - win.top - 40)).toBeLessThan(1.5);

  // Type a heading and two paragraphs into the welcome note.
  await page.keyboard.press(`${mod}+A`);
  await page.keyboard.press("Delete");
  await page.keyboard.type("# Hello Focus\n");
  await page.keyboard.type("First paragraph with some words.\n");
  await page.keyboard.type("Second paragraph.");
  const note = join(dirs.docs, "Welcome.md");
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 5000 }).toBe("# Hello Focus\n\nFirst paragraph with some words.\n\nSecond paragraph.\n");

  // No network, ever (PRV-01).
  expect(first.log.filter((l) => l.includes("blocked request"))).toEqual([]);

  // Accessibility (A11Y-01): no axe violations on the canvas.
  expect(await axeViolations(page)).toEqual([]);

  await quit(first);

  // Relaunch: the note is back, with the caret at the end.
  const second = await launch(dirs);
  const editor2 = second.page.getByRole("textbox", { name: "Note" });
  await expect(editor2).toContainText("Second paragraph.");
  await expect(editor2).toBeFocused();
  await second.page.keyboard.type(" More.");
  await expect.poll(() => readFileSync(note, "utf8"), { timeout: 5000 }).toBe("# Hello Focus\n\nFirst paragraph with some words.\n\nSecond paragraph. More.\n");
  await quit(second);
});

test("M0: pending changes are saved when the window closes", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await l.page.keyboard.press(`${mod}+A`);
  await l.page.keyboard.type("Closing right away");
  await quit(l);
  expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe("Closing right away\n");
});

test("M0: light and dark follow the shortcut and persist (THM-06)", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  const theme = () => l.page.evaluate(() => document.documentElement.dataset.theme);
  const before = await theme();
  await l.page.keyboard.press(`${mod}+Shift+L`);
  await expect.poll(theme).not.toBe(before);
  // The window's canvas: the page itself on macOS, the window drawn inside it on Windows and Linux.
  const bg = await l.page.evaluate(() => getComputedStyle(document.querySelector("[data-app-root]")!).backgroundColor);
  expect(bg).toBe((await theme()) === "ink" ? "rgb(26, 26, 28)" : "rgb(251, 250, 247)");
  const after = await theme();
  await quit(l);
  const again = await launch(dirs);
  await expect(again.page.getByRole("textbox", { name: "Note" })).toBeVisible();
  await expect.poll(() => again.page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
  await quit(again);
});

test("M0: an existing file round-trips byte for byte when untouched (EDT-10)", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await quit(l);
  const note = join(dirs.docs, "Welcome.md");
  expect(existsSync(note)).toBe(true);
  const odd = "Setext title\n============\n\n* star list\n* item\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(note, odd);
  const l2 = await launch(dirs);
  await expect(l2.page.getByRole("textbox", { name: "Note" })).toContainText("star list");
  await l2.page.waitForTimeout(800);
  await quit(l2);
  expect(readFileSync(note, "utf8")).toBe(odd);
});

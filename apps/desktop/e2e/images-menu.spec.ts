import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import type { Locator, Page } from "@playwright/test";
import { launch, quit, tempDirs, PROMPTLY } from "./helpers.ts";

function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const original = "# Images\n\nFirst paragraph.\n\n![Red square](red.png)\n\nMiddle words.\n\n<!-- image: rounded -->\n![Blue square](blue.png)\n\nLast.\n";
function sample() {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "red.png"), png(300, 120, [200, 30, 30]));
  writeFileSync(join(dirs.docs, "blue.png"), png(120, 80, [30, 30, 200]));
  writeFileSync(join(dirs.docs, "Welcome.md"), original);
  return dirs;
}
async function close(launched: Awaited<ReturnType<typeof launch>>) {
  try { await quit(launched); }
  finally {
    const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(launched.pid), ...flags], { stdio: "inherit" });
  }
}

async function imageMenu(page: Page, image: Locator) {
  await expect.poll(() => image.evaluate((el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0)).toBe(true);
  await image.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const bounds = await image.boundingBox();
  expect(bounds).not.toBeNull();
  const height = await page.evaluate(() => innerHeight);
  const top = Math.max(bounds!.y, 80);
  const bottom = Math.min(bounds!.y + bounds!.height, height - 100);
  expect(bottom).toBeGreaterThan(top);
  const point = { x: bounds!.x + bounds!.width / 2, y: top + Math.min(24, (bottom - top) / 2) };
  await page.mouse.click(point.x, point.y, { button: "right" });
  return point;
}

test("IMG-11: clicking an image selects its outline; Delete and Backspace remove only its reference, and Undo restores it", async () => {
  const dirs = sample();
  const launched = await launch(dirs);
  try {
    const { page } = launched;
    const red = page.getByRole("img", { name: "Red square", exact: true });
    const selected = page.locator("[data-image-node] [data-selected]");
    await red.click();
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveCSS("outline-style", "solid");
    await expect.poll(() => selected.evaluate((el) => Number.parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThan(0);
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    for (const key of ["Delete", "Backspace"]) {
      await page.keyboard.press(key);
      await expect(red).toHaveCount(0);
      await expect(page.getByRole("img", { name: "Blue square", exact: true })).toBeVisible();
      await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).not.toContain("![Red square]");
      expect(existsSync(join(dirs.docs, "red.png"))).toBe(true);
      await page.keyboard.press("Control+z");
      await expect(red).toBeVisible();
      await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original);
      await red.click();
    }
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu", { name: "Image options", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(selected).toHaveCount(0);
    await page.keyboard.press("Control+a");
    const bounds = await red.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await expect(selected).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
  } finally { await close(launched); }
});

test("IMG.9: description and caption save together, render below the image, Undo, and survive reopen", async () => {
  const dirs = sample();
  let launched = await launch(dirs);
  try {
    let { page } = launched;
    const notePath = join(dirs.docs, "Welcome.md");
    const red = page.getByRole("img", { name: "Red square", exact: true });
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Edit description…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Image description", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Image description", exact: true }).fill("A red rectangle");
    await dialog.getByRole("textbox", { name: "Caption", exact: true }).fill('Red "caption" & detail');
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const described = page.getByRole("img", { name: "A red rectangle", exact: true });
    await expect(described).toBeVisible();
    await expect(page.locator("figcaption[data-image-caption]")).toHaveText('Red "caption" & detail');
    await expect.poll(() => readFileSync(notePath, "utf8"), PROMPTLY).toContain('![A red rectangle](red.png "Red \\"caption\\" & detail")');
    await described.click();
    await page.keyboard.press("Control+z");
    await expect(red).toBeVisible();
    await expect(page.locator("figcaption[data-image-caption]")).toHaveCount(0);
    await expect.poll(() => readFileSync(notePath, "utf8"), PROMPTLY).toBe(original);
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Add caption", exact: true }).click();
    const caption = page.getByRole("textbox", { name: "Caption", exact: true });
    await expect(caption).toBeFocused();
    await caption.pressSequentially("Hand written caption");
    await caption.press("Enter");
    await expect(page.locator("figcaption[data-image-caption]")).toHaveText("Hand written caption");
    await expect.poll(() => readFileSync(notePath, "utf8"), PROMPTLY).toContain('![Red square](red.png "Hand written caption")');
    await close(launched);
    launched = await launch(dirs);
    page = launched.page;
    await expect(page.locator("figcaption[data-image-caption]")).toHaveText("Hand written caption");
    await imageMenu(page, page.getByRole("img", { name: "Red square", exact: true }));
    await page.getByRole("menuitem", { name: "Edit caption", exact: true }).click();
    await page.getByRole("textbox", { name: "Caption", exact: true }).fill("");
    await page.getByRole("textbox", { name: "Caption", exact: true }).press("Enter");
    await expect(page.locator("figcaption")).toHaveCount(0);
    await expect.poll(() => readFileSync(notePath, "utf8"), PROMPTLY).toBe(original);
  } finally { await close(launched); }
});

test("IMG-11: a mixed right-click on text or an image keeps the text actions and adds mixed image options; one Undo restores all", async () => {
  const dirs = sample();
  const launched = await launch(dirs);
  try {
    const { page } = launched;
    const note = page.getByRole("textbox", { name: "Note", exact: true });
    const rounded = page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true });
    for (const target of [page.getByText("Middle words.", { exact: true }), page.getByRole("img", { name: "Red square", exact: true })]) {
      await note.focus();
      await page.keyboard.press("Control+a");
      // The image relinquishes its hit target to the editable selection before right-clicking it.
      await expect(page.locator("[data-image-node]").first()).toHaveCSS("pointer-events", "none");
      const bounds = await target.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2, { button: "right" });
      await expect(page.getByRole("menuitem", { name: /^Copy(?:\s|$)/ })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /^Paste(?:\s|$)/ }).first()).toBeVisible();
      await expect(page.getByText("Images · 2 selected", { exact: true })).toBeVisible();
      await expect(rounded).toHaveAttribute("aria-checked", "mixed");
      await expect(page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true })).toHaveAttribute("aria-checked", "true");
      await expect(page.getByRole("menuitemcheckbox", { name: "Column", exact: true })).toHaveCount(0);
      await rounded.click();
      await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original.replace("![Red square]", "<!-- image: rounded -->\n![Red square]"));
      for (const image of await page.locator("[data-image-node] img").all()) {
        await expect.poll(() => image.evaluate((el) => Number.parseFloat(getComputedStyle(el.parentElement!).borderRadius))).toBeGreaterThan(0);
      }
      await page.keyboard.press("Control+z");
      await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original);
    }
    await page.getByText("Middle words.", { exact: true }).click();
    await page.getByText("Middle words.", { exact: true }).click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: /^Paste(?:\s|$)/ }).first()).toBeVisible();
    await expect(rounded).toHaveCount(0);
  } finally { await close(launched); }
});

test("IMG-11: the single-image menu groups its choices at the pointer; both toggles persist exact bytes and render after reopening", async () => {
  const dirs = sample();
  writeFileSync(join(dirs.docs, "red.png"), png(120, 1200, [200, 30, 30]));
  const launched = await launch(dirs);
  try {
    const { page } = launched;
    const red = page.getByRole("img", { name: "Red square", exact: true });
    const menu = page.getByRole("menu", { name: "Image options", exact: true });
    await expect.poll(() => red.evaluate((el: HTMLImageElement) => el.naturalHeight)).toBe(1200);
    await red.click();
    await expect(page.locator("[data-image-node] [data-selected]")).toHaveCount(1);
    const point = await imageMenu(page, red);
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Display", { exact: true })).toBeVisible();
    const bounds = await page.locator("[data-text-menu]").boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.x - point.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.y - point.y)).toBeLessThanOrEqual(1);
    const labels = await menu.locator("[role^=menuitem]").allTextContents();
    expect(labels.map((label) => label.trim())).toEqual(["Edit description…", "Add caption", "Edit image", "✓Column", "Wide", "Actual size", "Rounded corners", "✓Limit height"]);
    await page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true }).click();
    const roundedBytes = original.replace("![Red square]", "<!-- image: rounded -->\n![Red square]");
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(roundedBytes);
    await expect.poll(() => red.evaluate((el) => Number.parseFloat(getComputedStyle(el.parentElement!).borderRadius))).toBeGreaterThan(0);
    const limitedHeight = await red.evaluate((el) => el.getBoundingClientRect().height);
    await imageMenu(page, red);
    await expect(page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true }).click();
    const unlimitedBytes = roundedBytes.replace("<!-- image: rounded -->", "<!-- image: rounded unlimited -->");
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(unlimitedBytes);
    await expect(red).toHaveCSS("max-height", "none");
    expect(await red.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(limitedHeight);
    await page.reload();
    await expect(red).toHaveCSS("max-height", "none");
    await expect.poll(() => red.evaluate((el) => Number.parseFloat(getComputedStyle(el.parentElement!).borderRadius))).toBeGreaterThan(0);
    await imageMenu(page, red);
    await expect(page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true })).toHaveAttribute("aria-checked", "false");
  } finally { await close(launched); }
});

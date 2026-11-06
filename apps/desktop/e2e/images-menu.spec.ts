import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { Locator, Page } from "@playwright/test";
import { launch, quit, tempDirs, PROMPTLY } from "./helpers.ts";

function png(width: number, height: number, rgb: [number, number, number], noise = false): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let seed = 123456789;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (noise) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; }
    raw.set(noise ? [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255] : rgb, y * (width * 3 + 1) + 1 + x * 3);
  }
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
const naturalSize = (image: Locator) => image.evaluate(el => el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : []);

test("IMG-EDIT-appearance: approved toolbar stays usable in light, dark and narrow", async ({}, testInfo) => {
  const dirs = sample();
  const launched = await launch(dirs);
  try {
    const { page } = launched;
    for (const width of [1024, 360]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 780 });
      await page.mouse.move(20, 20);
      const themeId = theme === "light" ? "paper" : "ink";
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== themeId) {
        await page.locator(".tiptap").focus();
        await page.keyboard.press("Control+.");
        await page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "Switch light and dark", exact: true }).press("Space");
        await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(themeId);
        await page.keyboard.press("Escape");
      }
      await imageMenu(page, page.getByRole("img", { name: "Red square", exact: true }));
      await page.getByRole("menuitem", { name: "Edit image", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit image", exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("spinbutton", { name: "Width (px)" }).fill("180");
      await dialog.getByRole("spinbutton", { name: "Height (px)" }).fill("100");
      await dialog.getByRole("button", { name: "Aspect ratio", exact: true }).click();
      await page.getByRole("menuitemcheckbox", { name: "1:1", exact: true }).click();
      await expect(dialog.getByRole("spinbutton", { name: "Width (px)" })).toHaveValue("100");
      await expect(dialog.getByRole("spinbutton", { name: "Height (px)" })).toHaveValue("100");
      await expect(dialog.getByRole("button", { name: "Lock aspect ratio", exact: true })).toHaveAttribute("aria-pressed", "true");
      await dialog.getByRole("spinbutton", { name: "Width (px)" }).fill("9999");
      await expect(dialog.getByText("Adjusted to fit the image. Use positive whole-pixel dimensions within its bounds.", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("spinbutton", { name: "Width (px)" })).toHaveValue("120");
      for (const label of ["Rotate left", "Rotate right", "Flip horizontal", "Flip vertical", "Reset"]) await expect(dialog.getByRole("button", { name: label, exact: true })).toBeInViewport();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`crop-built-${theme}-${width}.png`) });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(original);
  } finally { await close(launched); }
});

test("IMG-EDIT: cropped copy is visible, Undo and Restore original retain both files across reopen", async ({}, testInfo) => {
  const dirs = sample();
  const source = png(300, 120, [200, 30, 30], true);
  writeFileSync(join(dirs.docs, "red.png"), source);
  let launched: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    launched = await launch(dirs);
    const { page } = launched;
    const red = page.getByRole("img", { name: "Red square", exact: true });
    await imageMenu(page, red);
    const rightPixel = await red.evaluate(el => {
      if (!(el instanceof HTMLImageElement)) throw new Error("Missing original image");
      const canvas = document.createElement("canvas");
      canvas.width = el.naturalWidth; canvas.height = el.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el, 0, 0);
      return [...ctx.getImageData(el.naturalWidth - 1, 0, 1, 1).data];
    });
    await page.getByRole("menuitem", { name: "Edit image", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit image", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("spinbutton", { name: "Width (px)" }).fill("180");
    await dialog.getByRole("button", { name: "Flip horizontal", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Height (px)" }).fill("90");
    await dialog.getByRole("spinbutton", { name: "Width (px)" }).press("ArrowUp");
    await expect(dialog.getByRole("spinbutton", { name: "Width (px)" })).toHaveValue("181");
    await dialog.getByRole("spinbutton", { name: "Width (px)" }).press("Shift+ArrowDown");
    await expect(dialog.getByRole("spinbutton", { name: "Width (px)" })).toHaveValue("171");
    await dialog.getByRole("spinbutton", { name: "Width (px)" }).fill("180");
    await page.screenshot({ path: testInfo.outputPath("crop-built-light.png") });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect.poll(() => naturalSize(red), PROMPTLY).toEqual([180, 90]);
    expect(await red.evaluate(el => {
      if (!(el instanceof HTMLImageElement)) throw new Error("Missing cropped image");
      const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(el, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    })).toEqual(rightPixel);
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain("original=red.png");
    const cropped = readFileSync(join(dirs.docs, "Welcome.md"), "utf8");
    const relative = /!\[Red square\]\(([^)]+)\)/.exec(cropped)![1]!;
    const copy = join(dirs.docs, relative);
    expect(copy).not.toBe(join(dirs.docs, "red.png"));
    expect(readFileSync(copy).readUInt32BE(16)).toBe(180);
    expect(readFileSync(join(dirs.docs, "red.png"))).toEqual(source);
    await page.locator(".tiptap").press("Control+z");
    await expect.poll(() => naturalSize(red), PROMPTLY).toEqual([300, 120]);
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original);
    expect(existsSync(copy)).toBe(true);
    await page.locator(".tiptap").press("Control+Shift+z");
    await expect.poll(() => naturalSize(red), PROMPTLY).toEqual([180, 90]);
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(cropped);
    await close(launched); launched = undefined;
    launched = await launch(dirs);
    const reopened = launched.page.getByRole("img", { name: "Red square", exact: true });
    await expect.poll(() => naturalSize(reopened), PROMPTLY).toEqual([180, 90]);
    await imageMenu(launched.page, reopened);
    await launched.page.getByRole("menuitem", { name: "Restore original", exact: true }).click();
    await expect.poll(() => naturalSize(reopened), PROMPTLY).toEqual([300, 120]);
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original);
    expect(existsSync(copy)).toBe(true);
    expect(readFileSync(join(dirs.docs, "red.png"))).toEqual(source);
    await launched.page.locator(".tiptap").press("Control+z");
    await expect.poll(() => naturalSize(reopened), PROMPTLY).toEqual([180, 90]);
  } finally { if (launched) await close(launched); }
});

test("IMG-AI: connected vision integration gets bounded pixels only; review, Undo and Stop preserve the note", async () => {
  const dirs = sample();
  const initial = original.replace("![Red square](red.png)", '![Red square](red.png "Old caption")');
  writeFileSync(join(dirs.docs, "Welcome.md"), initial);
  writeFileSync(join(dirs.docs, "red.png"), png(2300, 1400, [200, 30, 30], true));
  expect(readFileSync(join(dirs.docs, "red.png")).length).toBeGreaterThan(5 * 1024 * 1024);
  const requests: { model: string; messages: { role: string; content: string; images?: string[] }[] }[] = [];
  let hanging = false;
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const input = JSON.parse(body);
      if (request.url === "/api/show") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ capabilities: input.model === "vision" ? ["completion", "vision"] : ["completion"] }));
      } else {
        requests.push(input);
        response.setHeader("content-type", "application/x-ndjson");
        response.write(JSON.stringify({ message: { content: "Generated caption." }, done: false }) + "\n");
        if (!hanging) response.end(JSON.stringify({ done: true }) + "\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Caption test server unavailable");
  const connection = { provider: "ollama", endpoint: `http://127.0.0.1:${address.port}`, deployment: "", apiVersion: "", account: "" };
  writeFileSync(join(dirs.userData, "ai.json"), JSON.stringify({ version: 2, writer: "writer", connections: [
    { ...connection, id: "writer", name: "Text writer", model: "writer" }, { ...connection, id: "vision", name: "Vision integration", model: "vision" },
  ] }));
  let launched: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    launched = await launch(dirs);
    const { page } = launched;
    const red = page.getByRole("img", { name: "Red square", exact: true });
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Auto caption with AI…", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Auto caption with AI", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Generate caption" })).toBeDisabled();
    expect(requests).toEqual([]);
    await dialog.getByRole("button", { name: "AI integration", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: /Vision integration/ }).click();
    await dialog.getByRole("textbox", { name: "Instruction", exact: true }).fill("Only a short caption.");
    await dialog.getByRole("button", { name: "Generate caption" }).click();
    const result = dialog.getByRole("textbox", { name: "Caption", exact: true });
    await expect(result).toHaveValue("Generated caption.");
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(initial);
    expect(requests).toHaveLength(1);
    const payload = requests[0]!;
    expect(payload.model).toBe("vision");
    expect(payload.messages.at(-1)?.content).toBe("Only a short caption.");
    const bytes = Buffer.from(payload.messages.at(-1)!.images![0]!, "base64");
    expect(bytes.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(bytes.readUInt32BE(16)).toBeLessThanOrEqual(2048);
    expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(2048);
    expect(JSON.stringify(payload)).not.toContain("Welcome.md");
    expect(JSON.stringify(payload)).not.toContain("First paragraph");
    expect(JSON.stringify(payload)).not.toContain(dirs.docs);
    await result.fill("Edited **caption**");
    await dialog.getByRole("button", { name: "Use caption" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Edited **caption**", { exact: true })).toBeVisible();
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain('![Red square](red.png "Edited **caption**")');
    expect(JSON.parse(readFileSync(join(dirs.userData, "ai.json"), "utf8")).writer).toBe("writer");
    await page.getByRole("textbox", { name: "Note", exact: true }).click();
    await page.keyboard.press("Control+z");
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(initial);
    hanging = true;
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Auto caption with AI…", exact: true }).click();
    await dialog.getByRole("button", { name: "AI integration", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: /Vision integration/ }).click();
    await dialog.getByRole("button", { name: "Generate caption" }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(dialog.getByText("Writing caption…", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(dialog.getByText("Writing caption…", { exact: true })).not.toBeVisible();
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(initial);
  } finally {
    try { if (launched) await close(launched); }
    finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
});

test("IMG.3: Copy transfers pixels and safe words; Cut, Replace, Save and remembered defaults preserve the note", async () => {
  const dirs = sample();
  const saved = join(dirs.docs, "saved.png");
  let launched = await launch(dirs);
  try {
    let { app, page } = launched;
    await app.evaluate(({ clipboard }) => {
      const captured = clipboard as typeof clipboard & { imageCopy?: { html: string; text: string; size: { width: number; height: number } } };
      clipboard.write = content => {
        captured.imageCopy = { html: content.html ?? "", text: content.text ?? "", size: content.image?.getSize() ?? { width: 0, height: 0 } };
      };
    });
    const red = page.getByRole("img", { name: "Red square", exact: true });
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Copy", exact: true }).click();
    await expect.poll(() => app.evaluate(({ clipboard }) => (clipboard as typeof clipboard & { imageCopy?: { size: { width: number; height: number } } }).imageCopy?.size)).toEqual({ width: 300, height: 120 });
    const copy = await app.evaluate(({ clipboard }) => (clipboard as typeof clipboard & { imageCopy?: { html: string; text: string; size: { width: number; height: number } } }).imageCopy);
    expect(copy?.size).toEqual({ width: 300, height: 120 });
    expect(copy?.text).toBe("Red square");
    expect(copy?.html).toContain('src="data:image/png;base64,');
    expect(copy?.html).not.toContain(dirs.docs);
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(original);
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Cut", exact: true }).click();
    await expect(red).toHaveCount(0);
    expect(existsSync(join(dirs.docs, "red.png"))).toBe(true);
    await page.keyboard.press("Control+z");
    await expect(red).toBeVisible();
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toBe(original);
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath }); }, saved);
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Save image…", exact: true }).click();
    expect(existsSync(saved)).toBe(false);
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Save image…", exact: true }).click();
    await expect.poll(() => existsSync(saved), PROMPTLY).toBe(true);
    expect(readFileSync(saved).subarray(1, 4).toString()).toBe("PNG");
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(dirs.docs, "blue.png"));
    await imageMenu(page, red);
    await page.getByRole("menuitem", { name: "Replace image…", exact: true }).click();
    await expect.poll(() => red.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([120, 80]);
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain("assets/images/");
    expect(existsSync(join(dirs.docs, "red.png"))).toBe(true);
    await page.keyboard.press("Control+z");
    await expect.poll(() => red.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(300);
    await imageMenu(page, red);
    await page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true }).click();
    await imageMenu(page, red);
    await page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true }).click();
    await expect.poll(() => readFileSync(join(dirs.docs, "Welcome.md"), "utf8"), PROMPTLY).toContain("rounded unlimited");
    await close(launched);
    launched = await launch(dirs);
    ({ app, page } = launched);
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(dirs.docs, "blue.png"));
    await page.getByRole("textbox", { name: "Note", exact: true }).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.getByRole("listbox", { name: "Insert a block" }).getByRole("option", { name: /^Insert image/ }).click();
    const inserted = page.locator("[data-image-node]").last();
    await expect(page.locator("[data-image-node]")).toHaveCount(3);
    await expect.poll(() => inserted.locator("img").evaluate(el => Number.parseFloat(getComputedStyle(el.parentElement!).borderRadius))).toBeGreaterThan(0);
    await imageMenu(page, inserted.locator("img"));
    await expect(page.getByRole("menuitemcheckbox", { name: "Rounded corners", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("menuitemcheckbox", { name: "Limit height", exact: true })).toHaveAttribute("aria-checked", "false");
  } finally { await close(launched); }
});

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
    expect(labels.map((label) => label.trim())).toEqual(["Cut", "Copy", "Replace image…", "Save image…", "Edit description…", "Add caption", "Auto caption with AI…", "Edit image", "✓Column", "Wide", "Actual size", "Rounded corners", "✓Limit height"]);
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

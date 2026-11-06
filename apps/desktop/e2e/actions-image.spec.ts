import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

test("ACT-05, ACT-02: Actions captures a single image and opens its existing crop dialog without changing bytes", async () => {
  const dirs = tempDirs();
  const imagePath = join(dirs.docs, "pixel.png");
  const original = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0u0AAAAASUVORK5CYII=", "base64");
  writeFileSync(imagePath, original);
  const notePath = join(dirs.docs, "Welcome.md");
  const markdown = "# Image anchor\n\n![Pixel](pixel.png)\n\nText stays text.\n";
  writeFileSync(notePath, markdown);
  const l = await launch(dirs);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  try {
    const { page } = l;
    const image = page.getByRole("img", { name: "Pixel", exact: true });
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    await image.click();
    await page.keyboard.press(`${mod}+/`);
    const actions = page.getByRole("dialog", { name: "Actions", exact: true });
    await actions.getByRole("combobox").fill("Edit this image");
    const row = actions.getByRole("option", { name: /^Edit this image/ });
    await expect(row).not.toHaveAttribute("aria-disabled", "true");
    await row.click();
    await expect(actions).toBeHidden();
    const crop = page.getByRole("dialog", { name: "Edit image", exact: true });
    await expect(crop).toBeVisible();
    await expect(crop.getByRole("textbox", { name: "Width", exact: true })).toHaveValue("1");
    await expect(crop.getByRole("textbox", { name: "Height", exact: true })).toHaveValue("1");
    await crop.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(crop).toBeHidden();
    expect(readFileSync(notePath, "utf8")).toBe(markdown);
    expect(readFileSync(imagePath)).toEqual(original);
    const editor = page.getByRole("textbox", { name: "Note", exact: true });
    await editor.focus();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press(`${mod}+/`);
    await actions.getByRole("combobox").fill("Edit this image");
    await expect(actions.getByRole("option", { name: /^Edit this image/ })).toHaveCount(0);
  } finally {
    await quit(l);
    const script = join(import.meta.dirname, "../../../tools/dev/close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "pipe" });
  }
});

import { test, expect } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, quit, tempDirs, caret } from "./helpers.ts";
import { crc32, deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
async function close(launched: Awaited<ReturnType<typeof launch>>) {
  try { await quit(launched); }
  finally {
    const script = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
    for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(launched.pid), ...flags], { stdio: "inherit" });
  }
}
function largePng() {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(640); header.writeUInt32BE(360, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([png.subarray(0, 8), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((640 * 3 + 1) * 360))), chunk("IEND", Buffer.alloc(0))]);
}
async function transfer(page: Awaited<ReturnType<typeof launch>>["page"], kind: "paste" | "drop", data: string, size?: number) {
  await page.getByRole("textbox", { name: "Note", exact: true }).evaluate((element, input) => {
    const bytes = input.size ? new Uint8Array(input.size) : Uint8Array.from(atob(input.data), c => c.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], "chosen.png", { type: "image/png" }));
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(input.kind === "paste" ? new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: files })
      : new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: files, clientX: bounds.x + 30, clientY: bounds.bottom - 20 }));
  }, { kind, data, size });
}
for (const entry of ["paste", "drop", "slash", "Insert image"] as const) {
  test(`OFB.17: ${entry} imports managed image bytes and visible pixels survive restart`, async () => {
    const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md"), source = join(dirs.docs, "source.png");
    writeFileSync(note, "# Image test\n\nKeep these words.\n");
    writeFileSync(source, png);
    const launched = await launch(dirs);
    let closed = false;
    try {
      const { page, app } = launched;
      const editor = page.getByRole("textbox", { name: "Note", exact: true });
      await editor.focus(); await page.keyboard.press(caret.docEnd); await page.keyboard.press("Enter");
      if (entry === "paste" || entry === "drop") await transfer(page, entry, png.toString("base64"));
      else {
        await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, source);
        if (entry === "slash") {
          await page.keyboard.type("/");
          await page.getByRole("listbox", { name: "Insert a block" }).getByRole("option", { name: /^Insert image/ }).click();
        } else {
          await page.keyboard.press("Control+/");
          await page.getByRole("combobox").pressSequentially("> Insert image");
          await page.getByRole("option", { name: /^Insert image/ }).click();
        }
      }
      const image = editor.locator("[data-image-node] img");
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1)).toBe(true);
      await expect.poll(() => readFileSync(note, "utf8")).toContain("size=1x1");
      const saved = readFileSync(note, "utf8");
      expect(saved).toContain("Keep these words.");
      const src = /!\[\]\(([^)]+)\)/.exec(saved)?.[1];
      expect(src).toMatch(/^Welcome\.md\.assets\/images\/[0-9a-f-]{36}\.png$/);
      expect(readFileSync(resolve(dirs.docs, src!))).toEqual(png);
      expect(readFileSync(source)).toEqual(png);
      await close(launched);
      closed = true;
      const reopened = await launch(dirs);
      try {
        await expect(reopened.page.locator("[data-image-node] img")).toBeVisible();
        await expect.poll(() => reopened.page.locator("[data-image-node] img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);
        expect(readFileSync(note, "utf8")).toBe(saved);
      } finally { await close(reopened); }
    } finally { if (!closed) await close(launched); }
  });
}
test("OFB.18: an oversize paste names the limit, preserves text and writes no assets", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md"), original = "# Keep\n\nUnchanged text.\n";
  writeFileSync(note, original);
  const launched = await launch(dirs);
  try {
    await transfer(launched.page, "paste", "", 20 * 1024 * 1024 + 1);
    await expect(launched.page.getByText("This image is over 20 MB. Choose a smaller image.", { exact: true })).toBeVisible();
    expect(readFileSync(note, "utf8")).toBe(original);
    expect(existsSync(`${note}.assets`)).toBe(false);
    expect(readdirSync(dirs.docs)).not.toContain("assets");
    await expect(launched.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Unchanged text.");
  } finally { await close(launched); }
});
test("OFB.19: a slow image reserves its actual box, and broken-image Retry never shifts surrounding text", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md"), bytes = largePng();
  writeFileSync(note, "# Image geometry\n\nAbove.\n");
  const launched = await launch(dirs);
  let closed = false;
  try {
    await launched.app.evaluate(() => { (globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow = { "image:read": 2000 }; });
    const editor = launched.page.getByRole("textbox", { name: "Note", exact: true });
    await editor.focus(); await launched.page.keyboard.press(caret.docEnd); await launched.page.keyboard.press("Enter");
    await transfer(launched.page, "paste", bytes.toString("base64"));
    const node = editor.locator("[data-image-node]");
    await expect(node.locator("svg[width='640']")).toBeVisible();
    const pending = await node.boundingBox();
    expect(pending!.height).toBeGreaterThan(100);
    await expect(node.locator("img")).toBeVisible();
    const loaded = await node.boundingBox();
    expect(Math.abs(pending!.height - loaded!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(pending!.width - loaded!.width)).toBeLessThanOrEqual(1);
    await expect.poll(() => readFileSync(note, "utf8")).toContain("size=640x360");
    const saved = readFileSync(note, "utf8"), src = /!\[\]\(([^)]+)\)/.exec(saved)![1]!;
    const asset = resolve(dirs.docs, src);
    await close(launched); closed = true;
    renameSync(asset, `${asset}.held`);
    const reopened = await launch(dirs);
    try {
      const wrapper = reopened.page.locator("[data-image-node]");
      await expect(wrapper.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
      const broken = await wrapper.boundingBox();
      renameSync(`${asset}.held`, asset);
      await reopened.app.evaluate(() => { (globalThis as { focusNotesSlow?: Record<string, number> }).focusNotesSlow = { "image:read": 1000 }; });
      await wrapper.getByRole("button", { name: "Retry", exact: true }).click();
      await expect(wrapper.locator("img")).toBeVisible();
      const retried = await wrapper.boundingBox();
      expect(Math.abs(broken!.height - retried!.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(broken!.width - retried!.width)).toBeLessThanOrEqual(1);
      expect(readFileSync(note, "utf8")).toBe(saved);
    } finally { await close(reopened); }
  } finally { if (!closed) await close(launched); }
});
test("OFB.17: an offline project stores copied images at its root in normal Git", async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  mkdirSync(join(dirs.docs, "notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1,"templateVersion":"0.0.0"}');
  const note = join(dirs.docs, "notes", "welcome.md");
  writeFileSync(note, "# Local project\n\nOnly local text.\n");
  const git = (...args: string[]) => execFileSync("git", ["-C", dirs.docs, ...args], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dirs.userData, "empty-gitconfig"), GIT_TERMINAL_PROMPT: "0" } });
  git("init", "--quiet"); git("config", "user.name", "Image test"); git("config", "user.email", "test@example.invalid");
  git("add", "."); git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Seed disposable local project");
  const launched = await launch(dirs);
  try {
    const editor = launched.page.getByRole("textbox", { name: "Note", exact: true });
    await editor.focus(); await launched.page.keyboard.press(caret.docEnd); await launched.page.keyboard.press("Enter");
    await transfer(launched.page, "paste", png.toString("base64"));
    await expect(editor.locator("[data-image-node] img")).toBeVisible();
    await expect.poll(() => readFileSync(note, "utf8")).toContain("../assets/images/");
    const src = /!\[\]\(([^)]+)\)/.exec(readFileSync(note, "utf8"))![1]!;
    const asset = resolve(dirs.docs, "notes", src), relative = src.replace("../", "");
    expect(readFileSync(asset)).toEqual(png);
    await expect.poll(() => git("ls-tree", "-r", "--name-only", "HEAD"), { timeout: 15_000 }).toContain(relative);
    const blob = execFileSync("git", ["-C", dirs.docs, "show", `HEAD:${relative}`]);
    expect(blob).toEqual(png);
    expect(git("remote")).toBe("");
  } finally { await close(launched); }
});

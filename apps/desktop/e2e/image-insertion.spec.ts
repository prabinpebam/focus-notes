import { test, expect } from "./fixtures.ts";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launch, quit, tempDirs, caret } from "./helpers.ts";
import { crc32, deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { publicImageBytes } from "../src/main/image-metadata.ts";
import { rasterInfo } from "../src/main/image-import.ts";

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
for (const [kind, format] of [["local", "png"], ["github", "png"], ["github", "jpeg"], ["github", "webp"]] as const) test(`OFB.17: ${kind} ${format} project preserves source files and applies its metadata policy before normal Git commits`, async () => {
  const dirs = tempDirs();
  mkdirSync(join(dirs.docs, ".focus-notes"));
  mkdirSync(join(dirs.docs, "notes"));
  writeFileSync(join(dirs.docs, ".focus-notes", "workspace.json"), '{"formatVersion":1,"templateVersion":"0.0.0"}');
  const note = join(dirs.docs, "notes", "welcome.md");
  writeFileSync(note, "# Local project\n\nOnly local text.\n");
  writeFileSync(join(dirs.userData, "workspace.json"), JSON.stringify({ version: 1, folder: dirs.docs, kind }));
  const metadata = Buffer.from("Location\0Not-for-public"), body = Buffer.concat([Buffer.from("tEXt"), metadata]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(metadata.length); crc.writeUInt32BE(crc32(body));
  let input = Buffer.concat([png.subarray(0, 33), length, body, crc, png.subarray(33)]);
  const source = join(dirs.userData, `original.${format}`);
  writeFileSync(source, input);
  const git = (...args: string[]) => execFileSync("git", ["-C", dirs.docs, ...args], { encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(dirs.userData, "empty-gitconfig"), GIT_TERMINAL_PROMPT: "0" } });
  git("init", "--quiet"); git("config", "user.name", "Image test"); git("config", "user.email", "test@example.invalid");
  git("add", "."); git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Seed disposable local project");
  const launched = await launch(dirs);
  try {
    if (format !== "png") {
      const data = await launched.page.evaluate((format) => {
        const canvas = document.createElement("canvas"); canvas.width = 6; canvas.height = 4;
        const context = canvas.getContext("2d")!; context.fillStyle = "red"; context.fillRect(0, 0, 6, 4);
        return canvas.toDataURL(`image/${format}`);
      }, format);
      const encoded = Buffer.from(data.split(",")[1]!, "base64"), tiff = Buffer.alloc(26);
      tiff.write("II"); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4); tiff.writeUInt16LE(1, 8);
      tiff.writeUInt16LE(0x112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
      const exif = Buffer.concat([tiff, metadata]);
      if (format === "jpeg") {
        const payload = Buffer.concat([Buffer.from("Exif\0\0"), exif]), header = Buffer.from([255, 225, 0, 0]);
        header.writeUInt16BE(payload.length + 2, 2);
        input = Buffer.concat([encoded.subarray(0, 2), header, payload, encoded.subarray(2)]);
      } else {
        const payload = Buffer.concat([Buffer.from("Exif\0\0"), exif]);
        const header = Buffer.alloc(8); header.write("EXIF"); header.writeUInt32LE(payload.length, 4);
        let chunks = encoded.subarray(12);
        if (chunks.toString("ascii", 0, 4) === "VP8X") chunks[8] = chunks[8]! | 0x08;
        else {
          const extended = Buffer.alloc(18); extended.write("VP8X"); extended.writeUInt32LE(10, 4); extended[8] = 0x08;
          extended.writeUIntLE(5, 12, 3); extended.writeUIntLE(3, 15, 3);
          chunks = Buffer.concat([extended, chunks]);
        }
        input = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP"), chunks, header, payload, Buffer.alloc(payload.length % 2)]);
        input.writeUInt32LE(input.length - 8, 4);
      }
      writeFileSync(source, input);
    }
    if (format === "webp") {
      const sanitized = publicImageBytes(input, format);
      const probe = join(dirs.userData, "decode-probe.webp");
      writeFileSync(probe, sanitized);
      const chromium = await launched.page.evaluate(async (data) => {
        const image = new Image();
        image.src = `data:image/webp;base64,${data}`;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, sanitized.toString("base64"));
      const native = await launched.app.evaluate(async ({ nativeImage }, path) => {
        try {
          const thumbnail = await nativeImage.createThumbnailFromPath(path, { width: 1, height: 1 });
          return { empty: thumbnail.isEmpty() };
        } catch (error) { return { error: String(error) }; }
      }, probe);
      console.log("WebP decoder evidence", JSON.stringify({ header: rasterInfo(sanitized), chromium, native }));
      expect(chromium).toEqual([6, 4]);
      await launched.app.evaluate(({ nativeImage }) => {
        nativeImage.createThumbnailFromPath = async () => { throw new Error("OS thumbnail codecs unavailable"); };
      });
    }
    const editor = launched.page.getByRole("textbox", { name: "Note", exact: true });
    await editor.focus(); await launched.page.keyboard.press(caret.docEnd); await launched.page.keyboard.press("Enter");
    await transfer(launched.page, "paste", input.toString("base64"));
    await expect(editor.locator("[data-image-node] img")).toBeVisible();
    if (format === "webp") expect(await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await expect.poll(() => readFileSync(note, "utf8")).toContain("../assets/images/");
    const src = /!\[\]\(([^)]+)\)/.exec(readFileSync(note, "utf8"))![1]!;
    const asset = resolve(dirs.docs, "notes", src), relative = src.replace("../", "");
    const expected = format === "png" ? kind === "local" ? input : png : readFileSync(asset);
    expect(readFileSync(asset)).toEqual(expected);
    if (kind === "github") expect(expected.includes(metadata)).toBe(false);
    if (format !== "png") {
      const size = format === "jpeg" ? [4, 6] : [6, 4];
      await expect.poll(() => editor.locator("[data-image-node] img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual(size);
      await expect.poll(() => readFileSync(note, "utf8")).toContain(`size=${size.join("x")}`);
    }
    expect(readFileSync(source)).toEqual(input);
    await expect.poll(() => git("ls-tree", "-r", "--name-only", "HEAD"), { timeout: 15_000 }).toContain(relative);
    const blob = execFileSync("git", ["-C", dirs.docs, "show", `HEAD:${relative}`]);
    expect(blob).toEqual(expected);
    expect(git("remote")).toBe("");
  } finally { await close(launched); }
  if (format === "webp") {
    const reopened = await launch(dirs);
    try {
      const image = reopened.page.locator("[data-image-node] img");
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([6, 4]);
    } finally { await close(reopened); }
  }
});

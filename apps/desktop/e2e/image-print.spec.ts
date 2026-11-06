import { test, expect } from "./fixtures.ts";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { launch, quit, tempDirs } from "./helpers.ts";
import { pdfImages, pdfText } from "./pdf-text.ts";

function png(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const chunk = (name: string, bytes: Buffer) => {
    const type = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    crc.writeUInt32BE(crc32(Buffer.concat([type, bytes])));
    return Buffer.concat([size, type, bytes, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    pixels.set(rgba, y * (width * 4 + 1) + 1 + x * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

test("IMG-12: PDF includes decoded inline, tall and captioned images within paper margins, with descriptions for missing images", async () => {
  test.setTimeout(90_000);
  const dirs = tempDirs();
  const markdown = '# Photo album\n\n![Small transparent image](small.png)\n\n<!-- pagebreak -->\n\n<!-- image: actual unlimited -->\n![Tall photo](tall.png "Tall caption")\n\n<!-- pagebreak -->\n\n<!-- image: wide rounded -->\n![Wide photo](wide.png "Wide caption")\n\n![Missing photograph](missing.png "Missing caption")\n';
  writeFileSync(join(dirs.docs, "Welcome.md"), markdown);
  writeFileSync(join(dirs.docs, "small.png"), png(80, 50, [220, 20, 20, 128]));
  writeFileSync(join(dirs.docs, "tall.png"), png(120, 2400, [20, 160, 20, 255]));
  writeFileSync(join(dirs.docs, "wide.png"), png(1600, 120, [20, 20, 220, 255]));
  const pdf = join(dirs.docs, "album.pdf");
  const l = await launch(dirs, { FOCUS_NOTES_E2E_PRINT_PDF: pdf });
  try {
    const { page } = l;
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toContainText("Photo album");
    await l.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      const print = window.webContents.printToPDF.bind(window.webContents);
      window.webContents.printToPDF = async options => {
        Reflect.set(globalThis, "printImageReady", await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("[data-print-root] img")).map(image => ({ decoded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }))`));
        Reflect.set(globalThis, "printDescriptions", await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll("[data-print-root] em")).map(element => element.textContent)`));
        return print({ ...options, landscape: Reflect.get(globalThis, "printLandscape") === true });
      };
    });
    const print = async () => {
      rmSync(pdf, { force: true });
      await page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
      const more = page.getByRole("button", { name: "More", exact: true });
      await expect(page.getByRole("toolbar", { name: "Toolbar", exact: true }).locator(":focus")).toHaveCount(1);
      await page.keyboard.press("End");
      await expect(more).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.getByRole("menuitem", { name: /^Print…/ }).click();
      await expect.poll(() => existsSync(pdf), { timeout: 20_000 }).toBe(true);
      await expect(page.locator("[data-print-root]")).toHaveCount(0);
    };
    await print();
    const bytes = readFileSync(pdf);
    const text = pdfText(bytes);
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "printDescriptions"))).toEqual(["Missing photograph"]);
    expect(text.title).toBe("Photo album");
    expect(text.pages).toHaveLength(3);
    expect(text.pages[0]).toContain("Photo album");
    expect(text.pages[1]).toContain("Tall caption");
    expect(text.pages[2]).toContain("Wide caption");
    expect(text.pages[2]).toContain("Missing photograph");
    expect(text.pages[2]).toContain("Missing caption");
    const ready = await l.app.evaluate(() => Reflect.get(globalThis, "printImageReady"));
    expect(ready).toEqual([
      { decoded: true, width: 80, height: 50 },
      { decoded: true, width: 120, height: 2400 },
      { decoded: true, width: 1600, height: 120 },
    ]);
    const images = pdfImages(bytes);
    expect(images.map(image => [image.page, image.width, image.height])).toEqual([[1, 80, 50], [2, 120, 2400], [3, 1600, 120]]);
    for (const image of images) {
      expect(image.x).toBeGreaterThanOrEqual(53.99);
      expect(image.y).toBeGreaterThanOrEqual(53.99);
      expect(image.x + image.drawnWidth).toBeLessThanOrEqual(image.pageWidth - 53.99);
      expect(image.y + image.drawnHeight).toBeLessThanOrEqual(image.pageHeight - 53.99);
      // Skia rounds each drawn dimension to a CSS pixel (0.75 pt).
      const scaleDifference = Math.abs(image.drawnWidth / image.width - image.drawnHeight / image.height);
      expect(scaleDifference).toBeLessThanOrEqual(0.75 / image.width + 0.75 / image.height);
    }
    await expect(editor).toBeVisible();
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(markdown);
    expect(await page.evaluate(() => performance.getEntriesByName("fn:image.print").length)).toBeGreaterThan(0);
    await l.app.evaluate(() => { Reflect.set(globalThis, "printLandscape", true); });
    await print();
    const landscapeBytes = readFileSync(pdf);
    const landscape = pdfImages(landscapeBytes);
    expect(landscape.map(image => [image.page, image.width, image.height])).toEqual([[1, 80, 50], [2, 120, 2400], [3, 1600, 120]]);
    for (const image of landscape) {
      expect(image.pageWidth).toBeGreaterThan(image.pageHeight);
      expect(image.x).toBeGreaterThanOrEqual(53.99);
      expect(image.y).toBeGreaterThanOrEqual(53.99);
      expect(image.x + image.drawnWidth).toBeLessThanOrEqual(image.pageWidth - 53.99);
      expect(image.y + image.drawnHeight).toBeLessThanOrEqual(image.pageHeight - 53.99);
    }
    expect(pdfText(landscapeBytes).pages[1]).toContain("Tall caption");
    expect(pdfText(landscapeBytes).pages[2]).toContain("Wide caption");
    expect(pdfText(landscapeBytes).pages[2]).toContain("Missing photograph");
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toBe(markdown);
  } finally { await quit(l); }
});

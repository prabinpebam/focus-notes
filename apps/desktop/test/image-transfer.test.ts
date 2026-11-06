import { expect, it } from "vitest";
import { imageClipboard } from "../src/main/image-transfer.ts";

const data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
it("clipboard representation contains pixels and escaped words, never an asset path", () => {
  const result = imageClipboard(data, 'A <picture> "here"', 'Caption & more');
  expect(result.text).toBe('A <picture> "here"\nCaption & more');
  expect(result.html).toContain('alt="A &lt;picture&gt; &quot;here&quot;"');
  expect(result.html).toContain('title="Caption &amp; more"');
  expect(result.html).toContain('src="data:image/png;base64,');
  expect(result.bytes.subarray(1, 4).toString()).toBe("PNG");
});
it("refuses remote sources, oversized words, and corrupt raster data", () => {
  expect(() => imageClipboard("https://example.test/image.png", "", "")).toThrow("invalid-image");
  expect(() => imageClipboard(data, "x".repeat(65537), "")).toThrow("invalid-image");
  expect(() => imageClipboard("data:image/png;base64,aW1hZ2U=", "", "")).toThrow("invalid-image");
});

/**
 * The page renderer ships in the desktop package (SHR-20, G3): the desktop build makes
 * apps/web/dist-reader, electron-builder copies it to resources/reader, and the afterPack hook
 * fails any package without it.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterPack, READER_SOURCE, readerProblem } from "../../apps/desktop/scripts/reader.mjs";
import { storeConfig } from "../../apps/desktop/scripts/dist-store.mjs";

const root = join(import.meta.dirname, "..", "..");
const desktop = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8"));

describe("the page renderer in the desktop package", () => {
  it("is built with the desktop app and packed at resources/reader, Store package included", () => {
    expect(desktop.scripts.build).toMatch(/pnpm --filter @focus-notes\/web run build:reader$/);
    const resource = { from: READER_SOURCE, to: "reader", filter: ["render.mjs", "assets/**", "site/**"] };
    expect(desktop.build.extraResources).toContainEqual(resource);
    expect(desktop.build.afterPack).toBe("./scripts/reader.mjs");
    const store = storeConfig(desktop.build, join(root, "apps", "desktop", "vendor", "git"));
    expect(store.extraResources).toContainEqual(resource);
    expect(store.afterPack).toBe("./scripts/reader.mjs");
  });

  it("refuses a packed app whose reader is missing or incomplete", async () => {
    const out = mkdtempSync(join(tmpdir(), "fn-reader-pack-"));
    const context = { appOutDir: out, electronPlatformName: "win32", packager: { appInfo: { productFilename: "Focus Notes" } } };
    const reader = join(out, "resources", "reader");
    try {
      await expect(afterPack(context)).rejects.toThrow(/page renderer is missing/);
      mkdirSync(join(reader, "assets"), { recursive: true });
      writeFileSync(join(reader, "render.mjs"), "export {};\n");
      await expect(afterPack(context)).rejects.toThrow(/assets are missing/);
      writeFileSync(join(reader, "assets", "style.css"), "");
      await expect(afterPack(context)).rejects.toThrow(/share reader page is missing/);
      mkdirSync(join(reader, "site", "s"), { recursive: true });
      writeFileSync(join(reader, "site", "s", "index.html"), "<!doctype html>\n");
      expect(readerProblem(reader)).toBeUndefined();
      await expect(afterPack(context)).resolves.toBeUndefined();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

/**
 * DSK-09, D-148: the main process never reloads the page for a change of state. A reload shows the
 * unpainted page, white or see-through in the transparent window; finishing setup, opening another
 * workspace and removing it start the app again in place (`workspace:switched`). Only recovering
 * from a renderer crash may reload, on a line that says so (`allow-reload: renderer crash`).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const MAIN = join(import.meta.dirname, "..", "src", "main");
const ALLOWED = "allow-reload: renderer crash";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? sources(join(dir, d.name)) : /\.(ts|mts|cts|js|mjs)$/.test(d.name) ? [join(dir, d.name)] : []));
}

/** Every `reload(` call (reload, reloadIgnoringCache) in the main process that isn't the allowed crash recovery. */
export function reloads(files: { path: string; text: string }[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    f.text.split(/\r?\n/).forEach((line, i) => {
      if (/\breload(IgnoringCache)?\s*\(/.test(line) && !line.includes(ALLOWED)) out.push(`${f.path}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

describe("D-148: no page reloads for state changes", () => {
  it("finds a reload, and lets the marked crash recovery through", () => {
    expect(reloads([{ path: "a.ts", text: "setTimeout(() => mainWindow?.webContents.reload(), 0);" }])).toHaveLength(1);
    expect(reloads([{ path: "a.ts", text: "win.webContents.reloadIgnoringCache();" }])).toHaveLength(1);
    expect(reloads([{ path: "a.ts", text: `win.webContents.reload(); // ${ALLOWED}` }])).toEqual([]);
  });
  it("apps/desktop/src/main has no reload( but the renderer-crash recovery", () => {
    const files = sources(MAIN).map((p) => ({ path: relative(MAIN, p), text: readFileSync(p, "utf8") }));
    expect(files.length).toBeGreaterThan(5);
    expect(reloads(files)).toEqual([]);
  });
});

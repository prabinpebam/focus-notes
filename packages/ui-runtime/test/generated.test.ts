/**
 * D-138: the committed schemas/ui/ files must match what `ui-check --write` produces. Verify reads
 * the files, ignores CRLF versus LF, and names the exact regenerate command when they're stale.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contracts, ICON_NAMES } from "@focus-notes/ui/contracts";
import { tokenGroups } from "@focus-notes/tokens";
import { REGENERATE_COMMAND, staleFiles, staleMessage, uiSchemaFiles } from "../src/generated.ts";

const files = uiSchemaFiles({ contracts, icons: ICON_NAMES, tokenGroups: tokenGroups as unknown as Record<string, readonly string[]> });
const dirs: string[] = [];
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), "fn-ui-schema-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("generated UI schema verification (D-138)", () => {
  it("passes when the files are exactly what --write produces", () => {
    expect(Object.keys(files).sort()).toEqual(["contracts.v1.json", "view.v1.json"]);
    expect(staleFiles(fresh(), files)).toEqual([]);
  });

  it("passes when the files only differ by CRLF line endings", () => {
    const dir = fresh();
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text.replace(/\n/g, "\r\n"));
    expect(staleFiles(dir, files)).toEqual([]);
  });

  it("fails on a stale schema and names the file and the regenerate command", () => {
    const dir = fresh();
    const view = JSON.parse(readFileSync(join(dir, "view.v1.json"), "utf8"));
    view.$defs = { ...view.$defs, removedLater: { type: "string" } };
    writeFileSync(join(dir, "view.v1.json"), JSON.stringify(view, null, 2) + "\n");
    const stale = staleFiles(dir, files);
    expect(stale).toEqual(["view.v1.json"]);
    expect(staleMessage(stale)).toContain("schemas/ui/view.v1.json");
    expect(staleMessage(stale)).toContain("pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write");
    expect(REGENERATE_COMMAND).toBe("pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write");
  });

  it("fails when a schema file is missing", () => {
    const dir = fresh();
    rmSync(join(dir, "contracts.v1.json"));
    expect(staleFiles(dir, files)).toEqual(["contracts.v1.json"]);
  });

  it("the committed schemas/ui/ files are current", () => {
    expect(staleFiles(join(import.meta.dirname, "..", "..", "..", "schemas", "ui"), files)).toEqual([]);
  });
});

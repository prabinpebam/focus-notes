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
import { views, pages, fragments } from "@focus-notes/views";
import { REGENERATE_COMMAND, staleFiles, staleMessage, uiSchemaFiles } from "../src/generated.ts";

const files = uiSchemaFiles({ contracts, icons: ICON_NAMES, tokenGroups: tokenGroups as unknown as Record<string, readonly string[]>, catalogViews: { ...views, ...pages }, fragments });
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
    expect(Object.keys(files).sort()).toEqual(["catalog.v1.json", "contracts.v1.json", "view.v1.json"]);
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

describe("the published catalog (DSY-13, D-166)", () => {
  const catalog = JSON.parse(files["catalog.v1.json"]!) as {
    version: number; components: { type: string; tier: string; description: string; props: object; a11y: object; tokens: string; fixtures: string[] }[];
    tokens: Record<string, string[]>; icons: string[]; views: { id: string; ia?: string; viewModels: string[] }[]; fragments: string[]; files: Record<string, string>;
  };
  it("lists every component with its contract's public parts and its fixtures' names", () => {
    expect(catalog.version).toBe(1);
    expect(catalog.components.map((c) => c.type)).toEqual(contracts.map((c) => c.type));
    const button = catalog.components.find((c) => c.type === "Button")!;
    expect(button).toMatchObject({ tier: "primitive", props: expect.any(Object), a11y: expect.any(Object) });
    expect(button.fixtures.length).toBeGreaterThan(0);
    expect(button.fixtures.every((f) => typeof f === "string")).toBe(true);
  });
  it("lists every token group's names, the icons, the product views (not the gallery's), and the fragments", () => {
    for (const [g, names] of Object.entries(tokenGroups as unknown as Record<string, readonly string[]>)) expect(catalog.tokens[g]).toEqual([...names]);
    expect(catalog.icons).toEqual([...ICON_NAMES]);
    expect(catalog.views.map((v) => v.id).sort()).toEqual(Object.values({ ...views, ...pages }).map((v) => (v as { id: string }).id).sort());
    expect(catalog.views.find((v) => v.id === "canvas")).toMatchObject({ ia: "IA-VIEW-CANVAS", viewModels: expect.arrayContaining(["vm.canvas"]) });
    expect(catalog.fragments).toEqual(Object.keys(fragments).sort());
    expect(catalog.files).toEqual({ contracts: "contracts.v1.json", viewSchema: "view.v1.json" });
  });
  it("is the committed file, so the site publishes what the build makes", () => {
    expect(staleFiles(join(import.meta.dirname, "..", "..", "..", "schemas", "ui"), { "catalog.v1.json": files["catalog.v1.json"]! })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { formatWorkspaceFile, WORKSPACE_FORMAT } from "../src/workspace-format.ts";

const dir = join(import.meta.dirname, "..", "..", "..", "schemas");
const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));

describe("file format schemas (AGT-08)", () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const files = readdirSync(dir).filter((f) => f.endsWith(".schema.json"));
  it("covers every format", () => {
    expect(files.sort()).toEqual(["access-message.schema.json", "access.schema.json", "app-state.schema.json", "export-bundle.schema.json", "front-matter.schema.json", "keybindings.schema.json", "settings.schema.json", "theme.schema.json", "workspace.schema.json"]);
  });
  for (const f of files) it(`${f} compiles with a stable $id`, () => {
    const s = load(f);
    expect(s.$id).toMatch(/^https:\/\/prabinpebam\.github\.io\/focus-notes\/schemas\/[a-z-]+\.v1\.json$/);
    expect(() => ajv.compile(s)).not.toThrow();
  });
  it("accepts and rejects examples", () => {
    const check = (f: string, v: unknown) => ajv.getSchema(load(f).$id)!(v);
    expect(check("app-state.schema.json", { version: 1, lastNotePath: "C:/n.md", appearance: "dark" })).toBe(true);
    expect(check("app-state.schema.json", { version: 2 })).toBe(false);
    expect(check("workspace.schema.json", { formatVersion: 1 })).toBe(true);
    expect(check("workspace.schema.json", { formatVersion: 0 })).toBe(false);
    expect(check("workspace.schema.json", { templateVersion: "1.0.0" })).toBe(false);
    // What the app writes after a migration is valid (DST-05).
    expect(check("workspace.schema.json", JSON.parse(formatWorkspaceFile({ formatVersion: WORKSPACE_FORMAT, templateVersion: "1.0.0" })))).toBe(true);
    expect(check("keybindings.schema.json", [{ command: "focus.toggle", key: "Mod+Shift+F" }])).toBe(true);
    expect(check("keybindings.schema.json", [{ command: "Focus", key: "x y" }])).toBe(false);
    expect(check("settings.schema.json", { toolbar: ["a.b", "a.c", "a.d", "a.e", "a.f", "a.g", "a.h"] })).toBe(false);
    expect(check("theme.schema.json", { $name: "Mine", $scheme: "dark", cmp: {} })).toBe(false);
    expect(check("access.schema.json", { version: 1, grants: [{ id: "abcdefgh", name: "Asha", scope: { folders: ["drafts"] }, createdAt: "2026-10-13T10:00:00Z", passcode: { value: "short" } }] })).toBe(false);
    expect(check("access.schema.json", { version: 1, grants: [{ id: "gabcdefgh", name: "You", owner: true, salt: "A".repeat(22), passcodeKey: "B".repeat(43), scope: { all: true }, createdAt: "2026-10-14T10:00:00Z" }] })).toBe(true);
    expect(check("access.schema.json", { version: 1, grants: [{ id: "gabcdefgh", name: "You", owner: true, passphrase: "never stored", scope: { all: true }, createdAt: "2026-10-14T10:00:00Z" }] })).toBe(false);
    expect(check("export-bundle.schema.json", { format: "focus-notes/export/v1", exported: "2026-10-14T10:00:00Z", notes: [{ path: "A.md", text: "a", updated: "2026-10-14T10:00:00Z" }] })).toBe(true);
    expect(check("export-bundle.schema.json", { format: "focus-notes/export/v2", exported: "2026-10-14T10:00:00Z", notes: [] })).toBe(false);
  });
});

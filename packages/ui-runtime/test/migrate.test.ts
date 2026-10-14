/**
 * DSY-10: the UI schema's major version. Every view document names it in `$schema`; documents for
 * an older major are migrated one major at a time before validation, a newer major is refused with
 * a clear error, and a major bump can't ship without its migration.
 */
import { describe, expect, it } from "vitest";
import { views, pages } from "@focus-notes/views";
import { contracts, ICON_NAMES } from "@focus-notes/ui/contracts";
import { tokenGroups } from "@focus-notes/tokens";
import { migrateView, missingMigrations, schemaMajor, UI_SCHEMA_MAJOR, VIEW_MIGRATIONS, VIEW_SCHEMA_URL, ViewSchemaError, type ViewMigration } from "../src/migrate.ts";
import { buildUiSchema } from "../src/schema.ts";
import { checkUi } from "../src/check.ts";
import uiSchema from "../../../schemas/ui/view.v1.json" with { type: "json" };

const url = (major: number) => VIEW_SCHEMA_URL.replace(/v\d+\.json$/, `v${major}.json`);

describe("DSY-10: the UI schema's major version and view migrations", () => {
  it("DSY-10: every shipped view document names this app's major, and passes through unchanged", () => {
    expect(UI_SCHEMA_MAJOR).toBe(1);
    for (const [name, doc] of Object.entries({ ...views, ...pages })) {
      expect(schemaMajor(doc), name).toBe(UI_SCHEMA_MAJOR);
      expect(migrateView(doc), name).toBe(doc);
    }
  });

  it("DSY-10: the generated schema carries the major in its $id and accepts only that $schema", () => {
    const schema = buildUiSchema({ contracts: [], icons: [], tokenGroups: {} }) as { $id: string; properties: { $schema: { const: string } } };
    expect(schema.$id).toBe(VIEW_SCHEMA_URL);
    expect(schema.properties.$schema.const).toBe(VIEW_SCHEMA_URL);
    // The published schema (schemas/ui/, written by ui:check --write) is the same version.
    expect(uiSchema.$id).toBe(VIEW_SCHEMA_URL);
    expect((uiSchema.properties.$schema as { const?: string }).const).toBe(VIEW_SCHEMA_URL);
  });

  it("DSY-10: a document for a newer major is refused with a clear error", () => {
    const newer = { $schema: url(UI_SCHEMA_MAJOR + 1), id: "canvas", viewModels: [], root: {} };
    expect(() => migrateView(newer)).toThrow(ViewSchemaError);
    expect(() => migrateView(newer)).toThrow(`The view "canvas" is written for UI schema v${UI_SCHEMA_MAJOR + 1}, newer than this app's v${UI_SCHEMA_MAJOR}. Update the app to open it.`);
    expect(() => migrateView({ $schema: "x", id: "t" })).toThrow(/should name the UI schema's version/);
    // ui:check reports it as a schema problem, not a crash.
    const problems = checkUi({ contracts, icons: ICON_NAMES, tokenGroups: tokenGroups as unknown as Record<string, readonly string[]>, views: { canvas: newer }, fragments: {}, commands: new Set(), viewModels: new Map(), messages: {} } as unknown as Parameters<typeof checkUi>[0]);
    expect(problems).toEqual([expect.objectContaining({ doc: "view canvas", stage: "schema", at: "/$schema", message: expect.stringContaining("newer than this app's") })]);
  });

  it("DSY-10: an older document is migrated one major at a time to the current one", () => {
    const renameProp: ViewMigration = (d) => ({ ...d, root: { ...(d.root as object), renamed: true } });
    const addField: ViewMigration = (d) => ({ ...d, added: 3 });
    const v1 = { $schema: url(1), id: "old", root: { type: "Stack" } };
    const out = migrateView(v1, { 1: renameProp, 2: addField }, 3);
    expect(out).toEqual({ $schema: url(3), id: "old", root: { type: "Stack", renamed: true }, added: 3 });
    expect(v1.$schema).toBe(url(1)); // The original is untouched.
    expect(() => migrateView(v1, { 1: renameProp }, 3)).toThrow("No migration from UI schema v2 to v3 for the view \"old\".");
  });

  it("DSY-10: a major bump can't ship without the migration from every earlier major", () => {
    expect(missingMigrations()).toEqual([]);
    expect(Object.keys(VIEW_MIGRATIONS)).toEqual([]);
    expect(missingMigrations({ 1: (d) => d }, 3)).toEqual([2]);
  });
});

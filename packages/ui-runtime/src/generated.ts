/**
 * The generated UI schema files in schemas/ui/ (D-138). `ui-check --write` writes them and
 * `ui-check --verify` (run by `pnpm check`) fails when the committed copies differ from what
 * --write would produce. Comparison ignores CRLF versus LF, so Windows and Linux agree.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildUiSchema, type SchemaInputs } from "./schema.ts";
import { UI_SCHEMA_MAJOR } from "./migrate.ts";

export const REGENERATE_COMMAND = "pnpm --filter @focus-notes/ui-runtime exec node src/cli/ui-check.ts --write";

/** File name → exact content that `--write` produces. */
export function uiSchemaFiles(inputs: SchemaInputs): Record<string, string> {
  return {
    [`view.v${UI_SCHEMA_MAJOR}.json`]: JSON.stringify(buildUiSchema(inputs), null, 2) + "\n",
    "contracts.v1.json": JSON.stringify({ version: 1, contracts: inputs.contracts }, null, 2) + "\n",
  };
}

const lf = (text: string) => text.replace(/\r\n/g, "\n");

/** The files in `dir` that are missing or differ from `files` (line endings normalised). */
export function staleFiles(dir: string, files: Record<string, string>): string[] {
  return Object.entries(files)
    .filter(([name, want]) => {
      try { return lf(readFileSync(join(dir, name), "utf8")) !== lf(want); } catch { return true; }
    })
    .map(([name]) => name);
}

/** A failure message that names the stale files and the exact command to regenerate them. */
export function staleMessage(stale: readonly string[]): string {
  return `Generated UI schemas are out of date: ${stale.map((f) => `schemas/ui/${f}`).join(", ")}. Regenerate with: ${REGENERATE_COMMAND}`;
}

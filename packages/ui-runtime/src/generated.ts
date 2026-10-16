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

/** What the catalog also needs: the product's views and pages (not the gallery's), and the fragments. */
export interface CatalogInputs {
  catalogViews?: Record<string, unknown>;
  fragments?: Record<string, unknown>;
}

/**
 * The design system's catalog for agents and tools (DSY-13, D-166): each component's public parts,
 * every token group's names, the icons, each product view's ID, IA ID and view models, and the
 * fragments. JSON only, published with the schemas on the project's Pages site.
 */
export function buildCatalog(inputs: SchemaInputs & CatalogInputs): Record<string, unknown> {
  const views = Object.values(inputs.catalogViews ?? {}).map((v) => {
    const d = v as { id: string; ia?: string; viewModels?: string[] };
    return { id: d.id, ...(d.ia ? { ia: d.ia } : {}), viewModels: [...(d.viewModels ?? [])] };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    version: 1,
    files: { contracts: "contracts.v1.json", viewSchema: `view.v${UI_SCHEMA_MAJOR}.json` },
    components: inputs.contracts.map((c) => ({
      type: c.type, tier: c.tier, description: c.description, props: c.props, events: c.events, slots: c.slots, states: c.states, tokens: c.tokens, a11y: c.a11y,
      fixtures: (c.fixtures ?? []).map((f) => f.name),
    })),
    tokens: Object.fromEntries(Object.entries(inputs.tokenGroups).map(([g, names]) => [g, [...names]])),
    icons: [...inputs.icons],
    views,
    fragments: Object.keys(inputs.fragments ?? {}).sort(),
  };
}

/** File name → exact content that `--write` produces. */
export function uiSchemaFiles(inputs: SchemaInputs & CatalogInputs): Record<string, string> {
  return {
    [`view.v${UI_SCHEMA_MAJOR}.json`]: JSON.stringify(buildUiSchema(inputs), null, 2) + "\n",
    "contracts.v1.json": JSON.stringify({ version: 1, contracts: inputs.contracts }, null, 2) + "\n",
    "catalog.v1.json": JSON.stringify(buildCatalog(inputs), null, 2) + "\n",
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

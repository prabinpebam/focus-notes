/**
 * pnpm ui:check — validates every view and fragment, and checks fixture coverage.
 * --write writes the generated UI schema and contract catalog to schemas/ui/.
 * --verify fails when the committed schemas/ui/ files differ from what --write would produce (D-138).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contracts, ICON_NAMES } from "@focus-notes/ui/contracts";
import { createApp, PUBLIC_INDEX_VIEW_MODEL, READER_VIEW_MODEL, SHARE_COMMANDS, SHARE_VIEW_MODEL, type PlatformBridge } from "@focus-notes/core";
import { views, pages, fragments, messages } from "@focus-notes/views";
import { tokenGroups } from "@focus-notes/tokens";
import { checkUi, checkFixtureCoverage } from "../check.ts";
import { staleFiles, staleMessage, uiSchemaFiles } from "../generated.ts";
import { missingMigrations } from "../migrate.ts";
import { galleryViews, registerGallery } from "../gallery.ts";

const inertBridge: PlatformBridge = {
  platform: "windows",
  readNote: async () => "",
  writeNote: async () => {},
  chooseNote: async () => undefined, newNotePath: async () => "/notes/Untitled.md",
  defaultNotePath: async () => "",
  loadAppState: async () => ({ version: 1 }),
  saveAppState: async () => {},
  systemScheme: () => "light",
  onSystemSchemeChange: () => () => {},
};
const app = createApp(inertBridge, messages.en!);
registerGallery(app, contracts, () => {});
const inputs = {
  contracts,
  icons: ICON_NAMES,
  tokenGroups: tokenGroups as unknown as Record<string, readonly string[]>,
  views: { ...views, ...pages, ...galleryViews(contracts) },
  fragments,
  // The share reader's page has its own commands and view model, outside the app (WP-5.4).
  commands: new Set([...app.commands.ids(), ...SHARE_COMMANDS]),
  // Published pages' view models are filled by the publisher (WP-5.1) and the share reader (WP-5.4), not the app.
  viewModels: new Map([
    ...app.viewModels.list().map((v) => [v.id, { schema: v.schema, ...(v.setters ? { setters: v.setters } : {}) }] as const),
    [READER_VIEW_MODEL.id, { schema: READER_VIEW_MODEL.schema }] as const,
    [PUBLIC_INDEX_VIEW_MODEL.id, { schema: PUBLIC_INDEX_VIEW_MODEL.schema }] as const,
    [SHARE_VIEW_MODEL.id, { schema: SHARE_VIEW_MODEL.schema }] as const,
  ]),
  messages: app.messages,
};

const problems = checkUi(inputs);
const coverage = checkFixtureCoverage(contracts);
// A major bump ships with the migration from the major before it (DSY-10).
for (const m of missingMigrations()) problems.push({ doc: `UI schema v${m}`, stage: "schema", at: "/", message: `no migration to v${m + 1}` });
for (const p of problems) console.error(`✗ ${p.doc} [${p.stage}] ${p.at}: ${p.message}`);
for (const c of coverage) console.error(`✗ fixtures: ${c}`);

const out = join(import.meta.dirname, "..", "..", "..", "..", "schemas", "ui");
const files = uiSchemaFiles(inputs);
if (process.argv.includes("--write")) {
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
  console.log(`Wrote ${out}`);
}
// --verify (pnpm check): the committed schemas must match what --write produces (D-138). Read-only.
const stale = process.argv.includes("--verify") ? staleFiles(out, files) : [];
if (stale.length) console.error(`✗ ${staleMessage(stale)}`);

const count = Object.keys(inputs.views).length + Object.keys(fragments).length;
if (problems.length || coverage.length || stale.length) {
  console.error(`ui:check failed: ${problems.length} view problems, ${coverage.length} fixture gaps, ${stale.length} stale schema files.`);
  process.exit(1);
}
console.log(`ui:check passed: ${count} documents, ${contracts.length} components, ${app.commands.ids().length} commands.`);

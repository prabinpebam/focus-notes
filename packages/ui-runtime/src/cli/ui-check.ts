/**
 * pnpm ui:check — validates every view and fragment, and checks fixture coverage.
 * --write writes the generated UI schema and contract catalog to schemas/ui/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contracts, ICON_NAMES } from "@focus-notes/ui/contracts";
import { createApp, type PlatformBridge } from "@focus-notes/core";
import { views, fragments, messages } from "@focus-notes/views";
import { tokenGroups } from "@focus-notes/tokens";
import { checkUi, checkFixtureCoverage } from "../check.ts";
import { buildUiSchema } from "../schema.ts";
import { galleryViews, registerGallery } from "../gallery.ts";

const inertBridge: PlatformBridge = {
  platform: "windows",
  readNote: async () => "",
  writeNote: async () => {},
  chooseNote: async () => undefined,
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
  views: { ...views, ...galleryViews(contracts) },
  fragments,
  commands: new Set(app.commands.ids()),
  viewModels: new Map(app.viewModels.list().map((v) => [v.id, { schema: v.schema, ...(v.setters ? { setters: v.setters } : {}) }])),
  messages: app.messages,
};

const problems = checkUi(inputs);
const coverage = checkFixtureCoverage(contracts);
for (const p of problems) console.error(`✗ ${p.doc} [${p.stage}] ${p.at}: ${p.message}`);
for (const c of coverage) console.error(`✗ fixtures: ${c}`);

if (process.argv.includes("--write")) {
  const out = join(import.meta.dirname, "..", "..", "..", "..", "schemas", "ui");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "view.v1.json"), JSON.stringify(buildUiSchema(inputs), null, 2) + "\n");
  writeFileSync(join(out, "contracts.v1.json"), JSON.stringify({ version: 1, contracts }, null, 2) + "\n");
  console.log(`Wrote ${out}`);
}

const count = Object.keys(inputs.views).length + Object.keys(fragments).length;
if (problems.length || coverage.length) {
  console.error(`ui:check failed: ${problems.length} view problems, ${coverage.length} fixture gaps.`);
  process.exit(1);
}
console.log(`ui:check passed: ${count} documents, ${contracts.length} components, ${app.commands.ids().length} commands.`);

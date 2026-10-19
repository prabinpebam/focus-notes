// The component catalog page's implemented inventory comes from the contracts, so it can't drift
// (design-system audit DS-A07, D-200). The facts machines own (names, tiers, declared states, fixture
// counts, the states listed as gaps) are projected from schemas/ui/catalog.v1.json and
// contracts.v1.json, which `ui:check --verify` keeps equal to the registered contracts. The guidance
// people own (when to use, composition, accessibility) stays
// hand-written, and this check holds it to the contracts too:
//   - the generated block between the markers equals what this script would write;
//   - the TL;DR states each tier's count;
//   - a guidance row marked Implemented names only registered components, of the section's tier (or the
//     tier it says: "Implemented as a primitive"); a Composed or Planned row names no component that is
//     registered in that section's tier; and every registered component has an Implemented row.
// `node tools/component-inventory.mjs` rewrites the block; `--check` (in `pnpm check`) only reads.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
export const DOC = "documentations/design/system/components.md";
export const CATALOG = "schemas/ui/catalog.v1.json";
export const CONTRACTS = "schemas/ui/contracts.v1.json";
export const START = "<!-- generated:component-inventory: node tools/component-inventory.mjs; do not edit by hand -->";
export const END = "<!-- /generated:component-inventory -->";

/** Tier → how the page counts it (singular, plural) and the guidance section that documents it. */
export const TIERS = [
  { tier: "primitive", one: "primitive", many: "primitives", section: "Primitives" },
  { tier: "host", one: "host component", many: "host components", section: "Host components" },
  { tier: "layout", one: "layout", many: "layouts", section: "Layouts" },
  { tier: "block", one: "block component", many: "block components", section: "Block components" },
  { tier: "compound", one: "compound component", many: "compound components", section: "Compound components" },
];
const count = (n, t) => `${n} ${n === 1 ? t.one : t.many}`;

/** The components of each tier, in contract order. */
export function byTier(catalog) {
  const out = Object.fromEntries(TIERS.map((t) => [t.tier, []]));
  for (const c of catalog.components) (out[c.tier] ??= []).push(c);
  return out;
}

/**
 * The generated Markdown that sits between START and END. `contracts` (contracts.v1.json) adds the
 * states each contract lists as uncovered: known gaps, never coverage (D-198).
 */
export function renderInventory(catalog, contracts = { contracts: [] }) {
  const tiers = byTier(catalog);
  const gaps = new Map(contracts.contracts.map((c) => [c.type, Object.keys(c.uncovered ?? {})]));
  const lines = [
    `**${catalog.components.length} registered contracts:** ${TIERS.map((t) => count(tiers[t.tier].length, t)).join(", ")}.`,
    "",
    "| Component | Tier | Declared states | Fixtures | States listed as gaps |",
    "| --- | --- | --- | ---: | --- |",
  ];
  for (const t of TIERS) for (const c of tiers[t.tier]) {
    lines.push(`| ${c.type} | ${t.one} | ${(c.states ?? []).map((s) => `\`${s}\``).join(", ")} | ${(c.fixtures ?? []).length} | ${(gaps.get(c.type) ?? []).map((s) => `\`${s}\``).join(", ") || "None"} |`);
  }
  return lines.join("\n");
}

const lf = (s) => s.replace(/\r\n/g, "\n");

/** The page with its generated block replaced, or null when the markers are missing. */
export function withInventory(doc, catalog, contracts) {
  const text = lf(doc), a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) return null;
  return `${text.slice(0, a + START.length)}\n\n${renderInventory(catalog, contracts)}\n\n${text.slice(b)}`;
}

const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const STATUS = /^(Implemented)(?: as an? (primitive|host|layout|block|compound)\b)?|^(Composed|Planned)\b/;

/** Every disagreement between the page and the catalog, as error lines. Empty when they agree. */
export function lintCatalogDoc(doc, catalog, contracts) {
  const errs = [];
  const text = lf(doc);
  const registered = new Map(catalog.components.map((c) => [c.type, c.tier]));
  const tiers = byTier(catalog);

  const fresh = withInventory(text, catalog, contracts);
  if (fresh === null) errs.push(`${DOC}: the generated inventory markers are missing`);
  else if (fresh !== text) errs.push(`${DOC}: the generated inventory is out of date; run node tools/component-inventory.mjs`);

  const tldr = text.split("\n").find((l) => l.startsWith("> **TL;DR.**")) ?? "";
  if (!tldr) errs.push(`${DOC}: no TL;DR line`);
  if (!tldr.includes(`**${catalog.components.length} registered contracts**`)) errs.push(`${DOC}: the TL;DR must say **${catalog.components.length} registered contracts**`);
  for (const t of TIERS) if (!tldr.includes(`**${count(tiers[t.tier].length, t)}**`)) errs.push(`${DOC}: the TL;DR must say **${count(tiers[t.tier].length, t)}**`);

  // Walk the guidance tables: those whose header starts with Component and has a Status column.
  const implemented = new Set();
  let section = null, statusCol = -1, header = null;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^<h[23][^>]*>(.*?)<\/h[23]>/) ?? line.match(/^#{2,3} (.*)$/);
    if (h) { section = TIERS.find((t) => t.section === h[1].trim()) ?? null; statusCol = -1; continue; }
    if (!line.startsWith("|")) { statusCol = -1; header = null; continue; }
    if (/^\|\s*-/.test(line)) { statusCol = header?.[0] === "Component" ? header.indexOf("Status") : -1; continue; }
    if (statusCol < 0) { header = cells(line); continue; }
    const row = cells(line);
    const names = [...row[0].matchAll(/\*\*([A-Za-z]+)\*\*/g)].map((m) => m[1]);
    const status = (row[statusCol] ?? "").replace(/\*\*/g, "");
    const m = status.match(STATUS);
    const where = `${DOC}:${i + 1}`;
    if (!m) { errs.push(`${where}: status "${status}" must start with Implemented, Composed, or Planned`); continue; }
    if (!section) { errs.push(`${where}: a status row outside a component section`); continue; }
    if (names.length === 0) errs.push(`${where}: the row names no component in bold`);
    for (const name of names) {
      const tier = registered.get(name);
      if (m[1]) {
        const want = m[2] ?? section.tier;
        if (!tier) errs.push(`${where}: ${name} is marked Implemented but has no registered contract`);
        else if (tier !== want) errs.push(`${where}: ${name} is registered as a ${tier}, not a ${want}; say "Implemented as a ${tier}"`);
        else implemented.add(name);
      } else if (tier === section.tier) {
        errs.push(`${where}: ${name} is registered as a ${tier}; mark it Implemented`);
      }
    }
  }
  for (const name of registered.keys()) if (!implemented.has(name)) errs.push(`${DOC}: ${name} is registered (${registered.get(name)}) but no guidance row marks it Implemented`);
  return errs;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const catalog = JSON.parse(readFileSync(join(root, CATALOG), "utf8"));
  const contracts = JSON.parse(readFileSync(join(root, CONTRACTS), "utf8"));
  const path = join(root, DOC);
  let doc = readFileSync(path, "utf8");
  if (!process.argv.includes("--check")) {
    const next = withInventory(doc, catalog, contracts);
    if (next === null) { console.error(`${DOC}: add the generated inventory markers first.`); process.exit(1); }
    if (next !== lf(doc)) { writeFileSync(path, next); doc = next; console.log(`${DOC}: inventory written.`); }
  }
  const errs = lintCatalogDoc(doc, catalog, contracts);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  console.log(`Component catalog agrees with ${catalog.components.length} registered contracts.`);
}

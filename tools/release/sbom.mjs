#!/usr/bin/env node
/**
 * The release's SBOM (DST-03, D-126): a CycloneDX 1.6 JSON document of every production dependency
 * that ships, the same list THIRD_PARTY_NOTICES.md is generated from (`pnpm licenses list --prod`),
 * made here rather than by a downloaded scanner so the release job runs no third-party code for it.
 *
 *   node tools/release/sbom.mjs --version <x.y.z> --out dist/focus-notes-<x.y.z>.cdx.json
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..", "..");

/** A package URL for an npm package: scoped names keep their @, percent-encoded. */
export const purl = (name, version) => `pkg:npm/${name.startsWith("@") ? `%40${name.slice(1)}` : name}@${version}`;

/** CycloneDX from `pnpm licenses list --json` output (license → packages with their versions). */
export function cyclonedx(byLicense, { version, timestamp = new Date().toISOString() }) {
  const components = [];
  for (const [license, pkgs] of Object.entries(byLicense)) {
    for (const p of pkgs) {
      for (const v of p.versions) {
        components.push({
          type: "library",
          "bom-ref": purl(p.name, v),
          name: p.name,
          version: v,
          purl: purl(p.name, v),
          licenses: [/^[A-Za-z0-9.+-]+$/.test(license) ? { license: { id: license } } : { expression: license }],
        });
      }
    }
  }
  components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"]));
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      timestamp,
      component: { type: "application", "bom-ref": `pkg:github/prabinpebam/focus-notes@v${version}`, name: "focus-notes", version, licenses: [{ license: { id: "MIT" } }] },
    },
    components,
    dependencies: [{ ref: `pkg:github/prabinpebam/focus-notes@v${version}`, dependsOn: components.map((c) => c["bom-ref"]) }],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const version = arg("version"), out = arg("out");
  if (!version || !out) { console.error("Usage: sbom.mjs --version <x.y.z> --out <file>"); process.exit(1); }
  const byLicense = JSON.parse(execSync("pnpm licenses list --prod --json", { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const bom = cyclonedx(byLicense, { version });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(bom, null, 2) + "\n");
  console.log(`SBOM: ${bom.components.length} components, ${out}.`);
}

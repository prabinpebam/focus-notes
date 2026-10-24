// The license check (LIC-02): every installed dependency uses an allowed license.
// Policy: documentations/plan/decisions.md#licensing-policy-d-20-details
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "Apache-2.0", "Unlicense", "CC0-1.0",
  "OFL-1.1", "BlueOak-1.0.0", "Python-2.0", "Zlib", "WTFPL",
]);
// Case by case, each with a recorded decision. Tools that don't ship are listed with their reason.
const CASE_BY_CASE = new Map([
  ["MPL-2.0", "axe-core and lightningcss: test and build tools, never shipped as modified source (D-20)"],
  ["CC-BY-4.0", "caniuse-lite data used by build tools only (D-20)"],
  ["CC-BY-3.0", "EFF wordlist and spdx data (D-52)"],
]);
const DENIED = /\b(A?GPL|LGPL|SSPL|BUSL|Commons-Clause|proprietary)/i;
// Packages whose manifest omits the license, verified by reading their license file.
const VERIFIED = new Map([
  ["require-like@0.1.2", "MIT: License file in the package; build-time only (vanilla-extract)"],
  ["duck@0.1.12", "BSD-2-Clause: the manifest says \"BSD\"; its License file is the two-clause text; shipped through mammoth (D-210)"],
]);

const json = execSync("pnpm licenses list --json", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(json);
const problems = [];
let count = 0;
const ok = (expr) => {
  const parts = expr.replace(/[()]/g, "").split(/\s+(?:OR)\s+/);
  return parts.some((p) => p.split(/\s+AND\s+/).every((x) => ALLOWED.has(x.trim()) || CASE_BY_CASE.has(x.trim())));
};
for (const [license, pkgs] of Object.entries(byLicense)) {
  for (const p of pkgs) {
    count++;
    if ((p.versions ?? []).every((v) => VERIFIED.has(`${p.name}@${v}`))) continue;
    if (DENIED.test(license) && !ok(license)) problems.push(`${p.name}@${p.versions?.join(",")}: ${license} is not allowed`);
    else if (!ok(license)) problems.push(`${p.name}@${p.versions?.join(",")}: ${license} needs a decision`);
  }
}
console.log(`Licenses: ${count} packages checked.`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("License check passed.");

// The dependency audit (definition of done → Security): production dependencies have no high or
// critical advisory. pnpm audit asks the registry this repository's .npmrc names (the package feed
// proxy, never the public registry directly). An audit that can't reach its endpoint fails too, so
// a network error never reads as "no advisories".
import { spawnSync } from "node:child_process";

const run = spawnSync("pnpm audit --prod --json", { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  report = undefined;
}
const counts = report?.metadata?.vulnerabilities;
if (!counts) {
  console.error("Dependency audit failed: the registry's audit endpoint gave no report.");
  console.error((run.stderr || run.stdout || "").trim().split("\n").slice(-5).join("\n"));
  process.exit(1);
}
const blocking = (counts.high ?? 0) + (counts.critical ?? 0);
console.log(`Dependency audit: ${report.metadata.dependencies} production dependencies; ` +
  Object.entries(counts).map(([level, n]) => `${n} ${level}`).join(", ") + ".");
if (blocking) {
  for (const a of Object.values(report.advisories ?? {})) {
    if (a.severity === "high" || a.severity === "critical") console.error(`${a.severity}: ${a.module_name} ${a.vulnerable_versions}: ${a.title} (${a.url})`);
  }
  console.error(`Dependency audit failed: ${blocking} high or critical advisories in production dependencies.`);
  process.exit(1);
}
console.log("Dependency audit passed.");

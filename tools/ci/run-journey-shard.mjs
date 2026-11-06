#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHARDS = 4;
const UNKNOWN_SECONDS = 60;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function discoverSpecs(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : discoverSpecs(join(dir, entry.name), relative + "/");
    return entry.isFile() && /\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.name) ? [relative] : [];
  }).sort(compare);
}

export function loadWeights() {
  const baseline = JSON.parse(readFileSync(new URL("./journey-durations.json", import.meta.url), "utf8"));
  if (!baseline.seconds || typeof baseline.seconds !== "object" || Array.isArray(baseline.seconds)) throw new Error("Journey duration baseline must contain a seconds map");
  return baseline.seconds;
}

export function verifyCoverage(files, bins) {
  const assigned = bins.flatMap(bin => bin.files);
  const expected = [...files].sort(compare);
  if (bins.length !== SHARDS || new Set(bins.map(bin => bin.shard)).size !== SHARDS ||
      bins.some(bin => !Number.isInteger(bin.shard) || bin.shard < 1 || bin.shard > SHARDS) ||
      new Set(files).size !== files.length || new Set(assigned).size !== assigned.length ||
      assigned.length !== files.length || [...assigned].sort(compare).some((file, i) => file !== expected[i])) {
    throw new Error("Journey shard coverage must contain every current spec exactly once across four shards");
  }
}

export function partitionSpecs(files, weights) {
  if (new Set(files).size !== files.length) throw new Error("Duplicate journey spec");
  for (const [file, seconds] of Object.entries(weights)) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.round(seconds * 10))) throw new Error(`Invalid journey duration for ${file}`);
  }
  const costs = files.map(file => ({ file, ticks: Math.round((Object.hasOwn(weights, file) ? weights[file] : UNKNOWN_SECONDS) * 10) }));
  const bins = Array.from({ length: SHARDS }, (_, i) => ({ shard: i + 1, ticks: 0, files: [] }));
  for (const cost of costs.sort((a, b) => b.ticks - a.ticks || compare(a.file, b.file))) {
    const bin = [...bins].sort((a, b) => a.ticks - b.ticks || a.shard - b.shard)[0];
    bin.ticks += cost.ticks;
    bin.files.push(cost.file);
  }
  const result = bins.map(bin => ({ shard: bin.shard, seconds: bin.ticks / 10, files: bin.files.sort(compare) }));
  verifyCoverage(files, result);
  return result;
}

export function playwrightArgs(files) {
  if (!files.length) throw new Error("An empty file selection must never run the whole journey suite");
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ["test", "--workers=1", "--retries=0", ...files.map(file => `[\\\\/]e2e[\\\\/]${file.split("/").map(escape).join("[\\\\/]")}$`)];
}

export function parseArgs(args) {
  if (args.length === 1 && args[0] === "--check") return { check: true };
  const match = args.length === 1 && /^--shard=([1-4])\/4$/.exec(args[0]);
  if (!match) throw new Error("Usage: node tools/ci/run-journey-shard.mjs --shard=<1..4>/4 | --check");
  return { shard: Number(match[1]), check: false };
}

function main(args) {
  const options = parseArgs(args);
  const desktop = join(root, "apps", "desktop");
  const files = discoverSpecs(join(desktop, "e2e"));
  if (!files.length) throw new Error("No journey specs discovered");
  const weights = loadWeights();
  const bins = partitionSpecs(files, weights);
  console.log(JSON.stringify({
    specs: files.length,
    unknown: files.filter(file => !Object.hasOwn(weights, file)),
    unknownSeconds: UNKNOWN_SECONDS,
    shards: options.check ? bins : bins.filter(bin => bin.shard === options.shard),
  }, null, 2));
  if (options.check) return 0;
  const selected = bins.find(bin => bin.shard === options.shard);
  if (!selected.files.length) { console.log(`Shard ${options.shard} has no assigned specs; coverage verified.`); return 0; }
  const cli = createRequire(join(desktop, "package.json")).resolve("@playwright/test/cli");
  const run = spawnSync(process.execPath, [cli, ...playwrightArgs(selected.files)], { cwd: desktop, stdio: "inherit", env: { ...process.env, FOCUS_NOTES_E2E: "1" } });
  if (run.error) throw run.error;
  if (run.signal) throw new Error(`Journey shard interrupted by ${run.signal}`);
  if (run.status === null) throw new Error("Journey shard returned no exit status");
  return run.status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}

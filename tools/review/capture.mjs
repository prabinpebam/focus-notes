#!/usr/bin/env node
/**
 * Runs a review catalogue's journey and collects its captures in test-results/review/<name>
 * (tools/review/catalogs.mjs, D-146):
 *
 *   node tools/review/capture.mjs fre-catalog [--repeat 10] [--grep "light, small"] [--only "system menu"]
 *
 * Every window size only on CI: the Review captures workflow sets FOCUS_NOTES_E2E_ALLOW_SCREEN=1
 * there. Anywhere else the variable is dropped, so a local capture takes the default window only and
 * never resizes a window over the owner's apps (D-141). Exits with the journey's exit code, after
 * collecting whatever it captured.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { catalog, outDir } from "./catalogs.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The arguments and environment for one capture; pure, so the rules are testable. */
export function plan(name, { repeat = "1", grep = "", only = "", env = process.env } = {}) {
  const c = catalog(name);
  const n = Number(repeat || "1");
  if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error(`--repeat must be a whole number from 1 to 20, not "${repeat}".`);
  for (const [flag, v] of [["--grep", grep], ["--only", only]]) if (v.length > 200 || /[\r\n]/.test(v)) throw new Error(`${flag} must be one line of at most 200 characters.`);
  if (only && !c.onlyEnv) throw new Error(`${name} can't be narrowed with --only.`);
  const out = outDir(name);
  const ci = Boolean(env.CI);
  const next = { ...env, FOCUS_NOTES_E2E: "1", ...c.env };
  if (c.outEnv) next[c.outEnv] = join(root, out);
  if (only) next[c.onlyEnv] = only;
  // Every window size resizes a real window: CI only (D-141).
  if (!ci) delete next.FOCUS_NOTES_E2E_ALLOW_SCREEN;
  const args = ["test", c.spec, ...(n > 1 ? [`--repeat-each=${n}`] : []), ...(grep ? ["-g", grep] : [])];
  return { args, env: next, out, sizes: ci && next.FOCUS_NOTES_E2E_ALLOW_SCREEN === "1" ? "every size" : "the default window only" };
}

function main(argv) {
  const [name, ...rest] = argv;
  const opt = (flag) => {
    const i = rest.indexOf(flag);
    if (i < 0) return undefined;
    // An empty value may be dropped by the shell: the next flag is never a value.
    const v = rest[i + 1];
    return v === undefined || v.startsWith("--") ? "" : v;
  };
  const p = plan(name ?? "", { repeat: opt("--repeat"), grep: opt("--grep"), only: opt("--only") });
  const c = catalog(name);
  const out = join(root, p.out);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const from = c.from ? join(root, c.from) : undefined;
  if (from && existsSync(from)) for (const f of readdirSync(from)) if (c.match.test(f)) rmSync(join(from, f));
  console.log(`Capturing ${name} at ${p.sizes} into ${p.out}`);
  const desktop = join(root, "apps", "desktop");
  const cli = createRequire(join(desktop, "package.json")).resolve("@playwright/test/cli");
  const run = spawnSync(process.execPath, [cli, ...p.args], { cwd: desktop, env: p.env, stdio: "inherit" });
  if (from && existsSync(from)) for (const f of readdirSync(from)) if (c.match.test(f)) copyFileSync(join(from, f), join(out, f));
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const files = readdirSync(out).filter((f) => f.endsWith(".png")).sort();
  writeFileSync(join(out, "capture.json"), JSON.stringify({ catalog: name, spec: c.spec, commit, sizes: p.sizes, args: p.args, ...(c.onlyEnv && p.env[c.onlyEnv] ? { only: p.env[c.onlyEnv] } : {}), exitCode: run.status, images: files.length, files }, null, 2));
  console.log(`${files.length} images in ${p.out} (journey exit code ${run.status})`);
  return run.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 2;
  }
}

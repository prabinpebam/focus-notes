// The agent kits check (D-205): agentic-craft and agent-orchestration are pinned as submodules, and
// their skills and agents are installed into .github/ by each kit's own installer. The installed
// copies belong to the kits: this fails when one differs from its pinned kit (edited here, or the
// pointer moved without reinstalling), or when a kit's project facts in AGENTS.md are unfilled.
// Kits that aren't checked out (CI doesn't fetch submodules) are skipped, not failed.
//   node tools/agent-kits.mjs          check
//   node tools/agent-kits.mjs --sync   run both installers (keeps the facts), then check
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
export const KITS = [
  { name: "agentic-craft", marker: "agentic-craft" },
  { name: "agent-orchestration", marker: "agent-orchestration" },
];

const files = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
const text = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Problems for one kit, or null when the kit isn't checked out. */
export function checkKit(kit, repo = root) {
  const src = join(repo, kit.name);
  if (!existsSync(join(src, "skills"))) return null;
  const errs = [];
  const pairs = [];
  for (const s of readdirSync(join(src, "skills"))) {
    for (const f of files(join(src, "skills", s))) pairs.push([f, join(repo, ".github", "skills", s, relative(join(src, "skills", s), f))]);
  }
  for (const a of readdirSync(join(src, "agents")).filter((f) => f.endsWith(".agent.md"))) pairs.push([join(src, "agents", a), join(repo, ".github", "agents", a)]);
  for (const [from, to] of pairs) {
    const at = relative(repo, to).split("\\").join("/");
    if (!existsSync(to)) errs.push(`${at}: missing`);
    else if (text(from) !== text(to)) errs.push(`${at}: differs from ${kit.name}`);
  }
  const agents = existsSync(join(repo, "AGENTS.md")) ? text(join(repo, "AGENTS.md")) : "";
  const start = agents.indexOf(`<!-- ${kit.marker}:start -->`);
  const end = agents.indexOf(`<!-- ${kit.marker}:end -->`);
  if (start < 0 || end < start) errs.push(`AGENTS.md: no ${kit.name} section`);
  else if (/<(path|…)|<[a-z]+ folder>|<work branch/.test(agents.slice(start, end))) errs.push(`AGENTS.md: the ${kit.name} project facts still have placeholders`);
  return errs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--sync")) for (const k of KITS) execFileSync(process.execPath, [join(root, k.name, "tools", "install.mjs"), root], { stdio: "inherit" });
  let failed = false;
  for (const k of KITS) {
    const errs = checkKit(k);
    if (errs === null) console.log(`${k.name}: skipped (submodule not checked out)`);
    else if (errs.length) {
      failed = true;
      for (const e of errs) console.error(`${k.name}: ${e}`);
    } else console.log(`${k.name}: installed copies match the pinned kit`);
  }
  if (failed) {
    console.error("Reinstall with `node tools/agent-kits.mjs --sync`; put project specifics in AGENTS.md's facts, never in the copies.");
    process.exit(1);
  }
}

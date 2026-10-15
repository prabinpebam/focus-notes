#!/usr/bin/env node
/**
 * Update app (DST-06, D-135), run by .github/workflows/update.yml. No dependencies, Node 20 or later.
 *
 *   update.mjs latest <releases.json>     prints version=<x.y.z> if a newer release is out, else version=
 *   update.mjs plan --version <x.y.z> --template <dir> --bundle <tgz> --out <dir>
 *                                         stages the template-managed files that changed, and plan.json
 *   update.mjs open --plan <dir>          opens or updates the one update pull request (GH_TOKEN)
 *
 * An update changes only the files .focus-notes/managed.json lists, never notes/, private/ or the
 * workspace format. Workflow files are listed for you to copy by hand: the workflow's own token
 * may not change them. Nothing merges by itself.
 */
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE = "prabinpebam/focus-notes";
export const BRANCH = "focus-notes/update";
export const PIN = ".focus-notes/app.json";
export const MANIFEST = ".focus-notes/managed.json";

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** -1, 0 or 1. A suffixed version (1.0.0-beta.1) comes before the plain one. */
export function compareVersions(a, b) {
  const x = VERSION.exec(a), y = VERSION.exec(b);
  if (!x || !y) throw new Error(`Not a version: ${x ? b : a}`);
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) < Number(y[i]) ? -1 : 1;
  if (x[4] === y[4]) return 0;
  if (!x[4] || !y[4]) return x[4] ? -1 : 1;
  return x[4] < y[4] ? -1 : 1;
}

/** The files a release must have for an instance to take it. */
export const assetsOf = (version) => [`focus-notes-web-${version}.tgz`, `focus-notes-workspace-${version}.tgz`, "SHA256SUMS"];

/**
 * The newest published release tagged exactly v<x.y.z> with a bundle, a template and SHA256SUMS:
 * never a draft, the rolling `preview`, a dry run (`-dryrun`) or any other suffixed tag. Stage exits
 * below 1.0.0 are pre-releases on GitHub, and count.
 */
export function pickLatest(releases) {
  let best = null;
  for (const r of releases ?? []) {
    if (r?.draft || !/^v\d+\.\d+\.\d+$/.test(r?.tag_name ?? "")) continue;
    const version = r.tag_name.slice(1);
    const names = new Set((r.assets ?? []).map((a) => a.name));
    if (assetsOf(version).every((n) => names.has(n)) && (!best || compareVersions(version, best) > 0)) best = version;
  }
  return best;
}

/** The pinned release, as the Deploy app workflow reads it. */
export function readPin(text) {
  const pin = JSON.parse(text);
  if (typeof pin?.version !== "string" || !VERSION.test(pin.version)) throw new Error(`${PIN} has no version`);
  if (typeof pin.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pin.sha256)) throw new Error(`${PIN} has no SHA-256`);
  return { version: pin.version, sha256: pin.sha256 };
}

/** A path an update may change: relative, plain, and never notes, private notes or the format. */
export function checkManagedPath(p) {
  const parts = typeof p === "string" ? p.split("/") : [];
  const plain = parts.length > 0 && !p.includes("\\") && posix.normalize(p) === p && parts.every((s) => s && s !== "." && s !== "..");
  if (!plain) throw new Error(`Not a plain relative path: ${JSON.stringify(p)}`);
  const lower = p.toLowerCase();
  if (parts.some((s) => s.toLowerCase() === ".git") || /^(notes|private)(\/|$)/.test(lower) || [".gitmodules", ".focus-notes/workspace.json"].includes(lower)) {
    throw new Error(`An update never changes ${p}`);
  }
  return p;
}

/** The template-managed files a manifest lists, checked; it must list the pin. */
export function readManifest(text) {
  const { managed } = JSON.parse(text);
  if (!Array.isArray(managed)) throw new Error(`${MANIFEST} has no managed list`);
  const paths = managed.map(checkManagedPath);
  if (new Set(paths).size !== paths.length) throw new Error(`${MANIFEST} lists a file twice`);
  if (!paths.includes(PIN)) throw new Error(`${MANIFEST} doesn't list ${PIN}`);
  return paths;
}

export const isWorkflow = (p) => p.startsWith(".github/workflows/");

/**
 * What an update to `version` changes. `readNext` reads the release's template, `readCurrent` this
 * repository; each returns null for a missing file. The release's template must pin exactly the
 * bundle that was checked. Files the template no longer has are left alone.
 */
export function planUpdate({ version, bundleSha256, readNext, readCurrent }) {
  const pin = readPin(readNext(PIN));
  if (pin.version !== version) throw new Error(`The release's template pins ${pin.version}, not ${version}`);
  if (pin.sha256 !== bundleSha256) throw new Error("The release's template pins a different bundle from the one checked");
  const write = [], manual = [];
  for (const p of readManifest(readNext(MANIFEST))) {
    const next = readNext(p);
    if (next === null || next === readCurrent(p)) continue;
    (isWorkflow(p) ? manual : write).push(p);
  }
  return { version, write, manual };
}

export const prTitle = (version) => `Update Focus Notes to ${version}`;

/** One update pull request at a time, from BRANCH: create it, move it to the new version, or leave it. */
export function decide({ version, open }) {
  const mine = (open ?? []).filter((pr) => pr.head?.ref === BRANCH);
  if (mine.length === 0) return { action: "create" };
  if (mine[0].title === prTitle(version)) return { action: "none", number: mine[0].number };
  return { action: "update", number: mine[0].number };
}

export function prBody({ from, version, write, manual }) {
  const source = `https://github.com/${SOURCE}`;
  const lines = [
    `Focus Notes [${version}](${source}/releases/tag/v${version}) is out; this repository deploys ${from}.`,
    "",
    "Its web app bundle and this repository's template files were checked against the release's SHA256SUMS and its attestation, made by the release workflow for that exact tag.",
    "",
    "**Changes** (only template-managed files, never your notes):",
    ...write.map((p) => `- \`${p}\``),
  ];
  if (manual.length) {
    lines.push("", "**Copy these yourself.** The workflow's token may not change workflow files, so take them from the release's `focus-notes-workspace-" + version + ".tgz` or the template repository:", ...manual.map((p) => `- \`${p}\``));
  }
  lines.push("", "Merging deploys the new version. Nothing changes until you merge (DST-06).");
  return lines.join("\n");
}

/** A file's text, or null if it isn't a regular file (never follows a link out of the folder). */
function readIn(dir, p) {
  const file = join(dir, ...p.split("/"));
  try {
    return lstatSync(file).isFile() ? readFileSync(file, "utf8") : null;
  } catch {
    return null;
  }
}

function plan({ version, template, bundle, out }) {
  const bundleSha256 = createHash("sha256").update(readFileSync(bundle)).digest("hex");
  const current = readPin(readFileSync(PIN, "utf8"));
  const result = planUpdate({ version, bundleSha256, readNext: (p) => readIn(template, p), readCurrent: (p) => readIn(".", p) });
  for (const p of result.write) {
    const to = join(out, "files", ...p.split("/"));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, readIn(template, p));
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "plan.json"), JSON.stringify({ ...result, from: current.version }, null, 2));
  console.log(`Update to ${version}: ${result.write.join(", ")}${result.manual.length ? `; copy by hand: ${result.manual.join(", ")}` : ""}`);
}

async function open({ planDir }) {
  const { GH_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  const p = JSON.parse(readFileSync(join(planDir, "plan.json"), "utf8"));
  if (!VERSION.test(p.version) || !p.write.length) throw new Error("plan.json has nothing to change");
  for (const f of [...p.write, ...p.manual]) checkManagedPath(f);
  if (p.write.some(isWorkflow)) throw new Error("A workflow file can't be part of the commit");
  const api = async (path, method = "GET", body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) {
      const hint = res.status === 403 && path.startsWith("/pulls") ? " Turn on Settings -> Actions -> General -> Allow GitHub Actions to create and approve pull requests." : "";
      throw new Error(`${method} ${path}: HTTP ${res.status}.${hint}`);
    }
    return res.status === 204 ? null : res.json();
  };
  const { default_branch: base } = await api("");
  const owner = repo.split("/")[0];
  const d = decide({ version: p.version, open: await api(`/pulls?state=open&head=${encodeURIComponent(`${owner}:${BRANCH}`)}`) });
  if (d.action === "none") return console.log(`Pull request #${d.number} already updates to ${p.version}.`);
  const head = (await api(`/git/ref/heads/${base.split("/").map(encodeURIComponent).join("/")}`)).object.sha;
  const baseTree = (await api(`/git/commits/${head}`)).tree.sha;
  const tree = p.write.map((f) => ({ path: f, mode: "100644", type: "blob", content: readFileSync(join(planDir, "files", ...f.split("/")), "utf8") }));
  const { sha: treeSha } = await api("/git/trees", "POST", { base_tree: baseTree, tree });
  const { sha } = await api("/git/commits", "POST", { message: prTitle(p.version), tree: treeSha, parents: [head] });
  // The bot branch always holds one commit on the default branch's tip.
  try {
    await api(`/git/refs/heads/${BRANCH}`, "PATCH", { sha, force: true });
  } catch {
    await api("/git/refs", "POST", { ref: `refs/heads/${BRANCH}`, sha });
  }
  const pr = { title: prTitle(p.version), body: prBody(p) };
  const done = d.action === "create" ? await api("/pulls", "POST", { ...pr, head: BRANCH, base }) : await api(`/pulls/${d.number}`, "PATCH", pr);
  console.log(`Pull request #${done.number}: ${pr.title}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    if (cmd === "latest") {
      const latest = pickLatest(JSON.parse(readFileSync(rest[0], "utf8")));
      const { version } = readPin(readFileSync(PIN, "utf8"));
      const newer = latest && compareVersions(latest, version) > 0 ? latest : "";
      console.error(newer ? `Focus Notes ${newer} is out; this repository deploys ${version}.` : `Up to date: ${version} (latest ${latest ?? "none"}).`);
      console.log(`version=${newer}`);
    } else if (cmd === "plan") {
      plan({ version: arg("version"), template: arg("template"), bundle: arg("bundle"), out: arg("out") });
    } else if (cmd === "open") {
      await open({ planDir: arg("plan") });
    } else {
      throw new Error("Usage: update.mjs latest <releases.json> | plan ... | open --plan <dir>");
    }
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}

// The Git the Microsoft Store package carries (PKG-13, D-228): fetches the archive
// apps/desktop/build/git-bundle.json pins, refuses it unless its SHA-256 and size are exactly the
// pin's, unpacks it into apps/desktop/vendor/git and checks that Git, its sign-in helper and Git LFS
// run. dist-store.mjs calls ensureGitBundle before packing; nothing else ships it.
//
//   node tools/release/git-bundle.mjs                   fetch (or reuse) and check the bundle
//   node tools/release/git-bundle.mjs --archive <file>  use an archive already downloaded (still verified)
//   node tools/release/git-bundle.mjs --latest          show dugite-native's latest release, to update the pin
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..", "..");
export const PIN_FILE = join(root, "apps", "desktop", "build", "git-bundle.json");
export const VENDOR_DIR = join(root, "apps", "desktop", "vendor", "git");
const MARKER = ".focus-notes-bundle";

export const readPin = (file = PIN_FILE) => JSON.parse(readFileSync(file, "utf8"));

/** Every way the pin itself is malformed; empty when it's usable. */
export function pinProblems(pin) {
  const problems = [];
  if (!/^[0-9a-f]{64}$/.test(pin.sha256 ?? "")) problems.push("sha256 isn't 64 lowercase hex digits.");
  if (!Number.isInteger(pin.size) || pin.size <= 0) problems.push("size isn't a positive whole number.");
  if (!/^https:\/\/github\.com\/desktop\/dugite-native\/releases\/download\//.test(pin.url ?? "")) problems.push("url isn't a dugite-native release download.");
  if (pin.url && pin.asset && !pin.url.endsWith(`/${pin.tag}/${pin.asset}`)) problems.push("url doesn't name the pinned tag and asset.");
  if (!/windows-x64\.tar\.gz$/.test(pin.asset ?? "")) problems.push("asset isn't the Windows x64 archive.");
  for (const k of ["git", "gcm", "lfs"]) if (!pin.versions?.[k]) problems.push(`versions.${k} is missing.`);
  if (!Array.isArray(pin.components) || pin.components.length === 0) problems.push("components is empty.");
  for (const c of pin.components ?? []) for (const k of ["name", "version", "license", "homepage", "source", "what"]) if (!c[k]) problems.push(`A component has no ${k}.`);
  return problems;
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Why this archive isn't the pinned one, or undefined when it is. */
export async function archiveProblem(file, pin) {
  const size = statSync(file).size;
  if (size !== pin.size) return `The archive is ${size} bytes, not the pinned ${pin.size}.`;
  const sha = await sha256File(file);
  if (sha !== pin.sha256) return `The archive's SHA-256 is ${sha}, not the pinned ${pin.sha256}.`;
  return undefined;
}

/**
 * One SHA-256 over every file under `dir` (its path and its bytes), the marker aside, so any file
 * added, changed or removed after unpacking changes it. Refuses a link or junction: the package would
 * follow it to files outside the bundle.
 */
export async function treeDigest(dir) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const s = lstatSync(p);
      if (s.isSymbolicLink()) throw new Error(`The Git bundle has a link: ${relative(dir, p)}.`);
      if (s.isDirectory()) walk(p);
      else if (!s.isFile()) throw new Error(`The Git bundle has something that isn't a file or folder: ${relative(dir, p)}.`);
      else if (p !== join(dir, MARKER)) files.push([relative(dir, p).replaceAll("\\", "/"), p]);
    }
  };
  walk(dir);
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const hash = createHash("sha256");
  for (const [name, p] of files) hash.update(`${name}\0${await sha256File(p)}\n`);
  return hash.digest("hex");
}

const readMarker = (dest) => {
  try {
    return JSON.parse(readFileSync(join(dest, MARKER), "utf8"));
  } catch {
    return undefined;
  }
};

/** Whether `dest` holds exactly the unpacked bundle of this pin: the same archive, and no file changed since. */
export async function isUnpacked(dest, pin) {
  const marker = readMarker(dest);
  if (marker?.sha256 !== pin.sha256 || !existsSync(join(dest, "cmd", "git.exe"))) return false;
  try {
    return (await treeDigest(dest)) === marker.tree;
  } catch {
    return false;
  }
}

// Windows' own bsdtar: a GNU tar earlier on PATH (Git Bash's, on CI) reads C:\… as a remote host.
const tarProgram = () => (process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar");

/** Streams the archive to `file`, never more than the pinned size, within 10 minutes; a part file until it's whole. */
async function download(url, file, size, log) {
  log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`Downloading the Git bundle failed: HTTP ${res.status}.`);
  const length = res.headers.get("content-length");
  if (length !== null && Number(length) !== size) throw new Error(`The Git bundle is ${length} bytes, not the pinned ${size}.`);
  const part = `${file}.part`;
  const out = await open(part, "w");
  let got = 0;
  try {
    for await (const chunk of res.body) {
      got += chunk.length;
      if (got > size) throw new Error(`The Git bundle is more than the pinned ${size} bytes.`);
      await out.write(chunk);
    }
  } catch (e) {
    await out.close();
    rmSync(part, { force: true });
    throw e;
  }
  await out.close();
  renameSync(part, file);
}

/** System settings a bundle must never bring: they'd trust every folder, run other programs, or pull in other settings. */
export const RISKY_SETTING = /^(safe\.directory|core\.hookspath|core\.fsmonitor|core\.sshcommand|core\.pager|core\.editor|core\.askpass|include\.|includeif\.|url\..*\.insteadof|http\.sslverify=false|credential\.helper=(?!manager$))/i;

/** What the unpacked Git reports, so a broken or wrong bundle never reaches a package. */
export function smokeProblems(dest, pin) {
  const git = join(dest, "cmd", "git.exe");
  // None of this computer's Git settings: only the bundle's own.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  const run = (...args) => {
    const r = spawnSync(git, args, { encoding: "utf8", env });
    return `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  };
  const problems = [];
  const version = run("--version");
  if (!version.includes(pin.versions.git)) problems.push(`git --version says "${version}", not ${pin.versions.git}.`);
  const gcm = run("credential-manager", "--version");
  if (!gcm.startsWith(pin.versions.gcm)) problems.push(`git credential-manager --version says "${gcm}", not ${pin.versions.gcm}.`);
  const lfs = run("lfs", "version");
  if (!lfs.includes(`git-lfs/${pin.versions.lfs}`)) problems.push(`git lfs version says "${lfs}", not ${pin.versions.lfs}.`);
  const helper = run("config", "--system", "--get-all", "credential.helper");
  if (helper !== "manager") problems.push(`The bundle's credential.helper is "${helper}", not manager.`);
  for (const line of run("config", "--system", "--list").split(/\r?\n/)) if (RISKY_SETTING.test(line)) problems.push(`The bundle's system settings have ${line}.`);
  return problems;
}

/**
 * Makes `dest` hold exactly the pinned bundle and returns its folder. Reuses it only when the marker
 * names this archive and every file is still as unpacked (treeDigest); otherwise downloads (or takes `archive`), verifies before unpacking, unpacks into a
 * sibling folder and renames it into place, so a failure never leaves a half-unpacked bundle.
 */
export async function ensureGitBundle({ pin = readPin(), dest = VENDOR_DIR, archive, smoke = process.platform === "win32", log = console.log } = {}) {
  const problems = pinProblems(pin);
  if (problems.length) throw new Error(`apps/desktop/build/git-bundle.json: ${problems.join(" ")}`);
  if (await isUnpacked(dest, pin)) {
    log(`Git bundle ${pin.tag} is already in ${dest}.`);
    return dest;
  }
  const parent = join(dest, "..");
  mkdirSync(parent, { recursive: true });
  const file = archive ?? join(parent, pin.asset);
  if (!archive && !(existsSync(file) && statSync(file).size === pin.size)) await download(pin.url, file, pin.size, log);
  const problem = await archiveProblem(file, pin);
  if (problem) {
    if (!archive) rmSync(file, { force: true });
    throw new Error(`Refusing the Git bundle: ${problem}`);
  }
  const staging = `${dest}.unpacking`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  const tar = spawnSync(tarProgram(), ["-xzf", file, "-C", staging], { encoding: "utf8" });
  if (tar.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`Unpacking the Git bundle failed: ${tar.stderr || tar.error?.message || `exit ${tar.status}`}`);
  }
  if (!existsSync(join(staging, "cmd", "git.exe"))) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error("The Git bundle has no cmd/git.exe.");
  }
  if (smoke) {
    const bad = smokeProblems(staging, pin);
    if (bad.length) {
      rmSync(staging, { recursive: true, force: true });
      throw new Error(`The Git bundle doesn't run: ${bad.join(" ")}`);
    }
  }
  let tree;
  try {
    tree = await treeDigest(staging);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  writeFileSync(join(staging, MARKER), `${JSON.stringify({ sha256: pin.sha256, tree })}\n`);
  rmSync(dest, { recursive: true, force: true });
  renameSync(staging, dest);
  log(`Git bundle ${pin.tag} (Git ${pin.versions.git}, Git Credential Manager ${pin.versions.gcm}, Git LFS ${pin.versions.lfs}) is in ${dest}.`);
  return dest;
}

async function latest() {
  const res = await fetch("https://api.github.com/repos/desktop/dugite-native/releases/latest", { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const release = await res.json();
  const asset = release.assets.find((a) => /windows-x64\.tar\.gz$/.test(a.name));
  console.log(`Latest: ${release.tag_name} (${release.published_at})`);
  if (asset) console.log(`  asset ${asset.name}\n  url ${asset.browser_download_url}\n  size ${asset.size}\n  digest ${asset.digest ?? "(none: download it and run certutil -hashfile <file> SHA256)"}`);
  console.log(`Pinned: ${readPin().tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--archive");
  const run = argv.includes("--latest") ? latest() : ensureGitBundle({ archive: at >= 0 ? argv[at + 1] : undefined });
  run.catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

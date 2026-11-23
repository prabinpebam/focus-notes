import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { GitHubApi } from "@focus-notes/github";
import type { SealedArtifactPublisher } from "./site.ts";
import type { SitePairing } from "./setup.ts";

/** Reads a file from the deployed site: its text, or undefined while it isn't there yet. */
export type DeployedSiteGet = (url: string) => Promise<string | undefined>;

const SITE_DIR = "site";
const fail = (code: string) => new Error(`sharing:${code}`);
const gitBlobSha = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

async function artifactFiles(directory: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink() || (await lstat(full)).isSymbolicLink()) throw fail("artifact");
      if (entry.isDirectory()) await walk(full, path);
      else if (entry.isFile()) {
        const bytes = await readFile(full);
        // The blob API takes text here; a byte that isn't UTF-8 would be changed in transit.
        if (!Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes)) throw fail("artifact");
        files.set(path, bytes);
      } else throw fail("artifact");
    }
  };
  await walk(directory, "");
  if (!files.has("focus-notes.json")) throw fail("artifact");
  return files;
}

/**
 * The deployed site's own fetch: no cookies, no redirects. A review build with a loopback GitHub
 * (`FOCUS_NOTES_CANDIDATE_GITHUB_API`) reads its Pages from that loopback too, never github.io.
 */
export const fetchDeployedSite: DeployedSiteGet = async url => {
  const candidate = process.env.FOCUS_NOTES_CANDIDATE_GITHUB_API;
  if (candidate) {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(candidate)) throw fail("failed");
    const source = new URL(url);
    url = `${candidate}/pages/${source.hostname}${source.pathname}`;
  }
  let response: Response;
  try {
    response = await fetch(url, { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch { throw fail("offline"); }
  if (response.status === 404) return undefined;
  if (!response.ok) throw fail("failed");
  return response.text();
};

/**
 * Pushes a sealed artifact to the paired public site's `site/` folder as one non-forced commit, then
 * waits until GitHub Pages serves that build. Only the public site repository is ever written.
 */
export function pagesArtifactPublisher(deps: {
  api(): Promise<GitHubApi | undefined>;
  target(project: string): Promise<Pick<SitePairing, "project" | "owner" | "name" | "site"> | undefined>;
  get?: DeployedSiteGet;
  timeoutMs?: number;
  delayMs?: number;
}): SealedArtifactPublisher {
  return async (project, artifact) => {
    const target = await deps.target(project);
    if (!target || target.project !== project) throw fail("unconfigured");
    const api = await deps.api();
    if (!api) throw fail("signedout");
    const { owner, name } = target;
    if (`${owner}/${name}`.toLowerCase() === project.toLowerCase()) throw fail("refused");
    const files = await artifactFiles(artifact.directory);
    const repo = await api.repo(owner, name);
    if (repo.private || repo.template || !repo.canPush) throw fail("refused");
    const head = await api.head(owner, name, repo.defaultBranch);
    if (!head) throw fail("missing");
    const base = await api.commitTree(owner, name, head);
    const listing = await api.tree(owner, name, base);
    // A partial listing could leave stale encrypted files behind; refuse rather than guess.
    if (listing.truncated) throw fail("failed");
    const existing = new Map(listing.entries.filter(entry => entry.type === "blob" && entry.path.startsWith(`${SITE_DIR}/`)).map(entry => [entry.path, entry.sha]));
    const entries: { path: string; sha: string | null }[] = [];
    for (const [path, bytes] of files) {
      const full = `${SITE_DIR}/${path}`;
      const sha = gitBlobSha(bytes);
      if (existing.get(full) !== sha) entries.push({ path: full, sha: await api.createBlob(owner, name, bytes.toString("utf8")) });
    }
    for (const path of existing.keys()) if (!files.has(path.slice(SITE_DIR.length + 1))) entries.push({ path, sha: null });
    const tree = await api.createTree(owner, name, base, entries);
    const commit = await api.createCommit(owner, name, "Publish site", tree, [head]);
    await api.updateRef(owner, name, repo.defaultBranch, commit);
    const get = deps.get ?? fetchDeployedSite;
    const manifest = new URL("focus-notes.json", target.site.endsWith("/") ? target.site : `${target.site}/`).href;
    const until = Date.now() + (deps.timeoutMs ?? 600_000);
    let status: "built" | "building" = "building";
    while (true) {
      const text = await get(manifest);
      try { if (text !== undefined && (JSON.parse(text) as { build?: unknown }).build === artifact.build) { status = "built"; break; } }
      catch { /* An earlier or partial deployment: keep waiting for this build. */ }
      if (Date.now() >= until) break;
      await delay(Math.min(deps.delayMs ?? 5000, Math.max(1, until - Date.now())));
    }
    return { status: "published", commit, pages: { status, repository: `${owner}/${name}`, build: artifact.build } };
  };
}

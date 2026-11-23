import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { GitHubError, type GitHubApi } from "@focus-notes/github";
import type { ArtifactPublication, SealedArtifactPublisher } from "./site.ts";

/** Saving to GitHub, then the Pages workflow for that exact commit: queued, building, built (G3.1, G3.5). */
export type PagesPublishState = "saving" | "queued" | "building" | "built";
export interface PagesTarget { owner: string; name: string }
type PagesStatus = Extract<ArtifactPublication, { status: "published" }>["pages"]["status"];

const SITE = "site";
const WORKFLOW = ".github/workflows/pages.yml";
const fail = (code: string) => new Error(`sharing:${code}`);

function problem(error: unknown): Error {
  if (error instanceof Error && /^sharing:[a-z]+$/.test(error.message)) return error;
  if (error instanceof GitHubError) return fail(error.status === 0 ? "offline" : error.unauthorized ? "signedout"
    : error.rateLimited ? "ratelimited" : error.status === 403 || error.status === 404 ? "refused"
    : error.status === 409 || error.status === 422 ? "changed" : "failed");
  return fail("failed");
}

const gitBlobSha = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

/** Every file of the sealed artifact, by site-relative path. Links, dot-names and anything outside it are refused. */
async function artifactFiles(directory: string, build: string): Promise<{ path: string; bytes: Buffer; sha: string }[]> {
  const out: { path: string; bytes: Buffer; sha: string }[] = [];
  const walk = async (dir: string, prefix: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name.includes("\\")) throw fail("failed");
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else if (entry.isFile()) {
        const bytes = await readFile(join(dir, entry.name));
        out.push({ path, bytes, sha: gitBlobSha(bytes) });
      } else throw fail("failed");
    }
  };
  await walk(directory, "");
  const manifest = out.find(f => f.path === "focus-notes.json");
  let manifestBuild: unknown;
  try { manifestBuild = manifest && (JSON.parse(manifest.bytes.toString("utf8")) as { build?: unknown }).build; } catch { /* refused below */ }
  if (manifestBuild !== build) throw fail("failed");
  return out;
}

/**
 * The live G3 artifact publisher: one commit replacing the paired public repository's `site/` with the
 * sealed, leak-checked artifact (so removed notes leave the current site), pushed without force, then
 * Published only once that exact commit's Pages workflow has succeeded. It never runs the leak gate
 * itself: the caller's sealing (`publish`) rejects a leak before this is reached, so nothing is pushed.
 */
export function pagesPublisher(o: {
  api(): Promise<GitHubApi | undefined>;
  /** The paired public repository for this private project, or undefined if the pairing changed. */
  target(project: string): Promise<PagesTarget | undefined>;
  state?(state: PagesPublishState, commit?: string): void;
  timeoutMs?: number;
  delayMs?: number;
}): SealedArtifactPublisher {
  return async (project, artifact) => {
    try {
      const target = await o.target(project);
      if (!target) throw fail("changed");
      const api = await o.api();
      if (!api) throw fail("signedout");
      const files = await artifactFiles(artifact.directory, artifact.build);
      const { owner, name } = target, base = `/repos/${owner}/${name}`;
      const repo = await api.repo(owner, name);
      if (repo.private || !repo.canPush) throw fail("refused");
      const head = await api.head(owner, name, repo.defaultBranch);
      if (!head) throw fail("failed");
      const baseTree = await api.commitTree(owner, name, head);
      const { entries, truncated } = await api.tree(owner, name, baseTree);
      // A partial listing could leave an unpublished note on the current site.
      if (truncated) throw fail("failed");
      const existing = new Map(entries.filter(e => e.type === "blob").map(e => [e.path, e.sha]));
      const wanted = new Set(files.map(f => `${SITE}/${f.path}`));
      const changes: { path: string; sha: string | null }[] = [];
      o.state?.("saving");
      for (const file of files) {
        const path = `${SITE}/${file.path}`;
        if (existing.get(path) === file.sha) continue;
        const { sha } = await api.request<{ sha: string }>("POST", `${base}/git/blobs`, { content: file.bytes.toString("base64"), encoding: "base64" });
        if (sha !== file.sha) throw fail("failed");
        changes.push({ path, sha });
      }
      for (const path of existing.keys()) if (path.startsWith(`${SITE}/`) && !wanted.has(path)) changes.push({ path, sha: null });
      let commit = head;
      if (changes.length) {
        const tree = await api.createTree(owner, name, baseTree, changes);
        commit = await api.createCommit(owner, name, "Publish site", tree, [head]);
        await api.updateRef(owner, name, repo.defaultBranch, commit);
      }
      const pages = await waitForPages(api, base, commit, o);
      return { status: "published", commit, pages: { status: pages, repository: `${owner}/${name}`, build: artifact.build } };
    } catch (error) { throw problem(error); }
  };
}

interface WorkflowRun { id: number; path?: string; name?: string; status: string; conclusion: string | null }

/** Waits for the Pages workflow run of exactly `commit`. A push alone is never Published (SHR-25). */
async function waitForPages(api: GitHubApi, base: string, commit: string, o: {
  state?(state: PagesPublishState, commit?: string): void; timeoutMs?: number; delayMs?: number;
}): Promise<PagesStatus> {
  const until = Date.now() + (o.timeoutMs ?? 600_000);
  let last: PagesPublishState | undefined;
  const report = (state: PagesPublishState) => { if (state !== last) { last = state; o.state?.(state, commit); } };
  report("queued");
  for (;;) {
    const { workflow_runs: runs } = await api.request<{ workflow_runs: WorkflowRun[] }>(
      "GET", `${base}/actions/runs?head_sha=${commit}&per_page=20`);
    const run = runs.filter(r => r.path ? r.path.split("@")[0] === WORKFLOW : r.name === "Publish site").sort((a, b) => b.id - a.id)[0];
    if (run?.status === "completed") {
      if (run.conclusion !== "success") return "errored";
      report("built");
      return "built";
    }
    if (run?.status === "in_progress") report("building");
    if (Date.now() >= until) return "building";
    await delay(Math.min(o.delayMs ?? 5000, Math.max(1, until - Date.now())));
  }
}

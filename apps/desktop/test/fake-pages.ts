import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { FakeGitHub } from "../../../packages/github/test/fake-github.ts";

const sha = (text: string) => createHash("sha1").update(text).digest("hex");
const blobSha = (bytes: Buffer) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

/** FakeGitHub plus GitHub's Git Data API and a Pages deployment that serves `site/` of the branch head. */
export function gitData(github: FakeGitHub) {
  const blobs = new Map<string, Buffer>();
  const commits = new Map<string, { tree: string; parents: string[] }>();
  const trees = new Map<string, Map<string, string>>();
  const heads = new Map<string, string>();
  const pushes: string[] = [];
  const seed = (key: string) => {
    if (heads.has(key)) return heads.get(key)!;
    const repo = github.repos.get(key);
    if (!repo?.files.size) return undefined;
    const files = new Map<string, string>();
    for (const path of repo.files) { const bytes = Buffer.from(repo.fileContents.get(path) ?? "", "utf8"); blobs.set(blobSha(bytes), bytes); files.set(path, blobSha(bytes)); }
    const tree = sha(`tree ${key} ${[...files].join()}`);
    trees.set(tree, files);
    const commit = sha(`commit ${tree}`);
    commits.set(commit, { tree, parents: [] });
    heads.set(key, commit);
    return commit;
  };
  const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const m = /^\/repos\/([^/]+)\/([^/]+)\/git\/(.+)$/.exec(url.pathname);
    if (github.offline || !m) return github.fetch(input, init);
    const key = `${m[1]}/${m[2]}`, rest = m[3]!, method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    github.calls.push({ method, path: url.pathname, ...(body ? { body } : {}) });
    const planned = github.failures.get(`${method} ${url.pathname}`)?.shift();
    if (planned) return json(planned.status, { message: planned.message });
    if (!github.repos.get(key)) return json(404, { message: "Not Found" });
    if (method === "GET" && rest === "ref/heads/main") { const head = seed(key); return head ? json(200, { object: { sha: head } }) : json(409, { message: "Git Repository is empty." }); }
    let r = /^commits\/([a-f0-9]+)$/.exec(rest);
    if (method === "GET" && r) return commits.has(r[1]!) ? json(200, { tree: { sha: commits.get(r[1]!)!.tree } }) : json(404, {});
    r = /^trees\/([a-f0-9]+)$/.exec(rest);
    if (method === "GET" && r) return json(200, { tree: [...trees.get(r[1]!)!].map(([path, sha]) => ({ path, sha, type: "blob" })), truncated: false });
    if (method === "POST" && rest === "blobs") { const bytes = Buffer.from(String(body!.content), "base64"); blobs.set(blobSha(bytes), bytes); return json(201, { sha: blobSha(bytes) }); }
    if (method === "POST" && rest === "trees") {
      const files = new Map(trees.get(String(body!.base_tree)) ?? []);
      for (const e of body!.tree as { path: string; sha: string | null }[]) e.sha === null ? files.delete(e.path) : files.set(e.path, e.sha);
      const tree = sha(`tree ${[...files].join()}`);
      trees.set(tree, files);
      return json(201, { sha: tree });
    }
    if (method === "POST" && rest === "commits") { const commit = sha(`commit ${body!.tree} ${(body!.parents as string[]).join()}`); commits.set(commit, { tree: String(body!.tree), parents: body!.parents as string[] }); return json(201, { sha: commit }); }
    if (method === "PATCH" && rest === "refs/heads/main") {
      const commit = String(body!.sha);
      if (body!.force !== false || !commits.get(commit)?.parents.includes(seed(key)!)) return json(422, { message: "Update is not a fast forward" });
      heads.set(key, commit);
      pushes.push(key);
      return json(200, { object: { sha: commit } });
    }
    return json(404, { message: "Not Found" });
  };
  /** The site/ folder of the branch head, as exact bytes. */
  const siteBytes = (key: string) => {
    const head = heads.get(key);
    const files = head ? trees.get(commits.get(head)!.tree)! : new Map<string, string>();
    return new Map([...files].filter(([path]) => path.startsWith("site/")).map(([path, sha]) => [path.slice(5), blobs.get(sha)!]));
  };
  const site = (key: string) => new Map([...siteBytes(key)].map(([path, bytes]) => [path, bytes.toString("utf8")]));
  /** Pages serves what the branch head's site/ folder holds; `stale` serves nothing new yet. */
  let stale = false;
  const get = async (url: string) => {
    const at = /^https:\/\/([^.]+)\.github\.io\/([^/]+)\/(.+)$/.exec(url);
    if (!at || stale) return undefined;
    return site(`${at[1]}/${at[2]}`).get(at[3]!);
  };
  return { fetch, get, site, siteBytes, pushes, setStale: (value: boolean) => { stale = value; } };
}

/**
 * The loopback endpoint a review build's `FOCUS_NOTES_CANDIDATE_GITHUB_API` points at: GitHub's API
 * as the fake answers it, and `/pages/<host>/<path>` as Pages serves the paired site.
 */
export async function serveFakeGitHub(github: FakeGitHub, git = gitData(github)): Promise<{ origin: string; server: Server; git: ReturnType<typeof gitData>; close(): Promise<void> }> {
  const server = createServer(async (req, res) => {
    // Offline: the connection drops, as a real network failure does.
    if (github.offline) { req.socket.destroy(); return; }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const url = req.url ?? "/";
      const pages = /^\/pages\/([^/]+)(\/.*)$/.exec(url);
      if (pages) {
        const text = await git.get(`https://${pages[1]}${pages[2]}`);
        res.writeHead(text === undefined ? 404 : 200, { "content-type": "application/json" });
        res.end(text ?? "");
        return;
      }
      const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
      const answer = await git.fetch(`https://api.github.com${url}`, {
        method: req.method ?? "GET", headers: { Authorization: String(req.headers.authorization ?? "") }, ...(body ? { body } : {}),
      });
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(answer.status === 204 ? undefined : await answer.text());
    } catch { res.writeHead(503); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake GitHub did not bind");
  return {
    origin: `http://127.0.0.1:${address.port}`, server, git,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

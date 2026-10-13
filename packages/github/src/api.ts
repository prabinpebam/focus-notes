/**
 * A small client for the GitHub REST API, as used from the browser (D-81, D-82). It sends the token
 * only to api.github.com and never logs it.
 */
export const API = "https://api.github.com";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  /** The token is missing, expired, revoked, or lacks access. */
  get unauthorized(): boolean {
    return this.status === 401;
  }
  get rateLimited(): boolean {
    return this.status === 429 || (this.status === 403 && /rate limit/i.test(this.message));
  }
}

export interface Repo {
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  canPush: boolean;
}

export interface TreeEntry {
  path: string;
  sha: string;
  type: "blob" | "tree" | "commit";
  size?: number;
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

export class GitHubApi {
  readonly #token: string;
  readonly #fetch: Fetch;

  constructor(token: string, fetchImpl: Fetch = (i, init) => fetch(i, init)) {
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.#fetch(`${API}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.#token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });
    } catch {
      throw new GitHubError(0, "offline");
    }
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = ((await res.json()) as { message?: string }).message ?? message;
      } catch {
        // Not JSON; keep the status text.
      }
      throw new GitHubError(res.status, message);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  user() {
    return this.request<{ login: string; name: string | null }>("GET", "/user");
  }

  async repo(owner: string, name: string): Promise<Repo> {
    const r = await this.request<{ name: string; owner: { login: string }; default_branch: string; private: boolean; permissions?: { push?: boolean } }>("GET", `/repos/${owner}/${name}`);
    return { owner: r.owner.login, name: r.name, defaultBranch: r.default_branch, private: r.private, canPush: Boolean(r.permissions?.push) };
  }

  /** The commit a branch points at, or undefined for an empty repository. */
  async head(owner: string, repo: string, branch: string): Promise<string | undefined> {
    try {
      const r = await this.request<{ object: { sha: string } }>("GET", `/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`);
      return r.object.sha;
    } catch (e) {
      if (e instanceof GitHubError && (e.status === 404 || e.status === 409)) return undefined;
      throw e;
    }
  }

  async commitTree(owner: string, repo: string, commit: string): Promise<string> {
    return (await this.request<{ tree: { sha: string } }>("GET", `/repos/${owner}/${repo}/git/commits/${commit}`)).tree.sha;
  }

  async tree(owner: string, repo: string, tree: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    const r = await this.request<{ tree: TreeEntry[]; truncated: boolean }>("GET", `/repos/${owner}/${repo}/git/trees/${tree}?recursive=1`);
    return { entries: r.tree, truncated: r.truncated };
  }

  async blob(owner: string, repo: string, sha: string): Promise<string> {
    const r = await this.request<{ content: string; encoding: string }>("GET", `/repos/${owner}/${repo}/git/blobs/${sha}`);
    return r.encoding === "base64" ? base64ToUtf8(r.content) : r.content;
  }

  async createBlob(owner: string, repo: string, text: string): Promise<string> {
    return (await this.request<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/blobs`, { content: utf8ToBase64(text), encoding: "base64" })).sha;
  }

  async createTree(owner: string, repo: string, base: string | undefined, entries: { path: string; sha: string | null }[]): Promise<string> {
    const tree = entries.map((e) => ({ path: e.path, mode: "100644", type: "blob", sha: e.sha }));
    return (await this.request<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/trees`, { ...(base ? { base_tree: base } : {}), tree })).sha;
  }

  async createCommit(owner: string, repo: string, message: string, tree: string, parents: string[]): Promise<string> {
    return (await this.request<{ sha: string }>("POST", `/repos/${owner}/${repo}/git/commits`, { message, tree, parents })).sha;
  }

  /** Fast-forwards a branch. GitHub refuses (422) if it moved since `sha`'s parent. */
  async updateRef(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    await this.request("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodePath(branch)}`, { sha, force: false });
  }

  /** Creates a file through the contents API, which (unlike the Git Data API) works on an empty repository. */
  async createFile(owner: string, repo: string, path: string, text: string, message: string, branch: string): Promise<void> {
    await this.request("PUT", `/repos/${owner}/${repo}/contents/${encodePath(path)}`, { message, content: utf8ToBase64(text), branch });
  }
}

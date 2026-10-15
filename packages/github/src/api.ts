/**
 * A small client for the GitHub REST API, used by the desktop app's setup (FRE-08, D-90). It sends
 * the token only to api.github.com and never logs it.
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
  /** When it was last pushed to (ISO 8601), if GitHub says. */
  pushedAt?: string;
  /** A template repository (GitHub's `is_template`): something to copy, never someone's notes (D-147). */
  template?: boolean;
}

/** A repository's deploy key, as GitHub lists it. */
export interface DeployKey {
  id: number;
  title: string;
  key: string;
  readOnly: boolean;
}

/** A repository's GitHub Pages site. `workflow` means GitHub Actions is the source. */
export interface PagesSite {
  buildType: "workflow" | "legacy";
  url: string;
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
    if (res.status === 204) return undefined as T;
    // Some writes (an Actions secret, for example) answer 201 with no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  user() {
    return this.request<{ login: string; id: number; name: string | null; avatar_url?: string | null }>("GET", "/user");
  }

  /** The signed-in account's own repositories, most recently pushed first (the first run's Open from GitHub). */
  async ownRepos(): Promise<Repo[]> {
    const r = await this.request<{ name: string; owner: { login: string }; default_branch: string; private: boolean; permissions?: { push?: boolean }; pushed_at?: string | null; is_template?: boolean }[]>("GET", "/user/repos?affiliation=owner&sort=pushed&per_page=100");
    return r.map((x) => ({ owner: x.owner.login, name: x.name, defaultBranch: x.default_branch, private: x.private, canPush: Boolean(x.permissions?.push), ...(x.pushed_at ? { pushedAt: x.pushed_at } : {}), ...(x.is_template ? { template: true } : {}) }));
  }

  async repo(owner: string, name: string): Promise<Repo> {
    const r = await this.request<{ name: string; owner: { login: string }; default_branch: string; private: boolean; permissions?: { push?: boolean }; is_template?: boolean }>("GET", `/repos/${owner}/${name}`);
    return { owner: r.owner.login, name: r.name, defaultBranch: r.default_branch, private: r.private, canPush: Boolean(r.permissions?.push), ...(r.is_template ? { template: true } : {}) };
  }

  /** A repository, or undefined if there's none by that name (or it isn't visible to this token). */
  async findRepo(owner: string, name: string): Promise<Repo | undefined> {
    try {
      return await this.repo(owner, name);
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return undefined;
      throw e;
    }
  }

  /** Whether a file exists on the default branch. */
  async hasFile(owner: string, repo: string, path: string): Promise<boolean> {
    try {
      await this.request("GET", `/repos/${owner}/${repo}/contents/${encodePath(path)}`);
      return true;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return false;
      throw e;
    }
  }

  /** Makes a repository in the signed-in account from a template repository ("Use this template"). */
  async generate(template: { owner: string; name: string }, owner: string, name: string, description: string): Promise<void> {
    await this.request("POST", `/repos/${template.owner}/${template.name}/generate`, { owner, name, description, private: false, include_all_branches: false });
  }

  /** Makes a repository in the signed-in account, with a first commit (a README) so it has a main branch. */
  async createRepo(name: string, description: string, isPrivate: boolean): Promise<void> {
    await this.request("POST", "/user/repos", { name, description, private: isPrivate, auto_init: true });
  }

  async deployKeys(owner: string, repo: string): Promise<DeployKey[]> {
    const r = await this.request<{ id: number; title: string; key: string; read_only: boolean }[]>("GET", `/repos/${owner}/${repo}/keys?per_page=100`);
    return r.map((k) => ({ id: k.id, title: k.title, key: k.key, readOnly: k.read_only }));
  }

  /** Adds a deploy key. Always read-only: the publishing key can never write (FRE-08). */
  async addDeployKey(owner: string, repo: string, title: string, key: string): Promise<void> {
    await this.request("POST", `/repos/${owner}/${repo}/keys`, { title, key, read_only: true });
  }

  async deleteDeployKey(owner: string, repo: string, id: number): Promise<void> {
    await this.request("DELETE", `/repos/${owner}/${repo}/keys/${id}`);
  }

  /** The key an Actions secret must be sealed to (a Curve25519 public key, base64). */
  async actionsPublicKey(owner: string, repo: string): Promise<{ keyId: string; key: string }> {
    const r = await this.request<{ key_id: string; key: string }>("GET", `/repos/${owner}/${repo}/actions/secrets/public-key`);
    return { keyId: r.key_id, key: r.key };
  }

  /** Sets an Actions secret from a value already sealed to the repository's public key (see secrets.ts). */
  async setActionsSecret(owner: string, repo: string, name: string, sealed: { keyId: string; encryptedValue: string }): Promise<void> {
    await this.request("PUT", `/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, { encrypted_value: sealed.encryptedValue, key_id: sealed.keyId });
  }

  /** The repository's Pages site, or undefined if Pages is off. */
  async pages(owner: string, repo: string): Promise<PagesSite | undefined> {
    try {
      const r = await this.request<{ build_type?: string; html_url: string }>("GET", `/repos/${owner}/${repo}/pages`);
      return { buildType: r.build_type === "workflow" ? "workflow" : "legacy", url: r.html_url };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return undefined;
      throw e;
    }
  }

  /** Turns on Pages with GitHub Actions as the source, or switches an existing site to it. */
  async usePagesWorkflow(owner: string, repo: string, exists: boolean): Promise<void> {
    await this.request(exists ? "PUT" : "POST", `/repos/${owner}/${repo}/pages`, { build_type: "workflow" });
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

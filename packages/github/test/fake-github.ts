/**
 * An in-memory GitHub REST API for tests: no request ever leaves the process. It answers the calls
 * the desktop setup makes (FRE-08), checks the token on every one, records them (without the
 * token), and can fail any route on demand. Each repository's Actions public key is a real
 * Curve25519 pair, so a test can open the secrets it was given.
 */
import nacl from "tweetnacl";
import type { Fetch } from "../src/api.ts";
import { base64ToBytes, bytesToBase64, sealNonce } from "../src/secrets.ts";

export interface FakeRepo {
  owner: string;
  name: string;
  private: boolean;
  isTemplate: boolean;
  /** "owner/name" of the template it was made from. */
  template?: string;
  files: Set<string>;
  keys: { id: number; title: string; key: string; read_only: boolean }[];
  secrets: Map<string, { encrypted_value: string; key_id: string }>;
  actionsKey: nacl.BoxKeyPair;
  pages?: { build_type: "workflow" | "legacy"; html_url: string };
  canPush: boolean;
}

export interface Call {
  method: string;
  path: string;
  body?: unknown;
}

let nextId = 1;

export class FakeGitHub {
  readonly token: string;
  login = "ada";
  id = 583231;
  readonly repos = new Map<string, FakeRepo>();
  readonly calls: Call[] = [];
  /** Every request as sent, headers included, for checking where the token went. */
  readonly raw: { url: string; init?: RequestInit }[] = [];
  offline = false;
  /** "POST /repos/ada/notes-private/keys" → answers to give instead, one per matching call. */
  readonly failures = new Map<string, { status: number; message: string }[]>();
  /** Called when a repository is made, so an integration test can make its Git remote. */
  onCreate?: (repo: FakeRepo) => void;

  constructor(token = "ghp_FAKE0123456789abcdefTOKEN") {
    this.token = token;
    this.add({ owner: "prabinpebam", name: "focus-notes-workspace", isTemplate: true, files: [".focus-notes/workspace.json", "notes/.gitkeep", "AGENTS.md", "README.md"] });
  }

  add(r: { owner: string; name: string; private?: boolean; isTemplate?: boolean; template?: string; files?: string[]; canPush?: boolean }): FakeRepo {
    const repo: FakeRepo = {
      owner: r.owner, name: r.name, private: r.private ?? false, isTemplate: r.isTemplate ?? false,
      ...(r.template ? { template: r.template } : {}),
      files: new Set(r.files ?? []), keys: [], secrets: new Map(), actionsKey: nacl.box.keyPair(), canPush: r.canPush ?? true,
    };
    this.repos.set(`${r.owner}/${r.name}`, repo);
    return repo;
  }

  repo(name: string, owner = this.login): FakeRepo | undefined {
    return this.repos.get(`${owner}/${name}`);
  }

  /** The next `times` calls to `route` ("METHOD /path") answer with this status. */
  fail(route: string, status: number, message = "Failed", times = 1): void {
    const list = this.failures.get(route) ?? [];
    for (let i = 0; i < times; i++) list.push({ status, message });
    this.failures.set(route, list);
  }

  /** Opens a secret the way GitHub would: `crypto_box_seal_open` with the repository's private key. */
  openSecret(repo: FakeRepo, name: string): string | undefined {
    const s = repo.secrets.get(name);
    if (!s) return undefined;
    const sealed = base64ToBytes(s.encrypted_value);
    const eph = sealed.subarray(0, 32);
    const opened = nacl.box.open(sealed.subarray(32), sealNonce(eph, repo.actionsKey.publicKey), eph, repo.actionsKey.secretKey);
    return opened ? new TextDecoder().decode(opened) : undefined;
  }

  readonly fetch: Fetch = async (input, init) => {
    this.raw.push({ url: input, ...(init ? { init } : {}) });
    if (this.offline) throw new TypeError("fetch failed");
    const url = new URL(input);
    if (url.origin !== "https://api.github.com") throw new Error(`Unexpected host ${url.origin}`);
    const method = init?.method ?? "GET";
    const path = url.pathname;
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    this.calls.push({ method, path, ...(body !== undefined ? { body } : {}) });
    if (new Headers(init?.headers).get("Authorization") !== `Bearer ${this.token}`) return json(401, { message: "Bad credentials" });
    const planned = this.failures.get(`${method} ${path}`)?.shift();
    if (planned) return json(planned.status, { message: planned.message });
    return this.route(method, path, body);
  };

  private route(method: string, path: string, body: Record<string, unknown> | undefined): Response {
    if (method === "GET" && path === "/user") return json(200, { login: this.login, id: this.id, name: "Ada" });
    if (method === "GET" && path === "/user/repos") return json(200, [...this.repos.values()].filter((r) => r.owner === this.login).map(toRepo));
    if (method === "POST" && path === "/user/repos") {
      const name = String(body?.name);
      if (this.repo(name)) return json(422, { message: "Repository creation failed: name already exists on this account" });
      const repo = this.add({ owner: this.login, name, private: body?.private === true, files: body?.auto_init ? ["README.md"] : [] });
      this.onCreate?.(repo);
      return json(201, toRepo(repo));
    }
    let r = /^\/repos\/([^/]+)\/([^/]+)\/generate$/.exec(path);
    if (method === "POST" && r) {
      const template = this.repo(r[2]!, r[1]!);
      if (!template?.isTemplate) return json(404, { message: "Not Found" });
      const name = String(body?.name);
      if (body?.owner !== this.login) return json(403, { message: "Resource not accessible" });
      if (this.repo(name)) return json(422, { message: "Name already exists on this account" });
      const repo = this.add({ owner: this.login, name, private: body?.private === true, template: `${template.owner}/${template.name}`, files: [...template.files] });
      this.onCreate?.(repo);
      return json(201, toRepo(repo));
    }
    r = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path);
    if (!r) return json(404, { message: "Not Found" });
    const repo = this.repo(r[2]!, r[1]!);
    if (!repo || (repo.private && repo.owner !== this.login)) return json(404, { message: "Not Found" });
    const rest = r[3] ?? "";
    if (method === "GET" && rest === "") return json(200, toRepo(repo));
    if (method === "GET" && rest === "/git/ref/heads/main") return repo.files.size ? json(200, { object: { sha: "a".repeat(40) } }) : json(409, { message: "Git Repository is empty." });
    const file = /^\/contents\/(.+)$/.exec(rest);
    if (method === "GET" && file) return repo.files.has(decodeURIComponent(file[1]!)) ? json(200, { type: "file" }) : json(404, { message: "Not Found" });
    if (!repo.canPush && method !== "GET") return json(403, { message: "Must have admin rights to Repository." });
    if (rest.startsWith("/keys?") || rest === "/keys") {
      if (method === "GET") return json(200, repo.keys);
      if (method === "POST") {
        if (repo.keys.some((k) => k.key === body?.key)) return json(422, { message: "key is already in use" });
        const key = { id: nextId++, title: String(body?.title), key: String(body?.key), read_only: body?.read_only === true };
        repo.keys.push(key);
        return json(201, key);
      }
    }
    const key = /^\/keys\/(\d+)$/.exec(rest);
    if (key && method === "DELETE") {
      repo.keys = repo.keys.filter((k) => k.id !== Number(key[1]));
      return new Response(null, { status: 204 });
    }
    if (rest === "/actions/secrets/public-key" && method === "GET") return json(200, { key_id: `kid-${repo.name}`, key: bytesToBase64(repo.actionsKey.publicKey) });
    const secret = /^\/actions\/secrets\/([A-Z0-9_]+)$/.exec(rest);
    if (secret && method === "PUT") {
      if (body?.key_id !== `kid-${repo.name}`) return json(422, { message: "Bad key_id" });
      const isNew = !repo.secrets.has(secret[1]!);
      repo.secrets.set(secret[1]!, { encrypted_value: String(body?.encrypted_value), key_id: String(body?.key_id) });
      // GitHub answers 201 with no body for a new secret, 204 for an update.
      return new Response(isNew ? "" : null, { status: isNew ? 201 : 204 });
    }
    if (rest === "/pages") {
      if (method === "GET") return repo.pages ? json(200, repo.pages) : json(404, { message: "Not Found" });
      const site = { build_type: body?.build_type === "workflow" ? ("workflow" as const) : ("legacy" as const), html_url: `https://${this.login}.github.io/${repo.name}/` };
      if (method === "POST") {
        if (repo.pages) return json(409, { message: "GitHub Pages is already enabled." });
        repo.pages = site;
        return json(201, site);
      }
      if (method === "PUT") {
        if (!repo.pages) return json(404, { message: "Not Found" });
        repo.pages = site;
        return new Response(null, { status: 204 });
      }
    }
    return json(404, { message: "Not Found" });
  }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const toRepo = (r: FakeRepo) => ({
  name: r.name, owner: { login: r.owner }, default_branch: "main", private: r.private, is_template: r.isTemplate,
  permissions: { push: r.canPush, admin: r.canPush },
  ...(r.template ? { template_repository: { full_name: r.template } } : {}),
});

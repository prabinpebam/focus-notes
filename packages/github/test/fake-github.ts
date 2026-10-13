/** An in-memory GitHub that speaks the parts of the REST API the browser uses, for tests. */
import { createHash } from "node:crypto";
import { base64ToUtf8, type Connection, type NoteRecord, type SyncStore } from "../src/index.ts";

/** A tiny Git: blobs, flat trees (path → blob), commits, one branch. */
export class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  head: string | undefined;
  calls: string[] = [];
  /** Run before a ref update, to simulate another client pushing in between. */
  beforeUpdate?: () => void;
  /** When set, requests must carry this token. */
  token: string | undefined;
  canPush = true;

  hash(kind: string, s: string) {
    return createHash("sha1").update(`${kind}\0${s}`).digest("hex");
  }
  addBlob(text: string) {
    const sha = this.hash("blob", text);
    this.blobs.set(sha, text);
    return sha;
  }
  addTree(map: Map<string, string>) {
    const sha = this.hash("tree", JSON.stringify([...map].sort()));
    this.trees.set(sha, new Map(map));
    return sha;
  }
  /** Commits files directly, as another client (github.dev, the desktop app) would. */
  commitFiles(files: Record<string, string | null>, message = "elsewhere") {
    const base = this.head ? new Map(this.trees.get(this.commits.get(this.head)!.tree)!) : new Map<string, string>();
    for (const [p, t] of Object.entries(files)) t === null ? base.delete(p) : base.set(p, this.addBlob(t));
    const tree = this.addTree(base);
    const sha = this.hash("commit", tree + (this.head ?? "") + message + this.commits.size);
    this.commits.set(sha, { tree, parents: this.head ? [this.head] : [], message });
    this.head = sha;
    return sha;
  }
  files(): Record<string, string> {
    if (!this.head) return {};
    const t = this.trees.get(this.commits.get(this.head)!.tree)!;
    return Object.fromEntries([...t].map(([p, s]) => [p, this.blobs.get(s)!]));
  }

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    if (this.token && (init?.headers as Record<string, string> | undefined)?.Authorization !== `Bearer ${this.token}`) {
      return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    if (u.pathname === "/user") return new Response(JSON.stringify({ login: "me", name: "Me" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (!u.pathname.startsWith("/repos/me/notes")) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    const path = u.pathname.replace(/^\/repos\/me\/notes/, "");
    this.calls.push(`${method} ${path}`);
    if (path === "" && method === "GET") {
      return new Response(JSON.stringify({ name: "notes", owner: { login: "me" }, default_branch: "main", private: true, permissions: { push: this.canPush } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    let m: RegExpMatchArray | null;
    if (path === "/git/ref/heads/main") return this.head ? json(200, { object: { sha: this.head } }) : json(409, { message: "Git Repository is empty." });
    if ((m = path.match(/^\/git\/commits\/(\w+)$/))) return json(200, { tree: { sha: this.commits.get(m[1]!)!.tree } });
    if ((m = path.match(/^\/git\/trees\/(\w+)$/)) && method === "GET") {
      const t = this.trees.get(m[1]!)!;
      return json(200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, sha, type: "blob", size: this.blobs.get(sha)!.length })) });
    }
    if ((m = path.match(/^\/git\/blobs\/(\w+)$/))) return json(200, { encoding: "base64", content: Buffer.from(this.blobs.get(m[1]!)!, "utf8").toString("base64") });
    if (path === "/git/blobs" && method === "POST") {
      if (!this.head) return json(409, { message: "Git Repository is empty." });
      return json(201, { sha: this.addBlob(base64ToUtf8(body.content)) });
    }
    if (path === "/git/trees" && method === "POST") {
      const base = body.base_tree ? new Map(this.trees.get(body.base_tree)!) : new Map<string, string>();
      for (const e of body.tree) e.sha === null ? base.delete(e.path) : base.set(e.path, e.sha);
      return json(201, { sha: this.addTree(base) });
    }
    if (path === "/git/commits" && method === "POST") {
      const sha = this.hash("commit", body.tree + body.parents.join() + body.message);
      this.commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message });
      return json(201, { sha });
    }
    if (path === "/git/refs/heads/main" && method === "PATCH") {
      this.beforeUpdate?.();
      this.beforeUpdate = undefined;
      const c = this.commits.get(body.sha)!;
      if (this.head && !c.parents.includes(this.head)) return json(422, { message: "Update is not a fast forward" });
      this.head = body.sha;
      return json(200, { object: { sha: body.sha } });
    }
    if ((m = path.match(/^\/contents\/(.+)$/)) && method === "PUT") {
      this.commitFiles({ [decodeURIComponent(m[1]!)]: base64ToUtf8(body.content) }, body.message);
      return json(201, {});
    }
    return json(404, { message: `Not Found: ${method} ${path}` });
  };
}

export class MemoryStore implements SyncStore {
  notes = new Map<string, NoteRecord>();
  connection: Connection | undefined = { owner: "me", repo: "notes", branch: "main" };
  async allNotes() { return [...this.notes.values()].map((n) => ({ ...n })); }
  async getNote(p: string) { const n = this.notes.get(p); return n ? { ...n } : undefined; }
  async putNote(n: NoteRecord) { this.notes.set(n.path, { ...n }); }
  async removeNote(p: string) { this.notes.delete(p); }
  async getConnection() { return this.connection ? { ...this.connection } : undefined; }
  async setConnection(c: Connection) { this.connection = { ...c }; }
  write(path: string, text: string) {
    const old = this.notes.get(path);
    this.notes.set(path, { path, text, ...(old?.sha ? { sha: old.sha } : {}), dirty: true, updated: Date.now() });
  }
}

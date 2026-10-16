/**
 * The search index fed from the workspace (WP-4.1): it follows the workspace model's changes, the
 * desktop's file watcher, and the app's own saves; in the browser it holds the instance's private
 * notes only while the vault is unlocked (D-90); and it never sends anything anywhere (SPT-08).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createApp, planDelete, planMove, planRenameFolder,
  type App, type AppStateFile, type InstanceBridge, type PlatformBridge, type VaultStatus, type WorkspaceBridge, type WorkspaceChange, type WorkspaceScan, type WorkspaceTree,
} from "../src/index.ts";
import { startSearch, diffEntries, type SearchService } from "../src/search/feed.ts";
import { localSearch } from "../src/search/serve.ts";
import type { SearchHit, SearchQuery } from "../src/search/types.ts";
import { checkingDisk } from "./checking-disk.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const W = "/w";
const PRIV = `${W}/private/notes`;
const PUB = `${W}/notes`;

/** A desktop workspace in memory: Private and Public roots, a watcher the test drives, and every read counted. */
function desktop(files: Record<string, string>, folders: string[] = []) {
  let state: AppStateFile = { version: 1 };
  const reads: string[] = [];
  const watchers = new Set<(c: WorkspaceChange[]) => void>();
  const scan = (): WorkspaceScan => ({
    folder: W,
    roots: [{ id: "private", path: PRIV, readOnly: false }, { id: "public", path: PUB, readOnly: false }],
    entries: [...folders.map((path) => ({ path, kind: "folder" as const })), ...Object.keys(files).map((path) => ({ path, kind: "note" as const }))],
  });
  const workspace: WorkspaceBridge = {
    info: async () => ({ folder: W, format: '{ "formatVersion": 1 }' }),
    scan: async () => scan(),
    writeFormat: async () => {},
    renameNote: async () => {},
    onChange: (l) => { watchers.add(l); return () => watchers.delete(l); },
  };
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { reads.push(p); if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: checkingDisk(files).writeNote,
    chooseNote: async () => undefined, newNotePath: async () => `${PRIV}/untitled.md`,
    defaultNotePath: async () => Object.keys(files)[0]!,
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace,
  };
  return { bridge, files, reads, emit: (c: WorkspaceChange[]) => { for (const l of watchers) l(c); } };
}

const running: SearchService[] = [];
afterEach(() => { for (const s of running.splice(0)) s.stop(); vi.unstubAllGlobals(); });
async function started(bridge: PlatformBridge, searchBridge: PlatformBridge = bridge) {
  const app = createApp(bridge, messages);
  await app.start();
  await vi.waitFor(() => expect(app.store.state.workspace.tree.roots.length).toBeGreaterThan(0));
  const search = startSearch({ store: app.store, bridge: searchBridge }, localSearch());
  running.push(search);
  await search.whenIndexed();
  return { app, search };
}
const ask = async (s: SearchService, text: string, more: Partial<SearchQuery> = {}) => (await s.query({ text, scope: "titles", ...more })).hits;
const askText = async (s: SearchService, text: string) => (await s.query({ text, scope: "text" })).hits;
const keys = (hits: SearchHit[]) => hits.map((h) => h.key);
const setTree = (app: App, tree: WorkspaceTree) => app.store.update((s) => ({ ...s, workspace: { ...s.workspace, tree } }));

describe("indexing the workspace", () => {
  it("indexes every note and folder in the roots: titles, paths relative to their root, headings, and full text", async () => {
    const d = desktop({
      [`${PRIV}/essays/on-focus.md`]: "# On focus\n\n## Deep work\n\nOne line at a time.\n",
      [`${PUB}/hello.md`]: "# Hello world\n\nPublic words.\n",
    }, [`${PRIV}/essays`, `${PRIV}/empty`]);
    const { search } = await started(d.bridge);
    expect(search.status()).toMatchObject({ notes: 2, indexed: 2, pending: 0 });
    expect((await ask(search, "focus"))[0]).toMatchObject({ kind: "note", key: `${PRIV}/essays/on-focus.md`, rel: "essays/on-focus.md", root: "private", label: "On focus" });
    expect((await ask(search, "deep"))[0]).toMatchObject({ kind: "heading", path: `${PRIV}/essays/on-focus.md`, heading: { level: 2, index: 1, note: "On focus" } });
    expect((await ask(search, "empty"))[0]).toMatchObject({ kind: "folder", key: `${PRIV}/empty`, rel: "empty" });
    expect(keys(await askText(search, "public words"))).toEqual([`${PUB}/hello.md`]);
    expect(keys(await ask(search, "hello", { roots: ["private"] }))).toEqual([]);
    // Paths are relative to their root: the folders above it ("/w/private/notes") aren't words to find.
    expect(keys(await ask(search, "private notes", { kinds: ["note", "folder"] }))).toEqual([]);
  });

  it("follows creates, deletes, moves, and renames from the workspace model; a moved note isn't read again", async () => {
    const d = desktop({ [`${PRIV}/a/one.md`]: "# One\n\nzebra\n", [`${PRIV}/b/two.md`]: "# Two\n\nyak\n" }, [`${PRIV}/a`, `${PRIV}/b`]);
    const { app, search } = await started(d.bridge);
    const readsBefore = d.reads.length;
    const moved = planMove(app.store.state.workspace.tree, [`${PRIV}/a/one.md`], `${PRIV}/b`);
    if (moved.kind !== "moved") throw new Error(moved.reason);
    setTree(app, moved.tree);
    await search.whenIndexed();
    expect((await askText(search, "zebra"))[0]).toMatchObject({ key: `${PRIV}/b/one.md`, rel: "b/one.md" });
    const renamed = planRenameFolder(app.store.state.workspace.tree, `${PRIV}/b`, "bee");
    if (renamed.kind !== "renamed") throw new Error(renamed.reason);
    setTree(app, renamed.tree);
    await search.whenIndexed();
    expect(keys(await askText(search, "zebra"))).toEqual([`${PRIV}/bee/one.md`]);
    expect(keys(await ask(search, "bee", { kinds: ["folder"] }))).toEqual([`${PRIV}/bee`]);
    expect(keys(await ask(search, "b", { kinds: ["folder"] }))).not.toContain(`${PRIV}/b`);
    expect(d.reads.length).toBe(readsBefore);
    const deleted = planDelete(app.store.state.workspace.tree, [`${PRIV}/bee/two.md`]);
    if (deleted.kind !== "deleted") throw new Error(deleted.reason);
    setTree(app, deleted.tree);
    await search.whenIndexed();
    expect(await askText(search, "yak")).toEqual([]);
    expect(await ask(search, "two")).toEqual([]);
    expect(search.status()).toMatchObject({ notes: 1, indexed: 1 });
  });

  it("reads a note again when it changes outside the app, and picks up notes the watcher adds", async () => {
    const d = desktop({ [`${PRIV}/a.md`]: "# A\n\nold words\n" });
    const { search } = await started(d.bridge);
    d.files[`${PRIV}/a.md`] = "# A\n\nnew words\n";
    d.files[`${PRIV}/b.md`] = "# Bravo\n\nfresh\n";
    d.emit([{ path: `${PRIV}/a.md`, kind: "note", exists: true, title: "A" }, { path: `${PRIV}/b.md`, kind: "note", exists: true, title: "Bravo" }]);
    await vi.waitFor(async () => expect(keys(await askText(search, "new"))).toEqual([`${PRIV}/a.md`]));
    await vi.waitFor(async () => expect(keys(await askText(search, "fresh"))).toEqual([`${PRIV}/b.md`]));
    expect(await askText(search, "old")).toEqual([]);
    delete d.files[`${PRIV}/b.md`];
    d.emit([{ path: `${PRIV}/b.md`, kind: "note", exists: false }]);
    await vi.waitFor(async () => expect(await ask(search, "bravo")).toEqual([]));
  });

  it("reads several notes per call where the shell can, one call at a time, past what it reads for the editor (PRF-04)", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 70; i++) files[`${PRIV}/n${i}.md`] = `# Note ${i}\n\nword${i} shared\n`;
    files[`${PRIV}/gone.md`] = "# Gone\n";
    const d = desktop(files);
    const calls: string[][] = [];
    let inFlight = 0;
    let most = 0;
    const searchBridge: PlatformBridge = {
      ...d.bridge,
      readNotes: async (paths) => {
        calls.push([...paths]);
        most = Math.max(most, ++inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return paths.map((p) => (p.endsWith("gone.md") ? null : d.files[p]!));
      },
    };
    const { app, search } = await started(d.bridge, searchBridge);
    expect(search.status()).toMatchObject({ notes: 71, indexed: 71, pending: 0 });
    // Every note read once, 32 at most per call, one call at a time; readNote read only the editor's note.
    expect(calls.flat().sort()).toEqual(Object.keys(files).sort());
    expect(Math.max(...calls.map((c) => c.length))).toBe(32);
    expect(calls.length).toBe(3);
    expect(most).toBe(1);
    expect(new Set(d.reads)).toEqual(new Set([app.store.state.note.path]));
    expect(keys(await askText(search, "word69"))[0]).toBe(`${PRIV}/n69.md`);
    // A note that can't be read is indexed by its title alone.
    expect(keys(await ask(search, "gone"))).toEqual([`${PRIV}/gone.md`]);
  });

  it("indexes the app's own saves from the text it already has, without reading the note", async () => {
    const d = desktop({ [`${PRIV}/a.md`]: "# A\n\nfirst\n" });
    const { app, search } = await started(d.bridge);
    const reads = d.reads.length;
    await app.commands.run("note.setContent", { value: "# A\n\nsecond thoughts\n" });
    await app.flush();
    await vi.waitFor(async () => expect(keys(await askText(search, "thoughts"))).toEqual([`${PRIV}/a.md`]));
    expect(await askText(search, "first")).toEqual([]);
    expect(d.reads.length).toBe(reads);
  });

  it("finds the same notes either way: an incremental diff and a fresh build agree", () => {
    const n = (name: string) => ({ kind: "note" as const, name, published: false });
    const one = n("one.md");
    const before = new Map([["a/one.md", { kind: "note" as const, path: "a/one.md", rel: "a/one.md", root: "local" as const, node: one }]]);
    const after = new Map([["b/one.md", { kind: "note" as const, path: "b/one.md", rel: "b/one.md", root: "local" as const, node: one }]]);
    expect(diffEntries(before, after)).toEqual({ ops: [{ op: "move", from: "a/one.md", to: "b/one.md", rel: "b/one.md" }], read: [] });
    const copy = new Map([["b/one.md", { ...after.get("b/one.md")!, node: n("one.md") }]]);
    expect(diffEntries(before, copy)).toEqual({ ops: [{ op: "remove", path: "a/one.md" }, { op: "note", path: "b/one.md", rel: "b/one.md", root: "local" }], read: ["b/one.md"] });
  });
});

/** The browser (D-90): its own notes, the instance's public notes, and private ones while unlocked. */
function browser() {
  const mine: Record<string, string> = { "Mine.md": "# Mine\n\nlocal words\n" };
  const pub: Record<string, string> = { "public:Hello.md": "# Hello\n\npublic words\n" };
  const priv: Record<string, string> = { "private:Plans/Launch plan.md": "# Launch plan\n\nsecret budget numbers\n" };
  let status: VaultStatus = { state: "locked" };
  const listeners = new Set<(v: VaultStatus) => void>();
  const set = (v: VaultStatus) => { status = v; for (const l of listeners) l(v); };
  let hold: { path: string; release: () => void } | undefined;
  const reads: string[] = [];
  const instance: InstanceBridge = {
    info: async () => ({ publicNotes: 1, hasVault: true }),
    vault: () => status,
    onVault: (l) => { listeners.add(l); return () => listeners.delete(l); },
    unlock: async () => set({ state: "unlocked", owner: "octo", remembered: false }),
    lock: async () => set({ state: "locked" }),
    origin: () => "octo.github.io",
  };
  const scan = (): WorkspaceScan => ({
    folder: "",
    roots: [{ id: "local", path: "", readOnly: false }, { id: "public", path: "public:", readOnly: true }, { id: "private", path: "private:", readOnly: true }],
    entries: [...Object.keys(mine), ...Object.keys(pub), ...(status.state === "unlocked" ? Object.keys(priv) : [])].map((path) => ({ path, kind: "note" as const })),
  });
  let state: AppStateFile = { version: 1 };
  const bridge: PlatformBridge = {
    platform: "web",
    async readNote(p) {
      reads.push(p);
      if (p.startsWith("private:")) {
        if (status.state !== "unlocked") throw new Error("Locked");
        if (hold?.path === p) await new Promise<void>((r) => { hold!.release = r; });
        return priv[p]!;
      }
      return mine[p] ?? pub[p] ?? Promise.reject(new Error("missing"));
    },
    writeNote: async (p, c) => { mine[p] = c; },
    chooseNote: async () => undefined, newNotePath: async () => "Untitled.md", defaultNotePath: async () => "Mine.md",
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    listNotes: async () => scan().entries.map((e) => ({ path: e.path, updated: 0 })),
    instance,
    workspace: { info: async () => ({ folder: "", format: '{ "formatVersion": 1 }' }), scan: async () => scan(), writeFormat: async () => {}, renameNote: async () => {} },
  };
  return { bridge, reads, holdNext: (path: string) => { hold = { path, release: () => {} }; return () => hold!.release(); } };
}

describe("private notes in the browser (D-90, SPT-08)", () => {
  it("are indexed only after unlocking, and gone on lock before any later query", async () => {
    const b = browser();
    const { app, search } = await started(b.bridge);
    expect(keys(await ask(search, "plan"))).toEqual([]);
    expect(keys(await askText(search, "public words"))).toEqual(["public:Hello.md"]);
    await b.bridge.instance!.unlock("passphrase", false);
    await vi.waitFor(async () => expect(keys(await askText(search, "secret budget"))).toEqual(["private:Plans/Launch plan.md"]));
    expect((await ask(search, "launch"))[0]).toMatchObject({ key: "private:Plans/Launch plan.md", rel: "Plans/Launch plan.md", root: "private" });
    await app.commands.run("vault.lock");
    // Asked straight after locking: the index forgot them first.
    const [titles, text] = await Promise.all([ask(search, "launch plan"), askText(search, "secret")]);
    expect(titles).toEqual([]);
    expect(text).toEqual([]);
    await search.whenIndexed();
    expect(search.status().notes).toBe(2);
  });

  it("throws away a private note's text whose read finishes after the lock", async () => {
    const b = browser();
    const { app, search } = await started(b.bridge);
    const release = b.holdNext("private:Plans/Launch plan.md");
    await b.bridge.instance!.unlock("passphrase", false);
    await vi.waitFor(() => expect(b.reads).toContain("private:Plans/Launch plan.md"));
    await app.commands.run("vault.lock");
    release();
    await search.whenIndexed();
    await new Promise((r) => setTimeout(r, 20));
    expect(await askText(search, "secret")).toEqual([]);
    expect(await ask(search, "launch")).toEqual([]);
  });

  it("asks the shell only to read notes and list the workspace: nothing is written, synced, or sent", async () => {
    vi.stubGlobal("fetch", () => { throw new Error("The search index must never use the network"); });
    const b = browser();
    const used = new Set<string>();
    const spy = <T extends object>(o: T, prefix: string): T => new Proxy(o, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver) as unknown;
        if (typeof key !== "string") return v;
        if (v && typeof v === "object") return spy(v as object, `${prefix}${key}.`);
        if (typeof v === "function") used.add(`${prefix}${key}`);
        return v;
      },
    });
    const { app, search } = await started(b.bridge, spy(b.bridge, ""));
    await b.bridge.instance!.unlock("passphrase", false);
    await vi.waitFor(async () => expect(await askText(search, "secret")).toHaveLength(1));
    await app.commands.run("vault.lock");
    await search.whenIndexed();
    expect([...used].sort()).toEqual(["readNote", "workspace.scan"]);
  });
});

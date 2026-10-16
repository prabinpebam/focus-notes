/**
 * D-171 (SHR-01): nothing is public unless the person chose it. At launch only the note they last
 * opened, inside this workspace, is reopened, and never an empty public file; otherwise the private
 * welcome note opens. Every way to create a note defaults to Private, even before the Files tree
 * has been read; only a folder chosen in Files puts it under Public. A workspace without a private
 * repository keeps D-158 (new notes under Public, held).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, titleOfMarkdown, type AppStateFile, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const PRIV = "/w/private/notes";
const PUB = "/w/notes";

function setup(opts: { files?: Record<string, string>; state?: Partial<AppStateFile>; privateRoot?: boolean; scanWaits?: boolean } = {}) {
  const priv = opts.privateRoot !== false;
  const root = priv ? PRIV : PUB;
  const files: Record<string, string> = { ...opts.files };
  let state: AppStateFile = { version: 1, firstRun: "done", ...opts.state };
  let scanned!: () => void;
  const scanGate = opts.scanWaits ? new Promise<void>((r) => (scanned = r)) : Promise.resolve();
  const created: string[] = [];
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => { if (!(p in files)) throw new Error("missing"); return files[p]!; },
    writeNote: async (p, c) => { if (!(p in files)) created.push(p); files[p] = c; },
    chooseNote: async () => undefined,
    // As the desktop does: next to `near`, else in the first root (Private when there is one).
    newNotePath: async (near) => {
      const dir = near ? near.slice(0, near.lastIndexOf("/")) : root;
      for (let i = 1; ; i++) { const p = `${dir}/untitled${i > 1 ? `-${i}` : ""}.md`; if (!(p in files)) return p; }
    },
    defaultNotePath: async () => {
      const p = `${root}/welcome.md`;
      if (!(p in files)) { created.push(p); files[p] = "# Welcome\n"; }
      return p;
    },
    loadAppState: async () => state, saveAppState: async (s) => { state = s; },
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    workspace: {
      info: async () => ({ folder: "/w", format: '{"formatVersion":1}' }),
      scan: async () => {
        await scanGate;
        return {
          folder: "/w",
          roots: [...(priv ? [{ id: "private", path: PRIV, readOnly: false }] : []), { id: "public", path: PUB, readOnly: false }],
          entries: Object.entries(files).map(([path, text]) => ({ path, kind: "note" as const, title: titleOfMarkdown(text) ?? "" })),
        };
      },
      writeFormat: async () => {},
      renameNote: async () => {},
      apply: async () => {},
    },
  } as PlatformBridge;
  const app = createApp(bridge, messages);
  const path = () => app.store.state.note.path;
  const treeRead = async () => { scanned?.(); await expect.poll(() => app.store.state.workspace.tree.roots.length).toBeGreaterThan(0); };
  return { app, files, created, path, treeRead, state: () => state };
}

describe("the note at launch (D-171)", () => {
  it("with no last note (a fresh profile), opens the private welcome note, never a note found in notes/", async () => {
    const s = setup({ files: { [`${PUB}/exploratory-conversation.md`]: "", [`${PUB}/essay.md`]: "# Essay\n" } });
    await s.app.start();
    expect(s.path()).toBe(`${PRIV}/welcome.md`);
    expect(s.created.filter((p) => p.startsWith(PUB))).toEqual([]);
  });
  it("reopens the note the person last opened, public or private", async () => {
    const s = setup({ files: { [`${PUB}/essay.md`]: "# Essay\n" }, state: { lastNotePath: `${PUB}/essay.md` } });
    await s.app.start();
    expect(s.path()).toBe(`${PUB}/essay.md`);
  });
  it("never reopens an empty public file: an empty note holds nothing anyone chose to publish", async () => {
    const s = setup({ files: { [`${PUB}/exploratory-conversation.md`]: "\n" }, state: { lastNotePath: `${PUB}/exploratory-conversation.md` } });
    await s.app.start();
    expect(s.path()).toBe(`${PRIV}/welcome.md`);
    expect(s.state().lastNotePath).toBe(`${PRIV}/welcome.md`);
  });
  it("opens the private welcome note when the last note is gone (deleted or moved)", async () => {
    const gone = setup({ state: { lastNotePath: `${PUB}/deleted.md` } });
    await gone.app.start();
    expect(gone.path()).toBe(`${PRIV}/welcome.md`);
  });
  it("in a workspace without a private repository, keeps D-158: the welcome note is under Public (held by the shell)", async () => {
    const s = setup({ privateRoot: false });
    await s.app.start();
    expect(s.path()).toBe(`${PUB}/welcome.md`);
  });
});

describe("every way to create a note defaults to Private (D-171)", () => {
  it("Mod+N from a public note, before the Files tree has been read, creates under Private", async () => {
    const s = setup({ files: { [`${PUB}/essay.md`]: "# Essay\n" }, state: { lastNotePath: `${PUB}/essay.md` }, scanWaits: true });
    await s.app.start();
    expect(s.app.store.state.workspace.tree.roots).toHaveLength(0);
    await s.app.commands.run("note.new");
    expect(s.path()!.startsWith(`${PRIV}/`)).toBe(true);
    expect(s.created.filter((p) => p.startsWith(PUB))).toEqual([]);
  });
  it("Mod+N, the toolbar's New, and Spotlight's Create note from a public note create under Private once the tree is read", async () => {
    const s = setup({ files: { [`${PUB}/essay.md`]: "# Essay\n", [`${PRIV}/ideas/a.md`]: "# A\n" }, state: { lastNotePath: `${PUB}/essay.md` } });
    await s.app.start();
    await s.treeRead();
    await s.app.commands.run("note.new");
    expect(s.path()).toBe(`${PRIV}/untitled.md`);
    // Spotlight's Create note "…" is note.new with a title.
    const t = setup({ files: { [`${PUB}/essay.md`]: "# Essay\n" }, state: { lastNotePath: `${PUB}/essay.md` } });
    await t.app.start();
    await t.treeRead();
    await t.app.commands.run("note.new", { title: "From Spotlight" });
    expect(t.path()!.startsWith(`${PRIV}/`)).toBe(true);
    expect([...s.created, ...t.created].filter((p) => p.startsWith(PUB))).toEqual([]);
  });
  it("next to the open note only when it's private", async () => {
    const s = setup({ files: { [`${PRIV}/ideas/a.md`]: "# A\n" }, state: { lastNotePath: `${PRIV}/ideas/a.md` } });
    await s.app.start();
    await s.treeRead();
    await s.app.commands.run("note.new");
    expect(s.path()).toBe(`${PRIV}/ideas/untitled.md`);
  });
  it("in a workspace without a private repository, keeps D-158: next to the open note, under Public", async () => {
    const s = setup({ privateRoot: false, files: { [`${PUB}/essay.md`]: "# Essay\n" }, state: { lastNotePath: `${PUB}/essay.md` } });
    await s.app.start();
    await s.treeRead();
    await s.app.commands.run("note.new");
    expect(s.path()).toBe(`${PUB}/untitled.md`);
  });
});

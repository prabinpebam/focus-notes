import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createApp, freePath, makeBundle, parseBundle, planImport, safeLocalPath, sourceOf, UnlockError,
  type AppStateFile, type InstanceBridge, type NoteSummary, type PlatformBridge, type VaultStatus,
} from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;

describe("note sources and the export bundle (PKG-08, PKG-11)", () => {
  it("tells the browser's own notes from the instance's read-only ones", () => {
    expect(sourceOf("Ideas/a.md")).toBe("local");
    expect(sourceOf("public:Ideas/a.md")).toBe("public");
    expect(sourceOf("private:a.md")).toBe("private");
    expect(sourceOf(undefined)).toBe("local");
  });
  it("finds a free name instead of replacing a note", () => {
    const taken = new Set(["A.md", "A 2.md", "B"]);
    expect(freePath("C.md", taken)).toBe("C.md");
    expect(freePath("A.md", taken)).toBe("A 3.md");
    expect(freePath("B", taken)).toBe("B 2.md");
  });
  it("makes imported paths safe", () => {
    expect(safeLocalPath("public:Ideas/Plan.md")).toBe("Ideas/Plan.md");
    expect(safeLocalPath("../../etc/passwd")).toBe("etc/passwd.md");
    expect(safeLocalPath("C:\\Users\\x\\Note.md")).toBe("C/Users/x/Note.md");
    expect(safeLocalPath("")).toBe("Untitled.md");
  });
  it("round-trips a bundle and imports without replacing or duplicating anything", () => {
    const b = makeBundle([{ path: "A.md", text: "alpha", updated: 0 }, { path: "Ideas/B.md", text: "bravo", updated: 1000 }], new Date("2026-10-14T00:00:00Z"));
    const parsed = parseBundle(JSON.stringify(b));
    expect(parsed.notes.map((n) => n.path)).toEqual(["A.md", "Ideas/B.md"]);
    const plan = planImport(parsed, new Map([["A.md", "something else"], ["Ideas/B.md", "bravo"]]));
    expect(plan).toEqual([{ path: "A 2.md", text: "alpha", updated: 0, renamed: true }]);
  });
  it("refuses files that aren't exports", () => {
    expect(() => parseBundle("{}")).toThrow();
    expect(() => parseBundle("not json")).toThrow();
    expect(() => parseBundle(JSON.stringify({ format: "focus-notes/export/v1", exported: "x", notes: [{ path: 1 }] }))).toThrow();
  });
});

function instanceBridge(opts: { vault?: boolean } = {}) {
  const files: Record<string, string> = { "Mine.md": "# Mine\n" };
  const publicNotes: Record<string, string> = { "Hello.md": "# Hello\n\nPublic.\n" };
  const privateNotes: Record<string, string> = { "Secret.md": "# Secret\n" };
  let status: VaultStatus = { state: opts.vault === false ? "none" : "locked" };
  const listeners = new Set<(v: VaultStatus) => void>();
  const set = (v: VaultStatus) => { status = v; for (const l of listeners) l(v); };
  let state: AppStateFile = { version: 1 };
  const writes: string[] = [];
  const instance: InstanceBridge = {
    info: async () => ({ publicNotes: 1, hasVault: opts.vault !== false }),
    vault: () => status,
    onVault: (l) => { listeners.add(l); return () => listeners.delete(l); },
    unlock: async (p, remember) => {
      if (p !== "correct horse battery staple") throw new UnlockError("wrong");
      set({ state: "unlocked", owner: "octo", remembered: remember });
    },
    lock: async () => set({ state: "locked" }),
    origin: () => "octo.github.io",
  };
  const bridge: PlatformBridge = {
    platform: "web",
    instance,
    readNote: async (p) => {
      const s = sourceOf(p);
      const inner = p.replace(/^(public|private):/, "");
      const t = s === "public" ? publicNotes[inner] : s === "private" ? (status.state === "unlocked" ? privateNotes[inner] : undefined) : files[p];
      if (t === undefined) throw new Error("missing");
      return t;
    },
    writeNote: async (p, t) => {
      if (sourceOf(p) !== "local") throw new Error("read-only");
      files[p] = t;
      writes.push(p);
    },
    listNotes: async (): Promise<NoteSummary[]> => [
      ...Object.keys(files).map((path) => ({ path, updated: 1 })),
      { path: "public:Hello.md", title: "Hello", updated: 2 },
      ...(status.state === "unlocked" ? [{ path: "private:Secret.md", title: "Secret", updated: 3 }] : []),
    ],
    chooseNote: async () => undefined,
    newNotePath: async (near) => (near?.includes("/") ? `${near.slice(0, near.lastIndexOf("/") + 1)}Untitled.md` : "Untitled.md"),
    defaultNotePath: async () => "Mine.md",
    loadAppState: async () => state,
    saveAppState: async (s) => { state = s; },
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
  };
  return { bridge, files, writes, state: () => state };
}

const vm = (app: ReturnType<typeof createApp>, id: string) => app.viewModels.select(id, app.store.state) as Record<string, unknown>;

describe("the instance's notes in the browser (PKG-08, PKG-09, PKG-10, UI-12)", () => {
  it("opens public notes read-only, never writes them, and copies them to the browser's notes", async () => {
    const f = instanceBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("picker.open");
    await app.commands.run("picker.choose", { id: "public:Hello.md" });
    expect(app.store.state.note.path).toBe("public:Hello.md");
    expect(vm(app, "vm.canvas").readOnly).toBe(true);
    expect(vm(app, "vm.account")).toMatchObject({ visible: true, readOnly: true, about: true, mode: "unlock" });

    await app.commands.run("note.setContent", { value: "changed" });
    expect(await app.flush()).toBe(true);
    expect(f.writes).toEqual([]);

    f.files["Hello.md"] = "taken";
    await app.commands.run("note.copyToLocal");
    expect(app.store.state.note.path).toBe("Hello 2.md");
    expect(f.files["Hello 2.md"]).toBe("# Hello\n\nPublic.\n");
    expect(vm(app, "vm.canvas").readOnly).toBe(false);
    expect(app.store.state.ui.toasts.at(-1)?.message).toContain("Hello 2");
  });

  it("starts a new note among the browser's own notes, not inside the instance's", async () => {
    const f = instanceBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("picker.open");
    await app.commands.run("picker.choose", { id: "public:Hello.md" });
    await app.commands.run("note.new");
    expect(app.store.state.note.path).toBe("Untitled.md");
  });

  it("unlocks with the passphrase, shows the owner, and locks again", async () => {
    const f = instanceBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("vault.unlock");
    await app.commands.run("unlock.setPassphrase", { value: "wrong guess" });
    await app.commands.run("unlock.submit");
    expect(vm(app, "vm.unlock")).toMatchObject({ open: true, hasError: true, passphrase: "", error: messages["unlock.error.wrong"] });

    await app.commands.run("unlock.setPassphrase", { value: "correct horse battery staple" });
    await app.commands.run("unlock.submit");
    expect(vm(app, "vm.unlock").open).toBe(false);
    expect(vm(app, "vm.account")).toMatchObject({ mode: "owner", text: "octo", about: false });
    const items = (vm(app, "vm.account").sections as { items: { id: string }[] }[])[0]!.items.map((i) => i.id);
    expect(items).toEqual(["vault.lock"]);

    await app.commands.run("picker.open");
    await app.commands.run("picker.choose", { id: "private:Secret.md" });
    expect(app.store.state.note.path).toBe("private:Secret.md");
    // Its name never reaches the browser's storage.
    expect(JSON.stringify(f.state())).not.toContain("Secret");
    await app.commands.run("vault.lock");
    // A private note can't stay on screen once locked.
    expect(app.store.state.note.path).toBe("Mine.md");
    expect(vm(app, "vm.account").mode).toBe("unlock");
  });

  it("offers Forget this browser once the key is remembered", async () => {
    const app = createApp(instanceBridge().bridge, messages);
    await app.start();
    await app.commands.run("vault.unlock");
    await app.commands.run("unlock.setPassphrase", { value: "correct horse battery staple" });
    await app.commands.run("unlock.remember");
    const items = (vm(app, "vm.account").sections as { items: { id: string }[] }[])[0]!.items.map((i) => i.id);
    expect(items).toEqual(["vault.forget"]);
  });

  it("shows no Unlock on a site without private notes, and nothing outside a site", async () => {
    const app = createApp(instanceBridge({ vault: false }).bridge, messages);
    await app.start();
    expect(vm(app, "vm.account")).toMatchObject({ mode: "none", about: true, visible: true });
    expect(app.commands.describe("vault.unlock").enabled).toBe(false);

    const { instance: _drop, ...plain } = instanceBridge().bridge;
    const desktop = createApp(plain as PlatformBridge, messages);
    await desktop.start();
    expect(vm(desktop, "vm.account").visible).toBe(false);
  });
});

/**
 * DEF-24 (D-92, FIL-12): the main process writes a note only if the file still holds the text the
 * window expects there, checked once the write's turn has come (after the writes queued before it
 * and any Git pull) and again right before the rename; another program's change is never written
 * over, and the window gets the text found. The preload and `note:write` pass the expectation on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoteWriter, noteSave, retrying } from "../src/main/note-write.ts";

const dir = () => mkdtempSync(join(tmpdir(), "fn-def24-"));

describe("NoteWriter", () => {
  it("writes when the file holds what the window expects", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nFirst.\n");
    expect(await new NoteWriter().write(p, "# A\n\nFirst. Typed.\n", "# A\n\nFirst.\n")).toBeUndefined();
    expect(readFileSync(p, "utf8")).toBe("# A\n\nFirst. Typed.\n");
  });

  it("writes nothing over another program's change, and returns what it found", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nChanged by another program.\n");
    expect(await new NoteWriter().write(p, "# A\n\nFirst. Typed.\n", "# A\n\nFirst.\n")).toEqual({ outside: "# A\n\nChanged by another program.\n" });
    expect(readFileSync(p, "utf8")).toBe("# A\n\nChanged by another program.\n");
  });

  it("a change landing while the write waits for a Git pull is never written over", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nFirst.\n");
    let pullDone!: () => void;
    const pull = new Promise<void>((r) => (pullDone = r));
    const writer = new NoteWriter({ ready: () => pull });
    const saving = writer.write(p, "# A\n\nFirst. Typed.\n", "# A\n\nFirst.\n");
    // The pull rewrites the note while the save waits for it.
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(p, "# A\n\nFrom the other computer.\n");
    pullDone();
    expect(await saving).toEqual({ outside: "# A\n\nFrom the other computer.\n" });
    expect(readFileSync(p, "utf8")).toBe("# A\n\nFrom the other computer.\n");
  });

  it("a write queued before this one that changed the file (links rewritten) is never written over", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nSee [B](b.md).\n");
    let go!: () => void;
    const gate = new Promise<void>((r) => (go = r));
    let first = true;
    const writer = new NoteWriter({ ready: async () => { if (first) { first = false; await gate; } } });
    const links = writer.write(p, "# A\n\nSee [B](drafts/b.md).\n");
    const save = writer.write(p, "# A\n\nSee [B](b.md). Typed.\n", "# A\n\nSee [B](b.md).\n");
    go();
    await links;
    expect(await save).toEqual({ outside: "# A\n\nSee [B](drafts/b.md).\n" });
    expect(readFileSync(p, "utf8")).toBe("# A\n\nSee [B](drafts/b.md).\n");
  });

  it("a file already holding the text being saved, a missing file, and no expectation are written", async () => {
    const d = dir();
    const w = new NoteWriter();
    const same = join(d, "same.md");
    writeFileSync(same, "# Same\n");
    expect(await w.write(same, "# Same\n", "# Older\n")).toBeUndefined();
    const gone = join(d, "gone.md");
    expect(await w.write(gone, "# Back\n", "# Was\n")).toBeUndefined();
    expect(readFileSync(gone, "utf8")).toBe("# Back\n");
    const any = join(d, "any.md");
    writeFileSync(any, "# Whatever\n");
    expect(await w.write(any, "", undefined)).toBeUndefined();
    expect(readFileSync(any, "utf8")).toBe("");
  });

  it("a file briefly locked (EBUSY, EPERM) is read again, not reported as a failed save", async () => {
    let tries = 0;
    const read = () => {
      tries++;
      if (tries < 3) return Promise.reject(Object.assign(new Error("busy"), { code: tries === 1 ? "EBUSY" : "EPERM" }));
      return Promise.resolve("text");
    };
    expect(await retrying(read)).toBe("text");
    expect(tries).toBe(3);
    await expect(retrying(() => Promise.reject(Object.assign(new Error("gone"), { code: "EISDIR" })))).rejects.toThrow("gone");
  });
});

describe("note:write", () => {
  it("passes the window's expectation to the write, returns a change found, and records nothing then", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nChanged by another program.\n");
    const writer = new NoteWriter();
    const write = vi.fn((path: string, content: string, expected?: string) => writer.write(path, content, expected));
    const written = vi.fn();
    const saved = vi.fn();
    const save = noteSave({ path: (x) => String(x), write, before: async () => "", mark: () => 7, saved, written });
    expect(await save(p, "# A\n\nTyped.\n", "# A\n\nFirst.\n")).toEqual({ outside: "# A\n\nChanged by another program.\n" });
    expect(write).toHaveBeenCalledWith(p, "# A\n\nTyped.\n", "# A\n\nFirst.\n");
    expect(written).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(await save(p, "# A\n\nTyped.\n", "# A\n\nChanged by another program.\n")).toBeUndefined();
    expect(saved).toHaveBeenCalledWith(p, "# A\n\nTyped.\n", 7);
    expect(written).toHaveBeenCalledWith(p, "", "# A\n\nTyped.\n");
    await expect(save(p, "x", 5)).rejects.toThrow("Expected text must be text");
  });
});

describe("the preload", () => {
  afterEach(() => vi.doUnmock("electron"));
  it("sends the expectation with the save", async () => {
    const invoke = vi.fn(async () => undefined);
    let api: Record<string, (...a: unknown[]) => unknown> = {};
    vi.doMock("electron", () => ({
      contextBridge: { exposeInMainWorld: (_name: string, value: typeof api) => { api = value; } },
      ipcRenderer: { invoke, on: vi.fn(), send: vi.fn(), removeListener: vi.fn(), off: vi.fn(), sendSync: vi.fn() },
    }));
    await import("../src/main/preload.ts");
    await api.writeNote!("/w/a.md", "# A\n", "# Was\n");
    expect(invoke).toHaveBeenCalledWith("note:write", "/w/a.md", "# A\n", "# Was\n");
  });
});

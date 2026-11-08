import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, open, readdir, readFile, rename, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstProjectNote as helper, prepareProjectNoteRoots } from "../src/main/first-project-note.ts";
import { projectMetadataStore } from "../src/main/project-metadata.ts";
import { NoteWriter } from "../src/main/note-write.ts";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { pathToFileURL } from "node:url";

vi.mock("node:fs/promises", async importOriginal => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, open: vi.fn(original.open) };
});

const dirs: string[] = [];
let metadata: ReturnType<typeof projectMetadataStore>;
let metadataRoot: string;
beforeEach(async () => { metadataRoot = await root(); metadata = projectMetadataStore(metadataRoot); });
afterEach(async () => {
  await metadata.dispose();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
function firstProjectNote(options: Omit<Parameters<typeof helper>[0], "admit">) {
  return helper({ ...options, admit: metadata.firstNoteAdmission });
}
async function root() {
  const dir = await mkdtemp(join(tmpdir(), "fn-first-note-"));
  dirs.push(dir);
  return dir;
}

describe("first project note (PRJ-24)", () => {
  it("creates one note from two independent admissions when its trusted notes directory is absent", async () => {
    const project = await root();
    const notes = join(project, "notes");
    const second = projectMetadataStore(metadataRoot);
    await writeFile(join(project, "kept.txt"), "unchanged");
    const options = {
      roots: async () => [notes], writable: async () => {}, allowNonempty: true,
      prepareRoots: (roots: readonly string[]) => prepareProjectNoteRoots(project, roots, async () => {}),
    };
    try {
      const paths = await Promise.all([
        helper({ ...options, admit: metadata.firstNoteAdmission })(),
        helper({ ...options, admit: second.firstNoteAdmission })(),
      ]);
      expect(paths).toEqual([join(notes, "Untitled.md"), join(notes, "Untitled.md")]);
      expect(await readdir(notes)).toEqual(["Untitled.md"]);
      expect(await readFile(paths[0]!, "utf8")).toBe("");
      expect(await readFile(join(project, "kept.txt"), "utf8")).toBe("unchanged");
    } finally { await second.dispose(); }
  });

  it("prepares missing public and private note roots only inside their existing trusted parents", async () => {
    const project = await root();
    await mkdir(join(project, "private"));
    const roots = [join(project, "private", "notes"), join(project, "notes")];
    await prepareProjectNoteRoots(project, roots, async () => {});
    expect(await readdir(roots[0]!)).toEqual([]);
    expect(await readdir(roots[1]!)).toEqual([]);
  });

  it("preserves a stable project-root alias while preparing its actual notes directory", async () => {
    const project = await root();
    const aliases = await root();
    const alias = join(aliases, "project");
    await symlink(project, alias, process.platform === "win32" ? "junction" : "dir");
    await prepareProjectNoteRoots(alias, [join(alias, "notes")], async () => {});
    expect(await readdir(project)).toEqual(["notes"]);
    expect(await readdir(join(project, "notes"))).toEqual([]);
  });

  it("does not create a note directory when access is refused", async () => {
    const project = await root();
    await expect(prepareProjectNoteRoots(project, [join(project, "notes")], async () => {
      throw new Error("read-only project");
    })).rejects.toThrow("read-only");
    expect(await readdir(project)).toEqual([]);
  });

  it("does not recreate a project removed during root preparation", async () => {
    const project = await root();
    await expect(prepareProjectNoteRoots(project, [join(project, "notes")], async () => {
      await rmdir(project);
    })).rejects.toThrow();
    await expect(readdir(project)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not follow a redirected private parent or overwrite a colliding root file", async () => {
    const project = await root();
    const outside = await root();
    await symlink(outside, join(project, "private"), process.platform === "win32" ? "junction" : "dir");
    await expect(prepareProjectNoteRoots(project, [join(project, "private", "notes")], async () => {})).rejects.toThrow("redirected");
    expect(await readdir(outside)).toEqual([]);
    await writeFile(join(project, "notes"), "existing bytes");
    await expect(prepareProjectNoteRoots(project, [join(project, "notes")], async () => {})).rejects.toThrow("not a directory");
    expect(await readFile(join(project, "notes"), "utf8")).toBe("existing bytes");
  });

  it("rejects a root outside the trusted project without creating anything", async () => {
    const project = await root();
    const outside = await root();
    await expect(prepareProjectNoteRoots(project, [join(outside, "notes")], async () => {})).rejects.toThrow("untrusted");
    expect(await readdir(outside)).toEqual([]);
  });

  it("prepares missing trusted roots before canonical identity and admission", async () => {
    const project = await root();
    const notes = join(project, "notes");
    const prepareRoots = vi.fn(async () => { await mkdir(notes); });
    const options = {
      roots: async () => [notes], writable: async () => {}, allowNonempty: true, prepareRoots,
    };
    const create = firstProjectNote(options);
    expect(await create()).toBe(join(notes, "Untitled.md"));
    expect(prepareRoots).toHaveBeenCalledWith([notes]);
    expect(await readdir(notes)).toEqual(["Untitled.md"]);
    expect(await readFile(join(notes, "Untitled.md"), "utf8")).toBe("");
  });

  it("admits one empty note without history in a populated project and preserves existing bytes", async () => {
    const dir = await root();
    await writeFile(join(dir, "Untitled.md"), "# Existing\n");
    await writeFile(join(dir, "kept.txt"), "kept");
    const second = projectMetadataStore(metadataRoot);
    const options = { roots: async () => [dir], writable: async () => {}, allowNonempty: true };
    try {
      const paths = await Promise.all([
        helper({ ...options, admit: metadata.firstNoteAdmission })(),
        helper({ ...options, admit: second.firstNoteAdmission })(),
      ]);
      expect(paths).toEqual([join(dir, "Untitled 2.md"), join(dir, "Untitled 2.md")]);
      expect(await readFile(join(dir, "Untitled.md"), "utf8")).toBe("# Existing\n");
      expect(await readFile(join(dir, "kept.txt"), "utf8")).toBe("kept");
      expect(await readFile(paths[0]!, "utf8")).toBe("");
      expect((await readdir(dir)).sort()).toEqual(["Untitled 2.md", "Untitled.md", "kept.txt"]);
      const create = helper({ ...options, admit: metadata.firstNoteAdmission });
      await create.write(paths[0]!, async () => {
        const temp = join(dir, "replacement");
        await writeFile(temp, "# Saved\n");
        await rename(temp, paths[0]!);
      });
      expect(await helper({ ...options, admit: second.firstNoteAdmission })()).toBe(paths[0]);
      expect(await readFile(paths[0]!, "utf8")).toBe("# Saved\n");
    } finally { await second.dispose(); }
  });

  it("reports a failed scan even when missing history permits admission beside existing notes", async () => {
    const dir = await root();
    await expect(firstProjectNote({ roots: async () => [join(dir, "unavailable")], writable: async () => {}, allowNonempty: true })()).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it("reads an existing empty Untitled without overwriting or acquiring false provenance", async () => {
    const dir = await root();
    const path = join(dir, "Untitled.md");
    await writeFile(path, "");
    await writeFile(join(dir, "kept.md"), "# Keep this\n");
    const certified = vi.fn();
    const create = helper({
      roots: async () => [dir], writable: async () => {}, allowNonempty: true,
      admit: (roots, work) => metadata.firstNoteAdmission(roots, (proof, certify) => work(proof, certificate => {
        certified(certificate);
        certify(certificate);
      })),
    });
    expect(await create()).toBe(path);
    expect(certified).not.toHaveBeenCalled();
    expect((await readdir(dir)).sort()).toEqual(["Untitled.md", "kept.md"]);
    expect(await readFile(path, "utf8")).toBe("");
    expect(await readFile(join(dir, "kept.md"), "utf8")).toBe("# Keep this\n");
  });

  it("reports a formerly empty note changing before read-only reuse without creating another note", async () => {
    const dir = await root();
    const path = join(dir, "Untitled.md");
    await writeFile(path, "");
    const create = firstProjectNote({
      roots: async () => [dir], allowNonempty: true,
      writable: async () => { await writeFile(path, "# Changed externally\n"); },
    });
    await expect(create()).rejects.toThrow("empty project note changed");
    expect(await readdir(dir)).toEqual(["Untitled.md"]);
    expect(await readFile(path, "utf8")).toBe("# Changed externally\n");
  });

  it.each(["removed", "replaced"])("reports a %s certified note without creating a duplicate or replacing content", async (change) => {
    const dir = await root();
    const options = { roots: async () => [dir], writable: async () => {}, allowNonempty: true };
    const path = await firstProjectNote(options)();
    expect(path).toBe(join(dir, "Untitled.md"));
    if (change === "removed") await rm(path!);
    else {
      const replacement = join(dir, "external");
      await writeFile(replacement, "# External change\n");
      await rename(replacement, path!);
    }
    await expect(firstProjectNote(options)()).rejects.toThrow();
    expect(await readdir(dir)).toEqual(change === "removed" ? [] : ["Untitled.md"]);
    if (change === "replaced") expect(await readFile(path!, "utf8")).toBe("# External change\n");
  });

  it("creates one ordinary empty note under concurrent admissions", async () => {
    const dir = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const paths = await Promise.all([create(), create(), create()]);
    expect(paths).toEqual(Array(3).fill(join(dir, "Untitled.md")));
    expect(await readdir(dir)).toEqual(["Untitled.md"]);
    expect(await readFile(paths[0]!, "utf8")).toBe("");
    expect(await create()).toBe(join(dir, "Untitled.md"));
  });

  it("preserves any existing file in either trusted root, including non-Markdown", async () => {
    const privateRoot = await root();
    const publicRoot = await root();
    await mkdir(join(publicRoot, "nested"));
    const existing = join(publicRoot, "nested", "kept.txt");
    await writeFile(existing, "unchanged");
    const writable = vi.fn(async () => {});
    const create = firstProjectNote({ roots: async () => [privateRoot, publicRoot], writable });
    expect(await create()).toBeUndefined();
    expect(await readdir(privateRoot)).toEqual([]);
    expect(await readFile(existing, "utf8")).toBe("unchanged");
    expect(writable).not.toHaveBeenCalled();
  });

  it("does not infer emptiness from an unavailable project or failed directory read", async () => {
    const dir = await root();
    expect(await firstProjectNote({ roots: async () => undefined, writable: async () => {} })()).toBeUndefined();
    await expect(firstProjectNote({ roots: async () => [join(dir, "missing")], writable: async () => {} })()).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it("never follows a metadata-named junction or symbolic link to declare a root empty", async () => {
    const dir = await root();
    const outside = await root();
    await symlink(outside, join(dir, ".git"), process.platform === "win32" ? "junction" : "dir");
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    expect(await create()).toBeUndefined();
    expect(await readdir(dir)).toEqual([".git"]);
    expect(await readdir(outside)).toEqual([]);
  });

  it("rechecks roots, access and content after asynchronous preparation", async () => {
    const first = await root();
    const second = await root();
    let current = first;
    const changed = firstProjectNote({
      roots: async () => [current],
      writable: async () => { current = second; },
    });
    await expect(changed()).rejects.toThrow("project changed");
    expect(await readdir(first)).toEqual([]);
    expect(await readdir(second)).toEqual([]);
    const arriving = firstProjectNote({
      roots: async () => [first],
      writable: async () => { await writeFile(join(first, "arrived.md"), "# Keep"); },
    });
    expect(await arriving()).toBeUndefined();
    expect(await readdir(first)).toEqual(["arrived.md"]);
  });

  it("admits both independent startups to the readable exclusive winner without overwriting", async () => {
    const dir = await root();
    const second = projectMetadataStore(metadataRoot);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let prepared!: () => void;
    const preparing = new Promise<void>(resolve => { prepared = resolve; });
    const options = { roots: async () => [dir], writable: async () => {} };
    try {
      const winner = firstProjectNote({ ...options, writable: async () => { prepared(); await held; } })();
      await preparing;
      const loser = helper({ ...options, admit: second.firstNoteAdmission })();
      await new Promise<void>(resolve => setImmediate(resolve));
      release();
      const paths = await Promise.all([winner, loser]);
      expect(paths).toEqual([join(dir, "Untitled.md"), join(dir, "Untitled.md")]);
      expect(await readdir(dir)).toEqual(["Untitled.md"]);
      for (const path of paths) expect(await readFile(path!, "utf8")).toBe("");
      expect(await helper({ ...options, admit: second.firstNoteAdmission })()).toBe(join(dir, "Untitled.md"));
    } finally { release(); await second.dispose(); }
  });

  it("admits genuinely separate source processes and a late arriver to the same readable winner", async () => {
    const dir = await root();
    const helperUrl = pathToFileURL(join(import.meta.dirname, "..", "src", "main", "first-project-note.ts")).href;
    const storeUrl = pathToFileURL(join(import.meta.dirname, "..", "src", "main", "project-metadata.ts")).href;
    const children: ReturnType<typeof spawn>[] = [];
    async function start() {
      const child = spawn(process.execPath, ["--input-type=module", "-e", `
        import { readFile } from "node:fs/promises";
        const { firstProjectNote } = await import(${JSON.stringify(helperUrl)});
        const { projectMetadataStore } = await import(${JSON.stringify(storeUrl)});
        const store = projectMetadataStore(process.argv[1]);
        process.send("ready");
        process.once("message", async () => {
          try {
            const path = await firstProjectNote({ roots: async () => [process.argv[2]], writable: async () => {}, admit: store.firstNoteAdmission })();
            process.send({ path, text: path ? await readFile(path, "utf8") : null, pid: process.pid });
          } catch (error) { process.send({ error: String(error) }); process.exitCode = 1; }
          finally { await store.dispose(); process.disconnect(); }
        });
      `, metadataRoot, dir], { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true });
      children.push(child);
      let errors = "";
      child.stderr?.on("data", data => { errors += String(data); });
      const exited = once(child, "exit").then(([code]) => { throw new Error(`Source admission child exited ${code}: ${errors}`); });
      const ready = await Promise.race([once(child, "message"), exited]);
      expect(ready[0]).toBe("ready");
      const result = Promise.race([once(child, "message").then(([value]) => value), exited]);
      return { child, result };
    }
    const timer = setTimeout(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 10_000);
    try {
      const first = await start();
      const second = await start();
      first.child.send("start"); second.child.send("start");
      const results = await Promise.all([first.result, second.result]);
      expect(results).toEqual([
        { path: join(dir, "Untitled.md"), text: "", pid: first.child.pid },
        { path: join(dir, "Untitled.md"), text: "", pid: second.child.pid },
      ]);
      expect(first.child.pid).not.toBe(second.child.pid);
      const late = await start();
      late.child.send("start");
      expect(await late.result).toEqual({ path: join(dir, "Untitled.md"), text: "", pid: late.child.pid });
      expect(await readdir(dir)).toEqual(["Untitled.md"]);
    } finally {
      clearTimeout(timer);
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
        }
      }
    }
  }, 15_000);

  it("surfaces refusal and permits an explicit retry without creating twice", async () => {
    const dir = await root();
    const writable = vi.fn().mockRejectedValueOnce(new Error("read-only")).mockResolvedValue(undefined);
    const create = firstProjectNote({ roots: async () => [dir], writable });
    await expect(create()).rejects.toThrow("read-only");
    expect(await readdir(dir)).toEqual([]);
    expect(await create()).toBe(join(dir, "Untitled.md"));
    expect(await create()).toBe(join(dir, "Untitled.md"));
  });

  it("retains provenance through ordinary atomic edits but not external replacement or rename", async () => {
    const dir = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const path = (await create())!;
    const writer = new NoteWriter();
    await create.write(path, () => writer.write(path, "Edited without a title", ""));
    expect(await create()).toBe(path);
    expect(await readFile(path, "utf8")).toBe("Edited without a title");
    await rename(path, join(dir, "renamed.md"));
    expect(await create()).toBeUndefined();
    await writeFile(path, "Unrelated replacement", { flag: "wx" });
    expect(await create()).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe("Unrelated replacement");
  });

  it("preserves certificate, saved bytes and external-edit refusal when an ordinary save fails", async () => {
    const dir = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const path = (await create())!;
    await expect(create.write(path, async () => { throw new Error("save failed"); })).rejects.toThrow("save failed");
    expect(await create()).toBe(path);
    expect(await readFile(path, "utf8")).toBe("");
    const writer = new NoteWriter({
      ready: vi.fn().mockRejectedValueOnce(new Error("read-only")).mockResolvedValue(undefined),
      replace: (path, write) => create.write(path, write),
    });
    await expect(writer.write(path, "Unsaved input", "")).rejects.toThrow("read-only");
    expect(await readFile(path, "utf8")).toBe("");
    expect(await create()).toBe(path);
    await writeFile(path, "External edit");
    expect(await writer.write(path, "Unsaved input", "")).toEqual({ outside: "External edit" });
    expect(await readFile(path, "utf8")).toBe("External edit");
    expect(await create()).toBe(path);
  });

  it("does not hold unrelated roots behind slow writable preparation or a save's Git wait", async () => {
    const first = await root();
    const second = await root();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let prepared!: () => void;
    const preparing = new Promise<void>(resolve => { prepared = resolve; });
    const delayed = firstProjectNote({ roots: async () => [first], writable: async () => { prepared(); await held; } });
    const creating = delayed();
    await preparing;
    try {
      const other = firstProjectNote({ roots: async () => [second], writable: async () => {} });
      expect(await other()).toBe(join(second, "Untitled.md"));
    } finally { release(); }
    const path = (await creating)!;
    let saveReady!: () => void;
    const ready = new Promise<void>(resolve => { saveReady = resolve; });
    let saved!: () => void;
    const saving = new Promise<void>(resolve => { saved = resolve; });
    const writer = new NoteWriter({
      ready: async () => { saved(); await ready; },
      replace: (path, write) => delayed.write(path, write),
    });
    const writing = writer.write(path, "Normal edit", "");
    await saving;
    try {
      const third = await root();
      expect(await firstProjectNote({ roots: async () => [third], writable: async () => {} })()).toBe(join(third, "Untitled.md"));
    } finally { saveReady(); await writing; }
  });

  it("surfaces failed exclusive creation, certified read and read-only access without acquiring false provenance", async () => {
    const dir = await root();
    const writable = vi.fn(async () => {});
    const create = firstProjectNote({ roots: async () => [dir], writable });
    vi.mocked(open).mockRejectedValueOnce(new Error("exclusive write denied"));
    await expect(create()).rejects.toThrow("exclusive write denied");
    expect(await readdir(dir)).toEqual([]);
    const path = (await create())!;
    vi.mocked(open).mockRejectedValueOnce(new Error("winner read denied"));
    await expect(create()).rejects.toThrow("winner read denied");
    writable.mockRejectedValueOnce(new Error("read-only"));
    await expect(create()).rejects.toThrow("read-only");
    expect(await readFile(path, "utf8")).toBe("");
    expect(await create()).toBe(path);
  });

  it("never certifies arbitrary preexisting Untitled or an unrelated concurrent creation", async () => {
    const dir = await root();
    const path = join(dir, "Untitled.md");
    await writeFile(path, "");
    const writable = vi.fn(async () => {});
    const create = firstProjectNote({ roots: async () => [dir], writable });
    expect(await create()).toBeUndefined();
    expect(writable).not.toHaveBeenCalled();
    await rm(path);
    const arriving = firstProjectNote({ roots: async () => [dir], writable: async () => { await writeFile(path, "Other creator"); } });
    expect(await arriving()).toBeUndefined();
    expect(await create()).toBeUndefined();
    expect(await readFile(path, "utf8")).toBe("Other creator");
  });

  it("does not certify content arriving between the final scan and exclusive creation", async () => {
    const dir = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const actualOpen = vi.mocked(open).getMockImplementation()!;
    vi.mocked(open).mockImplementationOnce(async (...args: Parameters<typeof open>) => {
      await writeFile(join(dir, "unrelated.md"), "Keep this");
      return actualOpen(...args);
    });
    await expect(create()).rejects.toThrow("gained other content");
    expect(await create()).toBeUndefined();
    expect((await readdir(dir)).sort()).toEqual(["Untitled.md", "unrelated.md"]);
    expect(await readFile(join(dir, "unrelated.md"), "utf8")).toBe("Keep this");
    expect(await readFile(join(dir, "Untitled.md"), "utf8")).toBe("");
  });

  it.each([
    { allowNonempty: false, occupied: false },
    { allowNonempty: true, occupied: false },
    { allowNonempty: true, occupied: true },
  ])("preserves a closed creation when the admission transaction fails before certification (%j)", async ({ allowNonempty, occupied }) => {
    const dir = await root();
    if (occupied) await writeFile(join(dir, "Untitled.md"), "# Existing content\n");
    const path = join(dir, occupied ? "Untitled 2.md" : "Untitled.md");
    const create = helper({
      roots: async () => [dir], writable: async () => {}, allowNonempty,
      admit: (roots, work) => metadata.firstNoteAdmission(roots, async (proof, certify) => {
        await work(proof, certify);
        throw new Error("crash before commit");
      }),
    });
    await expect(create()).rejects.toThrow("crash before commit");
    const retry = firstProjectNote({ roots: async () => [dir], writable: async () => {}, allowNonempty });
    expect(await retry()).toBe(allowNonempty ? path : undefined);
    expect((await readdir(dir)).sort()).toEqual(occupied ? ["Untitled 2.md", "Untitled.md"] : ["Untitled.md"]);
    expect(await readFile(path, "utf8")).toBe("");
    if (occupied) expect(await readFile(join(dir, "Untitled.md"), "utf8")).toBe("# Existing content\n");
  });

  it("rejects a certified note redirected through a junction or a replaced trusted root", async () => {
    const dir = await root();
    const outside = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const path = (await create())!;
    await rename(dir, `${dir}-old`);
    dirs.push(`${dir}-old`);
    await mkdir(dir);
    await expect(create()).rejects.toThrow("project root changed");
    await rmdir(dir);
    await rename(`${dir}-old`, dir);
    await rm(path);
    await writeFile(join(outside, "other.md"), "Private unchanged");
    await symlink(join(outside, "other.md"), path, "file");
    await expect(create()).rejects.toThrow("redirected");
    expect(await readFile(join(outside, "other.md"), "utf8")).toBe("Private unchanged");
  });
});

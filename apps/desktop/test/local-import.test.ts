import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { localImportCopies } from "../src/main/local-import.ts";

const faults = vi.hoisted(() => ({ link: false, write: false }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    link: async (...args: Parameters<typeof fs.link>) => {
      if (faults.link) throw Object.assign(new Error("refused"), { code: "EACCES" });
      return fs.link(...args);
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      if (faults.write) {
        handle.writeFile = async () => {
          await handle.write("partial");
          throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        };
      }
      return handle;
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  faults.link = false; faults.write = false;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-local-copy-"));
  roots.push(root);
  return { root, copy: localImportCopies() };
}

it("returns the completed receipt after a lost reply and concurrent Retry, without a second copy", async () => {
  const { root, copy } = await setup();
  const first = copy("request", "source", root, "Draft", "# Exact note\n");
  expect(copy("request", "source", root, "Draft", "# New text\n")).toBe(first);
  const target = await first;
  expect(await copy("request", "source", root, "Draft", "# New text\n")).toBe(target);
  expect(await readFile(target, "utf8")).toBe("# Exact note\n");
  expect(await readdir(root)).toEqual(["Draft.md"]);
  expect(() => copy("request", "source", `${root}-different`, "Draft", "")).toThrow("changed");
});

it("keeps collisions byte-exact and permits a deliberately new copy with a different receipt", async () => {
  const { root, copy } = await setup();
  await writeFile(join(root, "Draft.md"), "existing");
  const copied = await copy("first", "source", root, "Draft", "new");
  expect(copied).toBe(join(root, "Draft 2.md"));
  expect(await readFile(join(root, "Draft.md"), "utf8")).toBe("existing");
  expect(await copy("second", "source", root, "Draft", "another")).toBe(join(root, "Draft 3.md"));
});

it.each(["write", "link"] as const)("never publishes a partial note after a %s refusal, then retries once", async (fault) => {
  const { root, copy } = await setup();
  faults[fault] = true;
  await expect(copy("request", "source", root, "Draft", "whole note")).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  faults[fault] = false;
  const target = await copy("request", "source", root, "Draft", "whole note");
  expect(await readFile(target, "utf8")).toBe("whole note");
  expect(await readdir(root)).toEqual(["Draft.md"]);
});

it("retries a destination that was unavailable before staging without leaving a receipt", async () => {
  const { root, copy } = await setup();
  const destination = join(root, "notes");
  await expect(copy("request", "source", destination, "Draft", "whole")).rejects.toThrow();
  await mkdir(destination);
  expect(await copy("request", "source", destination, "Draft", "whole")).toBe(join(destination, "Draft.md"));
});

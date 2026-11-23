import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { leakCheck, LeakError } from "../src/publish.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

async function artifact(file: string, value: unknown = { data: "opaque", salt: "opaque", iv: "opaque" }) {
  const root = await mkdtemp(join(tmpdir(), "fn-identifiers-"));
  dirs.push(root);
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), JSON.stringify(value));
  return root;
}

describe("public identifier provenance (SHR-23)", () => {
  it.each(["Todo", "É", encodeURIComponent("É"), "E\u0301"])("rejects a short or encoded private filename: %s", async (name) => {
    const file = `_sealed/random/${name}.json`;
    const root = await artifact(file);
    expect(await leakCheck(root, [{ path: name === "Todo" ? "Todo.md" : "É.md", text: "" }]))
      .toEqual([{ file, kind: "path" }]);
  });

  it("rejects deterministic hashes of a private title used as opaque filenames", async () => {
    const title = "Private project title";
    const hash = createHash("sha256").update(title).digest("hex").slice(0, 16);
    const file = `_access/random/l/s${hash}.json`;
    const root = await artifact(file);
    expect(await leakCheck(root, [], [], [title])).toEqual([{ file, kind: "name" }]);
  });

  it("checks short private identifiers in metadata, but never searches ciphertext for accidental matches", async () => {
    const file = "_access/random/c/ABCDEFGH.json";
    const root = await artifact(file, { ref: "e\u0301", data: "É", salt: "É", iv: "É" });
    expect(await leakCheck(root, [], [], ["É"])).toEqual([{ file, kind: "name" }]);
    await writeFile(join(root, file), JSON.stringify({ ref: "ABCDEFGH", data: "É", salt: "É", iv: "É" }));
    expect(await leakCheck(root, [], [], ["É"])).toEqual([]);
  });

  it("does not reveal a private filename in an error that can reach logs", () => {
    const error = new LeakError([{ file: "_sealed/Private project title.json", kind: "path" }]);
    expect(error.message).not.toContain("Private project title");
    expect(error.message).toContain("1 place");
  });

  it("does not mistake fixed code/link/vault routing words for source-derived identifiers", async () => {
    for (const file of ["_access/random/l/sabcdefghijklmnop.json", "_access/random/c/ABCDEFGH.json", "_access/random/vault.json"]) {
      const root = await artifact(file);
      expect(await leakCheck(root, [{ path: "l.md", text: "" }, { path: "c.md", text: "" }, { path: "vault.md", text: "" }])).toEqual([]);
    }
  });
});

/**
 * DEF-24 (D-92, FIL-12): the main process writes a note only if the file still holds the text the
 * window expects there; another program's change since is never written over, and the window gets
 * the text found.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeUnlessChanged } from "../src/main/note-write.ts";

const dir = () => mkdtempSync(join(tmpdir(), "fn-def24-"));
const write = (p: string, c: string) => writeFile(p, c, "utf8");

describe("writeUnlessChanged", () => {
  it("writes when the file holds what the window expects", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nFirst.\n");
    expect(await writeUnlessChanged(p, "# A\n\nFirst. Typed.\n", "# A\n\nFirst.\n", write)).toBeUndefined();
    expect(readFileSync(p, "utf8")).toBe("# A\n\nFirst. Typed.\n");
  });

  it("writes nothing over another program's change, and returns what it found", async () => {
    const p = join(dir(), "a.md");
    writeFileSync(p, "# A\n\nChanged by another program.\n");
    let writes = 0;
    const r = await writeUnlessChanged(p, "# A\n\nFirst. Typed.\n", "# A\n\nFirst.\n", async (...a) => { writes++; await write(...a); });
    expect(r).toEqual({ outside: "# A\n\nChanged by another program.\n" });
    expect(writes).toBe(0);
    expect(readFileSync(p, "utf8")).toBe("# A\n\nChanged by another program.\n");
  });

  it("a file already holding the text being saved, a missing file, and no expectation are written", async () => {
    const d = dir();
    const same = join(d, "same.md");
    writeFileSync(same, "# Same\n");
    expect(await writeUnlessChanged(same, "# Same\n", "# Older\n", write)).toBeUndefined();
    const gone = join(d, "gone.md");
    expect(await writeUnlessChanged(gone, "# Back\n", "# Was\n", write)).toBeUndefined();
    expect(readFileSync(gone, "utf8")).toBe("# Back\n");
    const any = join(d, "any.md");
    writeFileSync(any, "# Whatever\n");
    expect(await writeUnlessChanged(any, "", undefined, write)).toBeUndefined();
    expect(readFileSync(any, "utf8")).toBe("");
  });
});

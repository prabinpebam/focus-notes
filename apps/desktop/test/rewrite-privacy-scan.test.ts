import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localGit, scanRepository } from "../e2e/rewrite-privacy-local-git.ts";

it("detects packed unreachable payloads, ref names, commit metadata and logs (positive controls)", async () => {
  const root = await mkdtemp(join(tmpdir(), "rewrite-scan-"));
  try {
    await localGit(root, ["init", "--bare", "--quiet", "--template="]);
    const blob = (await localGit(root, ["hash-object", "-w", "--stdin"], "SYNTH_PRIVATE_UNREACHABLE")).trim();
    const tree = (await localGit(root, ["mktree"], `100644 blob ${blob}\tpayload\n`)).trim();
    const commit = (await localGit(root, ["commit-tree", tree], "SYNTH_PROMPT_METADATA\n")).trim();
    await localGit(root, ["update-ref", "refs/heads/SYNTH_KEY_REF", commit]);
    await localGit(root, ["repack", "-ad"]);
    await localGit(root, ["update-ref", "-d", "refs/heads/SYNTH_KEY_REF"]);
    await mkdir(join(root, "logs"), { recursive: true });
    await writeFile(join(root, "logs", "synthetic"), "SYNTH_KEY_LOG");
    const scan = await scanRepository(root, ["SYNTH_PRIVATE_UNREACHABLE", "SYNTH_PROMPT_METADATA", "SYNTH_KEY_LOG"]);
    expect(scan.unreachableCount).toBeGreaterThan(0);
    expect(scan.hits.map((h) => h.sentinel).sort()).toEqual(
      ["SYNTH_KEY_LOG", "SYNTH_PRIVATE_UNREACHABLE", "SYNTH_PROMPT_METADATA"]);
    await localGit(root, ["update-ref", "refs/heads/SYNTH_KEY_REF", commit]);
    expect((await scanRepository(root, ["SYNTH_KEY_REF"])).hits).not.toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 60_000);

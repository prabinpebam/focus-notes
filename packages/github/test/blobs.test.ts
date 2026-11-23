/**
 * Git Data blobs carry any bytes (WP-9.9): published images and other binary artifacts must reach
 * GitHub exactly, text keeps its UTF-8 bytes, and an oversized file is refused before any request.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { BlobTooLargeError, GitHubApi, GitHubError, MAX_BLOB_BYTES, base64ToBytes } from "../src/index.ts";
import { FakeGitHub } from "./fake-github.ts";

const gitSha = (bytes: Uint8Array) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
// A PNG signature, then bytes that are not valid UTF-8 (a lone continuation, an overlong lead, 0xFF) and NULs.
const binary = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x80, 0xc3, 0x28, 0xff, 0xfe, 0x00, 0x00, 0xed, 0xa0, 0x80]);

function setup() {
  const gh = new FakeGitHub();
  const repo = gh.add({ owner: "ada", name: "site" });
  return { gh, repo, api: new GitHubApi(gh.token, gh.fetch) };
}

describe("WP-9.9: binary blobs", () => {
  it("round-trips non-UTF-8 bytes exactly, sent as base64, under Git's own object ID", async () => {
    const { gh, repo, api } = setup();
    const sha = await api.createBlob("ada", "site", binary);
    expect(sha).toBe(gitSha(binary));
    const sent = gh.calls.find(call => call.method === "POST" && call.path === "/repos/ada/site/git/blobs")!.body as { content: string; encoding: string };
    expect(sent.encoding).toBe("base64");
    expect(base64ToBytes(sent.content)).toEqual(binary);
    expect(repo.blobs.get(sha)).toEqual(binary);
    expect(await api.blobBytes("ada", "site", sha)).toEqual(binary);
  });

  it("keeps text's UTF-8 bytes, so a text blob reads back unchanged", async () => {
    const { repo, api } = setup();
    const text = "Héllo ✓ — 𝄞\n";
    const sha = await api.createBlob("ada", "site", text);
    const bytes = new TextEncoder().encode(text);
    expect(sha).toBe(gitSha(bytes));
    expect(repo.blobs.get(sha)).toEqual(bytes);
    expect(await api.blob("ada", "site", sha)).toBe(text);
    expect(await api.blobBytes("ada", "site", sha)).toEqual(bytes);
  });

  it("refuses a file over GitHub's blob limit with a plain error and sends nothing", async () => {
    const { gh, api } = setup();
    const error = await api.createBlob("ada", "site", new Uint8Array(MAX_BLOB_BYTES + 1)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BlobTooLargeError);
    expect((error as Error).message).toBe("This file is too large to publish. GitHub takes files up to 100 MB.");
    expect(gh.calls.filter(call => call.path.endsWith("/git/blobs"))).toHaveLength(0);
  });

  it("says why GitHub refused, without storing anything", async () => {
    const { gh, repo, api } = setup();
    gh.offline = true;
    await expect(api.createBlob("ada", "site", binary)).rejects.toMatchObject({ status: 0 });
    gh.offline = false;
    await expect(new GitHubApi("wrong", gh.fetch).createBlob("ada", "site", binary)).rejects.toSatisfy((e: unknown) => e instanceof GitHubError && e.unauthorized);
    gh.fail("POST /repos/ada/site/git/blobs", 422, "Unprocessable");
    await expect(api.createBlob("ada", "site", binary)).rejects.toMatchObject({ status: 422 });
    await expect(api.createBlob("ada", "missing", binary)).rejects.toMatchObject({ status: 404 });
    repo.canPush = false;
    await expect(api.createBlob("ada", "site", binary)).rejects.toMatchObject({ status: 403 });
    expect(repo.blobs.size).toBe(0);
    await expect(api.blobBytes("ada", "site", gitSha(binary))).rejects.toMatchObject({ status: 404 });
  });
});

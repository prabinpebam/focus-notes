/**
 * The setup's REST calls and the Actions secret's sealed box (FRE-08), against the in-memory fake:
 * no request leaves the process.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { blake2b } from "@noble/hashes/blake2.js";
import { GitHubApi, GitHubError, sealSecret, sealedBox, base64ToBytes, bytesToBase64 } from "../src/index.ts";
import { FakeGitHub } from "./fake-github.ts";

describe("FRE-08: the Actions secret is sealed to the repository's public key", () => {
  it("opens only with the repository's private key, and differs every time (an ephemeral key each)", async () => {
    const gh = new FakeGitHub();
    const repo = gh.add({ owner: "ada", name: "notes" });
    const api = new GitHubApi(gh.token, gh.fetch);
    const value = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n";
    const pk = await api.actionsPublicKey("ada", "notes");
    const a = sealSecret(pk, value);
    const b = sealSecret(pk, value);
    expect(a.encryptedValue).not.toBe(b.encryptedValue);
    expect(a.encryptedValue).not.toContain("OPENSSH");
    await api.setActionsSecret("ada", "notes", "PRIVATE_CONTENT_KEY", a);
    expect(gh.openSecret(repo, "PRIVATE_CONTENT_KEY")).toBe(value);
    // Another repository's key can't open it.
    const other = gh.add({ owner: "ada", name: "other" });
    other.secrets.set("X", repo.secrets.get("PRIVATE_CONTENT_KEY")!);
    expect(gh.openSecret(other, "X")).toBeUndefined();
  });

  it("is 32 bytes of ephemeral key, then the message plus a 16-byte tag", () => {
    const recipient = new Uint8Array(32).fill(7);
    expect(sealedBox(new Uint8Array(10), recipient)).toHaveLength(32 + 10 + 16);
    expect(() => sealedBox(new Uint8Array(1), new Uint8Array(31))).toThrow();
  });

  it("uses real BLAKE2b (the same function Node knows as blake2b512)", () => {
    const data = new TextEncoder().encode("focus notes");
    expect(bytesToBase64(blake2b(data))).toBe(createHash("blake2b512").update(data).digest("base64"));
    expect(base64ToBytes(bytesToBase64(new Uint8Array([0, 255, 128])))).toEqual(new Uint8Array([0, 255, 128]));
  });
});

describe("FRE-08: the setup's REST calls", () => {
  it("finds or misses repositories, files, and Pages without throwing on 404", async () => {
    const gh = new FakeGitHub();
    gh.add({ owner: "ada", name: "notes", files: [".focus-notes/workspace.json"] });
    const api = new GitHubApi(gh.token, gh.fetch);
    expect(await api.findRepo("ada", "missing")).toBeUndefined();
    expect((await api.findRepo("ada", "notes"))?.canPush).toBe(true);
    expect(await api.hasFile("ada", "notes", ".focus-notes/workspace.json")).toBe(true);
    expect(await api.hasFile("ada", "notes", "nope.md")).toBe(false);
    expect(await api.pages("ada", "notes")).toBeUndefined();
    await api.usePagesWorkflow("ada", "notes", false);
    expect(await api.pages("ada", "notes")).toEqual({ buildType: "workflow", url: "https://ada.github.io/notes/" });
  });

  it("adds deploy keys read-only, and says why a call failed", async () => {
    const gh = new FakeGitHub();
    const repo = gh.add({ owner: "ada", name: "p", private: true });
    const api = new GitHubApi(gh.token, gh.fetch);
    await api.addDeployKey("ada", "p", "Focus Notes publishing", "ssh-ed25519 AAAA");
    expect(repo.keys).toEqual([expect.objectContaining({ title: "Focus Notes publishing", read_only: true })]);
    const [key] = await api.deployKeys("ada", "p");
    await api.deleteDeployKey("ada", "p", key!.id);
    expect(repo.keys).toEqual([]);
    gh.offline = true;
    await expect(api.user()).rejects.toMatchObject({ status: 0 });
    gh.offline = false;
    await expect(new GitHubApi("wrong", gh.fetch).user()).rejects.toSatisfy((e: unknown) => e instanceof GitHubError && e.unauthorized);
  });
});

import { describe, expect, it, vi } from "vitest";
import { waitForPublishedShare } from "../src/main/share/publication.ts";
import { SiteReader, type Grant } from "@focus-notes/seal";
import { authorizationRevision } from "@focus-notes/seal/grants";
import { applyAccessChange } from "@focus-notes/seal/access";
import { publish as publishSite } from "@focus-notes/seal/publish";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const grant: Grant = {
  id: "sshare001", name: "", shareCode: "K7QM4DRP",
  salt: "AAAAAAAAAAAAAAAAAAAAAA", link: { secret: "fixture" }, scope: { notes: ["one.md"] },
  createdAt: "2026-11-03T00:00:00Z",
};
describe("publication readiness (SHR-16, MP.6/19)", () => {
  it("requires the exact authenticated membership revision even when old and new scopes have equal counts", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-share-revision-"));
    try {
      const priv = join(root, "private"), site = join(root, "site");
      await mkdir(join(priv, "notes", "drafts"), { recursive: true });
      for (const id of ["one", "two"]) await writeFile(join(priv, "notes", "drafts", `${id}.md`), `---\nid: ${id}\n---\n# ${id}\n`);
      const a = applyAccessChange({ version: 1, grants: [] }, {
        op: "createItem", item: { path: "drafts", label: "Drafts", folder: true, includeLater: false },
        notes: ["drafts/one.md"], link: true, expiresAt: null,
      }, new Date(), { resolvedItemNotes: { notes: ["drafts/one.md"], ids: ["one"] } }).access;
      await writeFile(join(priv, "access.json"), JSON.stringify(a));
      await publishSite({ private: priv, site, owner: "fixture" });
      const next = { ...a.grants[0]!, scope: { ids: ["two"], notes: [], folders: [] } };
      const notes = [{ path: "drafts/one.md", id: "one" }, { path: "drafts/two.md", id: "two" }];
      const get = (p: string) => readFile(join(site, ...p.split("/")), "utf8").catch(() => undefined);
      await expect(waitForPublishedShare({
        grant: next, authorization: await authorizationRevision(next, notes), publish: async () => {}, get,
        signal: new AbortController().signal, timeoutMs: 100, delayMs: 1,
      })).rejects.toThrow("access:notReady");
      await expect(waitForPublishedShare({
        grant: a.grants[0]!, authorization: await authorizationRevision(a.grants[0]!, notes), publish: async () => {}, get,
        signal: new AbortController().signal, timeoutMs: 1000, delayMs: 1,
      })).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("does not report ready when the second required ciphertext is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-share-ciphertext-"));
    try {
      const priv = join(root, "private"), site = join(root, "site");
      await mkdir(join(priv, "notes", "drafts"), { recursive: true });
      const notes = ["one", "two"].map((id) => ({ path: `drafts/${id}.md`, id }));
      for (const n of notes) await writeFile(join(priv, "notes", ...n.path.split("/")), `---\nid: ${n.id}\n---\n# ${n.id}\n`);
      const a = applyAccessChange({ version: 1, grants: [] }, {
        op: "createItem", item: { path: "drafts", label: "Drafts", folder: true, includeLater: false },
        notes: notes.map((n) => n.path), link: true, expiresAt: null,
      }, new Date(), { resolvedItemNotes: { notes: notes.map((n) => n.path), ids: notes.map((n) => n.id) } }).access;
      await writeFile(join(priv, "access.json"), JSON.stringify(a));
      await publishSite({ private: priv, site, owner: "fixture" });
      let lastPath = "";
      const fetchFile = (p: string) => readFile(join(site, ...p.split("/")), "utf8").catch(() => undefined);
      const reader = new SiteReader(async (p) => { lastPath = p; return fetchFile(p); });
      const opened = await reader.openLinkSession(a.grants[0]!.id, a.grants[0]!.link!.secret);
      await opened.share.read(opened.share.notes[1]!.path);
      const missing = lastPath;
      let blockedReads = 0;
      const get = async (p: string) => {
        if (p === missing) { blockedReads++; return undefined; }
        return fetchFile(p);
      };
      await expect(waitForPublishedShare({
        grant: a.grants[0]!, authorization: await authorizationRevision(a.grants[0]!, notes),
        publish: async () => {}, get, signal: new AbortController().signal, timeoutMs: 100, delayMs: 1,
      })).rejects.toThrow("access:notReady");
      expect(blockedReads).toBeGreaterThan(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("does not report ready on a successful push when the site still has no share", async () => {
    const publish = vi.fn(async () => {});
    await expect(waitForPublishedShare({
      grant, publish, get: async () => undefined, signal: new AbortController().signal,
      timeoutMs: 1, delayMs: 1,
    })).rejects.toThrow("access:notReady");
    expect(publish).toHaveBeenCalledOnce();
  });
  it("surfaces sync failure immediately and never falls back to copied output", async () => {
    const get = vi.fn(async () => undefined);
    await expect(waitForPublishedShare({
      grant, publish: async () => { throw new Error("access:offline"); }, get,
      signal: new AbortController().signal,
    })).rejects.toThrow("access:offline");
    expect(get).not.toHaveBeenCalled();
  });
  it("cancellation stops polling and does not claim success", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitForPublishedShare({
      grant, publish: async () => {}, get: async () => undefined, signal: controller.signal,
    })).rejects.toThrow("access:cancelled");
  });
});

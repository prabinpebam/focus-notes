/** D-436: the share page never acts on a stale site manifest from the Pages CDN. */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { randomBytes, SiteReader, toB64url } from "@focus-notes/seal";
import { publish } from "@focus-notes/seal/publish";
import { siteFetch } from "../src/share/site-fetch.ts";

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

const SITE = new URL("https://octo.github.io/notes/");

describe("share page site reads (D-436)", () => {
  it("re-reads a stale manifest uncached and opens the note from the new build", async () => {
    const root = await mkdtemp(join(tmpdir(), "fn-share-cdn-"));
    dirs.push(root);
    const secret = toB64url(randomBytes(32));
    await mkdir(join(root, "private", "notes"), { recursive: true });
    await writeFile(join(root, "private", "notes", "Plan.md"), "---\nid: n-plan\n---\n# The plan\n\nLaunch quietly on a Tuesday.\n");
    await writeFile(join(root, "private", "access.json"), JSON.stringify({
      version: 1, nameSalt: "c2FsdHNhbHRzYWx0c2FsdA",
      grants: [{ id: "gshare001", name: "Sam Lee", salt: toB64url(randomBytes(16)), scope: { notes: ["n-plan"] }, createdAt: "2026-10-01T00:00:00Z", link: { secret } }],
    }));
    const site = join(root, "site");
    const deploy = async () => {
      await rm(site, { recursive: true, force: true });
      await mkdir(site, { recursive: true });
      await publish({ site, private: join(root, "private"), owner: "octo" });
      return readFile(join(site, "focus-notes.json"), "utf8");
    };
    // The CDN still holds the old build's manifest; the origin now has a new build and the old files are gone.
    const stale = await deploy();
    const fresh = await deploy();
    expect(JSON.parse(fresh).build).not.toBe(JSON.parse(stale).build);

    // The edge lags once, and serves its cached copy to anything that may be answered from a cache.
    const manifestRequests: { url: URL; cache: RequestCache | undefined }[] = [];
    const cdn = (async (input: URL, init?: RequestInit) => {
      const url = new URL(input);
      const path = decodeURIComponent(url.pathname.slice(SITE.pathname.length));
      if (path === "focus-notes.json") {
        const seen = manifestRequests.some((r) => r.url.search === url.search);
        manifestRequests.push({ url, cache: init?.cache });
        const cached = manifestRequests.length === 1 || seen || init?.cache !== "no-store" || !url.search;
        return new Response(cached ? stale : fresh);
      }
      const text = await readFile(join(site, ...path.split("/")), "utf8").catch(() => undefined);
      return text === undefined ? new Response("", { status: 404 }) : new Response(text);
    }) as typeof fetch;

    const opened = await new SiteReader(siteFetch(SITE, cdn)).openLinkSession("gshare001", secret);
    expect(await opened.share.read("Plan.md")).toContain("Launch quietly");

    expect(manifestRequests.length).toBe(2);
    for (const r of manifestRequests) {
      expect(r.cache).toBe("no-store");
      expect(r.url.searchParams.get("t")).toBeTruthy();
    }
    expect(new Set(manifestRequests.map((r) => r.url.search)).size).toBe(manifestRequests.length);
  }, 60_000);

  it("reads build files without the cache-buster, and never with cookies or redirects", async () => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const get = siteFetch(SITE, (async (url: URL, init?: RequestInit) => { calls.push({ url: new URL(url), init }); return new Response("x"); }) as typeof fetch);
    await get("_access/b1/l/gshare001.json");
    await get("focus-notes.json");
    expect(calls[0]!.url.href).toBe("https://octo.github.io/notes/_access/b1/l/gshare001.json");
    expect(calls[0]!.init).toEqual({ cache: "no-cache", credentials: "omit", redirect: "error" });
    expect(calls[1]!.init).toEqual({ cache: "no-store", credentials: "omit", redirect: "error" });
  });
});

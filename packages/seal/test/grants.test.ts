/**
 * Share sealing (WP-5.2, SHR-11, D-41, D-90): share grants sealed with the vault's format, fresh every
 * build, keyrings only for active grants, passcode keyrings found by a salted name lookup, and the
 * leak check covering grant secrets.
 */
import { createHash, hkdfSync, pbkdf2Sync } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  derivePasscodeBits, ITERATIONS, parseKeyring, parseSiteManifest, randomBytes, SealError, SiteReader, toB64url, vaultPath,
} from "../src/index.ts";
import {
  activeShareGrants, deriveLinkBits, inScope, isActive, LINK_INFO, linkKeyringPath, nameLookup, normalizeName, noteId, passcodeKeyringPath, scopedPaths,
  type Grant,
} from "../src/grants.ts";
import { leakCheck, LeakError, publish } from "../src/publish.ts";

const PASS = "correct horse battery staple";
const NOW = Date.parse("2026-10-15T00:00:00Z");
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

const salt = () => toB64url(randomBytes(16));
const grant = (over: Partial<Grant>): Grant => ({ id: "gshare001", name: "Sam", salt: salt(), scope: {}, createdAt: "2026-10-01T00:00:00Z", ...over });

async function instance(privateNotes: Record<string, string>, shares: Grant[], opts: { vault?: boolean; nameSalt?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "fn-share-"));
  dirs.push(root);
  for (const [p, t] of Object.entries(privateNotes)) {
    await mkdir(join(root, "private", "notes", ...p.split("/").slice(0, -1)), { recursive: true });
    await writeFile(join(root, "private", "notes", ...p.split("/")), t);
  }
  const grants: Grant[] = [...shares];
  if (opts.vault) {
    const s = randomBytes(16);
    grants.unshift({ id: "gowner001", name: "You", owner: true, salt: toB64url(s), passcodeKey: toB64url(await derivePasscodeBits(PASS, s)), scope: { all: true }, createdAt: "2026-10-01T00:00:00Z" });
  }
  await writeFile(join(root, "private", "access.json"), JSON.stringify({ version: 1, ...(opts.nameSalt ? { nameSalt: opts.nameSalt } : {}), grants }));
  await mkdir(join(root, "site"), { recursive: true });
  await writeFile(join(root, "site", "index.html"), "<!doctype html><title>Focus Notes</title>");
  const reader = () => new SiteReader(async (p) => readFile(join(root, "site", ...p.split("/").map(decodeURIComponent)), "utf8").catch(() => undefined));
  const run = () => publish({ site: join(root, "site"), private: join(root, "private"), owner: "octo" });
  return { root, site: join(root, "site"), reader, run };
}

describe("grants: which are active and what they open", () => {
  it("SHR-11: keyrings only for active grants: not withdrawn, not expired, not the owner's", () => {
    const g = grant({ link: { secret: toB64url(randomBytes(32)) } });
    expect(isActive(g, NOW)).toBe(true);
    expect(isActive({ ...g, revokedAt: "2026-10-10T00:00:00Z" }, NOW)).toBe(false);
    expect(isActive({ ...g, expiresAt: "2026-10-14T23:59:59Z" }, NOW)).toBe(false);
    expect(isActive({ ...g, expiresAt: "2026-10-16T00:00:00Z" }, NOW)).toBe(true);
    const owner = grant({ id: "gowner001", owner: true, passcodeKey: toB64url(randomBytes(32)), scope: { all: true } });
    const nothing = grant({ id: "gnothing1" });
    expect(activeShareGrants({ version: 1, grants: [owner, g, nothing, { ...g, id: "gold00001", revokedAt: "2026-10-01T00:00:00Z" }] }, NOW).map((x) => x.id)).toEqual(["gshare001"]);
  });

  it("scopes by note id or path, and by folder prefix including notes added later", () => {
    const scope = { notes: ["n-123", "Ideas/One.md"], folders: ["Projects/drafts/"] };
    expect(inScope(scope, { path: "Elsewhere.md", id: "n-123" })).toBe(true);
    expect(inScope(scope, { path: "Ideas/One.md" })).toBe(true);
    expect(inScope(scope, { path: "Ideas/Two.md" })).toBe(false);
    expect(inScope(scope, { path: "Projects/drafts/new/Later.md" })).toBe(true);
    expect(inScope(scope, { path: "Projects/drafts-old/x.md" })).toBe(false);
    expect(inScope({ folders: ["Projects/drafts"] }, { path: "Projects/drafts/a.md" })).toBe(true);
    expect(inScope({ all: true }, { path: "Any.md" })).toBe(true);
    expect(inScope({}, { path: "Any.md" })).toBe(false);
  });

  it("reads a note's id from its front matter", () => {
    expect(noteId("---\nid: n-123\ntags: [a]\n---\n# T\n")).toBe("n-123");
    expect(noteId("---\r\nid: \"quoted-id\"\r\n---\r\nBody")).toBe("quoted-id");
    expect(noteId("# No front matter\nid: not-this\n")).toBeUndefined();
  });

  it("shows paths relative to the shared scope, never the owner's folders above it", () => {
    const m = scopedPaths({ notes: ["Personal/Letters/To Sam.md"], folders: ["Work/Projects/drafts/"] }, ["Personal/Letters/To Sam.md", "Work/Projects/drafts/Plan.md", "Work/Projects/drafts/sub/Plan.md"]);
    expect([...m.entries()]).toEqual([
      ["Personal/Letters/To Sam.md", "To Sam.md"],
      ["Work/Projects/drafts/Plan.md", "drafts/Plan.md"],
      ["Work/Projects/drafts/sub/Plan.md", "drafts/sub/Plan.md"],
    ]);
    // Two shared notes with the same file name stay apart.
    const twins = scopedPaths({ notes: ["A/Note.md", "B/Note.md"] }, ["A/Note.md", "B/Note.md"]);
    expect(new Set(twins.values()).size).toBe(2);
    expect([...twins.values()]).toEqual(["Note.md", "Note (2).md"]);
    // The vault's scope keeps whole paths.
    expect(scopedPaths({ all: true }, ["A/B.md"]).get("A/B.md")).toBe("A/B.md");
  });
});

describe("test vectors, cross-checked with node:crypto", () => {
  it("SHR-11: the name lookup is the first 16 bytes of SHA-256 over the salted, normalized name, as 32 hex characters", async () => {
    const nameSalt = "c2FsdHNhbHRzYWx0c2FsdA";
    expect(normalizeName("  ＳＡＭ Smith ")).toBe("sam smith");
    expect(normalizeName("Straße")).toBe(normalizeName("STRASSE"));
    const expected = createHash("sha256").update(`focus-notes/name/v1|${nameSalt}|sam smith`, "utf8").digest("hex").slice(0, 32);
    expect(await nameLookup(nameSalt, "Sam Smith")).toBe(expected);
    expect(await nameLookup(nameSalt, " sam SMITH ")).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
    expect(await nameLookup("b3RoZXJzYWx0b3RoZXJzYQ", "Sam Smith")).not.toBe(expected);
  });

  it("derives link keys with HKDF-SHA256 over the secret, the grant's salt, and focus-notes/grant/v1", async () => {
    const secret = randomBytes(32), s = randomBytes(16);
    const ours = await deriveLinkBits(secret, s);
    const node = new Uint8Array(hkdfSync("sha256", secret, s, LINK_INFO, 32));
    expect(LINK_INFO).toBe("focus-notes/grant/v1");
    expect(toB64url(ours)).toBe(toB64url(node));
  });

  it("derives passcode keys with PBKDF2-SHA256 at 600,000 iterations", async () => {
    const s = randomBytes(16);
    const ours = await derivePasscodeBits("  four eff words here ", s);
    const node = new Uint8Array(pbkdf2Sync("four eff words here", s, ITERATIONS, 32, "sha256"));
    expect(toB64url(ours)).toBe(toB64url(node));
  }, 20_000);
});

describe("sealing share grants (SHR-11)", () => {
  const notes = {
    "Work/drafts/Plan.md": "---\nid: n-plan\n---\n# The plan\n\nThe plan is to launch quietly on a Tuesday morning.\n",
    "Work/drafts/sub/Detail.md": "# Detail\n\nThe detail nobody outside the team should read yet.\n",
    "Diary.md": "---\nid: n-diary\n---\n# Diary\n\nA diary line that only the owner may ever read.\n",
  };

  it("SHR-11: a magic link opens exactly its scope, with scoped paths, and nothing else", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance(notes, [grant({ link: { secret }, scope: { folders: ["Work/drafts/"] } })], { vault: true });
    const r = await i.run();
    expect(r).toMatchObject({ vault: true, shares: 1 });
    const share = await i.reader().openLink("gshare001", secret);
    expect(share.notes.map((n) => [n.path, n.title]).sort()).toEqual([["drafts/Plan.md", "The plan"], ["drafts/sub/Detail.md", "Detail"]]);
    expect(await share.read("drafts/Plan.md")).toContain("launch quietly");
    await expect(share.read("Diary.md")).rejects.toThrow();
    // The vault still opens everything, from the same sealed notes.
    const { vault } = await i.reader().unlock(PASS);
    expect(vault.notes.map((n) => n.path).sort()).toEqual(["Diary.md", "Work/drafts/Plan.md", "Work/drafts/sub/Detail.md"]);
  }, 30_000);

  it("SHR-11: each note is sealed once per build and shared by every manifest that lists it", async () => {
    const i = await instance(notes, [
      grant({ link: { secret: toB64url(randomBytes(32)) }, scope: { notes: ["n-plan"] } }),
      grant({ id: "gshare002", name: "Kim", link: { secret: toB64url(randomBytes(32)) }, scope: { folders: ["Work/"] } }),
    ], { vault: true });
    const r = await i.run();
    // Three notes, three manifests (the vault and two shares), each a file under _sealed/<build>/.
    expect((await readdir(join(i.site, "_sealed", r.build))).length).toBe(6);
  }, 30_000);

  it("SHR-11: only notes some active grant opens are sealed", async () => {
    const i = await instance(notes, [grant({ link: { secret: toB64url(randomBytes(32)) }, scope: { notes: ["n-diary"] } })]);
    const r = await i.run();
    expect(r).toMatchObject({ vault: false, shares: 1 });
    expect((await readdir(join(i.site, "_sealed", r.build))).length).toBe(2);
  }, 30_000);

  it("SHR-10, SHR-11: a name and passcode open a passcode keyring found by the salted name lookup", async () => {
    const nameSalt = salt();
    const i = await instance(notes, [grant({ name: "Sam Smith", passcode: { value: "orbit maple quiet river", generated: true }, scope: { notes: ["n-diary"] } })], { nameSalt });
    const r = await i.run();
    const site = parseSiteManifest(await readFile(join(i.site, "focus-notes.json"), "utf8"));
    expect(site.nameSalt).toBe(nameSalt);
    const lookup = await nameLookup(nameSalt, "Sam Smith");
    expect(parseKeyring(await readFile(join(i.site, ...passcodeKeyringPath(r.build, lookup).split("/")), "utf8")).kdf).toBe("pbkdf2-sha256");
    const { share, salt: s } = await i.reader().openPasscode("  sam smith", "orbit maple quiet river");
    expect(share.notes.map((n) => n.path)).toEqual(["Diary.md"]);
    expect(s).toMatch(/^[A-Za-z0-9_-]{22}$/);
  }, 30_000);

  it("SHR-06, SHR-10: wrong names, passcodes, links, and withdrawn or expired grants fail with one generic error", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance(notes, [
      grant({ name: "Sam", link: { secret }, passcode: { value: "orbit maple quiet river" }, scope: { notes: ["n-diary"] } }),
      grant({ id: "gwithdrw1", name: "Old", link: { secret }, revokedAt: "2026-10-02T00:00:00Z", scope: { all: true } }),
      grant({ id: "gexpired1", name: "Late", link: { secret }, expiresAt: "2026-10-02T00:00:00Z", scope: { all: true } }),
    ], { nameSalt: salt() });
    const r = await i.run();
    expect(r.shares).toBe(1);
    const failures = await Promise.all([
      i.reader().openPasscode("Sam", "wrong passcode words here"),
      i.reader().openPasscode("Nobody", "orbit maple quiet river"),
      i.reader().openLink("gshare001", toB64url(randomBytes(32))),
      i.reader().openLink("gwithdrw1", secret),
      i.reader().openLink("gexpired1", secret),
      i.reader().openLink("../vault", secret),
    ].map((p) => p.then(() => undefined, (e) => e)));
    for (const e of failures) {
      expect(e).toBeInstanceOf(SealError);
      expect(e.code).toBe("key");
      expect(e.message).toBe("key");
    }
    expect(await readdir(join(i.site, "_access", r.build, "l"))).toEqual(["gshare001.json"]);
  }, 60_000);

  it("SHR-11: fresh keys every build, and link keyrings accept only hkdf-sha256", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance(notes, [grant({ link: { secret }, scope: { notes: ["n-plan"] } })]);
    const a = await i.run(), b = await i.run();
    expect(a.build).not.toBe(b.build);
    const ka = await readFile(join(i.site, ...linkKeyringPath(a.build, "gshare001").split("/")), "utf8");
    const kb = await readFile(join(i.site, ...linkKeyringPath(b.build, "gshare001").split("/")), "utf8");
    expect(JSON.parse(ka).data).not.toBe(JSON.parse(kb).data);
    expect(Object.keys(JSON.parse(ka)).sort()).toEqual(["data", "iv", "kdf", "salt", "v"]);
    expect(() => parseKeyring(ka, "hkdf-sha256")).not.toThrow();
    expect(() => parseKeyring(ka)).toThrow(SealError);
    // The vault's keyring is never accepted as a link keyring, or the other way round.
    expect(() => parseKeyring(JSON.stringify({ ...JSON.parse(ka), iterations: 1 }), "hkdf-sha256")).toThrow(SealError);
  }, 30_000);

  it("refuses two active audiences with the same name, without quoting it", async () => {
    const i = await instance(notes, [
      grant({ name: "Quinlan", passcode: { value: "orbit maple quiet river" }, scope: { all: true } }),
      grant({ id: "gshare002", name: " QUINLAN ", passcode: { value: "another set of words" }, scope: { all: true } }),
    ]);
    const err = await i.run().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/same name/);
    expect(err.message).not.toMatch(/quinlan/i);
  }, 30_000);

  it("writes no vault keyring for a site with only share grants", async () => {
    const i = await instance(notes, [grant({ link: { secret: toB64url(randomBytes(32)) }, scope: { notes: ["n-plan"] } })]);
    const r = await i.run();
    await expect(readFile(join(i.site, ...vaultPath(r.build).split("/")), "utf8")).rejects.toThrow();
  }, 30_000);

  it("never lets a share grant open every private note: only the owner's grant has scope.all", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance(notes, [grant({ link: { secret }, scope: { all: true, notes: ["n-plan"] } })]);
    await i.run();
    const share = await i.reader().openLink("gshare001", secret);
    expect(share.notes.map((n) => n.path)).toEqual(["Plan.md"]);
  }, 30_000);

  it("refuses two grants with the same ID, which would share one keyring's place", async () => {
    const i = await instance(notes, [
      grant({ link: { secret: toB64url(randomBytes(32)) }, scope: { notes: ["n-plan"] } }),
      grant({ name: "Kim", link: { secret: toB64url(randomBytes(32)) }, scope: { notes: ["n-diary"] } }),
    ]);
    await expect(i.run()).rejects.toThrow(/same ID/);
  });
});

describe("the leak check covers grant secrets (SEC-06)", () => {
  it("fails the deploy when a link secret, a passcode, or a vault key reaches the site, without printing it", async () => {
    const secret = toB64url(randomBytes(32));
    const i = await instance({ "A.md": "a" }, [grant({ link: { secret }, passcode: { value: "orbit maple quiet river" }, scope: { all: true } })], { vault: true });
    await writeFile(join(i.site, "oops.js"), `const s = "${secret}";`);
    const err = await i.run().catch((e) => e);
    expect(err).toBeInstanceOf(LeakError);
    expect(err.message).toContain("oops.js (secret)");
    expect(err.message).not.toContain(secret);
    await writeFile(join(i.site, "oops.js"), "nothing here");
    expect(await leakCheck(i.site, [], ["orbit maple quiet river"])).toEqual([]);
    await writeFile(join(i.site, "invite.txt"), "Your passcode: orbit maple quiet river");
    expect(await leakCheck(i.site, [], ["orbit maple quiet river"])).toEqual([{ file: "invite.txt", kind: "secret" }]);
  }, 30_000);
});

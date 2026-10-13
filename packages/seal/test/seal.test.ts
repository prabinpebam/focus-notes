import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  derivePasscodeBits, fromB64url, ITERATIONS, parseKeyring, passphraseStrength, randomBytes, SealError, SiteReader, toB64url, vaultPath,
} from "../src/index.ts";
import { leakCheck, LeakError, publish, validateAccess } from "../src/publish.ts";

const PASS = "correct horse battery staple";
const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

async function instance(opts: { privateNotes?: Record<string, string>; publicNotes?: Record<string, string>; passphrase?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "fn-seal-"));
  dirs.push(root);
  const write = async (base: string, files: Record<string, string>) => {
    for (const [p, t] of Object.entries(files)) {
      await mkdir(join(base, ...p.split("/").slice(0, -1)), { recursive: true });
      await writeFile(join(base, ...p.split("/")), t);
    }
  };
  await write(join(root, "notes"), opts.publicNotes ?? { "Hello.md": "# Hello world\n\nA public note.\n" });
  if (opts.privateNotes) {
    await write(join(root, "private", "notes"), opts.privateNotes);
    const salt = randomBytes(16);
    const key = await derivePasscodeBits(opts.passphrase ?? PASS, salt);
    await writeFile(join(root, "private", "access.json"), JSON.stringify({
      version: 1, grants: [{ id: "gabcdefgh", name: "You", owner: true, salt: toB64url(salt), passcodeKey: toB64url(key), scope: { all: true }, createdAt: "2026-10-14T00:00:00Z" }],
    }));
  }
  await mkdir(join(root, "site"), { recursive: true });
  await writeFile(join(root, "site", "index.html"), "<!doctype html><title>Focus Notes</title>");
  const reader = () => new SiteReader(async (p) => readFile(join(root, "site", ...p.split("/").map(decodeURIComponent)), "utf8").catch(() => undefined));
  return { root, site: join(root, "site"), reader };
}

describe("the publisher and the reader", () => {
  it("publishes public notes with an index the browser reads", async () => {
    const i = await instance({ publicNotes: { "Hello.md": "# Hello world\n\nHi.\n", "Ideas/Next steps.md": "Plain text.\n" } });
    const r = await publish({ site: i.site, notes: join(i.root, "notes"), owner: "octo" });
    expect(r).toMatchObject({ publicNotes: 2, privateNotes: 0, vault: false });
    const reader = i.reader();
    expect((await reader.manifest())?.vault).toBe(false);
    const list = await reader.publicNotes();
    expect(list.map((n) => [n.path, n.title])).toEqual([["Hello.md", "Hello world"], ["Ideas/Next steps.md", "Next steps"]]);
    expect(await reader.readPublic("Ideas/Next steps.md")).toBe("Plain text.\n");
    await expect(reader.readPublic("../focus-notes.json")).rejects.toThrow();
  });

  it("seals private notes so only the passphrase opens them, read-only, with readable paths inside", async () => {
    const secret = "The launch date is the fourteenth of November, and nobody knows yet.";
    const i = await instance({ privateNotes: { "Plans/Launch plan.md": `# Launch\n\n${secret}\n`, "Diary.md": "Short.\n" } });
    const r = await publish({ site: i.site, notes: join(i.root, "notes"), private: join(i.root, "private"), owner: "octo" });
    expect(r).toMatchObject({ vault: true, privateNotes: 2 });

    // Nothing private is readable on the site: not the text, not the names.
    const all = await readdir(i.site, { recursive: true });
    const bodies = await Promise.all(all.filter((f) => f.endsWith(".json")).map((f) => readFile(join(i.site, f), "utf8")));
    for (const b of bodies) {
      expect(b).not.toContain("launch date");
      expect(b).not.toContain("Launch plan");
      expect(b).not.toContain("Diary");
    }

    const { vault, salt } = await i.reader().unlock(PASS);
    expect(vault.owner).toBe("octo");
    expect(vault.notes.map((n) => [n.path, n.title]).sort()).toEqual([["Diary.md", "Diary"], ["Plans/Launch plan.md", "Launch"]]);
    expect(await vault.read("Plans/Launch plan.md")).toContain(secret);
    expect(salt).toMatch(/^[A-Za-z0-9_-]{22}$/);
  }, 30_000);

  it("refuses a wrong passphrase with one generic error", async () => {
    const i = await instance({ privateNotes: { "A.md": "a" } });
    await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const err = await i.reader().unlock("not the passphrase at all").catch((e) => e);
    expect(err).toBeInstanceOf(SealError);
    expect(err.code).toBe("key");
  }, 30_000);

  it("opens later builds with a remembered key, until the passphrase changes", async () => {
    const i = await instance({ privateNotes: { "A.md": "first" } });
    await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const { key, salt } = await i.reader().unlock(PASS);
    await writeFile(join(i.root, "private", "notes", "A.md"), "second");
    await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const v = await i.reader().unlockWithKey(key, salt);
    expect(await v.read("A.md")).toBe("second");

    // A new passphrase means a new salt: the remembered key is refused before any decryption.
    const fresh = randomBytes(16);
    const access = JSON.parse(await readFile(join(i.root, "private", "access.json"), "utf8"));
    access.grants[0].salt = toB64url(fresh);
    access.grants[0].passcodeKey = toB64url(await derivePasscodeBits("another long passphrase here", fresh));
    await writeFile(join(i.root, "private", "access.json"), JSON.stringify(access));
    await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const err = await i.reader().unlockWithKey(key, salt).catch((e) => e);
    expect(err.code).toBe("key");
  }, 60_000);

  it("uses fresh keys and a fresh build every deploy", async () => {
    const i = await instance({ privateNotes: { "A.md": "a" } });
    const a = await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const b = await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    expect(a.build).not.toBe(b.build);
    const ka = await readFile(join(i.site, ...vaultPath(a.build).split("/")), "utf8");
    const kb = await readFile(join(i.site, ...vaultPath(b.build).split("/")), "utf8");
    expect(JSON.parse(ka).data).not.toBe(JSON.parse(kb).data);
  }, 30_000);

  it("accepts keyrings only with the exact parameters, so the format can't be downgraded", () => {
    const good = { v: 1, kdf: "pbkdf2-sha256", iterations: ITERATIONS, salt: toB64url(randomBytes(16)), iv: toB64url(randomBytes(12)), data: "AAAA" };
    expect(() => parseKeyring(JSON.stringify(good))).not.toThrow();
    for (const bad of [
      { ...good, iterations: 1000 }, { ...good, kdf: "pbkdf2-sha1" }, { ...good, v: 2 }, { ...good, salt: toB64url(randomBytes(8)) },
      { ...good, iv: toB64url(randomBytes(16)) }, { ...good, extra: 1 }, { ...good, data: "not base64!" },
    ]) expect(() => parseKeyring(JSON.stringify(bad))).toThrow(SealError);
    expect(() => parseKeyring("x".repeat(70_000))).toThrow(SealError);
  });

  it("fails a tampered or swapped sealed file", async () => {
    const i = await instance({ privateNotes: { "A.md": "alpha", "B.md": "bravo" } });
    const r = await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" });
    const sealed = join(i.site, "_sealed", r.build);
    const files = (await readdir(sealed)).sort();
    // Swap two files: the additional data binds each to its own ID, so both fail.
    const [x, y] = [files[0]!, files[1]!];
    const [tx, ty] = [await readFile(join(sealed, x), "utf8"), await readFile(join(sealed, y), "utf8")];
    await writeFile(join(sealed, x), ty);
    await writeFile(join(sealed, y), tx);
    const outcome = await i.reader().unlock(PASS).then(({ vault }) => Promise.all(vault.notes.map((n) => vault.read(n.path)))).catch((e) => e);
    expect(outcome).toBeInstanceOf(SealError);
  }, 30_000);
});

describe("hardening against a forged or careless site", () => {
  it("accepts the public index only at its fixed place, and caps sizes", async () => {
    const { parseSiteManifest } = await import("../src/format.ts");
    const ok = { format: 1, build: "abcdefghijklmnop", notes: "notes/index.json", vault: false };
    expect(() => parseSiteManifest(JSON.stringify(ok))).not.toThrow();
    expect(() => parseSiteManifest(JSON.stringify({ ...ok, notes: "https://api.github.com/x" }))).toThrow(SealError);
    expect(() => parseSiteManifest(" ".repeat(70_000))).toThrow(SealError);
  });
  it("never follows a symlink into the private notes", async () => {
    const { symlink } = await import("node:fs/promises");
    const i = await instance({ privateNotes: { "Secret.md": "tiny" } });
    try {
      await symlink(join(i.root, "private", "notes", "Secret.md"), join(i.root, "notes", "Linked.md"));
    } catch {
      return; // Creating symlinks needs extra rights on some Windows machines.
    }
    const r = await publish({ site: i.site, notes: join(i.root, "notes"), private: join(i.root, "private"), owner: "octo" });
    expect(r.publicNotes).toBe(1);
    await expect(readFile(join(i.site, "notes", "Linked.md"), "utf8")).rejects.toThrow();
  }, 30_000);
  it("doesn't quote private files in its errors", async () => {
    const i = await instance({ privateNotes: { "A.md": "a" } });
    await writeFile(join(i.root, "private", "access.json"), '{"version":1,"grants":[{"passcodeKey":SECRETSECRETSECRET');
    const err = await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" }).catch((e) => e);
    expect(err.message).not.toContain("SECRET");
  });
});

describe("the leak check (SEC-06)", () => {
  it("fails the deploy when private text or a private path reaches the site, without printing it", async () => {
    const secret = "This sentence must never be published anywhere.";
    const i = await instance({ privateNotes: { "Private/Secret plan.md": secret } });
    await writeFile(join(i.site, "oops.html"), `<p>${secret}</p>`);
    const err = await publish({ site: i.site, private: join(i.root, "private"), owner: "octo" }).catch((e) => e);
    expect(err).toBeInstanceOf(LeakError);
    expect(err.message).toContain("oops.html (text)");
    expect(err.message).not.toContain(secret);
    expect(await leakCheck(i.site, [{ path: "Private/Secret plan.md", text: "" }])).toEqual([]);
    await writeFile(join(i.site, "list.json"), JSON.stringify(["Private/Secret plan.md"]));
    expect(await leakCheck(i.site, [{ path: "Private/Secret plan.md", text: "" }])).toEqual([{ file: "list.json", kind: "path" }]);
  }, 30_000);

  it("fails the deploy when a public note copies private text", async () => {
    const line = "A paragraph that was written privately and then copied.";
    const i = await instance({ privateNotes: { "Mine.md": line }, publicNotes: { "Shared.md": `# Shared\n\n${line}\n` } });
    await expect(publish({ site: i.site, notes: join(i.root, "notes"), private: join(i.root, "private"), owner: "octo" })).rejects.toBeInstanceOf(LeakError);
  }, 30_000);
});

describe("access.json and passphrases", () => {
  it("validates grants and allows one owner grant", () => {
    const g = { id: "gabcdefgh", name: "You", owner: true, salt: toB64url(randomBytes(16)), scope: { all: true }, createdAt: "2026-10-14T00:00:00Z" };
    expect(() => validateAccess({ version: 1, grants: [g] })).not.toThrow();
    expect(() => validateAccess({ version: 1, grants: [g, { ...g, id: "gbcdefghi" }] })).toThrow(/one owner/);
    expect(() => validateAccess({ version: 1, grants: [{ ...g, salt: toB64url(randomBytes(4)) }] })).toThrow(/salt/);
    expect(() => validateAccess({ version: 2, grants: [] })).toThrow();
  });
  it("asks for a passphrase that resists offline guessing", () => {
    expect(passphraseStrength("password").ok).toBe(false);
    expect(passphraseStrength("aaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(passphraseStrength("correct horse battery staple").ok).toBe(true);
    expect(passphraseStrength("Tr0ub4dor&3xy").ok).toBe(true);
  });
  it("derives the same key from equivalent Unicode forms", async () => {
    const salt = randomBytes(16);
    const a = await derivePasscodeBits("caf\u00e9 au lait sur la table", salt);
    const b = await derivePasscodeBits("  cafe\u0301 au lait sur la table ", salt);
    expect(toB64url(a)).toBe(toB64url(b));
    expect(fromB64url(toB64url(a))).toEqual(a);
  });
});
